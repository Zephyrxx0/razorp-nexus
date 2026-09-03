import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatPaiseToInr, buildAgentPurchaseUrl } from "@/lib/url-helpers";
import { generateEmbedding } from "@/lib/embeddings";

describe("url-helpers", () => {
  it("formats integer paise into INR currency display string (§6.1)", () => {
    expect(formatPaiseToInr(2999000)).toBe("₹29,990");
    expect(formatPaiseToInr(19900)).toBe("₹199");
    expect(formatPaiseToInr(0)).toBe("₹0");
  });

  it("builds agent_purchase_url from host header", () => {
    const req = new Request("http://localhost:3000/api/maas/merchant-1/catalog", {
      headers: {
        host: "api.nexus.ai",
        "x-forwarded-proto": "https",
      },
    });
    const url = buildAgentPurchaseUrl(req, "merchant-1");
    expect(url).toBe("https://api.nexus.ai/api/maas/merchant-1/transact");
  });

  it("falls back to default baseUrl when headers are missing", () => {
    const req = new Request("http://localhost:3000/api/maas/merchant-1/catalog");
    const url = buildAgentPurchaseUrl(req, "merchant-1");
    expect(url).toContain("/api/maas/merchant-1/transact");
  });
});

describe("embeddings", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null when neither GOOGLE_API_KEY nor GEMINI_API_KEY is configured", async () => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await generateEmbedding("test query");
    expect(result).toBeNull();
  });
});
