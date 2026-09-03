import * as crypto from 'crypto';

/**
 * Encrypt a plaintext secret using AES-256-GCM.
 * Formats output as ${iv_hex}:${auth_tag_hex}:${ciphertext_hex} (D-13).
 */
export function encryptSecret(
  plaintext: string,
  keyHex: string,
  customIvHex?: string
): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }

  const iv = customIvHex
    ? Buffer.from(customIvHex, 'hex')
    : crypto.randomBytes(12);

  if (iv.length !== 12) {
    throw new Error('IV must be 12 bytes');
  }

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM payload in format ${iv_hex}:${auth_tag_hex}:${ciphertext_hex}.
 */
export function decryptSecret(payload: string, keyHex: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:auth_tag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Normalize an email: trim whitespace and lowercase (D-14).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Compute SHA-256 hash of normalized email (D-07, D-14).
 */
export function hashEmail(email: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeEmail(email), 'utf8')
    .digest('hex');
}

/**
 * Truncate IPv4 address to /24 subnet (x.y.z.0/24) (D-14).
 */
export function maskIpSubnet(ip: string): string {
  const trimmed = ip.trim();
  const match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}.0/24`;
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.0\/24$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Normalize User-Agent: trim whitespace and collapse internal whitespace (D-14).
 */
export function normalizeUserAgent(ua: string): string {
  return ua.trim().replace(/\s+/g, ' ');
}

/**
 * Compute SHA-256 hash of normalized User-Agent (D-14).
 */
export function hashUserAgent(ua: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeUserAgent(ua), 'utf8')
    .digest('hex');
}

/**
 * Normalize Device ID: trim and lowercase.
 */
export function normalizeDeviceId(deviceId: string): string {
  return deviceId.trim().toLowerCase();
}

/**
 * Compute SHA-256 hash of normalized Device ID.
 */
export function hashDeviceId(deviceId: string): string {
  return crypto
    .createHash('sha256')
    .update(normalizeDeviceId(deviceId), 'utf8')
    .digest('hex');
}

/**
 * Hash a MaaS Bearer token using SHA-256 (D-15).
 */
export function hashMaasToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Generate display-only preview of MaaS token (e.g. maas_live_e3b0...b855) (D-15).
 */
export function previewMaasToken(token: string): string {
  if (token.length < 18) {
    return token;
  }
  return `${token.slice(0, 14)}...${token.slice(-4)}`;
}

/**
 * Generate a new MaaS Bearer token and its hash and preview (D-15).
 */
export function generateMaasToken(): {
  token: string;
  hash: string;
  preview: string;
} {
  const hex = crypto.randomBytes(16).toString('hex');
  const token = `maas_live_${hex}`;
  const hash = hashMaasToken(token);
  const preview = previewMaasToken(token);
  return { token, hash, preview };
}
