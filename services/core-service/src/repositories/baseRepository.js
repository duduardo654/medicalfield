// Padrão Repository: todo o SQL de uma tabela fica numa classe; o restante do código só usa métodos.
// O parâmetro `db` é um client/pool do pg (permite participar de uma transação).
class BaseRepository {
  /**
   * @param tabela        nome qualificado (ex.: core.pessoa)
   * @param colunasInsert colunas aceitas na inserção
   * @param colunasDados  colunas "de negócio" atualizáveis (usadas na comparação e nas estratégias de conflito)
   */
  constructor(tabela, colunasInsert, colunasDados) {
    this.tabela = tabela;
    this.colunasInsert = colunasInsert;
    this.colunasDados = colunasDados;
  }

  async findById(db, id, { paraAtualizar = false } = {}) {
    const r = await db.query(`SELECT * FROM ${this.tabela} WHERE id = $1 ${paraAtualizar ? 'FOR UPDATE' : ''}`, [id]);
    return r.rows[0] || null;
  }

  async exists(db, id) {
    const r = await db.query(`SELECT 1 FROM ${this.tabela} WHERE id = $1`, [id]);
    return r.rowCount > 0;
  }

  async insert(db, rec) {
    const cols = this.colunasInsert.filter((c) => rec[c] !== undefined);
    const sql = `INSERT INTO ${this.tabela} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`;
    return (await db.query(sql, cols.map((c) => rec[c]))).rows[0];
  }

  // Atualiza apenas as colunas de dados; incrementa a versão e renova updated_at (cursor do pull).
  async update(db, id, dados, clientUpdatedAt) {
    const cols = this.colunasDados.filter((c) => dados[c] !== undefined);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`);
    sets.push(`client_updated_at = $${cols.length + 1}`, 'version = version + 1', 'updated_at = now()');
    const params = [...cols.map((c) => dados[c]), clientUpdatedAt, id];
    const r = await db.query(`UPDATE ${this.tabela} SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    return r.rows[0];
  }

  async delete(db, id) {
    const r = await db.query(`DELETE FROM ${this.tabela} WHERE id = $1`, [id]);
    return r.rowCount > 0;
  }

  // Extrai só as colunas de dados de uma linha (para comparar/mesclar).
  dadosDe(row) {
    const o = {};
    for (const c of this.colunasDados) o[c] = row[c] === undefined ? null : row[c];
    return o;
  }
}

module.exports = BaseRepository;
