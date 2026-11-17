const { randomUUID } = require('crypto');
const BaseRepository = require('./base');
const { pool } = require('../db');

const COLUMNS = ['id', 'prontuario_id', 'pessoa_id', 'profissional_id', 'profissional_nome', 'profissional_identificacao',
  'data_hora', 'local_ocorrencia', 'queixa_principal', 'descricao', 'pa_sistolica', 'pa_diastolica', 'freq_cardiaca',
  'freq_respiratoria', 'spo2', 'temperatura', 'glicemia', 'glasgow_ocular', 'glasgow_verbal', 'glasgow_motor',
  'triagem_manchester', 'triagem_start', 'conduta', 'encaminhamento', 'origem', 'client_created_at', 'client_updated_at'];

const MEDS = `COALESCE((SELECT json_agg(json_build_object('id', m.id, 'medicamento_id', m.medicamento_id, 'nome', m.nome,
    'dose', m.dose, 'via', m.via, 'horario', m.horario) ORDER BY m.horario NULLS LAST, m.nome)
    FROM core.atendimento_medicamento m WHERE m.atendimento_id = a.id), '[]'::json) AS medicamentos`;

class AtendimentoRepository extends BaseRepository {
  constructor() { super('core.atendimento', COLUMNS); }

  async findWithMedicamentos(id, db = pool) {
    const r = await db.query(`SELECT a.*, ${MEDS} FROM core.atendimento a WHERE a.id = $1`, [id]);
    return r.rows[0] || null;
  }

  async listByPessoa(pessoaId, db = pool) {
    const r = await db.query(
      `SELECT a.*, ${MEDS} FROM core.atendimento a WHERE a.pessoa_id = $1 ORDER BY a.data_hora DESC`, [pessoaId]);
    return r.rows;
  }

  async listAll({ limit = 500, offset = 0 } = {}, db = pool) {
    const r = await db.query(
      `SELECT a.*, p.nome AS pessoa_nome, ${MEDS}
         FROM core.atendimento a JOIN core.pessoa p ON p.id = a.pessoa_id
        ORDER BY a.data_hora DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return r.rows;
  }

  async findDetalhe(id, db = pool) {
    const r = await db.query(
      `SELECT a.*, ${MEDS},
              (SELECT row_to_json(p) FROM core.pessoa p WHERE p.id = a.pessoa_id) AS pessoa,
              (SELECT row_to_json(pr) FROM core.prontuario pr WHERE pr.id = a.prontuario_id) AS prontuario
         FROM core.atendimento a WHERE a.id = $1`, [id]);
    return r.rows[0] || null;
  }

  async replaceMedicamentos(atendimentoId, meds = [], db = pool) {
    await db.query('DELETE FROM core.atendimento_medicamento WHERE atendimento_id = $1', [atendimentoId]);
    for (const m of meds) {
      await db.query(
        `INSERT INTO core.atendimento_medicamento (id, atendimento_id, medicamento_id, nome, dose, via, horario)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [m.id || randomUUID(), atendimentoId, m.medicamento_id || null, m.nome, m.dose, m.via || null, m.horario || null]);
    }
  }
}

module.exports = new AtendimentoRepository();
