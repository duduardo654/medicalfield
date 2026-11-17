# Etapa 6 — Persistência online e visual simplificado

## Para executar

1. Fechar janelas de execução da etapa 5.
2. Fazer uma cópia do `.env` local e de `applications/attendance-client/data/medicalfield.sqlite3`, se existirem.
3. Extrair esta pasta e manter o seu `.env` **fora do ZIP**, dentro da raiz `medicalfield`.
4. Executar `iniciar-tudo.bat` no Windows e acessar `http://localhost:3000`.
5. Em ONLINE, cadastrar uma pessoa e verificar que a interface retorna a confirmação do servidor; na Administração, consultar os registros já confirmados.
6. Em OFFLINE, cadastrar pessoa, prontuário e atendimento; ao voltar a ONLINE, sincronizar para o banco central.

## Funcionamento técnico

A interface não exibe nomes de bancos. O backend continua usando SQLite local como Outbox e cópia do cliente; toda criação online tem tentativa imediata de `POST /sync/push` ao serviço Core, que persiste no PostgreSQL. Só a confirmação `APPLIED`, `MERGED`, `CONFLICT_RESOLVED` ou `DUPLICATE` permite marcar como sincronizado. Falhas de conexão preservam a operação local para novas tentativas.

## SMTP Gmail

A senha de aplicativo Google normalmente tem 16 caracteres, exibidos em quatro grupos de quatro. Informar os caracteres sem espaços no `SMTP_PASS` do `.env`. Não é a senha comum da conta. Para contas institucionais a disponibilidade depende das políticas do administrador. SMTP utiliza `smtp.gmail.com`, porta `587`, com STARTTLS. Não compartilhe o arquivo `.env`.

## Limites desta verificação

Foram executados sete testes de contrato e comportamento do cliente via FastAPI TestClient, usando respostas simuladas do Core, além de validação de sintaxe JavaScript. O teste integrado real com PostgreSQL, a entrega efetiva de e-mail e a execução na VM precisam ser validados no ambiente do usuário.
