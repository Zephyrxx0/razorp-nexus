import { formatPaiseToInr } from "@/lib/url-helpers";

export interface MockAuditStep {
  step: string;
  step_number: number;
  timestamp: string;
  duration_ms: number;
  summary: string;
  reason: string;
  is_error?: boolean;
  raw_data?: Record<string, any>;
  prev_entry_hash?: string;
  entry_hash?: string;
}

export interface MockSuccessOptions {
  product_id?: string;
  product_name?: string;
  quantity?: number;
  unit_price_paise?: number;
  trust_score?: number;
}

export function createMockSuccessResponse(
  txId: string,
  orderId: string,
  paymentId: string,
  paise: number,
  options: MockSuccessOptions = {}
) {
  const quantity = options.quantity ?? 1;
  const unitPrice = options.unit_price_paise ?? Math.floor(paise / quantity);
  const prodName = options.product_name ?? "Sony WH-1000XM5";
  const prodId = options.product_id ?? "10000000-0000-0000-0000-000000000001";
  const trustScore = options.trust_score ?? 87.0;

  return {
    transaction_id: txId,
    status: "SUCCESS",
    trust_score: trustScore,
    trust_decision: "ALLOW",
    product: {
      id: prodId,
      name: prodName,
      quantity,
      unit_price_paise: unitPrice,
      total_amount_paise: paise,
      total_amount_display: formatPaiseToInr(paise),
    },
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    payment_status: "captured",
    captured_at: new Date().toISOString(),
    audit_trail: [
      {
        step: "PARSE_INTENT",
        step_number: 1,
        timestamp: "2026-09-03T14:30:40.001Z",
        duration_ms: 12,
        summary: `Query: '${prodName}', Qty: ${quantity}`,
        reason: "Intent parsed successfully",
      },
      {
        step: "RESOLVE_CATALOG",
        step_number: 2,
        timestamp: "2026-09-03T14:30:41.234Z",
        duration_ms: 45,
        summary: `Resolved: ${prodName}, Total: ${paise} paise`,
        reason: "Catalog resolved and stock atomically decremented",
      },
      {
        step: "CHECK_TRUST_GRAPH",
        step_number: 3,
        timestamp: "2026-09-03T14:30:41.890Z",
        duration_ms: 15,
        summary: `Score: ${trustScore}, Decision: ALLOW`,
        reason: "Trust check passed safety threshold (>= 40)",
      },
      {
        step: "CREATE_RAZORPAY_ORDER",
        step_number: 4,
        timestamp: "2026-09-03T14:30:42.145Z",
        duration_ms: 120,
        summary: `Order ID: ${orderId}, Status: created`,
        reason: "Razorpay order created with audit notes",
      },
      {
        step: "CAPTURE_RAZORPAY_PAYMENT",
        step_number: 5,
        timestamp: "2026-09-03T14:30:43.567Z",
        duration_ms: 140,
        summary: `Payment ID: ${paymentId}, Status: captured`,
        reason: "Payment successfully captured",
      },
      {
        step: "LOG_AUDIT_ENTRY",
        step_number: 6,
        timestamp: "2026-09-03T14:30:44.890Z",
        duration_ms: 10,
        summary: "Audit trail persisted and verified",
        reason: "All pipeline operations succeeded",
      },
    ],
  };
}

export function createMockTrustDenialResponse(
  txId: string,
  score: number = 22.0,
  riskFactors: string[] = [
    "known_fraud_neighbor_1hop: email hash shares a transaction history with 2 confirmed fraud nodes",
    "cross_merchant_velocity: ip_subnet 103.44.21.0/24 attempted 17 transactions across 8 merchants in last 60 minutes",
  ]
) {
  return {
    transaction_id: txId,
    status: "DENIED",
    trust_score: score,
    trust_decision: "DENY",
    risk_factors: riskFactors,
    razorpay_order_id: null,
    razorpay_payment_id: null,
    message:
      "Transaction denied. Buyer fingerprint is associated with a known fraud ring. No payment was processed.",
    audit_trail: [
      {
        step: "PARSE_INTENT",
        step_number: 1,
        timestamp: "2026-09-03T14:30:40.001Z",
        duration_ms: 12,
        summary: "Query: 'Sony WH-1000XM5', Qty: 1",
        reason: "Intent parsed successfully",
      },
      {
        step: "RESOLVE_CATALOG",
        step_number: 2,
        timestamp: "2026-09-03T14:30:40.100Z",
        duration_ms: 35,
        summary: "Resolved: Sony WH-1000XM5, Total: 2999000 paise",
        reason: "Catalog resolved and stock atomically decremented",
      },
      {
        step: "CHECK_TRUST_GRAPH",
        step_number: 3,
        timestamp: "2026-09-03T14:30:40.150Z",
        duration_ms: 18,
        summary: `Score: ${score}, Decision: DENY`,
        reason: `Trust violation: score ${score} is below safety threshold (40)`,
      },
      {
        step: "LOG_AUDIT_ENTRY",
        step_number: 4,
        timestamp: "2026-09-03T14:30:40.200Z",
        duration_ms: 12,
        summary: "Audit trail persisted and verified",
        reason: `Trust violation: score ${score} is below safety threshold (40)`,
      },
    ],
  };
}

export function createMockStockErrorResponse(
  txId: string,
  requested: number,
  available: number
) {
  return {
    transaction_id: txId,
    status: "FAILED",
    error_code: "INSUFFICIENT_STOCK",
    error_type: "StockError",
    message: `Only ${available} unit of 'Sony WH-1000XM5' available. Requested quantity: ${requested}.`,
    available_stock: available,
    requested_quantity: requested,
    audit_trail: [
      {
        step: "PARSE_INTENT",
        step_number: 1,
        timestamp: "2026-09-03T14:30:40.001Z",
        duration_ms: 12,
        summary: `Query: 'Sony WH-1000XM5', Qty: ${requested}`,
        reason: "Intent parsed successfully",
      },
      {
        step: "RESOLVE_CATALOG",
        step_number: 2,
        timestamp: "2026-09-03T14:30:40.050Z",
        duration_ms: 25,
        summary: "Catalog resolution or stock allocation failed",
        reason: `Only ${available} unit of 'Sony WH-1000XM5' available. Requested quantity: ${requested}.`,
        is_error: true,
      },
      {
        step: "LOG_AUDIT_ENTRY",
        step_number: 3,
        timestamp: "2026-09-03T14:30:40.100Z",
        duration_ms: 10,
        summary: "Audit trail persisted and verified",
        reason: `Stock allocation failed: only ${available} available`,
        is_error: true,
      },
    ],
  };
}

export function createMockIntentErrorResponse(options?: {
  intent?: string;
  reason?: string;
}) {
  const intent = options?.intent ?? "gibberish hello world";
  const reason = options?.reason ?? "Zero confidence product match";

  return {
    error: "UNPROCESSABLE_ENTITY",
    error_type: "IntentValidationError",
    message: "Intent string could not be parsed into a valid product query and quantity",
    details: {
      intent,
      reason,
    },
    audit_trail: [
      {
        step: "PARSE_INTENT",
        step_number: 1,
        timestamp: "2026-09-03T14:30:40.001Z",
        duration_ms: 10,
        summary: "Failed to parse intent",
        reason,
        is_error: true,
      },
      {
        step: "LOG_AUDIT_ENTRY",
        step_number: 2,
        timestamp: "2026-09-03T14:30:40.015Z",
        duration_ms: 8,
        summary: "Audit trail persisted and verified",
        reason: "Intent parsing failed",
        is_error: true,
      },
    ],
  };
}

export function createMockExecutionErrorResponse(
  msg: string = "Unhandled pipeline execution error"
) {
  return {
    error: "EXECUTION_ERROR",
    message: msg,
    audit_trail: [
      {
        step: "LOG_AUDIT_ENTRY",
        step_number: 1,
        timestamp: "2026-09-03T14:30:40.001Z",
        duration_ms: 5,
        summary: "Execution error encountered",
        reason: msg,
        is_error: true,
      },
    ],
  };
}

/**
 * Creates raw ADK Event list simulating Python FastAPI runner responses.
 */
export function createMockAdkEvents(steps: any[], terminalMetadata: any): any[] {
  const events = steps.map((s) => ({
    author: "nexus_orchestrator",
    content: {
      parts: [{ text: `[${s.step_name || s.step}] ${s.summary || s.output_summary}` }],
    },
    custom_metadata: {
      step_name: s.step_name || s.step,
      step_number: s.step_number,
      is_error: s.is_error ?? false,
      reason: s.reason,
      duration_ms: s.duration_ms,
      raw_data: s.raw_data,
      entry_hash: s.entry_hash,
      prev_entry_hash: s.prev_entry_hash,
    },
  }));

  events.push({
    author: "nexus_orchestrator",
    content: {
      parts: [
        {
          text:
            terminalMetadata.status === "SUCCESS"
              ? `Order ${terminalMetadata.order_id} captured.`
              : `Transaction ${terminalMetadata.status}: ${terminalMetadata.failure_reason || "Halted"}`,
        },
      ],
    },
    turn_complete: true,
    custom_metadata: terminalMetadata,
  });

  return events;
}
