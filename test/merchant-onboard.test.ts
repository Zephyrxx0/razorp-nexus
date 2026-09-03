import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { POST as verifyKeysPOST } from "@/app/api/merchant/verify-keys/route"
import { GET as sessionGET, POST as sessionPOST } from "@/app/api/merchant/session/route"
import { GET as listGET } from "@/app/api/merchant/list/route"
import { POST as onboardPOST } from "@/app/api/merchant/onboard/route"
import * as db from "@nexus/db"

vi.mock("@nexus/db", () => ({
  query: vi.fn(),
  getDbPool: vi.fn(),
}))

describe("Merchant Onboarding & Session APIs (DASH-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("POST /api/merchant/verify-keys", () => {
    it("returns 400 when keys are missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/merchant/verify-keys", {
        method: "POST",
        body: JSON.stringify({ key_id: "" }),
      })
      const res = await verifyKeysPOST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.valid).toBe(false)
      expect(data.error).toContain("required")
    })

    it("returns 422 when key_id does not start with rzp_test_", async () => {
      const req = new NextRequest("http://localhost:3000/api/merchant/verify-keys", {
        method: "POST",
        body: JSON.stringify({ key_id: "rzp_live_abc123", key_secret: "secret123" }),
      })
      const res = await verifyKeysPOST(req)
      expect(res.status).toBe(422)
      const data = await res.json()
      expect(data.valid).toBe(false)
      expect(data.error).toContain("rzp_test_")
    })

    it("validates test credentials against Razorpay API endpoint", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      } as any)

      const req = new NextRequest("http://localhost:3000/api/merchant/verify-keys", {
        method: "POST",
        body: JSON.stringify({ key_id: "rzp_test_Apex123", key_secret: "secretApex" }),
      })
      const res = await verifyKeysPOST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.valid).toBe(true)
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.razorpay.com/v1/payments?count=1",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        })
      )
      fetchSpy.mockRestore()
    })

    it("returns 401 when Razorpay returns authentication failure", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as any)

      const req = new NextRequest("http://localhost:3000/api/merchant/verify-keys", {
        method: "POST",
        body: JSON.stringify({ key_id: "rzp_test_BadKey", key_secret: "badSecret" }),
      })
      const res = await verifyKeysPOST(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.valid).toBe(false)
      expect(data.error).toContain("Authentication failed")
      fetchSpy.mockRestore()
    })
  })

  describe("Merchant Session & List", () => {
    it("returns merchant list from database", async () => {
      const mockMerchants = [
        { id: "m-1", name: "Store One", email: "one@nexus.test", created_at: "2026-09-01" },
        { id: "m-2", name: "Store Two", email: "two@nexus.test", created_at: "2026-09-02" },
      ]
      vi.mocked(db.query).mockResolvedValueOnce({ rows: mockMerchants } as any)

      const res = await listGET()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.merchants).toHaveLength(2)
      expect(data.merchants[0].name).toBe("Store One")
    })

    it("switches active merchant in session and sets cookie", async () => {
      const mockMerchant = { id: "m-99", name: "Target Store", email: "target@test.io" }
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [mockMerchant] } as any)

      const req = new NextRequest("http://localhost:3000/api/merchant/session", {
        method: "POST",
        body: JSON.stringify({ merchant_id: "m-99" }),
      })
      const res = await sessionPOST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.merchant.id).toBe("m-99")
      expect(res.cookies.get("nexus_merchant_id")?.value).toBe("m-99")
    })
  })

  describe("POST /api/merchant/onboard", () => {
    it("creates merchant with encrypted keys and returns MaaS Bearer token", async () => {
      const mockMerchant = {
        id: "new-merchant-uuid",
        name: "Acme Superstore",
        email: "acme@test.com",
        razorpay_key_id: "rzp_test_Acme99",
        maas_token_preview: "maas_live_1234...5678",
        created_at: new Date().toISOString(),
      }
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [mockMerchant] } as any)

      const req = new NextRequest("http://localhost:3000/api/merchant/onboard", {
        method: "POST",
        body: JSON.stringify({
          name: "Acme Superstore",
          email: "acme@test.com",
          key_id: "rzp_test_Acme99",
          key_secret: "secretPassAcme",
        }),
      })

      const res = await onboardPOST(req)
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.merchant_id).toBe("new-merchant-uuid")
      expect(data.maas_token).toMatch(/^maas_live_[a-f0-9]{32}$/)
      expect(data.transact_url).toBe("/api/maas/new-merchant-uuid/transact")
      expect(res.cookies.get("nexus_merchant_id")?.value).toBe("new-merchant-uuid")

      // Verify db.query called with encrypted key format
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO merchants"),
        expect.arrayContaining(["Acme Superstore", "acme@test.com", "rzp_test_Acme99"])
      )
    })
  })
})
