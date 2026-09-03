import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: { node_id: string } }
) {
  try {
    const { node_id } = params
    if (!node_id) {
      return NextResponse.json({ error: "node_id parameter is required" }, { status: 400 })
    }

    const trustServiceUrl = process.env.TRUST_GRAPH_URL || "http://127.0.0.1:8001"
    const res = await fetch(`${trustServiceUrl}/trust/node/${encodeURIComponent(node_id)}`, {
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Node ${node_id} not found in Trust Graph` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
