"""Dependência de autenticação: valida o Bearer token em toda rota protegida."""
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .errors import ApiError
from .security import decode_token

_bearer = HTTPBearer(auto_error=False, description="Token JWT obtido em POST /auth/login")
_HDR = {"WWW-Authenticate": "Bearer"}


def autenticar(request: Request, cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if cred is None:
        raise ApiError(401, "TOKEN_AUSENTE", "Token de autenticação não informado. Use o cabeçalho Authorization: Bearer <token>.", _HDR)
    try:
        claims = decode_token(cred.credentials)
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "TOKEN_EXPIRADO", "Token expirado. Faça login novamente.", _HDR)
    except jwt.InvalidTokenError:
        raise ApiError(401, "TOKEN_INVALIDO", "Token inválido.", _HDR)
    request.state.profissional_id = claims["sub"]
    return claims
