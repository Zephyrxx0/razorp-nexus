"use client"

import React, { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import {
  Network,
  RefreshCw,
  AlertTriangle,
  Layers,
  Sparkles,
  Info,
  Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { NodeInspectorSheet } from "@/components/dashboard/node-inspector-sheet"

// Dynamic import with SSR disabled to prevent Canvas 'window is not defined' during server render
const CytoscapeGraph = dynamic(
  () =>
    import("@/components/dashboard/cytoscape-graph").then(
      (mod) => mod.CytoscapeGraph
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-center text-zinc-500 font-mono text-sm">
        Initializing Force-Directed Canvas...
      </div>
    ),
  }
)

interface Ring {
  ring_id: string
  risk_score?: number
  risk_level?: string
  members_count?: number
  member_nodes_count?: number
  merchants_spanned?: string[]
  affected_merchants?: string[]
  nodes?: string[]
}

export default function TrustGraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({
    nodes: [],
    edges: [],
  })
  const [rings, setRings] = useState<Ring[]>([])
  const [loading, setLoading] = useState(true)
  const [highlightRings, setHighlightRings] = useState(false)
  const [selectedRingId, setSelectedRingId] = useState<string>("")
  const [inspectorNode, setInspectorNode] = useState<any | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const loadGraph = async () => {
    setLoading(true)
    try {
      const [graphRes, ringsRes] = await Promise.all([
        fetch("/api/trust/graph"),
        fetch("/api/trust/rings"),
      ])

      if (graphRes.ok) {
        const gData = await graphRes.json()
        const elements = gData.elements || gData
        setGraphData({
          nodes: elements.nodes || [],
          edges: elements.edges || [],
        })
      }

      if (ringsRes.ok) {
        const rData = await ringsRes.json()
        const ringList = Array.isArray(rData) ? rData : rData.rings || []
        setRings(ringList)
      }
    } catch (e) {
      console.error("Failed to load trust graph:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGraph()
  }, [])

  const handleNodeClick = (nodeData: any) => {
    setInspectorNode(nodeData)
    setInspectorOpen(true)
  }

  const nodeCount = graphData.nodes.length
  const edgeCount = graphData.edges.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Trust Graph Network
            </h1>
            <Badge variant="allow" className="text-[11px] font-mono">
              In-Memory NetworkX
            </Badge>
          </div>
          <p className="text-sm text-zinc-400">
            Real-time cross-merchant fraud ring clustering and behavioral co-occurrence analysis.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadGraph}
            disabled={loading}
            className="border-zinc-800"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Graph
          </Button>
        </div>
      </div>

      {/* Toolbar Controls & Stats Bar */}
      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-6">
          {/* Ring Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-zinc-400">Cluster Focus:</span>
            <select
              value={selectedRingId}
              onChange={(e) => {
                setSelectedRingId(e.target.value)
                if (e.target.value) setHighlightRings(true)
              }}
              className="h-8 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Entities</option>
              {rings.map((r) => {
                const memberCount = r.members_count ?? r.member_nodes_count ?? (r.nodes ? r.nodes.length : 0)
                const storeCount = (r.merchants_spanned ?? r.affected_merchants ?? []).length
                return (
                  <option key={r.ring_id} value={r.ring_id}>
                    {r.ring_id.slice(0, 8)}... ({memberCount} entities · {storeCount} stores)
                  </option>
                )
              })}
            </select>
          </div>

          {/* Highlight Rings Toggle */}
          <div className="flex items-center space-x-2.5">
            <Switch
              id="ring-toggle"
              checked={highlightRings}
              onCheckedChange={setHighlightRings}
            />
            <label
              htmlFor="ring-toggle"
              className="text-xs font-medium text-zinc-300 cursor-pointer flex items-center"
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-red-400" />
              Highlight Rings
            </label>
          </div>
        </div>

        {/* Stats Pills */}
        <div className="flex items-center space-x-4 text-xs font-mono">
          <div className="flex items-center space-x-1.5 text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Entities:</span>
            <span className="text-white font-semibold">{nodeCount}</span>
          </div>
          <div className="flex items-center space-x-1.5 text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            <span>Edges:</span>
            <span className="text-white font-semibold">{edgeCount}</span>
          </div>
          <div className="flex items-center space-x-1.5 text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span>Rings:</span>
            <span className="text-red-400 font-semibold">{rings.length}</span>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      {nodeCount === 0 && !loading ? (
        <Card className="border-dashed border-zinc-800 bg-zinc-950/40 text-center py-20">
          <CardContent className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
              <Network className="w-6 h-6" />
            </div>
            <CardTitle className="text-base text-zinc-200">
              No entity nodes discovered
            </CardTitle>
            <CardDescription className="max-w-md mx-auto text-xs">
              Entity nodes (hashed emails, IP subnets, device fingerprints) appear automatically as transactions are evaluated through the Nexus gateway.
            </CardDescription>
            <div className="pt-2">
              <Button size="sm" asChild>
                <a href="/dashboard/transactions">Go to Transactions</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <CytoscapeGraph
            elements={graphData}
            highlightedRingId={selectedRingId || null}
            highlightRings={highlightRings}
            onNodeClick={handleNodeClick}
          />

          <div className="absolute bottom-4 left-4 bg-zinc-950/90 border border-zinc-800 rounded-lg p-3 text-[11px] font-mono space-y-1.5 backdrop-blur-sm">
            <div className="text-zinc-400 font-semibold mb-1">Graph Legend:</div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
              <span className="text-zinc-300">ALLOW (Trust &gt;= 70)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
              <span className="text-zinc-300">REVIEW (Trust 40–69)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              <span className="text-zinc-300">DENY / Ring Cluster</span>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Node Inspector */}
      <NodeInspectorSheet
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        nodeData={inspectorNode}
      />
    </div>
  )
}
