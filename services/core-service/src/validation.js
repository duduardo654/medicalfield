// Esquemas de validação (zod). Os limites espelham os CHECK do PostgreSQL.
const { z } = require('zod');
const { ApiError } = require('./middleware/errors');

function validate(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const detalhes = r.error.issues.map((i) => ({ campo: i.path.join('.'), problema: i.message }));
    throw new ApiError(422, 'DADOS_INVALIDOS', 'Os dados enviados são inválidos.', detalhes);
  }
  return r.data;
}

const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const toNumber = (v) => (v === '' ? null : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

const uuid = z.string().uuid();
const ts = z.string().datetime({ offset: true });
const optStr = (max = 500) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const optTs = z.preprocess(emptyToNull, ts.nullable().optional());
const optInt = (min, max) => z.preprocess(toNumber, z.number().int().min(min).max(max).nullable().optional());
const optEnum = (vals) => z.preprocess(emptyToNull, z.enum(vals).nullable().optional());

const pessoaInput = z.object({
  id: uuid.optional(),
  nome: z.string().trim().min(2).max(200),
  cpf: optStr(20),
  data_nascimento: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD').nullable().optional()),
  sexo: optEnum(['M', 'F', 'O']),
  telefone: optStr(30),
  email: z.preprocess(emptyToNull, z.string().trim().email().max(200).nullable().optional()),
  contato_emergencia: optStr(300),
  client_created_at: optTs,
  client_updated_at: optTs,
  base_version: z.number().int().optional(),
});
const pessoaUpdate = pessoaInput.omit({ id: true }).partial();

const prontuarioInput = z.object({
  id: uuid.optional(),
  pessoa_id: uuid,
  tipo_sanguineo: optEnum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  alergias: optStr(2000),
  condicoes_cronicas: optStr(2000),
  medicamentos_uso_continuo: optStr(2000),
  observacoes: optStr(4000),
  client_created_at: optTs,
  client_updated_at: optTs,
  base_version: z.number().int().optional(),
});
const prontuarioUpdate = prontuarioInput.omit({ id: true, pessoa_id: true }).partial();

const medicamentoAdministrado = z.object({
  id: uuid.optional(),
  medicamento_id: z.preprocess(emptyToNull, uuid.nullable().optional()),
  nome: z.string().trim().min(1).max(200),
  dose: z.string().trim().min(1).max(100),
  via: optStr(30),
  horario: optTs,
});

const atendimentoInput = z.object({
  id: uuid.optional(),
  pessoa_id: uuid,
  prontuario_id: uuid.optional(),
  profissional_id: uuid.optional(),
  profissional_nome: optStr(200),
  profissional_identificacao: optStr(60),
  data_hora: ts,
  local_ocorrencia: optStr(300),
  queixa_principal: z.string().trim().min(2).max(500),
  descricao: optStr(4000),
  pa_sistolica: optInt(0, 400),
  pa_diastolica: optInt(0, 300),
  freq_cardiaca: optInt(0, 300),
  freq_respiratoria: optInt(0, 100),
  spo2: optInt(0, 100),
  temperatura: z.preprocess(toNumber, z.number().min(20).max(45).nullable().optional()),
  glicemia: optInt(0, 1500),
  glasgow_ocular: optInt(1, 4),
  glasgow_verbal: optInt(1, 5),
  glasgow_motor: optInt(1, 6),
  triagem_manchester: optEnum(['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL']),
  triagem_start: optEnum(['VERMELHO', 'AMARELO', 'VERDE', 'PRETO']),
  conduta: optStr(2000),
  encaminhamento: optStr(500),
  medicamentos: z.array(medicamentoAdministrado).max(50).optional(),
  client_created_at: optTs,
  client_updated_at: optTs,
  base_version: z.number().int().optional(),
});
const atendimentoUpdate = atendimentoInput.omit({ id: true, pessoa_id: true, prontuario_id: true, profissional_id: true }).partial();

const syncEnvelope = z.object({
  op_id: uuid,
  entidade: z.enum(['pessoa', 'prontuario', 'atendimento']),
  operacao: z.enum(['CREATE', 'UPDATE']),
  registro_id: uuid.optional(),
  profissional_id: uuid.optional(),
  client_created_at: optTs,
  payload: z.record(z.any()),
});

const syncPushBody = z.object({ operacoes: z.array(z.any()).min(1).max(500) });

const logBody = z.object({
  registros: z.array(z.object({
    log_id: uuid.optional(),
    ocorrido_em: ts,
    metodo: z.string().trim().min(1).max(10),
    rota: z.string().trim().min(1).max(500),
    status_code: z.number().int().min(0).max(999),
    tempo_ms: z.number().min(0),
    detalhe: optStr(500),
  })).min(1).max(1000),
});

module.exports = {
  validate, uuid, pessoaInput, pessoaUpdate, prontuarioInput, prontuarioUpdate,
  atendimentoInput, atendimentoUpdate, syncEnvelope, syncPushBody, logBody,
};
