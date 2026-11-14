from fastapi import APIRouter, Depends, Request

from .deps import autenticar
from .errors import ApiError
from .repositories import ProfissionalRepository
from .schemas import ErroResponse, LoginRequest, LoginResponse, ProfissionalOut
from .security import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["Autenticação"])
repo = ProfissionalRepository()


def _out(p: dict) -> ProfissionalOut:
    return ProfissionalOut(id=str(p["id"]), nome=p["nome"], identificacao=p["identificacao"],
                           tipo_registro=p["tipo_registro"], perfil=p["perfil"])


@router.post("/login", response_model=LoginResponse, summary="Autentica o profissional e retorna um JWT",
             responses={401: {"model": ErroResponse}, 403: {"model": ErroResponse}})
def login(body: LoginRequest, request: Request):
    ident = body.identificacao.strip().upper()
    prof = repo.get_by_identificacao(ident)
    ok = verify_password(body.senha, prof["senha_hash"] if prof else None)
    if not prof or not ok:
        raise ApiError(401, "CREDENCIAIS_INVALIDAS", "Identificação profissional ou senha inválida.")
    if not prof["ativo"]:
        raise ApiError(403, "USUARIO_INATIVO", "Usuário desativado. Procure o administrador.")
    repo.registrar_login(prof["id"])
    request.state.profissional_id = str(prof["id"])
    token, expires_in = create_token(prof)
    return LoginResponse(access_token=token, expires_in=expires_in, profissional=_out(prof))


@router.get("/me", response_model=ProfissionalOut, summary="Dados do profissional autenticado",
            responses={401: {"model": ErroResponse}})
def me(claims: dict = Depends(autenticar)):
    prof = repo.get_by_id(claims["sub"])
    if not prof or not prof["ativo"]:
        raise ApiError(401, "USUARIO_INVALIDO", "Usuário do token não existe ou foi desativado.")
    return _out(prof)


@router.get("/validate", summary="Valida o token e devolve suas claims",
            responses={401: {"model": ErroResponse}})
def validate(claims: dict = Depends(autenticar)):
    prof = repo.get_by_id(claims["sub"])
    if not prof or not prof["ativo"]:
        raise ApiError(401, "USUARIO_INVALIDO", "Usuário do token não existe ou foi desativado.")
    return {"valido": True, "claims": {k: claims[k] for k in ("sub", "identificacao", "nome", "tipo", "perfil", "iat", "exp")}}
