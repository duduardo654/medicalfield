const { pool, withTransaction } = require('../db');

class LogRepository {
  // Logs gerados offline pelo cliente. Idempotente por client_log_id.
  async insertOffline(registros, { profissionalId, ip }) {
    return withTransaction(async (client) => {
      let gravados = 0;
      for (const r of registros) {
        const res = await client.query(
          `INSERT INTO audit.access_log
             (servico, ocorrido_em, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, origem, detalhe, client_log_id)
           VALUES ('client', $1, $2, $3, $4, $5, $6, $7, 'OFFLINE', $8, $9)
           ON CONFLICT DO NOTHING`,
          [r.ocorrido_em, ip, profissionalId, r.metodo.toUpperCase(), r.rota, r.status_code, r.tempo_ms, r.detalhe || null, r.log_id || null]);
        gravados += res.rowCount;
      }
      return gravados;
    });
  }

  async list({ servico, origem, limit = 100 }) {
    const where = []; const params = [];
    if (servico) { params.push(servico); where.push(`servico = $${params.length}`); }
    if (origem) { params.push(origem); where.push(`origem = $${params.length}`); }
    params.push(limit);
    const r = await pool.query(
      `SELECT id, servico, ocorrido_em, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, origem, detalhe
         FROM audit.access_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY id DESC LIMIT $${params.length}`, params);
    return r.rows;
  }
}

module.exports = new LogRepository();
