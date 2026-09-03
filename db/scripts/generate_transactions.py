#!/usr/bin/env python3
"""
Generate baseline historical transactions and cryptographic audit chains (db/seeds/03_transactions.sql).

Produces:
- 14 Benign transactions across 3 merchants with ALLOW decisions and razorpay IDs.
- 6 Coordinated cross-merchant fraud ring transactions (Cluster A and Cluster B).
- 2-3 step companion audit entries per transaction with valid SHA-256 hash chains starting from 'GENESIS'.
"""

import json
import hashlib
from pathlib import Path

APEX_ID = "11111111-1111-1111-1111-111111111111"
URBAN_ID = "22222222-2222-2222-2222-222222222222"
GOURMET_ID = "33333333-3333-3333-3333-333333333333"

def sha256_str(val: str) -> str:
    return hashlib.sha256(val.encode("utf-8")).hexdigest()

def compute_hash(prev_hash: str, tx_id: str, step_no: int, step_name: str, input_sum: str, output_sum: str, reason: str, is_error: bool) -> str:
    payload = f"{prev_hash}|{tx_id}|{step_no}|{step_name}|{input_sum}|{output_sum}|{reason}|{'true' if is_error else 'false'}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

# 14 Benign Transactions
BENIGN_DEFS = [
    # Apex Electronics (5)
    {
        "merchant_id": APEX_ID,
        "product_id": "10000000-0000-0000-0000-000000000001", # Sony WH-1000XM5
        "quantity": 1,
        "amount_paise": 2999000,
        "intent_raw": "I need one Sony WH-1000XM5 wireless noise cancelling headset",
        "email": "priya.sharma@gmail.com",
        "ip": "49.36.120.45",
        "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
        "upi": "priyasharma@oksbi",
        "device": "ios_device_priya_01",
        "score": 94.50,
    },
    {
        "merchant_id": APEX_ID,
        "product_id": "10000000-0000-0000-0000-000000000002", # Keychron K2
        "quantity": 1,
        "amount_paise": 749900,
        "intent_raw": "Buy Keychron K2 mechanical keyboard for office desk",
        "email": "rahul.tech@outlook.com",
        "ip": "103.21.140.12",
        "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0",
        "upi": "rahul.dev@okhdfcbank",
        "device": "mac_dev_k2_987",
        "score": 92.00,
    },
    {
        "merchant_id": APEX_ID,
        "product_id": "10000000-0000-0000-0000-000000000003", # Anker 65W GaN
        "quantity": 2,
        "amount_paise": 599800,
        "intent_raw": "Order 2 Anker 65W GaN fast chargers",
        "email": "ananya.iyer@corporate.org",
        "ip": "122.161.88.90",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0",
        "upi": "ananya@icici",
        "device": "win_dev_corp_112",
        "score": 96.50,
    },
    {
        "merchant_id": APEX_ID,
        "product_id": "10000000-0000-0000-0000-000000000005", # Logitech MX Master 3S
        "quantity": 1,
        "amount_paise": 899500,
        "intent_raw": "Purchase Logitech MX Master 3S mouse",
        "email": "vikram.design@studio.in",
        "ip": "14.139.240.55",
        "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) Safari/605.1.15",
        "upi": "vikram@axisbank",
        "device": "macbook_pro_m2_vikram",
        "score": 91.00,
    },
    {
        "merchant_id": APEX_ID,
        "product_id": "10000000-0000-0000-0000-000000000007", # SanDisk 1TB SSD
        "quantity": 1,
        "amount_paise": 849900,
        "intent_raw": "Need portable SanDisk 1TB extreme SSD for backup",
        "email": "kavita.nair@research.ac.in",
        "ip": "203.110.242.18",
        "ua": "Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0",
        "upi": "kavita@ybl",
        "device": "linux_workstation_kn",
        "score": 97.00,
    },

    # Urban Threads (5)
    {
        "merchant_id": URBAN_ID,
        "product_id": "20000000-0000-0000-0000-000000000001", # Organic Cotton Tee
        "quantity": 3,
        "amount_paise": 299700,
        "intent_raw": "Order 3 organic cotton crewneck tees size M",
        "email": "arjun.kapoor@gmail.com",
        "ip": "27.56.180.22",
        "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15",
        "upi": "arjun.k@okicici",
        "device": "iphone15_arjun",
        "score": 95.00,
    },
    {
        "merchant_id": URBAN_ID,
        "product_id": "20000000-0000-0000-0000-000000000002", # Japanese Denim Jacket
        "quantity": 1,
        "amount_paise": 799900,
        "intent_raw": "Buy Japanese raw selvedge denim jacket size L",
        "email": "siddharth.m@venture.co",
        "ip": "115.240.90.114",
        "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "upi": "sid.m@okhdfcbank",
        "device": "macbook_air_m1_sid",
        "score": 90.50,
    },
    {
        "merchant_id": URBAN_ID,
        "product_id": "20000000-0000-0000-0000-000000000004", # Full-Grain Leather Belt
        "quantity": 1,
        "amount_paise": 199900,
        "intent_raw": "Purchase vegetable tanned leather belt brown 34",
        "email": "neha.gupta@deloitte.com",
        "ip": "157.48.210.77",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "upi": "nehagupta@paytm",
        "device": "thinkpad_x1_neha",
        "score": 93.80,
    },
    {
        "merchant_id": URBAN_ID,
        "product_id": "20000000-0000-0000-0000-000000000006", # Canvas Commuter Backpack
        "quantity": 1,
        "amount_paise": 399900,
        "intent_raw": "Order waterproof waxed canvas commuter backpack",
        "email": "rohit.sen@freelance.org",
        "ip": "182.73.155.33",
        "ua": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        "upi": "rohitsen@barodampay",
        "device": "dell_latitude_rohit",
        "score": 89.00,
    },
    {
        "merchant_id": URBAN_ID,
        "product_id": "20000000-0000-0000-0000-000000000008", # Polarized Sunglasses
        "quantity": 1,
        "amount_paise": 299900,
        "intent_raw": "Buy classic polarized acetate frame sunglasses",
        "email": "tanvi.mehta@creative.in",
        "ip": "59.144.92.81",
        "ua": "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15",
        "upi": "tanvi@okhdfcbank",
        "device": "ipad_pro_tanvi",
        "score": 94.00,
    },

    # Gourmet Direct (4)
    {
        "merchant_id": GOURMET_ID,
        "product_id": "30000000-0000-0000-0000-000000000001", # Arabica Beans
        "quantity": 2,
        "amount_paise": 179800,
        "intent_raw": "Order 2 bags Ethiopian Yirgacheffe coffee beans 500g",
        "email": "aditya.brew@artisancoffee.org",
        "ip": "106.51.72.190",
        "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) Chrome/120.0.0.0",
        "upi": "aditya@axl",
        "device": "mac_studio_aditya",
        "score": 98.00,
    },
    {
        "merchant_id": GOURMET_ID,
        "product_id": "30000000-0000-0000-0000-000000000003", # Extra Virgin Olive Oil
        "quantity": 1,
        "amount_paise": 149900,
        "intent_raw": "Buy Greek cold pressed extra virgin olive oil 750ml",
        "email": "deepa.chef@bistrogourmet.com",
        "ip": "117.218.45.10",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0",
        "upi": "deepachef@kotak",
        "device": "surface_pro_deepa",
        "score": 93.00,
    },
    {
        "merchant_id": GOURMET_ID,
        "product_id": "30000000-0000-0000-0000-000000000005", # Ceremonial Grade Matcha
        "quantity": 1,
        "amount_paise": 189900,
        "intent_raw": "Purchase organic Uji Japanese ceremonial grade matcha 30g",
        "email": "sunil.wellness@healthylife.in",
        "ip": "125.19.64.202",
        "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15",
        "upi": "sunil@paytm",
        "device": "pixel_7_sunil",
        "score": 96.00,
    },
    {
        "merchant_id": GOURMET_ID,
        "product_id": "30000000-0000-0000-0000-000000000008", # Roasted Almond Butter
        "quantity": 2,
        "amount_paise": 129800,
        "intent_raw": "Order 2 jars natural roasted almond butter 350g",
        "email": "pooja.patel@fitnesshub.com",
        "ip": "223.233.78.64",
        "ua": "Mozilla/5.0 (Windows NT 11.0; Win64; x64) Edge/120.0.0.0",
        "upi": "pooja@okhdfcbank",
        "device": "hp_spectre_pooja",
        "score": 95.50,
    },
]

# 6 Fraud Ring Transactions across Apex, Urban, Gourmet
# Cluster A: email_hash of 'fraudster.ring1@proton.me', subnet '185.220.101.0/24'
# Cluster B: email_hash of 'syndicate.buyer2@tempmail.com', device 'dev_hash_987654'
RING_DEFS = [
    # Cluster A - Transaction 1 (Apex)
    {
        "merchant_id": APEX_ID,
        "product_id": "10000000-0000-0000-0000-000000000008", # Dell UltraSharp 27"
        "quantity": 3,
        "amount_paise": 10497000,
        "intent_raw": "Urgent buy 3 Dell 27 4K monitors overnight shipping",
        "email": "fraudster.ring1@proton.me",
        "ip": "185.220.101.5",
        "ua": "Mozilla/5.0 (X11; Tor Browser x86_64)",
        "upi": "anonymous.ring1@upi",
        "device": "tor_ghost_device_a1",
        "score": 22.50,
        "cluster": "Cluster A",
    },
    # Cluster A - Transaction 2 (Urban Threads)
    {
        "merchant_id": URBAN_ID,
        "product_id": "20000000-0000-0000-0000-000000000002", # Japanese Denim Jacket
        "quantity": 4,
        "amount_paise": 3199600,
        "intent_raw": "Buy 4 raw denim jackets size XL express delivery",
        "email": "fraudster.ring1@proton.me",
        "ip": "185.220.101.19",
        "ua": "Mozilla/5.0 (X11; Tor Browser x86_64)",
        "upi": "anonymous.ring1@upi",
        "device": "tor_ghost_device_a2",
        "score": 18.00,
        "cluster": "Cluster A",
    },
    # Cluster A - Transaction 3 (Gourmet Direct)
    {
        "merchant_id": GOURMET_ID,
        "product_id": "30000000-0000-0000-0000-000000000005", # Ceremonial Grade Matcha
        "quantity": 10,
        "amount_paise": 1899000,
        "intent_raw": "Need 10 tins of ceremonial grade matcha urgent dispatch",
        "email": "fraudster.ring1@proton.me",
        "ip": "185.220.101.88",
        "ua": "Mozilla/5.0 (X11; Tor Browser x86_64)",
        "upi": "anonymous.ring1@upi",
        "device": "tor_ghost_device_a3",
        "score": 25.00,
        "cluster": "Cluster A",
    },

    # Cluster B - Transaction 4 (Apex)
    {
        "merchant_id": APEX_ID,
        "product_id": "10000000-0000-0000-0000-000000000004", # Samsung Galaxy Watch 6
        "quantity": 2,
        "amount_paise": 4399800,
        "intent_raw": "Order 2 Galaxy Watch 6 smartwatches right now",
        "email": "syndicate.buyer2@tempmail.com",
        "ip": "194.26.29.14",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BotNet/3.1",
        "upi": "syndicate02@fakebank",
        "device": "dev_hash_987654",
        "score": 28.50,
        "cluster": "Cluster B",
    },
    # Cluster B - Transaction 5 (Urban Threads)
    {
        "merchant_id": URBAN_ID,
        "product_id": "20000000-0000-0000-0000-000000000003", # All-Day Running Sneakers
        "quantity": 5,
        "amount_paise": 2249500,
        "intent_raw": "Order 5 pairs of running sneakers size 10 immediate send",
        "email": "syndicate.buyer2@tempmail.com",
        "ip": "194.26.29.58",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BotNet/3.1",
        "upi": "syndicate02@fakebank",
        "device": "dev_hash_987654",
        "score": 19.00,
        "cluster": "Cluster B",
    },
    # Cluster B - Transaction 6 (Gourmet Direct)
    {
        "merchant_id": GOURMET_ID,
        "product_id": "30000000-0000-0000-0000-000000000003", # Extra Virgin Olive Oil
        "quantity": 8,
        "amount_paise": 1199200,
        "intent_raw": "Buy 8 bottles of single estate extra virgin olive oil fast",
        "email": "syndicate.buyer2@tempmail.com",
        "ip": "194.26.29.99",
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BotNet/3.1",
        "upi": "syndicate02@fakebank",
        "device": "dev_hash_987654",
        "score": 31.00,
        "cluster": "Cluster B",
    },
]


def format_subnet(ip: str) -> str:
    parts = ip.strip().split(".")
    return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"


def escape_sql(val: str) -> str:
    return val.replace("'", "''")

def generate_transactions():
    tx_sql = []
    audit_sql = []

    tx_counter = 1

    # 1. Process 14 Benign
    for b in BENIGN_DEFS:
        tx_id = f"a0000000-0000-0000-0000-{tx_counter:012d}"
        email_clean = b["email"].strip().lower()
        email_hash = sha256_str(email_clean)
        subnet = format_subnet(b["ip"])
        ua_hash = sha256_str(b["ua"].strip())
        dev_hash = sha256_str(b["device"].strip().lower())
        
        fingerprint = {
            "email_hash": email_hash,
            "ip_subnet": subnet,
            "device_hash": dev_hash,
            "upi_handle": b["upi"],
            "user_agent_hash": ua_hash,
        }

        intent_parsed = {
            "product_query": b["intent_raw"],
            "quantity": b["quantity"],
            "buyer_email": email_clean,
            "confidence": 0.95,
        }

        rzp_order_id = f"order_seed_{tx_counter:04d}"
        rzp_pay_id = f"pay_seed_{tx_counter:04d}"

        raw_escaped = escape_sql(b["intent_raw"])
        fp_json = json.dumps(fingerprint)
        ip_json = json.dumps(intent_parsed)

        tx_line = (
            f"  (\n"
            f"    '{tx_id}',\n"
            f"    '{b['merchant_id']}',\n"
            f"    '{raw_escaped}',\n"
            f"    '{ip_json}'::jsonb,\n"
            f"    '{b['product_id']}',\n"
            f"    {b['quantity']},\n"
            f"    {b['amount_paise']},\n"
            f"    'INR',\n"
            f"    '{fp_json}'::jsonb,\n"
            f"    {b['score']:.2f},\n"
            f"    'ALLOW',\n"
            f"    '{{}}'::text[],\n"
            f"    '{rzp_order_id}',\n"
            f"    '{rzp_pay_id}',\n"
            f"    'SUCCESS',\n"
            f"    NULL,\n"
            f"    clock_timestamp() - interval '{20 - tx_counter} hours',\n"
            f"    clock_timestamp() - interval '{20 - tx_counter} hours' + interval '2 seconds'\n"
            f"  )"
        )
        tx_sql.append(tx_line)

        # Companion Audit Entries (3 steps)
        # Step 1: INTENT_RECEIVED
        prev_h = "GENESIS"
        s1_input = f"Received buyer intent: '{b['intent_raw']}'"
        s1_output = "Intent parsed successfully into SKU query and quantity"
        s1_reason = "Transaction initiated by verified buyer agent"
        s1_hash = compute_hash(prev_h, tx_id, 1, "INTENT_RECEIVED", s1_input, s1_output, s1_reason, False)
        
        audit_sql.append(
            f"  (\n"
            f"    gen_random_uuid(),\n"
            f"    '{tx_id}',\n"
            f"    'INTENT_RECEIVED',\n"
            f"    1,\n"
            f"    12,\n"
            f"    '{escape_sql(s1_input)}',\n"
            f"    '{escape_sql(s1_output)}',\n"
            f"    '{escape_sql(s1_reason)}',\n"
            f"    '{json.dumps({'step': 1})}'::jsonb,\n"
            f"    false,\n"
            f"    '{prev_h}',\n"
            f"    '{s1_hash}'\n"
            f"  )"
        )

        # Step 2: CATALOG_RESOLVED
        prev_h = s1_hash
        s2_input = f"SKU query: {b['intent_raw']}, required stock: {b['quantity']}"
        s2_output = f"Product resolved: {b['product_id']}, calculated price: {b['amount_paise']} paise"
        s2_reason = "HNSW cosine vector search matched catalog product with high confidence"
        s2_hash = compute_hash(prev_h, tx_id, 2, "CATALOG_RESOLVED", s2_input, s2_output, s2_reason, False)

        audit_sql.append(
            f"  (\n"
            f"    gen_random_uuid(),\n"
            f"    '{tx_id}',\n"
            f"    'CATALOG_RESOLVED',\n"
            f"    2,\n"
            f"    18,\n"
            f"    '{escape_sql(s2_input)}',\n"
            f"    '{escape_sql(s2_output)}',\n"
            f"    '{escape_sql(s2_reason)}',\n"
            f"    '{json.dumps({'step': 2})}'::jsonb,\n"
            f"    false,\n"
            f"    '{prev_h}',\n"
            f"    '{s2_hash}'\n"
            f"  )"
        )

        # Step 3: TRUST_CHECKED
        prev_h = s2_hash
        s3_input = f"Evaluating fingerprint: subnet {subnet}, email hash {email_hash[:10]}..."
        s3_output = f"Trust score: {b['score']:.2f}, decision: ALLOW, risk factors: none"
        s3_reason = "Buyer graph node is isolated with clean subnet and high trust history"
        s3_hash = compute_hash(prev_h, tx_id, 3, "TRUST_CHECKED", s3_input, s3_output, s3_reason, False)

        audit_sql.append(
            f"  (\n"
            f"    gen_random_uuid(),\n"
            f"    '{tx_id}',\n"
            f"    'TRUST_CHECKED',\n"
            f"    3,\n"
            f"    25,\n"
            f"    '{escape_sql(s3_input)}',\n"
            f"    '{escape_sql(s3_output)}',\n"
            f"    '{escape_sql(s3_reason)}',\n"
            f"    '{json.dumps({'step': 3})}'::jsonb,\n"
            f"    false,\n"
            f"    '{prev_h}',\n"
            f"    '{s3_hash}'\n"
            f"  )"
        )

        tx_counter += 1

    # 2. Process 6 Coordinated Cross-Merchant Fraud Ring Transactions
    for r in RING_DEFS:
        tx_id = f"b0000000-0000-0000-0000-{tx_counter:012d}"
        email_clean = r["email"].strip().lower()
        email_hash = sha256_str(email_clean)
        subnet = format_subnet(r["ip"])
        ua_hash = sha256_str(r["ua"].strip())
        dev_hash = sha256_str(r["device"].strip().lower())

        fingerprint = {
            "email_hash": email_hash,
            "ip_subnet": subnet,
            "device_hash": dev_hash,
            "upi_handle": r["upi"],
            "user_agent_hash": ua_hash,
        }

        intent_parsed = {
            "product_query": r["intent_raw"],
            "quantity": r["quantity"],
            "buyer_email": email_clean,
            "confidence": 0.90,
        }

        fail_msg = f"Multi-merchant coordinated fraud ring detected ({r['cluster']})"
        raw_escaped = escape_sql(r["intent_raw"])
        fp_json = json.dumps(fingerprint)
        ip_json = json.dumps(intent_parsed)

        tx_line = (
            f"  (\n"
            f"    '{tx_id}',\n"
            f"    '{r['merchant_id']}',\n"
            f"    '{raw_escaped}',\n"
            f"    '{ip_json}'::jsonb,\n"
            f"    '{r['product_id']}',\n"
            f"    {r['quantity']},\n"
            f"    {r['amount_paise']},\n"
            f"    'INR',\n"
            f"    '{fp_json}'::jsonb,\n"
            f"    {r['score']:.2f},\n"
            f"    'DENY',\n"
            f"    ARRAY['known_ring_cluster', 'velocity_anomaly']::text[],\n"
            f"    NULL,\n"
            f"    NULL,\n"
            f"    'DENIED',\n"
            f"    '{escape_sql(fail_msg)}',\n"
            f"    clock_timestamp() - interval '{20 - tx_counter} hours',\n"
            f"    clock_timestamp() - interval '{20 - tx_counter} hours' + interval '1 second'\n"
            f"  )"
        )
        tx_sql.append(tx_line)

        # Companion Audit Entries (3 steps, step 3 is_error: true)
        prev_h = "GENESIS"
        s1_input = f"Received buyer intent: '{r['intent_raw']}'"
        s1_output = "Intent parsed successfully"
        s1_reason = "Transaction initiated"
        s1_hash = compute_hash(prev_h, tx_id, 1, "INTENT_RECEIVED", s1_input, s1_output, s1_reason, False)

        audit_sql.append(
            f"  (\n"
            f"    gen_random_uuid(),\n"
            f"    '{tx_id}',\n"
            f"    'INTENT_RECEIVED',\n"
            f"    1,\n"
            f"    15,\n"
            f"    '{escape_sql(s1_input)}',\n"
            f"    '{escape_sql(s1_output)}',\n"
            f"    '{escape_sql(s1_reason)}',\n"
            f"    '{json.dumps({'step': 1})}'::jsonb,\n"
            f"    false,\n"
            f"    '{prev_h}',\n"
            f"    '{s1_hash}'\n"
            f"  )"
        )

        prev_h = s1_hash
        s2_input = f"SKU query: {r['intent_raw']}, quantity: {r['quantity']}"
        s2_output = f"Product resolved: {r['product_id']}, amount: {r['amount_paise']} paise"
        s2_reason = "Catalog item resolved"
        s2_hash = compute_hash(prev_h, tx_id, 2, "CATALOG_RESOLVED", s2_input, s2_output, s2_reason, False)

        audit_sql.append(
            f"  (\n"
            f"    gen_random_uuid(),\n"
            f"    '{tx_id}',\n"
            f"    'CATALOG_RESOLVED',\n"
            f"    2,\n"
            f"    19,\n"
            f"    '{escape_sql(s2_input)}',\n"
            f"    '{escape_sql(s2_output)}',\n"
            f"    '{escape_sql(s2_reason)}',\n"
            f"    '{json.dumps({'step': 2})}'::jsonb,\n"
            f"    false,\n"
            f"    '{prev_h}',\n"
            f"    '{s2_hash}'\n"
            f"  )"
        )

        prev_h = s2_hash
        s3_input = f"Graph traversal checking cross-merchant velocity and identity clustering for {r['cluster']}"
        s3_output = f"Trust score: {r['score']:.2f}, decision: DENY, risk factors: known_ring_cluster, velocity_anomaly"
        s3_reason = f"Cross-merchant syndicate detected spanning 3 merchants: {r['cluster']}"
        s3_hash = compute_hash(prev_h, tx_id, 3, "TRUST_CHECKED", s3_input, s3_output, s3_reason, True)

        audit_sql.append(
            f"  (\n"
            f"    gen_random_uuid(),\n"
            f"    '{tx_id}',\n"
            f"    'TRUST_CHECKED',\n"
            f"    3,\n"
            f"    38,\n"
            f"    '{escape_sql(s3_input)}',\n"
            f"    '{escape_sql(s3_output)}',\n"
            f"    '{escape_sql(s3_reason)}',\n"
            f"    '{json.dumps({'step': 3})}'::jsonb,\n"
            f"    true,\n"
            f"    '{prev_h}',\n"
            f"    '{s3_hash}'\n"
            f"  )"
        )

        tx_counter += 1

    content = [
        "-- Seed 03: Baseline Historical Transactions & Companion Audit Logs",
        "-- Pre-seeded with 14 benign transactions and 6 coordinated cross-merchant fraud ring transactions",
        "-- Companion audit entries have valid sequential SHA-256 hash chains starting from 'GENESIS'",
        "",
        "INSERT INTO transactions (",
        "  id,",
        "  merchant_id,",
        "  intent_raw,",
        "  intent_parsed,",
        "  product_id,",
        "  quantity,",
        "  amount_paise,",
        "  currency,",
        "  buyer_fingerprint,",
        "  trust_score,",
        "  trust_decision,",
        "  trust_risk_factors,",
        "  razorpay_order_id,",
        "  razorpay_payment_id,",
        "  status,",
        "  failure_reason,",
        "  created_at,",
        "  resolved_at",
        ") VALUES",
        ",\n".join(tx_sql),
        "ON CONFLICT (id) DO UPDATE SET",
        "  trust_score = EXCLUDED.trust_score,",
        "  trust_decision = EXCLUDED.trust_decision,",
        "  status = EXCLUDED.status;",
        "",
        "INSERT INTO audit_entries (",
        "  id,",
        "  transaction_id,",
        "  step_name,",
        "  step_number,",
        "  duration_ms,",
        "  input_summary,",
        "  output_summary,",
        "  reason,",
        "  raw_data,",
        "  is_error,",
        "  prev_entry_hash,",
        "  entry_hash",
        ") VALUES",
        ",\n".join(audit_sql),
        "ON CONFLICT (transaction_id, step_number) DO NOTHING;",
        ""
    ]

    out_file = Path(__file__).resolve().parent.parent / "seeds" / "03_transactions.sql"
    out_file.write_text("\n".join(content), encoding="utf-8")
    print(f"Generated {out_file} with {len(tx_sql)} transactions and {len(audit_sql)} audit entries.")

if __name__ == "__main__":
    generate_transactions()
