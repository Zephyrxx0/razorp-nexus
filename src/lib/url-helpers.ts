/**
 * Format integer paise into display INR currency string (e.g. 2999000 -> ₹29,990) (§6.1).
 * Never use floating-point numbers for currency calculations or database storage.
 */
export function formatPaiseToInr(amountPaise: number): string {
  const rupees = amountPaise / 100;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

/**
 * Dynamically construct the agent_purchase_url for a given merchant (D-04).
 */
export function buildAgentPurchaseUrl(req: Request, merchantId: string): string {
  const forwardedProto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");

  let baseUrl: string;
  if (host) {
    baseUrl = `${forwardedProto}://${host}`;
  } else {
    baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
  }

  baseUrl = baseUrl.replace(/\/+$/, "");
  return `${baseUrl}/api/maas/${merchantId}/transact`;
}

export const resolveAgentPurchaseUrl = buildAgentPurchaseUrl;
