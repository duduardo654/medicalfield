const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const { accessLog } = require('./middleware/accessLog');
const { autenticar } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');
const openapi = require('./openapi');

const app = express();
app.disable('x-powered-by');

// ---- Cadeia de middlewares (padrão Chain of Responsibility) ----
app.use(cors());                      // 1. CORS
app.use(accessLog);                   // 2. auditoria de TODA requisição
app.use(express.json({ limit: '5mb' }));
if (config.enableDocs) {              // documentação (única parte sem autenticação)
  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'MedicalField - Core Service' }));
}
app.use(autenticar);                  // 3. JWT obrigatório em todas as rotas abaixo
app.use('/pessoa', require('./routes/pessoa'));
app.use('/prontuario', require('./routes/prontuario'));
app.use('/atendimento', require('./routes/atendimento'));
app.use('/log', require('./routes/log'));
app.use('/sync', require('./routes/sync'));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
