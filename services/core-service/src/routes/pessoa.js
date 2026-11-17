const express = require('express');
const { randomUUID } = require('crypto');
const repo = require('../repositories/pessoaRepository');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { exigirAdmin } = require('../middleware/auth');
const { validate, pessoaInput, pessoaUpdate } = require('../validation');
const { parseUuid, paginacao } = require('./helpers');

const router = express.Router();
const naoEncontrada = (id) => new ApiError(404, 'PESSOA_NAO_ENCONTRADA', `Pessoa ${id} não encontrada.`);

router.get('/', asyncHandler(async (req, res) => {
  res.json(await repo.list({ q: req.query.q ? String(req.query.q) : undefined, ...paginacao(req) }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const p = await repo.findById(parseUuid(req.params.id));
  if (!p) throw naoEncontrada(req.params.id);
  res.json(p);
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = validate(pessoaInput, req.body);
  const id = data.id || randomUUID();
  const existente = await repo.findById(id);
  if (existente) return res.status(200).json(existente); // idempotente: mesmo id = mesmo registro
  if (data.cpf) {
    const dup = await repo.findByCpf(data.cpf);
    if (dup) throw new ApiError(409, 'CPF_JA_CADASTRADO', 'Já existe uma pessoa com este CPF.', [{ pessoa_id_existente: dup.id }]);
  }
  const agora = new Date().toISOString();
  const row = await repo.insert({
    ...data, id, criado_por: req.user.id, origem: 'ONLINE',
    client_created_at: data.client_created_at || agora, client_updated_at: data.client_updated_at || agora,
  });
  res.status(201).location(`/pessoa/${id}`).json(row);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseUuid(req.params.id);
  if (!(await repo.findById(id))) throw naoEncontrada(id);
  const data = validate(pessoaUpdate, req.body);
  if (data.cpf) {
    const dup = await repo.findByCpf(data.cpf);
    if (dup && dup.id !== id) throw new ApiError(409, 'CPF_JA_CADASTRADO', 'Outra pessoa já usa este CPF.', [{ pessoa_id_existente: dup.id }]);
  }
  res.json(await repo.update(id, { ...data, client_updated_at: new Date().toISOString() }));
}));

router.delete('/:id', exigirAdmin, asyncHandler(async (req, res) => {
  const id = parseUuid(req.params.id);
  if (!(await repo.delete(id))) throw naoEncontrada(id);
  res.status(204).end();
}));

module.exports = router;
