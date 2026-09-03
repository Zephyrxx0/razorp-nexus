import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns status 200 with healthy service metadata", async () => {
    const req = new NextRequest("http://localhost:3000/api/health");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");

    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.service).toBe("nexus-maas-gateway");
    expect(typeof data.timestamp).toBe("string");
    expect(new Date(data.timestamp).getTime()).not.toBeNaN();
  });
});
