const express = require('express');
const logRepo = require('../repositories/logRepository');
const { asyncHandler } = require('../middleware/errors');
const { exigirAdmin } = require('../middleware/auth');
const { clientIp } = require('../middleware/accessLog');
const { validate, logBody } = require('../validation');

const router = express.Router();

// POST /log - o cliente envia os logs de acesso gerados OFFLINE (idempotente por log_id).
router.post('/', asyncHandler(async (req, res) => {
  const { registros } = validate(logBody, req.body);
  const gravados = await logRepo.insertOffline(registros, { profissionalId: req.user.id, ip: clientIp(req) });
  res.status(201).json({ recebidos: registros.length, gravados, duplicados: registros.length - gravados });
}));

// GET /log - consulta de auditoria (somente ADMIN). Filtros: servico, origem, limit.
router.get('/', exigirAdmin, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
  res.json(await logRepo.list({
    servico: req.query.servico ? String(req.query.servico) : undefined,
    origem: req.query.origem ? String(req.query.origem).toUpperCase() : undefined,
    limit,
  }));
}));

module.exports = router;
