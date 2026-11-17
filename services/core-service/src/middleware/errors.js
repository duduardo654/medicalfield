// Formato de erro único: { "erro": { "codigo", "mensagem", "detalhes"? } }
class ApiError extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.mensagem = mensagem;
    this.detalhes = detalhes;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res, next) {
  next(new ApiError(404, 'ROTA_NAO_ENCONTRADA', `Rota ${req.method} ${req.path} não existe.`));
}

// Converte erros do PostgreSQL / body-parser / ApiError na resposta padronizada.
function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err.type === 'entity.parse.failed') return new ApiError(400, 'JSON_INVALIDO', 'O corpo da requisição não é um JSON válido.');
  if (err.type === 'entity.too.large') return new ApiError(413, 'CORPO_MUITO_GRANDE', 'Corpo da requisição excede o limite.');
  switch (err.code) {
    case '23505': return new ApiError(409, 'REGISTRO_DUPLICADO', 'Já existe um registro com esses dados únicos.', [{ problema: err.detail }]);
    case '23503': // foreign_key_violation
    case '23001': // restrict_violation (usado por versões recentes do PostgreSQL em ON DELETE RESTRICT)
    case '23000': return new ApiError(409, 'REFERENCIA_INVALIDA', 'Operação viola um relacionamento (registro inexistente ou em uso).', [{ problema: err.detail }]);
    case '23514': return new ApiError(422, 'DADOS_INVALIDOS', 'Algum valor está fora dos limites permitidos.', [{ problema: err.detail || err.constraint }]);
    case '22P02': case '22007': case '22008': return new ApiError(422, 'DADOS_INVALIDOS', 'Formato de dado inválido (UUID, data ou número).');
    default: return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let apiErr = toApiError(err);
  if (!apiErr) {
    console.error('[ERRO INTERNO]', err);
    apiErr = new ApiError(500, 'ERRO_INTERNO', 'Erro interno do servidor.');
  }
  res.locals.logDetalhe = apiErr.codigo;
  const erro = { codigo: apiErr.codigo, mensagem: apiErr.mensagem };
  if (apiErr.detalhes) erro.detalhes = apiErr.detalhes;
  res.status(apiErr.status).json({ erro });
}

module.exports = { ApiError, asyncHandler, notFound, errorHandler, toApiError };
