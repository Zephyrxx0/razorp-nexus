import { NextRequest, NextResponse } from "next/server"
import { getDbPool, query } from "@nexus/db"

interface Params {
  params: {
    id: string
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const merchantId = params.id
    if (!merchantId) {
      return NextResponse.json({ error: "Merchant ID is required" }, { status: 400 })
    }

    const merchantRes = await query(
      `SELECT id, name, email, razorpay_key_id, razorpay_webhook_secret,
              COALESCE(maas_token_preview, token_preview, '') as token_preview,
              created_at, is_active
       FROM merchants
       WHERE id = $1
       LIMIT 1`,
      [merchantId]
    )

    if (merchantRes.rows.length === 0) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    const merchant = merchantRes.rows[0]

    // Fetch related statistics
    const [prodCountRes, txCountRes, auditCountRes, sampleProdRes] = await Promise.all([
      query("SELECT count(*)::int as count FROM products WHERE merchant_id = $1", [merchantId]),
      query("SELECT count(*)::int as count FROM transactions WHERE merchant_id = $1", [merchantId]),
      query(
        "SELECT count(*)::int as count FROM audit_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE merchant_id = $1)",
        [merchantId]
      ),
      query(
        "SELECT name FROM products WHERE merchant_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1",
        [merchantId]
      ),
    ])

    return NextResponse.json({
      merchant,
      stats: {
        product_count: prodCountRes.rows[0]?.count || 0,
        transaction_count: txCountRes.rows[0]?.count || 0,
        audit_entry_count: auditCountRes.rows[0]?.count || 0,
        sample_product: sampleProdRes.rows[0]?.name || "Sample Product",
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const merchantId = params.id
  if (!merchantId) {
    return NextResponse.json({ error: "Merchant ID is required" }, { status: 400 })
  }

  const pool = getDbPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    // Bypass immutable triggers during administrative deletion
    await client.query("SET LOCAL session_replication_role = 'replica'")

    // 1. Delete audit_entries for all transactions belonging to this merchant
    await client.query(
      `DELETE FROM audit_entries
       WHERE transaction_id IN (SELECT id FROM transactions WHERE merchant_id = $1)`,
      [merchantId]
    )

    // 2. Delete transactions belonging to this merchant
    await client.query("DELETE FROM transactions WHERE merchant_id = $1", [merchantId])

    // 3. Delete products belonging to this merchant
    await client.query("DELETE FROM products WHERE merchant_id = $1", [merchantId])

    // 4. Delete the merchant record
    const delRes = await client.query(
      "DELETE FROM merchants WHERE id = $1 RETURNING id, name",
      [merchantId]
    )

    if (delRes.rowCount === 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    await client.query("COMMIT")

    const deletedStoreName = delRes.rows[0].name

    // Manage session cookie if active merchant was deleted
    const currentSessionCookie = req.cookies.get("nexus_merchant_id")?.value
    const nextMerchantRes = await query(
      "SELECT id, name, email FROM merchants ORDER BY created_at ASC LIMIT 1"
    )

    const response = NextResponse.json({
      success: true,
      message: `Store "${deletedStoreName}" and all associated products, transactions, and audit records were permanently deleted.`,
      next_merchant: nextMerchantRes.rows[0] || null,
    })

    if (currentSessionCookie === merchantId) {
      if (nextMerchantRes.rows.length > 0) {
        response.cookies.set("nexus_merchant_id", nextMerchantRes.rows[0].id, {
          path: "/",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30,
        })
      } else {
        response.cookies.delete("nexus_merchant_id")
      }
    }

    return response
  } catch (error: any) {
    await client.query("ROLLBACK")
    return NextResponse.json({ error: error.message }, { status: 500 })
  } finally {
    client.release()
  }
}
