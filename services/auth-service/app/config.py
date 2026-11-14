"""Configuração do auth-service (lida do .env na raiz do projeto)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]  # .../medicalfield
load_dotenv(ROOT / ".env")


def _require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value or value == "CHANGE_ME":
        raise RuntimeError(f"Variável de ambiente {name} não configurada (rode scripts/setup-env.sh).")
    return value


class Settings:
    service_name = "auth"
    port = int(os.environ.get("AUTH_PORT", "8001"))
    database_url = _require("DATABASE_URL")
    jwt_secret = _require("JWT_SECRET")
    jwt_algorithm = "HS256"
    jwt_issuer = "medicalfield-auth"
    jwt_expires_minutes = int(os.environ.get("JWT_EXPIRES_MINUTES", "480"))
    log_dir = (ROOT / os.environ.get("LOG_DIR", "./logs")).resolve()
    enable_docs = os.environ.get("ENABLE_DOCS", "true").lower() == "true"


settings = Settings()
