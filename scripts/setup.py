"""Configuração do banco, multiplataforma (Windows/Linux/Mac) - NÃO precisa do psql.

  python scripts/setup.py            -> cria o .env (se não existir) e aplica migrations + seeds
  python scripts/setup.py --reset    -> APAGA os esquemas do MedicalField e recria tudo

Deve ser executado com o Python do venv (que já tem o psycopg instalado).
"""
import getpass
import secrets
import sys
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import psycopg

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"
EXAMPLE = ROOT / ".env.example"


def perguntar(texto: str, padrao: str = "", segredo: bool = False) -> str:
    rotulo = f"{texto} [{padrao}]: " if padrao else f"{texto}: "
    valor = getpass.getpass(rotulo) if segredo else input(rotulo)
    return valor.strip() or padrao


def ler_env() -> dict:
    dados = {}
    for linha in ENV.read_text(encoding="utf-8").splitlines():
        if linha.strip() and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            dados[k.strip()] = v.strip()
    return dados


def criar_env() -> None:
    print("\n=== Configuração do PostgreSQL (o banco 'medicalfield' já deve existir) ===")
    print("Pressione Enter para aceitar o valor entre colchetes.")
    host = perguntar("Host", "localhost")
    porta = perguntar("Porta", "5432")
    banco = perguntar("Nome do banco", "medicalfield")
    usuario = perguntar("Usuário", "medicalfield")
    senha = perguntar(f"Senha do usuário '{usuario}'", segredo=True)
    url = f"postgresql://{quote(usuario, safe='')}:{quote(senha, safe='')}@{host}:{porta}/{banco}"
    try:
        with psycopg.connect(url, connect_timeout=5) as conn:
            conn.execute("SELECT 1")
    except Exception as exc:
        print(f"\n[ERRO] Não consegui conectar ao PostgreSQL: {exc}")
        print("Verifique host, porta, usuário e senha e rode novamente.")
        sys.exit(1)
    texto = EXAMPLE.read_text(encoding="utf-8")
    texto = texto.replace("postgresql://medicalfield:CHANGE_ME@localhost:5432/medicalfield", url)
    texto = texto.replace("JWT_SECRET=CHANGE_ME", f"JWT_SECRET={secrets.token_hex(32)}")
    ENV.write_text(texto, encoding="utf-8")
    print("\n.env criado (com JWT_SECRET aleatório).")


def aplicar_sql(conn, pasta: str) -> None:
    for arq in sorted((ROOT / "database" / pasta).glob("*.sql")):
        print(f">> {pasta[:-1]}: {arq.name}")
        conn.execute(arq.read_text(encoding="utf-8"))  # utf-8 explícito (acentos no Windows)
        conn.commit()


def main() -> None:
    if not ENV.exists():
        criar_env()
    url = ler_env().get("DATABASE_URL", "")
    alvo = urlparse(url)
    print(f"Banco: {unquote(alvo.username or '')}@{alvo.hostname}:{alvo.port}{alvo.path}")
    try:
        conn = psycopg.connect(url, connect_timeout=5)
    except Exception as exc:
        print(f"\n[ERRO] Falha ao conectar usando o .env: {exc}")
        print("Se a senha mudou, apague o arquivo .env e rode de novo.")
        sys.exit(1)
    with conn:
        if "--reset" in sys.argv:
            print(">> Resetando esquemas (auth, core, business, audit)...")
            conn.execute("DROP SCHEMA IF EXISTS auth, core, business, audit CASCADE")
            conn.commit()
        try:
            aplicar_sql(conn, "migrations")
            aplicar_sql(conn, "seeds")
        except psycopg.errors.InsufficientPrivilege as exc:
            print(f"\n[ERRO] Sem permissão para criar objetos: {exc}")
            print("O usuário precisa ser DONO do banco. Opção: apague o .env e rode de novo informando o usuário 'postgres'.")
            sys.exit(1)
    print(">> Banco pronto.")


if __name__ == "__main__":
    main()
