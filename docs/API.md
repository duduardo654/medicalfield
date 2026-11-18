# MedicalField – Documentação das APIs

Swagger interativo: auth `http://localhost:8001/docs` · core `http://localhost:8002/docs`
business `http://localhost:8003/docs`. Todas as rotas exigem `Authorization: Bearer <token>`, exceto `POST /auth/login`
(e as páginas `/docs`, desligáveis com `ENABLE_DOCS=false`). Erros: `{"erro":{"codigo","mensagem","detalhes?"}}`.

## auth-service (Python/FastAPI, :8001)
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/login` | Não | `{identificacao, senha}` → `{access_token, token_type, expires_in, profissional}` |
| GET | `/auth/me` | Sim | Profissional do token |
| GET | `/auth/validate` | Sim | Valida o token e devolve as claims |

JWT HS256, claims: `sub, identificacao, nome, tipo, perfil, iat, exp, iss`. Validade: `JWT_EXPIRES_MINUTES` (480).

## core-service (Node.js/Express, :8002)
`{id}` em `/prontuario/{id}` e `/atendimento/{id}` = **id da pessoa** (como no enunciado).

| Método | Rota | Descrição |
|---|---|---|
| GET | `/pessoa?q=&limit=&offset=` | Lista/busca pessoas |
| GET | `/pessoa/{id}` | Obtém pessoa |
| POST | `/pessoa` | Cadastra (aceita `id` UUID do cliente; mesmo id = 200 idempotente; CPF repetido = 409) |
| PUT | `/pessoa/{id}` | Atualiza (parcial, profissional autenticado) |
| DELETE | `/pessoa/{id}` | **ADMIN**; 409 se houver prontuário |
| GET | `/prontuario` | Todos os prontuários (com nome da pessoa) |
| GET | `/prontuario/{id}` | Prontuário de uma pessoa |
| POST | `/prontuario` | Cria (1 por pessoa; 409 se já existir; 422 se a pessoa não existir) |
| PUT / DELETE | `/prontuario/{id}` | Atualiza (autenticado) / remove (**ADMIN**; 409 se houver atendimentos) |
| GET | `/atendimento` | Todos os atendimentos (com nome da pessoa e medicamentos) |
| GET | `/atendimento/{id}` | Atendimentos de uma pessoa |
| GET | `/atendimento/detalhe/{atendimentoId}` | Um atendimento + pessoa + prontuário + medicamentos (usado pelo PDF) |
| POST | `/atendimento` | Registra (profissional = usuário autenticado; exige prontuário) |
| PUT / DELETE | `/atendimento/detalhe/{atendimentoId}` | Atualiza (autenticado) / remove (**ADMIN**) |
| POST | `/sync/push` | Recebe a Outbox (ver abaixo) |
| GET | `/sync/pull?since=` | Mudanças do servidor desde `since` |
| POST | `/log` | Logs de acesso gerados offline (idempotente por `log_id`) |
| GET | `/log?servico=&origem=&limit=` | Consulta de auditoria (**ADMIN**) |

### Exemplo – atendimento
```json
POST /atendimento
{ "pessoa_id": "1111…", "data_hora": "2026-11-14T15:30:00Z", "queixa_principal": "Dor torácica",
  "pa_sistolica": 150, "pa_diastolica": 95, "freq_cardiaca": 102, "spo2": 96, "temperatura": 36.6,
  "glasgow_ocular": 4, "glasgow_verbal": 5, "glasgow_motor": 6,
  "triagem_manchester": "LARANJA", "triagem_start": "AMARELO",
  "medicamentos": [{ "nome": "AAS", "dose": "300 mg", "via": "VO", "horario": "2026-11-14T15:40:00Z" }] }
```

### Sincronização
**Push** – `POST /sync/push` com `{"operacoes":[{op_id, entidade, operacao, registro_id, profissional_id?, client_created_at?, payload}]}`.
Enviar em ordem: pessoa → prontuário → atendimento. Resposta (200) com o resultado de **cada** operação:
```json
{ "processadas": 3, "resumo": { "APPLIED": 3 },
  "resultados": [ { "op_id": "83bcb622…", "entidade": "pessoa", "canonical_id": "8c5962c4…", "resultado": "APPLIED", "version": 1 }, … ] }
```
| Resultado | Significado | O cliente deve |
|---|---|---|
| `APPLIED` | Persistido (COMMIT feito) | marcar `SINCRONIZADO` |
| `DUPLICATE` | Já processado / registro idêntico | marcar `SINCRONIZADO` |
| `MERGED` | Duplicata fundida (mesmo CPF / pessoa já tinha prontuário); `canonical_id` é o id oficial | marcar `SINCRONIZADO` ; a troca de todos os IDs locais por `canonical_id` permanece limitação do cliente atual |
| `CONFLICT_RESOLVED` | Divergência resolvida pela Strategy (`detalhe.estrategia`, `vencedor`, `campos`) | marcar `SINCRONIZADO` e fazer pull |
| `REJECTED` | `retentavel: true` → dependência ainda ausente/erro temporário (reenviar depois, mesmo `op_id`); `false` → dado inválido (corrigir) | manter na fila / `ERRO` |

Regras: idempotência por `op_id` (e por registro idêntico); cada operação em transação própria; `UPDATE` com
`base_version` igual à versão do servidor não gera conflito. Estratégias (`core/src/sync/conflictStrategies.js`):
pessoa e prontuário = `FIELD_MERGE`; atendimento = `LAST_WRITE_WINS` (por `client_updated_at`). Override global: `CONFLICT_STRATEGY=SERVER_WINS` no `.env`.

**Pull** – `GET /sync/pull?since=<cursor>` → `{server_time, cursor, pessoas[], prontuarios[], atendimentos[]}`.
Guarde o `cursor` para a próxima chamada (recua 5 s; reenvio é inofensivo). Sem `since` baixa tudo.
Limitação documentada: exclusões feitas por ADMIN não são propagadas aos clientes.

## business-service (Go, :8003)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/medicamento?q=&since=&somente_ativos=` | Todos os medicamentos. `since` = só o que mudou; cabeçalho `X-Sync-Cursor` = cursor da próxima chamada |
| POST | `/medicamento` | Cadastra medicamento (nome e principio_ativo obrigatórios; autenticado) |
| GET | `/medicamento/{id}` | Um medicamento |
| GET | `/ficha/{atendimentoId}/pdf[?inline=1]` | Gera e baixa a Ficha de Atendimento (`application/pdf`) |
| POST | `/ficha/{atendimentoId}/email` | `{"destinatario":"x@y.com","mensagem":"opcional"}` envia o PDF anexado; sem `destinatario` usa o e-mail da pessoa |
| GET | `/ficha/{atendimentoId}/emails` | Histórico de envios da ficha |

`{atendimentoId}` = id do **atendimento**. O PDF é montado com os dados de `core-service GET /atendimento/detalhe/{id}`
(chamada HTTP com o token do usuário). Códigos de erro próprios: `CORE_INDISPONIVEL` (502), `EMAIL_INVALIDO` e
`DESTINATARIO_AUSENTE` (422), `EMAIL_FALHOU` (502, SMTP fora do ar; a tentativa fica registrada em `business.email_enviado`).
Medicamentos inseridos direto no PostgreSQL aparecem imediatamente (trigger em `updated_at`).

## Tabelas novas na Etapa 2 (migration 004)
`core.atendimento.profissional_nome / profissional_identificacao` (assinatura do registro) e
`audit.access_log.client_log_id` (idempotência de `POST /log`). Demais tabelas: ver `ARQUITETURA.md`.

## Cadastro de medicamento

```http
POST /medicamento
Authorization: Bearer <token>
Content-Type: application/json
```
```json
{"nome":"Medicamento Fictício A","principio_ativo":"Substância de demonstração","apresentacao":"Apresentação fictícia","via_administracao":"VO","observacao":"Apenas para teste acadêmico"}
```

Resposta 201 com o registro criado. A interface usa `/api/medicamentos/remotos` para encaminhar o cadastro ao Business e atualizar o cache local. O formulário simplificado não exige dose máxima e unidade.

A documentação usa exemplos de tipos; o corpo real aparece em **Server response**. As APIs ficam disponíveis pelo túnel SSH das portas 8001–8003.
