import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { key_id, key_secret } = body

    if (!key_id || !key_secret) {
      return NextResponse.json(
        { valid: false, error: "Key ID and Key Secret are required." },
        { status: 400 }
      )
    }

    if (!key_id.startsWith("rzp_test_")) {
      return NextResponse.json(
        { valid: false, error: "Key ID must start with rzp_test_ for test mode." },
        { status: 422 }
      )
    }

    const authHeader =
      "Basic " + Buffer.from(`${key_id}:${key_secret}`).toString("base64")

    const rzpRes = await fetch("https://api.razorpay.com/v1/payments?count=1", {
      headers: {
        Authorization: authHeader,
      },
    })

    if (!rzpRes.ok) {
      return NextResponse.json(
        {
          valid: false,
          error: "Authentication failed with Razorpay API. Check your test credentials.",
        },
        { status: 401 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch (error: any) {
    return NextResponse.json(
      { valid: false, error: error.message || "Failed to verify Razorpay keys" },
      { status: 500 }
    )
  }
}
