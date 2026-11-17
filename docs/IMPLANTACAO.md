> **Atualização da Etapa 5:** consulte primeiro [`ETAPA5.md`](ETAPA5.md). O sistema web integrado agora usa somente a porta **3000**, o Mailpit foi removido e o serviço web usa `applications/attendance-client/server.py`. As referências antigas a 3001 e Mailpit abaixo descrevem a etapa 4 e não devem ser seguidas nesta versão.

# Execução no Windows e implantação na VM Linux

## Topologia

- **Windows (local)**: `http://localhost:3001` = cliente de atendimento + arquivo SQLite local (`applications/attendance-client/data/medicalfield.sqlite3`). A desconexão simulada bloqueia as chamadas remotas do cliente, mas o SQLite continua funcionando.
- **VM Linux 177.44.248.66**: PostgreSQL e serviços auth (8001), core (8002), business (8003) e portal administrativo (3000).
- Para a demonstração com serviços na VM, ajuste **na cópia Windows** do `.env`: `CORE_URL=http://177.44.248.66:8002` e `AUTH_URL=http://177.44.248.66:8001`, `BUSINESS_URL=http://177.44.248.66:8003`. **A interface cliente utiliza o hostname da página para login e PDF**: para acesso remoto direto, abra o cliente local em `http://localhost:3001`, e configure o navegador/cliente conforme a seção seguinte.

### Acesso remoto a partir do cliente

A aplicação cliente aceita configurações de URLs pela rota `/api/config`, carregadas dinamicamente no navegador. Configure no `.env` **da máquina Windows**:

```env
AUTH_URL=http://177.44.248.66:8001
CORE_URL=http://177.44.248.66:8002
BUSINESS_URL=http://177.44.248.66:8003
```

A VM deve disponibilizar as portas necessárias (firewall da Univates pode restringir); não presuma que estão abertas. **Recomendação para laboratório:** use túnel SSH no Windows, evitando expor os serviços diretamente:

```powershell
ssh -L 8001:127.0.0.1:8001 -L 8002:127.0.0.1:8002 -L 8003:127.0.0.1:8003 -L 3000:127.0.0.1:3000 univates@177.44.248.66
```

Mantenha essa sessão aberta. No `.env` Windows, mantenha `AUTH_URL`, `CORE_URL`, `BUSINESS_URL` como `http://localhost:<porta>`. Não inicialize os três microsserviços localmente enquanto estiver usando o túnel (conflito de portas); execute apenas `python applications/attendance-client/server.py` com o venv criado. Abra `http://localhost:3001` (cliente) e `http://localhost:3000` (portal da VM).

## Etapas da VM (instruções, **não executadas**)

Acessar somente após autorização:

```powershell
ssh univates@177.44.248.66
```

Na VM Ubuntu/Debian, verificar antes: `python3 --version`, `node --version`, `psql --version`, `uname -m` (o binário Go fornecido é Linux x86_64). Instalar dependências conforme permissões locais:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm postgresql
# Os arquivos devem estar no diretório HOME/univates/medicalfield (scp -r a partir do Windows).
cd ~/medicalfield
python3 -m venv services/auth-service/.venv
services/auth-service/.venv/bin/pip install -r services/auth-service/requirements.txt
(cd services/core-service && npm ci)
```

A criação do banco PostgreSQL depende da configuração existente. Exemplo **somente se um banco novo for necessário**:

```bash
sudo -u postgres psql -c "CREATE USER medicalfield WITH PASSWORD 'TROQUE_POR_UMA_SENHA_FORTE';"
sudo -u postgres createdb -O medicalfield medicalfield
```

Configure `.env` na VM com `DATABASE_URL`, `JWT_SECRET`, URLs locais, SMTP e `LOG_DIR`; use o mesmo `JWT_SECRET` em todos os serviços. Em um PostgreSQL existente, não recrie usuários nem banco. Após configurar:

```bash
services/auth-service/.venv/bin/python scripts/setup.py
./scripts/iniciar-linux.sh
```

A URL do projeto em execução na VM é `http://177.44.248.66:3000` **somente se a porta for acessível**. Para habilitar o reinício automático (opcional), após validar manualmente:

```bash
sudo ./scripts/instalar-systemd.sh
sudo systemctl status medicalfield-auth medicalfield-core medicalfield-business medicalfield-admin
sudo journalctl -u medicalfield-core -n 50 --no-pager
```

Não use `--reset` no banco com dados importantes. Nunca compartilhe o `.env`.

## Gmail / Google Workspace real

Por padrão o sistema envia ao **Mailpit**, que captura mensagens mas **não entrega ao Gmail**. O endereço `eduardo.secco@universo.univates.br` está pré-preenchido como destinatário nas interfaces. Para entrega real, configure `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_FROM=eduardo.secco@universo.univates.br`, `SMTP_USER` com essa conta e `SMTP_PASS` com uma senha de app (se a política da conta Google Workspace permitir). Uma senha comum de login não deve ser colocada no projeto. O SMTP do serviço Go usa STARTTLS e autenticação; a funcionalidade depende das permissões do provedor e da rede. **Não presuma que o e-mail foi enviado** até obter confirmação do SMTP e verificar a caixa do destinatário.

## Testes

- Testes sem banco central: `python -m unittest discover -s applications/attendance-client -p 'test_*.py' -v` usando o Python do venv.
- Testes backend: `cd services/core-service && npm test`, e `cd services/business-service && go test ./...` (os testes com banco exigem configuração/testes externos; consulte seus requisitos).
- Demonstração: autenticar cliente e portal, sincronizar dados iniciais, alternar OFFLINE, cadastrar pessoa → prontuário → atendimento, verificar que portal **não** exibe os registros, alternar ONLINE, conferir ambos, gerar PDF e enviar.
