import { NextRequest, NextResponse } from "next/server"
import { query } from "@nexus/db"
import { encryptSecret, generateMaasToken } from "../../../../../db/ts/src/crypto"
import { generateEmbedding } from "@/lib/embeddings"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, key_id, key_secret, initial_products } = body

    if (!name || !email || !key_id || !key_secret) {
      return NextResponse.json(
        { error: "Name, email, Razorpay key_id, and key_secret are required." },
        { status: 400 }
      )
    }

    if (!key_id.startsWith("rzp_test_")) {
      return NextResponse.json(
        { error: "key_id must start with rzp_test_ for test mode." },
        { status: 422 }
      )
    }

    const encryptionKey =
      process.env.ENCRYPTION_KEY ||
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    const encryptedSecret = encryptSecret(key_secret, encryptionKey)

    const { token, hash, preview } = generateMaasToken()

    const merchantRes = await query(
      `INSERT INTO merchants (name, email, razorpay_key_id, razorpay_key_secret_encrypted, maas_token_hash, maas_token_preview)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, razorpay_key_id, maas_token_preview, created_at`,
      [name, email, key_id, encryptedSecret, hash, preview]
    )

    const merchant = merchantRes.rows[0]

    // Insert initial products if provided
    if (Array.isArray(initial_products) && initial_products.length > 0) {
      for (const prod of initial_products) {
        const pricePaise = Math.round(Number(prod.price_inr || 0) * 100)
        const stock = Number(prod.stock || 10)
        const category = prod.category || "General"

        const prodRes = await query(
          `INSERT INTO products (merchant_id, name, description, price_paise, stock_quantity, category, is_ai_purchasable)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id, description`,
          [merchant.id, prod.name, prod.description, pricePaise, stock, category]
        )

        const insertedProd = prodRes.rows[0]
        const embedding = await generateEmbedding(insertedProd.description)
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`
          await query(
            `UPDATE products SET embedding = $1::vector WHERE id = $2`,
            [vectorStr, insertedProd.id]
          )
        }
      }
    }

    const response = NextResponse.json(
      {
        merchant_id: merchant.id,
        merchant,
        maas_token: token,
        catalog_url: `/api/maas/${merchant.id}/catalog`,
        transact_url: `/api/maas/${merchant.id}/transact`,
      },
      { status: 201 }
    )

    response.cookies.set("nexus_merchant_id", merchant.id, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    })

    return response
  } catch (error: any) {
    // Postgres unique-constraint violation (e.g. duplicate email)
    if (error.code === "23505") {
      const field = error.constraint?.includes("email") ? "email address" : "field"
      return NextResponse.json(
        { error: `A merchant with this ${field} already exists. Please use a different one.` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
