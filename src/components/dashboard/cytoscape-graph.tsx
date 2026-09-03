"use client"

import React, { useEffect, useRef } from "react"
import cytoscape, { Core } from "cytoscape"
// @ts-ignore
import coseBilkent from "cytoscape-cose-bilkent"

if (typeof window !== "undefined") {
  try {
    cytoscape.use(coseBilkent)
  } catch (e) {
    // Avoid re-registration error during Next.js hot reload
  }
}

interface CytoscapeGraphProps {
  elements: {
    nodes: any[]
    edges: any[]
  }
  highlightedRingId?: string | null
  highlightRings?: boolean
  selectedNodeId?: string | null
  onNodeClick: (nodeData: any) => void
}

export function CytoscapeGraph({
  elements,
  highlightedRingId,
  highlightRings,
  selectedNodeId,
  onNodeClick,
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Transform elements for Cytoscape if needed
    const nodes = (elements?.nodes || []).map((n) => {
      const data = n.data || n
      const score = data.trust_score !== undefined ? data.trust_score : 80
      const inRing = Boolean(data.in_ring || data.ring_id)

      let color = "#10b981" // Emerald ALLOW
      if (inRing || score < 40) {
        color = "#ef4444" // Red DENY
      } else if (score < 70) {
        color = "#f59e0b" // Amber REVIEW
      }

      return {
        data: {
          ...data,
          color,
          label: data.label || data.id?.slice(0, 10) || "node",
        },
      }
    })

    const edges = (elements?.edges || []).map((e) => ({
      data: e.data || e,
    }))

    const cy = cytoscape({
      container: containerRef.current,
      elements: { nodes, edges },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            color: "#f4f4f5",
            "font-size": "11px",
            "font-family": "monospace",
            "text-valign": "bottom",
            "text-margin-y": 6,
            width: 28,
            height: 28,
            "border-width": 2,
            "border-color": "#27272a",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#3f3f46",
            "curve-style": "bezier",
            opacity: 0.6,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 4,
            "border-color": "#ffffff",
            width: 34,
            height: 34,
          },
        },
        {
          selector: ".ring-member",
          style: {
            "border-width": 4,
            "border-color": "#ef4444",
            "background-color": "#ef4444",
            "z-index": 99,
          },
        },
        {
          selector: ".dimmed",
          style: {
            opacity: 0.15,
          },
        },
      ],
      layout: {
        name: "cose-bilkent",
        animate: false,
        nodeRepulsion: 5000,
        idealEdgeLength: 70,
        gravity: 0.25,
        numIter: 800,
      } as any,
    })

    cy.on("tap", "node", (evt) => {
      const node = evt.target
      onNodeClick(node.data())
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
    }
  }, [elements])

  // Handle ring highlighting and camera focus
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.batch(() => {
      cy.elements().removeClass("ring-member dimmed")

      if (highlightedRingId || highlightRings) {
        cy.nodes().each((node) => {
          const inRing = Boolean(node.data("in_ring") || node.data("ring_id"))
          const matchesSpecificRing = highlightedRingId
            ? node.data("ring_id") === highlightedRingId
            : inRing

          if (matchesSpecificRing) {
            node.addClass("ring-member")
          } else {
            node.addClass("dimmed")
          }
        })

        cy.edges().addClass("dimmed")
      }
    })

    // If a specific ring is selected, animate camera to center on it
    if (highlightedRingId) {
      const ringNodes = cy.nodes(".ring-member")
      if (ringNodes.length > 0) {
        cy.animate({
          fit: { eles: ringNodes, padding: 60 },
          duration: 500,
        })
      }
    }
  }, [highlightedRingId, highlightRings])

  return (
    <div
      ref={containerRef}
      className="w-full h-[600px] bg-zinc-950 rounded-lg border border-zinc-800 relative shadow-inner"
    />
  )
}
