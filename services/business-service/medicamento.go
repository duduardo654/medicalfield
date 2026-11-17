package main

import (
	"database/sql"
	"net/http"
	"strings"
	"time"
)

type Medicamento struct {
	ID               string    `json:"id"`
	Nome             string    `json:"nome"`
	PrincipioAtivo   string    `json:"principio_ativo"`
	Apresentacao     *string   `json:"apresentacao"`
	ViaAdministracao *string   `json:"via_administracao"`
	DoseMaxUnitaria  *float64  `json:"dose_max_unitaria"`
	UnidadeDose      *string   `json:"unidade_dose"`
	Contraindicacoes *string   `json:"contraindicacoes"`
	Observacao       *string   `json:"observacao"`
	Ativo            bool      `json:"ativo"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

const medCols = `id::text, nome, principio_ativo, apresentacao, via_administracao, dose_max_unitaria::float8,
  unidade_dose, contraindicacoes, observacao, ativo, created_at, updated_at`

func scanMed(sc interface{ Scan(...any) error }) (Medicamento, error) {
	var m Medicamento
	err := sc.Scan(&m.ID, &m.Nome, &m.PrincipioAtivo, &m.Apresentacao, &m.ViaAdministracao, &m.DoseMaxUnitaria,
		&m.UnidadeDose, &m.Contraindicacoes, &m.Observacao, &m.Ativo, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

// GET /medicamento?q=&since=&somente_ativos=
// Sem parâmetros devolve todos. `since` (ISO-8601) devolve só o que mudou depois (pull incremental do cliente);
// o cabeçalho X-Sync-Cursor traz o cursor para a próxima chamada (recua 5 s para não perder commits concorrentes).
// Medicamentos inseridos/alterados manualmente no PostgreSQL aparecem aqui sem reiniciar nada.
func (s *Server) listMedicamentos(w http.ResponseWriter, r *http.Request) error {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	somenteAtivos := strings.EqualFold(r.URL.Query().Get("somente_ativos"), "true") || r.URL.Query().Get("somente_ativos") == "1"
	var since *time.Time
	if v := r.URL.Query().Get("since"); v != "" {
		t, err := time.Parse(time.RFC3339Nano, v)
		if err != nil {
			return newErr(422, "DADOS_INVALIDOS", "since deve ser uma data ISO-8601, ex.: 2026-11-14T10:00:00Z.")
		}
		since = &t
	}
	var cursor time.Time
	if err := s.db.QueryRowContext(r.Context(), `SELECT now() - interval '5 seconds'`).Scan(&cursor); err != nil {
		return err
	}
	rows, err := s.db.QueryContext(r.Context(), `SELECT `+medCols+` FROM business.medicamento
		WHERE ($1::timestamptz IS NULL OR updated_at > $1)
		  AND ($2 = '' OR nome ILIKE '%'||$2||'%' OR principio_ativo ILIKE '%'||$2||'%')
		  AND (NOT $3 OR ativo)
		ORDER BY nome`, since, q, somenteAtivos)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Medicamento{}
	for rows.Next() {
		m, err := scanMed(rows)
		if err != nil {
			return err
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	w.Header().Set("X-Sync-Cursor", cursor.UTC().Format(time.RFC3339Nano))
	w.Header().Set("X-Total-Count", itoa(len(out)))
	writeJSON(w, http.StatusOK, out)
	return nil
}

// GET /medicamento/{id}
func (s *Server) getMedicamento(w http.ResponseWriter, r *http.Request) error {
	id, aerr := parseUUID(r.PathValue("id"), "id")
	if aerr != nil {
		return aerr
	}
	m, err := scanMed(s.db.QueryRowContext(r.Context(), `SELECT `+medCols+` FROM business.medicamento WHERE id = $1`, id))
	if err == sql.ErrNoRows {
		return newErr(404, "MEDICAMENTO_NAO_ENCONTRADO", "Medicamento "+id+" não encontrado.")
	}
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, m)
	return nil
}
