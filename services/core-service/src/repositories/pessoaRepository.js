const BaseRepository = require('./base');
const { pool } = require('../db');

const COLUMNS = ['id', 'nome', 'cpf', 'data_nascimento', 'sexo', 'telefone', 'email', 'contato_emergencia',
  'criado_por', 'origem', 'client_created_at', 'client_updated_at'];

class PessoaRepository extends BaseRepository {
  constructor() { super('core.pessoa', COLUMNS); }

  // CPF comparado só pelos dígitos ("900.000.000-01" == "90000000001")
  async findByCpf(cpf, db = pool) {
    const digits = String(cpf || '').replace(/\D/g, '');
    if (!digits) return null;
    const r = await db.query(`SELECT * FROM core.pessoa WHERE regexp_replace(coalesce(cpf,''), '\\D', '', 'g') = $1`, [digits]);
    return r.rows[0] || null;
  }

  async list({ q, limit = 500, offset = 0 } = {}, db = pool) {
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE nome ILIKE $1 OR coalesce(cpf,'') ILIKE $1`;
    }
    params.push(limit, offset);
    const r = await db.query(
      `SELECT * FROM core.pessoa ${where} ORDER BY nome LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return r.rows;
  }
}

module.exports = new PessoaRepository();
