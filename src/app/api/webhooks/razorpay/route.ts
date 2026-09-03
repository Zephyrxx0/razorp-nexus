import { NextRequest, NextResponse } from 'next/server';
import { query } from '@nexus/db';
import { verifyRazorpaySignature } from '@/lib/webhook-verifier';
import { dispatchTrustSignalNonBlocking } from '@/lib/trust-client';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-razorpay-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'INVALID_SIGNATURE', message: 'Missing signature header' },
      { status: 400 }
    );
  }

  // 1. Read raw body text once for HMAC validation (D-13, §6.2)
  const rawBody = await req.text();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_nexus_test_secret';

  const isValid = verifyRazorpaySignature(rawBody, signature, secret);
  if (!isValid) {
    return NextResponse.json(
      { error: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  // 2. Parse JSON payload
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'INVALID_PAYLOAD', message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const eventType: string = event.event;
  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;

  const notes =
    paymentEntity?.notes || orderEntity?.notes || event.payload?.notes || {};
  const nexusTxnId = notes.nexus_transaction_id;
  const merchantId = notes.merchant_id;

  if (!nexusTxnId) {
    return NextResponse.json(
      {
        received: true,
        status: 'IGNORED_NO_TRANSACTION_ID',
        message: 'No nexus_transaction_id found in notes',
      },
      { status: 200 }
    );
  }

  // 3. Query PostgreSQL transactions table
  const { rows } = await query(
    'SELECT id, merchant_id, status, amount_paise, buyer_fingerprint, razorpay_payment_id FROM transactions WHERE id = $1',
    [nexusTxnId]
  );

  if (rows.length === 0) {
    console.warn(`[Webhook] Transaction ${nexusTxnId} not found in database`);
    return NextResponse.json(
      {
        received: true,
        status: 'TRANSACTION_NOT_FOUND',
        transaction_id: nexusTxnId,
      },
      { status: 200 }
    );
  }

  const txn = rows[0];

  // 4. Terminal State Idempotency Guard (D-14)
  if (txn.status === 'SUCCESS' || txn.status === 'FAILED') {
    return NextResponse.json(
      {
        received: true,
        status: 'ALREADY_TERMINAL',
        current_status: txn.status,
        transaction_id: txn.id,
      },
      { status: 200 }
    );
  }

  // Parse buyer fingerprint if stored as string
  let buyerFingerprint = txn.buyer_fingerprint;
  if (typeof buyerFingerprint === 'string') {
    try {
      buyerFingerprint = JSON.parse(buyerFingerprint);
    } catch {
      buyerFingerprint = {};
    }
  }

  // 5. Handle Events & Transition Status (RZP-04)
  let nextStatus: string = txn.status;

  if (eventType === 'payment.captured') {
    nextStatus = 'SUCCESS';
    const paymentId = paymentEntity?.id || txn.razorpay_payment_id;
    await query(
      'UPDATE transactions SET status = $1, razorpay_payment_id = COALESCE($2, razorpay_payment_id), resolved_at = clock_timestamp() WHERE id = $3',
      [nextStatus, paymentId, txn.id]
    );

    // Non-blocking asynchronous signal dispatch to Trust Graph (D-15)
    dispatchTrustSignalNonBlocking({
      merchant_id: txn.merchant_id || merchantId,
      transaction_id: txn.id,
      buyer_fingerprint: buyerFingerprint || {},
      amount_paise: Number(txn.amount_paise) || Number(paymentEntity?.amount) || 0,
      outcome: 'SUCCESS',
    });
  } else if (eventType === 'payment.failed') {
    nextStatus = 'FAILED';
    const errorDescription =
      paymentEntity?.error_description || 'Payment failed';
    await query(
      'UPDATE transactions SET status = $1, failure_reason = $2, resolved_at = clock_timestamp() WHERE id = $3',
      [nextStatus, errorDescription, txn.id]
    );

    // Non-blocking asynchronous signal dispatch to Trust Graph (D-15)
    dispatchTrustSignalNonBlocking({
      merchant_id: txn.merchant_id || merchantId,
      transaction_id: txn.id,
      buyer_fingerprint: buyerFingerprint || {},
      amount_paise: Number(txn.amount_paise) || Number(paymentEntity?.amount) || 0,
      outcome: 'FAILED',
    });
  } else if (eventType === 'order.paid' || eventType === 'payment.authorized') {
    console.log(
      `[Webhook] Acknowledging event ${eventType} for transaction ${txn.id}`
    );
    return NextResponse.json(
      {
        received: true,
        event: eventType,
        transaction_id: txn.id,
        status: 'ACKNOWLEDGED',
      },
      { status: 200 }
    );
  } else {
    return NextResponse.json(
      {
        received: true,
        event: eventType,
        transaction_id: txn.id,
        status: 'IGNORED_UNSUPPORTED_EVENT',
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      received: true,
      event: eventType,
      transaction_id: txn.id,
      status: 'PROCESSED',
      new_status: nextStatus,
    },
    { status: 200 }
  );
}
