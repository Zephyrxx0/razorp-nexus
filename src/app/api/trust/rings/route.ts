import { NextResponse } from "next/server"

export async function GET() {
  try {
    const trustServiceUrl = process.env.TRUST_GRAPH_URL || "http://127.0.0.1:8001"
    const res = await fetch(`${trustServiceUrl}/trust/rings`, {
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json({ rings: [], error: "Trust service unavailable" }, { status: 502 })
    }

    const data = await res.json()
    // FastAPI might return an array or { rings: [...] }
    const rings = Array.isArray(data) ? data : data.rings || []
    return NextResponse.json({ rings })
  } catch (error: any) {
    return NextResponse.json(
      { rings: [], error: error.message || "Failed to fetch rings" },
      { status: 502 }
    )
  }
}
