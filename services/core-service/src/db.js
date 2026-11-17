// Pool de conexões PostgreSQL (padrão Singleton: um único pool por processo).
const { Pool, types } = require('pg');
const config = require('./config');

types.setTypeParser(1082, (v) => v);          // DATE -> 'YYYY-MM-DD' (sem fuso)
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC -> number
types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT -> number

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
pool.on('error', (err) => console.error('[pg] erro no pool:', err.message));

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignora */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
