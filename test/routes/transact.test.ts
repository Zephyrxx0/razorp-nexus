import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/maas/[merchant_id]/transact/route";
import { query } from "@nexus/db";
import { resetRateLimits } from "@/lib/rate-limiter";
import {
  createMockSuccessResponse,
  createMockTrustDenialResponse,
  createMockStockErrorResponse,
  createMockIntentErrorResponse,
  createMockExecutionErrorResponse,
  createMockAdkEvents,
} from "../helpers/mock-adk";

vi.mock("@nexus/db", async () => {
  const actual = await vi.importActual<any>("@nexus/db");
  return {
    ...actual,
    query: vi.fn(),
  };
});

describe("POST /api/maas/[merchant_id]/transact", () => {
  const merchantId = "11111111-1111-1111-1111-111111111111";
  const otherMerchantId = "22222222-2222-2222-2222-222222222222";
  const validToken = "nx_live_abcdef1234567890abcdef123456";

  const defaultPayload = {
    intent: "Buy 2 units of Sony wireless headphones for agent@nexus.ai",
    buyer: {
      email: "agent@nexus.ai",
      ip: "103.21.44.132",
      device_id: "a3f8b2c1d4e500112233445566778899",
      upi_handle: "agent@upi",
      user_agent: "NexusDemoBuyer/1.0",
    },
    metadata: {
      session_id: "sess_12345",
    },
  };

  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();

    // Default mock: valid token belonging to merchantId
    (query as any).mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes("FROM merchants WHERE maas_token_hash")) {
        return {
          rows: [{ id: merchantId, name: "Apex Electronics", is_active: true }],
        };
      }
      if (sql.includes("FROM merchants WHERE id = $1")) {
        return {
          rows:
            params[0] === merchantId
              ? [{ id: merchantId, name: "Apex Electronics", is_active: true }]
              : [],
        };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("UNAUTHORIZED");
  });

  it("returns 403 when token belongs to another merchant (D-06)", async () => {
    (query as any).mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes("FROM merchants WHERE maas_token_hash")) {
        return {
          rows: [{ id: otherMerchantId, name: "Other Merchant", is_active: true }],
        };
      }
      if (sql.includes("FROM merchants WHERE id = $1")) {
        return {
          rows: [{ id: merchantId, name: "Apex Electronics", is_active: true }],
        };
      }
      return { rows: [] };
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("FORBIDDEN");
  });

  it("returns 404 when target merchant does not exist in database (D-06)", async () => {
    (query as any).mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes("FROM merchants WHERE maas_token_hash")) {
        return {
          rows: [{ id: otherMerchantId, name: "Other Merchant", is_active: true }],
        };
      }
      if (sql.includes("FROM merchants WHERE id = $1")) {
        return { rows: [] }; // Target merchant not found
      }
      return { rows: [] };
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("NOT_FOUND");
  });

  it("enforces 20 rpm rate limit and returns 429 with Retry-After (D-07)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        createMockSuccessResponse("txn-1", "order-1", "pay-1", 5998000),
    });

    const createReq = () =>
      new NextRequest(`http://localhost:3000/api/maas/${merchantId}/transact`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      });

    // Send 20 requests
    for (let i = 0; i < 20; i++) {
      const res = await POST(createReq(), { params: { merchant_id: merchantId } });
      expect(res.status).toBe(200);
    }

    // 21st request should be blocked
    const blockedRes = await POST(createReq(), {
      params: { merchant_id: merchantId },
    });
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("retry-after")).toBeDefined();
    const data = await blockedRes.json();
    expect(data.error).toBe("TOO_MANY_REQUESTS");
  });

  it("returns 422 when required intent or buyer object is missing", async () => {
    const invalidPayloads = [
      {},
      { intent: "Buy item" }, // missing buyer
      { buyer: { email: "a@b.com" } }, // missing intent
      { intent: "   ", buyer: {} }, // blank intent
    ];

    for (const p of invalidPayloads) {
      const req = new NextRequest(
        `http://localhost:3000/api/maas/${merchantId}/transact`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${validToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(p),
        }
      );
      const res = await POST(req, { params: { merchant_id: merchantId } });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe("INVALID_REQUEST");
      expect(data.audit_trail).toEqual([]);
    }
  });

  it("returns 200 SUCCESS on happy path with full audit trail and integer paise (D-10, AUDIT-03)", async () => {
    const mockSuccess = createMockSuccessResponse(
      "txn_success_123",
      "order_ABC123",
      "pay_XYZ789",
      5998000
    );

    let sentBody: any;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => mockSuccess,
      };
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe("SUCCESS");
    expect(data.transaction_id).toBe("txn_success_123");
    expect(data.trust_score).toBe(87);
    expect(data.trust_decision).toBe("ALLOW");
    expect(data.product.total_amount_paise).toBe(5998000);
    expect(data.product.total_amount_display).toBe("₹59,980");
    expect(data.razorpay_order_id).toBe("order_ABC123");
    expect(data.razorpay_payment_id).toBe("pay_XYZ789");
    expect(data.payment_status).toBe("captured");
    expect(data.audit_trail).toHaveLength(6);

    // Verify sanitization and credential isolation (D-08, D-09)
    expect(sentBody.merchant_id).toBe(merchantId);
    expect(sentBody.key_secret).toBeUndefined();
    expect(sentBody.buyer_fingerprint.ip_subnet).toBe("103.21.44.0/24");
    expect(sentBody.buyer_fingerprint.email_hash).toBeDefined();
    expect(sentBody.buyer_fingerprint.device_hash).toBeDefined();
    expect(sentBody.buyer_fingerprint.user_agent_hash).toBeDefined();
  });

  it("handles ADK Event[] stream responses properly", async () => {
    const events = createMockAdkEvents(
      [
        {
          step_name: "PARSE_INTENT",
          step_number: 1,
          summary: "Parsed Sony headphones x1",
          reason: "Intent parsed",
          duration_ms: 10,
          raw_data: { product_query: "Sony headphones", quantity: 1 },
        },
        {
          step_name: "RESOLVE_CATALOG",
          step_number: 2,
          summary: "Resolved Sony WH-1000XM5",
          reason: "Stock allocated",
          duration_ms: 20,
          raw_data: {
            product_id: "prod-1",
            name: "Sony WH-1000XM5",
            quantity: 1,
            unit_price_paise: 2999000,
            total_amount_paise: 2999000,
          },
        },
        {
          step_name: "CHECK_TRUST_GRAPH",
          step_number: 3,
          summary: "Trust score 90.0",
          reason: "Safe",
          duration_ms: 15,
          raw_data: { score: 90.0, decision: "ALLOW" },
        },
        {
          step_name: "CREATE_RAZORPAY_ORDER",
          step_number: 4,
          summary: "Order created",
          reason: "Order created",
          duration_ms: 100,
          raw_data: { order_id: "order_test_stream" },
        },
        {
          step_name: "CAPTURE_RAZORPAY_PAYMENT",
          step_number: 5,
          summary: "Payment captured",
          reason: "Captured",
          duration_ms: 120,
          raw_data: { payment_id: "pay_test_stream" },
        },
        {
          step_name: "LOG_AUDIT_ENTRY",
          step_number: 6,
          summary: "Audit completed",
          reason: "Success",
          duration_ms: 10,
          raw_data: {},
        },
      ],
      {
        status: "SUCCESS",
        transaction_id: "txn_stream_123",
        trust_score: 90.0,
        trust_decision: "ALLOW",
        order_id: "order_test_stream",
        payment_id: "pay_test_stream",
      }
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => events,
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("SUCCESS");
    expect(data.transaction_id).toBe("txn_stream_123");
    expect(data.product.name).toBe("Sony WH-1000XM5");
    expect(data.razorpay_order_id).toBe("order_test_stream");
    expect(data.razorpay_payment_id).toBe("pay_test_stream");
    expect(data.audit_trail).toHaveLength(6);
  });

  it("returns 403 Forbidden on TRUST DENIED with risk factors and null order/payment IDs (D-10)", async () => {
    const mockDenied = createMockTrustDenialResponse(
      "txn_denied_456",
      22.0,
      ["known_fraud_neighbor_1hop", "cross_merchant_velocity"]
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockDenied,
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(403);
    const data = await res.json();

    expect(data.status).toBe("DENIED");
    expect(data.transaction_id).toBe("txn_denied_456");
    expect(data.trust_score).toBe(22.0);
    expect(data.trust_decision).toBe("DENY");
    expect(data.risk_factors).toEqual([
      "known_fraud_neighbor_1hop",
      "cross_merchant_velocity",
    ]);
    expect(data.razorpay_order_id).toBeNull();
    expect(data.razorpay_payment_id).toBeNull();
    expect(data.message).toContain("fraud ring");
    expect(data.audit_trail).toHaveLength(4);
  });

  it("returns 409 Conflict on insufficient stock with available vs requested quantity (D-10)", async () => {
    const mockStockError = createMockStockErrorResponse("txn_stock_789", 5, 1);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockStockError,
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(409);
    const data = await res.json();

    expect(data.status).toBe("FAILED");
    expect(data.error_code).toBe("INSUFFICIENT_STOCK");
    expect(data.available_stock).toBe(1);
    expect(data.requested_quantity).toBe(5);
    expect(data.audit_trail).toHaveLength(3);
  });

  it("returns 422 Unprocessable Entity on intent parsing failure (D-10)", async () => {
    const mockIntentError = createMockIntentErrorResponse({
      intent: "gibberish hello world",
      reason: "Zero confidence product match",
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockIntentError,
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...defaultPayload,
          intent: "gibberish hello world",
        }),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(422);
    const data = await res.json();

    expect(data.error).toBe("UNPROCESSABLE_ENTITY");
    expect(data.details.intent).toBe("gibberish hello world");
    expect(data.audit_trail).toHaveLength(2);
  });

  it("returns 504 Gateway Timeout when ADK orchestrator exceeds SLA (D-11)", async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.error).toBe("GATEWAY_TIMEOUT");
    expect(data.message).toContain("10-second SLA");
    expect(data.audit_trail).toEqual([]);
  });

  it("returns 502 Bad Gateway when ADK server connection fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:8000"));

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("ORCHESTRATOR_UNAVAILABLE");
    expect(data.audit_trail).toEqual([]);
  });

  it("returns 500 Internal Server Error on unhandled pipeline execution error", async () => {
    const mockExecutionError = createMockExecutionErrorResponse(
      "Database transaction deadlock during audit logging"
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => mockExecutionError,
    });

    const req = new NextRequest(
      `http://localhost:3000/api/maas/${merchantId}/transact`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultPayload),
      }
    );
    const res = await POST(req, { params: { merchant_id: merchantId } });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("EXECUTION_ERROR");
    expect(data.message).toBe("Database transaction deadlock during audit logging");
    expect(data.audit_trail).toHaveLength(1);
  });
});
