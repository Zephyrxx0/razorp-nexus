import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/maas/[merchant_id]/catalog/route";
import { query } from "@nexus/db";
import { generateEmbedding } from "@/lib/embeddings";
import { resetRateLimits } from "@/lib/rate-limiter";

vi.mock("@nexus/db", async () => {
  const actual = await vi.importActual<any>("@nexus/db");
  return {
    ...actual,
    query: vi.fn(),
  };
});

vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: vi.fn(),
  generateQueryEmbedding: vi.fn(),
}));

describe("GET /api/maas/[merchant_id]/catalog", () => {
  const merchantId = "11111111-1111-1111-1111-111111111111";
  const otherMerchantId = "22222222-2222-2222-2222-222222222222";
  const validToken = "nx_live_abcdef1234567890abcdef123456";

  const sampleProduct = {
    id: "10000000-0000-0000-0000-000000000001",
    merchant_id: merchantId,
    name: "Sony WH-1000XM5",
    description: "Industry-leading wireless noise canceling headphones",
    price_paise: 2999000,
    currency: "INR",
    stock: 25,
    category: "Consumer Tech",
    tags: ["audio", "headphones", "noise-canceling"],
    match_score: "0.9412",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();

    // Default: valid token belonging to merchantId
    (query as any).mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes("FROM merchants WHERE maas_token_hash")) {
        return {
          rows: [{ id: merchantId, name: "Apex Electronics", is_active: true }],
        };
      }
      if (sql.includes("FROM merchants WHERE id = $1")) {
        return {
          rows: params[0] === merchantId ? [{ id: merchantId, name: "Apex Electronics", is_active: true }] : [],
        };
      }
      if (sql.includes("FROM products")) {
        return { rows: [sampleProduct] };
      }
      return { rows: [] };
    });
  });

  it("returns 401 when request is missing Bearer token", async () => {
    const req = new NextRequest(`http://localhost:3000/api/maas/${merchantId}/catalog`);
    const res = await GET(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("UNAUTHORIZED");
  });

  it("returns 404 when target merchant does not exist in database (D-06)", async () => {
    (query as any).mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes("FROM merchants WHERE maas_token_hash")) {
        // Token belongs to other merchant
        return { rows: [{ id: otherMerchantId, name: "Other Merchant", is_active: true }] };
      }
      if (sql.includes("FROM merchants WHERE id = $1")) {
        // Target merchant does not exist
        return { rows: [] };
      }
      return { rows: [] };
    });

    const req = new NextRequest(`http://localhost:3000/api/maas/${merchantId}/catalog`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const res = await GET(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("NOT_FOUND");
  });

  it("handles browse mode on empty q: returns products with match_score 1.0 (D-03)", async () => {
    (query as any).mockImplementation(async (sql: string) => {
      if (sql.includes("FROM merchants")) {
        return { rows: [{ id: merchantId, name: "Apex Electronics", is_active: true }] };
      }
      if (sql.includes("FROM products")) {
        expect(sql).toContain("ORDER BY created_at DESC");
        return {
          rows: [
            {
              ...sampleProduct,
              match_score: "1.0",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const req = new NextRequest(`http://localhost:3000/api/maas/${merchantId}/catalog`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const res = await GET(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.merchant_id).toBe(merchantId);
    expect(data.merchant_name).toBe("Apex Electronics");
    expect(data.query).toBeNull();
    expect(data.result_count).toBe(1);
    expect(data.products[0].match_score).toBe(1.0);
    expect(data.products[0].price_paise).toBe(2999000);
    expect(data.products[0].price_display).toBe("₹29,990");
    expect(data.products[0].currency).toBe("INR");
    expect(data.products[0].agent_purchase_url).toBe(`http://localhost:3000/api/maas/${merchantId}/transact`);

    // Embedding should NOT have been generated
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it("handles semantic vector search with Gemini embeddings & 0.5 threshold filtering (D-01, D-02)", async () => {
    const dummyVector = new Array(768).fill(0.05);
    (generateEmbedding as any).mockResolvedValueOnce(dummyVector);

    const highMatch = { ...sampleProduct, id: "prod-1", match_score: "0.8500" };
    const lowMatch = { ...sampleProduct, id: "prod-2", match_score: "0.3200" };

    (query as any).mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes("FROM merchants")) {
        return { rows: [{ id: merchantId, name: "Apex Electronics", is_active: true }] };
      }
      if (sql.includes("FROM products")) {
        expect(sql).toContain("embedding <=>");
        expect(params[0]).toBe(`[${dummyVector.join(",")}]`);
        return { rows: [highMatch, lowMatch] };
      }
      return { rows: [] };
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/catalog?q=wireless+headphones`,
      {
        headers: { Authorization: `Bearer ${validToken}` },
      }
    );
    const res = await GET(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.query).toBe("wireless headphones");
    expect(data.result_count).toBe(1);
    expect(data.products[0].id).toBe("prod-1");
    expect(data.products[0].match_score).toBe(0.85);
  });

  it("falls back to top 3 closest items when all match_scores are < 0.5 (D-02)", async () => {
    const dummyVector = new Array(768).fill(0.01);
    (generateEmbedding as any).mockResolvedValueOnce(dummyVector);

    const items = [
      { ...sampleProduct, id: "prod-1", match_score: "0.4500" },
      { ...sampleProduct, id: "prod-2", match_score: "0.4200" },
      { ...sampleProduct, id: "prod-3", match_score: "0.3800" },
      { ...sampleProduct, id: "prod-4", match_score: "0.2100" },
    ];

    (query as any).mockImplementation(async (sql: string) => {
      if (sql.includes("FROM merchants")) {
        return { rows: [{ id: merchantId, name: "Apex Electronics", is_active: true }] };
      }
      if (sql.includes("FROM products")) {
        return { rows: items };
      }
      return { rows: [] };
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/catalog?q=unrelated+item`,
      {
        headers: { Authorization: `Bearer ${validToken}` },
      }
    );
    const res = await GET(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result_count).toBe(3);
    expect(data.products.map((p: any) => p.id)).toEqual(["prod-1", "prod-2", "prod-3"]);
  });

  it("falls back to SQL ILIKE search when Gemini embedding fails or returns null (D-01)", async () => {
    (generateEmbedding as any).mockResolvedValueOnce(null);

    (query as any).mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes("FROM merchants")) {
        return { rows: [{ id: merchantId, name: "Apex Electronics", is_active: true }] };
      }
      if (sql.includes("FROM products")) {
        expect(sql).toContain("ILIKE");
        expect(params).toContain("%headphones%");
        return {
          rows: [
            {
              ...sampleProduct,
              match_score: "0.75",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/catalog?q=headphones`,
      {
        headers: { Authorization: `Bearer ${validToken}` },
      }
    );
    const res = await GET(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.query).toBe("headphones");
    expect(data.result_count).toBe(1);
    expect(data.products[0].match_score).toBe(0.75);
  });

  it("enforces 60 rpm rate limit and returns 429 with Retry-After (D-07)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/maas/${merchantId}/catalog`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    // Make 60 requests
    for (let i = 0; i < 60; i++) {
      const r = await GET(req, { params: { merchant_id: merchantId } });
      expect(r.status).toBe(200);
    }

    // 61st request should be rejected
    const blockedRes = await GET(req, { params: { merchant_id: merchantId } });
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("retry-after")).toBeDefined();
    const data = await blockedRes.json();
    expect(data.error).toBe("TOO_MANY_REQUESTS");
  });
});
