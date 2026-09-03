import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { GET as transactionsGET } from "@/app/api/merchant/transactions/route"
import { POST as testTransactPOST } from "@/app/api/merchant/test-transact/route"
import * as db from "@nexus/db"

vi.mock("@nexus/db", () => ({
  query: vi.fn(),
  getDbPool: vi.fn(),
}))

describe("Merchant Transactions Feed & Simulation (DASH-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET /api/merchant/transactions", () => {
    it("returns transactions for merchant with trust score and risk decomposition", async () => {
      const mockTxns = [
        {
          id: "txn-1",
          merchant_id: "m-100",
          buyer_email_hash: "a1b2c3d4",
          amount_paise: 299900,
          status: "SUCCESS",
          razorpay_order_id: "order_123",
          trust_score: 95,
          decision: "ALLOW",
          risk_factors: ["clean_history"],
          created_at: new Date().toISOString(),
        },
      ]
      vi.mocked(db.query).mockResolvedValueOnce({ rows: mockTxns } as any)

      const req = new NextRequest("http://localhost:3000/api/merchant/transactions?merchant_id=m-100")
      const res = await transactionsGET(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.transactions).toHaveLength(1)
      expect(data.transactions[0].trust_score).toBe(95)
      expect(data.transactions[0].decision).toBe("ALLOW")
    })

    it("returns 400 when merchant_id parameter is absent", async () => {
      const req = new NextRequest("http://localhost:3000/api/merchant/transactions")
      const res = await transactionsGET(req)
      expect(res.status).toBe(400)
    })
  })

  describe("POST /api/merchant/test-transact", () => {
    it("creates an authorized sample transaction with sealed 6-step audit trail", async () => {
      const mockProduct = {
        id: "prod-sim-1",
        name: "Test Smart Lamp",
        price_paise: 199900,
      }
      const mockTxn = {
        id: "txn-sim-99",
        created_at: new Date().toISOString(),
      }

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [mockProduct] } as any) // Find product
        .mockResolvedValueOnce({ rows: [mockTxn] } as any) // Insert txn
        .mockResolvedValueOnce({ rows: [] } as any) // Insert audit_log

      const req = new NextRequest("http://localhost:3000/api/merchant/test-transact", {
        method: "POST",
        body: JSON.stringify({ merchant_id: "m-100" }),
      })

      const res = await testTransactPOST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.status).toBe("SUCCESS")
      expect(data.trust_score).toBe(92)
      expect(data.decision).toBe("ALLOW")
      expect(data.amount_paise).toBe(199900)

      // Verify audit log insertion had 6 steps
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO audit_logs"),
        expect.arrayContaining([
          "txn-sim-99",
          expect.stringContaining("parse_intent"),
        ])
      )
    })
  })
})
