# Quick Task Summary: Settings Tab cURL Commands & Store Unregister/Delete

## What Was Done
1. **Merchant API Endpoints (`src/app/api/merchant/[id]/route.ts`)**:
   - `GET`: Returns merchant info, live inventory/transaction/audit counts, and sample product name.
   - `DELETE`: Executes atomic PostgreSQL cascade deletion with trigger bypass (`SET LOCAL session_replication_role = 'replica'`) to completely wipe audit logs, transactions, products, and the merchant record.
2. **Token Regeneration Endpoint (`src/app/api/merchant/[id]/token/route.ts`)**:
   - `POST`: Generates a fresh MaaS token, updates hash & preview in database, and returns the token.
3. **Settings Dashboard UI (`src/app/dashboard/settings/page.tsx`)**:
   - Integrated live merchant profile and stats cards.
   - Added MaaS cURL command terminal blocks for autonomous transact and catalog discovery with copy-to-clipboard functionality.
   - Added on-demand token regeneration.
   - Added Danger Zone with confirmation dialog requiring the user to type the store name before permanently deleting and purging all store data from the DB.
4. **Validation**:
   - Tested full lifecycle with real database insertions and verified complete wipe.
   - Passed all 106 Vitest tests and all 60 Python tests.
   - Production Next.js build completed with code 0.
