// =====================================================================
// PADRÃO STRATEGY - resolução de conflitos na sincronização.
// Cada estratégia decide o que fazer quando o registro que chega do cliente
// diverge do que já existe no servidor. O SyncService só conhece a interface
// resolve(); trocar o algoritmo não exige alterar o serviço.
// =====================================================================
const config = require('../config');

// Campos de negócio comparados em cada entidade (metadados ficam de fora).
const FIELDS = {
  pessoa: ['nome', 'cpf', 'data_nascimento', 'sexo', 'telefone', 'email', 'contato_emergencia'],
  prontuario: ['tipo_sanguineo', 'alergias', 'condicoes_cronicas', 'medicamentos_uso_continuo', 'observacoes'],
  atendimento: ['data_hora', 'local_ocorrencia', 'queixa_principal', 'descricao', 'pa_sistolica', 'pa_diastolica',
    'freq_cardiaca', 'freq_respiratoria', 'spo2', 'temperatura', 'glicemia', 'glasgow_ocular', 'glasgow_verbal',
    'glasgow_motor', 'triagem_manchester', 'triagem_start', 'conduta', 'encaminhamento', 'medicamentos'],
};

const TS_FIELDS = new Set(['data_hora', 'horario']);
const NUM_FIELDS = new Set(['pa_sistolica', 'pa_diastolica', 'freq_cardiaca', 'freq_respiratoria', 'spo2',
  'temperatura', 'glicemia', 'glasgow_ocular', 'glasgow_verbal', 'glasgow_motor']);

function normMeds(list) {
  return (list || [])
    .map((m) => ({
      medicamento_id: m.medicamento_id || null, nome: String(m.nome).trim(), dose: String(m.dose).trim(),
      via: m.via || null, horario: m.horario ? new Date(m.horario).toISOString() : null,
    }))
    .map((m) => JSON.stringify(m))
    .sort();
}

// Normaliza valores para comparação (null/''/undefined iguais; datas em ISO; números como texto).
function norm(field, v) {
  if (v === undefined || v === null || v === '') return null;
  if (field === 'medicamentos') { const n = normMeds(v); return n.length ? JSON.stringify(n) : null; }
  if (v instanceof Date) return v.toISOString();
  if (TS_FIELDS.has(field)) return new Date(v).toISOString();
  if (NUM_FIELDS.has(field)) return String(Number(v));
  return typeof v === 'string' ? v.trim() : String(v);
}

function diffFields(server, incoming, fields) {
  return fields.filter((f) => incoming[f] !== undefined && norm(f, server[f]) !== norm(f, incoming[f]));
}

const time = (row) => new Date(row.client_updated_at).getTime();
const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj[f] === undefined ? null : obj[f]]));

class ConflictStrategy {
  get nome() { throw new Error('não implementado'); }
  /**
   * @returns {{estrategia, vencedor:'client'|'server'|'merged', campos:string[], conflitantes:string[],
   *            aplicar:object, alterado:boolean, client_updated_at?:any}}
   */
  // eslint-disable-next-line no-unused-vars
  resolve(server, incoming, fields) { throw new Error('não implementado'); }
}

// O registro com carimbo de data/hora mais recente vence (registro inteiro). Empate: servidor.
class LastWriteWinsStrategy extends ConflictStrategy {
  get nome() { return 'LAST_WRITE_WINS'; }
  resolve(server, incoming, fields) {
    const campos = diffFields(server, incoming, fields);
    const clientVence = campos.length > 0 && time(incoming) > time(server);
    return {
      estrategia: this.nome, vencedor: clientVence ? 'client' : 'server', campos, conflitantes: campos,
      aplicar: clientVence ? pick(incoming, campos) : {}, alterado: clientVence,
      client_updated_at: clientVence ? incoming.client_updated_at : undefined,
    };
  }
}

// O servidor é a fonte da verdade: dados divergentes do cliente são ignorados.
class ServerWinsStrategy extends ConflictStrategy {
  get nome() { return 'SERVER_WINS'; }
  resolve(server, incoming, fields) {
    const campos = diffFields(server, incoming, fields);
    return { estrategia: this.nome, vencedor: 'server', campos, conflitantes: campos, aplicar: {}, alterado: false };
  }
}

// Mescla campo a campo: preenche lacunas de um lado com o outro; se ambos têm valor diferente, o mais recente vence.
class FieldMergeStrategy extends ConflictStrategy {
  get nome() { return 'FIELD_MERGE'; }
  resolve(server, incoming, fields) {
    const campos = diffFields(server, incoming, fields);
    const clientNewer = time(incoming) > time(server);
    const aplicar = {}; const conflitantes = [];
    for (const f of campos) {
      const sv = norm(f, server[f]); const iv = norm(f, incoming[f]);
      if (sv === null) aplicar[f] = incoming[f];
      else if (iv === null) continue; // mantém o do servidor
      else { conflitantes.push(f); if (clientNewer) aplicar[f] = incoming[f]; }
    }
    const aplicados = Object.keys(aplicar).length;
    let vencedor = 'merged';
    if (aplicados === 0) vencedor = 'server';
    else if (aplicados === campos.length) vencedor = 'client';
    return {
      estrategia: this.nome, vencedor, campos, conflitantes, aplicar, alterado: aplicados > 0,
      client_updated_at: aplicados > 0 && clientNewer ? incoming.client_updated_at : undefined,
    };
  }
}

// =====================================================================
// PADRÃO FACTORY - escolhe a estratégia de cada entidade (ou a forçada via .env).
// =====================================================================
const REGISTRY = {
  LAST_WRITE_WINS: new LastWriteWinsStrategy(),
  SERVER_WINS: new ServerWinsStrategy(),
  FIELD_MERGE: new FieldMergeStrategy(),
};
const DEFAULTS = { pessoa: 'FIELD_MERGE', prontuario: 'FIELD_MERGE', atendimento: 'LAST_WRITE_WINS' };

const ConflictStrategyFactory = {
  forEntity(entidade) {
    const forced = config.conflictStrategy;
    const nome = forced !== 'DEFAULT' && REGISTRY[forced] ? forced : DEFAULTS[entidade];
    return REGISTRY[nome];
  },
};

module.exports = {
  FIELDS, ConflictStrategy, LastWriteWinsStrategy, ServerWinsStrategy, FieldMergeStrategy,
  ConflictStrategyFactory, diffFields, pick, norm,
};
