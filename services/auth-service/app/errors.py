"""Formato de erro único: {"erro": {"codigo": "...", "mensagem": "..."}}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, codigo: str, mensagem: str, headers: dict | None = None):
        self.status = status
        self.codigo = codigo
        self.mensagem = mensagem
        self.headers = headers or {}


def _body(codigo: str, mensagem: str, detalhes=None) -> dict:
    erro = {"codigo": codigo, "mensagem": mensagem}
    if detalhes:
        erro["detalhes"] = detalhes
    return {"erro": erro}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        request.state.log_detalhe = exc.codigo
        return JSONResponse(_body(exc.codigo, exc.mensagem), status_code=exc.status, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        detalhes = [
            {"campo": ".".join(str(p) for p in e["loc"] if p != "body"), "problema": e["msg"]}
            for e in exc.errors()
        ]
        request.state.log_detalhe = "VALIDACAO"
        return JSONResponse(
            _body("DADOS_INVALIDOS", "Os dados enviados são inválidos.", detalhes), status_code=422
        )
