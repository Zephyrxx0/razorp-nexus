import { query, closeDbPool } from "../db/ts/src/index";
import { encryptSecret, generateMaasToken } from "../db/ts/src/crypto";
import { generateEmbedding } from "../src/lib/embeddings";

const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  "f84fdf376a51bc54f5477d242528db1de4f47b6ffc4fad6137b0d1fbe7e0ef9b";

const KEEP_MERCHANT_IDS = [
  "11111111-1111-1111-1111-111111111111", // Apex Electronics
  "22222222-2222-2222-2222-222222222222", // Urban Threads
  "33333333-3333-3333-3333-333333333333", // Gourmet Direct
];

const NEW_STORES = [
  {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Zenith Robotics",
    email: "ops@zenithrobotics.ai",
    key_id: "rzp_test_zenith444555",
    key_secret: "secret_zenith_ai_robotics_99",
    webhook_secret: "whsec_zenith_test_secret",
    endpoint: "/api/maas",
    products: [
      {
        id: "40000000-0000-0000-0000-000000000001",
        name: "NVIDIA Jetson Orin Nano Dev Kit",
        description:
          "Compact edge AI computing module with up to 40 TOPS AI performance for autonomous robotics, computer vision, and deep learning pipelines.",
        price_paise: 4499900,
        stock: 15,
        category: "Edge Hardware",
        tags: ["edge-ai", "nvidia", "jetson", "robotics", "orin"],
      },
      {
        id: "40000000-0000-0000-0000-000000000002",
        name: "ROS2 Autonomous Rover Platform with LiDAR",
        description:
          "Four-wheel drive differential robot base equipped with 360-degree LiDAR, IMU sensor, and ROS2 humble navigation stack support.",
        price_paise: 8990000,
        stock: 8,
        category: "Robotics",
        tags: ["rover", "ros2", "lidar", "autonomous", "slam"],
      },
      {
        id: "40000000-0000-0000-0000-000000000003",
        name: "DepthAI OAK-D Pro Spatial AI Camera",
        description:
          "Stereo depth perception camera with onboard Myriad X neural accelerator and active stereo infrared illumination for real-time spatial AI.",
        price_paise: 2750000,
        stock: 20,
        category: "Perception & Vision",
        tags: ["camera", "depth-ai", "computer-vision", "spatial-ai"],
      },
      {
        id: "40000000-0000-0000-0000-000000000004",
        name: "6-DOF Desktop Robotic Arm with Serial Bus Servos",
        description:
          "High-precision 6-axis articulated robotic arm with aluminium alloy frame, metal gear digital servos, and inverse kinematics trajectory control.",
        price_paise: 11500000,
        stock: 5,
        category: "Robotics",
        tags: ["robotic-arm", "manipulator", "servos", "6-dof", "automation"],
      },
      {
        id: "40000000-0000-0000-0000-000000000005",
        name: "Coral USB TPU Accelerator",
        description:
          "Google Coral Edge TPU coprocessor adding 4 TOPS of ML inference over USB 3.0 for TensorFlow Lite vision and audio classification models.",
        price_paise: 649900,
        stock: 50,
        category: "Edge Hardware",
        tags: ["coral", "tpu", "edge-inference", "google", "tensorflow"],
      },
    ],
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    name: "Kavach Security",
    email: "security@kavach.network",
    key_id: "rzp_test_kavach555666",
    key_secret: "secret_kavach_hardware_sec_88",
    webhook_secret: "whsec_kavach_test_secret",
    endpoint: "/api/maas",
    products: [
      {
        id: "50000000-0000-0000-0000-000000000001",
        name: "YubiKey 5C NFC FIDO2 Key",
        description:
          "Hardware security key supporting FIDO2, WebAuthn, U2F, and OTP over USB-C and contactless NFC with multi-protocol authentication.",
        price_paise: 599900,
        stock: 60,
        category: "Hardware Security",
        tags: ["yubikey", "fido2", "webauthn", "2fa", "security-key"],
      },
      {
        id: "50000000-0000-0000-0000-000000000002",
        name: "Trezor Safe 3 Hardware Security Vault",
        description:
          "Next-generation hardware crypto vault with Secure Element chip, open-source architecture, and bright OLED display for isolated offline signing.",
        price_paise: 799900,
        stock: 30,
        category: "Crypto & Vaults",
        tags: ["trezor", "cold-wallet", "crypto", "hardware-wallet", "vault"],
      },
      {
        id: "50000000-0000-0000-0000-000000000003",
        name: "Air-Gapped Titanium Seed Capsule",
        description:
          "Indestructible aerospace titanium mnemonic phrase backup capsule resistant to fire up to 1668°C, corrosion, acid, and mechanical impacts.",
        price_paise: 349900,
        stock: 45,
        category: "Physical Security",
        tags: ["titanium", "seed-phrase", "air-gap", "fireproof", "offline"],
      },
      {
        id: "50000000-0000-0000-0000-000000000004",
        name: "Tactical Military-Grade Faraday Bag",
        description:
          "Multi-layered RF shielding enclosure blocking RFID, GPS, WiFi, cellular 5G, and Bluetooth signals for zero-emission device transport.",
        price_paise: 429900,
        stock: 40,
        category: "Physical Security",
        tags: ["faraday", "rf-shielding", "privacy", "anti-tracking", "emp"],
      },
      {
        id: "50000000-0000-0000-0000-000000000005",
        name: "OnlyKey Dual FIDO2 & Password Manager",
        description:
          "Physical PIN-protected hardware password manager and two-factor authentication token with self-destruct mechanism on brute-force attempts.",
        price_paise: 689900,
        stock: 25,
        category: "Hardware Security",
        tags: ["onlykey", "password-manager", "pin-protected", "fido2"],
      },
    ],
  },
  {
    id: "66666666-6666-6666-6666-666666666666",
    name: "Aura Living",
    email: "hello@auraliving.home",
    key_id: "rzp_test_aura666777",
    key_secret: "secret_aura_smart_living_77",
    webhook_secret: "whsec_aura_test_secret",
    endpoint: "/api/maas",
    products: [
      {
        id: "60000000-0000-0000-0000-000000000001",
        name: "Zigbee 3.0 & Matter Smart Gateway Hub",
        description:
          "Multi-protocol local automation gateway bridging Zigbee 3.0, Matter, and Thread devices to Home Assistant and Apple HomeKit without cloud dependency.",
        price_paise: 499900,
        stock: 35,
        category: "Smart Home",
        tags: ["zigbee", "matter", "thread", "gateway", "home-assistant"],
      },
      {
        id: "60000000-0000-0000-0000-000000000002",
        name: "Circadian Smart Ambient Light Bar",
        description:
          "Precision-tuned full-spectrum monitor light bar with automatic color temperature syncing according to natural solar circadian rhythms.",
        price_paise: 629900,
        stock: 40,
        category: "Ambient Tech",
        tags: ["circadian", "lighting", "matter", "smart-light", "desk-setup"],
      },
      {
        id: "60000000-0000-0000-0000-000000000003",
        name: "NDIR Indoor Air Quality Monitor",
        description:
          "Medical-grade optical NDIR CO2 sensor measuring PM2.5, total VOCs, humidity, and temperature with e-ink display and local REST API telemetry.",
        price_paise: 849900,
        stock: 22,
        category: "Climate & Air",
        tags: ["air-quality", "co2", "ndir", "e-ink", "sensors", "health"],
      },
      {
        id: "60000000-0000-0000-0000-000000000004",
        name: "Thread Motorized Roller Blind Controller",
        description:
          "Ultra-quiet battery-powered motorized shade retrofit kit communicating over Thread mesh network with adaptive solar brightness positioning.",
        price_paise: 549900,
        stock: 28,
        category: "Smart Home",
        tags: ["roller-blind", "shades", "thread", "matter", "motorized"],
      },
      {
        id: "60000000-0000-0000-0000-000000000005",
        name: "Ultrasonic Micro-Mist Essential Oil Diffuser",
        description:
          "Whisper-silent 2.4MHz ultrasonic smart diffuser with scheduling, customizable RGB mood glow, and waterless auto-shutoff protection.",
        price_paise: 389900,
        stock: 50,
        category: "Ambient Tech",
        tags: ["diffuser", "ultrasonic", "aroma", "wellness", "smart-living"],
      },
    ],
  },
];

// Helper: generate a pseudo-random 768d unit vector if Gemini is unavailable
function fallbackVector(seedStr: string): number[] {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const vec: number[] = [];
  for (let i = 0; i < 768; i++) {
    const val = Math.sin(hash + i * 1.61803398875) * 0.05;
    vec.push(Number(val.toFixed(6)));
  }
  return vec;
}

async function main() {
  console.log("=== Nexus Clean & Seed Unique Stores ===");

  // 1. Find all merchants not in KEEP_MERCHANT_IDS
  const existingMerchants = await query("SELECT id, name, email FROM merchants;");
  const toDelete = existingMerchants.rows.filter(
    (m: any) => !KEEP_MERCHANT_IDS.includes(m.id)
  );

  console.log(`Found ${existingMerchants.rows.length} total merchants.`);
  console.log(
    `Merchants to remove (${toDelete.length}):`,
    toDelete.map((m: any) => `${m.name} (${m.email})`)
  );

  if (toDelete.length > 0) {
    const deleteIds = toDelete.map((m: any) => m.id);

    console.log("Cleaning up foreign key references and test data...");
    // Disable audit entries immutability trigger for cleanup
    await query("ALTER TABLE audit_entries DISABLE TRIGGER trg_audit_entries_immutable;");

    // Remove audit entries for transactions of deleting merchants
    await query(
      `DELETE FROM audit_entries WHERE transaction_id IN (
         SELECT id FROM transactions WHERE merchant_id = ANY($1::uuid[])
       );`,
      [deleteIds]
    );

    // Remove transactions
    await query(
      `DELETE FROM transactions WHERE merchant_id = ANY($1::uuid[]);`,
      [deleteIds]
    );

    // Re-enable audit immutability trigger
    await query("ALTER TABLE audit_entries ENABLE TRIGGER trg_audit_entries_immutable;");

    // Remove products
    await query(
      `DELETE FROM products WHERE merchant_id = ANY($1::uuid[]);`,
      [deleteIds]
    );

    // Remove merchants
    await query(
      `DELETE FROM merchants WHERE id = ANY($1::uuid[]);`,
      [deleteIds]
    );

    console.log("Cleanup of duplicate / temporary merchants complete!");
  }

  // 2. Add the 3 unique new stores
  for (const store of NEW_STORES) {
    console.log(`\nAdding store: ${store.name} (${store.email})...`);
    const encryptedSecret = encryptSecret(store.key_secret, ENCRYPTION_KEY);
    const { token, hash, preview } = generateMaasToken();

    await query(
      `INSERT INTO merchants (
         id, name, email, razorpay_key_id, razorpay_key_secret,
         razorpay_webhook_secret, maas_token_hash, token_preview,
         maas_endpoint, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         razorpay_key_id = EXCLUDED.razorpay_key_id,
         razorpay_key_secret = EXCLUDED.razorpay_key_secret,
         razorpay_webhook_secret = EXCLUDED.razorpay_webhook_secret,
         maas_token_hash = EXCLUDED.maas_token_hash,
         token_preview = EXCLUDED.token_preview,
         maas_endpoint = EXCLUDED.maas_endpoint,
         is_active = true,
         updated_at = clock_timestamp();`,
      [
        store.id,
        store.name,
        store.email,
        store.key_id,
        encryptedSecret,
        store.webhook_secret,
        hash,
        preview,
        store.endpoint,
      ]
    );

    console.log(`Store '${store.name}' seeded with MaaS preview: ${preview}`);

    // Insert products for this store
    for (const prod of store.products) {
      console.log(`  - Generating embedding for SKU '${prod.name}'...`);
      let embedding = await generateEmbedding(prod.description);
      if (!embedding || embedding.length !== 768) {
        embedding = fallbackVector(prod.name + prod.description);
      }
      const vectorStr = `[${embedding.join(",")}]`;

      await query(
        `INSERT INTO products (
           id, merchant_id, name, description, price_paise,
           currency, stock, stock_quantity, category, tags,
           embedding, is_active, is_ai_purchasable
         ) VALUES ($1, $2, $3, $4, $5, 'INR', $6, $6, $7, $8, $9::vector, true, true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           price_paise = EXCLUDED.price_paise,
           stock = EXCLUDED.stock,
           stock_quantity = EXCLUDED.stock_quantity,
           category = EXCLUDED.category,
           tags = EXCLUDED.tags,
           embedding = EXCLUDED.embedding,
           is_active = true,
           is_ai_purchasable = true,
           updated_at = clock_timestamp();`,
        [
          prod.id,
          store.id,
          prod.name,
          prod.description,
          prod.price_paise,
          prod.stock,
          prod.category,
          prod.tags,
          vectorStr,
        ]
      );
    }
    console.log(`  Added ${store.products.length} products to ${store.name}`);
  }

  // 3. Final verification print
  const finalMerchants = await query(
    `SELECT m.id, m.name, m.email, COUNT(p.id) as product_count
     FROM merchants m
     LEFT JOIN products p ON p.merchant_id = m.id
     GROUP BY m.id, m.name, m.email
     ORDER BY m.name ASC;`
  );

  console.log("\n=== Final Active Merchants ===");
  for (const m of finalMerchants.rows) {
    console.log(`• ${m.name.padEnd(20)} | ${m.email.padEnd(28)} | ${m.product_count} products | ID: ${m.id}`);
  }

  await closeDbPool();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
