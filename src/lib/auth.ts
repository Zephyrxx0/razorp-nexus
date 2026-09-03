import { query, hashMaasToken } from "@nexus/db";

export interface AuthSuccess {
  authenticated: true;
  merchant: {
    id: string;
    name: string;
    is_active: boolean;
  };
}

export interface AuthFailure {
  authenticated: false;
  status: 401 | 403 | 404;
  error: string;
  message: string;
}

export type AuthResult = AuthSuccess | AuthFailure;

const TOKEN_PATTERN = /^Bearer\s+((?:nx_live_|maas_live_)[a-zA-Z0-9_-]+)$/i;

/**
 * Authenticate incoming MaaS request via Bearer token (D-05, D-06).
 *
 * Verifies Bearer token prefix (nx_live_* or maas_live_*), minimum length (>= 24),
 * hashes via SHA-256, and queries merchants.maas_token_hash.
 *
 * Returns:
 * - 401: Missing, malformed, or unrecognized token
 * - 403: Token belongs to different merchant, or merchant is inactive
 * - 404: Target merchant_id does not exist in database
 * - 200 / authenticated: true with merchant details
 */
export async function authenticateMaaSRequest(
  req: Request,
  expectedMerchantId: string
): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) {
    return {
      authenticated: false,
      status: 401,
      error: "UNAUTHORIZED",
      message: "Missing or malformed Bearer token",
    };
  }

  const match = authHeader.match(TOKEN_PATTERN);
  if (!match) {
    return {
      authenticated: false,
      status: 401,
      error: "UNAUTHORIZED",
      message: "Missing or malformed Bearer token",
    };
  }

  const token = match[1];
  if (token.length < 24) {
    return {
      authenticated: false,
      status: 401,
      error: "UNAUTHORIZED",
      message: "Invalid token format",
    };
  }

  const tokenHash = hashMaasToken(token);

  // Check if token matches any active or inactive merchant
  const tokenQuery = await query<{ id: string; name: string; is_active: boolean }>(
    "SELECT id, name, is_active FROM merchants WHERE maas_token_hash = $1",
    [tokenHash]
  );

  if (tokenQuery.rows.length === 0) {
    return {
      authenticated: false,
      status: 401,
      error: "UNAUTHORIZED",
      message: "Invalid API token",
    };
  }

  const tokenMerchant = tokenQuery.rows[0];

  // If token belongs to a different merchant, check if expected merchant even exists
  if (tokenMerchant.id !== expectedMerchantId) {
    const expectedQuery = await query<{ id: string }>(
      "SELECT id FROM merchants WHERE id = $1",
      [expectedMerchantId]
    );

    if (expectedQuery.rows.length === 0) {
      return {
        authenticated: false,
        status: 404,
        error: "NOT_FOUND",
        message: "Merchant not found",
      };
    }

    return {
      authenticated: false,
      status: 403,
      error: "FORBIDDEN",
      message: "Token does not belong to specified merchant",
    };
  }

  // Check active status
  if (!tokenMerchant.is_active) {
    return {
      authenticated: false,
      status: 403,
      error: "FORBIDDEN",
      message: "Merchant account is inactive",
    };
  }

  return {
    authenticated: true,
    merchant: {
      id: tokenMerchant.id,
      name: tokenMerchant.name,
      is_active: tokenMerchant.is_active,
    },
  };
}
