-- =====================================================================
-- MedicalField - Migration 001: esquemas, função utilitária e AUTH
-- Um único banco PostgreSQL, com um ESQUEMA por responsabilidade:
--   auth     -> auth-service (Python)
--   core     -> core-service (Node.js)
--   business -> business-service (Go)
--   audit    -> logs de acesso (escrito por todos os serviços)
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS business;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE OR REPLACE FUNCTION public.mf_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS auth.profissional (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_registro  text NOT NULL CHECK (tipo_registro IN ('CRM','COREN','SOCORRISTA','ADMIN')),
  identificacao  text NOT NULL UNIQUE,            -- ex.: CRM-RS-12345 (login)
  nome           text NOT NULL,
  email          text,
  perfil         text NOT NULL DEFAULT 'PROFISSIONAL' CHECK (perfil IN ('ADMIN','PROFISSIONAL')),
  senha_hash     text NOT NULL,                   -- bcrypt
  ativo          boolean NOT NULL DEFAULT true,
  ultimo_login   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profissional_updated ON auth.profissional;
CREATE TRIGGER trg_profissional_updated BEFORE UPDATE ON auth.profissional
  FOR EACH ROW EXECUTE FUNCTION public.mf_touch_updated_at();
