#!/usr/bin/env bash
set -e

# Nexus MaaS Test Transaction Script
MERCHANT_ID="11111111-1111-1111-1111-111111111111"
TOKEN="maas_live_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
ENDPOINT="http://localhost:3000/api/maas/${MERCHANT_ID}/transact"

echo "🚀 Dispatching autonomous agent purchase to Nexus MaaS..."
echo "Target: ${ENDPOINT}"
echo "Merchant: Apex Electronics"
echo "Product: Sony WH-1000XM5 (1 unit)"
echo ""

curl -s -X POST "${ENDPOINT}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "Purchase 1 Sony WH-1000XM5",
    "buyer": {
      "email": "agent-demo@nexus.ai",
      "ip": "198.51.100.42",
      "device_id": "dev_demo_buyer_01"
    }
  }' | (command -v jq >/dev/null && jq . || cat)
