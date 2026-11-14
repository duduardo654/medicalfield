"""Mostra os últimos registros de audit.access_log (sem precisar do psql).
   python scripts/ver_logs.py [quantidade]"""
import sys
from pathlib import Path

import psycopg

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

env = {}
for l in (Path(__file__).resolve().parents[1] / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in l and not l.startswith("#"):
        k, v = l.split("=", 1)
        env[k.strip()] = v.strip()

n = int(sys.argv[1]) if len(sys.argv) > 1 else 15
with psycopg.connect(env["DATABASE_URL"]) as conn:
    rows = conn.execute(
        """SELECT to_char(ocorrido_em,'DD/MM HH24:MI:SS'), servico, coalesce(ip_cliente,'-'),
                  coalesce(left(profissional_id::text,8),'-'), metodo, rota, status_code, tempo_ms, origem, coalesce(detalhe,'')
           FROM audit.access_log ORDER BY id DESC LIMIT %s""", (n,)).fetchall()
print(f"{'hora':<15}{'serv':<9}{'ip':<15}{'prof':<10}{'met':<6}{'rota':<22}{'st':<5}{'ms':<9}{'origem':<8}detalhe")
for r in rows:
    print(f"{r[0]:<15}{r[1]:<9}{r[2]:<15}{r[3]:<10}{r[4]:<6}{r[5]:<22}{r[6]:<5}{float(r[7]):<9.2f}{r[8]:<8}{r[9]}")
