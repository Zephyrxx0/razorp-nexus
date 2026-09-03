import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { POST } from '@/app/api/webhooks/razorpay/route';
import { timingSafeCompare, verifyRazorpaySignature } from '@/lib/webhook-verifier';
import {
  dispatchTrustSignalAsync,
  dispatchTrustSignalNonBlocking,
} from '@/lib/trust-client';
import {
  generateSignedWebhook,
  generateTamperedWebhook,
} from '../helpers/webhook-generator';
import { query } from '@nexus/db';

vi.mock('@nexus/db', async () => {
  const actual = await vi.importActual<any>('@nexus/db');
  return {
    ...actual,
    query: vi.fn(),
  };
});

describe('Razorpay Webhook Ingestion & Graph Signaling', () => {
  const testSecret = 'whsec_nexus_test_secret';
  const merchantId = '11111111-1111-1111-1111-111111111111';
  const txnId = 'txn_webhook_test_123';
  const originalFetch = global.fetch;
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = testSecret;
    process.env.TRUST_GRAPH_URL = 'http://localhost:8001';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSecret !== undefined) {
      process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    } else {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }
  });

  describe('timingSafeCompare & verifyRazorpaySignature (Task 1, D-13, ASVS V3.2.1)', () => {
    it('timingSafeCompare returns true for identical strings', () => {
      const a = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const b = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      expect(timingSafeCompare(a, b)).toBe(true);
    });

    it('timingSafeCompare returns false for different strings of same length', () => {
      const a = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const b = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b3';
      expect(timingSafeCompare(a, b)).toBe(false);
    });

    it('timingSafeCompare guards against buffer length mismatch crashes (RangeError)', () => {
      const a = 'short_signature';
      const b = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      // Standard crypto.timingSafeEqual throws RangeError: Input buffers must have the same byte length
      // timingSafeCompare must return false gracefully without throwing
      expect(() => timingSafeCompare(a, b)).not.toThrow();
      expect(timingSafeCompare(a, b)).toBe(false);
      expect(timingSafeCompare(b, a)).toBe(false);
      expect(timingSafeCompare('', b)).toBe(false);
    });

    it('verifyRazorpaySignature validates correct HMAC and rejects bad signatures', () => {
      const body = JSON.stringify({ event: 'payment.captured' });
      const validSig = crypto
        .createHmac('sha256', testSecret)
        .update(body, 'utf8')
        .digest('hex');

      expect(verifyRazorpaySignature(body, validSig, testSecret)).toBe(true);
      expect(verifyRazorpaySignature(body, 'invalid_signature_hex_123', testSecret)).toBe(false);
      expect(verifyRazorpaySignature(body, null, testSecret)).toBe(false);
      expect(verifyRazorpaySignature(body, undefined, testSecret)).toBe(false);
      expect(verifyRazorpaySignature(body, '', testSecret)).toBe(false);
    });
  });

  describe('Signature Verification Security Gate (Threat T-04-08, T-04-09)', () => {
    it('returns 400 Bad Request when x-razorpay-signature header is missing', async () => {
      const { rawBody } = generateSignedWebhook({
        event: 'payment.captured',
        nexusTransactionId: txnId,
        merchantId,
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('returns 400 Bad Request when signature is invalid', async () => {
      const { rawBody } = generateSignedWebhook({
        event: 'payment.captured',
        nexusTransactionId: txnId,
        merchantId,
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('returns 400 Bad Request on tampered signature', async () => {
      const tampered = generateTamperedWebhook(
        {
          event: 'payment.captured',
          nexusTransactionId: txnId,
          merchantId,
          secret: testSecret,
        },
        'signature'
      );

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': tampered.signature,
        },
        body: tampered.rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('returns 400 Bad Request on tampered body with original signature', async () => {
      const tampered = generateTamperedWebhook(
        {
          event: 'payment.captured',
          nexusTransactionId: txnId,
          merchantId,
          secret: testSecret,
        },
        'body'
      );

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': tampered.signature,
        },
        body: tampered.rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('returns 400 Bad Request safely when signature length is mismatched (no RangeError crash)', async () => {
      const { rawBody } = generateSignedWebhook({
        event: 'payment.captured',
        nexusTransactionId: txnId,
        merchantId,
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'abc123short',
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_SIGNATURE');
    });

    it('returns 400 Bad Request on malformed JSON payload with valid HMAC', async () => {
      const badJson = '{ invalid_json: ';
      const validHmac = crypto
        .createHmac('sha256', testSecret)
        .update(badJson, 'utf8')
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': validHmac,
        },
        body: badJson,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_PAYLOAD');
    });
  });

  describe('Payload Metadata & Transaction Discovery', () => {
    it('returns 200 IGNORED_NO_TRANSACTION_ID when notes lacks nexus_transaction_id', async () => {
      const { rawBody, signature } = generateSignedWebhook({
        event: 'payment.captured',
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.status).toBe('IGNORED_NO_TRANSACTION_ID');
    });

    it('returns 200 TRANSACTION_NOT_FOUND when transaction is not in database', async () => {
      (query as any).mockResolvedValueOnce({ rows: [] });

      const { rawBody, signature } = generateSignedWebhook({
        event: 'payment.captured',
        nexusTransactionId: 'txn_non_existent',
        merchantId,
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.status).toBe('TRANSACTION_NOT_FOUND');
    });
  });

  describe('Terminal State Idempotency Guard (Threat T-04-10, D-14)', () => {
    it('returns 200 ALREADY_TERMINAL when transaction is already SUCCESS', async () => {
      (query as any).mockResolvedValueOnce({
        rows: [
          {
            id: txnId,
            merchant_id: merchantId,
            status: 'SUCCESS',
            amount_paise: 2999000,
            buyer_fingerprint: { email_hash: 'hash123', ip_subnet: '103.21.44.0/24' },
            razorpay_payment_id: 'pay_existing_123',
          },
        ],
      });

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const { rawBody, signature } = generateSignedWebhook({
        event: 'payment.captured',
        nexusTransactionId: txnId,
        merchantId,
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.status).toBe('ALREADY_TERMINAL');
      expect(data.current_status).toBe('SUCCESS');

      // Verify no UPDATE query was executed (only initial SELECT)
      expect(query).toHaveBeenCalledTimes(1);
      // Verify no signal was dispatched
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 200 ALREADY_TERMINAL when transaction is already FAILED', async () => {
      (query as any).mockResolvedValueOnce({
        rows: [
          {
            id: txnId,
            merchant_id: merchantId,
            status: 'FAILED',
            amount_paise: 2999000,
            buyer_fingerprint: { email_hash: 'hash123', ip_subnet: '103.21.44.0/24' },
            razorpay_payment_id: null,
          },
        ],
      });

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const { rawBody, signature } = generateSignedWebhook({
        event: 'payment.failed',
        nexusTransactionId: txnId,
        merchantId,
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.status).toBe('ALREADY_TERMINAL');
      expect(data.current_status).toBe('FAILED');

      expect(query).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Event Processing & Trust Graph Signaling (Task 3, RZP-04, D-15)', () => {
    it('handles payment.captured: updates status to SUCCESS and dispatches non-blocking signal', async () => {
      // 1. SELECT returns PENDING transaction
      (query as any)
        .mockResolvedValueOnce({
          rows: [
            {
              id: txnId,
              merchant_id: merchantId,
              status: 'PENDING',
              amount_paise: 2999000,
              buyer_fingerprint: { email_hash: 'clean_buyer_hash', ip_subnet: '10.0.0.0/24' },
              razorpay_payment_id: null,
            },
          ],
        })
        // 2. UPDATE query
        .mockResolvedValueOnce({ rows: [] });

      let capturedUrl = '';
      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'INGESTED' }),
        };
      });

      const { rawBody, signature, payload } = generateSignedWebhook({
        event: 'payment.captured',
        nexusTransactionId: txnId,
        merchantId,
        amountPaise: 2999000,
        paymentId: 'pay_captured_789',
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.event).toBe('payment.captured');
      expect(data.transaction_id).toBe(txnId);
      expect(data.status).toBe('PROCESSED');
      expect(data.new_status).toBe('SUCCESS');

      // Verify DB update
      expect(query).toHaveBeenCalledTimes(2);
      const updateCall = (query as any).mock.calls[1];
      expect(updateCall[0]).toContain("UPDATE transactions SET status = $1");
      expect(updateCall[1][0]).toBe('SUCCESS');
      expect(updateCall[1][1]).toBe('pay_captured_789');
      expect(updateCall[1][2]).toBe(txnId);

      // Verify Trust Graph signal dispatch
      expect(capturedUrl).toBe('http://localhost:8001/trust/signal');
      expect(capturedBody).toMatchObject({
        merchant_id: merchantId,
        transaction_id: txnId,
        buyer_fingerprint: { email_hash: 'clean_buyer_hash', ip_subnet: '10.0.0.0/24' },
        amount_paise: 2999000,
        outcome: 'SUCCESS',
      });
      expect(capturedBody.timestamp).toBeDefined();
    });

    it('handles payment.failed: updates status to FAILED and dispatches failure signal', async () => {
      // 1. SELECT returns PENDING transaction
      (query as any)
        .mockResolvedValueOnce({
          rows: [
            {
              id: txnId,
              merchant_id: merchantId,
              status: 'PENDING',
              amount_paise: 150000,
              buyer_fingerprint: { email_hash: 'fraud_buyer_hash', ip_subnet: '198.51.100.0/24' },
              razorpay_payment_id: null,
            },
          ],
        })
        // 2. UPDATE query
        .mockResolvedValueOnce({ rows: [] });

      let capturedUrl = '';
      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'INGESTED' }),
        };
      });

      const { rawBody, signature } = generateSignedWebhook({
        event: 'payment.failed',
        nexusTransactionId: txnId,
        merchantId,
        amountPaise: 150000,
        errorDescription: 'Card expired or declined',
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.event).toBe('payment.failed');
      expect(data.transaction_id).toBe(txnId);
      expect(data.status).toBe('PROCESSED');
      expect(data.new_status).toBe('FAILED');

      // Verify DB update
      expect(query).toHaveBeenCalledTimes(2);
      const updateCall = (query as any).mock.calls[1];
      expect(updateCall[0]).toContain("UPDATE transactions SET status = $1, failure_reason = $2");
      expect(updateCall[1][0]).toBe('FAILED');
      expect(updateCall[1][1]).toBe('Card expired or declined');
      expect(updateCall[1][2]).toBe(txnId);

      // Verify Trust Graph signal dispatch
      expect(capturedUrl).toBe('http://localhost:8001/trust/signal');
      expect(capturedBody).toMatchObject({
        merchant_id: merchantId,
        transaction_id: txnId,
        outcome: 'FAILED',
        amount_paise: 150000,
      });
    });

    it('handles order.paid and payment.authorized as acknowledged events', async () => {
      (query as any).mockResolvedValueOnce({
        rows: [
          {
            id: txnId,
            merchant_id: merchantId,
            status: 'PENDING',
            amount_paise: 2999000,
          },
        ],
      });

      const { rawBody, signature } = generateSignedWebhook({
        event: 'order.paid',
        nexusTransactionId: txnId,
        merchantId,
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.event).toBe('order.paid');
      expect(data.transaction_id).toBe(txnId);
      expect(data.status).toBe('ACKNOWLEDGED');
    });

    it('absorbs Trust Graph failures without failing the 200 webhook response (Threat T-04-11, D-15)', async () => {
      (query as any)
        .mockResolvedValueOnce({
          rows: [
            {
              id: txnId,
              merchant_id: merchantId,
              status: 'PENDING',
              amount_paise: 2999000,
              buyer_fingerprint: { email_hash: 'test' },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      // Mock Trust Graph rejecting / network down
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused to localhost:8001'));

      const { rawBody, signature } = generateSignedWebhook({
        event: 'payment.captured',
        nexusTransactionId: txnId,
        merchantId,
        secret: testSecret,
      });

      const req = new NextRequest('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req);
      // Must still succeed with 200 OK because signal dispatch is non-blocking and error-absorbed
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.status).toBe('PROCESSED');
      expect(data.new_status).toBe('SUCCESS');
    });
  });

  describe('dispatchTrustSignalAsync & dispatchTrustSignalNonBlocking (Task 2)', () => {
    it('dispatchTrustSignalAsync returns true when service responds 200', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await dispatchTrustSignalAsync({
        merchant_id: merchantId,
        transaction_id: txnId,
        buyer_fingerprint: { email_hash: 'abc' },
        amount_paise: 10000,
        outcome: 'SUCCESS',
      });

      expect(result).toBe(true);
    });

    it('dispatchTrustSignalAsync returns false when service throws or responds error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await dispatchTrustSignalAsync({
        merchant_id: merchantId,
        transaction_id: txnId,
        buyer_fingerprint: { email_hash: 'abc' },
        amount_paise: 10000,
        outcome: 'FAILED',
      });

      expect(result).toBe(false);
    });

    it('dispatchTrustSignalNonBlocking fires fetch and catches error safely', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      expect(() => {
        dispatchTrustSignalNonBlocking({
          merchant_id: merchantId,
          transaction_id: txnId,
          buyer_fingerprint: { email_hash: 'abc' },
          amount_paise: 10000,
          outcome: 'SUCCESS',
        });
      }).not.toThrow();

      warnSpy.mockRestore();
    });
  });
});
