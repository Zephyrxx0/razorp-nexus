const crypto = require("crypto");
const { Client } = require("pg");

async function seed() {
  const client = new Client({
    connectionString: "postgresql://nexus:nexus_dev_password@localhost:5432/nexus"
  });
  await client.connect();

  const m1Token = "maas_live_0123456789abcdef0123456789abcdef";
  const m1Hash = crypto.createHash("sha256").update(m1Token).digest("hex");
  const m1Res = await client.query(`
    INSERT INTO merchants (name, email, razorpay_key_id, razorpay_key_secret_encrypted, maas_token_hash, maas_token_preview)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [
    "Apex Electronics",
    "merchant@apex.io",
    "rzp_test_ApexStore10",
    "001122:334455:667788",
    m1Hash,
    "maas_live_0123...cdef"
  ]);
  const m1Id = m1Res.rows[0].id;

  const m2Token = "maas_live_fedcba9876543210fedcba9876543210";
  const m2Hash = crypto.createHash("sha256").update(m2Token).digest("hex");
  const m2Res = await client.query(`
    INSERT INTO merchants (name, email, razorpay_key_id, razorpay_key_secret_encrypted, maas_token_hash, maas_token_preview)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [
    "Zenith Apparel",
    "store@zenith.io",
    "rzp_test_ZenithApparel20",
    "001122:334455:667788",
    m2Hash,
    "maas_live_fedc...3210"
  ]);
  const m2Id = m2Res.rows[0].id;

  // Products for Apex
  await client.query(`
    INSERT INTO products (merchant_id, name, description, price_paise, stock_quantity, category, is_ai_purchasable)
    VALUES
      ($1, $2, $3, 499900, 35, $4, true),
      ($1, $5, $6, 749900, 18, $7, true),
      ($1, $8, $9, 199900, 60, $10, true)
  `, [
    m1Id,
    "Noise-Cancelling Headphones Pro",
    "High-fidelity active noise-cancelling wireless headphones with 40-hour battery",
    "Audio",
    "Ergonomic Mechanical Keyboard",
    "Low-profile mechanical switches with per-key RGB backlighting and Bluetooth 5.3",
    "Peripherals",
    "USB-C GaN Rapid Charger 100W",
    "Ultra-compact fast power adapter with multi-port power delivery 3.0",
    "Accessories"
  ]);

  // Products for Zenith
  await client.query(`
    INSERT INTO products (merchant_id, name, description, price_paise, stock_quantity, category, is_ai_purchasable)
    VALUES
      ($1, $2, $3, 1299900, 12, $4, true),
      ($1, $5, $6, 549900, 24, $7, true)
  `, [
    m2Id,
    "Waterproof All-Weather Trench Coat",
    "Breathable GORE-TEX all-weather technical jacket with sealed zippers",
    "Outerwear",
    "Merino Wool Thermal Sweater",
    "100% ultrafine merino wool crewneck pullover with temperature regulation",
    "Knitwear"
  ]);

  console.log("Seeded demo merchants successfully:", m1Id, m2Id);
  await client.end();
}

seed().catch(err => {
  console.error("Seeding error:", err);
  process.exit(1);
});
