import { NextRequest, NextResponse } from "next/server"
import { query } from "@nexus/db"
import { generateEmbedding } from "@/lib/embeddings"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const merchantId = searchParams.get("merchant_id")

    if (!merchantId) {
      return NextResponse.json({ error: "merchant_id query param is required" }, { status: 400 })
    }

    const res = await query(
      `SELECT id, merchant_id, name, description, price_paise, stock, stock_quantity, category, is_ai_purchasable,
              (embedding IS NOT NULL) as has_embedding, created_at, updated_at
       FROM products
       WHERE merchant_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [merchantId]
    )

    return NextResponse.json({ products: res.rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const items = Array.isArray(body) ? body : [body]

    if (items.length === 0) {
      return NextResponse.json({ error: "No products provided" }, { status: 400 })
    }

    const created = []

    for (const item of items) {
      const {
        merchant_id,
        name,
        description,
        price_paise,
        stock_quantity = 0,
        category = "General",
        is_ai_purchasable = true,
      } = item

      if (!merchant_id || !name || price_paise === undefined) {
        return NextResponse.json(
          { error: "merchant_id, name, and price_paise are required" },
          { status: 400 }
        )
      }

      const parsedPrice = Number(price_paise)
      if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
        return NextResponse.json(
          { error: "price_paise must be a non-negative integer" },
          { status: 422 }
        )
      }

      const res = await query(
        `INSERT INTO products (merchant_id, name, description, price_paise, stock_quantity, category, is_ai_purchasable)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, merchant_id, name, description, price_paise, stock_quantity, category, is_ai_purchasable, created_at`,
        [
          merchant_id,
          name,
          description || "",
          parsedPrice,
          Number(stock_quantity) || 0,
          category,
          Boolean(is_ai_purchasable),
        ]
      )

      const product = res.rows[0]

      if (description) {
        const embedding = await generateEmbedding(description)
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`
          await query("UPDATE products SET embedding = $1::vector WHERE id = $2", [
            vectorStr,
            product.id,
          ])
        }
      }

      created.push(product)
    }

    return NextResponse.json(
      { success: true, products: created, product: created[0] },
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, merchant_id, stock_quantity, is_ai_purchasable, price_paise, name, description } = body

    if (!id || !merchant_id) {
      return NextResponse.json({ error: "id and merchant_id are required" }, { status: 400 })
    }

    // Verify tenant ownership
    const check = await query(
      "SELECT id FROM products WHERE id = $1 AND merchant_id = $2",
      [id, merchant_id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 404 })
    }

    const updates: string[] = []
    const params: any[] = [id, merchant_id]
    let idx = 3

    if (stock_quantity !== undefined) {
      updates.push(`stock_quantity = $${idx++}`)
      params.push(Math.max(0, Number(stock_quantity)))
    }

    if (is_ai_purchasable !== undefined) {
      updates.push(`is_ai_purchasable = $${idx++}`)
      params.push(Boolean(is_ai_purchasable))
    }

    if (price_paise !== undefined) {
      const parsedPrice = Number(price_paise)
      if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
        return NextResponse.json(
          { error: "price_paise must be a non-negative integer" },
          { status: 422 }
        )
      }
      updates.push(`price_paise = $${idx++}`)
      params.push(parsedPrice)
    }

    if (name !== undefined) {
      updates.push(`name = $${idx++}`)
      params.push(name)
    }

    if (description !== undefined) {
      updates.push(`description = $${idx++}`)
      params.push(description)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No update fields provided" }, { status: 400 })
    }

    updates.push(`updated_at = NOW()`)

    const updateQuery = `
      UPDATE products
      SET ${updates.join(", ")}
      WHERE id = $1 AND merchant_id = $2
      RETURNING id, merchant_id, name, description, price_paise, stock_quantity, category, is_ai_purchasable, updated_at
    `

    const res = await query(updateQuery, params)
    const updatedProd = res.rows[0]

    if (description) {
      const embedding = await generateEmbedding(description)
      if (embedding) {
        const vectorStr = `[${embedding.join(",")}]`
        await query("UPDATE products SET embedding = $1::vector WHERE id = $2", [
          vectorStr,
          updatedProd.id,
        ])
      }
    }

    return NextResponse.json({ success: true, product: updatedProd })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    const merchantId = searchParams.get("merchant_id")

    if (!id || !merchantId) {
      return NextResponse.json({ error: "id and merchant_id are required" }, { status: 400 })
    }

    const res = await query(
      "DELETE FROM products WHERE id = $1 AND merchant_id = $2 RETURNING id",
      [id, merchantId]
    )

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 404 })
    }

    return NextResponse.json({ success: true, deleted_id: id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
