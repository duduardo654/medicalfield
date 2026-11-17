package main

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"strings"
	"testing"
	"time"
)

func sp(s string) *string { return &s }
func ip(i int) *int       { return &i }

func amostra() *atendimentoDetalhe {
	f := 36.6
	h := time.Date(2026, 11, 14, 15, 40, 0, 0, time.UTC)
	return &atendimentoDetalhe{
		ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", DataHora: time.Date(2026, 11, 14, 15, 30, 0, 0, time.UTC),
		ProfissionalNome: sp("Dra. Helena Duarte"), ProfissionalIdentificacao: sp("CRM-RS-12345"),
		LocalOcorrencia: sp("BR-116 km 310"), QueixaPrincipal: "Dor torácica", Descricao: sp(strings.Repeat("Dor precordial com sudorese. ", 40)),
		PaSistolica: ip(150), PaDiastolica: ip(95), FreqCardiaca: ip(102), FreqRespiratoria: ip(20), Spo2: ip(96), Temperatura: &f, Glicemia: ip(110),
		GlasgowOcular: ip(4), GlasgowVerbal: ip(5), GlasgowMotor: ip(6), GlasgowTotal: ip(15),
		TriagemManchester: sp("LARANJA"), TriagemStart: sp("AMARELO"), Conduta: sp("AAS 300 mg VO; monitorização."), Encaminhamento: sp("Hospital de Pronto Socorro"),
		Origem:       "OFFLINE",
		Medicamentos: []medAdministrado{{Nome: "AAS", Dose: "300 mg", Via: sp("VO"), Horario: &h}, {Nome: "Ácido acetilsalicílico (nome longo para testar corte)", Dose: "300 mg"}},
		Pessoa:       &pessoaInfo{ID: "1", Nome: "João da Silva Conceição", CPF: sp("900.000.000-01"), DataNascimento: sp("1980-03-15"), Sexo: sp("M"), Email: sp("joao@exemplo.test")},
		Prontuario:   &prontuarioInfo{TipoSanguineo: sp("O+"), Alergias: sp("Dipirona"), CondicoesCronicas: sp("Hipertensão")},
	}
}

func TestPDFValido(t *testing.T) {
	pdf, err := gerarFichaPDF(amostra(), "Dra. Helena Duarte", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(pdf, []byte("%PDF-")) || !bytes.Contains(pdf[len(pdf)-32:], []byte("%%EOF")) {
		t.Fatal("não parece um PDF válido")
	}
	if len(pdf) < 3000 {
		t.Fatalf("PDF pequeno demais: %d bytes", len(pdf))
	}
}

func TestPDFCamposVaziosENulos(t *testing.T) { // atendimento mínimo não pode causar panic
	a := &atendimentoDetalhe{ID: "x-y", DataHora: time.Now(), QueixaPrincipal: "Teste", Origem: "ONLINE", Pessoa: &pessoaInfo{Nome: "Só Nome"}}
	if _, err := gerarFichaPDF(a, "Teste", time.Now()); err != nil {
		t.Fatal(err)
	}
}

func TestNomeArquivo(t *testing.T) {
	got := nomeArquivoFicha(amostra())
	if got != "ficha-atendimento-joao-da-silva-conceicao-20260414-1230.pdf" && !strings.HasPrefix(got, "ficha-atendimento-joao-da-silva-conceicao-20261114-") {
		t.Fatalf("nome inesperado: %s", got)
	}
}

func TestValidarEmail(t *testing.T) {
	for _, ok := range []string{"a@b.com", "familiar@exemplo.test", " x.y@dominio.com.br "} {
		if _, v := validarEmail(ok); !v {
			t.Errorf("deveria aceitar %q", ok)
		}
	}
	for _, bad := range []string{"", "sem-arroba", "a@b", "Nome <a@b.com>", "a b@c.com"} {
		if _, v := validarEmail(bad); v {
			t.Errorf("deveria rejeitar %q", bad)
		}
	}
}

// servidor SMTP mínimo para testar o envio ponta a ponta sem Mailpit
func fakeSMTP(t *testing.T) (port string, got chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	got = make(chan string, 1)
	go func() {
		defer ln.Close()
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		rw := bufio.NewReadWriter(bufio.NewReader(c), bufio.NewWriter(c))
		say := func(s string) { rw.WriteString(s + "\r\n"); rw.Flush() }
		say("220 fake ESMTP")
		var data strings.Builder
		inData := false
		for {
			line, err := rw.ReadString('\n')
			if err != nil {
				return
			}
			if inData {
				if line == ".\r\n" {
					inData = false
					got <- data.String()
					say("250 OK queued")
					continue
				}
				data.WriteString(line)
				continue
			}
			switch cmd := strings.ToUpper(strings.TrimSpace(line)); {
			case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
				say("250 fake")
			case strings.HasPrefix(cmd, "DATA"):
				inData = true
				say("354 go ahead")
			case strings.HasPrefix(cmd, "QUIT"):
				say("221 bye")
				return
			default:
				say("250 OK")
			}
		}
	}()
	_, p, _ := net.SplitHostPort(ln.Addr().String())
	return p, got
}

func TestEnvioEmailComAnexoPDF(t *testing.T) {
	porta, got := fakeSMTP(t)
	pdf, _ := gerarFichaPDF(amostra(), "Teste", time.Now())
	cfg := &Config{SMTPHost: "127.0.0.1", SMTPPort: porta, SMTPFrom: "fichas@medicalfield.test"}
	if err := sendMail(cfg, "familiar@exemplo.test", "Ficha de Atendimento - João", "Olá, segue a ficha.\r\n", "ficha.pdf", pdf); err != nil {
		t.Fatal(err)
	}
	var raw string
	select {
	case raw = <-got:
	case <-time.After(3 * time.Second):
		t.Fatal("servidor não recebeu a mensagem")
	}
	msg, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	dec := new(mime.WordDecoder)
	if subj, _ := dec.DecodeHeader(msg.Header.Get("Subject")); subj != "Ficha de Atendimento - João" {
		t.Errorf("assunto: %q", subj)
	}
	mt, params, _ := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	if mt != "multipart/mixed" {
		t.Fatalf("content-type: %s", mt)
	}
	mr := multipart.NewReader(msg.Body, params["boundary"])
	achouTexto, achouPDF := false, false
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		switch ct := part.Header.Get("Content-Type"); {
		case strings.HasPrefix(ct, "text/plain"):
			b, _ := io.ReadAll(quotedprintable.NewReader(part))
			achouTexto = strings.Contains(string(b), "segue a ficha")
		case strings.HasPrefix(ct, "application/pdf"):
			if !strings.Contains(part.Header.Get("Content-Disposition"), `attachment; filename="ficha.pdf"`) {
				t.Errorf("disposition: %s", part.Header.Get("Content-Disposition"))
			}
			b, _ := io.ReadAll(base64.NewDecoder(base64.StdEncoding, part))
			achouPDF = bytes.Equal(b, pdf)
		}
	}
	if !achouTexto || !achouPDF {
		t.Fatalf("texto=%v pdf-idêntico=%v", achouTexto, achouPDF)
	}
}

func TestSMTPIndisponivel(t *testing.T) {
	cfg := &Config{SMTPHost: "127.0.0.1", SMTPPort: "1", SMTPFrom: "a@b.com"}
	err := sendMail(cfg, "x@y.com", "s", "b", "f.pdf", []byte("%PDF"))
	if err == nil || !strings.Contains(err.Error(), "inacessível") {
		t.Fatalf("esperava erro claro, veio: %v", err)
	}
	fmt.Println("mensagem de erro:", err)
}
