// Middleware de auditoria: registra TODA requisição HTTP.
// Campos: data/hora, IP, ID do profissional, método, rota, status e tempo (ms).
// Destinos: logs/core-service.log (JSON-lines) e tabela audit.access_log (assíncrono).
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getPool } = require('./db');

fs.mkdirSync(config.logDir, { recursive: true });
const arquivo = fs.createWriteStream(path.join(config.logDir, 'core-service.log'), { flags: 'a' });

function ipDoCliente(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket.remoteAddress || 'desconhecido').replace(/^::ffff:/, '');
}

function accessLog(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - inicio) / 1e4) / 100;
    const rota = req.originalUrl.split('?')[0];
    const registro = {
      ts: new Date().toISOString(), servico: config.servico, ip: ipDoCliente(req),
      profissional_id: req.profissionalId || null, metodo: req.method, rota,
      status: res.statusCode, tempo_ms: ms, detalhe: req.logDetalhe || null,
    };
    const linha = JSON.stringify(registro);
    arquivo.write(linha + '\n');
    console.log(linha);
    getPool().query(
      `INSERT INTO audit.access_log (servico, ocorrido_em, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, origem, detalhe)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ONLINE',$9)`,
      [registro.servico, registro.ts, registro.ip, registro.profissional_id, registro.metodo, rota, registro.status, ms, registro.detalhe],
    ).catch((e) => console.error('[log] falha ao gravar no banco:', e.message)); // o log nunca derruba o serviço
  });
  next();
}

module.exports = { accessLog, ipDoCliente };
