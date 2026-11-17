// Formato de erro único em todos os serviços: {"erro": {"codigo", "mensagem", "detalhes"?}}
class ApiError extends Error {
  constructor(status, codigo, mensagem, detalhes, headers) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
    this.headers = headers || {};
  }
}

function corpo(codigo, mensagem, detalhes) {
  const erro = { codigo, mensagem };
  if (detalhes && detalhes.length) erro.detalhes = detalhes;
  return { erro };
}

function naoEncontrado(req, res) {
  req.logDetalhe = 'ROTA_NAO_ENCONTRADA';
  res.status(404).json(corpo('ROTA_NAO_ENCONTRADA', `Rota ${req.method} ${req.path} não existe.`));
}

// eslint-disable-next-line no-unused-vars
function tratadorDeErros(err, req, res, next) {
  if (err instanceof ApiError) {
    req.logDetalhe = err.codigo;
    return res.status(err.status).set(err.headers).json(corpo(err.codigo, err.message, err.detalhes));
  }
  if (err.type === 'entity.parse.failed') {
    req.logDetalhe = 'JSON_INVALIDO';
    return res.status(400).json(corpo('JSON_INVALIDO', 'O corpo da requisição não é um JSON válido.'));
  }
  if (err.type === 'entity.too.large') {
    req.logDetalhe = 'CORPO_MUITO_GRANDE';
    return res.status(413).json(corpo('CORPO_MUITO_GRANDE', 'Corpo da requisição excede o limite.'));
  }
  if (err.code === '23503') { // violação de FK (ex.: apagar pessoa com prontuário)
    req.logDetalhe = 'POSSUI_DEPENDENCIAS';
    return res.status(409).json(corpo('POSSUI_DEPENDENCIAS', 'Operação bloqueada: existem registros dependentes.'));
  }
  console.error('[erro interno]', err);
  req.logDetalhe = 'ERRO_INTERNO';
  return res.status(500).json(corpo('ERRO_INTERNO', 'Erro interno do servidor.'));
}

module.exports = { ApiError, corpo, naoEncontrado, tratadorDeErros };
