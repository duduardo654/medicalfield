-- =====================================================================
-- MedicalField - Migration 004
--  * audit.access_log.client_log_id: idempotência do POST /log (reenvio não duplica)
--  * core.sync_operation.sincronizado_por: quem enviou a operação (rastreabilidade)
-- =====================================================================
ALTER TABLE audit.access_log ADD COLUMN IF NOT EXISTS client_log_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ux_access_log_client_log
  ON audit.access_log (client_log_id) WHERE client_log_id IS NOT NULL;

ALTER TABLE core.sync_operation ADD COLUMN IF NOT EXISTS sincronizado_por uuid;
CREATE INDEX IF NOT EXISTS ix_sync_operation_recebido ON core.sync_operation (recebido_em DESC);
