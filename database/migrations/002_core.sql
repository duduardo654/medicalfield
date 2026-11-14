-- =====================================================================
-- MedicalField - Migration 002: CORE (pessoa, prontuário, atendimento)
-- Chaves primárias UUID geradas no CLIENTE (offline) e reaproveitadas
-- no servidor -> base da idempotência. Sem FK para outros esquemas
-- (microsserviços independentes): profissional_id é só referência lógica.
-- =====================================================================
CREATE TABLE IF NOT EXISTS core.pessoa (
  id                  uuid PRIMARY KEY,
  nome                text NOT NULL,
  cpf                 text UNIQUE,                 -- fictício; chave natural p/ detectar duplicidade
  data_nascimento     date,
  sexo                text CHECK (sexo IN ('M','F','O')),
  telefone            text,
  email               text,                        -- destino padrão da ficha (paciente/familiar)
  contato_emergencia  text,
  criado_por          uuid NOT NULL,               -- auth.profissional.id (referência lógica)
  origem              text NOT NULL DEFAULT 'ONLINE' CHECK (origem IN ('ONLINE','OFFLINE')),
  client_created_at   timestamptz,                 -- quando foi criado no dispositivo
  client_updated_at   timestamptz NOT NULL DEFAULT now(),  -- base do "last write wins"
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),  -- quando chegou ao servidor
  updated_at          timestamptz NOT NULL DEFAULT now()   -- cursor do pull incremental
);

CREATE TABLE IF NOT EXISTS core.prontuario (
  id                       uuid PRIMARY KEY,
  pessoa_id                uuid NOT NULL UNIQUE REFERENCES core.pessoa(id) ON DELETE RESTRICT,  -- 1 prontuário por pessoa
  tipo_sanguineo           text CHECK (tipo_sanguineo IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  alergias                 text,
  condicoes_cronicas       text,
  medicamentos_uso_continuo text,
  observacoes              text,
  criado_por               uuid NOT NULL,
  origem                   text NOT NULL DEFAULT 'ONLINE' CHECK (origem IN ('ONLINE','OFFLINE')),
  client_created_at        timestamptz,
  client_updated_at        timestamptz NOT NULL DEFAULT now(),
  version                  integer NOT NULL DEFAULT 1,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.atendimento (
  id                   uuid PRIMARY KEY,
  prontuario_id        uuid NOT NULL REFERENCES core.prontuario(id) ON DELETE RESTRICT,
  pessoa_id            uuid NOT NULL REFERENCES core.pessoa(id) ON DELETE RESTRICT,
  profissional_id      uuid NOT NULL,              -- responsável pelo atendimento
  data_hora            timestamptz NOT NULL,       -- momento do atendimento
  local_ocorrencia     text,
  queixa_principal     text NOT NULL,
  descricao            text,
  -- sinais vitais
  pa_sistolica         smallint CHECK (pa_sistolica BETWEEN 0 AND 400),
  pa_diastolica        smallint CHECK (pa_diastolica BETWEEN 0 AND 300),
  freq_cardiaca        smallint CHECK (freq_cardiaca BETWEEN 0 AND 300),
  freq_respiratoria    smallint CHECK (freq_respiratoria BETWEEN 0 AND 100),
  spo2                 smallint CHECK (spo2 BETWEEN 0 AND 100),
  temperatura          numeric(4,1) CHECK (temperatura BETWEEN 20 AND 45),
  glicemia             smallint CHECK (glicemia BETWEEN 0 AND 1500),
  -- Escala de Glasgow
  glasgow_ocular       smallint CHECK (glasgow_ocular BETWEEN 1 AND 4),
  glasgow_verbal       smallint CHECK (glasgow_verbal BETWEEN 1 AND 5),
  glasgow_motor        smallint CHECK (glasgow_motor  BETWEEN 1 AND 6),
  glasgow_total        smallint GENERATED ALWAYS AS (
                         CASE WHEN glasgow_ocular IS NOT NULL AND glasgow_verbal IS NOT NULL AND glasgow_motor IS NOT NULL
                              THEN glasgow_ocular + glasgow_verbal + glasgow_motor END) STORED,
  -- Triagem
  triagem_manchester   text CHECK (triagem_manchester IN ('VERMELHO','LARANJA','AMARELO','VERDE','AZUL')),
  triagem_start        text CHECK (triagem_start IN ('VERMELHO','AMARELO','VERDE','PRETO')),
  conduta              text,
  encaminhamento       text,
  origem               text NOT NULL DEFAULT 'ONLINE' CHECK (origem IN ('ONLINE','OFFLINE')),
  client_created_at    timestamptz,
  client_updated_at    timestamptz NOT NULL DEFAULT now(),
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_atendimento_pessoa ON core.atendimento(pessoa_id, data_hora DESC);
CREATE INDEX IF NOT EXISTS ix_atendimento_updated ON core.atendimento(updated_at);
CREATE INDEX IF NOT EXISTS ix_pessoa_updated ON core.pessoa(updated_at);
CREATE INDEX IF NOT EXISTS ix_prontuario_updated ON core.prontuario(updated_at);

-- Medicamentos administrados em cada atendimento (snapshot do nome/dose;
-- medicamento_id é referência lógica ao business.medicamento).
CREATE TABLE IF NOT EXISTS core.atendimento_medicamento (
  id               uuid PRIMARY KEY,
  atendimento_id   uuid NOT NULL REFERENCES core.atendimento(id) ON DELETE CASCADE,
  medicamento_id   uuid,
  nome             text NOT NULL,
  dose             text NOT NULL,                  -- ex.: "0,3 mg"
  via              text,                           -- ex.: IM, IV, VO
  horario          timestamptz
);
CREATE INDEX IF NOT EXISTS ix_atend_med ON core.atendimento_medicamento(atendimento_id);

-- Quando dois dispositivos criam a mesma pessoa offline (mesmo CPF),
-- o servidor mantém UM registro e guarda aqui o "apelido" do UUID descartado.
CREATE TABLE IF NOT EXISTS core.id_alias (
  local_id      uuid PRIMARY KEY,
  entidade      text NOT NULL,
  canonical_id  uuid NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- Registro de cada operação da fila Outbox recebida (idempotência + auditoria).
CREATE TABLE IF NOT EXISTS core.sync_operation (
  op_id            uuid PRIMARY KEY,               -- id da operação gerado no cliente
  entidade         text NOT NULL CHECK (entidade IN ('pessoa','prontuario','atendimento')),
  operacao         text NOT NULL CHECK (operacao IN ('CREATE','UPDATE')),
  registro_id      uuid NOT NULL,
  profissional_id  uuid NOT NULL,
  resultado        text NOT NULL CHECK (resultado IN ('APPLIED','DUPLICATE','MERGED','CONFLICT_RESOLVED','REJECTED')),
  detalhe          jsonb,
  client_created_at timestamptz,
  recebido_em      timestamptz NOT NULL DEFAULT now()
);
