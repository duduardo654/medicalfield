package main

import (
	"encoding/json"
	"net/http"
)

type obj = map[string]any

func bearerErr(codes ...string) obj {
	desc := map[string]string{"401": "Token ausente/inválido/expirado", "404": "Não encontrado", "422": "Dados inválidos",
		"502": "core-service ou SMTP indisponível"}
	out := obj{}
	for _, c := range codes {
		out[c] = obj{"description": desc[c], "content": obj{"application/json": obj{"schema": obj{"$ref": "#/components/schemas/Erro"}}}}
	}
	return out
}

func merge(a obj, bs ...obj) obj {
	for _, b := range bs {
		for k, v := range b {
			a[k] = v
		}
	}
	return a
}

var idAtend = obj{"name": "atendimentoId", "in": "path", "required": true, "description": "id do ATENDIMENTO", "schema": obj{"type": "string", "format": "uuid"}}

func openAPISpec() obj {
	return obj{
		"openapi": "3.0.3",
		"info": obj{"title": "MedicalField - Business Service", "version": "1.0.0",
			"description": "Microsserviço **business** (Go): medicamentos, Ficha de Atendimento em PDF e envio por e-mail.\n\n" +
				"* Todas as rotas exigem `Authorization: Bearer <token>` (obtido em `POST /auth/login`, porta 8001).\n" +
				"* O PDF é montado a partir dos dados do `core-service` (`GET /atendimento/detalhe/{id}`), consultado por HTTP com o token do usuário.\n" +
				"* Medicamentos inseridos direto no PostgreSQL aparecem em `GET /medicamento` imediatamente."},
		"servers":  []obj{{"url": "/"}},
		"security": []obj{{"bearerAuth": []string{}}},
		"tags":     []obj{{"name": "Medicamento"}, {"name": "Ficha de Atendimento"}},
		"components": obj{
			"securitySchemes": obj{"bearerAuth": obj{"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}},
			"schemas": obj{
				"Erro": obj{"type": "object", "properties": obj{"erro": obj{"type": "object", "properties": obj{
					"codigo": obj{"type": "string"}, "mensagem": obj{"type": "string"}}}}},
				"Medicamento": obj{"type": "object", "properties": obj{
					"id": obj{"type": "string", "format": "uuid"}, "nome": obj{"type": "string"}, "principio_ativo": obj{"type": "string"},
					"apresentacao": obj{"type": "string", "nullable": true}, "via_administracao": obj{"type": "string", "nullable": true},
					"dose_max_unitaria": obj{"type": "number", "nullable": true}, "unidade_dose": obj{"type": "string", "nullable": true},
					"contraindicacoes": obj{"type": "string", "nullable": true}, "observacao": obj{"type": "string", "nullable": true},
					"ativo": obj{"type": "boolean"}, "created_at": obj{"type": "string", "format": "date-time"}, "updated_at": obj{"type": "string", "format": "date-time"}}},
			},
		},
		"paths": obj{
			"/medicamento": obj{"get": obj{"tags": []string{"Medicamento"}, "summary": "Obtém todos os medicamentos",
				"description": "`since` devolve só o que mudou depois da data (pull incremental). O cabeçalho `X-Sync-Cursor` traz o cursor para a próxima chamada.",
				"parameters": []obj{
					{"name": "q", "in": "query", "schema": obj{"type": "string"}, "description": "Busca por nome ou princípio ativo"},
					{"name": "since", "in": "query", "schema": obj{"type": "string", "format": "date-time"}},
					{"name": "somente_ativos", "in": "query", "schema": obj{"type": "boolean"}}},
				"responses": merge(obj{"200": obj{"description": "OK", "content": obj{"application/json": obj{"schema": obj{"type": "array", "items": obj{"$ref": "#/components/schemas/Medicamento"}}}}}}, bearerErr("401", "422"))}},
			"/medicamento/{id}": obj{"get": obj{"tags": []string{"Medicamento"}, "summary": "Obtém um medicamento",
				"parameters": []obj{{"name": "id", "in": "path", "required": true, "schema": obj{"type": "string", "format": "uuid"}}},
				"responses":  merge(obj{"200": obj{"description": "OK"}}, bearerErr("401", "404", "422"))}},
			"/ficha/{atendimentoId}/pdf": obj{"get": obj{"tags": []string{"Ficha de Atendimento"}, "summary": "Gera e baixa a Ficha de Atendimento (PDF)",
				"parameters": []obj{idAtend, {"name": "inline", "in": "query", "schema": obj{"type": "string", "enum": []string{"1"}}, "description": "1 = exibir no navegador em vez de baixar"}},
				"responses":  merge(obj{"200": obj{"description": "Arquivo PDF", "content": obj{"application/pdf": obj{"schema": obj{"type": "string", "format": "binary"}}}}}, bearerErr("401", "404", "422", "502"))}},
			"/ficha/{atendimentoId}/email": obj{"post": obj{"tags": []string{"Ficha de Atendimento"}, "summary": "Envia a ficha em PDF por e-mail (anexo)",
				"description": "Se `destinatario` for omitido, usa o e-mail cadastrado na pessoa.",
				"parameters":  []obj{idAtend},
				"requestBody": obj{"content": obj{"application/json": obj{"schema": obj{"type": "object", "properties": obj{
					"destinatario": obj{"type": "string", "format": "email"}, "mensagem": obj{"type": "string"}}},
					"example": obj{"destinatario": "familiar@exemplo.test", "mensagem": "Segue a ficha do atendimento."}}}},
				"responses": merge(obj{"200": obj{"description": "Enviado"}}, bearerErr("401", "404", "422", "502"))}},
			"/ficha/{atendimentoId}/emails": obj{"get": obj{"tags": []string{"Ficha de Atendimento"}, "summary": "Histórico de e-mails enviados desta ficha",
				"parameters": []obj{idAtend}, "responses": merge(obj{"200": obj{"description": "OK"}}, bearerErr("401", "422"))}},
		},
	}
}

const docsHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>MedicalField - Business Service</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui', persistAuthorization: true });</script></body></html>`

func (s *Server) serveDocs(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/openapi.json" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(openAPISpec())
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(docsHTML))
}
