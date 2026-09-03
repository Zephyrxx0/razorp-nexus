import { describe, it, expect, beforeEach, vi } from "vitest";
import { authenticateMaaSRequest } from "@/lib/auth";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limiter";
import { query, hashMaasToken } from "@nexus/db";

vi.mock("@nexus/db", async () => {
  const actual = await vi.importActual<any>("@nexus/db");
  return {
    ...actual,
    query: vi.fn(),
  };
});

describe("MaaS Bearer Token Authentication (D-05, D-06)", () => {
  const merchantIdA = "11111111-1111-1111-1111-111111111111";
  const merchantIdB = "22222222-2222-2222-2222-222222222222";
  const nonExistentMerchantId = "99999999-9999-9999-9999-999999999999";
  const validTokenA = "nx_live_abcdef1234567890abcdef123456";
  const validTokenB = "maas_live_fedcba0987654321fedcba0987";

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = new Request("http://localhost:3000/api/maas/" + merchantIdA + "/transact");
    const result = await authenticateMaaSRequest(req, merchantIdA);

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("UNAUTHORIZED");
      expect(result.message).toContain("Missing or malformed");
    }
  });

  it("returns 401 on malformed Authorization header (e.g. Basic auth)", async () => {
    const req = new Request("http://localhost:3000/api/maas/" + merchantIdA + "/transact", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    const result = await authenticateMaaSRequest(req, merchantIdA);

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("UNAUTHORIZED");
    }
  });

  it("returns 401 when token length is too short (< 24 chars)", async () => {
    const req = new Request("http://localhost:3000/api/maas/" + merchantIdA + "/transact", {
      headers: { Authorization: "Bearer nx_live_short" },
    });
    const result = await authenticateMaaSRequest(req, merchantIdA);

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("UNAUTHORIZED");
      expect(result.message).toBe("Invalid token format");
    }
  });

  it("returns 401 when token hash is unknown in database", async () => {
    (query as any).mockResolvedValueOnce({ rows: [] });

    const req = new Request("http://localhost:3000/api/maas/" + merchantIdA + "/transact", {
      headers: { Authorization: "Bearer " + validTokenA },
    });
    const result = await authenticateMaaSRequest(req, merchantIdA);

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.status).toBe(401);
      expect(result.error).toBe("UNAUTHORIZED");
      expect(result.message).toBe("Invalid API token");
    }
  });

  it("returns 403 when token belongs to merchant B when querying merchant A (D-06)", async () => {
    // 1st query: find merchant by token hash -> returns merchant B
    (query as any).mockResolvedValueOnce({
      rows: [{ id: merchantIdB, name: "Merchant B", is_active: true }],
    });
    // 2nd query: check if expected merchant A exists -> returns merchant A
    (query as any).mockResolvedValueOnce({
      rows: [{ id: merchantIdA }],
    });

    const req = new Request("http://localhost:3000/api/maas/" + merchantIdA + "/transact", {
      headers: { Authorization: "Bearer " + validTokenB },
    });
    const result = await authenticateMaaSRequest(req, merchantIdA);

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.status).toBe(403);
      expect(result.error).toBe("FORBIDDEN");
      expect(result.message).toBe("Token does not belong to specified merchant");
    }
  });

  it("returns 404 when target merchant does not exist in database (D-06)", async () => {
    // 1st query: find merchant by token hash -> returns merchant B
    (query as any).mockResolvedValueOnce({
      rows: [{ id: merchantIdB, name: "Merchant B", is_active: true }],
    });
    // 2nd query: check if target merchant exists -> empty rows
    (query as any).mockResolvedValueOnce({
      rows: [],
    });

    const req = new Request("http://localhost:3000/api/maas/" + nonExistentMerchantId + "/transact", {
      headers: { Authorization: "Bearer " + validTokenB },
    });
    const result = await authenticateMaaSRequest(req, nonExistentMerchantId);

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.status).toBe(404);
      expect(result.error).toBe("NOT_FOUND");
      expect(result.message).toBe("Merchant not found");
    }
  });

  it("returns 403 when merchant is inactive", async () => {
    (query as any).mockResolvedValueOnce({
      rows: [{ id: merchantIdA, name: "Merchant A", is_active: false }],
    });

    const req = new Request("http://localhost:3000/api/maas/" + merchantIdA + "/transact", {
      headers: { Authorization: "Bearer " + validTokenA },
    });
    const result = await authenticateMaaSRequest(req, merchantIdA);

    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.status).toBe(403);
      expect(result.error).toBe("FORBIDDEN");
      expect(result.message).toBe("Merchant account is inactive");
    }
  });

  it("returns authenticated: true when valid token matches target merchant", async () => {
    (query as any).mockResolvedValueOnce({
      rows: [{ id: merchantIdA, name: "Merchant A", is_active: true }],
    });

    const req = new Request("http://localhost:3000/api/maas/" + merchantIdA + "/transact", {
      headers: { Authorization: "Bearer " + validTokenA },
    });
    const result = await authenticateMaaSRequest(req, merchantIdA);

    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.merchant.id).toBe(merchantIdA);
      expect(result.merchant.name).toBe("Merchant A");
      expect(result.merchant.is_active).toBe(true);
    }
  });
});

describe("In-Memory Sliding Window Rate Limiter (D-07)", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("permits requests under the limit and tracks remaining quota", () => {
    const key = "merchant:test:catalog";
    const res1 = checkRateLimit(key, 5, 60000);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(4);

    const res2 = checkRateLimit(key, 5, 60000);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(3);
  });

  it("blocks requests when rate limit is exceeded (e.g. 20 rpm transact)", () => {
    const key = "merchant:test:transact";
    const limit = 20;

    for (let i = 0; i < limit; i++) {
      const res = checkRateLimit(key, limit, 60000);
      expect(res.allowed).toBe(true);
    }

    // 21st request should be rejected
    const blocked = checkRateLimit(key, limit, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("isolates rate limit counters across distinct keys", () => {
    const keyCatalog = "merchant:test:catalog";
    const keyTransact = "merchant:test:transact";

    for (let i = 0; i < 5; i++) {
      checkRateLimit(keyCatalog, 5, 60000);
    }
    expect(checkRateLimit(keyCatalog, 5, 60000).allowed).toBe(false);

    // keyTransact should still be fresh
    const res = checkRateLimit(keyTransact, 20, 60000);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(19);
  });
});
