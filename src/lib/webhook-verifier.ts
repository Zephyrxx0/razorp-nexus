import crypto from 'node:crypto';

/**
 * Timing-safe string comparison using crypto.timingSafeEqual.
 * Converts strings to UTF-8 Buffers and guards against buffer length mismatch
 * crashes (RangeError) before calling timingSafeEqual (D-13, ASVS V3.2.1).
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the X-Razorpay-Signature header against the raw webhook body and secret.
 * Rejects missing or malformed signatures without throwing errors.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature || typeof signature !== 'string' || signature.length === 0) {
    return false;
  }
  if (!secret || typeof secret !== 'string') {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return timingSafeCompare(signature, expectedSignature);
}
