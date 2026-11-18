const config = require('./config');
const { pool } = require('./db');
const app = require('./app');

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`[core-service] ouvindo em http://localhost:${config.port}  (Swagger: /docs)`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`[core-service] A porta ${config.port} já está em uso. Feche o outro processo ou altere CORE_PORT no .env.`);
  else console.error('[core-service] erro:', err);
  process.exit(1);
});

async function shutdown() {
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
