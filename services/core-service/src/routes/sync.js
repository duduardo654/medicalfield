const express = require('express');
const syncService = require('../sync/syncService');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { validate, syncPushBody } = require('../validation');

const router = express.Router();

// POST /sync/push - recebe a Outbox. Sempre 200 com o resultado de CADA operação.
router.post('/push', asyncHandler(async (req, res) => {
  const { operacoes } = validate(syncPushBody, req.body);
  const resultados = await syncService.push(req.user, operacoes);
  const resumo = {};
  for (const r of resultados) resumo[r.resultado] = (resumo[r.resultado] || 0) + 1;
  res.json({ processadas: resultados.length, resumo, resultados });
}));

// GET /sync/pull?since=<ISO> - registros alterados no servidor depois de `since` (cursor devolvido na resposta).
router.get('/pull', asyncHandler(async (req, res) => {
  let since = '1970-01-01T00:00:00Z';
  if (req.query.since) {
    since = String(req.query.since);
    if (Number.isNaN(new Date(since).getTime())) throw new ApiError(422, 'DADOS_INVALIDOS', 'since deve ser uma data ISO-8601.');
  }
  res.json(await syncService.pull(since));
}));

module.exports = router;
