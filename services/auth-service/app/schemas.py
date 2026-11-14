from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    identificacao: str = Field(min_length=3, max_length=60, examples=["CRM-RS-12345"],
                               description="CRM, COREN ou ID de Socorrista")
    senha: str = Field(min_length=1, max_length=200, examples=["medico123"])


class ProfissionalOut(BaseModel):
    id: str
    nome: str
    identificacao: str
    tipo_registro: str
    perfil: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int = Field(description="Validade do token em segundos")
    profissional: ProfissionalOut


class ErroResponse(BaseModel):
    erro: dict
