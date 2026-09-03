-- Seed 01: Initial Merchants Catalog
-- Defines 3 diverse merchants across distinct verticals (Consumer Tech, Apparel, Specialty Foods)

INSERT INTO merchants (
  id,
  name,
  email,
  razorpay_key_id,
  razorpay_key_secret,
  razorpay_webhook_secret,
  maas_token_hash,
  token_preview,
  maas_endpoint,
  is_active
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Apex Electronics',
    'apex@electronics.io',
    'rzp_test_apex123456',
    'fedcba9876543210fedcba98:d9f4dddfa1840f9eaab431a4b163e980:a1ca28fd4b32103012f746755470fedcd521',
    'whsec_apex_test_secret_123',
    '2d55760d323519beca4c779dfaa7a426970ab3f4597cb3a085f4c4650ad1f241',
    'maas_live_e3b0...b855',
    'https://apex.electronics.io/nexus-webhook',
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Urban Threads',
    'support@urbanthreads.in',
    'rzp_test_urban789012',
    '1234567890abcdef12345678:f69a9225537e9e4e563f7acfedbd90a8:59e5d094fa08c72ed6714c282fee50d6ae374e3092939ce975e5d3589fed5f603c59',
    'whsec_urban_test_secret_456',
    '1f40559f42bd7f6b6d36ccd2bd885905086e0d3736d611506a066e45fe9bb01b',
    'maas_live_0123...cdef',
    'https://urbanthreads.in/nexus-webhook',
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Gourmet Direct',
    'orders@gourmetdirect.com',
    'rzp_test_gourmet345678',
    'aabbccddeeff001122334455:462afa0c7503bca9c3be4d862399c605:bb7ed3e0c1688bedafd793513261c1193027a808db745dd8930b04d0d030c7ed8d8e7da877150b',
    'whsec_gourmet_test_secret_789',
    'd67d598ca6ac33ab7bb4dcaae453b2be4f0412a9c6766351b9ea448c1817be8e',
    'maas_live_dead...ef01',
    'https://gourmetdirect.com/nexus-webhook',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  razorpay_key_id = EXCLUDED.razorpay_key_id,
  razorpay_key_secret = EXCLUDED.razorpay_key_secret,
  razorpay_webhook_secret = EXCLUDED.razorpay_webhook_secret,
  maas_token_hash = EXCLUDED.maas_token_hash,
  token_preview = EXCLUDED.token_preview,
  maas_endpoint = EXCLUDED.maas_endpoint,
  is_active = EXCLUDED.is_active,
  updated_at = clock_timestamp();
