package main

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

// GET /ficha/{atendimentoId}/pdf[?inline=1] - gera e devolve a Ficha de Atendimento em PDF.
func (s *Server) fichaPDF(w http.ResponseWriter, r *http.Request) error {
	id, aerr := parseUUID(r.PathValue("atendimentoId"), "atendimentoId")
	if aerr != nil {
		return aerr
	}
	st := stateOf(r)
	a, err := s.fetchAtendimento(r.Context(), st.token, id)
	if err != nil {
		return err
	}
	pdf, err := gerarFichaPDF(a, st.user.Nome, time.Now())
	if err != nil {
		return err
	}
	disp := "attachment"
	if r.URL.Query().Get("inline") == "1" {
		disp = "inline"
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", disp+`; filename="`+nomeArquivoFicha(a)+`"`)
	w.Header().Set("Content-Length", itoa(len(pdf)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
	return nil
}

type emailRequest struct {
	Destinatario string `json:"destinatario"`
	Mensagem     string `json:"mensagem"`
}

// POST /ficha/{atendimentoId}/email  {"destinatario":"familiar@exemplo.com","mensagem":"opcional"}
// Se "destinatario" for omitido, usa o e-mail cadastrado na pessoa. Envia o PDF como anexo.
func (s *Server) fichaEmail(w http.ResponseWriter, r *http.Request) error {
	id, aerr := parseUUID(r.PathValue("atendimentoId"), "atendimentoId")
	if aerr != nil {
		return aerr
	}
	var req emailRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil && err != io.EOF {
		return newErr(400, "JSON_INVALIDO", "O corpo da requisição não é um JSON válido.")
	}
	st := stateOf(r)
	a, err := s.fetchAtendimento(r.Context(), st.token, id)
	if err != nil {
		return err
	}
	destino := strings.TrimSpace(req.Destinatario)
	if destino == "" && a.Pessoa.Email != nil {
		destino = *a.Pessoa.Email
	}
	if destino == "" {
		return newErr(422, "DESTINATARIO_AUSENTE", "Informe o destinatário: a pessoa não possui e-mail cadastrado.")
	}
	destino, ok := validarEmail(destino)
	if !ok {
		return newErr(422, "EMAIL_INVALIDO", "O endereço de e-mail informado é inválido.")
	}
	pdf, err := gerarFichaPDF(a, st.user.Nome, time.Now())
	if err != nil {
		return err
	}
	arquivo := nomeArquivoFicha(a)
	assunto := "Ficha de Atendimento - " + a.Pessoa.Nome + " - " + a.DataHora.In(localTZ()).Format("02/01/2006")
	var corpo strings.Builder
	corpo.WriteString("Olá,\r\n\r\nSegue em anexo a Ficha de Atendimento de " + a.Pessoa.Nome +
		", referente ao atendimento realizado em " + a.DataHora.In(localTZ()).Format("02/01/2006 às 15:04") + ".\r\n")
	corpo.WriteString("Profissional responsável: " + nz(a.ProfissionalNome) + " (" + nz(a.ProfissionalIdentificacao) + ")\r\n")
	if m := strings.TrimSpace(req.Mensagem); m != "" {
		corpo.WriteString("\r\nMensagem do profissional:\r\n" + m + "\r\n")
	}
	corpo.WriteString("\r\n--\r\nMensagem automática do MedicalField (projeto acadêmico, dados fictícios).\r\n")

	sendErr := sendMail(s.cfg, destino, assunto, corpo.String(), arquivo, pdf)
	s.registrarEmail(r, id, destino, st.user.ID, sendErr)
	if sendErr != nil {
		return &apiError{Status: 502, Codigo: "EMAIL_FALHOU", Mensagem: "Não foi possível enviar o e-mail: " + sendErr.Error()}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enviado": true, "destinatario": destino, "assunto": assunto, "anexo": arquivo,
		"tamanho_bytes": len(pdf), "enviado_em": time.Now().UTC(),
	})
	return nil
}

func (s *Server) registrarEmail(r *http.Request, atendimentoID, destino, profissionalID string, sendErr error) {
	var msg *string
	if sendErr != nil {
		m := sendErr.Error()
		msg = &m
	}
	_, _ = s.db.ExecContext(r.Context(),
		`INSERT INTO business.email_enviado (atendimento_id, destinatario, enviado_por, sucesso, erro) VALUES ($1,$2,$3,$4,$5)`,
		atendimentoID, destino, profissionalID, sendErr == nil, msg)
}

// GET /ficha/{atendimentoId}/emails - histórico de envios da ficha (auditoria).
func (s *Server) fichaEmails(w http.ResponseWriter, r *http.Request) error {
	id, aerr := parseUUID(r.PathValue("atendimentoId"), "atendimentoId")
	if aerr != nil {
		return aerr
	}
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, destinatario, enviado_por::text, sucesso, erro, enviado_em FROM business.email_enviado
		  WHERE atendimento_id = $1 ORDER BY id DESC`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	type item struct {
		ID           int64     `json:"id"`
		Destinatario string    `json:"destinatario"`
		EnviadoPor   string    `json:"enviado_por"`
		Sucesso      bool      `json:"sucesso"`
		Erro         *string   `json:"erro"`
		EnviadoEm    time.Time `json:"enviado_em"`
	}
	out := []item{}
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.ID, &it.Destinatario, &it.EnviadoPor, &it.Sucesso, &it.Erro, &it.EnviadoEm); err != nil {
			return err
		}
		out = append(out, it)
	}
	writeJSON(w, http.StatusOK, out)
	return rows.Err()
}
