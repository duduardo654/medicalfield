// ATENÇÃO: nas rotas /prontuario/:id, o id é o da PESSOA (1 prontuário por pessoa), como no enunciado.
const express = require('express');
const { randomUUID } = require('crypto');
const repo = require('../repositories/prontuarioRepository');
const pessoaRepo = require('../repositories/pessoaRepository');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { exigirAdmin } = require('../middleware/auth');
const { validate, prontuarioInput, prontuarioUpdate } = require('../validation');
const { parseUuid, paginacao } = require('./helpers');

const router = express.Router();
const naoEncontrado = (id) => new ApiError(404, 'PRONTUARIO_NAO_ENCONTRADO', `Pessoa ${id} não possui prontuário.`);

router.get('/', asyncHandler(async (req, res) => {
  res.json(await repo.listComPessoa(paginacao(req)));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const pessoaId = parseUuid(req.params.id, 'id (da pessoa)');
  const pr = await repo.findComPessoaByPessoaId(pessoaId);
  if (!pr) {
    if (!(await pessoaRepo.findById(pessoaId))) throw new ApiError(404, 'PESSOA_NAO_ENCONTRADA', `Pessoa ${pessoaId} não encontrada.`);
    throw naoEncontrado(pessoaId);
  }
  res.json(pr);
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = validate(prontuarioInput, req.body);
  if (!(await pessoaRepo.findById(data.pessoa_id))) {
    throw new ApiError(422, 'PESSOA_INEXISTENTE', `A pessoa ${data.pessoa_id} não existe. Cadastre-a antes de criar o prontuário.`);
  }
  const id = data.id || randomUUID();
  const existente = await repo.findById(id);
  if (existente) return res.status(200).json(existente); // idempotente
  const doPessoa = await repo.findByPessoaId(data.pessoa_id);
  if (doPessoa) throw new ApiError(409, 'PRONTUARIO_JA_EXISTE', 'Esta pessoa já possui prontuário.', [{ prontuario_id_existente: doPessoa.id }]);
  const agora = new Date().toISOString();
  const row = await repo.insert({
    ...data, id, criado_por: req.user.id, origem: 'ONLINE',
    client_created_at: data.client_created_at || agora, client_updated_at: data.client_updated_at || agora,
  });
  res.status(201).location(`/prontuario/${data.pessoa_id}`).json(row);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const pessoaId = parseUuid(req.params.id, 'id (da pessoa)');
  const atual = await repo.findByPessoaId(pessoaId);
  if (!atual) throw naoEncontrado(pessoaId);
  const data = validate(prontuarioUpdate, req.body);
  res.json(await repo.update(atual.id, { ...data, client_updated_at: new Date().toISOString() }));
}));

router.delete('/:id', exigirAdmin, asyncHandler(async (req, res) => {
  const pessoaId = parseUuid(req.params.id, 'id (da pessoa)');
  const atual = await repo.findByPessoaId(pessoaId);
  if (!atual) throw naoEncontrado(pessoaId);
  await repo.delete(atual.id); // falha com 409 se houver atendimentos (FK RESTRICT)
  res.status(204).end();
}));

module.exports = router;
