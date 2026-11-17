#!/usr/bin/env bash
# Executar APENAS depois de autorização explícita, na VM Linux, manualmente.
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo 'Use sudo'; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OWNER="${SUDO_USER:-univates}"
[[ -f "$ROOT/.env" ]] || { echo 'Configure .env antes'; exit 1; }
declare -A CMDS=(
 [auth]="services/auth-service/.venv/bin/python services/auth-service/run.py"
 [core]="/usr/bin/node services/core-service/src/server.js"
 [business]="services/business-service/bin/business-service-linux-amd64"
 [admin]="services/auth-service/.venv/bin/python applications/attendance-client/server.py"
)
for service in auth core business admin; do
 cmd="${CMDS[$service]}"
 cat > "/etc/systemd/system/medicalfield-$service.service" <<UNIT
[Unit]
Description=MedicalField $service
After=network.target postgresql.service
[Service]
Type=simple
User=$OWNER
WorkingDirectory=$ROOT
Environment=PYTHONUNBUFFERED=1
ExecStart=/bin/bash -c 'exec $cmd'
Restart=on-failure
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
done
systemctl daemon-reload
for service in auth core business admin; do systemctl enable --now "medicalfield-$service"; done
systemctl --no-pager status medicalfield-auth medicalfield-core medicalfield-business medicalfield-admin || true
