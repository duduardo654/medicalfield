from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .access_log import AccessLogMiddleware, shutdown_log_writer
from .config import settings
from .db import close_pool, get_pool
from .errors import register_error_handlers
from .routes import router

DESCRICAO = """
Microsserviço de **autenticação** do MedicalField (Python / FastAPI).

* Login por CRM, COREN ou ID de Socorrista + senha (bcrypt).
* Emite JWT (HS256) assinado com segredo compartilhado; os demais serviços validam o token **localmente**.
* Todas as rotas exigem `Authorization: Bearer <token>`, exceto `POST /auth/login`.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_pool()
    yield
    shutdown_log_writer()
    close_pool()


app = FastAPI(
    title="MedicalField - Auth Service", version="1.0.0", description=DESCRICAO, lifespan=lifespan,
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)
register_error_handlers(app)
app.add_middleware(AccessLogMiddleware)          # cadeia: CORS -> log -> rotas/autenticação
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
