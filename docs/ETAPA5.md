# Etapa 5 — interface integrada (Windows + VM Linux)

- **Único acesso web**: `http://localhost:3000` com login único para atendimento e administração (perfil ADMIN).
- **Serviços independentes** permanecem internamente nas portas 8001, 8002 e 8003. O navegador acessa apenas o gateway web 3000, que encaminha login, dados centrais, medicamentos e PDF com autenticação.
- **SQLite** fica no Windows do socorrista. **PostgreSQL** armazena somente dados sincronizados.
- ADMIN: após login, clique em **Administração · PostgreSQL** para consultar, editar ou excluir dados oficiais.
- Perfil profissional: atendimento SQLite e sincronização apenas, sem painel administrativo.
- **OFFLINE**: dados de atendimento são gravados localmente; nunca são enviados ao servidor até reconexão.
- **E-mail real**: configure `SMTP_PASS` no `.env` local. O Mailpit não é necessário. Para Gmail/Google Workspace é preciso SMTP permitido e credencial específica do serviço (senha de app, se disponível). Não use senha comum.
- **Importante**: alterações CRUD feitas diretamente no PostgreSQL não atualizam automaticamente o cache SQLite. Use Sincronizar para recebê-las; exclusões remotas não possuem propagação por tombstones nesta versão.

## Windows (desenvolvimento)
Feche antes as janelas da etapa 4 para liberar a porta 3000. Extraia esta versão, preserve seu `.env` e banco SQLite se for migrar de uma etapa anterior. Rode `iniciar-tudo.bat`. Acesse somente `http://localhost:3000`.

## VM Linux (após autorização do usuário)
Os scripts `scripts/iniciar-linux.sh` e `scripts/instalar-systemd.sh` agora usam a aplicação integrada na porta 3000. Não foram executados remotamente. **Não copie o banco SQLite local à VM** se a intenção for demonstrar dispositivos distintos. Para acesso da VM a partir do Windows prefira túnel SSH: `ssh -L 3000:127.0.0.1:3000 univates@177.44.248.66`, observando que se você abrir a interface da VM, o SQLite também residirá na VM. Para manter SQLite no Windows, execute o servidor web no Windows e conecte suas APIs ao Linux via túnel nas portas 8001–8003.

## Atualização de `.env` anterior

Se a etapa 4 já criou um `.env`, o inicializador **não o substitui**. Edite manualmente apenas estas linhas, preservando `DATABASE_URL` e `JWT_SECRET` anteriores:

```env
APP_PORT=3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=eduardo.secco@universo.univates.br
SMTP_FROM=eduardo.secco@universo.univates.br
SMTP_PASS=
```

Preencha `SMTP_PASS` no seu próprio computador com uma credencial SMTP autorizada para essa conta. O endereço fornecido é institucional, então o envio por `smtp.gmail.com` depende das políticas do Google Workspace da Univates; não é possível garantir que senhas de app estejam habilitadas. **Não compartilhe essa credencial comigo nem em prints**. Se sua conta não permitir senha de app, será necessário um método autorizado pela organização.

As portas 8001–8003 continuam funcionando como serviços técnicos independentes, conforme a exigência acadêmica de múltiplas APIs. O endereço de uso é apenas 3000.
