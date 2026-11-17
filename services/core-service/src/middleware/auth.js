// Validação local do JWT emitido pelo auth-service (HS256, segredo compartilhado).
const jwt = require('jsonwebtoken');
const config = require('../config');
const { ApiError } = require('./errors');

function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!header || scheme.toLowerCase() !== 'bearer' || !token) {
    res.set('WWW-Authenticate', 'Bearer');
    return next(new ApiError(401, 'TOKEN_AUSENTE', 'Token de autenticação não informado. Use o cabeçalho Authorization: Bearer <token>.'));
  }
  try {
    const c = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: config.jwtIssuer });
    req.user = { id: c.sub, identificacao: c.identificacao, nome: c.nome, tipo: c.tipo, perfil: c.perfil };
    res.locals.profissionalId = c.sub; // usado pelo log de acesso
    return next();
  } catch (err) {
    res.set('WWW-Authenticate', 'Bearer');
    if (err.name === 'TokenExpiredError') return next(new ApiError(401, 'TOKEN_EXPIRADO', 'Token expirado. Faça login novamente.'));
    return next(new ApiError(401, 'TOKEN_INVALIDO', 'Token inválido.'));
  }
}

function exigirAdmin(req, res, next) {
  if (req.user.perfil !== 'ADMIN') {
    return next(new ApiError(403, 'ACESSO_NEGADO', 'Esta operação é restrita ao administrador.'));
  }
  return next();
}

module.exports = { autenticar, exigirAdmin };
