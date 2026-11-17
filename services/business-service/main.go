// MedicalField - business-service (Go)
// Medicamentos, Ficha de Atendimento em PDF e envio por e-mail.
package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

type Server struct {
	cfg   *Config
	db    *sql.DB
	audit *auditLogger
	httpc *http.Client // cliente HTTP para o core-service
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /medicamento", handle(s.listMedicamentos))
	mux.HandleFunc("GET /medicamento/{id}", handle(s.getMedicamento))
	mux.HandleFunc("GET /ficha/{atendimentoId}/pdf", handle(s.fichaPDF))
	mux.HandleFunc("POST /ficha/{atendimentoId}/email", handle(s.fichaEmail))
	mux.HandleFunc("GET /ficha/{atendimentoId}/emails", handle(s.fichaEmails))

	protected := s.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, pattern := mux.Handler(r); pattern == "" {
			writeError(w, r, newErr(404, "ROTA_NAO_ENCONTRADA", "Rota "+r.Method+" "+r.URL.Path+" não existe."))
			return
		}
		mux.ServeHTTP(w, r)
	}))

	// Cadeia: CORS -> auditoria -> (docs públicas | JWT -> rotas)
	return cors(s.accessLog(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.EnableDocs && (r.URL.Path == "/docs" || r.URL.Path == "/openapi.json") {
			s.serveDocs(w, r)
			return
		}
		protected.ServeHTTP(w, r)
	})))
}

func main() {
	log.SetFlags(0)
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("[business-service] configuração inválida: %v", err)
	}
	db, err := openDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[business-service] não foi possível conectar ao PostgreSQL: %v", err)
	}
	s := &Server{cfg: cfg, db: db, audit: newAuditLogger(cfg, db), httpc: &http.Client{Timeout: 12 * time.Second}}
	srv := &http.Server{
		Addr: ":" + cfg.Port, Handler: s.routes(),
		ReadHeaderTimeout: 10 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second,
	}
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()
	log.Printf("[business-service] ouvindo em http://localhost:%s  (Swagger: /docs)  core=%s  smtp=%s:%s", cfg.Port, cfg.CoreURL, cfg.SMTPHost, cfg.SMTPPort)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("[business-service] erro: %v (a porta %s pode já estar em uso; altere BUSINESS_PORT no .env)", err, cfg.Port)
	}
	s.audit.close()
	_ = db.Close()
}
