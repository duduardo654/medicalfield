const { z } = require('zod');
const { ApiError } = require('../middleware/errors');

const uuidSchema = z.string().uuid();

function parseUuid(valor, nome = 'id') {
  if (!uuidSchema.safeParse(valor).success) {
    throw new ApiError(422, 'ID_INVALIDO', `O parâmetro ${nome} deve ser um UUID válido.`);
  }
  return valor;
}

function paginacao(req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return { limit, offset };
}

module.exports = { parseUuid, paginacao };
