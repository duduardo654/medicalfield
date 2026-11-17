-- =====================================================================
-- MedicalField - Migration 004 (Etapa 2)
--  * Assinatura do profissional no atendimento (snapshot): o PDF e o Portal
--    mostram quem atendeu sem precisar consultar o auth-service.
--  * Idempotência do POST /log: cada log offline traz um UUID do cliente.
-- =====================================================================
ALTER TABLE core.atendimento ADD COLUMN IF NOT EXISTS profissional_nome text;
ALTER TABLE core.atendimento ADD COLUMN IF NOT EXISTS profissional_identificacao text;

ALTER TABLE audit.access_log ADD COLUMN IF NOT EXISTS client_log_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ux_access_log_client_log_id
  ON audit.access_log (client_log_id) WHERE client_log_id IS NOT NULL;
