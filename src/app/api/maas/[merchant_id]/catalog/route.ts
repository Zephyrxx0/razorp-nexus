import { NextRequest, NextResponse } from "next/server";
import { query } from "@nexus/db";
import { authenticateMaaSRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limiter";
import { generateEmbedding } from "@/lib/embeddings";
import { buildAgentPurchaseUrl, formatPaiseToInr } from "@/lib/url-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { merchant_id: string } }
): Promise<NextResponse> {
  const { merchant_id } = params;

  // 1. Sliding window rate limiting: 60 rpm for catalog (D-07)
  const rateLimit = checkRateLimit(`merchant:${merchant_id}:catalog`, 60, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Try again in a moment.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds || 60),
          "Content-Type": "application/json",
        },
      }
    );
  }

  // 2. Bearer token authentication (D-05, D-06)
  const authResult = await authenticateMaaSRequest(req, merchant_id);
  if (!authResult.authenticated) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authResult.status === 401) {
      headers["WWW-Authenticate"] = "Bearer error=\"invalid_token\"";
    }
    return NextResponse.json(
      {
        error: authResult.error,
        message: authResult.message,
      },
      {
        status: authResult.status,
        headers,
      }
    );
  }

  const merchant = authResult.merchant;

  // 3. Parse and sanitize query parameters
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const category = url.searchParams.get("category")?.trim() || undefined;
  const rawMaxPrice = url.searchParams.get("max_price_paise");
  const maxPricePaise = rawMaxPrice ? parseInt(rawMaxPrice, 10) : undefined;
  const inStock = url.searchParams.get("in_stock") !== "false";
  const rawLimit = parseInt(url.searchParams.get("limit") || "10", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 10 : rawLimit, 1), 50);

  let selectedProducts: any[] = [];
  let usedVectorSearch = false;

  // 4. Path A: Semantic Vector Search if q is provided (D-01, D-02)
  if (q) {
    const embedding = await generateEmbedding(q);

    if (embedding && embedding.length === 768) {
      usedVectorSearch = true;
      const vectorStr = `[${embedding.join(",")}]`;
      const sqlParams: any[] = [vectorStr, merchant_id];
      let paramIdx = 3;

      let whereClause = "merchant_id = $2 AND is_active = true";
      if (inStock) {
        whereClause += " AND stock > 0";
      }
      if (category) {
        whereClause += ` AND category = $${paramIdx++}`;
        sqlParams.push(category);
      }
      if (maxPricePaise !== undefined && !isNaN(maxPricePaise)) {
        whereClause += ` AND price_paise <= $${paramIdx++}`;
        sqlParams.push(maxPricePaise);
      }

      sqlParams.push(limit);
      const sql = `
        SELECT 
          id, merchant_id, name, description, price_paise, currency, stock, category, tags,
          ROUND((1 - (embedding <=> $1::vector))::numeric, 4) AS match_score
        FROM products
        WHERE ${whereClause}
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $${paramIdx}
      `;

      const result = await query(sql, sqlParams);
      const rows = result.rows;

      // Filter by 0.5 threshold (D-02)
      const qualifying = rows.filter((r: any) => Number(r.match_score) >= 0.5);
      if (qualifying.length > 0) {
        selectedProducts = qualifying;
      } else if (rows.length > 0) {
        // Fall back to top 3 closest items if none meet 0.5 threshold (D-02)
        selectedProducts = rows.slice(0, 3);
      } else {
        selectedProducts = [];
      }
    }
  }

  // 5. Path B: Browse Mode (no q) or ILIKE fallback if embedding was unavailable / failed (D-01, D-03)
  if (!usedVectorSearch) {
    const whereClauses: string[] = ["merchant_id = $1", "is_active = true"];
    const sqlParams: any[] = [merchant_id];
    let paramIdx = 2;

    if (inStock) {
      whereClauses.push("stock > 0");
    }
    if (category) {
      whereClauses.push(`category = $${paramIdx++}`);
      sqlParams.push(category);
    }
    if (maxPricePaise !== undefined && !isNaN(maxPricePaise)) {
      whereClauses.push(`price_paise <= $${paramIdx++}`);
      sqlParams.push(maxPricePaise);
    }

    let matchScoreExpr = "1.0::numeric AS match_score";
    let orderBy = "created_at DESC";

    if (q) {
      // Fallback SQL ILIKE search (D-01)
      whereClauses.push(
        `(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`
      );
      sqlParams.push(`%${q}%`);
      paramIdx++;
      matchScoreExpr = "0.75::numeric AS match_score";
    }

    sqlParams.push(limit);
    const sql = `
      SELECT id, merchant_id, name, description, price_paise, currency, stock, category, tags, ${matchScoreExpr}
      FROM products
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${paramIdx}
    `;

    const result = await query(sql, sqlParams);
    selectedProducts = result.rows;
  }

  // 6. Format products matching PRD §11.1
  const agentPurchaseUrl = buildAgentPurchaseUrl(req, merchant_id);

  const formattedProducts = selectedProducts.map((p: any) => {
    let parsedTags: string[] = [];
    if (Array.isArray(p.tags)) {
      parsedTags = p.tags;
    } else if (typeof p.tags === "string") {
      try {
        parsedTags = JSON.parse(p.tags);
      } catch {
        parsedTags = [];
      }
    }

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      price_paise: Number(p.price_paise),
      price_display: formatPaiseToInr(Number(p.price_paise)),
      currency: p.currency || "INR",
      stock: Number(p.stock),
      category: p.category,
      tags: parsedTags,
      match_score: Number(p.match_score),
      agent_purchase_url: agentPurchaseUrl,
    };
  });

  return NextResponse.json(
    {
      merchant_id,
      merchant_name: merchant.name,
      query: q || null,
      result_count: formattedProducts.length,
      products: formattedProducts,
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
