-- =====================================================================
-- MedicalField - Migration 003: BUSINESS (medicamento) e AUDIT (logs)
-- =====================================================================
CREATE TABLE IF NOT EXISTS business.medicamento (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  text NOT NULL,
  principio_ativo       text NOT NULL,
  apresentacao          text,                      -- ex.: ampola 1 mg/mL
  via_administracao     text,                      -- IM, IV, VO, SL, INAL...
  dose_max_unitaria     numeric(10,2),             -- regra de segurança clínica (fictícia/acadêmica)
  unidade_dose          text,                      -- mg, mcg, mL, comprimido
  contraindicacoes      text,
  observacao            text,
  ativo                 boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()   -- cursor do pull incremental
);
-- O trigger garante que UPDATE manual via SQL também seja visto pelos clientes.
DROP TRIGGER IF EXISTS trg_medicamento_updated ON business.medicamento;
CREATE TRIGGER trg_medicamento_updated BEFORE UPDATE ON business.medicamento
  FOR EACH ROW EXECUTE FUNCTION public.mf_touch_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS ux_medicamento_nome_apres ON business.medicamento (lower(nome), coalesce(apresentacao,''));

CREATE TABLE IF NOT EXISTS business.email_enviado (
  id              bigserial PRIMARY KEY,
  atendimento_id  uuid NOT NULL,
  destinatario    text NOT NULL,
  enviado_por     uuid NOT NULL,
  sucesso         boolean NOT NULL,
  erro            text,
  enviado_em      timestamptz NOT NULL DEFAULT now()
);

-- Log de acesso HTTP: escrito pelos TRÊS serviços (coluna "servico") e
-- também recebe, via POST /log, os acessos feitos offline pelo cliente.
CREATE TABLE IF NOT EXISTS audit.access_log (
  id               bigserial PRIMARY KEY,
  servico          text NOT NULL,                  -- auth | core | business | client
  ocorrido_em      timestamptz NOT NULL DEFAULT now(),
  ip_cliente       text,
  profissional_id  uuid,
  metodo           text NOT NULL,
  rota             text NOT NULL,
  status_code      smallint NOT NULL,
  tempo_ms         numeric(10,2) NOT NULL,
  origem           text NOT NULL DEFAULT 'ONLINE' CHECK (origem IN ('ONLINE','OFFLINE')),
  detalhe          text
);
CREATE INDEX IF NOT EXISTS ix_access_log_ts ON audit.access_log(ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS ix_access_log_servico ON audit.access_log(servico, ocorrido_em DESC);
