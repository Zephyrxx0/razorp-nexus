import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  encryptSecret,
  decryptSecret,
  normalizeEmail,
  hashEmail,
  maskIpSubnet,
  normalizeUserAgent,
  hashUserAgent,
  normalizeDeviceId,
  hashDeviceId,
  generateMaasToken,
  hashMaasToken,
  previewMaasToken,
} from '../src/crypto';
import {
  computeCanonicalPreimage,
  computeEntryHash,
  verifyAuditChain,
} from '../src/audit';
import { sanitizeAuditData } from '../src/sanitize';
import { AuditEntry } from '../src/types';

// Load shared cross-language fixtures
const fixturesPath = path.resolve(__dirname, '../../fixtures/crypto-fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

describe('AES-256-GCM Secret Encryption & Cross-Language Parity (D-13, D-16)', () => {
  it('should encrypt and decrypt against precomputed test vectors', () => {
    for (const vector of fixtures.encryption_vectors) {
      // Test encryption with fixed IV
      const encrypted = encryptSecret(
        vector.plaintext,
        vector.key_hex,
        vector.iv_hex
      );
      expect(encrypted).toBe(vector.encrypted);

      // Test decryption of fixture ciphertext
      const decrypted = decryptSecret(vector.encrypted, vector.key_hex);
      expect(decrypted).toBe(vector.plaintext);
    }
  });

  it('should roundtrip encrypt and decrypt with random IV', () => {
    const key = fixtures.encryption_vectors[0].key_hex;
    const plaintext = 'dynamic_secret_test_value_999';
    const encrypted = encryptSecret(plaintext, key);
    expect(encrypted.split(':')).toHaveLength(3);
    const decrypted = decryptSecret(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should reject tampered auth tags or ciphertexts', () => {
    const vector = fixtures.encryption_vectors[0];
    const parts = vector.encrypted.split(':');
    // Alter ciphertext
    const tamperedCt = `${parts[0]}:${parts[1]}:ff${parts[2].slice(2)}`;
    expect(() => decryptSecret(tamperedCt, vector.key_hex)).toThrow();

    // Alter auth tag
    const tamperedTag = `${parts[0]}:00000000000000000000000000000000:${parts[2]}`;
    expect(() => decryptSecret(tamperedTag, vector.key_hex)).toThrow();

    // Wrong key
    const wrongKey = '0000000000000000000000000000000000000000000000000000000000000000';
    expect(() => decryptSecret(vector.encrypted, wrongKey)).toThrow();
  });
});

describe('Buyer Signal Normalization & Hashing Parity (D-14, D-16)', () => {
  it('should normalize and hash emails matching fixture vectors', () => {
    for (const v of fixtures.signal_normalization_vectors.emails) {
      expect(normalizeEmail(v.raw)).toBe(v.normalized);
      expect(hashEmail(v.raw)).toBe(v.hash);
    }
  });

  it('should mask IPv4 subnets matching fixture vectors', () => {
    for (const v of fixtures.signal_normalization_vectors.ip_subnets) {
      expect(maskIpSubnet(v.raw)).toBe(v.normalized);
    }
  });

  it('should normalize and hash User-Agent strings matching fixture vectors', () => {
    for (const v of fixtures.signal_normalization_vectors.user_agents) {
      expect(normalizeUserAgent(v.raw)).toBe(v.normalized);
      expect(hashUserAgent(v.raw)).toBe(v.hash);
    }
  });

  it('should normalize and hash Device IDs matching fixture vectors', () => {
    for (const v of fixtures.signal_normalization_vectors.device_ids) {
      expect(normalizeDeviceId(v.raw)).toBe(v.normalized);
      expect(hashDeviceId(v.raw)).toBe(v.hash);
    }
  });
});

describe('MaaS Bearer Token Hashing & Preview (D-15)', () => {
  it('should hash and generate previews matching fixture vectors', () => {
    for (const v of fixtures.maas_token_vectors) {
      expect(hashMaasToken(v.token)).toBe(v.hash);
      expect(previewMaasToken(v.token)).toBe(v.preview);
    }
  });

  it('should generate valid maas tokens with proper prefix and length', () => {
    const { token, hash, preview } = generateMaasToken();
    expect(token).toMatch(/^maas_live_[0-9a-f]{32}$/);
    expect(hash).toHaveLength(64);
    expect(preview).toMatch(/^maas_live_[0-9a-f]{4}\.\.\.[0-9a-f]{4}$/);
    expect(hashMaasToken(token)).toBe(hash);
    expect(previewMaasToken(token)).toBe(preview);
  });
});

describe('Cryptographic Audit Hash-Chaining & Chain Verification (D-06, D-08)', () => {
  it('should compute preimages and entry hashes matching fixture vectors', () => {
    for (const s of fixtures.audit_chain_vectors) {
      const preimage = computeCanonicalPreimage(s);
      expect(preimage).toBe(s.canonical_preimage);
      const hash = computeEntryHash(s);
      expect(hash).toBe(s.entry_hash);
    }
  });

  it('should verify a valid audit chain from fixtures', () => {
    const entries: AuditEntry[] = fixtures.audit_chain_vectors.map(
      (s: any, idx: number) => ({
        id: `00000000-0000-0000-0000-00000000000${idx + 1}`,
        transaction_id: s.transaction_id,
        step_name: s.step_name,
        step_number: s.step_number,
        timestamp: new Date().toISOString(),
        duration_ms: 10,
        input_summary: s.input_summary,
        output_summary: s.output_summary,
        reason: s.reason,
        raw_data: {},
        is_error: s.is_error,
        prev_entry_hash: s.prev_entry_hash,
        entry_hash: s.entry_hash,
      })
    );

    expect(verifyAuditChain(entries)).toBe(true);
  });

  it('should fail verification if an entry is tampered with', () => {
    const entries: AuditEntry[] = fixtures.audit_chain_vectors.map(
      (s: any, idx: number) => ({
        id: `00000000-0000-0000-0000-00000000000${idx + 1}`,
        transaction_id: s.transaction_id,
        step_name: s.step_name,
        step_number: s.step_number,
        timestamp: new Date().toISOString(),
        duration_ms: 10,
        input_summary: s.input_summary,
        output_summary: s.output_summary,
        reason: s.reason,
        raw_data: {},
        is_error: s.is_error,
        prev_entry_hash: s.prev_entry_hash,
        entry_hash: s.entry_hash,
      })
    );

    // Tamper with reason in step 2
    const tamperedEntries = [...entries];
    tamperedEntries[1] = {
      ...tamperedEntries[1],
      reason: 'Malicious modification of reason',
    };
    expect(verifyAuditChain(tamperedEntries)).toBe(false);

    // Tamper with step continuity (change step 2 to step 3)
    const brokenStepEntries = [...entries];
    brokenStepEntries[1] = {
      ...brokenStepEntries[1],
      step_number: 4,
    };
    expect(verifyAuditChain(brokenStepEntries)).toBe(false);

    // Empty array returns false
    expect(verifyAuditChain([])).toBe(false);
  });
});

describe('Audit PII Sanitization (D-07, PRD §15.3)', () => {
  it('should sanitize raw secrets, emails, and IPs in audit payloads', () => {
    const rawPayload = {
      razorpay_key_secret: 'sec_test_secret_12345',
      password: 'merchant_super_secret',
      buyer: {
        email: '  Buyer.Name@Example.COM  ',
        ip: '192.168.1.55',
        user_agent: '  Mozilla/5.0  (Test) ',
        device_id: 'DEV-1234-ABCD',
      },
      metadata: {
        maas_token_hash: '2d55760d323519beca4c779dfaa7a426970ab3f4597cb3a085f4c4650ad1f241',
        token_preview: 'maas_live_e3b0...b855',
        amount_paise: 50000,
      },
    };

    const sanitized = sanitizeAuditData(rawPayload);

    expect(sanitized.razorpay_key_secret).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.buyer.email).toBe(hashEmail('buyer.name@example.com'));
    expect(sanitized.buyer.ip).toBe('192.168.1.0/24');
    expect(sanitized.buyer.user_agent).toBe(hashUserAgent('Mozilla/5.0 (Test)'));
    expect(sanitized.buyer.device_id).toBe(hashDeviceId('dev-1234-abcd'));

    // Safe tokens and non-sensitive fields preserved
    expect(sanitized.metadata.maas_token_hash).toBe(
      '2d55760d323519beca4c779dfaa7a426970ab3f4597cb3a085f4c4650ad1f241'
    );
    expect(sanitized.metadata.token_preview).toBe('maas_live_e3b0...b855');
    expect(sanitized.metadata.amount_paise).toBe(50000);
  });
});
