// Teste unitário (não precisa dos serviços no ar): mapeamento de erros do PostgreSQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { toApiError } = require('../src/middleware/errors');

test('violações de chave estrangeira viram 409 em qualquer versão do PostgreSQL', () => {
  for (const code of ['23503', '23001', '23000']) {
    const e = toApiError({ code, detail: 'detalhe' });
    assert.equal(e.status, 409, `SQLSTATE ${code}`);
    assert.equal(e.codigo, 'REFERENCIA_INVALIDA');
  }
});

test('outros códigos: duplicidade 409, CHECK 422, desconhecido não é tratado (500)', () => {
  assert.equal(toApiError({ code: '23505', detail: 'x' }).status, 409);
  assert.equal(toApiError({ code: '23514', detail: 'x' }).status, 422);
  assert.equal(toApiError({ code: 'XX000' }), null);
});
