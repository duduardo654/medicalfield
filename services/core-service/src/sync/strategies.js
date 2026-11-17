// Padrão STRATEGY: algoritmos intercambiáveis de resolução de conflito na sincronização.
// Um conflito ocorre quando o servidor já possui o registro (mesmo id, ou mesma chave natural)
// e o cliente envia uma versão diferente.
//   existente / recebido = { dados: {coluna: valor}, ts: milissegundos de client_updated_at }
//   retorno              = { vencedor: 'EXISTENTE' | 'RECEBIDO' | 'MESCLADO', dados }
const config = require('../config');
const { ApiError } = require('../errors');

class EstrategiaConflito {
  get nome() { throw new Error('não implementado'); }
  resolver() { throw new Error('não implementado'); }
}

// Prevalece o registro com data/hora de edição mais recente (empate: mantém o do servidor).
class UltimaEscritaVence extends EstrategiaConflito {
  get nome() { return 'LAST_WRITE_WINS'; }
  resolver(existente, recebido) {
    return recebido.ts > existente.ts
      ? { vencedor: 'RECEBIDO', dados: { ...recebido.dados } }
      : { vencedor: 'EXISTENTE', dados: { ...existente.dados } };
  }
}

// O servidor é sempre a fonte da verdade; o que o cliente enviou é descartado.
class ServidorVence extends EstrategiaConflito {
  get nome() { return 'SERVER_WINS'; }
  resolver(existente) {
    return { vencedor: 'EXISTENTE', dados: { ...existente.dados } };
  }
}

// Mescla campo a campo: vale o mais recente; se ele estiver vazio, aproveita o valor do mais antigo.
class MesclaPorCampo extends EstrategiaConflito {
  get nome() { return 'FIELD_MERGE'; }
  resolver(existente, recebido) {
    const [novo, antigo] = recebido.ts > existente.ts ? [recebido, existente] : [existente, recebido];
    const dados = {};
    for (const c of Object.keys(existente.dados)) {
      dados[c] = novo.dados[c] !== null && novo.dados[c] !== undefined ? novo.dados[c] : antigo.dados[c] ?? null;
    }
    return { vencedor: 'MESCLADO', dados };
  }
}

// Padrão FACTORY: escolhe a estratégia pelo nome (padrão vem do .env / pode ser sobrescrito no push).
const REGISTRO = [UltimaEscritaVence, ServidorVence, MesclaPorCampo].map((C) => new C());

function criarEstrategia(nome) {
  const alvo = (nome || config.estrategiaPadrao).toUpperCase();
  const e = REGISTRO.find((x) => x.nome === alvo);
  if (!e) {
    throw new ApiError(422, 'ESTRATEGIA_INVALIDA', `Estratégia desconhecida. Use: ${REGISTRO.map((x) => x.nome).join(', ')}.`);
  }
  return e;
}

module.exports = { criarEstrategia, EstrategiaConflito, UltimaEscritaVence, ServidorVence, MesclaPorCampo };
