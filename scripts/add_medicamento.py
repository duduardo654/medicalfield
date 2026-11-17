"""Insere um medicamento direto no PostgreSQL (roteiro de testes, item 9) - sem precisar do psql.
  python scripts/add_medicamento.py "Ibuprofeno" "ibuprofeno" --apresentacao "comprimido 600 mg" --via VO --dose-max 600 --unidade mg
Use o Python do venv:  services\\auth-service\\.venv\\Scripts\\python.exe scripts\\add_medicamento.py ...
"""
import argparse
import sys
from pathlib import Path

import psycopg

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("nome")
ap.add_argument("principio_ativo")
ap.add_argument("--apresentacao")
ap.add_argument("--via")
ap.add_argument("--dose-max", type=float)
ap.add_argument("--unidade")
ap.add_argument("--contraindicacoes")
ap.add_argument("--observacao")
a = ap.parse_args()

env = {}
for l in (Path(__file__).resolve().parents[1] / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in l and not l.startswith("#"):
        k, v = l.split("=", 1)
        env[k.strip()] = v.strip()

with psycopg.connect(env["DATABASE_URL"]) as conn:
    row = conn.execute(
        """INSERT INTO business.medicamento (nome, principio_ativo, apresentacao, via_administracao, dose_max_unitaria,
                                             unidade_dose, contraindicacoes, observacao)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, updated_at""",
        (a.nome, a.principio_ativo, a.apresentacao, a.via, a.dose_max, a.unidade, a.contraindicacoes, a.observacao)).fetchone()
print(f"Medicamento '{a.nome}' inserido: id={row[0]}  updated_at={row[1]}")
