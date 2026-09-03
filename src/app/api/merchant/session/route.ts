import { NextRequest, NextResponse } from "next/server"
import { query } from "@nexus/db"

export async function GET(req: NextRequest) {
  try {
    let merchantId = req.cookies.get("nexus_merchant_id")?.value

    let merchant = null
    if (merchantId) {
      const res = await query(
        "SELECT id, name, email FROM merchants WHERE id = $1 LIMIT 1",
        [merchantId]
      )
      if (res.rows.length > 0) {
        merchant = res.rows[0]
      }
    }

    if (!merchant) {
      const fallback = await query(
        "SELECT id, name, email FROM merchants ORDER BY created_at ASC LIMIT 1"
      )
      if (fallback.rows.length > 0) {
        merchant = fallback.rows[0]
        merchantId = merchant.id
      }
    }

    const response = NextResponse.json({ merchant })
    if (merchantId) {
      response.cookies.set("nexus_merchant_id", merchantId, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      })
    }
    return response
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { merchant_id } = await req.json()
    if (!merchant_id) {
      return NextResponse.json({ error: "merchant_id is required" }, { status: 400 })
    }

    const res = await query(
      "SELECT id, name, email FROM merchants WHERE id = $1 LIMIT 1",
      [merchant_id]
    )
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    const merchant = res.rows[0]
    const response = NextResponse.json({ success: true, merchant })
    response.cookies.set("nexus_merchant_id", merchant.id, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
