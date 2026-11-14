"""Hash de senha (bcrypt) e emissão/validação de JWT (HS256)."""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings

# Hash "fantasma" usado quando o usuário não existe, para manter o tempo de resposta
# parecido e não revelar (por timing) se a identificação existe.
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt(12)).decode()


def verify_password(plain: str, hashed: str | None) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), (hashed or _DUMMY_HASH).encode()) and hashed is not None
    except ValueError:
        return False


def create_token(prof: dict) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.jwt_expires_minutes)
    claims = {
        "iss": settings.jwt_issuer,
        "sub": str(prof["id"]),
        "identificacao": prof["identificacao"],
        "nome": prof["nome"],
        "tipo": prof["tipo_registro"],
        "perfil": prof["perfil"],
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": exp,
    }
    token = jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, settings.jwt_expires_minutes * 60


def decode_token(token: str) -> dict:
    """Levanta jwt.ExpiredSignatureError / jwt.InvalidTokenError."""
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        issuer=settings.jwt_issuer,
        options={"require": ["exp", "iat", "sub", "iss"]},
    )
