import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/audit/[transaction_id]/route";
import { query, computeEntryHash, AuditEntry } from "@nexus/db";

vi.mock("@nexus/db", async () => {
  const actual = await vi.importActual<any>("@nexus/db");
  return {
    ...actual,
    query: vi.fn(),
  };
});

describe("GET /api/audit/[transaction_id]", () => {
  const txId = "txn_audit_valid_123";

  function createValidChain(transactionId: string): AuditEntry[] {
    const steps = [
      {
        step_number: 1,
        step_name: "PARSE_INTENT",
        input_summary: "Intent: Buy 1 router",
        output_summary: "Query: 'Router', Qty: 1",
        reason: "Intent parsed successfully",
        is_error: false,
        duration_ms: 15,
        raw_data: { product: "Router", quantity: 1 },
      },
      {
        step_number: 2,
        step_name: "RESOLVE_CATALOG",
        input_summary: "Product: 'Router', Qty: 1",
        output_summary: "Resolved: Secure Router, Total: 499900 paise",
        reason: "Catalog resolved and stock decremented",
        is_error: false,
        duration_ms: 25,
        raw_data: { product_id: "prod-1", price_paise: 499900 },
      },
      {
        step_number: 3,
        step_name: "CHECK_TRUST_GRAPH",
        input_summary: "Buyer: test@nexus.ai, Amount: 499900 paise",
        output_summary: "Score: 92.0, Decision: ALLOW",
        reason: "Trust check passed safety threshold (>= 40)",
        is_error: false,
        duration_ms: 20,
        raw_data: { score: 92.0, decision: "ALLOW" },
      },
      {
        step_number: 4,
        step_name: "LOG_AUDIT_ENTRY",
        input_summary: "Status: SUCCESS, Steps: 4",
        output_summary: "Audit trail persisted and verified",
        reason: "All pipeline operations succeeded",
        is_error: false,
        duration_ms: 10,
        raw_data: {},
      },
    ];

    const entries: AuditEntry[] = [];
    let prevHash = "GENESIS";

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const entryHash = computeEntryHash({
        prev_entry_hash: prevHash,
        transaction_id: transactionId,
        step_number: s.step_number,
        step_name: s.step_name,
        input_summary: s.input_summary,
        output_summary: s.output_summary,
        reason: s.reason,
        is_error: s.is_error,
      });

      entries.push({
        id: `entry-${i + 1}`,
        transaction_id: transactionId,
        merchant_id: "merchant-1",
        step_name: s.step_name,
        step_number: s.step_number,
        timestamp: new Date().toISOString(),
        duration_ms: s.duration_ms,
        input_summary: s.input_summary,
        output_summary: s.output_summary,
        reason: s.reason,
        raw_data: s.raw_data,
        is_error: s.is_error,
        prev_entry_hash: prevHash,
        entry_hash: entryHash,
      });

      prevHash = entryHash;
    }

    return entries;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when transaction ID has no audit entries", async () => {
    (query as any).mockResolvedValueOnce({ rows: [] });

    const req = new NextRequest(`http://localhost:3000/api/audit/txn_nonexistent`);
    const res = await GET(req, { params: { transaction_id: "txn_nonexistent" } });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("NOT_FOUND");
    expect(data.message).toBe("No audit trail found for transaction_id");
  });

  it("returns 200 with valid hash chain and complete audit trail (D-12, AUDIT-03)", async () => {
    const validEntries = createValidChain(txId);
    (query as any).mockResolvedValueOnce({ rows: validEntries });

    const req = new NextRequest(`http://localhost:3000/api/audit/${txId}`);
    const res = await GET(req, { params: { transaction_id: txId } });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.transaction_id).toBe(txId);
    expect(data.entry_count).toBe(4);
    expect(data.is_sealed).toBe(true);
    expect(data.hash_chain_valid).toBe(true);
    expect(data.chain_valid).toBe(true);
    expect(data.audit_trail).toHaveLength(4);

    // Verify fields in first entry
    const first = data.audit_trail[0];
    expect(first.step_number).toBe(1);
    expect(first.step_name).toBe("PARSE_INTENT");
    expect(first.prev_entry_hash).toBe("GENESIS");
    expect(first.duration_ms).toBe(15);
    expect(first.raw_data).toEqual({ product: "Router", quantity: 1 });
  });

  it("returns 200 with hash_chain_valid: false when entry hash is tampered", async () => {
    const validEntries = createValidChain(txId);
    // Tamper with output_summary in step 2 without recomputing hash
    validEntries[1].output_summary = "TAMPERED OUTPUT";

    (query as any).mockResolvedValueOnce({ rows: validEntries });

    const req = new NextRequest(`http://localhost:3000/api/audit/${txId}`);
    const res = await GET(req, { params: { transaction_id: txId } });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.transaction_id).toBe(txId);
    expect(data.entry_count).toBe(4);
    expect(data.hash_chain_valid).toBe(false);
    expect(data.chain_valid).toBe(false);
  });

  it("returns 200 with hash_chain_valid: false when step order is corrupted", async () => {
    const validEntries = createValidChain(txId);
    // Corrupt step number
    validEntries[2].step_number = 5;

    (query as any).mockResolvedValueOnce({ rows: validEntries });

    const req = new NextRequest(`http://localhost:3000/api/audit/${txId}`);
    const res = await GET(req, { params: { transaction_id: txId } });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.hash_chain_valid).toBe(false);
    expect(data.chain_valid).toBe(false);
  });

  it("returns 200 with hash_chain_valid: false when genesis hash is invalid", async () => {
    const validEntries = createValidChain(txId);
    validEntries[0].prev_entry_hash = "INVALID_GENESIS";

    (query as any).mockResolvedValueOnce({ rows: validEntries });

    const req = new NextRequest(`http://localhost:3000/api/audit/${txId}`);
    const res = await GET(req, { params: { transaction_id: txId } });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.hash_chain_valid).toBe(false);
    expect(data.chain_valid).toBe(false);
  });
});
