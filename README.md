# MedicalField – Prontuário Médico de Emergência

Projeto acadêmico (Arquiteturas de Software – Univates 2026/B). Arquitetura completa em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

> **Status:** Etapa 5: interface integrada em uma porta web e três microsserviços internos. Testes locais do SQLite concluídos; integração real e envio SMTP permanecem pendentes de validação.

## Etapa 5 — Aplicação integrada

- **Endereço único do sistema:** `http://localhost:3000`.
- Faça login uma vez com uma das credenciais fictícias abaixo. O profissional pode usar a área **Atendimento · SQLite**; um administrador também pode usar **Administração · PostgreSQL**.
- A interface permite cadastrar pessoas, prontuários e atendimentos em SQLite, simular modo OFFLINE/ONLINE, sincronizar e consultar dados oficiais. Na aba administrativa também é possível editar ou excluir registros oficiais existentes, quando o banco permitir.
- Os microsserviços Python (8001), Node.js (8002) e Go (8003) permanecem separados **internamente**, porém o navegador usa somente a porta 3000.
- O Mailpit foi retirado do inicializador; envio de e-mail exige configuração SMTP real em `.env` e autorização do provedor de e-mail. **Sem credenciais SMTP, o envio não funciona.**
- **Os dados locais da etapa 4** não são transportados automaticamente pelo ZIP: ao substituir a pasta, preserve o arquivo SQLite localizado em `applications/attendance-client/data/medicalfield.sqlite3` e seu `.env`.
- Para Windows, feche todas as janelas da etapa anterior, inicie `iniciar-tudo.bat` e abra `http://localhost:3000`.
- Guia detalhado: [`docs/ETAPA5.md`](docs/ETAPA5.md).

## Dependências do Windows

Python 3.12+, Node.js 18+, PostgreSQL com banco `medicalfield`, conforme as etapas anteriores. Use `iniciar-tudo.bat` na pasta raiz. Não execute `--reset` se deseja manter seus dados.

## Credenciais fictícias de demonstração

| Identificação | Senha | Perfil |
|---|---|---|
| `ADMIN-001` | `admin123` | Administrador |
| `CRM-RS-12345` | `medico123` | Profissional médico |
| `COREN-RS-67890` | `enfer123` | Enfermagem |
| `SOCORRISTA-0042` | `socor123` | Socorrista |

## Testes

```
services\auth-service\.venv\Scripts\python.exe -m unittest discover -s applications/attendance-client -p "test_*.py" -v
```

As verificações do backend requerem execução e PostgreSQL devidamente configurados. Os arquivos originais `docs/API.md` e `docs/ARQUITETURA.md` documentam as APIs independentes. A atualização do endereço web está em `docs/ETAPA5.md`.

## VM Linux

Scripts locais preparados: `scripts/iniciar-linux.sh` e `scripts/instalar-systemd.sh`. A implantação remota ainda **não foi executada**, aguardando autorização. É recomendado que o SQLite do dispositivo local permaneça no Windows, e que a VM contenha o PostgreSQL e os microsserviços centrais.


## Etapa 6 — Cadastro online e apresentação simplificada

- Uma única interface em `http://localhost:3000` com login, atendimento e administração.
- Cadastro ONLINE: o cliente registra a operação com UUID/Outbox local e a envia imediatamente
  ao Core; só informa **confirmado no servidor** após resultado positivo da API (PostgreSQL).
- Se o servidor falhar, mantém a operação pendente no SQLite para reenvio idempotente.
- Cadastro OFFLINE: persiste localmente e não envia nada ao Core até a volta da conexão.
- Nomes dos bancos foram retirados da tela; permanecem nesta documentação técnica.
- SMTP Gmail: senha de app de 16 caracteres no `.env`, sem espaços e nunca no código ou ZIP.

**Atenção:** o modo ONLINE é um simulador de conectividade, não uma garantia de rede real;
confirmação de gravação depende da resposta do Core. O arquivo `.env` local não está incluso
na distribuição. Não foi efetuado acesso SSH à VM nem envio de e-mails reais.


## Etapa 7 — Ajustes após validação dos CRUDs

Confira `docs/ETAPA7.md` para confirmação dos cadastros, origem ONLINE/OFFLINE, lista de medicamentos, auditoria, testes de endpoints e sincronização de recebimento.

## Etapa 8: correção de medicamentos

Consulte [`docs/ETAPA8.md`](docs/ETAPA8.md) para corrigir o erro “Medicamentos: Entidade inválida” e validar o cache offline.

## Etapa 9

Confirmação visual de sincronização e procedimento de teste de falha/recuperação: consulte [`docs/ETAPA9.md`](docs/ETAPA9.md).


### Etapa 10 — Sincronização manual

A troca OFFLINE → ONLINE **não** sincroniza automaticamente. O botão **Sincronizar agora** é o único disparador de envio de pendências e recebimento remoto de dados. Leia `docs/ETAPA10.md` para o fluxo e testes.
