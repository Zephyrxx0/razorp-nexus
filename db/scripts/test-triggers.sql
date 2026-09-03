-- Test Script: Verify Dual Defense-in-Depth Immutability & Audit Chain
-- Validates:
-- 1. trg_audit_entries_immutable blocks UPDATE statements
-- 2. trg_audit_entries_immutable blocks DELETE statements
-- 3. verify_audit_chain(UUID) returns TRUE for valid SHA-256 chained entries

\set ON_ERROR_STOP on

BEGIN;

-- 1. Setup test merchant and transaction
INSERT INTO merchants (
  id,
  name,
  email,
  razorpay_key_id,
  razorpay_key_secret,
  razorpay_webhook_secret,
  maas_token_hash,
  token_preview,
  maas_endpoint
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Trigger Test Merchant',
  'trigger-test@merchant.local',
  'rzp_test_trg',
  'test_enc_secret',
  'test_wh_secret',
  '0000000000000000000000000000000000000000000000000000000000000001',
  'maas_live_0001',
  '/api/maas/00000000-0000-0000-0000-000000000001/transact'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO transactions (
  id,
  merchant_id,
  intent_raw,
  buyer_fingerprint,
  quantity,
  amount_paise,
  status
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Trigger test intent',
  '{"email_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "ip_subnet": "127.0.0.0/24"}'::jsonb,
  1,
  10000,
  'PENDING'
) ON CONFLICT (id) DO NOTHING;

-- 2. Insert Step 1 (GENESIS)
INSERT INTO audit_entries (
  id,
  transaction_id,
  step_name,
  step_number,
  duration_ms,
  input_summary,
  output_summary,
  reason,
  is_error,
  prev_entry_hash,
  entry_hash
) VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'INTENT_RECEIVED',
  1,
  10,
  'Raw intent: Trigger test intent',
  'Parsed intent: test item',
  'Initial step recorded',
  false,
  'GENESIS',
  encode(sha256('GENESIS|a0000000-0000-0000-0000-000000000001|1|INTENT_RECEIVED|Raw intent: Trigger test intent|Parsed intent: test item|Initial step recorded|false'::bytea), 'hex')
);

-- 3. Verify UPDATE is blocked
DO $$
BEGIN
  BEGIN
    UPDATE audit_entries
    SET reason = 'Tampered reason'
    WHERE id = 'e0000000-0000-0000-0000-000000000001';

    RAISE EXCEPTION 'UPDATE trigger failed: mutation was allowed on audit_entries';
  EXCEPTION
    WHEN integrity_constraint_violation THEN
      RAISE NOTICE 'SUCCESS: UPDATE was blocked by trigger as expected.';
  END;
END;
$$;

-- 4. Verify DELETE is blocked
DO $$
BEGIN
  BEGIN
    DELETE FROM audit_entries
    WHERE id = 'e0000000-0000-0000-0000-000000000001';

    RAISE EXCEPTION 'DELETE trigger failed: deletion was allowed on audit_entries';
  EXCEPTION
    WHEN integrity_constraint_violation THEN
      RAISE NOTICE 'SUCCESS: DELETE was blocked by trigger as expected.';
  END;
END;
$$;

-- 5. Insert Step 2 with valid hash chaining referencing step 1
DO $$
DECLARE
  v_prev_hash VARCHAR(64);
  v_entry_hash VARCHAR(64);
BEGIN
  SELECT entry_hash INTO v_prev_hash
  FROM audit_entries
  WHERE id = 'e0000000-0000-0000-0000-000000000001';

  v_entry_hash := encode(sha256(
    (v_prev_hash || '|a0000000-0000-0000-0000-000000000001|2|CATALOG_RESOLVED|Catalog lookup|Product resolved|Resolved matching product|false')::bytea
  ), 'hex');

  INSERT INTO audit_entries (
    id,
    transaction_id,
    step_name,
    step_number,
    duration_ms,
    input_summary,
    output_summary,
    reason,
    is_error,
    prev_entry_hash,
    entry_hash
  ) VALUES (
    'e0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'CATALOG_RESOLVED',
    2,
    15,
    'Catalog lookup',
    'Product resolved',
    'Resolved matching product',
    false,
    v_prev_hash,
    v_entry_hash
  );
END;
$$;

-- 6. Verify audit chain using in-engine function
DO $$
DECLARE
  v_is_valid BOOLEAN;
BEGIN
  SELECT verify_audit_chain('a0000000-0000-0000-0000-000000000001'::uuid) INTO v_is_valid;
  IF NOT v_is_valid THEN
    RAISE EXCEPTION 'verify_audit_chain returned FALSE for a valid hash chain';
  END IF;
  RAISE NOTICE 'SUCCESS: verify_audit_chain confirmed valid chain.';
END;
$$;

-- 7. Cleanup test records
-- Immutability trigger prevents DELETE on audit_entries, so disable trigger temporarily for cleanup
ALTER TABLE audit_entries DISABLE TRIGGER trg_audit_entries_immutable;
DELETE FROM audit_entries WHERE transaction_id = 'a0000000-0000-0000-0000-000000000001';
ALTER TABLE audit_entries ENABLE TRIGGER trg_audit_entries_immutable;

DELETE FROM transactions WHERE id = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM merchants WHERE id = '00000000-0000-0000-0000-000000000001';

COMMIT;

