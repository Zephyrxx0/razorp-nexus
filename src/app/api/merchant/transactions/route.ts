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

    // Join transactions with the latest audit_entries row per transaction
    // Uses canonical columns: buyer_fingerprint JSONB, audit_entries table
    const res = await query(
      `SELECT
         t.id,
         t.merchant_id,
         t.buyer_fingerprint->>'email_hash' AS buyer_email_hash,
         t.amount_paise,
         t.status,
         t.trust_score,
         t.trust_decision                  AS decision,
         t.trust_risk_factors              AS risk_factors,
         t.razorpay_order_id,
         t.razorpay_payment_id,
         t.created_at,
         a.step_data,
         a.entry_hash                      AS payload_hash,
         a.prev_entry_hash                 AS previous_hash
       FROM transactions t
       LEFT JOIN LATERAL (
         SELECT
           raw_data  AS step_data,
           entry_hash,
           prev_entry_hash
         FROM audit_entries
         WHERE transaction_id = t.id
         ORDER BY step_number DESC
         LIMIT 1
       ) a ON true
       WHERE t.merchant_id = $1
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [merchantId]
    )

    const transactions = res.rows.map((row: any) => ({
      ...row,
      trust_score: row.trust_score !== null && row.trust_score !== undefined
        ? Number(row.trust_score)
        : null,
    }))

    return NextResponse.json({ transactions })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
