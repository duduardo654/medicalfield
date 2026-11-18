# Implantação e operação — MedicalField

Ubuntu 26.04 LTS, Python 3.14, Node 22, Go 1.26, PostgreSQL 18, VM Univates. A instalação que o aluno já validou está em `~/medicalfield`. Os passos de instalação são para referência; NÃO repita a criação do banco ou o setup em uma instalação existente. Não execute `--reset`.

## Instalação nova

```bash
sudo apt update
sudo apt install -y nodejs npm golang-go python3-venv python3-pip unzip postgresql
sudo -u postgres createuser --pwprompt medicalfield
sudo -u postgres createdb -O medicalfield medicalfield
cd ~/medicalfield
cp .env.example .env
chmod 600 .env
nano .env
```
Configure DATABASE_URL apontando para PostgreSQL local, JWT_SECRET forte e compartilhado, AUTH_URL/CORE_URL/BUSINESS_URL em localhost (portas 8001–8003), APP_PORT=3000; SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, remetente e usuário autorizados e senha de aplicativo. Não compartilhe nem versiona a senha. Use uma credencial SMTP autorizada pela instituição.

```bash
python3 -m venv services/auth-service/.venv
services/auth-service/.venv/bin/pip install -r services/auth-service/requirements.txt
cd services/core-service
npm ci
# Caso a atualização final ainda não esteja no lockfile:
npm install --save-exact zod@4.6.7
cd ~/medicalfield
services/auth-service/.venv/bin/python scripts/setup.py
cd services/business-service
go build -o bin/business-service-linux-amd64 .
cd ~/medicalfield
sudo bash scripts/instalar-systemd.sh
sudo systemctl disable medicalfield-auth medicalfield-core medicalfield-business medicalfield-admin
```

## Operação da instalação existente

```bash
sudo systemctl start medicalfield-auth medicalfield-core medicalfield-business medicalfield-admin
systemctl is-active medicalfield-auth medicalfield-core medicalfield-business medicalfield-admin
sudo ss -ltnp | grep -E ':(3000|8001|8002|8003)\b'
```
As portas devem aparecer como `127.0.0.1`. O script systemd pode habilitar os serviços no boot; `disable` desabilita o boot automático sem parar os serviços em execução.

Acesso Windows (uma sessão de túnel, manter aberta):
```powershell
ssh -N -L 3000:127.0.0.1:3000 -L 8001:127.0.0.1:8001 -L 8002:127.0.0.1:8002 -L 8003:127.0.0.1:8003 univates@177.44.248.66
```
Acesse localhost:3000 e os Swaggers em localhost:8001/docs, localhost:8002/docs, localhost:8003/docs. pgAdmin: banco medicalfield, host remoto via túnel 127.0.0.1:5432, usuário medicalfield; SSH host 177.44.248.66, usuário univates. Não abrir portas no firewall.

Parar: `sudo systemctl stop medicalfield-admin medicalfield-business medicalfield-core medicalfield-auth`.
Logs: `sudo journalctl -u medicalfield-core -n 50 --no-pager` (substituir a unidade para os outros serviços). Auditoria em `audit.access_log`.

SQLite hospedado com a GUI: `applications/attendance-client/data/medicalfield.sqlite3`. Usar apenas em modo simulado, sem confundir com tolerância à perda física de conectividade Windows–VM. Para demonstração, consultar com `sqlite3 -readonly` e modo `.headers on` / `.mode column`. Dados e credenciais reais jamais devem ser utilizados.
