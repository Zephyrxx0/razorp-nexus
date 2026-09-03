import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { GET as graphGET } from "@/app/api/trust/graph/route"
import { GET as ringsGET } from "@/app/api/trust/rings/route"
import { GET as nodeGET } from "@/app/api/trust/node/[node_id]/route"

describe("Trust Graph Proxy APIs (DASH-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET /api/trust/graph", () => {
    it("proxies graph elements from FastAPI microservice", async () => {
      const mockElements = {
        elements: {
          nodes: [{ data: { id: "node-1", label: "buyer@test.io", trust_score: 90 } }],
          edges: [{ data: { id: "edge-1", source: "node-1", target: "node-2" } }],
        },
      }
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockElements,
      } as any)

      const res = await graphGET()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.elements.nodes).toHaveLength(1)
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/trust/graph"),
        expect.anything()
      )
      fetchSpy.mockRestore()
    })

    it("returns 502 with fallback empty elements when FastAPI is unreachable", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"))

      const res = await graphGET()
      expect(res.status).toBe(502)
      const data = await res.json()
      expect(data.elements.nodes).toHaveLength(0)
      expect(data.error).toContain("ECONNREFUSED")
      fetchSpy.mockRestore()
    })
  })

  describe("GET /api/trust/rings", () => {
    it("proxies detected fraud rings list", async () => {
      const mockRings = [
        {
          ring_id: "ring_1",
          risk_score: 95,
          members_count: 5,
          merchants_spanned: ["m-1", "m-2"],
          nodes: ["n1", "n2", "n3"],
        },
      ]
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockRings,
      } as any)

      const res = await ringsGET()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.rings).toHaveLength(1)
      expect(data.rings[0].ring_id).toBe("ring_1")
      fetchSpy.mockRestore()
    })
  })

  describe("GET /api/trust/node/[node_id]", () => {
    it("encodes and proxies node details", async () => {
      const mockNode = {
        node_id: "e3b0c442",
        entity_type: "email_hash",
        trust_score: 85,
        degree: 3,
        in_ring: false,
        neighbors: ["ip_subnet:192.168.1.0/24"],
        transactions: ["txn_100"],
      }
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockNode,
      } as any)

      const req = new NextRequest("http://localhost:3000/api/trust/node/e3b0c442")
      const res = await nodeGET(req, { params: { node_id: "e3b0c442" } })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.entity_type).toBe("email_hash")
      expect(data.trust_score).toBe(85)
      fetchSpy.mockRestore()
    })
  })
})
