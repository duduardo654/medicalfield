# MedicalField – Prontuário Médico de Emergência

Projeto acadêmico (Arquiteturas de Software – Univates 2026/B). Arquitetura completa em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

> **Status:** Etapa 1 concluída (banco PostgreSQL + auth-service). Próximas: core-service, business-service,
> portal admin, cliente offline-first, deploy na VM.

## Início rápido – Windows (desenvolvimento local)

Pré-requisitos: **Python 3.12+** (no PATH) e **PostgreSQL** rodando, com o banco `medicalfield` já criado.
Não é necessário ter `psql`, Git Bash nem liberar scripts do PowerShell.

No terminal do VS Code, na pasta `medicalfield`:

```
.\iniciar-auth.bat
```

Ele faz tudo: cria o venv, instala as dependências, pergunta host/porta/usuário/senha do PostgreSQL
(Enter aceita o padrão; **só a senha é obrigatória**), grava o `.env`, aplica tabelas + dados de demonstração
e inicia o serviço em **http://localhost:8001/docs**. Pode ser executado quantas vezes quiser (é idempotente).

* Recriar o banco do zero: `.\iniciar-auth.bat --reset`
* Ver o log de auditoria: `services\auth-service\.venv\Scripts\python.exe scripts\ver_logs.py`

## Linux / VM Ubuntu
```bash
python3 -m venv services/auth-service/.venv
services/auth-service/.venv/bin/pip install -r services/auth-service/requirements.txt
services/auth-service/.venv/bin/python scripts/setup.py     # cria .env + aplica banco
cd services/auth-service && .venv/bin/python run.py
```

## Credenciais fictícias de demonstração
| Identificação | Senha | Perfil |
|---|---|---|
| `ADMIN-001` | `admin123` | Administrador (Portal) |
| `CRM-RS-12345` | `medico123` | Dra. Helena Duarte |
| `COREN-RS-67890` | `enfer123` | Enf. Carlos Mendes |
| `SOCORRISTA-0042` | `socor123` | Marina Lopes |

## Logs
Cada serviço grava JSON-lines em `logs/<servico>.log` **e** em `audit.access_log` (PostgreSQL).
