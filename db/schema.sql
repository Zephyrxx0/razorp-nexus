-- Project Nexus Canonical Schema DDL
-- Single source of truth for PostgreSQL 16 + pgvector (pgvector optional)

-- Attempt to load pgvector; silently skip if not installed on host PG
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available; vector columns will be disabled';
END
$$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Merchants Table
CREATE TABLE IF NOT EXISTS merchants (
  id                             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                           VARCHAR(255) NOT NULL,
  email                          VARCHAR(255) NOT NULL UNIQUE,
  razorpay_key_id                VARCHAR(255) NOT NULL,
  -- canonical secret column (encrypted AES-256-GCM ciphertext)
  razorpay_key_secret            TEXT         NOT NULL DEFAULT '',
  -- alias written by Phase-5 app code; sync trigger copies ↔ razorpay_key_secret
  razorpay_key_secret_encrypted  TEXT,
  razorpay_webhook_secret        VARCHAR(255) NOT NULL DEFAULT 'whsec_nexus_test_secret',
  maas_token_hash                VARCHAR(64)  NOT NULL UNIQUE,
  -- canonical preview column
  token_preview                  VARCHAR(32)  NOT NULL DEFAULT '',
  -- alias written by Phase-5 app code; sync trigger copies ↔ token_preview
  maas_token_preview             VARCHAR(32),
  maas_endpoint                  VARCHAR(512) NOT NULL DEFAULT '/api/maas',
  is_active                      BOOLEAN      NOT NULL DEFAULT true,
  created_at                     TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
  updated_at                     TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp()
);

-- 2. Products Table
CREATE TABLE IF NOT EXISTS products (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      UUID         NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  description      TEXT         NOT NULL,
  price_paise      BIGINT       NOT NULL CHECK (price_paise > 0),
  currency         VARCHAR(3)   NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  -- canonical stock column
  stock            INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
  -- alias written by Phase-5 app code; sync trigger copies ↔ stock
  stock_quantity   INTEGER,
  category         VARCHAR(100) NOT NULL,
  tags             TEXT[]       NOT NULL DEFAULT '{}',
  -- nullable so inserts succeed even when pgvector is unavailable
  embedding        vector(768),
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  -- alias written by Phase-5 app code; sync trigger copies ↔ is_active
  is_ai_purchasable BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp()
);

-- ------------------------------------------------------------------
-- Sync Triggers: bridge Phase-1 schema names ↔ Phase-5 app aliases
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_merchant_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- razorpay_key_secret <-> razorpay_key_secret_encrypted
  IF NEW.razorpay_key_secret = '' AND NEW.razorpay_key_secret_encrypted IS NOT NULL THEN
    NEW.razorpay_key_secret := NEW.razorpay_key_secret_encrypted;
  ELSIF NEW.razorpay_key_secret_encrypted IS NULL AND NEW.razorpay_key_secret != '' THEN
    NEW.razorpay_key_secret_encrypted := NEW.razorpay_key_secret;
  END IF;

  -- token_preview <-> maas_token_preview
  IF NEW.token_preview = '' AND NEW.maas_token_preview IS NOT NULL THEN
    NEW.token_preview := NEW.maas_token_preview;
  ELSIF NEW.maas_token_preview IS NULL AND NEW.token_preview != '' THEN
    NEW.maas_token_preview := NEW.token_preview;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_merchants_sync_columns ON merchants;
CREATE TRIGGER trg_merchants_sync_columns
BEFORE INSERT OR UPDATE ON merchants
FOR EACH ROW
EXECUTE FUNCTION sync_merchant_columns();

CREATE OR REPLACE FUNCTION sync_product_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- stock <-> stock_quantity
  IF NEW.stock_quantity IS NOT NULL THEN
    NEW.stock := COALESCE(NEW.stock_quantity, NEW.stock, 0);
  END IF;
  NEW.stock_quantity := NEW.stock;

  -- is_active <-> is_ai_purchasable (both default true; keep in sync)
  NEW.is_active        := COALESCE(NEW.is_active, NEW.is_ai_purchasable, true);
  NEW.is_ai_purchasable := COALESCE(NEW.is_ai_purchasable, NEW.is_active, true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_sync_columns ON products;
CREATE TRIGGER trg_products_sync_columns
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION sync_product_columns();

-- HNSW index (only created when pgvector is available)
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw
    ON products USING hnsw (embedding vector_cosine_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping HNSW index (pgvector not available)';
END
$$;

CREATE INDEX IF NOT EXISTS idx_products_merchant_id ON products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active   ON products(is_active);

-- 3. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID         NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  intent_raw          TEXT         NOT NULL,
  intent_parsed       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  product_id          UUID         REFERENCES products(id) ON DELETE SET NULL,
  quantity            INTEGER      NOT NULL CHECK (quantity > 0),
  amount_paise        BIGINT       NOT NULL CHECK (amount_paise > 0),
  currency            VARCHAR(3)   NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  buyer_fingerprint   JSONB        NOT NULL,
  trust_score         NUMERIC(5,2),
  trust_decision      VARCHAR(10)  CHECK (trust_decision IN ('ALLOW', 'REVIEW', 'DENY')),
  trust_risk_factors  TEXT[]       NOT NULL DEFAULT '{}',
  razorpay_order_id   VARCHAR(255),
  razorpay_payment_id VARCHAR(255),
  status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'SUCCESS', 'DENIED', 'FAILED', 'PARTIAL')),
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at  ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_email_hash  ON transactions(((buyer_fingerprint->>'email_hash')));
CREATE INDEX IF NOT EXISTS idx_transactions_ip_subnet   ON transactions(((buyer_fingerprint->>'ip_subnet')));

-- 4. Audit Entries Table
CREATE TABLE IF NOT EXISTS audit_entries (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID         NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  step_name        VARCHAR(50)  NOT NULL,
  step_number      INTEGER      NOT NULL CHECK (step_number >= 1),
  timestamp        TIMESTAMPTZ  NOT NULL DEFAULT clock_timestamp(),
  duration_ms      INTEGER      NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  input_summary    TEXT         NOT NULL,
  output_summary   TEXT         NOT NULL,
  reason           TEXT         NOT NULL,
  raw_data         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  is_error         BOOLEAN      NOT NULL DEFAULT false,
  prev_entry_hash  VARCHAR(64)  NOT NULL,
  entry_hash       VARCHAR(64)  NOT NULL,
  CONSTRAINT uq_audit_entries_tx_step UNIQUE (transaction_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_audit_entries_tx_step ON audit_entries(transaction_id, step_number);

-- 5. Immutability Trigger (Defense-in-Depth #1)
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries table is append-only: UPDATE and DELETE operations are strictly prohibited'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_entries_immutable ON audit_entries;
CREATE TRIGGER trg_audit_entries_immutable
BEFORE UPDATE OR DELETE ON audit_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_mutation();

-- 6. Application Role & Revocations (Defense-in-Depth #2)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexus') THEN
    CREATE ROLE nexus WITH LOGIN PASSWORD 'nexus_dev_password' SUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexus_app') THEN
    CREATE ROLE nexus_app WITH LOGIN PASSWORD 'nexus_app_secret';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_entries FROM nexus_app;

-- 7. In-Engine PL/pgSQL Audit Chain Verifier
CREATE OR REPLACE FUNCTION verify_audit_chain(p_tx_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_rec           RECORD;
  v_expected_prev TEXT    := 'GENESIS';
  v_expected_step INTEGER := 1;
  v_computed_hash TEXT;
  v_count         INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT *
    FROM audit_entries
    WHERE transaction_id = p_tx_id
    ORDER BY step_number ASC
  LOOP
    v_count := v_count + 1;

    IF v_rec.step_number != v_expected_step THEN
      RETURN FALSE;
    END IF;

    IF v_rec.prev_entry_hash != v_expected_prev THEN
      RETURN FALSE;
    END IF;

    v_computed_hash := encode(sha256(
      (v_rec.prev_entry_hash || '|' ||
       v_rec.transaction_id::text || '|' ||
       v_rec.step_number::text || '|' ||
       v_rec.step_name || '|' ||
       v_rec.input_summary || '|' ||
       v_rec.output_summary || '|' ||
       v_rec.reason || '|' ||
       v_rec.is_error::text)::bytea
    ), 'hex');

    IF v_rec.entry_hash != v_computed_hash THEN
      RETURN FALSE;
    END IF;

    v_expected_prev := v_rec.entry_hash;
    v_expected_step := v_expected_step + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
