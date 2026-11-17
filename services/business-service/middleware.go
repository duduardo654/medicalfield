package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ---------------------------------------------------------------------------------
// Estado por requisição (compartilhado entre os elos da cadeia de middlewares)
// ---------------------------------------------------------------------------------
type userClaims struct {
	ID, Identificacao, Nome, Perfil string
}

type reqState struct {
	profissionalID string
	detalhe        string
	user           *userClaims
	token          string
}

type ctxKey struct{}

func stateOf(r *http.Request) *reqState {
	st, _ := r.Context().Value(ctxKey{}).(*reqState)
	return st
}

func userOf(r *http.Request) *userClaims {
	if st := stateOf(r); st != nil {
		return st.user
	}
	return nil
}

// ---------------------------------------------------------------------------------
// CORS (primeiro elo)
// ---------------------------------------------------------------------------------
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		h.Set("Access-Control-Expose-Headers", "Content-Disposition, X-Sync-Cursor, X-Total-Count")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------------------------
// Auditoria: registra TODA requisição (inclusive 401/404/500)
// Campos: data/hora, IP, ID do profissional, método, rota, status, tempo (ms).
// Destinos: logs/business-service.log (JSON-lines) e audit.access_log (assíncrono).
// ---------------------------------------------------------------------------------
type logEntry struct {
	TS             time.Time `json:"ts"`
	Servico        string    `json:"servico"`
	IP             string    `json:"ip"`
	ProfissionalID *string   `json:"profissional_id"`
	Metodo         string    `json:"metodo"`
	Rota           string    `json:"rota"`
	Status         int       `json:"status"`
	TempoMs        float64   `json:"tempo_ms"`
	Detalhe        *string   `json:"detalhe"`
}

type auditLogger struct {
	db   *sql.DB
	file *os.File
	mu   sync.Mutex
	ch   chan logEntry
	done chan struct{}
}

func newAuditLogger(cfg *Config, db *sql.DB) *auditLogger {
	a := &auditLogger{db: db, ch: make(chan logEntry, 2000), done: make(chan struct{})}
	if err := os.MkdirAll(cfg.LogDir, 0o755); err == nil {
		f, err := os.OpenFile(filepath.Join(cfg.LogDir, "business-service.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err == nil {
			a.file = f
		}
	}
	go a.worker()
	return a
}

const insertLog = `INSERT INTO audit.access_log
  (servico, ocorrido_em, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, origem, detalhe)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ONLINE',$9)`

func (a *auditLogger) worker() {
	defer close(a.done)
	for e := range a.ch {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, err := a.db.ExecContext(ctx, insertLog, e.Servico, e.TS, e.IP, e.ProfissionalID, e.Metodo, e.Rota, e.Status, e.TempoMs, e.Detalhe)
		cancel()
		if err != nil {
			log.Printf("[accessLog] falha ao gravar no banco: %v", err)
		}
	}
}

func (a *auditLogger) record(e logEntry) {
	line, _ := json.Marshal(e)
	a.mu.Lock()
	if a.file != nil {
		_, _ = a.file.Write(append(line, '\n'))
	}
	a.mu.Unlock()
	log.Print(string(line))
	select { // nunca bloqueia a resposta
	case a.ch <- e:
	default:
	}
}

func (a *auditLogger) close() {
	close(a.ch)
	select {
	case <-a.done:
	case <-time.After(3 * time.Second):
	}
	if a.file != nil {
		_ = a.file.Close()
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (s *statusRecorder) WriteHeader(code int) {
	if !s.wrote {
		s.status, s.wrote = code, true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if !s.wrote {
		s.status, s.wrote = http.StatusOK, true
	}
	return s.ResponseWriter.Write(b)
}

func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return strings.TrimPrefix(host, "::ffff:")
}

func (s *Server) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		st := &reqState{}
		r = r.WithContext(context.WithValue(r.Context(), ctxKey{}, st))
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if p := recover(); p != nil {
				log.Printf("[PANIC] %v\n%s", p, debug.Stack())
				st.detalhe = "ERRO_INTERNO"
				if !rec.wrote {
					writeError(rec, r, newErr(500, "ERRO_INTERNO", "Erro interno do servidor."))
				}
				rec.status = 500
			}
			e := logEntry{
				TS: start.UTC(), Servico: "business", IP: clientIP(r), Metodo: r.Method, Rota: r.URL.Path,
				Status: rec.status, TempoMs: math.Round(float64(time.Since(start).Microseconds())/10) / 100,
			}
			if st.profissionalID != "" {
				id := st.profissionalID
				e.ProfissionalID = &id
			}
			if st.detalhe != "" {
				d := st.detalhe
				e.Detalhe = &d
			}
			s.audit.record(e)
		}()
		next.ServeHTTP(rec, r)
	})
}

// ---------------------------------------------------------------------------------
// Autenticação: valida localmente o JWT (HS256) emitido pelo auth-service
// ---------------------------------------------------------------------------------
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fail := func(codigo, msg string) {
			w.Header().Set("WWW-Authenticate", "Bearer")
			writeError(w, r, newErr(401, codigo, msg))
		}
		parts := strings.SplitN(r.Header.Get("Authorization"), " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || strings.TrimSpace(parts[1]) == "" {
			fail("TOKEN_AUSENTE", "Token de autenticação não informado. Use o cabeçalho Authorization: Bearer <token>.")
			return
		}
		raw := strings.TrimSpace(parts[1])
		tok, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) { return []byte(s.cfg.JWTSecret), nil },
			jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(s.cfg.JWTIssuer), jwt.WithExpirationRequired())
		if err != nil || !tok.Valid {
			if errors.Is(err, jwt.ErrTokenExpired) {
				fail("TOKEN_EXPIRADO", "Token expirado. Faça login novamente.")
			} else {
				fail("TOKEN_INVALIDO", "Token inválido.")
			}
			return
		}
		c, _ := tok.Claims.(jwt.MapClaims)
		str := func(k string) string { v, _ := c[k].(string); return v }
		st := stateOf(r)
		if st != nil {
			st.profissionalID = str("sub")
			st.token = raw
			st.user = &userClaims{ID: str("sub"), Identificacao: str("identificacao"), Nome: str("nome"), Perfil: str("perfil")}
		}
		next.ServeHTTP(w, r)
	})
}
