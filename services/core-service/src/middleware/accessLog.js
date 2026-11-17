// Middleware de auditoria: registra TODA requisição HTTP (inclusive 401/404/500).
// Campos: data/hora, IP, ID do profissional, método, rota, status e tempo (ms).
// Destinos: arquivo logs/core-service.log (JSON-lines) e tabela audit.access_log.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { pool } = require('../db');

fs.mkdirSync(config.logDir, { recursive: true });
const fileStream = fs.createWriteStream(path.join(config.logDir, 'core-service.log'), { flags: 'a', encoding: 'utf8' });

const INSERT = `INSERT INTO audit.access_log
  (servico, ocorrido_em, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, origem, detalhe)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ONLINE',$9)`;

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = fwd ? String(fwd).split(',')[0].trim() : req.socket.remoteAddress || 'desconhecido';
  return ip.replace(/^::ffff:/, '');
}

function accessLog(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const tempoMs = Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100;
    const entry = {
      ts: new Date(), servico: config.serviceName, ip: clientIp(req),
      profissional_id: res.locals.profissionalId || null, metodo: req.method,
      rota: req.originalUrl.split('?')[0], status: res.statusCode, tempo_ms: tempoMs,
      detalhe: res.locals.logDetalhe || null,
    };
    const line = JSON.stringify({ ...entry, ts: entry.ts.toISOString() });
    fileStream.write(line + '\n');
    console.log(line);
    // gravação assíncrona: o log nunca atrasa nem derruba a resposta
    pool.query(INSERT, [entry.servico, entry.ts, entry.ip, entry.profissional_id, entry.metodo, entry.rota, entry.status, entry.tempo_ms, entry.detalhe])
      .catch((e) => console.error('[accessLog] falha ao gravar no banco:', e.message));
  });
  next();
}

module.exports = { accessLog, clientIp };
