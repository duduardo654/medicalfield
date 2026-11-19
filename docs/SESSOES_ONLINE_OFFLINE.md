# Correção da visualização ONLINE/OFFLINE por sessão

A interface do MedicalField funciona em uma única porta (`3000`) com SQLite compartilhado na VM, mas o modo simulado é agora mantido por sessão de navegador usando `sessionStorage` (`mfClientMode`).

O cliente envia o cabeçalho `X-Client-Mode: online|offline` nas requisições à API da porta 3000. O backend usa esse valor para decidir se pode acessar os serviços centrais e para determinar a origem dos novos cadastros.

- OFFLINE: `GET /api/pessoa`, `/api/prontuario` e `/api/atendimento` exibem todos os dados do cache SQLite, inclusive `PENDENTE`.
- ONLINE: essas mesmas rotas exibem apenas registros locais `SINCRONIZADO`. Isso **não é consulta direta ao PostgreSQL**: para dados oficiais, a aba Administração usa `/api/central/{entity}`.
- Alterar de OFFLINE para ONLINE não sincroniza automaticamente. Use o botão **Sincronizar agora**.
- Duas sessões (janela normal/anônima) podem selecionar modos diferentes mesmo compartilhando o banco SQLite da VM.

**Limitação acadêmica:** as sessões compartilham o mesmo cache e Outbox no servidor da VM; a alteração isola o modo de exibição e de operação, não cria dispositivos/bancos independentes. Em uma solução offline física, o cliente e SQLite precisariam estar no dispositivo do profissional.

## Como validar

1. Deixe uma sessão no modo OFFLINE e cadastre `Teste Sessão Offline`.
2. Na outra sessão, mantenha ONLINE e clique em Atendimento (atualize a página se necessário): o pendente não deve aparecer.
3. Confirme no pgAdmin da VM que a pessoa não existe no PostgreSQL.
4. Na sessão ONLINE, clique em **Sincronizar agora**; os cadastros passam a aparecer após confirmação. Atualize a lista na outra sessão se necessário.
5. Confira que não houve duplicidade. A sincronização continua exclusivamente manual.

## Instalação

Backup antes de sobrescrever:
`cp ~/medicalfield/applications/attendance-client/server.py ~/medicalfield/backups/server.py.pre-sessoes`
`cp ~/medicalfield/applications/attendance-client/static/app.js ~/medicalfield/backups/app.js.pre-sessoes`

Após extrair o ZIP na pasta `/home/univates`, reinicie **somente**:
`sudo systemctl restart medicalfield-admin`

A atualização não mexe em tabelas nem nos dados existentes.
