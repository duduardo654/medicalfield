// Validação local do JWT emitido pelo auth-service (segredo compartilhado, HS256).
const jwt = require('jsonwebtoken');
const config = require('./config');
const { ApiError } = require('./errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HDR = { 'WWW-Authenticate': 'Bearer' };

function autenticar(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) {
    throw new ApiError(401, 'TOKEN_AUSENTE',
      'Token de autenticação não informado. Use o cabeçalho Authorization: Bearer <token>.', null, HDR);
  }
  let claims;
  try {
    claims = jwt.verify(m[1], config.jwtSecret, { algorithms: ['HS256'], issuer: config.jwtIssuer });
  } catch (e) {
    if (e.name === 'TokenExpiredError') throw new ApiError(401, 'TOKEN_EXPIRADO', 'Token expirado. Faça login novamente.', null, HDR);
    throw new ApiError(401, 'TOKEN_INVALIDO', 'Token inválido.', null, HDR);
  }
  if (!UUID.test(claims.sub || '')) throw new ApiError(401, 'TOKEN_INVALIDO', 'Token inválido.', null, HDR);
  req.user = { id: claims.sub.toLowerCase(), identificacao: claims.identificacao, nome: claims.nome, tipo: claims.tipo, perfil: claims.perfil };
  req.profissionalId = req.user.id; // usado pelo log de acesso
  next();
}

function exigirAdmin(req, res, next) {
  if (req.user.perfil !== 'ADMIN') {
    throw new ApiError(403, 'ACESSO_NEGADO', 'Esta operação é restrita ao administrador.');
  }
  next();
}

module.exports = { autenticar, exigirAdmin, UUID };
