"""Padrão Repository: isola o SQL do restante da aplicação."""
from .db import get_pool


class ProfissionalRepository:
    _COLS = "id, tipo_registro, identificacao, nome, email, perfil, senha_hash, ativo, ultimo_login"

    def get_by_identificacao(self, identificacao: str) -> dict | None:
        with get_pool().connection() as conn:
            return conn.execute(
                f"SELECT {self._COLS} FROM auth.profissional WHERE identificacao = %s", (identificacao,)
            ).fetchone()

    def get_by_id(self, prof_id: str) -> dict | None:
        with get_pool().connection() as conn:
            return conn.execute(
                f"SELECT {self._COLS} FROM auth.profissional WHERE id = %s", (prof_id,)
            ).fetchone()

    def registrar_login(self, prof_id) -> None:
        with get_pool().connection() as conn:
            conn.execute("UPDATE auth.profissional SET ultimo_login = now() WHERE id = %s", (prof_id,))
