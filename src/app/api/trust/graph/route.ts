import { NextResponse } from "next/server"

export async function GET() {
  try {
    const trustServiceUrl = process.env.TRUST_GRAPH_URL || "http://127.0.0.1:8001"
    const res = await fetch(`${trustServiceUrl}/trust/graph`, {
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        { elements: { nodes: [], edges: [] }, error: "Trust Graph service unavailable" },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { elements: { nodes: [], edges: [] }, error: error.message || "Failed to reach Trust Graph" },
      { status: 502 }
    )
  }
}
