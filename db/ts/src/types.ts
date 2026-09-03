export interface BuyerFingerprint {
  email_hash: string;
  ip_subnet: string;
  device_hash: string | null;
  upi_handle: string | null;
  user_agent_hash: string;
}

export interface IntentParsed {
  product_query: string;
  quantity: number;
  buyer_email: string;
  confidence: number;
}

export interface Merchant {
  id: string;
  name: string;
  email: string;
  razorpay_key_id: string;
  razorpay_key_secret: string;
  razorpay_webhook_secret: string;
  maas_token_hash: string;
  token_preview: string;
  maas_endpoint: string;
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  description: string;
  price_paise: number;
  currency: string;
  stock: number;
  category: string;
  tags: string[];
  embedding: number[];
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface Transaction {
  id: string;
  merchant_id: string;
  intent_raw: string;
  intent_parsed: IntentParsed;
  product_id: string | null;
  quantity: number;
  amount_paise: number;
  currency: string;
  buyer_fingerprint: BuyerFingerprint;
  trust_score: number | null;
  trust_decision: 'ALLOW' | 'REVIEW' | 'DENY' | null;
  trust_risk_factors: string[];
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  status: 'PENDING' | 'SUCCESS' | 'DENIED' | 'FAILED' | 'PARTIAL';
  failure_reason: string | null;
  created_at: string | Date;
  resolved_at: string | Date | null;
}

export interface AuditEntry {
  id: string;
  transaction_id: string;
  step_name: string;
  step_number: number;
  timestamp: string | Date;
  duration_ms: number;
  input_summary: string;
  output_summary: string;
  reason: string;
  raw_data: Record<string, any>;
  is_error: boolean;
  prev_entry_hash: string;
  entry_hash: string;
}
