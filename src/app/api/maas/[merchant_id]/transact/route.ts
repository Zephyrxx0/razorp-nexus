import { NextRequest, NextResponse } from "next/server";
import { authenticateMaaSRequest } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limiter";
import { executeAdkRun, sanitizeBuyerInput } from "@/lib/adk-client";
import { formatPaiseToInr } from "@/lib/url-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: { merchant_id: string } }
): Promise<NextResponse> {
  const { merchant_id } = params;

  // 1. Sliding window rate limiting: 20 rpm for transact (D-07)
  const rateLimit = checkRateLimit(`merchant:${merchant_id}:transact`, 20, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded for transact endpoint. Limit is 20 requests per minute.",
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
      headers["WWW-Authenticate"] = 'Bearer error="invalid_token"';
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

  // 3. Parse and validate request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message: "Invalid JSON request body",
        audit_trail: [],
      },
      { status: 422 }
    );
  }

  const hasBuyer =
    (body.buyer && typeof body.buyer === "object" && Object.keys(body.buyer).length > 0) ||
    (body.buyer_context && typeof body.buyer_context === "object" && Object.keys(body.buyer_context).length > 0) ||
    body.buyer_email ||
    body.email;

  if (
    !body ||
    typeof body !== "object" ||
    !body.intent ||
    typeof body.intent !== "string" ||
    !body.intent.trim() ||
    !hasBuyer
  ) {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message: "Missing required intent or buyer object",
        audit_trail: [],
      },
      { status: 422 }
    );
  }

  // 4. Sanitize buyer fingerprint (D-09)
  // 4. Normalize and sanitize buyer payload (supports body.buyer, body.buyer_context, or flat top-level fields)
  let rawBuyer: any = body.buyer;
  if (!rawBuyer || typeof rawBuyer !== "object") {
    if (body.buyer_context && typeof body.buyer_context === "object") {
      rawBuyer = {
        email: body.buyer_context.buyer_email || body.buyer_context.email,
        ip: body.buyer_context.ip_address || body.buyer_context.ip,
        device_id: body.buyer_context.device_id || body.buyer_context.device_hash,
        upi_handle: body.buyer_context.upi_handle,
        user_agent: body.buyer_context.user_agent,
      };
    } else {
      rawBuyer = {
        email: body.buyer_email || body.email || "agent-demo@nexus.ai",
        ip: body.ip_address || body.ip || "198.51.100.42",
        device_id: body.device_id || body.device_hash || "dev_demo_buyer_01",
        upi_handle: body.upi_handle,
        user_agent: body.user_agent,
      };
    }
  } else {
    rawBuyer = {
      email: rawBuyer.email || rawBuyer.buyer_email || body.buyer_email || "agent-demo@nexus.ai",
      ip: rawBuyer.ip || rawBuyer.ip_address || body.ip_address || "198.51.100.42",
      device_id: rawBuyer.device_id || rawBuyer.device_hash || body.device_id || "dev_demo_buyer_01",
      upi_handle: rawBuyer.upi_handle || body.upi_handle,
      user_agent: rawBuyer.user_agent || body.user_agent,
    };
  }
  body.buyer = rawBuyer;

  // Sanitize buyer fingerprint (D-09)
  sanitizeBuyerInput(body.buyer);

  // 5. Forward execution to ADK orchestrator (D-08, D-11)
  const adkResult = await executeAdkRun(merchant_id, body);

  // 6. Map responses with explicit HTTP status codes and embedded audit trail (D-10, D-12, AUDIT-03)
  if (adkResult.status === 504 || adkResult.error === "GATEWAY_TIMEOUT") {
    return NextResponse.json(
      {
        error: "GATEWAY_TIMEOUT",
        message: "ADK orchestrator execution exceeded 10-second SLA",
        audit_trail: adkResult.data?.audit_trail || [],
      },
      { status: 504 }
    );
  }

  if (adkResult.status === 502 || adkResult.error === "ORCHESTRATOR_UNAVAILABLE") {
    return NextResponse.json(
      {
        error: "ORCHESTRATOR_UNAVAILABLE",
        message: "Failed to connect to agent runner",
        audit_trail: [],
      },
      { status: 502 }
    );
  }

  const data = adkResult.data || {};
  const auditTrail = Array.isArray(data.audit_trail) ? data.audit_trail : [];

  // Success path: 200 OK
  if (data.status === "SUCCESS") {
    const paise = data.product?.total_amount_paise ?? 0;
    return NextResponse.json(
      {
        transaction_id: data.transaction_id,
        status: "SUCCESS",
        trust_score: data.trust_score,
        trust_decision: "ALLOW",
        product: {
          id: data.product?.id,
          name: data.product?.name,
          quantity: data.product?.quantity ?? 1,
          unit_price_paise: data.product?.unit_price_paise ?? paise,
          total_amount_paise: paise,
          total_amount_display:
            data.product?.total_amount_display || formatPaiseToInr(paise),
        },
        razorpay_order_id: data.razorpay_order_id,
        razorpay_payment_id: data.razorpay_payment_id,
        payment_status: "captured",
        captured_at: data.captured_at || new Date().toISOString(),
        audit_trail: auditTrail,
      },
      { status: 200 }
    );
  }

  // Trust denial path: 403 Forbidden
  if (
    data.status === "DENIED" ||
    data.error_type === "TrustViolationError" ||
    data.trust_decision === "DENY"
  ) {
    return NextResponse.json(
      {
        transaction_id: data.transaction_id,
        status: "DENIED",
        trust_score: data.trust_score,
        trust_decision: "DENY",
        risk_factors: data.risk_factors || [],
        razorpay_order_id: null,
        razorpay_payment_id: null,
        message:
          data.message ||
          "Transaction denied. Buyer fingerprint is associated with a known fraud ring. No payment was processed.",
        audit_trail: auditTrail,
      },
      { status: 403 }
    );
  }

  // Insufficient stock path: 409 Conflict
  if (
    data.error_type === "StockError" ||
    data.error_code === "INSUFFICIENT_STOCK" ||
    data.status === "INSUFFICIENT_STOCK"
  ) {
    return NextResponse.json(
      {
        transaction_id: data.transaction_id,
        status: "FAILED",
        error_code: "INSUFFICIENT_STOCK",
        message:
          data.message ||
          `Only ${data.available_stock} unit available. Requested quantity: ${data.requested_quantity}.`,
        available_stock: data.available_stock,
        requested_quantity: data.requested_quantity,
        audit_trail: auditTrail,
      },
      { status: 409 }
    );
  }

  // Intent parsing / validation failure path: 422 Unprocessable Entity
  if (
    data.error_type === "IntentValidationError" ||
    data.error === "UNPROCESSABLE_ENTITY" ||
    data.status === "UNPROCESSABLE_ENTITY"
  ) {
    return NextResponse.json(
      {
        error: "UNPROCESSABLE_ENTITY",
        message:
          data.message ||
          "Intent string could not be parsed into a valid product query and quantity",
        details: data.details || {
          intent: body.intent,
          reason: data.failure_reason || "Zero confidence product match",
        },
        audit_trail: auditTrail,
      },
      { status: 422 }
    );
  }

  // Execution failure / unhandled error path: 500 Internal Server Error
  return NextResponse.json(
    {
      error: "EXECUTION_ERROR",
      message:
        data.message ||
        data.failure_reason ||
        "Unhandled pipeline execution error",
      audit_trail: auditTrail,
    },
    { status: 500 }
  );
}
