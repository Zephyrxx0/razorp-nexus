import { NextRequest, NextResponse } from "next/server"
import { query, generateMaasToken } from "@nexus/db"

interface Params {
  params: {
    id: string
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const merchantId = params.id
    if (!merchantId) {
      return NextResponse.json({ error: "Merchant ID is required" }, { status: 400 })
    }

    const { token, hash, preview } = generateMaasToken()

    const updateRes = await query(
      `UPDATE merchants
       SET maas_token_hash = $1,
           maas_token_preview = $2,
           token_preview = $2,
           updated_at = clock_timestamp()
       WHERE id = $3
       RETURNING id, name, maas_token_preview`,
      [hash, preview, merchantId]
    )

    if (updateRes.rowCount === 0) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      token,
      preview,
      message: "New MaaS Bearer token generated successfully.",
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
