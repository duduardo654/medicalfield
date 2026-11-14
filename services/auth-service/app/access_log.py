"""Middleware de auditoria: registra TODA requisição HTTP.

Campos: data/hora, IP, ID do profissional, método, rota, status e tempo (ms).
Destinos: (1) arquivo JSON-lines em logs/auth-service.log e
          (2) tabela audit.access_log no PostgreSQL (gravação assíncrona, sem atrasar a resposta).
"""
import json
import logging
import queue
import threading
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from .db import get_pool

_file_logger = logging.getLogger("access")
_file_logger.setLevel(logging.INFO)
_file_logger.propagate = False
if not _file_logger.handlers:
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    h = RotatingFileHandler(settings.log_dir / "auth-service.log", maxBytes=5_000_000, backupCount=3, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(message)s"))
    _file_logger.addHandler(h)
    _file_logger.addHandler(logging.StreamHandler())

_queue: "queue.Queue[tuple | None]" = queue.Queue(maxsize=10000)
_INSERT = """INSERT INTO audit.access_log
  (servico, ocorrido_em, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, origem, detalhe)
  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'ONLINE',%s)"""


def _writer() -> None:
    while True:
        item = _queue.get()
        if item is None:
            return
        try:
            with get_pool().connection() as conn:
                conn.execute(_INSERT, item)
        except Exception as exc:  # o log nunca pode derrubar o serviço
            _file_logger.error(json.dumps({"erro_ao_gravar_log_no_banco": str(exc)}))


_thread = threading.Thread(target=_writer, name="access-log-writer", daemon=True)
_thread.start()


def shutdown_log_writer() -> None:
    _queue.put(None)
    _thread.join(timeout=3)


def _client_ip(request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "desconhecido"


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:  # erro inesperado -> 500 padronizado
            status = 500
            request.state.log_detalhe = "ERRO_INTERNO"
            response = JSONResponse(
                {"erro": {"codigo": "ERRO_INTERNO", "mensagem": "Erro interno do servidor."}}, status_code=500
            )
        elapsed = round((time.perf_counter() - start) * 1000, 2)
        prof_id = getattr(request.state, "profissional_id", None)
        detalhe = getattr(request.state, "log_detalhe", None)
        now = datetime.now(timezone.utc)
        ip = _client_ip(request)
        _file_logger.info(
            json.dumps(
                {
                    "ts": now.isoformat(), "servico": settings.service_name, "ip": ip,
                    "profissional_id": prof_id, "metodo": request.method, "rota": request.url.path,
                    "status": status, "tempo_ms": elapsed, "detalhe": detalhe,
                },
                ensure_ascii=False,
            )
        )
        try:
            _queue.put_nowait((settings.service_name, now, ip, prof_id, request.method, request.url.path, status, elapsed, detalhe))
        except queue.Full:
            pass
        return response
