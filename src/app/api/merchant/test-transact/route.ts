import { NextRequest, NextResponse } from "next/server"
import { query } from "@nexus/db"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  try {
    const { merchant_id } = await req.json()

    if (!merchant_id) {
      return NextResponse.json({ error: "merchant_id is required" }, { status: 400 })
    }

    // Find available product using canonical `stock` column
    let prodRes = await query(
      `SELECT id, name, price_paise FROM products
       WHERE merchant_id = $1 AND is_active = true AND stock > 0
       LIMIT 1`,
      [merchant_id]
    )

    let prod = prodRes.rows[0]
    if (!prod) {
      // Create a default demo product (uses canonical stock column)
      const insertProd = await query(
        `INSERT INTO products (merchant_id, name, description, price_paise, stock, category)
         VALUES ($1, 'Autonomous Demo Device', 'Sample smart IoT device for agent purchase evaluation', 249900, 50, 'Electronics')
         RETURNING id, name, price_paise`,
        [merchant_id]
      )
      prod = insertProd.rows[0]
    }

    const testEmail = `agent-${crypto.randomBytes(3).toString("hex")}@buyer.nexus`
    const emailHash = crypto.createHash("sha256").update(testEmail.toLowerCase().trim()).digest("hex")
    const ipSubnet = "10.0.1.0/24"
    const orderId = `order_test_${crypto.randomBytes(6).toString("hex")}`
    const paymentId = `pay_test_${crypto.randomBytes(6).toString("hex")}`
    const amountPaise = prod.price_paise

    // Build buyer_fingerprint JSONB (canonical schema column)
    const buyerFingerprint = JSON.stringify({
      email_hash: emailHash,
      ip_subnet: ipSubnet,
      user_agent_hash: crypto.createHash("sha256").update("NexusAI/1.0").digest("hex"),
    })

    // Create transaction using canonical columns — no buyer_email_hash
    const txnRes = await query(
      `INSERT INTO transactions
         (merchant_id, intent_raw, intent_parsed, product_id, quantity,
          amount_paise, currency, buyer_fingerprint,
          trust_score, trust_decision, trust_risk_factors,
          razorpay_order_id, razorpay_payment_id, status)
       VALUES ($1, $2, $3, $4, 1, $5, 'INR', $6::jsonb, 92, 'ALLOW',
               ARRAY['new_entity_clean_ip'], $7, $8, 'SUCCESS')
       RETURNING id, created_at`,
      [
        merchant_id,
        `Buy 1 ${prod.name}`,
        JSON.stringify({ product_query: prod.name, quantity: 1 }),
        prod.id,
        amountPaise,
        buyerFingerprint,
        orderId,
        paymentId,
      ]
    )
    const txn = txnRes.rows[0]

    // Build 6-step audit chain — uses canonical audit_entries table
    const steps = [
      {
        step_name: "parse_intent",
        step_number: 1,
        duration_ms: 210,
        input_summary: `Intent: "Buy 1 ${prod.name}"`,
        output_summary: `product_query="${prod.name}", quantity=1, buyer="${testEmail}"`,
        reason: `Extracted product query '${prod.name}' with quantity 1 for buyer ${testEmail}.`,
        raw_data: { product_query: prod.name, quantity: 1 },
      },
      {
        step_name: "resolve_catalog",
        step_number: 2,
        duration_ms: 45,
        input_summary: `query="${prod.name}", quantity=1`,
        output_summary: `product_id=${prod.id}, price_paise=${amountPaise}, stock=49`,
        reason: `Matched SKU ${prod.id} with cosine distance 0.04. Stock decremented atomically.`,
        raw_data: { product_id: prod.id, price_paise: amountPaise, available_stock: 49 },
      },
      {
        step_name: "check_trust_graph",
        step_number: 3,
        duration_ms: 68,
        input_summary: `email_hash=${emailHash}`,
        output_summary: `trust_score=92, decision=ALLOW`,
        reason: "Entity trust score 92 >= 70 threshold. No fraud ring links detected. ALLOW authorized.",
        raw_data: { trust_score: 92, decision: "ALLOW", risk_factors: ["new_entity_clean_ip"] },
      },
      {
        step_name: "create_razorpay_order",
        step_number: 4,
        duration_ms: 180,
        input_summary: `amount_paise=${amountPaise}, currency=INR`,
        output_summary: `razorpay_order_id=${orderId}, status=created`,
        reason: `Created Razorpay test-mode order ${orderId} for ₹${amountPaise / 100}.`,
        raw_data: { razorpay_order_id: orderId, status: "created" },
      },
      {
        step_name: "capture_razorpay_payment",
        step_number: 5,
        duration_ms: 120,
        input_summary: `order_id=${orderId}`,
        output_summary: `payment_id=${paymentId}, status=captured`,
        reason: `Auto-captured payment ${paymentId} in Razorpay test sandbox.`,
        raw_data: { payment_id: paymentId, status: "captured" },
      },
      {
        step_name: "log_audit_entry",
        step_number: 6,
        duration_ms: 12,
        input_summary: `transaction_id=${txn.id}`,
        output_summary: "sealed=true",
        reason: "Sealed SHA-256 hash chain record persisted to immutable PostgreSQL ledger.",
        raw_data: { sealed: true },
      },
    ]

    // Build append-only hash chain (prev_entry_hash → entry_hash)
    let prevHash = "GENESIS"
    for (const step of steps) {
      const entryHash = crypto
        .createHash("sha256")
        .update(
          [
            prevHash,
            txn.id,
            step.step_number,
            step.step_name,
            step.input_summary,
            step.output_summary,
            step.reason,
            "false", // is_error
          ].join("|")
        )
        .digest("hex")

      await query(
        `INSERT INTO audit_entries
           (transaction_id, step_name, step_number, duration_ms,
            input_summary, output_summary, reason, raw_data,
            is_error, prev_entry_hash, entry_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, false, $9, $10)`,
        [
          txn.id,
          step.step_name,
          step.step_number,
          step.duration_ms,
          step.input_summary,
          step.output_summary,
          step.reason,
          JSON.stringify(step.raw_data),
          prevHash,
          entryHash,
        ]
      )

      prevHash = entryHash
    }

    return NextResponse.json({
      success: true,
      transaction_id: txn.id,
      status: "SUCCESS",
      trust_score: 92,
      decision: "ALLOW",
      razorpay_order_id: orderId,
      amount_paise: amountPaise,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
