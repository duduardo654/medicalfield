// Configuração do core-service (lida do .env na raiz do projeto).
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

function required(name) {
  const v = process.env[name];
  if (!v || v === 'CHANGE_ME') {
    throw new Error(`Variável de ambiente ${name} não configurada (rode iniciar-tudo.bat ou scripts/setup.py).`);
  }
  return v;
}

module.exports = {
  serviceName: 'core',
  port: Number(process.env.CORE_PORT || 8002),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtIssuer: 'medicalfield-auth',
  logDir: path.resolve(ROOT, process.env.LOG_DIR || './logs'),
  enableDocs: (process.env.ENABLE_DOCS || 'true').toLowerCase() === 'true',
  // DEFAULT = estratégia padrão de cada entidade; ou LAST_WRITE_WINS | SERVER_WINS | FIELD_MERGE
  conflictStrategy: (process.env.CONFLICT_STRATEGY || 'DEFAULT').toUpperCase(),
};
