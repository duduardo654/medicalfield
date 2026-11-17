// Especificação OpenAPI 3.0 do core-service (servida em /docs e /openapi.json).
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema, example) => ({ 'application/json': example ? { schema, example } : { schema } });
const idParam = (name, desc) => ({ name, in: 'path', required: true, description: desc, schema: { type: 'string', format: 'uuid' } });
const erros = (...codes) => Object.fromEntries(codes.map((c) => [c, { description: { 401: 'Token ausente/inválido/expirado', 403: 'Acesso restrito ao administrador', 404: 'Não encontrado', 409: 'Conflito', 422: 'Dados inválidos' }[c], content: json(ref('Erro')) }]));
const secured = [{ bearerAuth: [] }];

const pessoaEx = { nome: 'Maria Souza', cpf: '900.000.000-77', data_nascimento: '1990-05-20', sexo: 'F', telefone: '(51) 99999-0077', email: 'maria@exemplo.test', contato_emergencia: 'José Souza - (51) 99999-1077' };
const atendEx = {
  pessoa_id: '11111111-1111-4111-8111-111111111111', data_hora: '2026-11-14T15:30:00Z', local_ocorrencia: 'BR-116 km 310',
  queixa_principal: 'Dor torácica', descricao: 'Dor precordial há 30 minutos.',
  pa_sistolica: 150, pa_diastolica: 95, freq_cardiaca: 102, freq_respiratoria: 20, spo2: 96, temperatura: 36.6, glicemia: 110,
  glasgow_ocular: 4, glasgow_verbal: 5, glasgow_motor: 6, triagem_manchester: 'LARANJA', triagem_start: 'AMARELO',
  conduta: 'AAS 300 mg VO; monitorização.', encaminhamento: 'Hospital de Pronto Socorro',
  medicamentos: [{ nome: 'AAS', dose: '300 mg', via: 'VO', horario: '2026-11-14T15:40:00Z' }],
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'MedicalField - Core Service', version: '1.0.0',
    description: [
      'Microsserviço **core** (Node.js/Express): pessoas, prontuários, atendimentos, sincronização offline-first e recepção de logs offline.',
      '',
      '* Todas as rotas exigem `Authorization: Bearer <token>` (obtido em `POST /auth/login` no auth-service, porta 8001).',
      '* **Atenção:** em `/prontuario/{id}` e `/atendimento/{id}` o `id` é o da **pessoa**. Operações sobre um atendimento específico usam `/atendimento/detalhe/{atendimentoId}`.',
      '* `POST` aceita `id` (UUID) gerado no cliente: reenviar o mesmo `id` é idempotente (200 com o registro existente).',
      '* Erros seguem o formato `{"erro":{"codigo","mensagem","detalhes?"}}`.',
    ].join('\n'),
  },
  servers: [{ url: '/' }],
  security: secured,
  tags: [{ name: 'Pessoa' }, { name: 'Prontuário' }, { name: 'Atendimento' }, { name: 'Sincronização' }, { name: 'Log' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Erro: { type: 'object', properties: { erro: { type: 'object', properties: { codigo: { type: 'string' }, mensagem: { type: 'string' }, detalhes: { type: 'array', items: { type: 'object' } } } } } },
      Pessoa: { type: 'object', required: ['nome'], properties: { id: { type: 'string', format: 'uuid' }, nome: { type: 'string' }, cpf: { type: 'string', nullable: true }, data_nascimento: { type: 'string', format: 'date', nullable: true }, sexo: { type: 'string', enum: ['M', 'F', 'O'], nullable: true }, telefone: { type: 'string', nullable: true }, email: { type: 'string', nullable: true }, contato_emergencia: { type: 'string', nullable: true } } },
      Prontuario: { type: 'object', required: ['pessoa_id'], properties: { id: { type: 'string', format: 'uuid' }, pessoa_id: { type: 'string', format: 'uuid' }, tipo_sanguineo: { type: 'string', enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] }, alergias: { type: 'string' }, condicoes_cronicas: { type: 'string' }, medicamentos_uso_continuo: { type: 'string' }, observacoes: { type: 'string' } } },
      Atendimento: { type: 'object', required: ['pessoa_id', 'data_hora', 'queixa_principal'], properties: { id: { type: 'string', format: 'uuid' }, pessoa_id: { type: 'string', format: 'uuid' }, prontuario_id: { type: 'string', format: 'uuid', description: 'Opcional: se omitido, usa o prontuário da pessoa.' }, data_hora: { type: 'string', format: 'date-time' }, queixa_principal: { type: 'string' }, pa_sistolica: { type: 'integer' }, pa_diastolica: { type: 'integer' }, freq_cardiaca: { type: 'integer' }, freq_respiratoria: { type: 'integer' }, spo2: { type: 'integer', maximum: 100 }, temperatura: { type: 'number' }, glicemia: { type: 'integer' }, glasgow_ocular: { type: 'integer', minimum: 1, maximum: 4 }, glasgow_verbal: { type: 'integer', minimum: 1, maximum: 5 }, glasgow_motor: { type: 'integer', minimum: 1, maximum: 6 }, triagem_manchester: { type: 'string', enum: ['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'] }, triagem_start: { type: 'string', enum: ['VERMELHO', 'AMARELO', 'VERDE', 'PRETO'] }, conduta: { type: 'string' }, encaminhamento: { type: 'string' }, medicamentos: { type: 'array', items: { type: 'object', required: ['nome', 'dose'], properties: { medicamento_id: { type: 'string', format: 'uuid' }, nome: { type: 'string' }, dose: { type: 'string' }, via: { type: 'string' }, horario: { type: 'string', format: 'date-time' } } } } } },
      SyncOperacao: { type: 'object', required: ['op_id', 'entidade', 'operacao', 'payload'], properties: { op_id: { type: 'string', format: 'uuid', description: 'Identificador da operação (idempotência).' }, entidade: { type: 'string', enum: ['pessoa', 'prontuario', 'atendimento'] }, operacao: { type: 'string', enum: ['CREATE', 'UPDATE'] }, registro_id: { type: 'string', format: 'uuid' }, profissional_id: { type: 'string', format: 'uuid' }, client_created_at: { type: 'string', format: 'date-time' }, payload: { type: 'object', description: 'Campos da entidade; em UPDATE pode incluir base_version.' } } },
    },
  },
  paths: {
    '/pessoa': {
      get: { tags: ['Pessoa'], summary: 'Lista pessoas', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' }, description: 'Busca por nome ou CPF' }, { name: 'limit', in: 'query', schema: { type: 'integer' } }, { name: 'offset', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK', content: json({ type: 'array', items: ref('Pessoa') }) }, ...erros(401) } },
      post: { tags: ['Pessoa'], summary: 'Cadastra nova pessoa (idempotente por id)', requestBody: { required: true, content: json(ref('Pessoa'), pessoaEx) }, responses: { 201: { description: 'Criada', content: json(ref('Pessoa')) }, 200: { description: 'Já existia com este id (idempotência)' }, ...erros(401, 409, 422) } },
    },
    '/pessoa/{id}': {
      get: { tags: ['Pessoa'], summary: 'Obtém uma pessoa', parameters: [idParam('id', 'id da pessoa')], responses: { 200: { description: 'OK', content: json(ref('Pessoa')) }, ...erros(401, 404, 422) } },
      put: { tags: ['Pessoa'], summary: 'Atualiza pessoa (campos parciais)', parameters: [idParam('id', 'id da pessoa')], requestBody: { required: true, content: json(ref('Pessoa'), { telefone: '(51) 98888-0000' }) }, responses: { 200: { description: 'OK' }, ...erros(401, 404, 409, 422) } },
      delete: { tags: ['Pessoa'], summary: 'Remove pessoa (ADMIN; 409 se tiver prontuário)', parameters: [idParam('id', 'id da pessoa')], responses: { 204: { description: 'Removida' }, ...erros(401, 403, 404, 409) } },
    },
    '/prontuario': {
      get: { tags: ['Prontuário'], summary: 'Lista prontuários de todas as pessoas', responses: { 200: { description: 'OK', content: json({ type: 'array', items: ref('Prontuario') }) }, ...erros(401) } },
      post: { tags: ['Prontuário'], summary: 'Cadastra prontuário (1 por pessoa)', requestBody: { required: true, content: json(ref('Prontuario'), { pessoa_id: '33333333-3333-4333-8333-333333333333', tipo_sanguineo: 'O+', alergias: 'Penicilina' }) }, responses: { 201: { description: 'Criado' }, 200: { description: 'Já existia com este id' }, ...erros(401, 409, 422) } },
    },
    '/prontuario/{id}': {
      get: { tags: ['Prontuário'], summary: 'Obtém o prontuário de uma pessoa', parameters: [idParam('id', 'id da PESSOA')], responses: { 200: { description: 'OK', content: json(ref('Prontuario')) }, ...erros(401, 404, 422) } },
      put: { tags: ['Prontuário'], summary: 'Atualiza o prontuário da pessoa', parameters: [idParam('id', 'id da PESSOA')], requestBody: { required: true, content: json(ref('Prontuario'), { observacoes: 'Atualizado' }) }, responses: { 200: { description: 'OK' }, ...erros(401, 404, 422) } },
      delete: { tags: ['Prontuário'], summary: 'Remove o prontuário (ADMIN; 409 se houver atendimentos)', parameters: [idParam('id', 'id da PESSOA')], responses: { 204: { description: 'Removido' }, ...erros(401, 403, 404, 409) } },
    },
    '/atendimento': {
      get: { tags: ['Atendimento'], summary: 'Lista todos os atendimentos (com nome da pessoa)', responses: { 200: { description: 'OK', content: json({ type: 'array', items: ref('Atendimento') }) }, ...erros(401) } },
      post: { tags: ['Atendimento'], summary: 'Registra um atendimento (profissional = usuário autenticado)', requestBody: { required: true, content: json(ref('Atendimento'), atendEx) }, responses: { 201: { description: 'Criado' }, 200: { description: 'Já existia com este id' }, ...erros(401, 422) } },
    },
    '/atendimento/{id}': {
      get: { tags: ['Atendimento'], summary: 'Todos os atendimentos de uma pessoa', parameters: [idParam('id', 'id da PESSOA')], responses: { 200: { description: 'OK', content: json({ type: 'array', items: ref('Atendimento') }) }, ...erros(401, 404, 422) } },
    },
    '/atendimento/detalhe/{atendimentoId}': {
      get: { tags: ['Atendimento'], summary: 'Um atendimento com pessoa, prontuário e medicamentos (usado pelo business-service no PDF)', parameters: [idParam('atendimentoId', 'id do ATENDIMENTO')], responses: { 200: { description: 'OK' }, ...erros(401, 404, 422) } },
      put: { tags: ['Atendimento'], summary: 'Atualiza um atendimento', parameters: [idParam('atendimentoId', 'id do ATENDIMENTO')], requestBody: { required: true, content: json(ref('Atendimento'), { descricao: 'Reavaliado: estável.' }) }, responses: { 200: { description: 'OK' }, ...erros(401, 404, 422) } },
      delete: { tags: ['Atendimento'], summary: 'Remove um atendimento (ADMIN)', parameters: [idParam('atendimentoId', 'id do ATENDIMENTO')], responses: { 204: { description: 'Removido' }, ...erros(401, 403, 404) } },
    },
    '/sync/push': {
      post: {
        tags: ['Sincronização'], summary: 'Recebe a fila Outbox do cliente (idempotente)',
        description: 'Cada operação é processada em transação própria e devolve `APPLIED`, `DUPLICATE`, `MERGED`, `CONFLICT_RESOLVED` ou `REJECTED` (com `retentavel`). O cliente só marca o registro como sincronizado após uma resposta de sucesso.',
        requestBody: { required: true, content: json({ type: 'object', properties: { operacoes: { type: 'array', items: ref('SyncOperacao') } } }, { operacoes: [{ op_id: '9b2f1c0e-1111-4a2b-8c3d-000000000001', entidade: 'pessoa', operacao: 'CREATE', registro_id: 'd0000000-0000-4000-8000-000000000001', payload: { nome: 'Paciente Offline', cpf: '900.000.000-88', client_created_at: '2026-11-14T15:00:00Z' } }] }) },
        responses: { 200: { description: 'Resultado por operação' }, ...erros(401, 422) },
      },
    },
    '/sync/pull': {
      get: { tags: ['Sincronização'], summary: 'Registros alterados desde `since`', parameters: [{ name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Omita para baixar tudo. Use o `cursor` da resposta anterior.' }], responses: { 200: { description: '{ server_time, cursor, pessoas[], prontuarios[], atendimentos[] }' }, ...erros(401, 422) } },
    },
    '/log': {
      post: { tags: ['Log'], summary: 'Cliente envia logs gerados offline (idempotente por log_id)', requestBody: { required: true, content: json({ type: 'object' }, { registros: [{ log_id: 'f0000000-0000-4000-8000-000000000001', ocorrido_em: '2026-11-14T15:05:00Z', metodo: 'POST', rota: '/pessoa (offline)', status_code: 201, tempo_ms: 3.2, detalhe: 'gravado no SQLite' }] }) }, responses: { 201: { description: '{ recebidos, gravados, duplicados }' }, ...erros(401, 422) } },
      get: { tags: ['Log'], summary: 'Consulta o log de auditoria (ADMIN)', parameters: [{ name: 'servico', in: 'query', schema: { type: 'string', enum: ['auth', 'core', 'business', 'client'] } }, { name: 'origem', in: 'query', schema: { type: 'string', enum: ['ONLINE', 'OFFLINE'] } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, ...erros(401, 403) } },
    },
  },
};
