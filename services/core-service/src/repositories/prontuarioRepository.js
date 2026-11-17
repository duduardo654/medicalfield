const BaseRepository = require('./base');
const { pool } = require('../db');

const COLUMNS = ['id', 'pessoa_id', 'tipo_sanguineo', 'alergias', 'condicoes_cronicas', 'medicamentos_uso_continuo',
  'observacoes', 'criado_por', 'origem', 'client_created_at', 'client_updated_at'];

class ProntuarioRepository extends BaseRepository {
  constructor() { super('core.prontuario', COLUMNS); }

  async findByPessoaId(pessoaId, db = pool) {
    const r = await db.query('SELECT * FROM core.prontuario WHERE pessoa_id = $1', [pessoaId]);
    return r.rows[0] || null;
  }

  // Prontuário + dados resumidos da pessoa (usado pelo Portal e por GET /prontuario/:id)
  async findComPessoaByPessoaId(pessoaId, db = pool) {
    const r = await db.query(
      `SELECT pr.*, json_build_object('id', p.id, 'nome', p.nome, 'cpf', p.cpf, 'data_nascimento', p.data_nascimento,
              'sexo', p.sexo, 'telefone', p.telefone, 'email', p.email, 'contato_emergencia', p.contato_emergencia) AS pessoa
         FROM core.prontuario pr JOIN core.pessoa p ON p.id = pr.pessoa_id WHERE pr.pessoa_id = $1`, [pessoaId]);
    return r.rows[0] || null;
  }

  async listComPessoa({ limit = 500, offset = 0 } = {}, db = pool) {
    const r = await db.query(
      `SELECT pr.*, json_build_object('id', p.id, 'nome', p.nome, 'cpf', p.cpf) AS pessoa
         FROM core.prontuario pr JOIN core.pessoa p ON p.id = pr.pessoa_id
        ORDER BY p.nome LIMIT $1 OFFSET $2`, [limit, offset]);
    return r.rows;
  }
}

module.exports = new ProntuarioRepository();
