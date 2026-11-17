package main

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
)

// Formato de erro único em todos os serviços: {"erro":{"codigo","mensagem","detalhes?"}}
type apiError struct {
	Status   int
	Codigo   string
	Mensagem string
	Detalhes any
}

func (e *apiError) Error() string { return e.Codigo + ": " + e.Mensagem }

func newErr(status int, codigo, msg string) *apiError {
	return &apiError{Status: status, Codigo: codigo, Mensagem: msg}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, r *http.Request, e *apiError) {
	if st := stateOf(r); st != nil {
		st.detalhe = e.Codigo
	}
	body := map[string]any{"codigo": e.Codigo, "mensagem": e.Mensagem}
	if e.Detalhes != nil {
		body["detalhes"] = e.Detalhes
	}
	writeJSON(w, e.Status, map[string]any{"erro": body})
}

// handle adapta handlers que retornam error para http.HandlerFunc.
func handle(fn func(http.ResponseWriter, *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			if ae, ok := err.(*apiError); ok {
				writeError(w, r, ae)
				return
			}
			log.Printf("[ERRO INTERNO] %s %s: %v", r.Method, r.URL.Path, err)
			writeError(w, r, newErr(500, "ERRO_INTERNO", "Erro interno do servidor."))
		}
	}
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func parseUUID(v, nome string) (string, *apiError) {
	if !uuidRe.MatchString(v) {
		return "", newErr(422, "ID_INVALIDO", "O parâmetro "+nome+" deve ser um UUID válido.")
	}
	return v, nil
}
