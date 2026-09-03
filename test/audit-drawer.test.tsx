import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { AuditDrawer } from "@/components/dashboard/audit-drawer"

describe("AuditDrawer Component (DASH-03)", () => {
  const sampleTransaction = {
    id: "txn_test_audit_100",
    buyer_email_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    amount_paise: 399900,
    status: "SUCCESS",
    razorpay_order_id: "order_test_987654",
    trust_score: 88,
    decision: "ALLOW" as const,
    risk_factors: ["clean_network"],
    created_at: new Date().toISOString(),
    payload_hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    previous_hash: "0000001234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    step_data: {
      steps: [
        {
          step_index: 1,
          tool_name: "parse_intent",
          duration_ms: 150,
          status: "success" as const,
          rationale: "Parsed purchase intent for 1 unit.",
        },
        {
          step_index: 2,
          tool_name: "resolve_catalog",
          duration_ms: 30,
          status: "success" as const,
          rationale: "Matched catalog product.",
        },
        {
          step_index: 3,
          tool_name: "check_trust_graph",
          duration_ms: 60,
          status: "success" as const,
          rationale: "Trust score evaluated at 88.",
        },
        {
          step_index: 4,
          tool_name: "create_razorpay_order",
          duration_ms: 200,
          status: "success" as const,
          rationale: "Created Razorpay test order.",
        },
        {
          step_index: 5,
          tool_name: "capture_razorpay_payment",
          duration_ms: 100,
          status: "success" as const,
          rationale: "Captured payment.",
        },
        {
          step_index: 6,
          tool_name: "log_audit_entry",
          duration_ms: 10,
          status: "success" as const,
          rationale: "Sealed SHA-256 hash log persisted.",
        },
      ],
    },
  }

  it("renders transaction audit trail with 6-step tool chain", () => {
    render(
      <AuditDrawer
        open={true}
        onOpenChange={() => {}}
        transaction={sampleTransaction}
      />
    )

    expect(screen.getByText("Transaction Audit Trail")).toBeDefined()
    expect(screen.getByText("Hash Chain Verified (SHA-256)")).toBeDefined()
    expect(screen.getByText("1. parse_intent")).toBeDefined()
    expect(screen.getByText("2. resolve_catalog")).toBeDefined()
    expect(screen.getByText("3. check_trust_graph")).toBeDefined()
    expect(screen.getByText("4. create_razorpay_order")).toBeDefined()
    expect(screen.getByText("5. capture_razorpay_payment")).toBeDefined()
    expect(screen.getByText("6. log_audit_entry")).toBeDefined()
  })

  it("allows downloading the sealed audit trail JSON", () => {
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => "blob:test")
    global.URL.revokeObjectURL = vi.fn()

    render(
      <AuditDrawer
        open={true}
        onOpenChange={() => {}}
        transaction={sampleTransaction}
      />
    )

    const downloadBtn = screen.getByRole("button", {
      name: /download sealed audit/i,
    })
    expect(downloadBtn).toBeDefined()
    fireEvent.click(downloadBtn)

    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })
})
