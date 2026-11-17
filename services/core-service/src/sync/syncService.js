// =====================================================================
// SyncService - recebe a fila Outbox do cliente (push) e devolve mudanças (pull).
//
// Garantias:
//  * Idempotência: cada operação tem um op_id; reenviar a mesma operação devolve DUPLICATE
//    sem alterar nada. Mesmo com op_id novo, registro idêntico também vira DUPLICATE.
//  * Atomicidade: cada operação roda em UMA transação (tudo ou nada).
//  * Integridade: prontuário exige pessoa; atendimento exige prontuário da mesma pessoa.
//  * Duplicidade offline: duas pessoas com o mesmo CPF e ids diferentes são FUNDIDAS (MERGED);
//    o id descartado vira um alias e as operações seguintes são redirecionadas ao registro oficial.
//  * Só se responde "persistido" (APPLIED/MERGED/...) depois do COMMIT.
// =====================================================================
const { withTransaction } = require('../db');
const { ApiError } = require('../middleware/errors');
const {
  validate, syncEnvelope, pessoaInput, prontuarioInput, atendimentoInput,
} = require('../validation');
const pessoaRepo = require('../repositories/pessoaRepository');
const prontuarioRepo = require('../repositories/prontuarioRepository');
const atendimentoRepo = require('../repositories/atendimentoRepository');
const syncRepo = require('../repositories/syncRepository');
const { FIELDS, ConflictStrategyFactory, diffFields, pick } = require('./conflictStrategies');

class SyncRejected extends Error {
  constructor(codigo, mensagem, retentavel = false) {
    super(mensagem);
    this.codigo = codigo;
    this.retentavel = retentavel;
  }
}

class SyncService {
  async push(user, operacoes) {
    const resultados = [];
    for (const op of operacoes) resultados.push(await this._processar(user, op)); // ordem preservada
    return resultados;
  }

  pull(since) { return syncRepo.pull(since); }

  async _processar(user, rawOp) {
    let op;
    try {
      op = validate(syncEnvelope, rawOp);
    } catch (e) {
      return {
        op_id: rawOp && rawOp.op_id ? rawOp.op_id : null, entidade: rawOp && rawOp.entidade ? rawOp.entidade : null,
        resultado: 'REJECTED', codigo: 'OPERACAO_INVALIDA', mensagem: e.mensagem || e.message,
        detalhes: e.detalhes, retentavel: false,
      };
    }
    const id = op.registro_id || (op.payload && op.payload.id);
    const base = { op_id: op.op_id, entidade: op.entidade, registro_id: id };
    try {
      if (!id) throw new SyncRejected('ID_AUSENTE', 'Informe registro_id (ou payload.id) com o UUID gerado no cliente.');
      return await withTransaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [op.op_id]); // serializa reenvios simultâneos
        const prior = await syncRepo.findOp(op.op_id, client);
        if (prior) {
          return { ...base, canonical_id: (prior.detalhe && prior.detalhe.canonical_id) || prior.registro_id,
            resultado: 'DUPLICATE', resultado_original: prior.resultado, retentavel: false };
        }
        const ctx = {
          user, op, id, responsavel: op.profissional_id || user.id, agora: new Date().toISOString(),
        };
        const out = await this._aplicar(client, ctx);
        await syncRepo.saveOp({
          op_id: op.op_id, entidade: op.entidade, operacao: op.operacao, registro_id: id,
          profissional_id: ctx.responsavel, resultado: out.resultado, client_created_at: op.client_created_at,
          detalhe: { canonical_id: out.canonical_id, sincronizado_por: user.id, ...(out.detalhe || {}) },
        }, client);
        return { ...base, canonical_id: out.canonical_id, resultado: out.resultado, version: out.version,
          detalhe: out.detalhe, retentavel: false };
      });
    } catch (err) {
      const rej = this._rejeicao(err);
      if (id) {
        await syncRepo.saveOp({
          op_id: op.op_id, entidade: op.entidade, operacao: op.operacao, registro_id: id,
          profissional_id: op.profissional_id || user.id, resultado: 'REJECTED',
          detalhe: { codigo: rej.codigo, mensagem: rej.mensagem },
        }).catch(() => {});
      }
      return { ...base, resultado: 'REJECTED', ...rej };
    }
  }

  _rejeicao(err) {
    if (err instanceof SyncRejected) return { codigo: err.codigo, mensagem: err.message, retentavel: err.retentavel };
    if (err instanceof ApiError) return { codigo: err.codigo, mensagem: err.mensagem, detalhes: err.detalhes, retentavel: false };
    if (['23503', '23001', '23000'].includes(err.code)) return { codigo: 'REFERENCIA_INVALIDA', mensagem: 'Registro depende de outro que ainda não existe no servidor.', retentavel: true };
    if (['23514', '22P02', '22007', '22008'].includes(err.code)) return { codigo: 'DADOS_INVALIDOS', mensagem: 'Valores fora dos limites ou em formato inválido.', retentavel: false };
    console.error('[sync] erro inesperado:', err);
    return { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno ao processar a operação; tente novamente.', retentavel: true };
  }

  _aplicar(client, ctx) {
    switch (ctx.op.entidade) {
      case 'pessoa': return this._pessoa(client, ctx);
      case 'prontuario': return this._prontuario(client, ctx);
      default: return this._atendimento(client, ctx);
    }
  }

  async _canonico(client, id) {
    const alias = await syncRepo.findAlias(id, client);
    return alias ? alias.canonical_id : id;
  }

  _carimbos(data, op, agora) {
    const criado = data.client_created_at || op.client_created_at || agora;
    return { client_created_at: criado, client_updated_at: data.client_updated_at || criado };
  }

  // Reconcilia registro recebido x existente usando a Strategy da entidade.
  async _reconciliar(client, entidade, repo, existing, incoming, baseVersion, extras) {
    const fields = FIELDS[entidade];
    // Edição sobre a última versão conhecida pelo cliente = sem conflito: aplica direto.
    if (baseVersion !== undefined && baseVersion === existing.version) {
      const campos = diffFields(existing, incoming, fields);
      if (campos.length === 0) return { resultado: 'DUPLICATE', canonical_id: existing.id, version: existing.version, detalhe: { motivo: 'registro idêntico' } };
      const updated = await repo.update(existing.id, { ...pick(incoming, campos), client_updated_at: incoming.client_updated_at }, client);
      if (extras) await extras(campos, incoming);
      return { resultado: 'APPLIED', canonical_id: existing.id, version: updated.version, detalhe: { campos } };
    }
    const dec = ConflictStrategyFactory.forEntity(entidade).resolve(existing, incoming, fields);
    if (dec.campos.length === 0) {
      return { resultado: 'DUPLICATE', canonical_id: existing.id, version: existing.version, detalhe: { motivo: 'registro idêntico' } };
    }
    let version = existing.version;
    if (dec.alterado) {
      const patch = { ...dec.aplicar };
      if (dec.client_updated_at) patch.client_updated_at = dec.client_updated_at;
      const updated = await repo.update(existing.id, patch, client);
      version = updated.version;
      if (extras) await extras(Object.keys(dec.aplicar), incoming);
    }
    return {
      resultado: 'CONFLICT_RESOLVED', canonical_id: existing.id, version,
      detalhe: { estrategia: dec.estrategia, vencedor: dec.vencedor, campos: dec.campos, conflitantes: dec.conflitantes },
    };
  }

  async _pessoa(client, ctx) {
    const { op, id, responsavel, agora } = ctx;
    const data = validate(pessoaInput, { ...op.payload, id });
    const incoming = { ...data, id, criado_por: responsavel, origem: 'OFFLINE', ...this._carimbos(data, op, agora) };

    const existing = await pessoaRepo.findById(await this._canonico(client, id), client);
    if (existing) return this._reconciliar(client, 'pessoa', pessoaRepo, existing, incoming, data.base_version);

    if (incoming.cpf) {
      const dup = await pessoaRepo.findByCpf(incoming.cpf, client);
      if (dup) { // mesma pessoa cadastrada por outro dispositivo -> funde
        const r = await this._reconciliar(client, 'pessoa', pessoaRepo, dup, incoming);
        await syncRepo.saveAlias(id, 'pessoa', dup.id, client);
        return { ...r, resultado: 'MERGED', canonical_id: dup.id, detalhe: { ...r.detalhe, motivo: 'CPF já cadastrado', id_descartado: id } };
      }
    }
    const created = await pessoaRepo.insert(incoming, client);
    return { resultado: 'APPLIED', canonical_id: created.id, version: created.version };
  }

  async _prontuario(client, ctx) {
    const { op, id, responsavel, agora } = ctx;
    const data = validate(prontuarioInput, { ...op.payload, id });
    const pessoaId = await this._canonico(client, data.pessoa_id);
    if (!(await pessoaRepo.findById(pessoaId, client))) {
      throw new SyncRejected('PESSOA_INEXISTENTE', `A pessoa ${data.pessoa_id} ainda não existe no servidor.`, true);
    }
    const incoming = { ...data, id, pessoa_id: pessoaId, criado_por: responsavel, origem: 'OFFLINE', ...this._carimbos(data, op, agora) };

    const existing = await prontuarioRepo.findById(await this._canonico(client, id), client);
    if (existing) {
      if (existing.pessoa_id !== pessoaId) throw new SyncRejected('PRONTUARIO_DE_OUTRA_PESSOA', 'O prontuário informado pertence a outra pessoa.');
      return this._reconciliar(client, 'prontuario', prontuarioRepo, existing, incoming, data.base_version);
    }
    const dup = await prontuarioRepo.findByPessoaId(pessoaId, client); // 1 prontuário por pessoa
    if (dup) {
      const r = await this._reconciliar(client, 'prontuario', prontuarioRepo, dup, incoming);
      await syncRepo.saveAlias(id, 'prontuario', dup.id, client);
      return { ...r, resultado: 'MERGED', canonical_id: dup.id, detalhe: { ...r.detalhe, motivo: 'pessoa já possui prontuário', id_descartado: id } };
    }
    const created = await prontuarioRepo.insert(incoming, client);
    return { resultado: 'APPLIED', canonical_id: created.id, version: created.version };
  }

  async _atendimento(client, ctx) {
    const { user, op, id, responsavel, agora } = ctx;
    const data = validate(atendimentoInput, { ...op.payload, id });
    const pessoaId = await this._canonico(client, data.pessoa_id);
    const prontuario = data.prontuario_id
      ? await prontuarioRepo.findById(await this._canonico(client, data.prontuario_id), client)
      : await prontuarioRepo.findByPessoaId(pessoaId, client);
    if (!prontuario) throw new SyncRejected('PRONTUARIO_INEXISTENTE', 'O prontuário do atendimento ainda não existe no servidor.', true);
    if (prontuario.pessoa_id !== pessoaId) throw new SyncRejected('PRONTUARIO_DE_OUTRA_PESSOA', 'O prontuário informado pertence a outra pessoa.');

    const incoming = {
      ...data, id, pessoa_id: pessoaId, prontuario_id: prontuario.id, profissional_id: responsavel,
      profissional_nome: data.profissional_nome || (responsavel === user.id ? user.nome : null),
      profissional_identificacao: data.profissional_identificacao || (responsavel === user.id ? user.identificacao : null),
      origem: 'OFFLINE', ...this._carimbos(data, op, agora),
    };
    const extras = async (campos) => {
      if (campos.includes('medicamentos') && incoming.medicamentos) await atendimentoRepo.replaceMedicamentos(id, incoming.medicamentos, client);
    };
    const existing = await atendimentoRepo.findWithMedicamentos(id, client);
    if (existing) {
      if (existing.pessoa_id !== pessoaId) throw new SyncRejected('ATENDIMENTO_DE_OUTRA_PESSOA', 'Este atendimento pertence a outra pessoa.');
      return this._reconciliar(client, 'atendimento', atendimentoRepo, existing, incoming, data.base_version, extras);
    }
    const created = await atendimentoRepo.insert(incoming, client);
    await atendimentoRepo.replaceMedicamentos(id, incoming.medicamentos || [], client);
    return { resultado: 'APPLIED', canonical_id: created.id, version: created.version };
  }
}

module.exports = new SyncService();
