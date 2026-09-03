import crypto from 'node:crypto';

export interface GenerateWebhookOptions {
  event: 'payment.captured' | 'payment.failed' | 'order.paid' | 'payment.authorized';
  nexusTransactionId?: string;
  merchantId?: string;
  amountPaise?: number;
  paymentId?: string;
  orderId?: string;
  secret: string;
  errorDescription?: string;
}

export function generateSignedWebhook(options: GenerateWebhookOptions): {
  payload: any;
  rawBody: string;
  signature: string;
} {
  const amount = options.amountPaise ?? 2999000;
  const paymentId = options.paymentId || `pay_${crypto.randomBytes(8).toString('hex')}`;
  const orderId = options.orderId || `order_${crypto.randomBytes(8).toString('hex')}`;

  const notes: Record<string, string> = {};
  if (options.nexusTransactionId) {
    notes.nexus_transaction_id = options.nexusTransactionId;
  }
  if (options.merchantId) {
    notes.merchant_id = options.merchantId;
  }

  const isFailed = options.event === 'payment.failed';
  const isCaptured = options.event === 'payment.captured';

  const paymentEntity: Record<string, any> = {
    id: paymentId,
    entity: 'payment',
    amount: amount,
    currency: 'INR',
    status: isCaptured ? 'captured' : isFailed ? 'failed' : 'authorized',
    order_id: orderId,
    error_description: options.errorDescription || (isFailed ? 'Payment failed due to card decline' : null),
    notes,
    created_at: Math.floor(Date.now() / 1000),
  };

  const orderEntity: Record<string, any> = {
    id: orderId,
    entity: 'order',
    amount: amount,
    currency: 'INR',
    status: options.event === 'order.paid' ? 'paid' : 'created',
    notes,
    created_at: Math.floor(Date.now() / 1000),
  };

  const payload: Record<string, any> = {
    entity: 'event',
    account_id: 'acc_nexus_test',
    event: options.event,
    contains: ['payment'],
    payload: {
      payment: {
        entity: paymentEntity,
      },
      order: {
        entity: orderEntity,
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };

  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', options.secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return { payload, rawBody, signature };
}

export function generateTamperedWebhook(
  options: GenerateWebhookOptions,
  tamperWith: 'signature' | 'body' = 'signature'
): {
  payload: any;
  rawBody: string;
  signature: string;
} {
  const signed = generateSignedWebhook(options);

  if (tamperWith === 'signature') {
    // Invert characters of signature to produce mismatched signature of same length
    const tamperedSig = signed.signature
      .split('')
      .reverse()
      .join('');
    // Guarantee it doesn't match
    const finalSig = tamperedSig === signed.signature ? '0000000000000000000000000000000000000000000000000000000000000000' : tamperedSig;
    return {
      payload: signed.payload,
      rawBody: signed.rawBody,
      signature: finalSig,
    };
  } else {
    // Tamper body: modify amount or payload
    const tamperedPayload = {
      ...signed.payload,
      tampered: true,
      payload: {
        ...signed.payload.payload,
        payment: {
          ...signed.payload.payload.payment,
          entity: {
            ...signed.payload.payload.payment.entity,
            amount: (options.amountPaise ?? 2999000) + 1000,
          },
        },
      },
    };
    return {
      payload: tamperedPayload,
      rawBody: JSON.stringify(tamperedPayload),
      signature: signed.signature,
    };
  }
}
