#!/usr/bin/env npx tsx
/**
 * Standalone programmatic migration and seed runner (D-01).
 * Sequentially applies schema.sql and seed files using @nexus/db client.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDbPool, closeDbPool } from '@nexus/db';

const MIGRATION_FILES = [
  'schema.sql',
  'seeds/01_merchants.sql',
  'seeds/02_products.sql',
  'seeds/03_transactions.sql',
];

async function runMigrations(): Promise<void> {
  const pool = getDbPool();
  const dbDir = path.resolve(__dirname, '..');

  console.log('🚀 Starting Nexus database migrations...\n');
  const totalStartTime = performance.now();

  const client = await pool.connect();

  try {
    for (const relativePath of MIGRATION_FILES) {
      const fullPath = path.join(dbDir, relativePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Migration file not found: ${fullPath}`);
      }

      const sql = fs.readFileSync(fullPath, 'utf-8');
      const fileStartTime = performance.now();

      console.log(`[migrate] Executing ${relativePath}...`);
      await client.query(sql);

      const elapsedMs = (performance.now() - fileStartTime).toFixed(2);
      console.log(`  ✓ Successfully applied ${relativePath} in ${elapsedMs}ms`);
    }

    const totalElapsedMs = (performance.now() - totalStartTime).toFixed(2);
    console.log(`\n🎉 All migrations and seeds applied successfully in ${totalElapsedMs}ms.`);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await closeDbPool();
  }
}

runMigrations().catch((err) => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
