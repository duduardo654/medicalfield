package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Config do business-service. Lida do .env na raiz do projeto; variáveis de ambiente têm prioridade
// (é assim que o systemd injeta a configuração na VM).
type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	JWTIssuer   string
	CoreURL     string
	LogDir      string
	EnableDocs  bool
	SMTPHost    string
	SMTPPort    string
	SMTPFrom    string
	SMTPUser    string // opcional (SMTP real); nunca versionar
	SMTPPass    string
}

// localiza o .env subindo a partir do diretório atual e do diretório do executável
func findEnvFile() string {
	cands := []string{os.Getenv("MEDICALFIELD_ENV"), "../../.env", "../.env", ".env"}
	if exe, err := os.Executable(); err == nil {
		d := filepath.Dir(exe)
		cands = append(cands, filepath.Join(d, "../../../.env"), filepath.Join(d, "../../.env"), filepath.Join(d, ".env"))
	}
	for _, c := range cands {
		if c == "" {
			continue
		}
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	return ""
}

func parseEnvFile(path string) map[string]string {
	out := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(sc.Text(), "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
			continue
		}
		kv := strings.SplitN(line, "=", 2)
		out[strings.TrimSpace(kv[0])] = strings.Trim(strings.TrimSpace(kv[1]), `"'`)
	}
	return out
}

func loadConfig() (*Config, error) {
	envPath := findEnvFile()
	file := map[string]string{}
	root := "."
	if envPath != "" {
		file = parseEnvFile(envPath)
		root = filepath.Dir(envPath)
	}
	get := func(key, def string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		if v, ok := file[key]; ok && v != "" {
			return v
		}
		return def
	}
	c := &Config{
		Port:        get("BUSINESS_PORT", "8003"),
		DatabaseURL: get("DATABASE_URL", ""),
		JWTSecret:   get("JWT_SECRET", ""),
		JWTIssuer:   "medicalfield-auth",
		CoreURL:     strings.TrimRight(get("CORE_URL", "http://localhost:8002"), "/"),
		EnableDocs:  strings.EqualFold(get("ENABLE_DOCS", "true"), "true"),
		SMTPHost:    get("SMTP_HOST", "localhost"),
		SMTPPort:    get("SMTP_PORT", "1025"),
		SMTPFrom:    get("SMTP_FROM", "fichas@medicalfield.test"),
		SMTPUser:    get("SMTP_USER", ""),
		SMTPPass:    get("SMTP_PASS", ""),
	}
	logDir := get("LOG_DIR", "./logs")
	if !filepath.IsAbs(logDir) {
		logDir = filepath.Join(root, logDir)
	}
	c.LogDir = logDir
	for name, v := range map[string]string{"DATABASE_URL": c.DatabaseURL, "JWT_SECRET": c.JWTSecret} {
		if v == "" || v == "CHANGE_ME" {
			return nil, fmt.Errorf("variável %s não configurada (.env encontrado: %q) - rode iniciar-tudo.bat ou scripts/setup.py", name, envPath)
		}
	}
	return c, nil
}
