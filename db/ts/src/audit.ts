import * as crypto from 'crypto';
import { AuditEntry } from './types';

export interface AuditHashInput {
  prev_entry_hash: string;
  transaction_id: string;
  step_number: number;
  step_name: string;
  input_summary: string;
  output_summary: string;
  reason: string;
  is_error: boolean;
}

/**
 * Generate canonical pipe-delimited preimage for SHA-256 hash chaining (D-06, D-08).
 * prev_entry_hash|transaction_id|step_number|step_name|input_summary|output_summary|reason|is_error
 */
export function computeCanonicalPreimage(input: AuditHashInput): string {
  const isErrorStr = String(Boolean(input.is_error));
  return [
    input.prev_entry_hash,
    input.transaction_id,
    input.step_number.toString(),
    input.step_name,
    input.input_summary,
    input.output_summary,
    input.reason,
    isErrorStr,
  ].join('|');
}

/**
 * Compute SHA-256 entry_hash from canonical preimage string (D-06).
 */
export function computeEntryHash(input: AuditHashInput): string {
  const preimage = computeCanonicalPreimage(input);
  return crypto.createHash('sha256').update(preimage, 'utf8').digest('hex');
}

/**
 * Verify cryptographic integrity and continuity of an audit trail (D-08).
 * Ensures:
 * 1. At least 1 entry exists
 * 2. Step numbers are contiguous integers starting at 1
 * 3. Step 1 prev_entry_hash is 'GENESIS'
 * 4. Step N prev_entry_hash matches Step N-1 entry_hash
 * 5. Every entry_hash matches SHA-256 of its canonical preimage
 */
export function verifyAuditChain(entries: AuditEntry[]): boolean {
  if (!entries || entries.length === 0) {
    return false;
  }

  // Sort ascending by step_number
  const sorted = [...entries].sort((a, b) => a.step_number - b.step_number);

  let expectedPrev = 'GENESIS';
  let expectedStep = 1;

  for (const entry of sorted) {
    // 1. Verify contiguous step numbering
    if (entry.step_number !== expectedStep) {
      return false;
    }

    // 2. Verify previous entry hash
    if (entry.prev_entry_hash !== expectedPrev) {
      return false;
    }

    // 3. Verify cryptographic SHA-256 hash
    const computed = computeEntryHash(entry);
    if (entry.entry_hash !== computed) {
      return false;
    }

    expectedPrev = entry.entry_hash;
    expectedStep += 1;
  }

  return true;
}
