// Repository genérico: isola todo o SQL das rotas e dos serviços.
// Nomes de tabela/coluna vêm de constantes do código (nunca da requisição).
const { pool } = require('../db');

class BaseRepository {
  constructor(table, columns) {
    this.table = table;
    this.columns = columns;
  }

  _pick(obj) {
    const out = {};
    for (const c of this.columns) if (obj[c] !== undefined) out[c] = obj[c];
    return out;
  }

  async findById(id, db = pool) {
    const r = await db.query(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  async insert(obj, db = pool) {
    const data = this._pick(obj);
    const keys = Object.keys(data);
    const sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
    const r = await db.query(sql, keys.map((k) => data[k]));
    return r.rows[0];
  }

  async update(id, obj, db = pool) {
    const data = this._pick(obj);
    delete data.id;
    const keys = Object.keys(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    sets.push('version = version + 1', 'updated_at = now()');
    const sql = `UPDATE ${this.table} SET ${sets.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`;
    const r = await db.query(sql, [...keys.map((k) => data[k]), id]);
    return r.rows[0] || null;
  }

  async delete(id, db = pool) {
    const r = await db.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
    return r.rowCount > 0;
  }
}

module.exports = BaseRepository;
