const { test } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { validate, pessoaInput, pessoaUpdate, prontuarioInput, prontuarioUpdate, atendimentoInput, atendimentoUpdate, syncEnvelope, syncPushBody, logBody } = require('../src/validation');
const { parseUuid } = require('../src/routes/helpers');
const id = '00000000-0000-4000-8000-0000000000b1';
const older = '11111111-1111-1111-1111-111111111111';
const ts = '2026-11-17T15:30:00+00:00';
test('Zod 4: UUIDs legados e campos opcionais/atualizações parciais', () => {
  assert.equal(parseUuid(older), older);
  assert.throws(() => parseUuid('invalido'), e => e.status === 422);
  assert.equal(validate(pessoaInput, { nome: ' Pessoa Teste ', cpf: '' }).cpf, null);
  assert.equal(validate(pessoaInput, { nome: ' Pessoa Teste ' }).nome, 'Pessoa Teste');
  assert.deepEqual(validate(pessoaUpdate, { email: '' }), { email: null });
  assert.deepEqual(validate(prontuarioUpdate, {}), {});
  assert.deepEqual(validate(atendimentoUpdate, { descricao: 'Teste' }), { descricao: 'Teste' });
  assert.equal(validate(prontuarioInput, { pessoa_id: id }).pessoa_id, id);
  assert.throws(() => validate(pessoaInput, { nome: 'A' }), e => e.status === 422);
});
test('Zod 4: atendimento, sinais vitais e medicamentos', () => {
  const input = { pessoa_id: id, data_hora: ts, queixa_principal: 'Teste', spo2: '98', temperatura: '36.5', medicamentos: [{ nome: 'Fictício', dose: 'Teste', medicamento_id: id }] };
  const parsed = validate(atendimentoInput, input);
  assert.equal(parsed.spo2, 98);
  assert.equal(parsed.temperatura, 36.5);
  assert.equal(parsed.medicamentos[0].medicamento_id, id);
  assert.throws(() => validate(atendimentoInput, {...input, spo2: 101}), e => e.status === 422);
  assert.throws(() => validate(atendimentoInput, {...input, medicamentos: Array(51).fill(input.medicamentos[0])}), e => e.status === 422);
});
test('Zod 4: envelope da outbox conserva payload e origem', () => {
  const payload = { id, nome: 'Pessoa Teste', origem_registro: 'OFFLINE', client_created_at: ts, outros: { valor: 1 } };
  const op = { op_id: id, entidade: 'pessoa', operacao: 'CREATE', registro_id: id, payload };
  assert.deepEqual(validate(syncEnvelope, op).payload, payload);
  assert.equal(validate(syncPushBody, { operacoes: [op] }).operacoes.length, 1);
  assert.throws(() => validate(syncEnvelope, {...op, payload: []}), e => e.status === 422);
  assert.throws(() => validate(syncPushBody, { operacoes: Array(501).fill(op) }), e => e.status === 422);
});
test('Zod 4: envio de logs offline', () => {
  const log = { log_id: id, ocorrido_em: ts, metodo: 'POST', rota: '/pessoa', status_code: 201, tempo_ms: 0 };
  assert.equal(validate(logBody, { registros: [log] }).registros[0].log_id, id);
  assert.throws(() => validate(logBody, { registros: [] }), e => e.status === 422);
});
