-- Migration: patch existing merchants/products tables created by old schema
-- Run this AFTER schema.sql if the tables already existed (IF NOT EXISTS was a no-op)
-- Safe to run multiple times (all statements are idempotent).

-- Merchants: add alias columns and fix missing defaults
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS razorpay_key_secret_encrypted TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS maas_token_preview             VARCHAR(32);
ALTER TABLE merchants ALTER COLUMN razorpay_key_secret       SET DEFAULT '';
ALTER TABLE merchants ALTER COLUMN token_preview              SET DEFAULT '';
ALTER TABLE merchants ALTER COLUMN maas_endpoint              SET DEFAULT '/api/maas';
ALTER TABLE merchants ALTER COLUMN razorpay_webhook_secret    SET DEFAULT 'whsec_nexus_test_secret';

-- Products: add alias columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity   INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_ai_purchasable BOOLEAN NOT NULL DEFAULT true;

