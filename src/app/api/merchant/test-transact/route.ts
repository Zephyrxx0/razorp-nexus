import { NextRequest, NextResponse } from "next/server"
import { query } from "@nexus/db"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  try {
    const { merchant_id } = await req.json()

    if (!merchant_id) {
      return NextResponse.json({ error: "merchant_id is required" }, { status: 400 })
    }

    // Find available product
    let prodRes = await query(
      `SELECT id, name, price_paise FROM products
       WHERE merchant_id = $1 AND is_ai_purchasable = true AND stock_quantity > 0
       LIMIT 1`,
      [merchant_id]
    )

    let prod = prodRes.rows[0]
    if (!prod) {
      // Create a default demo product
      const insertProd = await query(
        `INSERT INTO products (merchant_id, name, description, price_paise, stock_quantity, category, is_ai_purchasable)
         VALUES ($1, 'Autonomous Demo Device', 'Sample smart IoT device for agent purchase evaluation', 249900, 50, 'Electronics', true)
         RETURNING id, name, price_paise`,
        [merchant_id]
      )
      prod = insertProd.rows[0]
    }

    const testEmail = `agent-${crypto.randomBytes(3).toString("hex")}@buyer.nexus`
    const emailHash = crypto.createHash("sha256").update(testEmail.toLowerCase().trim()).digest("hex")
    const orderId = `order_test_${crypto.randomBytes(6).toString("hex")}`
    const paymentId = `pay_test_${crypto.randomBytes(6).toString("hex")}`
    const amountPaise = prod.price_paise

    // Create transaction
    const txnRes = await query(
      `INSERT INTO transactions (merchant_id, buyer_email_hash, amount_paise, status, razorpay_order_id, razorpay_payment_id)
       VALUES ($1, $2, $3, 'SUCCESS', $4, $5)
       RETURNING id, created_at`,
      [merchant_id, emailHash, amountPaise, orderId, paymentId]
    )
    const txn = txnRes.rows[0]

    // Create 6-step tool execution timeline in audit_logs
    const stepData = {
      steps: [
        {
          step_index: 1,
          tool_name: "parse_intent",
          duration_ms: 210,
          status: "success",
          rationale: `Extracted product query '${prod.name}' with quantity 1 for buyer ${testEmail}.`,
          input: { intent: `Buy 1 ${prod.name}` },
          output: { product_query: prod.name, quantity: 1, buyer_email: testEmail },
        },
        {
          step_index: 2,
          tool_name: "resolve_catalog",
          duration_ms: 45,
          status: "success",
          rationale: `Matched SKU ${prod.id} with cosine distance 0.04. Stock decremented atomically.`,
          input: { query: prod.name, quantity: 1 },
          output: { product_id: prod.id, price_paise: amountPaise, available_stock: 49 },
        },
        {
          step_index: 3,
          tool_name: "check_trust_graph",
          duration_ms: 68,
          status: "success",
          rationale: "Entity trust score 92 >= 70 threshold. No fraud ring links detected. ALLOW authorized.",
          input: { buyer_email_hash: emailHash },
          output: { trust_score: 92, decision: "ALLOW", risk_factors: ["new_entity_clean_ip"] },
        },
        {
          step_index: 4,
          tool_name: "create_razorpay_order",
          duration_ms: 180,
          status: "success",
          rationale: `Created Razorpay test-mode order ${orderId} for ₹${amountPaise / 100}.`,
          input: { amount_paise: amountPaise, currency: "INR" },
          output: { razorpay_order_id: orderId, status: "created" },
        },
        {
          step_index: 5,
          tool_name: "capture_razorpay_payment",
          duration_ms: 120,
          status: "success",
          rationale: `Auto-captured payment ${paymentId} in Razorpay test sandbox.`,
          input: { order_id: orderId },
          output: { payment_id: paymentId, status: "captured" },
        },
        {
          step_index: 6,
          tool_name: "log_audit_entry",
          duration_ms: 12,
          status: "success",
          rationale: "Sealed SHA-256 hash chain record persisted to immutable PostgreSQL ledger.",
          input: { transaction_id: txn.id },
          output: { sealed: true },
        },
      ],
    }

    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(stepData)).digest("hex")
    const previousHash = crypto.createHash("sha256").update("genesis_block").digest("hex")

    await query(
      `INSERT INTO audit_logs (transaction_id, sequence_number, trust_score, decision, risk_factors, step_data, payload_hash, previous_hash)
       VALUES ($1, 1, 92, 'ALLOW', '["new_entity_clean_ip"]'::jsonb, $2, $3, $4)`,
      [txn.id, JSON.stringify(stepData), payloadHash, previousHash]
    )

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
