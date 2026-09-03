import {
  maskIpSubnet,
  hashEmail,
  hashDeviceId,
  hashUserAgent,
} from "@nexus/db";
import { formatPaiseToInr } from "./url-helpers";

export interface BuyerPayload {
  email?: string;
  ip?: string;
  device_id?: string;
  upi_handle?: string;
  user_agent?: string;
}

export interface TransactRequestBody {
  intent: string;
  buyer: BuyerPayload;
  metadata?: Record<string, any>;
}

export interface SanitizedBuyer {
  email?: string;
  ip_subnet: string;
  device_id?: string;
  upi_handle?: string;
  user_agent?: string;
  fingerprint: {
    email_hash?: string;
    ip_subnet: string;
    device_hash?: string;
    upi_handle?: string;
    user_agent_hash?: string;
  };
}

export interface AdkProxyPayload {
  user_id: string;
  merchant_id: string;
  intent: string;
  buyer_email?: string;
  buyer_fingerprint: {
    email_hash?: string;
    ip_subnet: string;
    device_hash?: string;
    upi_handle?: string;
    user_agent_hash?: string;
  };
  custom_metadata: Record<string, any>;
}

export interface AdkRunResult {
  ok: boolean;
  status: number;
  data: Record<string, any>;
  error?: string;
  message?: string;
}

const UPI_HANDLE_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

/**
 * Pre-validate and sanitize buyer input before graph ingestion or ADK forwarding (D-09).
 * - Email: trimmed and lowercased, hashed via SHA-256
 * - IP: truncated to /24 subnet using maskIpSubnet
 * - Device ID: trimmed and lowercased, hashed via SHA-256
 * - User Agent: trimmed, hashed via SHA-256
 * - UPI Handle: validated against pattern
 */
export function sanitizeBuyerInput(buyer: BuyerPayload = {}): SanitizedBuyer {
  const email = buyer.email ? buyer.email.trim().toLowerCase() : undefined;
  const rawIp = buyer.ip ? buyer.ip.trim() : "127.0.0.1";
  const ipSubnet = maskIpSubnet(rawIp) || "127.0.0.1/24";
  const deviceId = buyer.device_id ? buyer.device_id.trim().toLowerCase() : undefined;
  const userAgent = buyer.user_agent ? buyer.user_agent.trim() : undefined;

  let upiHandle: string | undefined = undefined;
  if (buyer.upi_handle && UPI_HANDLE_REGEX.test(buyer.upi_handle.trim())) {
    upiHandle = buyer.upi_handle.trim();
  }

  const fingerprint = {
    email_hash: email ? hashEmail(email) : undefined,
    ip_subnet: ipSubnet,
    device_hash: deviceId ? hashDeviceId(deviceId) : undefined,
    upi_handle: upiHandle,
    user_agent_hash: userAgent ? hashUserAgent(userAgent) : undefined,
  };

  return {
    email,
    ip_subnet: ipSubnet,
    device_id: deviceId,
    upi_handle: upiHandle,
    user_agent: userAgent,
    fingerprint,
  };
}

/**
 * Parse ADK Event[] stream format returned by Python FastAPI into structured response.
 */
export function parseAdkEvents(events: any[]): Record<string, any> {
  const auditTrail: any[] = [];
  let terminalMetadata: Record<string, any> = {};

  for (const ev of events) {
    const customMetadata = ev.custom_metadata || ev.customMetadata || {};
    const turnComplete = ev.turn_complete ?? ev.turnComplete ?? false;

    if (turnComplete) {
      terminalMetadata = customMetadata;
    }

    if (customMetadata.step_name) {
      let summary = "";
      if (ev.content?.parts?.[0]?.text) {
        summary = ev.content.parts[0].text.replace(
          new RegExp(`^\\[${customMetadata.step_name}\\]\\s*`),
          ""
        );
      }

      auditTrail.push({
        step: customMetadata.step_name,
        step_number: customMetadata.step_number,
        timestamp: customMetadata.timestamp || new Date().toISOString(),
        duration_ms: customMetadata.duration_ms ?? 0,
        summary: summary || customMetadata.output_summary || "",
        reason: customMetadata.reason || "",
        is_error: customMetadata.is_error ?? false,
        raw_data: customMetadata.raw_data,
        prev_entry_hash: customMetadata.prev_entry_hash,
        entry_hash: customMetadata.entry_hash,
      });
    }
  }

  const step2 = auditTrail.find(
    (s) => s.step === "RESOLVE_CATALOG" || s.step_number === 2
  );
  const prodData = step2?.raw_data || {};

  const step3 = auditTrail.find(
    (s) => s.step === "CHECK_TRUST_GRAPH" || s.step_number === 3
  );
  const trustData = step3?.raw_data || {};

  const status =
    terminalMetadata.status || (terminalMetadata.failure_reason ? "FAILED" : "SUCCESS");

  const result: Record<string, any> = {
    transaction_id: terminalMetadata.transaction_id,
    status,
    trust_score: terminalMetadata.trust_score,
    trust_decision: terminalMetadata.trust_decision,
    razorpay_order_id: terminalMetadata.order_id || null,
    razorpay_payment_id: terminalMetadata.payment_id || null,
    risk_factors: trustData.risk_factors || terminalMetadata.risk_factors || [],
    failure_reason: terminalMetadata.failure_reason,
    audit_trail: auditTrail,
  };

  if (status === "SUCCESS") {
    const totalPaise = prodData.total_amount_paise || 0;
    const qty = prodData.quantity || 1;
    const unitPaise = prodData.unit_price_paise || Math.floor(totalPaise / qty);

    result.product = {
      id: prodData.product_id,
      name: prodData.name,
      quantity: qty,
      unit_price_paise: unitPaise,
      total_amount_paise: totalPaise,
      total_amount_display: formatPaiseToInr(totalPaise),
    };
    result.payment_status = "captured";
    result.captured_at = new Date().toISOString();
  }

  return result;
}

/**
 * Execute commerce intent via ADK orchestrator (port 8000 POST /run) (D-08, D-11).
 * Wraps call in a 10s AbortController timeout. Never forwards plaintext credentials.
 */
export async function executeAdkRun(
  merchantId: string,
  body: TransactRequestBody,
  timeoutMs: number = 10000
): Promise<AdkRunResult> {
  const sanitized = sanitizeBuyerInput(body.buyer || {});

  const adkPayload: AdkProxyPayload = {
    user_id: sanitized.email || "nexus_buyer",
    merchant_id: merchantId,
    intent: body.intent,
    buyer_email: sanitized.email,
    buyer_fingerprint: sanitized.fingerprint,
    custom_metadata: body.metadata || {},
  };

  const adkUrl = (process.env.ADK_AGENT_URL || "http://localhost:8000").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${adkUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adkPayload),
      signal: controller.signal,
    });

    const rawData = await res.json().catch(() => ({}));
    let parsedData: Record<string, any>;
    if (Array.isArray(rawData)) {
      parsedData = parseAdkEvents(rawData);
    } else {
      parsedData = rawData;
    }

    return {
      ok: res.ok,
      status: res.status,
      data: parsedData,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return {
        ok: false,
        status: 504,
        error: "GATEWAY_TIMEOUT",
        message: "ADK orchestrator execution exceeded 10-second SLA",
        data: {
          error: "GATEWAY_TIMEOUT",
          message: "ADK orchestrator execution exceeded 10-second SLA",
          audit_trail: [],
        },
      };
    }
    return {
      ok: false,
      status: 502,
      error: "ORCHESTRATOR_UNAVAILABLE",
      message: `Failed to connect to agent runner: ${err.message || String(err)}`,
      data: {
        error: "ORCHESTRATOR_UNAVAILABLE",
        message: "Failed to connect to agent runner",
        audit_trail: [],
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
