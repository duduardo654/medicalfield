#!/usr/bin/env bash
# Inicialização local Linux (SEM instalar serviços systemd).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PY="$ROOT/services/auth-service/.venv/bin/python"
if [[ ! -x "$PY" ]]; then echo 'Crie o venv conforme docs/IMPLANTACAO.md'; exit 1; fi
if [[ ! -f .env ]]; then echo '.env não configurado'; exit 1; fi
mkdir -p logs
(cd services/auth-service && "$PY" run.py) & p1=$!
(cd services/core-service && node src/server.js) & p2=$!
(cd services/business-service && ./bin/business-service-linux-amd64) & p3=$!
(cd applications/attendance-client && "$PY" server.py) & p4=$!
echo "Serviços: Auth=$p1 Core=$p2 Business=$p3 Web=$p4"
trap 'kill "$p1" "$p2" "$p3" "$p4" 2>/dev/null || true' EXIT INT TERM
wait -n "$p1" "$p2" "$p3" "$p4"
