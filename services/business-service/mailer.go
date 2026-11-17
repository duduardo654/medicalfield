package main

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// buildMessage monta um e-mail MIME multipart/mixed: texto UTF-8 + anexo PDF em base64.
func buildMessage(from, to, subject, body, filename string, pdf []byte) []byte {
	boundary := "mf-" + randHex(12)
	var b bytes.Buffer
	h := func(k, v string) { b.WriteString(k + ": " + v + "\r\n") }
	h("From", (&mail.Address{Name: "MedicalField", Address: from}).String())
	h("To", to)
	h("Subject", mime.QEncoding.Encode("utf-8", subject))
	h("Date", time.Now().Format(time.RFC1123Z))
	h("Message-ID", "<"+randHex(16)+"@medicalfield.local>")
	h("MIME-Version", "1.0")
	h("Content-Type", `multipart/mixed; boundary="`+boundary+`"`)
	b.WriteString("\r\n")

	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n")
	qp := quotedprintable.NewWriter(&b)
	_, _ = qp.Write([]byte(body))
	_ = qp.Close()
	b.WriteString("\r\n")

	b.WriteString("--" + boundary + "\r\n")
	fmt.Fprintf(&b, "Content-Type: application/pdf; name=%q\r\n", filename)
	b.WriteString("Content-Transfer-Encoding: base64\r\n")
	fmt.Fprintf(&b, "Content-Disposition: attachment; filename=%q\r\n\r\n", filename)
	enc := base64.StdEncoding.EncodeToString(pdf)
	for len(enc) > 76 {
		b.WriteString(enc[:76] + "\r\n")
		enc = enc[76:]
	}
	b.WriteString(enc + "\r\n")
	b.WriteString("--" + boundary + "--\r\n")
	return b.Bytes()
}

// sendMail envia via SMTP configurado (por exemplo, Gmail). STARTTLS e autenticação só se o servidor
// oferecer e as credenciais (SMTP_USER/SMTP_PASS, vindas do ambiente) existirem.
func sendMail(cfg *Config, to, subject, body, filename string, pdf []byte) error {
	addr := net.JoinHostPort(cfg.SMTPHost, cfg.SMTPPort)
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("servidor SMTP %s inacessível: %w", addr, err)
	}
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
	c, err := smtp.NewClient(conn, cfg.SMTPHost)
	if err != nil {
		conn.Close()
		return fmt.Errorf("falha no handshake SMTP: %w", err)
	}
	defer c.Close()
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: cfg.SMTPHost}); err != nil {
			return fmt.Errorf("falha no STARTTLS: %w", err)
		}
	}
	if cfg.SMTPUser != "" {
		if err := c.Auth(smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)); err != nil {
			return fmt.Errorf("autenticação SMTP recusada: %w", err)
		}
	}
	if err := c.Mail(cfg.SMTPFrom); err != nil {
		return fmt.Errorf("remetente recusado: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("destinatário recusado: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(buildMessage(cfg.SMTPFrom, to, subject, body, filename, pdf)); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}

func validarEmail(s string) (string, bool) {
	s = strings.TrimSpace(s)
	a, err := mail.ParseAddress(s)
	if err != nil || a.Address != s || !strings.Contains(a.Address[strings.LastIndex(a.Address, "@"):], ".") {
		return "", false
	}
	return s, true
}
