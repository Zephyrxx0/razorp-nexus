#!/usr/bin/env npx tsx
/**
 * Immutability Trigger & Audit Chain Test Script.
 * Verifies that the PostgreSQL BEFORE UPDATE OR DELETE trigger prevents
 * mutation and deletion of audit entries, and verifies in-engine audit chain validation.
 */

import { getDbPool, closeDbPool, computeEntryHash } from '@nexus/db';

async function runTriggerTests(): Promise<void> {
  console.log('🔒 Running Audit Log Immutability & Trigger Tests...\n');

  const pool = getDbPool();
  const client = await pool.connect();

  const dummyMerchantId = '88888888-8888-8888-8888-888888888888';
  const dummyTxId = '99999999-9999-9999-9999-999999999999';
  const dummyAudit1Id = '77777777-7777-7777-7777-777777777771';
  const dummyAudit2Id = '77777777-7777-7777-7777-777777777772';

  try {
    await client.query('BEGIN');

    // 1. Insert dummy merchant and transaction
    console.log('[1/5] Inserting test merchant and transaction fixtures...');
    await client.query(
      `
      INSERT INTO merchants (
        id, name, email, razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret,
        maas_token_hash, token_preview, maas_endpoint, is_active
      ) VALUES (
        $1, 'Trigger Test Merchant', 'trigger.test@nexus.internal', 'rzp_test_trg123',
        'iv:tag:ct', 'whsec_trg', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'maas_live_trg...test', 'https://test.internal/webhook', true
      )
      `,
      [dummyMerchantId]
    );

    await client.query(
      `
      INSERT INTO transactions (
        id, merchant_id, intent_raw, intent_parsed, quantity, amount_paise,
        currency, buyer_fingerprint, status
      ) VALUES (
        $1, $2, 'Trigger test transaction intent', '{"query": "test"}'::jsonb,
        1, 10000, 'INR', '{"email_hash": "dummy_email_hash"}'::jsonb, 'PENDING'
      )
      `,
      [dummyTxId, dummyMerchantId]
    );
    console.log('  ✓ Test transaction fixture inserted.');

    // 2. Insert step 1 audit entry
    console.log('[2/5] Inserting initial audit entry step 1 with GENESIS hash...');
    const step1Data = {
      prev_entry_hash: 'GENESIS',
      transaction_id: dummyTxId,
      step_number: 1,
      step_name: 'INTENT_RECEIVED',
      input_summary: 'Trigger test input step 1',
      output_summary: 'Trigger test output step 1',
      reason: 'Testing append-only immutability trigger',
      is_error: false,
    };
    const step1Hash = computeEntryHash(step1Data);

    await client.query(
      `
      INSERT INTO audit_entries (
        id, transaction_id, step_name, step_number, duration_ms,
        input_summary, output_summary, reason, raw_data, is_error,
        prev_entry_hash, entry_hash
      ) VALUES (
        $1, $2, $3, $4, 10, $5, $6, $7, '{}'::jsonb, $8, $9, $10
      )
      `,
      [
        dummyAudit1Id,
        dummyTxId,
        step1Data.step_name,
        step1Data.step_number,
        step1Data.input_summary,
        step1Data.output_summary,
        step1Data.reason,
        step1Data.is_error,
        step1Data.prev_entry_hash,
        step1Hash,
      ]
    );
    console.log(`  ✓ Step 1 entry created (entry_hash: ${step1Hash.slice(0, 16)}...).`);

    // 3. Assert UPDATE is rejected by trigger
    console.log('[3/5] Asserting UPDATE is rejected by prevent_audit_mutation trigger...');
    await client.query('SAVEPOINT sp_update');
    let updateFailedAsExpected = false;

    try {
      await client.query(
        `UPDATE audit_entries SET reason = 'tampered' WHERE id = $1;`,
        [dummyAudit1Id]
      );
    } catch (err: any) {
      updateFailedAsExpected = true;
      const expectedCodes = ['23000', '23514', 'integrity_constraint_violation'];
      const hasExpectedCode = expectedCodes.includes(err.code) || err.message?.includes('append-only');
      if (!hasExpectedCode) {
        throw new Error(`Unexpected error code for UPDATE block: ${err.code} (${err.message})`);
      }
      console.log(`  ✓ UPDATE successfully blocked by trigger: "${err.message}" (code: ${err.code})`);
      await client.query('ROLLBACK TO SAVEPOINT sp_update');
    }

    if (!updateFailedAsExpected) {
      throw new Error('SECURITY VIOLATION: UPDATE on audit_entries did NOT throw an exception!');
    }

    // 4. Assert DELETE is rejected by trigger
    console.log('[4/5] Asserting DELETE is rejected by prevent_audit_mutation trigger...');
    await client.query('SAVEPOINT sp_delete');
    let deleteFailedAsExpected = false;

    try {
      await client.query(
        `DELETE FROM audit_entries WHERE id = $1;`,
        [dummyAudit1Id]
      );
    } catch (err: any) {
      deleteFailedAsExpected = true;
      const expectedCodes = ['23000', '23514', 'integrity_constraint_violation'];
      const hasExpectedCode = expectedCodes.includes(err.code) || err.message?.includes('append-only');
      if (!hasExpectedCode) {
        throw new Error(`Unexpected error code for DELETE block: ${err.code} (${err.message})`);
      }
      console.log(`  ✓ DELETE successfully blocked by trigger: "${err.message}" (code: ${err.code})`);
      await client.query('ROLLBACK TO SAVEPOINT sp_delete');
    }

    if (!deleteFailedAsExpected) {
      throw new Error('SECURITY VIOLATION: DELETE on audit_entries did NOT throw an exception!');
    }

    // 5. Insert step 2 and verify chain continuity
    console.log('[5/5] Inserting step 2 and asserting verify_audit_chain returns true...');
    const step2Data = {
      prev_entry_hash: step1Hash,
      transaction_id: dummyTxId,
      step_number: 2,
      step_name: 'CATALOG_RESOLVED',
      input_summary: 'Trigger test input step 2',
      output_summary: 'Trigger test output step 2',
      reason: 'Testing hash chain continuity',
      is_error: false,
    };
    const step2Hash = computeEntryHash(step2Data);

    await client.query(
      `
      INSERT INTO audit_entries (
        id, transaction_id, step_name, step_number, duration_ms,
        input_summary, output_summary, reason, raw_data, is_error,
        prev_entry_hash, entry_hash
      ) VALUES (
        $1, $2, $3, $4, 15, $5, $6, $7, '{}'::jsonb, $8, $9, $10
      )
      `,
      [
        dummyAudit2Id,
        dummyTxId,
        step2Data.step_name,
        step2Data.step_number,
        step2Data.input_summary,
        step2Data.output_summary,
        step2Data.reason,
        step2Data.is_error,
        step2Data.prev_entry_hash,
        step2Hash,
      ]
    );

    const verifyRes = await client.query<{ is_valid: boolean }>(
      'SELECT verify_audit_chain($1) AS is_valid;',
      [dummyTxId]
    );

    if (!verifyRes.rows[0]?.is_valid) {
      throw new Error('verify_audit_chain returned false for valid 2-step test chain!');
    }
    console.log('  ✓ In-engine verify_audit_chain confirmed valid 2-step cryptographic chain.');

    console.log('\n✅ All trigger immutability and chain verification tests PASSED.');
  } catch (error) {
    console.error('\n❌ Trigger test failed:', error);
    process.exit(1);
  } finally {
    // Transaction rollback guarantees clean isolation without leaving test records
    await client.query('ROLLBACK');
    client.release();
    await closeDbPool();
  }
}

runTriggerTests().catch((err) => {
  console.error('Fatal error during trigger tests:', err);
  process.exit(1);
});
