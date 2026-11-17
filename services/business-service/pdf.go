package main

import (
	"bytes"
	"fmt"
	"strings"
	"time"
	_ "time/tzdata" // fuso horário embutido (Windows não traz banco de fusos)

	"github.com/go-pdf/fpdf"
)

func localTZ() *time.Location {
	if l, err := time.LoadLocation("America/Sao_Paulo"); err == nil {
		return l
	}
	return time.UTC
}

func nz(s *string) string {
	if s == nil || strings.TrimSpace(*s) == "" {
		return "-"
	}
	return strings.TrimSpace(*s)
}

func ni(v *int, suf string) string {
	if v == nil {
		return "-"
	}
	return fmt.Sprintf("%d%s", *v, suf)
}

var triagemCor = map[string][3]int{
	"VERMELHO": {200, 30, 30}, "LARANJA": {234, 108, 10}, "AMARELO": {240, 190, 10},
	"VERDE": {30, 150, 70}, "AZUL": {40, 100, 200}, "PRETO": {30, 30, 30},
}

func idade(nasc string, ref time.Time) string {
	t, err := time.Parse("2006-01-02", nasc)
	if err != nil {
		return ""
	}
	anos := ref.Year() - t.Year()
	if ref.Month() < t.Month() || (ref.Month() == t.Month() && ref.Day() < t.Day()) {
		anos--
	}
	return fmt.Sprintf("%d anos", anos)
}

func glasgowClasse(total *int) string {
	switch {
	case total == nil:
		return "-"
	case *total >= 13:
		return "Leve"
	case *total >= 9:
		return "Moderado"
	default:
		return "Grave"
	}
}

func sexoTxt(s *string) string {
	if s == nil {
		return "-"
	}
	switch *s {
	case "M":
		return "Masculino"
	case "F":
		return "Feminino"
	case "O":
		return "Outro"
	}
	return "-"
}

// gerarFichaPDF monta a Ficha de Atendimento (A4) com fontes padrão do PDF (sem arquivos externos).
func gerarFichaPDF(a *atendimentoDetalhe, geradoPor string, agora time.Time) ([]byte, error) {
	loc := localTZ()
	fmtDT := func(t time.Time) string { return t.In(loc).Format("02/01/2006 15:04") }
	p := a.Pessoa
	pr := a.Prontuario
	if pr == nil {
		pr = &prontuarioInfo{}
	}
	shortID := strings.ToUpper(strings.SplitN(a.ID, "-", 2)[0])

	pdf := fpdf.New("P", "mm", "A4", "")
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	pdf.SetMargins(15, 15, 15)
	pdf.SetAutoPageBreak(true, 20)
	pdf.SetTitle("Ficha de Atendimento - "+p.Nome, true)
	pdf.SetAuthor("MedicalField", true)
	pdf.SetCreator("MedicalField business-service", true)
	pdf.AliasNbPages("")
	const left, width = 15.0, 180.0

	pdf.SetHeaderFunc(func() {
		if pdf.PageNo() == 1 {
			pdf.SetFillColor(15, 76, 129)
			pdf.Rect(0, 0, 210, 26, "F")
			pdf.SetTextColor(255, 255, 255)
			pdf.SetFont("Helvetica", "B", 21)
			pdf.SetXY(left, 7)
			pdf.CellFormat(100, 9, "MEDICALFIELD", "", 0, "L", false, 0, "")
			pdf.SetFont("Helvetica", "", 10.5)
			pdf.SetXY(left, 17)
			pdf.CellFormat(100, 5, tr("Ficha de Atendimento Pré-Hospitalar"), "", 0, "L", false, 0, "")
			pdf.SetFont("Helvetica", "B", 9)
			pdf.SetXY(110, 8)
			pdf.CellFormat(85, 5, tr("FICHA Nº ")+shortID, "", 0, "R", false, 0, "")
			pdf.SetFont("Helvetica", "", 8.5)
			pdf.SetXY(110, 14)
			pdf.CellFormat(85, 5, "Emitida em "+fmtDT(agora), "", 0, "R", false, 0, "")
			pdf.SetY(31)
		} else {
			pdf.SetFont("Helvetica", "", 8)
			pdf.SetTextColor(110, 110, 110)
			pdf.SetXY(left, 8)
			pdf.CellFormat(width, 4, tr("MedicalField - Ficha de Atendimento Nº "+shortID+" - "+p.Nome), "B", 0, "L", false, 0, "")
			pdf.SetY(18)
		}
		pdf.SetTextColor(0, 0, 0)
	})
	pdf.SetFooterFunc(func() {
		pdf.SetY(-16)
		pdf.SetFont("Helvetica", "", 7.5)
		pdf.SetTextColor(120, 120, 120)
		pdf.CellFormat(0, 4, tr("Documento gerado por "+geradoPor+" em "+fmtDT(agora)+" - Projeto acadêmico, dados fictícios."), "", 1, "C", false, 0, "")
		pdf.CellFormat(0, 4, tr(fmt.Sprintf("Página %d de {nb}", pdf.PageNo())), "", 0, "C", false, 0, "")
	})
	pdf.AddPage()

	ensure := func(h float64) {
		if pdf.GetY()+h > 297-20 {
			pdf.AddPage()
		}
	}
	section := func(title string) {
		ensure(16)
		pdf.Ln(2.5)
		pdf.SetFillColor(15, 76, 129)
		pdf.SetTextColor(255, 255, 255)
		pdf.SetFont("Helvetica", "B", 9.5)
		pdf.SetX(left)
		pdf.CellFormat(width, 6.5, tr("  "+strings.ToUpper(title)), "", 1, "L", true, 0, "")
		pdf.SetTextColor(0, 0, 0)
		pdf.Ln(1.5)
	}
	fit := func(s string, w float64) string { // s já em cp1252 (1 byte por caractere)
		for len(s) > 1 && pdf.GetStringWidth(s) > w-1.5 {
			s = s[:len(s)-1]
			if pdf.GetStringWidth(s+"...") <= w-1.5 {
				return s + "..."
			}
		}
		return s
	}
	field := func(x, y, w float64, label, value string) {
		pdf.SetXY(x, y)
		pdf.SetFont("Helvetica", "", 7)
		pdf.SetTextColor(110, 110, 110)
		pdf.CellFormat(w, 3.5, tr(label), "", 0, "L", false, 0, "")
		pdf.SetXY(x, y+3.6)
		pdf.SetFont("Helvetica", "B", 10)
		pdf.SetTextColor(20, 20, 20)
		pdf.CellFormat(w, 5, fit(tr(value), w), "", 0, "L", false, 0, "")
	}
	row := func(widths []float64, labels, values []string) {
		ensure(12)
		y := pdf.GetY()
		x := left
		for i, w := range widths {
			field(x, y, w, labels[i], values[i])
			x += w
		}
		pdf.SetDrawColor(225, 228, 232)
		pdf.Line(left, y+10, left+width, y+10)
		pdf.SetY(y + 11)
	}
	block := func(label, value string) {
		txt := tr(value)
		pdf.SetFont("Helvetica", "", 10)
		lines := pdf.SplitLines([]byte(txt), width)
		ensure(float64(len(lines))*4.8 + 9)
		pdf.SetX(left)
		pdf.SetFont("Helvetica", "", 7)
		pdf.SetTextColor(110, 110, 110)
		pdf.CellFormat(width, 3.5, tr(label), "", 1, "L", false, 0, "")
		pdf.SetFont("Helvetica", "", 10)
		pdf.SetTextColor(20, 20, 20)
		pdf.SetX(left)
		pdf.MultiCell(width, 4.8, txt, "", "L", false)
		pdf.Ln(1.5)
	}

	// 1. Paciente
	nasc := nz(p.DataNascimento)
	if p.DataNascimento != nil {
		if t, err := time.Parse("2006-01-02", *p.DataNascimento); err == nil {
			nasc = t.Format("02/01/2006") + " (" + idade(*p.DataNascimento, agora) + ")"
		}
	}
	section("Identificação do paciente")
	row([]float64{115, 65}, []string{"Nome", "CPF"}, []string{p.Nome, nz(p.CPF)})
	row([]float64{65, 30, 45, 40}, []string{"Nascimento", "Sexo", "Telefone", "Tipo sanguíneo"},
		[]string{nasc, sexoTxt(p.Sexo), nz(p.Telefone), nz(pr.TipoSanguineo)})
	row([]float64{width}, []string{"Contato de emergência"}, []string{nz(p.ContatoEmergencia)})
	block("Alergias", nz(pr.Alergias))
	var cond []string
	if v := nz(pr.CondicoesCronicas); v != "-" {
		cond = append(cond, "Condições crônicas: "+v)
	}
	if v := nz(pr.MedicamentosUsoContinuo); v != "-" {
		cond = append(cond, "Uso contínuo: "+v)
	}
	condTxt := "-"
	if len(cond) > 0 {
		condTxt = strings.Join(cond, "     |     ")
	}
	block("Condições crônicas e medicamentos de uso contínuo", condTxt)

	// 2. Atendimento
	prof := nz(a.ProfissionalNome)
	section("Atendimento")
	row([]float64{55, 125}, []string{"Data e hora do atendimento", "Local da ocorrência"}, []string{fmtDT(a.DataHora), nz(a.LocalOcorrencia)})
	row([]float64{115, 65}, []string{"Profissional responsável", "Identificação profissional"}, []string{prof, nz(a.ProfissionalIdentificacao)})
	block("Queixa principal", a.QueixaPrincipal)

	// 3. Sinais vitais
	section("Sinais vitais")
	pa := "-"
	if a.PaSistolica != nil && a.PaDiastolica != nil {
		pa = fmt.Sprintf("%d/%d", *a.PaSistolica, *a.PaDiastolica)
	}
	temp := "-"
	if a.Temperatura != nil {
		temp = strings.Replace(fmt.Sprintf("%.1f", *a.Temperatura), ".", ",", 1)
	}
	row([]float64{30, 30, 30, 30, 30, 30},
		[]string{"PA (mmHg)", "FC (bpm)", "FR (irpm)", "SpO2 (%)", "Temp. (°C)", "Glicemia (mg/dL)"},
		[]string{pa, ni(a.FreqCardiaca, ""), ni(a.FreqRespiratoria, ""), ni(a.Spo2, ""), temp, ni(a.Glicemia, "")})

	// 4. Glasgow e triagem
	section("Avaliação neurológica e triagem")
	ensure(24)
	y := pdf.GetY()
	field(left, y, 30, "Glasgow - ocular (1-4)", ni(a.GlasgowOcular, ""))
	field(left+30, y, 30, "Glasgow - verbal (1-5)", ni(a.GlasgowVerbal, ""))
	field(left+60, y, 30, "Glasgow - motor (1-6)", ni(a.GlasgowMotor, ""))
	total := "-"
	if a.GlasgowTotal != nil {
		total = fmt.Sprintf("%d/15 (%s)", *a.GlasgowTotal, glasgowClasse(a.GlasgowTotal))
	}
	field(left+90, y, 40, "Glasgow - total", total)
	badge := func(x float64, titulo string, valor *string) {
		v := "-"
		cor := [3]int{190, 190, 190}
		if valor != nil && *valor != "" {
			v = *valor
			if c, ok := triagemCor[v]; ok {
				cor = c
			}
		}
		pdf.SetFillColor(cor[0], cor[1], cor[2])
		pdf.RoundedRect(x, y, 23, 11, 1.5, "1234", "F")
		if v == "AMARELO" {
			pdf.SetTextColor(40, 30, 0)
		} else {
			pdf.SetTextColor(255, 255, 255)
		}
		pdf.SetFont("Helvetica", "", 6.5)
		pdf.SetXY(x, y+1.2)
		pdf.CellFormat(23, 3, tr(titulo), "", 0, "C", false, 0, "")
		pdf.SetFont("Helvetica", "B", 8.5)
		pdf.SetXY(x, y+5)
		pdf.CellFormat(23, 4.5, tr(v), "", 0, "C", false, 0, "")
	}
	badge(left+133, "MANCHESTER", a.TriagemManchester)
	badge(left+158, "START", a.TriagemStart)
	pdf.SetTextColor(0, 0, 0)
	pdf.SetY(y + 15)

	// 5. Descrição
	section("Descrição do atendimento")
	block("Descrição / evolução", nz(a.Descricao))
	block("Conduta", nz(a.Conduta))
	block("Encaminhamento", nz(a.Encaminhamento))

	// 6. Medicamentos
	section("Medicamentos administrados")
	if len(a.Medicamentos) == 0 {
		pdf.SetFont("Helvetica", "I", 9.5)
		pdf.SetTextColor(90, 90, 90)
		pdf.SetX(left)
		pdf.CellFormat(width, 6, tr("Nenhum medicamento administrado neste atendimento."), "", 1, "L", false, 0, "")
	} else {
		cols := []float64{70, 35, 25, 50}
		pdf.SetFillColor(235, 238, 242)
		pdf.SetTextColor(40, 40, 40)
		pdf.SetFont("Helvetica", "B", 8.5)
		pdf.SetX(left)
		for i, h := range []string{"Medicamento", "Dose", "Via", "Horário"} {
			pdf.CellFormat(cols[i], 6.5, tr("  "+h), "B", 0, "L", true, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetFont("Helvetica", "", 9.5)
		for _, m := range a.Medicamentos {
			ensure(7)
			hor := "-"
			if m.Horario != nil {
				hor = fmtDT(*m.Horario)
			}
			pdf.SetX(left)
			for i, v := range []string{m.Nome, m.Dose, nz(m.Via), hor} {
				pdf.CellFormat(cols[i], 6.5, fit(tr("  "+v), cols[i]), "B", 0, "L", false, 0, "")
			}
			pdf.Ln(-1)
		}
	}

	// 7. Assinatura
	ensure(24)
	pdf.Ln(8)
	ys := pdf.GetY()
	pdf.SetDrawColor(60, 60, 60)
	pdf.Line(left, ys, left+85, ys)
	pdf.SetXY(left, ys+1.5)
	pdf.SetFont("Helvetica", "B", 9.5)
	pdf.SetTextColor(20, 20, 20)
	pdf.CellFormat(85, 5, fit(tr(prof), 85), "", 1, "L", false, 0, "")
	pdf.SetX(left)
	pdf.SetFont("Helvetica", "", 8.5)
	pdf.SetTextColor(90, 90, 90)
	pdf.CellFormat(85, 4.5, tr(nz(a.ProfissionalIdentificacao)+" - Profissional responsável"), "", 0, "L", false, 0, "")
	pdf.SetXY(110, ys-1)
	pdf.SetFont("Helvetica", "", 8)
	origem := "ONLINE"
	if a.Origem == "OFFLINE" {
		origem = "OFFLINE (registrado sem conexão e sincronizado depois)"
	}
	pdf.MultiCell(85, 4, tr("Origem do registro: "+origem), "", "R", false)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// nome de arquivo seguro (ASCII)
func slugArquivo(s string) string {
	rep := strings.NewReplacer("á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a", "é", "e", "ê", "e", "è", "e", "í", "i", "ì", "i",
		"ó", "o", "ô", "o", "õ", "o", "ò", "o", "ú", "u", "ù", "u", "ü", "u", "ç", "c", "ñ", "n")
	s = rep.Replace(strings.ToLower(s))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
		} else if !prevDash && b.Len() > 0 {
			b.WriteByte('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func nomeArquivoFicha(a *atendimentoDetalhe) string {
	return fmt.Sprintf("ficha-atendimento-%s-%s.pdf", slugArquivo(a.Pessoa.Nome), a.DataHora.In(localTZ()).Format("20060102-1504"))
}
