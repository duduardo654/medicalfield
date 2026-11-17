// Teste de integração do business-service (sem dependências: só Node 18+).
// Requer auth (8001), core (8002) e business (8003) no ar. O teste de e-mail precisa do Mailpit (8025) e é
// pulado se ele não estiver rodando.   Uso:  cd services/business-service && node --test
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const AUTH = process.env.AUTH_URL || 'http://localhost:8001';
const CORE = process.env.CORE_URL || 'http://localhost:8002';
const BIZ = process.env.BUSINESS_URL || 'http://localhost:8003';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = String(Date.now()).slice(-8);

async function call(base, method, url, token, body, raw = false) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  return { status: res.status, body: data, headers: res.headers };
}
const biz = (m, u, t, b) => call(BIZ, m, u, t, b);
const core = (m, u, t, b) => call(CORE, m, u, t, b);

let med; let adm; let mailpitOn = false;
const ATEND_DEMO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'; // atendimento de demonstração (João da Silva)

before(async () => {
  const login = async (i, s) => (await call(AUTH, 'POST', '/auth/login', null, { identificacao: i, senha: s })).body.access_token;
  med = await login('CRM-RS-12345', 'medico123');
  adm = await login('ADMIN-001', 'admin123');
  assert.ok(med && adm, 'auth-service precisa estar no ar');
  assert.equal((await biz('GET', '/medicamento', med)).status, 200, 'business-service precisa estar no ar (porta 8003)');
  try { mailpitOn = (await fetch(`${MAILPIT}/api/v1/info`)).ok; } catch (_) { mailpitOn = false; }
});

test('autenticação: todas as rotas exigem token válido', async () => {
  for (const [m, u] of [['GET', '/medicamento'], ['GET', `/ficha/${ATEND_DEMO}/pdf`], ['POST', `/ficha/${ATEND_DEMO}/email`]]) {
    const r = await biz(m, u, null);
    assert.equal(r.status, 401, `${m} ${u}`);
    assert.equal(r.body.erro.codigo, 'TOKEN_AUSENTE');
  }
  const inv = await biz('GET', '/medicamento', 'abc.def.ghi');
  assert.equal(inv.status, 401);
  assert.equal(inv.body.erro.codigo, 'TOKEN_INVALIDO');
  assert.equal((await biz('GET', '/rota-inexistente', med)).status, 404);
});

test('GET /medicamento: lista, busca, filtro incremental e cursor', async () => {
  const r = await biz('GET', '/medicamento', med);
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 11);
  const aas = r.body.find((m) => m.nome === 'AAS');
  assert.ok(aas && aas.dose_max_unitaria === 300 && aas.unidade_dose === 'mg' && aas.ativo === true);
  assert.ok(r.headers.get('x-sync-cursor'));
  assert.equal((await biz('GET', '/medicamento?q=morf', med)).body.length, 1);
  assert.equal((await biz('GET', '/medicamento?q=ZZZ-nao-existe', med)).body.length, 0);
  const futuro = new Date(Date.now() + 3600e3).toISOString();
  assert.deepEqual((await biz('GET', `/medicamento?since=${encodeURIComponent(futuro)}`, med)).body, []);
  assert.equal((await biz('GET', '/medicamento?since=ontem', med)).status, 422);
  const um = await biz('GET', `/medicamento/${aas.id}`, med);
  assert.equal(um.body.nome, 'AAS');
  assert.equal((await biz('GET', '/medicamento/nao-uuid', med)).status, 422);
  assert.equal((await biz('GET', `/medicamento/${randomUUID()}`, med)).status, 404);
});

test('GET /ficha/{id}/pdf: gera o PDF do atendimento (roteiro 16)', async () => {
  const res = await call(BIZ, 'GET', `/ficha/${ATEND_DEMO}/pdf`, med, undefined, true);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="ficha-atendimento-joao-da-silva-\d{8}-\d{4}\.pdf"$/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 3000);
  assert.equal(Number(res.headers.get('content-length')), buf.length);
  const inl = await call(BIZ, 'GET', `/ficha/${ATEND_DEMO}/pdf?inline=1`, med, undefined, true);
  assert.match(inl.headers.get('content-disposition'), /^inline;/);
  assert.equal((await biz('GET', `/ficha/${randomUUID()}/pdf`, med)).status, 404);
  assert.equal((await biz('GET', '/ficha/xyz/pdf', med)).status, 422);
});

// ---- atendimento novo criado via core, para testar e-mail e PDF com medicamentos
const ids = { p: randomUUID(), pr: randomUUID(), at: randomUUID(), p2: randomUUID(), pr2: randomUUID(), at2: randomUUID() };

test('prepara dados no core-service', async () => {
  const dt = new Date().toISOString();
  assert.equal((await core('POST', '/pessoa', med, { id: ids.p, nome: `Maria Ferreira ${run}`, cpf: `6${run.slice(0, 2)}.${run.slice(2, 5)}.${run.slice(5, 8)}-01`, email: `maria-${run}@exemplo.test`, data_nascimento: '1975-02-10', sexo: 'F' })).status, 201);
  assert.equal((await core('POST', '/prontuario', med, { id: ids.pr, pessoa_id: ids.p, tipo_sanguineo: 'B+', alergias: 'Penicilina' })).status, 201);
  const a = await core('POST', '/atendimento', med, {
    id: ids.at, pessoa_id: ids.p, data_hora: dt, queixa_principal: 'Crise convulsiva', local_ocorrencia: 'Praça Central',
    descricao: 'Paciente com crise tônico-clônica generalizada de 3 minutos. '.repeat(25), pa_sistolica: 130, pa_diastolica: 85,
    freq_cardiaca: 110, spo2: 93, temperatura: 37.2, glasgow_ocular: 3, glasgow_verbal: 4, glasgow_motor: 5,
    triagem_manchester: 'VERMELHO', triagem_start: 'VERMELHO', conduta: 'Midazolam IM; via aérea protegida.', encaminhamento: 'UTI',
    medicamentos: [{ nome: 'Midazolam', dose: '10 mg', via: 'IM', horario: dt }],
  });
  assert.equal(a.status, 201);
  // pessoa SEM e-mail
  await core('POST', '/pessoa', med, { id: ids.p2, nome: `Sem Email ${run}`, cpf: `5${run.slice(0, 2)}.${run.slice(2, 5)}.${run.slice(5, 8)}-02` });
  await core('POST', '/prontuario', med, { id: ids.pr2, pessoa_id: ids.p2 });
  await core('POST', '/atendimento', med, { id: ids.at2, pessoa_id: ids.p2, data_hora: dt, queixa_principal: 'Queda' });
});

test('PDF de atendimento com texto longo e medicamentos (várias linhas)', async () => {
  const res = await call(BIZ, 'GET', `/ficha/${ids.at}/pdf`, med, undefined, true);
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  require('fs').writeFileSync(require('path').join(require('os').tmpdir(), `ficha-teste-${run}.pdf`), buf);
});

test('POST /ficha/{id}/email: valida entrada e informa erros claros', async () => {
  const inv = await biz('POST', `/ficha/${ids.at}/email`, med, { destinatario: 'isso-nao-e-email' });
  assert.equal(inv.status, 422);
  assert.equal(inv.body.erro.codigo, 'EMAIL_INVALIDO');
  const sem = await biz('POST', `/ficha/${ids.at2}/email`, med, {});
  assert.equal(sem.status, 422);
  assert.equal(sem.body.erro.codigo, 'DESTINATARIO_AUSENTE');
  assert.equal((await biz('POST', `/ficha/${randomUUID()}/email`, med, { destinatario: 'a@b.com' })).status, 404);
});

test('POST /ficha/{id}/email: e-mail chega ao Mailpit com a ficha em anexo (roteiro 17)', { skip: false }, async (t) => {
  if (!mailpitOn) { t.skip('Mailpit não está rodando em ' + MAILPIT); return; }
  const dest = `familiar-${run}@exemplo.test`;
  const r = await biz('POST', `/ficha/${ids.at}/email`, med, { destinatario: dest, mensagem: 'Segue a ficha do atendimento.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.enviado, true);
  assert.match(r.body.anexo, /^ficha-atendimento-maria-ferreira-.*\.pdf$/);
  await sleep(500);
  const lista = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + dest)}`)).json();
  assert.equal(lista.messages.length, 1);
  const msg = await (await fetch(`${MAILPIT}/api/v1/message/${lista.messages[0].ID}`)).json();
  assert.match(msg.Subject, /Ficha de Atendimento - Maria Ferreira/);
  assert.equal(msg.Attachments.length, 1);
  assert.equal(msg.Attachments[0].ContentType, 'application/pdf');
  assert.ok(msg.Attachments[0].Size > 3000);
  assert.match(msg.Text, /Segue a ficha do atendimento/);
  // sem "destinatario": usa o e-mail cadastrado na pessoa
  const r2 = await biz('POST', `/ficha/${ids.at}/email`, med, {});
  assert.equal(r2.body.destinatario, `maria-${run}@exemplo.test`);
  const hist = await biz('GET', `/ficha/${ids.at}/emails`, med);
  assert.ok(hist.body.length >= 2 && hist.body.every((h) => h.sucesso === true));
});

test('e-mail: SMTP fora do ar devolve 502 claro e fica registrado', async (t) => {
  if (mailpitOn) { t.skip('Mailpit está no ar; este cenário só roda com o SMTP parado'); return; }
  const r = await biz('POST', `/ficha/${ids.at}/email`, med, { destinatario: 'a@b.com' });
  assert.equal(r.status, 502);
  assert.equal(r.body.erro.codigo, 'EMAIL_FALHOU');
  const hist = await biz('GET', `/ficha/${ids.at}/emails`, med);
  assert.equal(hist.body[0].sucesso, false);
});

test('auditoria: o business-service registra todos os acessos (inclusive 401)', async () => {
  await sleep(600);
  const logs = (await core('GET', '/log?servico=business&limit=300', adm)).body;
  const pdf = logs.find((l) => l.rota.endsWith('/pdf') && l.status_code === 200);
  assert.ok(pdf && pdf.profissional_id && pdf.ip_cliente && pdf.metodo === 'GET' && Number(pdf.tempo_ms) >= 0 && pdf.ocorrido_em);
  assert.ok(logs.some((l) => l.status_code === 401 && !l.profissional_id));
  assert.ok(logs.some((l) => l.rota === '/medicamento'));
});

test('limpeza dos dados de teste', async () => {
  for (const [a, pr, p] of [[ids.at, ids.pr, ids.p], [ids.at2, ids.pr2, ids.p2]]) {
    await core('DELETE', `/atendimento/detalhe/${a}`, adm);
    await core('DELETE', `/prontuario/${p}`, adm);
    await core('DELETE', `/pessoa/${p}`, adm);
  }
  assert.equal((await core('GET', `/pessoa/${ids.p}`, med)).status, 404);
});
