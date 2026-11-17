package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

func itoa(n int) string { return strconv.Itoa(n) }

// Dados do atendimento como devolvidos por GET /atendimento/detalhe/{id} do core-service.
type pessoaInfo struct {
	ID                string  `json:"id"`
	Nome              string  `json:"nome"`
	CPF               *string `json:"cpf"`
	DataNascimento    *string `json:"data_nascimento"`
	Sexo              *string `json:"sexo"`
	Telefone          *string `json:"telefone"`
	Email             *string `json:"email"`
	ContatoEmergencia *string `json:"contato_emergencia"`
}

type prontuarioInfo struct {
	TipoSanguineo           *string `json:"tipo_sanguineo"`
	Alergias                *string `json:"alergias"`
	CondicoesCronicas       *string `json:"condicoes_cronicas"`
	MedicamentosUsoContinuo *string `json:"medicamentos_uso_continuo"`
	Observacoes             *string `json:"observacoes"`
}

type medAdministrado struct {
	Nome    string     `json:"nome"`
	Dose    string     `json:"dose"`
	Via     *string    `json:"via"`
	Horario *time.Time `json:"horario"`
}

type atendimentoDetalhe struct {
	ID                        string            `json:"id"`
	DataHora                  time.Time         `json:"data_hora"`
	ProfissionalID            string            `json:"profissional_id"`
	ProfissionalNome          *string           `json:"profissional_nome"`
	ProfissionalIdentificacao *string           `json:"profissional_identificacao"`
	LocalOcorrencia           *string           `json:"local_ocorrencia"`
	QueixaPrincipal           string            `json:"queixa_principal"`
	Descricao                 *string           `json:"descricao"`
	PaSistolica               *int              `json:"pa_sistolica"`
	PaDiastolica              *int              `json:"pa_diastolica"`
	FreqCardiaca              *int              `json:"freq_cardiaca"`
	FreqRespiratoria          *int              `json:"freq_respiratoria"`
	Spo2                      *int              `json:"spo2"`
	Temperatura               *float64          `json:"temperatura"`
	Glicemia                  *int              `json:"glicemia"`
	GlasgowOcular             *int              `json:"glasgow_ocular"`
	GlasgowVerbal             *int              `json:"glasgow_verbal"`
	GlasgowMotor              *int              `json:"glasgow_motor"`
	GlasgowTotal              *int              `json:"glasgow_total"`
	TriagemManchester         *string           `json:"triagem_manchester"`
	TriagemStart              *string           `json:"triagem_start"`
	Conduta                   *string           `json:"conduta"`
	Encaminhamento            *string           `json:"encaminhamento"`
	Origem                    string            `json:"origem"`
	Medicamentos              []medAdministrado `json:"medicamentos"`
	Pessoa                    *pessoaInfo       `json:"pessoa"`
	Prontuario                *prontuarioInfo   `json:"prontuario"`
}

// fetchAtendimento consulta o core-service por HTTP/REST repassando o token do usuário
// (a autorização continua sendo a do profissional autenticado).
func (s *Server) fetchAtendimento(ctx context.Context, token, id string) (*atendimentoDetalhe, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.CoreURL+"/atendimento/detalhe/"+id, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := s.httpc.Do(req)
	if err != nil {
		return nil, newErr(502, "CORE_INDISPONIVEL", fmt.Sprintf("Não foi possível consultar o core-service (%s). Verifique se ele está em execução.", s.cfg.CoreURL))
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	switch {
	case resp.StatusCode == http.StatusOK:
		var a atendimentoDetalhe
		if err := json.Unmarshal(body, &a); err != nil {
			return nil, fmt.Errorf("resposta inválida do core-service: %w", err)
		}
		if a.Pessoa == nil {
			return nil, newErr(502, "CORE_RESPOSTA_INVALIDA", "O core-service não retornou os dados da pessoa.")
		}
		return &a, nil
	case resp.StatusCode == http.StatusNotFound:
		return nil, newErr(404, "ATENDIMENTO_NAO_ENCONTRADO", "Atendimento "+id+" não encontrado.")
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return nil, newErr(resp.StatusCode, "ACESSO_NEGADO_NO_CORE", "O core-service recusou o token informado.")
	default:
		return nil, newErr(502, "CORE_ERRO", fmt.Sprintf("O core-service respondeu HTTP %d.", resp.StatusCode))
	}
}
