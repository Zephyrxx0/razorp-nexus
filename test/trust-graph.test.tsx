import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import { NodeInspectorSheet } from "@/components/dashboard/node-inspector-sheet"

describe("Trust Graph Visualizer Components (DASH-04)", () => {
  it("renders NodeInspectorSheet with entity score and neighbor signals", () => {
    const mockNode = {
      id: "hash_email_buyer_1",
      entity_type: "email_hash",
      trust_score: 95,
      degree: 4,
      in_ring: false,
      neighbors: ["ip_subnet:192.168.1.0/24", "device:dev_abc"],
      transactions: ["txn_001", "txn_002"],
    }

    render(
      <NodeInspectorSheet
        open={true}
        onOpenChange={() => {}}
        nodeData={mockNode}
      />
    )

    expect(screen.getByText("Entity Signal Inspector")).toBeDefined()
    expect(screen.getByText("hash_email_buyer_1")).toBeDefined()
    expect(screen.getByText("95 / 100")).toBeDefined()
    expect(screen.getByText("ALLOW")).toBeDefined()
    expect(screen.getByText("1-Hop Neighbors (2)")).toBeDefined()
    expect(screen.getByText("ip_subnet:192.168.1.0/24")).toBeDefined()
  })

  it("renders fraud ring alert when node belongs to a ring cluster", () => {
    const mockRingNode = {
      id: "hash_fraud_ring_buyer",
      entity_type: "email_hash",
      trust_score: 15,
      degree: 6,
      in_ring: true,
      ring_id: "ring_syndicate_01",
      neighbors: ["ip_subnet:10.0.0.0/24"],
    }

    render(
      <NodeInspectorSheet
        open={true}
        onOpenChange={() => {}}
        nodeData={mockRingNode}
      />
    )

    expect(screen.getByText("Multi-Merchant Fraud Ring Detected")).toBeDefined()
    expect(screen.getByText("Cluster ID: ring_syndicate_01")).toBeDefined()
    expect(screen.getByText("DENY")).toBeDefined()
  })
})
