import { NextRequest, NextResponse } from "next/server";
import { query, verifyAuditChain, AuditEntry } from "@nexus/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { transaction_id: string } }
): Promise<NextResponse> {
  const { transaction_id } = params;

  const result = await query<AuditEntry>(
    `SELECT 
       id, transaction_id, step_name, step_number, timestamp, duration_ms,
       input_summary, output_summary, reason, raw_data, is_error,
       prev_entry_hash, entry_hash
     FROM audit_entries
     WHERE transaction_id = $1
     ORDER BY step_number ASC`,
    [transaction_id]
  );

  const rows = result.rows || [];

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: "NOT_FOUND",
        message: "No audit trail found for transaction_id",
      },
      { status: 404 }
    );
  }

  // Normalize entry types ensuring strict types for hash continuity verification
  const normalizedEntries: AuditEntry[] = rows.map((r) => ({
    ...r,
    step_number: Number(r.step_number),
    duration_ms: Number(r.duration_ms ?? 0),
    is_error: Boolean(r.is_error),
  }));

  const isChainValid = verifyAuditChain(normalizedEntries);

  return NextResponse.json(
    {
      transaction_id,
      entry_count: normalizedEntries.length,
      is_sealed: true,
      hash_chain_valid: isChainValid,
      chain_valid: isChainValid,
      audit_trail: normalizedEntries,
    },
    { status: 200 }
  );
}
