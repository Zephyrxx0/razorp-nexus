import { NextRequest, NextResponse } from "next/server"
import { query } from "@nexus/db"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get("merchant_id")

    if (!merchantId) {
      return NextResponse.json(
        { error: "merchant_id query parameter is required" },
        { status: 400 }
      )
    }

    const res = await query(
      `SELECT t.id, t.merchant_id, t.buyer_email_hash, t.amount_paise, t.status,
              t.razorpay_order_id, t.razorpay_payment_id, t.created_at,
              COALESCE(a.trust_score, 85) as trust_score,
              COALESCE(a.decision, CASE WHEN t.status = 'SUCCESS' THEN 'ALLOW' ELSE 'DENY' END) as decision,
              COALESCE(a.risk_factors, '[]'::jsonb) as risk_factors,
              a.step_data, a.payload_hash, a.previous_hash
       FROM transactions t
       LEFT JOIN LATERAL (
         SELECT trust_score, decision, risk_factors, step_data, payload_hash, previous_hash
         FROM audit_logs
         WHERE transaction_id = t.id
         ORDER BY sequence_number DESC
         LIMIT 1
       ) a ON true
       WHERE t.merchant_id = $1
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [merchantId]
    )

    const transactions = res.rows.map((row: any) => ({
      ...row,
      trust_score: row.trust_score !== null && row.trust_score !== undefined ? Number(row.trust_score) : null,
    }))

    return NextResponse.json({ transactions })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
