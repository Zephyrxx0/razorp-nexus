import {
  hashEmail,
  maskIpSubnet,
  hashUserAgent,
  hashDeviceId,
} from './crypto';

const SECRET_KEY_PATTERN = /^(key_secret|razorpay_key_secret|secret|password|authorization|private_key|api_key)$/i;
const SAFE_TOKEN_PATTERN = /(_hash|_preview)$/i;
const EMAIL_KEY_PATTERN = /email/i;
const IP_KEY_PATTERN = /^(ip|client_ip|ip_address|remote_addr)$/i;
const UA_KEY_PATTERN = /user_agent|useragent/i;
const DEVICE_KEY_PATTERN = /device_id|deviceid/i;

const IP_VALUE_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const EMAIL_VALUE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Recursively sanitize audit payload data:
 * - Redacts raw merchant secrets / passwords / tokens
 * - Converts emails to SHA-256 hashes
 * - Truncates IP addresses to /24 subnets
 * - Hashes User-Agent and Device ID strings
 * (D-07, PRD §15.3)
 */
export function sanitizeAuditData(data: Record<string, any>): Record<string, any> {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) =>
      typeof item === 'object' && item !== null ? sanitizeAuditData(item) : item
    ) as any;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      sanitized[key] = value;
      continue;
    }

    // 1. Redact secrets
    if (SECRET_KEY_PATTERN.test(key) && !SAFE_TOKEN_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (key.toLowerCase() === 'maas_token' && !SAFE_TOKEN_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // 2. Objects and Arrays recurse
    if (typeof value === 'object') {
      sanitized[key] = sanitizeAuditData(value);
      continue;
    }

    if (typeof value === 'string') {
      // 3. Email sanitization
      if (EMAIL_KEY_PATTERN.test(key) && !SAFE_TOKEN_PATTERN.test(key)) {
        sanitized[key] = hashEmail(value);
        continue;
      }
      if (EMAIL_VALUE_PATTERN.test(value.trim())) {
        sanitized[key] = hashEmail(value);
        continue;
      }

      // 4. IP sanitization
      if (IP_KEY_PATTERN.test(key)) {
        sanitized[key] = maskIpSubnet(value);
        continue;
      }
      if (IP_VALUE_PATTERN.test(value.trim())) {
        sanitized[key] = maskIpSubnet(value);
        continue;
      }

      // 5. User-Agent sanitization
      if (UA_KEY_PATTERN.test(key) && !SAFE_TOKEN_PATTERN.test(key)) {
        sanitized[key] = hashUserAgent(value);
        continue;
      }

      // 6. Device ID sanitization
      if (DEVICE_KEY_PATTERN.test(key) && !SAFE_TOKEN_PATTERN.test(key)) {
        sanitized[key] = hashDeviceId(value);
        continue;
      }
    }

    sanitized[key] = value;
  }

  return sanitized;
}
