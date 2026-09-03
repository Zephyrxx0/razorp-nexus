export interface TrustSignalPayload {
  merchant_id: string;
  transaction_id: string;
  buyer_fingerprint: Record<string, any>;
  amount_paise: number;
  outcome: 'SUCCESS' | 'FAILED';
  timestamp?: string;
}

/**
 * Dispatches a transaction outcome signal to the Trust Graph service (port 8001).
 * Executes asynchronously in fire-and-forget mode with complete error absorption
 * so internal network hiccups or service unavailability never fail or delay
 * the webhook acknowledgment (D-15, ASVS V13.1.1).
 */
export function dispatchTrustSignalNonBlocking(signal: TrustSignalPayload): void {
  const trustUrl = process.env.TRUST_GRAPH_URL || 'http://localhost:8001';
  const url = `${trustUrl.replace(/\/$/, '')}/trust/signal`;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...signal,
      timestamp: signal.timestamp || new Date().toISOString(),
    }),
  }).catch((err: any) => {
    console.warn(`[TrustSignal] Background signal dispatch failed: ${err?.message || err}`);
  });
}

/**
 * Dispatches a transaction outcome signal and awaits the HTTP response.
 * Used for integration tests or workflows that need confirmation of graph signaling.
 */
export async function dispatchTrustSignalAsync(signal: TrustSignalPayload): Promise<boolean> {
  const trustUrl = process.env.TRUST_GRAPH_URL || 'http://localhost:8001';
  const url = `${trustUrl.replace(/\/$/, '')}/trust/signal`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...signal,
        timestamp: signal.timestamp || new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch (err: any) {
    console.warn(`[TrustSignal] Background signal dispatch failed: ${err?.message || err}`);
    return false;
  }
}
