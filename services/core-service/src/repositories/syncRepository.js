// Persistência da sincronização: operações da Outbox recebidas (idempotência),
// aliases de ids fundidos e consulta incremental (pull).
const { pool } = require('../db');

class SyncRepository {
  // Operações REJECTED não contam como "já processadas": podem ser reenviadas.
  async findOp(opId, db = pool) {
    const r = await db.query(`SELECT * FROM core.sync_operation WHERE op_id = $1 AND resultado <> 'REJECTED'`, [opId]);
    return r.rows[0] || null;
  }

  async saveOp(op, db = pool) {
    await db.query(
      `INSERT INTO core.sync_operation (op_id, entidade, operacao, registro_id, profissional_id, resultado, detalhe, client_created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (op_id) DO UPDATE SET resultado = EXCLUDED.resultado, detalhe = EXCLUDED.detalhe, recebido_em = now()`,
      [op.op_id, op.entidade, op.operacao, op.registro_id, op.profissional_id, op.resultado,
        JSON.stringify(op.detalhe || {}), op.client_created_at || null]);
  }

  async findAlias(localId, db = pool) {
    const r = await db.query('SELECT * FROM core.id_alias WHERE local_id = $1', [localId]);
    return r.rows[0] || null;
  }

  async saveAlias(localId, entidade, canonicalId, db = pool) {
    await db.query(
      `INSERT INTO core.id_alias (local_id, entidade, canonical_id) VALUES ($1,$2,$3) ON CONFLICT (local_id) DO NOTHING`,
      [localId, entidade, canonicalId]);
  }

  // Pull incremental: tudo que mudou no servidor depois de `since`.
  // O cursor devolvido recua 5 s para não perder commits concorrentes (reenvio é inofensivo: o cliente faz upsert).
  async pull(since, db = pool) {
    const t = await db.query(`SELECT now() AS server_time, now() - interval '5 seconds' AS cursor`);
    const pessoas = await db.query('SELECT * FROM core.pessoa WHERE updated_at > $1 ORDER BY updated_at', [since]);
    const prontuarios = await db.query('SELECT * FROM core.prontuario WHERE updated_at > $1 ORDER BY updated_at', [since]);
    const atendimentos = await db.query(
      `SELECT a.*, COALESCE((SELECT json_agg(json_build_object('id', m.id, 'medicamento_id', m.medicamento_id, 'nome', m.nome,
          'dose', m.dose, 'via', m.via, 'horario', m.horario) ORDER BY m.horario NULLS LAST, m.nome)
          FROM core.atendimento_medicamento m WHERE m.atendimento_id = a.id), '[]'::json) AS medicamentos
         FROM core.atendimento a WHERE a.updated_at > $1 ORDER BY a.updated_at`, [since]);
    return {
      server_time: t.rows[0].server_time, cursor: t.rows[0].cursor,
      pessoas: pessoas.rows, prontuarios: prontuarios.rows, atendimentos: atendimentos.rows,
    };
  }
}

module.exports = new SyncRepository();
