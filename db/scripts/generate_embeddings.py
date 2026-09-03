#!/usr/bin/env python3
"""
Generate 768-dimensional product embeddings and compile db/seeds/02_products.sql.

Uses Google Gemini `models/text-embedding-004` when GEMINI_API_KEY is available in the environment.
Falls back to deterministic, normalized 768-dimensional unit vector generation when offline,
guaranteeing reproducible tests without external network or API key dependencies (D-09).
"""

import os
import sys
import math
import hashlib
import random
from pathlib import Path

# 24 Canonical Seed Products across 3 Merchants (8 SKUs each)
APEX_MERCHANT_ID = "11111111-1111-1111-1111-111111111111"
URBAN_MERCHANT_ID = "22222222-2222-2222-2222-222222222222"
GOURMET_MERCHANT_ID = "33333333-3333-3333-3333-333333333333"

PRODUCTS = [
    # Apex Electronics (Consumer Tech)
    {
        "id": "10000000-0000-0000-0000-000000000001",
        "merchant_id": APEX_MERCHANT_ID,
        "name": "Sony WH-1000XM5",
        "description": "Industry-leading wireless noise canceling headphones with Auto NC Optimizer, 30-hour battery life, and crystal-clear hands-free calling.",
        "price_paise": 2999000,
        "currency": "INR",
        "stock": 25,
        "category": "Consumer Tech",
        "tags": ["audio", "headphones", "noise-canceling", "bluetooth"],
    },
    {
        "id": "10000000-0000-0000-0000-000000000002",
        "merchant_id": APEX_MERCHANT_ID,
        "name": "Keychron K2",
        "description": "Compact 75% layout wireless mechanical keyboard with Gateron G Pro mechanical switches, RGB backlighting, and Mac/Windows support.",
        "price_paise": 749900,
        "currency": "INR",
        "stock": 40,
        "category": "Consumer Tech",
        "tags": ["keyboard", "mechanical", "wireless", "peripherals"],
    },
    {
        "id": "10000000-0000-0000-0000-000000000003",
        "merchant_id": APEX_MERCHANT_ID,
        "name": "Anker 65W GaN Charger",
        "description": "Ultra-compact 3-port fast wall charger powered by GaN II technology, providing full-speed charging for laptops, tablets, and smartphones.",
        "price_paise": 299900,
        "currency": "INR",
        "stock": 65,
        "category": "Consumer Tech",
        "tags": ["charger", "gan", "fast-charging", "usb-c"],
    },
    {
        "id": "10000000-0000-0000-0000-000000000004",
        "merchant_id": APEX_MERCHANT_ID,
        "name": "Samsung Galaxy Watch 6",
        "description": "Advanced 44mm Bluetooth smartwatch featuring personalized sleep coaching, body composition analysis, sapphire crystal glass, and ECG monitoring.",
        "price_paise": 2199900,
        "currency": "INR",
        "stock": 18,
        "category": "Consumer Tech",
        "tags": ["smartwatch", "wearables", "fitness", "samsung"],
    },
    {
        "id": "10000000-0000-0000-0000-000000000005",
        "merchant_id": APEX_MERCHANT_ID,
        "name": "Logitech MX Master 3S",
        "description": "Performance wireless mouse featuring 8K DPI any-surface tracking, quiet clicks, and electromagnetic MagSpeed scrolling.",
        "price_paise": 899500,
        "currency": "INR",
        "stock": 30,
        "category": "Consumer Tech",
        "tags": ["mouse", "wireless", "ergonomic", "peripherals"],
    },
    {
        "id": "10000000-0000-0000-0000-000000000006",
        "merchant_id": APEX_MERCHANT_ID,
        "name": "Shure MV7 USB Mic",
        "description": "Broadcast-quality dynamic microphone with dual USB and XLR outputs, voice isolation technology, and customizable audio presets via ShurePlus MOTIV.",
        "price_paise": 2249900,
        "currency": "INR",
        "stock": 15,
        "category": "Consumer Tech",
        "tags": ["audio", "microphone", "podcast", "streaming"],
    },
    {
        "id": "10000000-0000-0000-0000-000000000007",
        "merchant_id": APEX_MERCHANT_ID,
        "name": "SanDisk 1TB SSD",
        "description": "Rugged extreme portable external NVMe SSD delivering up to 1050MB/s read speeds, IP55 water and dust resistance, and 2-meter drop protection.",
        "price_paise": 849900,
        "currency": "INR",
        "stock": 50,
        "category": "Consumer Tech",
        "tags": ["storage", "ssd", "portable", "usb-c"],
    },
    {
        "id": "10000000-0000-0000-0000-000000000008",
        "merchant_id": APEX_MERCHANT_ID,
        "name": "Dell UltraSharp 27\"",
        "description": "27-inch 4K UHD IPS USB-C Hub monitor with 99% sRGB coverage, 90W power delivery, RJ45 Ethernet connectivity, and height-adjustable stand.",
        "price_paise": 3499000,
        "currency": "INR",
        "stock": 12,
        "category": "Consumer Tech",
        "tags": ["monitor", "display", "4k", "usb-c"],
    },

    # Urban Threads (Apparel & Accessories)
    {
        "id": "20000000-0000-0000-0000-000000000001",
        "merchant_id": URBAN_MERCHANT_ID,
        "name": "Organic Cotton Tee",
        "description": "Premium 100% GOTS certified organic combed ring-spun cotton everyday crewneck t-shirt with reinforced stitching.",
        "price_paise": 99900,
        "currency": "INR",
        "stock": 120,
        "category": "Apparel",
        "tags": ["tshirt", "organic", "cotton", "basics"],
    },
    {
        "id": "20000000-0000-0000-0000-000000000002",
        "merchant_id": URBAN_MERCHANT_ID,
        "name": "Japanese Denim Jacket",
        "description": "Authentic 14oz raw selvedge denim trucker jacket crafted on vintage shuttle looms with antique brass buttons.",
        "price_paise": 799900,
        "currency": "INR",
        "stock": 25,
        "category": "Apparel",
        "tags": ["denim", "jacket", "selvedge", "outerwear"],
    },
    {
        "id": "20000000-0000-0000-0000-000000000003",
        "merchant_id": URBAN_MERCHANT_ID,
        "name": "All-Day Running Sneakers",
        "description": "Lightweight breathable engineered mesh athletic shoes featuring responsive dual-density EVA midsole cushioning and grippy rubber tread.",
        "price_paise": 449900,
        "currency": "INR",
        "stock": 45,
        "category": "Apparel",
        "tags": ["shoes", "sneakers", "running", "footwear"],
    },
    {
        "id": "20000000-0000-0000-0000-000000000004",
        "merchant_id": URBAN_MERCHANT_ID,
        "name": "Full-Grain Leather Belt",
        "description": "Artisan handcrafted full-grain vegetable-tanned leather belt with beveled edges and solid brushed brass buckle.",
        "price_paise": 199900,
        "currency": "INR",
        "stock": 60,
        "category": "Apparel",
        "tags": ["belt", "leather", "accessories"],
    },
    {
        "id": "20000000-0000-0000-0000-000000000005",
        "merchant_id": URBAN_MERCHANT_ID,
        "name": "Linen Casual Shirt",
        "description": "100% Normandy flax pure linen long-sleeve relaxed-fit shirt with mother-of-pearl buttons and camp collar.",
        "price_paise": 249900,
        "currency": "INR",
        "stock": 50,
        "category": "Apparel",
        "tags": ["shirt", "linen", "summer", "casual"],
    },
    {
        "id": "20000000-0000-0000-0000-000000000006",
        "merchant_id": URBAN_MERCHANT_ID,
        "name": "Canvas Commuter Backpack",
        "description": "Weather-resistant 20L heavy-duty waxed cotton canvas daypack with padded 15-inch laptop compartment and leather accents.",
        "price_paise": 399900,
        "currency": "INR",
        "stock": 35,
        "category": "Apparel",
        "tags": ["backpack", "canvas", "bags", "commuter"],
    },
    {
        "id": "20000000-0000-0000-0000-000000000007",
        "merchant_id": URBAN_MERCHANT_ID,
        "name": "Merino Wool Socks",
        "description": "3-pack premium Australian merino wool crew socks with seamless toe closure and moisture-wicking arch support.",
        "price_paise": 79900,
        "currency": "INR",
        "stock": 150,
        "category": "Apparel",
        "tags": ["socks", "merino-wool", "accessories"],
    },
    {
        "id": "20000000-0000-0000-0000-000000000008",
        "merchant_id": URBAN_MERCHANT_ID,
        "name": "Polarized Sunglasses",
        "description": "Handcrafted Italian cellulose acetate frame sunglasses featuring polarized Category 3 UV400 lenses with anti-reflective coating.",
        "price_paise": 299900,
        "currency": "INR",
        "stock": 40,
        "category": "Apparel",
        "tags": ["sunglasses", "eyewear", "polarized", "accessories"],
    },

    # Gourmet Direct (Specialty Foods & Pantry)
    {
        "id": "30000000-0000-0000-0000-000000000001",
        "merchant_id": GOURMET_MERCHANT_ID,
        "name": "Single-Origin Arabica Beans",
        "description": "Specialty grade washed Ethiopian Yirgacheffe whole bean coffee 500g with vibrant notes of bergamot, jasmine, and citrus.",
        "price_paise": 89900,
        "currency": "INR",
        "stock": 75,
        "category": "Specialty Foods",
        "tags": ["coffee", "arabica", "single-origin", "beverage"],
    },
    {
        "id": "30000000-0000-0000-0000-000000000002",
        "merchant_id": GOURMET_MERCHANT_ID,
        "name": "Wildflower Raw Honey",
        "description": "100% pure unprocessed unfiltered raw Himalayan wildflower honey 450g rich in natural pollen, enzymes, and antioxidants.",
        "price_paise": 49900,
        "currency": "INR",
        "stock": 90,
        "category": "Specialty Foods",
        "tags": ["honey", "raw", "organic", "pantry"],
    },
    {
        "id": "30000000-0000-0000-0000-000000000003",
        "merchant_id": GOURMET_MERCHANT_ID,
        "name": "Extra Virgin Olive Oil",
        "description": "First cold-pressed single-estate Koroneiki olive oil 750ml from Kalamata, Greece, with polyphenol-rich peppery finish.",
        "price_paise": 149900,
        "currency": "INR",
        "stock": 40,
        "category": "Specialty Foods",
        "tags": ["olive-oil", "extra-virgin", "cooking", "pantry"],
    },
    {
        "id": "30000000-0000-0000-0000-000000000004",
        "merchant_id": GOURMET_MERCHANT_ID,
        "name": "85% Dark Chocolate",
        "description": "Single-origin Arriba Nacional Ecuadorian artisanal bean-to-bar dark chocolate 80g with subtle floral and dried fig notes.",
        "price_paise": 39900,
        "currency": "INR",
        "stock": 110,
        "category": "Specialty Foods",
        "tags": ["chocolate", "dark-chocolate", "artisanal", "snacks"],
    },
    {
        "id": "30000000-0000-0000-0000-000000000005",
        "merchant_id": GOURMET_MERCHANT_ID,
        "name": "Ceremonial Grade Matcha",
        "description": "Stone-ground ceremonial first-harvest green tea powder 30g from Uji, Kyoto, offering vibrant emerald color and smooth umami taste.",
        "price_paise": 189900,
        "currency": "INR",
        "stock": 30,
        "category": "Specialty Foods",
        "tags": ["matcha", "green-tea", "ceremonial", "tea"],
    },
    {
        "id": "30000000-0000-0000-0000-000000000006",
        "merchant_id": GOURMET_MERCHANT_ID,
        "name": "Himalayan Rock Salt",
        "description": "Hand-mined unrefined pink Himalayan coarse mineral rock salt 350g in refillable ceramic mechanism glass grinder.",
        "price_paise": 44900,
        "currency": "INR",
        "stock": 100,
        "category": "Specialty Foods",
        "tags": ["salt", "spices", "pantry"],
    },
    {
        "id": "30000000-0000-0000-0000-000000000007",
        "merchant_id": GOURMET_MERCHANT_ID,
        "name": "Sourdough Crackers",
        "description": "Slow-fermented artisan sourdough crackers 200g made with organic wheat, cold-pressed olive oil, fresh rosemary, and sea salt flakes.",
        "price_paise": 42900,
        "currency": "INR",
        "stock": 85,
        "category": "Specialty Foods",
        "tags": ["crackers", "sourdough", "snacks", "artisanal"],
    },
    {
        "id": "30000000-0000-0000-0000-000000000008",
        "merchant_id": GOURMET_MERCHANT_ID,
        "name": "Roasted Almond Butter",
        "description": "All-natural stone-ground dry roasted California almond butter 350g with zero added sugars, palm oils, or preservatives.",
        "price_paise": 64900,
        "currency": "INR",
        "stock": 60,
        "category": "Specialty Foods",
        "tags": ["almond-butter", "nut-butter", "pantry", "healthy"],
    },
]


def generate_deterministic_embedding(category: str, name: str, description: str, dim: int = 768) -> list[float]:
    """
    Produce a deterministic, normalized 768-dimensional unit vector.
    
    Combines:
    1. Category basis seed (capturing semantic cluster cohesion)
    2. Item content seed (capturing distinct item features)
    """
    # 1. Deterministic category component
    cat_seed = int(hashlib.sha256(category.encode('utf-8')).hexdigest()[:8], 16)
    rng_cat = random.Random(cat_seed)
    cat_vec = [rng_cat.gauss(0.0, 1.0) for _ in range(dim)]

    # 2. Deterministic item component
    item_text = f"{name} {description}"
    item_seed = int(hashlib.sha256(item_text.encode('utf-8')).hexdigest()[:8], 16)
    rng_item = random.Random(item_seed)
    item_vec = [rng_item.gauss(0.0, 1.0) for _ in range(dim)]

    # 3. Blend: 60% category cluster + 40% item detail
    blended = [0.6 * c + 0.4 * it for c, it in zip(cat_vec, item_vec)]

    # 4. L2 Normalize to unit vector
    norm = math.sqrt(sum(x * x for x in blended))
    unit_vec = [round(x / norm, 6) for x in blended]
    return unit_vec


def get_gemini_embedding(text: str, api_key: str) -> list[float] | None:
    """Attempt to retrieve 768d embedding via Gemini API if available."""
    try:
        import google.generativeai as genai  # type: ignore
        genai.configure(api_key=api_key)
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text,
            task_type="retrieval_document",
        )
        embedding = result.get("embedding", [])
        if len(embedding) == 768:
            norm = math.sqrt(sum(x * x for x in embedding))
            return [round(x / norm, 6) for x in embedding]
    except Exception as e:
        print(f"Warning: Gemini API call failed: {e}. Falling back to deterministic seed.", file=sys.stderr)
    return None


def escape_sql_str(s: str) -> str:
    return s.replace("'", "''")


def build_sql(products_with_embeddings: list[dict]) -> str:
    lines = [
        "-- Seed 02: Initial Products Catalog & Precomputed 768d Vector Embeddings",
        "-- Pre-seeded across 3 merchants with integer paise pricing and unit embeddings",
        "",
        "INSERT INTO products (",
        "  id,",
        "  merchant_id,",
        "  name,",
        "  description,",
        "  price_paise,",
        "  currency,",
        "  stock,",
        "  category,",
        "  tags,",
        "  embedding,",
        "  is_active",
        ") VALUES",
    ]

    value_blocks = []
    for p in products_with_embeddings:
        tags_sql = "ARRAY[" + ", ".join(f"'{escape_sql_str(t)}'" for t in p["tags"]) + "]::text[]"
        vec_str = "[" + ", ".join(str(x) for x in p["embedding"]) + "]"
        block = (
            f"  (\n"
            f"    '{p['id']}',\n"
            f"    '{p['merchant_id']}',\n"
            f"    '{escape_sql_str(p['name'])}',\n"
            f"    '{escape_sql_str(p['description'])}',\n"
            f"    {p['price_paise']},\n"
            f"    '{p['currency']}',\n"
            f"    {p['stock']},\n"
            f"    '{escape_sql_str(p['category'])}',\n"
            f"    {tags_sql},\n"
            f"    '{vec_str}'::vector,\n"
            f"    true\n"
            f"  )"
        )
        value_blocks.append(block)

    lines.append(",\n".join(value_blocks))
    lines.append("ON CONFLICT (id) DO UPDATE SET")
    lines.append("  merchant_id = EXCLUDED.merchant_id,")
    lines.append("  name = EXCLUDED.name,")
    lines.append("  description = EXCLUDED.description,")
    lines.append("  price_paise = EXCLUDED.price_paise,")
    lines.append("  currency = EXCLUDED.currency,")
    lines.append("  stock = EXCLUDED.stock,")
    lines.append("  category = EXCLUDED.category,")
    lines.append("  tags = EXCLUDED.tags,")
    lines.append("  embedding = EXCLUDED.embedding,")
    lines.append("  is_active = EXCLUDED.is_active,")
    lines.append("  updated_at = clock_timestamp();")
    lines.append("")
    return "\n".join(lines)


def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    products_with_embeddings = []

    print(f"Generating embeddings for {len(PRODUCTS)} products...")
    for idx, p in enumerate(PRODUCTS, 1):
        full_text = f"{p['name']}. {p['description']}"
        embedding = None
        if api_key:
            embedding = get_gemini_embedding(full_text, api_key)
        if embedding is None:
            embedding = generate_deterministic_embedding(p["category"], p["name"], p["description"])
        
        # Validate dimensionality
        if len(embedding) != 768:
            raise ValueError(f"Expected 768 dimensions for product {p['name']}, got {len(embedding)}")

        p_copy = dict(p)
        p_copy["embedding"] = embedding
        products_with_embeddings.append(p_copy)
        print(f"  [{idx:02d}/24] {p['name']} ({p['category']}) -> 768d vector ready")

    output_path = Path(__file__).resolve().parent.parent / "seeds" / "02_products.sql"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sql_content = build_sql(products_with_embeddings)
    output_path.write_text(sql_content, encoding="utf-8")
    print(f"Successfully generated {output_path} ({len(products_with_embeddings)} products).")


if __name__ == "__main__":
    main()

