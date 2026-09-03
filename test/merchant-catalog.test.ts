import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import {
  GET as productsGET,
  POST as productsPOST,
  PATCH as productsPATCH,
  DELETE as productsDELETE,
} from "@/app/api/merchant/products/route"
import * as db from "@nexus/db"
import * as embeddings from "@/lib/embeddings"

vi.mock("@nexus/db", () => ({
  query: vi.fn(),
  getDbPool: vi.fn(),
}))

vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: vi.fn(),
}))

describe("Catalog Management API (DASH-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET /api/merchant/products", () => {
    it("returns products for specified merchant_id", async () => {
      const mockProducts = [
        {
          id: "prod-1",
          merchant_id: "m-100",
          name: "Wireless Mouse",
          description: "Ergonomic 2.4G",
          price_paise: 159900,
          stock_quantity: 40,
          category: "Electronics",
          is_ai_purchasable: true,
          has_embedding: true,
        },
      ]
      vi.mocked(db.query).mockResolvedValueOnce({ rows: mockProducts } as any)

      const req = new NextRequest("http://localhost:3000/api/merchant/products?merchant_id=m-100")
      const res = await productsGET(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.products).toHaveLength(1)
      expect(data.products[0].name).toBe("Wireless Mouse")
    })

    it("returns 400 when merchant_id query param is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/merchant/products")
      const res = await productsGET(req)
      expect(res.status).toBe(400)
    })
  })

  describe("POST /api/merchant/products", () => {
    it("rejects non-integer price_paise", async () => {
      const req = new NextRequest("http://localhost:3000/api/merchant/products", {
        method: "POST",
        body: JSON.stringify({
          merchant_id: "m-100",
          name: "Item",
          price_paise: 199.99, // Non-integer
        }),
      })
      const res = await productsPOST(req)
      expect(res.status).toBe(422)
      const data = await res.json()
      expect(data.error).toContain("integer")
    })

    it("creates product and triggers Gemini vector embedding sync", async () => {
      const createdProd = {
        id: "prod-new-1",
        merchant_id: "m-100",
        name: "Mechanical Keyboard",
        description: "RGB clicky switches",
        price_paise: 499900,
        stock_quantity: 15,
        category: "Electronics",
        is_ai_purchasable: true,
      }
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [createdProd] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [] } as any) // UPDATE embedding

      const mockEmbedding = new Array(768).fill(0.05)
      vi.mocked(embeddings.generateEmbedding).mockResolvedValueOnce(mockEmbedding)

      const req = new NextRequest("http://localhost:3000/api/merchant/products", {
        method: "POST",
        body: JSON.stringify({
          merchant_id: "m-100",
          name: "Mechanical Keyboard",
          description: "RGB clicky switches",
          price_paise: 499900,
          stock_quantity: 15,
          category: "Electronics",
          is_ai_purchasable: true,
        }),
      })

      const res = await productsPOST(req)
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.product.name).toBe("Mechanical Keyboard")
      expect(embeddings.generateEmbedding).toHaveBeenCalledWith("RGB clicky switches")
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE products SET embedding = $1::vector"),
        expect.arrayContaining(["prod-new-1"])
      )
    })
  })

  describe("PATCH /api/merchant/products", () => {
    it("enforces tenant boundary — returns 404 when product not owned by merchant", async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [] } as any) // Check ownership

      const req = new NextRequest("http://localhost:3000/api/merchant/products", {
        method: "PATCH",
        body: JSON.stringify({
          id: "prod-other-merchant",
          merchant_id: "m-attacker",
          stock_quantity: 100,
        }),
      })

      const res = await productsPATCH(req)
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toContain("Product not found or access denied")
    })

    it("optimistically updates stock and AI purchasable status", async () => {
      const updatedProd = {
        id: "prod-1",
        merchant_id: "m-100",
        stock_quantity: 25,
        is_ai_purchasable: false,
      }
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [{ id: "prod-1" }] } as any) // Ownership check ok
        .mockResolvedValueOnce({ rows: [updatedProd] } as any) // Update ok

      const req = new NextRequest("http://localhost:3000/api/merchant/products", {
        method: "PATCH",
        body: JSON.stringify({
          id: "prod-1",
          merchant_id: "m-100",
          stock_quantity: 25,
          is_ai_purchasable: false,
        }),
      })

      const res = await productsPATCH(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.product.stock_quantity).toBe(25)
      expect(data.product.is_ai_purchasable).toBe(false)
    })
  })

  describe("DELETE /api/merchant/products", () => {
    it("deletes product within tenant boundary", async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ id: "prod-1" }] } as any)

      const req = new NextRequest(
        "http://localhost:3000/api/merchant/products?id=prod-1&merchant_id=m-100",
        { method: "DELETE" }
      )
      const res = await productsDELETE(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.deleted_id).toBe("prod-1")
    })
  })
})
