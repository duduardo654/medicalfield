// Teste de integração do core-service. Requer auth-service (8001) e core-service (8002) em execução:
//   cd services/core-service && npm test
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const AUTH = process.env.AUTH_URL || `http://localhost:${process.env.AUTH_PORT || 8001}`;
const CORE = process.env.CORE_URL || `http://localhost:${process.env.CORE_PORT || 8002}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, base, url, token, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  return { status: res.status, body: data };
}
const core = (m, u, t, b) => call(m, CORE, u, t, b);

const run = String(Date.now()).slice(-8);
const cpf = (n) => `8${run.slice(0, 2)}.${run.slice(2, 5)}.${run.slice(5, 8)}-${n}`;
let med; let adm; // tokens

before(async () => {
  const a = await call('POST', AUTH, '/auth/login', null, { identificacao: 'CRM-RS-12345', senha: 'medico123' });
  assert.equal(a.status, 200, 'auth-service precisa estar no ar (porta 8001)');
  med = a.body.access_token;
  adm = (await call('POST', AUTH, '/auth/login', null, { identificacao: 'ADMIN-001', senha: 'admin123' })).body.access_token;
});

// ---------------------------------------------------------------- autenticação
test('autenticação: rotas exigem token válido', async () => {
  assert.equal((await core('GET', '/pessoa')).status, 401);
  const inval = await core('GET', '/pessoa', 'token.invalido.aqui');
  assert.equal(inval.status, 401);
  assert.equal(inval.body.erro.codigo, 'TOKEN_INVALIDO');
  assert.ok(inval.body.erro.mensagem);
  assert.equal((await core('GET', '/rota-inexistente', med)).status, 404);
});

test('dados de demonstração estão disponíveis', async () => {
  const r = await core('GET', '/pessoa', med);
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 3);
  assert.ok(r.body.some((p) => p.nome === 'João da Silva'));
});

// ---------------------------------------------------------------- CRUD online
const crud = { pessoa: randomUUID(), prontuario: randomUUID(), atend: randomUUID() };

test('CRUD pessoa: create, read, update e validações', async () => {
  const body = { id: crud.pessoa, nome: 'Teste CRUD', cpf: cpf(11), sexo: 'F' };
  const c = await core('POST', '/pessoa', med, body);
  assert.equal(c.status, 201);
  assert.equal(c.body.origem, 'ONLINE');
  assert.equal((await core('POST', '/pessoa', med, body)).status, 200, 'mesmo id = idempotente');
  const dup = await core('POST', '/pessoa', med, { nome: 'Outro Nome', cpf: cpf(11) });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.erro.codigo, 'CPF_JA_CADASTRADO');
  assert.equal((await core('GET', `/pessoa/${crud.pessoa}`, med)).body.nome, 'Teste CRUD');
  const up = await core('PUT', `/pessoa/${crud.pessoa}`, med, { telefone: '(51) 90000-0000' });
  assert.equal(up.status, 200);
  assert.equal(up.body.telefone, '(51) 90000-0000');
  assert.equal(up.body.version, 2);
  assert.ok((await core('GET', `/pessoa?q=${encodeURIComponent('Teste CRUD')}`, med)).body.length >= 1);
  const inv = await core('POST', '/pessoa', med, { nome: 'A' });
  assert.equal(inv.status, 422);
  assert.equal(inv.body.erro.codigo, 'DADOS_INVALIDOS');
  assert.equal((await core('GET', '/pessoa/nao-e-uuid', med)).status, 422);
  assert.equal((await core('GET', `/pessoa/${randomUUID()}`, med)).status, 404);
});

test('CRUD prontuário: 1 por pessoa; id da rota é o da pessoa', async () => {
  const c = await core('POST', '/prontuario', med, { id: crud.prontuario, pessoa_id: crud.pessoa, tipo_sanguineo: 'O+', alergias: 'Dipirona' });
  assert.equal(c.status, 201);
  assert.equal((await core('POST', '/prontuario', med, { pessoa_id: crud.pessoa })).status, 409);
  assert.equal((await core('POST', '/prontuario', med, { pessoa_id: randomUUID() })).status, 422);
  assert.equal((await core('POST', '/prontuario', med, { pessoa_id: crud.pessoa, tipo_sanguineo: 'Z+' })).status, 422);
  const g = await core('GET', `/prontuario/${crud.pessoa}`, med);
  assert.equal(g.status, 200);
  assert.equal(g.body.pessoa.nome, 'Teste CRUD');
  assert.ok((await core('GET', '/prontuario', med)).body.some((p) => p.id === crud.prontuario));
  const up = await core('PUT', `/prontuario/${crud.pessoa}`, med, { observacoes: 'Atualizado' });
  assert.equal(up.body.observacoes, 'Atualizado');
});

test('CRUD atendimento: sinais vitais, Glasgow, medicamentos e assinatura do profissional', async () => {
  const body = {
    id: crud.atend, pessoa_id: crud.pessoa, data_hora: '2026-11-14T15:30:00Z', queixa_principal: 'Dor torácica',
    pa_sistolica: 150, pa_diastolica: 95, freq_cardiaca: 102, spo2: 96, temperatura: 36.6,
    glasgow_ocular: 4, glasgow_verbal: 5, glasgow_motor: 6, triagem_manchester: 'LARANJA', triagem_start: 'AMARELO',
    profissional_id: randomUUID(), // deve ser ignorado: vale o usuário autenticado
    medicamentos: [{ nome: 'AAS', dose: '300 mg', via: 'VO', horario: '2026-11-14T15:40:00Z' }],
  };
  const c = await core('POST', '/atendimento', med, body);
  assert.equal(c.status, 201);
  assert.equal(c.body.glasgow_total, 15);
  assert.equal(c.body.profissional_nome, 'Dra. Helena Duarte');
  assert.equal(c.body.profissional_id, '00000000-0000-4000-8000-0000000000b1');
  assert.equal(c.body.medicamentos.length, 1);
  assert.equal((await core('POST', '/atendimento', med, { ...body, spo2: 150 })).status, 422);
  const lst = await core('GET', `/atendimento/${crud.pessoa}`, med);
  assert.equal(lst.body.length, 1);
  const det = await core('GET', `/atendimento/detalhe/${crud.atend}`, med);
  assert.equal(det.body.pessoa.nome, 'Teste CRUD');
  assert.equal(det.body.prontuario.tipo_sanguineo, 'O+');
  const up = await core('PUT', `/atendimento/detalhe/${crud.atend}`, med, { descricao: 'Reavaliado', medicamentos: [] });
  assert.equal(up.body.descricao, 'Reavaliado');
  assert.equal(up.body.medicamentos.length, 0);
  // pessoa sem prontuário não pode ter atendimento
  const semPront = await core('POST', '/pessoa', med, { nome: 'Sem Prontuario', cpf: cpf(12) });
  const r = await core('POST', '/atendimento', med, { pessoa_id: semPront.body.id, data_hora: '2026-11-14T10:00:00Z', queixa_principal: 'Teste' });
  assert.equal(r.status, 422);
  assert.equal(r.body.erro.codigo, 'PRONTUARIO_INEXISTENTE');
  await core('DELETE', `/pessoa/${semPront.body.id}`, adm);
});

test('autorização e integridade: DELETE só ADMIN, respeitando relacionamentos', async () => {
  assert.equal((await core('DELETE', `/pessoa/${crud.pessoa}`, med)).status, 403);
  assert.equal((await core('DELETE', `/pessoa/${crud.pessoa}`, adm)).status, 409, 'pessoa com prontuário');
  assert.equal((await core('DELETE', `/prontuario/${crud.pessoa}`, adm)).status, 409, 'prontuário com atendimento');
  assert.equal((await core('DELETE', `/atendimento/detalhe/${crud.atend}`, adm)).status, 204);
  assert.equal((await core('DELETE', `/prontuario/${crud.pessoa}`, adm)).status, 204);
  assert.equal((await core('DELETE', `/pessoa/${crud.pessoa}`, adm)).status, 204);
  assert.equal((await core('GET', `/pessoa/${crud.pessoa}`, med)).status, 404);
});

// ---------------------------------------------------------------- offline -> sync
const off = { p: randomUUID(), pr: randomUUID(), at: randomUUID(), cpf: cpf(21) };
const T0 = '2026-11-14T10:00:00Z';
const opId = { p: randomUUID(), pr: randomUUID(), at: randomUUID() };
const outbox = () => [
  { op_id: opId.p, entidade: 'pessoa', operacao: 'CREATE', registro_id: off.p, profissional_id: '00000000-0000-4000-8000-0000000000b1', client_created_at: T0,
    payload: { nome: 'Paciente Offline', cpf: off.cpf, sexo: 'M', client_created_at: T0, client_updated_at: T0 } },
  { op_id: opId.pr, entidade: 'prontuario', operacao: 'CREATE', registro_id: off.pr, client_created_at: T0,
    payload: { pessoa_id: off.p, tipo_sanguineo: 'A+', alergias: 'Nenhuma', client_created_at: T0, client_updated_at: T0 } },
  { op_id: opId.at, entidade: 'atendimento', operacao: 'CREATE', registro_id: off.at, client_created_at: T0,
    payload: { pessoa_id: off.p, prontuario_id: off.pr, data_hora: T0, queixa_principal: 'Queda de moto', descricao: 'versão original',
      spo2: 94, glasgow_ocular: 3, glasgow_verbal: 4, glasgow_motor: 5, triagem_manchester: 'AMARELO', triagem_start: 'AMARELO',
      medicamentos: [{ id: randomUUID(), nome: 'Dipirona', dose: '1 g', via: 'IV', horario: T0 }], client_created_at: T0, client_updated_at: T0 } },
];

test('offline: registro novo NÃO aparece no servidor antes do sync (roteiro 13)', async () => {
  assert.equal((await core('GET', `/pessoa/${off.p}`, adm)).status, 404);
  assert.equal((await core('GET', `/prontuario/${off.p}`, adm)).status, 404);
});

test('sync push: pessoa -> prontuário -> atendimento persistidos e confirmados (roteiro 14/15)', async () => {
  const r = await core('POST', '/sync/push', med, { operacoes: outbox() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.resultados.map((x) => x.resultado), ['APPLIED', 'APPLIED', 'APPLIED']);
  assert.deepEqual(r.body.resumo, { APPLIED: 3 });
  const p = await core('GET', `/pessoa/${off.p}`, adm);
  assert.equal(p.status, 200);
  assert.equal(p.body.origem, 'OFFLINE');
  const at = (await core('GET', `/atendimento/${off.p}`, adm)).body;
  assert.equal(at.length, 1);
  assert.equal(at[0].glasgow_total, 12);
  assert.equal(at[0].profissional_nome, 'Dra. Helena Duarte'); // assinatura vinda do token (mesmo profissional)
  assert.equal(at[0].medicamentos[0].nome, 'Dipirona');
});

test('idempotência: reenviar a Outbox não duplica nada', async () => {
  const r = await core('POST', '/sync/push', med, { operacoes: outbox() });
  assert.deepEqual(r.body.resultados.map((x) => x.resultado), ['DUPLICATE', 'DUPLICATE', 'DUPLICATE']);
  // op_id NOVO com o mesmo registro idêntico também não duplica
  const novo = outbox().map((o) => ({ ...o, op_id: randomUUID() }));
  const r2 = await core('POST', '/sync/push', med, { operacoes: novo });
  assert.deepEqual(r2.body.resultados.map((x) => x.resultado), ['DUPLICATE', 'DUPLICATE', 'DUPLICATE']);
  assert.equal((await core('GET', `/pessoa?q=${encodeURIComponent(off.cpf)}`, med)).body.length, 1);
  assert.equal((await core('GET', `/atendimento/${off.p}`, med)).body.length, 1);
});

test('duplicidade offline: mesmo CPF com ids diferentes é FUNDIDO e o atendimento vai para o registro oficial', async () => {
  const p2 = randomUUID(); const pr2 = randomUUID(); const at2 = randomUUID();
  const T1 = '2026-11-14T12:00:00Z';
  const r = await core('POST', '/sync/push', med, { operacoes: [
    { op_id: randomUUID(), entidade: 'pessoa', operacao: 'CREATE', registro_id: p2, client_created_at: T1,
      payload: { nome: 'Paciente Offline', cpf: off.cpf, email: 'paciente@exemplo.test', client_created_at: T1, client_updated_at: T1 } },
    { op_id: randomUUID(), entidade: 'prontuario', operacao: 'CREATE', registro_id: pr2, client_created_at: T1,
      payload: { pessoa_id: p2, observacoes: 'Criado por outro dispositivo', client_created_at: T1, client_updated_at: T1 } },
    { op_id: randomUUID(), entidade: 'atendimento', operacao: 'CREATE', registro_id: at2, client_created_at: T1,
      payload: { pessoa_id: p2, prontuario_id: pr2, data_hora: T1, queixa_principal: 'Retorno', client_created_at: T1, client_updated_at: T1 } },
  ] });
  const [a, b, c] = r.body.resultados;
  assert.equal(a.resultado, 'MERGED'); assert.equal(a.canonical_id, off.p);
  assert.equal(b.resultado, 'MERGED'); assert.equal(b.canonical_id, off.pr);
  assert.equal(c.resultado, 'APPLIED');
  assert.equal((await core('GET', `/pessoa/${p2}`, med)).status, 404, 'o id descartado não existe');
  const pessoa = (await core('GET', `/pessoa/${off.p}`, med)).body;
  assert.equal(pessoa.email, 'paciente@exemplo.test', 'lacuna preenchida pela mesclagem de campos');
  const pront = (await core('GET', `/prontuario/${off.p}`, med)).body;
  assert.equal(pront.alergias, 'Nenhuma'); // mantido
  assert.equal(pront.observacoes, 'Criado por outro dispositivo'); // lacuna preenchida
  assert.equal((await core('GET', `/atendimento/${off.p}`, med)).body.length, 2);
});

test('integridade: dependência ausente é rejeitada como retentável e passa ao reenviar', async () => {
  const q = randomUUID(); const qr = randomUUID(); const qa = randomUUID(); const opA = randomUUID();
  const atend = { op_id: opA, entidade: 'atendimento', operacao: 'CREATE', registro_id: qa,
    payload: { pessoa_id: q, prontuario_id: qr, data_hora: T0, queixa_principal: 'Teste dependência' } };
  const r1 = await core('POST', '/sync/push', med, { operacoes: [atend] });
  assert.equal(r1.body.resultados[0].resultado, 'REJECTED');
  assert.equal(r1.body.resultados[0].retentavel, true);
  const r2 = await core('POST', '/sync/push', med, { operacoes: [
    { op_id: randomUUID(), entidade: 'pessoa', operacao: 'CREATE', registro_id: q, payload: { nome: 'Dependência OK', cpf: cpf(31) } },
    { op_id: randomUUID(), entidade: 'prontuario', operacao: 'CREATE', registro_id: qr, payload: { pessoa_id: q } },
    atend, // MESMO op_id da tentativa rejeitada
  ] });
  assert.deepEqual(r2.body.resultados.map((x) => x.resultado), ['APPLIED', 'APPLIED', 'APPLIED']);
});

test('validação no sync: dados inválidos são rejeitados sem retentativa', async () => {
  const r = await core('POST', '/sync/push', med, { operacoes: [
    { op_id: randomUUID(), entidade: 'pessoa', operacao: 'CREATE', registro_id: randomUUID(), payload: { nome: 'X' } },
    { entidade: 'pessoa', operacao: 'CREATE', payload: {} },
  ] });
  assert.equal(r.status, 200);
  assert.equal(r.body.resultados[0].resultado, 'REJECTED');
  assert.equal(r.body.resultados[0].retentavel, false);
  assert.equal(r.body.resultados[1].codigo, 'OPERACAO_INVALIDA');
  assert.equal((await core('POST', '/sync/push', med, { operacoes: [] })).status, 422);
});

test('conflito (Strategy LAST_WRITE_WINS no atendimento) e base_version', async () => {
  const upd = (desc, ts, extra = {}) => ({ op_id: randomUUID(), entidade: 'atendimento', operacao: 'UPDATE', registro_id: off.at,
    payload: { pessoa_id: off.p, prontuario_id: off.pr, data_hora: T0, queixa_principal: 'Queda de moto', descricao: desc, spo2: 94,
      glasgow_ocular: 3, glasgow_verbal: 4, glasgow_motor: 5, triagem_manchester: 'AMARELO', triagem_start: 'AMARELO',
      medicamentos: [{ nome: 'Dipirona', dose: '1 g', via: 'IV', horario: T0 }], client_updated_at: ts, ...extra } });
  const velho = (await core('POST', '/sync/push', med, { operacoes: [upd('edição antiga', '2026-11-14T09:00:00Z')] })).body.resultados[0];
  assert.equal(velho.resultado, 'CONFLICT_RESOLVED');
  assert.equal(velho.detalhe.vencedor, 'server');
  assert.equal(velho.detalhe.estrategia, 'LAST_WRITE_WINS');
  assert.equal((await core('GET', `/atendimento/detalhe/${off.at}`, med)).body.descricao, 'versão original');

  const novo = (await core('POST', '/sync/push', med, { operacoes: [upd('edição recente', '2026-11-14T11:00:00Z')] })).body.resultados[0];
  assert.equal(novo.resultado, 'CONFLICT_RESOLVED');
  assert.equal(novo.detalhe.vencedor, 'client');
  assert.equal((await core('GET', `/atendimento/detalhe/${off.at}`, med)).body.descricao, 'edição recente');

  const versao = (await core('GET', `/atendimento/detalhe/${off.at}`, med)).body.version;
  const bv = (await core('POST', '/sync/push', med, { operacoes: [upd('via base_version', '2026-11-14T08:00:00Z', { base_version: versao })] })).body.resultados[0];
  assert.equal(bv.resultado, 'APPLIED', 'edição sobre a última versão conhecida não é conflito');
  assert.equal((await core('GET', `/atendimento/detalhe/${off.at}`, med)).body.descricao, 'via base_version');
});

test('sync pull: baixa tudo e depois só o que mudou (roteiro 6/11)', async () => {
  const full = (await core('GET', '/sync/pull', med)).body;
  assert.ok(full.cursor && full.server_time);
  assert.ok(full.pessoas.some((p) => p.id === off.p && p.version >= 1));
  assert.ok(full.prontuarios.some((p) => p.id === off.pr));
  const at = full.atendimentos.find((a) => a.id === off.at);
  assert.ok(at && Array.isArray(at.medicamentos));
  const vazio = (await core('GET', `/sync/pull?since=${encodeURIComponent(full.server_time)}`, med)).body;
  assert.equal(vazio.pessoas.length + vazio.prontuarios.length + vazio.atendimentos.length, 0);
  const nova = await core('POST', '/pessoa', adm, { nome: 'Pessoa Nova Pull', cpf: cpf(41) });
  const inc = (await core('GET', `/sync/pull?since=${encodeURIComponent(full.server_time)}`, med)).body;
  assert.deepEqual(inc.pessoas.map((p) => p.id), [nova.body.id]);
  assert.equal((await core('GET', '/sync/pull?since=ontem', med)).status, 422);
  await core('DELETE', `/pessoa/${nova.body.id}`, adm);
});

// ---------------------------------------------------------------- logs
test('logs: POST /log idempotente (offline) e consulta de auditoria só para ADMIN', async () => {
  const l1 = randomUUID(); const l2 = randomUUID();
  const registros = [
    { log_id: l1, ocorrido_em: '2026-11-14T10:01:00Z', metodo: 'post', rota: `/pessoa (offline ${run})`, status_code: 201, tempo_ms: 2.5, detalhe: 'gravado no SQLite' },
    { log_id: l2, ocorrido_em: '2026-11-14T10:02:00Z', metodo: 'POST', rota: `/atendimento (offline ${run})`, status_code: 201, tempo_ms: 3.1 },
  ];
  const a = await core('POST', '/log', med, { registros });
  assert.equal(a.status, 201);
  assert.deepEqual(a.body, { recebidos: 2, gravados: 2, duplicados: 0 });
  assert.deepEqual((await core('POST', '/log', med, { registros })).body, { recebidos: 2, gravados: 0, duplicados: 2 });
  assert.equal((await core('GET', '/log', med)).status, 403);
  const off1 = await core('GET', '/log?origem=OFFLINE&limit=50', adm);
  assert.ok(off1.body.some((l) => l.rota === `/pessoa (offline ${run})` && l.origem === 'OFFLINE' && l.servico === 'client' && l.profissional_id));
  await sleep(500); // gravação do log de acesso é assíncrona
  const online = (await core('GET', '/log?servico=core&limit=200', adm)).body;
  const reg = online.find((l) => l.rota === '/sync/push' && l.profissional_id);
  assert.ok(reg, 'acesso autenticado registrado com profissional');
  for (const campo of ['ocorrido_em', 'ip_cliente', 'metodo', 'rota', 'status_code', 'tempo_ms']) assert.ok(reg[campo] !== undefined && reg[campo] !== null, campo);
  assert.ok(online.some((l) => l.status_code === 401 && !l.profissional_id), '401 também é registrado');
});
