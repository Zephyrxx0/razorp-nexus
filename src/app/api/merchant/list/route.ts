import { NextResponse } from "next/server"
import { query } from "@nexus/db"

export async function GET() {
  try {
    const res = await query(
      "SELECT id, name, email, created_at FROM merchants ORDER BY created_at DESC"
    )
    return NextResponse.json({ merchants: res.rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
