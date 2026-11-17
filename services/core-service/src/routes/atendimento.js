// GET /atendimento/:id  -> id da PESSOA (todos os atendimentos dela), como no enunciado.
// Operações sobre UM atendimento usam /atendimento/detalhe/:atendimentoId.
const express = require('express');
const { randomUUID } = require('crypto');
const repo = require('../repositories/atendimentoRepository');
const pessoaRepo = require('../repositories/pessoaRepository');
const prontuarioRepo = require('../repositories/prontuarioRepository');
const { withTransaction } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { exigirAdmin } = require('../middleware/auth');
const { validate, atendimentoInput, atendimentoUpdate } = require('../validation');
const { parseUuid, paginacao } = require('./helpers');

const router = express.Router();
const naoEncontrado = (id) => new ApiError(404, 'ATENDIMENTO_NAO_ENCONTRADO', `Atendimento ${id} não encontrado.`);

router.get('/', asyncHandler(async (req, res) => {
  res.json(await repo.listAll(paginacao(req)));
}));

router.get('/detalhe/:atendimentoId', asyncHandler(async (req, res) => {
  const a = await repo.findDetalhe(parseUuid(req.params.atendimentoId, 'atendimentoId'));
  if (!a) throw naoEncontrado(req.params.atendimentoId);
  res.json(a);
}));

router.put('/detalhe/:atendimentoId', asyncHandler(async (req, res) => {
  const id = parseUuid(req.params.atendimentoId, 'atendimentoId');
  if (!(await repo.findById(id))) throw naoEncontrado(id);
  const { medicamentos, ...data } = validate(atendimentoUpdate, req.body);
  await withTransaction(async (client) => {
    await repo.update(id, { ...data, client_updated_at: new Date().toISOString() }, client);
    if (medicamentos) await repo.replaceMedicamentos(id, medicamentos, client);
  });
  res.json(await repo.findWithMedicamentos(id));
}));

router.delete('/detalhe/:atendimentoId', exigirAdmin, asyncHandler(async (req, res) => {
  const id = parseUuid(req.params.atendimentoId, 'atendimentoId');
  if (!(await repo.delete(id))) throw naoEncontrado(id);
  res.status(204).end();
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const pessoaId = parseUuid(req.params.id, 'id (da pessoa)');
  if (!(await pessoaRepo.findById(pessoaId))) throw new ApiError(404, 'PESSOA_NAO_ENCONTRADA', `Pessoa ${pessoaId} não encontrada.`);
  res.json(await repo.listByPessoa(pessoaId));
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = validate(atendimentoInput, req.body);
  if (!(await pessoaRepo.findById(data.pessoa_id))) {
    throw new ApiError(422, 'PESSOA_INEXISTENTE', `A pessoa ${data.pessoa_id} não existe.`);
  }
  const prontuario = data.prontuario_id
    ? await prontuarioRepo.findById(data.prontuario_id)
    : await prontuarioRepo.findByPessoaId(data.pessoa_id);
  if (!prontuario) throw new ApiError(422, 'PRONTUARIO_INEXISTENTE', 'A pessoa não possui prontuário. Crie o prontuário antes de registrar o atendimento.');
  if (prontuario.pessoa_id !== data.pessoa_id) throw new ApiError(422, 'PRONTUARIO_DE_OUTRA_PESSOA', 'O prontuário informado pertence a outra pessoa.');

  const id = data.id || randomUUID();
  const existente = await repo.findWithMedicamentos(id);
  if (existente) return res.status(200).json(existente); // idempotente

  const agora = new Date().toISOString();
  const { medicamentos, ...resto } = data;
  const row = await withTransaction(async (client) => {
    const created = await repo.insert({
      ...resto, id, prontuario_id: prontuario.id, origem: 'ONLINE',
      profissional_id: req.user.id, profissional_nome: req.user.nome, profissional_identificacao: req.user.identificacao, // sempre o autenticado
      client_created_at: data.client_created_at || agora, client_updated_at: data.client_updated_at || agora,
    }, client);
    await repo.replaceMedicamentos(id, medicamentos || [], client);
    return created;
  });
  res.status(201).location(`/atendimento/detalhe/${row.id}`).json(await repo.findWithMedicamentos(row.id));
}));

module.exports = router;
