"use client"

import React, { useEffect, useState } from "react"
import {
  ShieldAlert,
  ShieldCheck,
  Network,
  Activity,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface NodeInspectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeData: any | null
}

export function NodeInspectorSheet({
  open,
  onOpenChange,
  nodeData,
}: NodeInspectorProps) {
  const [details, setDetails] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!nodeData?.id) return
    const fetchNodeDetails = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/trust/node/${encodeURIComponent(nodeData.id)}`)
        if (res.ok) {
          const data = await res.json()
          setDetails(data)
        } else {
          setDetails(nodeData)
        }
      } catch (e) {
        setDetails(nodeData)
      } finally {
        setLoading(false)
      }
    }

    fetchNodeDetails()
  }, [nodeData])

  if (!nodeData) return null

  const data = details || nodeData
  const score = data.trust_score !== undefined ? data.trust_score : 85
  const inRing = Boolean(data.in_ring || data.ring_id)
  const decision = score >= 70 && !inRing ? "ALLOW" : score >= 40 && !inRing ? "REVIEW" : "DENY"

  const copyId = () => {
    navigator.clipboard.writeText(data.id || data.node_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md flex flex-col h-full bg-zinc-950 border-zinc-800 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            {inRing ? (
              <ShieldAlert className="w-5 h-5 text-red-400" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            )}
            <SheetTitle className="text-white">Entity Signal Inspector</SheetTitle>
          </div>
          <SheetDescription className="font-mono text-xs text-zinc-400">
            Real-time multi-merchant graph signals and connected neighbors.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4 flex-1">
          {/* Entity ID Header */}
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Entity Type: {data.entity_type || "email_hash"}
              </span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copyId}>
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              </Button>
            </div>
            <code className="font-mono text-xs text-zinc-200 break-all block">
              {data.id || data.node_id}
            </code>
          </div>

          {/* Trust Score & Decision Gauge */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="text-[11px] text-zinc-400 mb-1">Entity Trust Score</div>
              <div className="font-mono text-lg font-bold text-white">
                {score} / 100
              </div>
            </div>
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="text-[11px] text-zinc-400 mb-1">Decision Gating</div>
              <Badge
                variant={decision === "ALLOW" ? "allow" : decision === "REVIEW" ? "review" : "deny"}
                className="mt-1"
              >
                {decision}
              </Badge>
            </div>
          </div>

          {/* Fraud Ring Warning */}
          {inRing && (
            <div className="p-3.5 rounded-lg bg-red-950/30 border border-red-500/40 text-red-300 space-y-1">
              <div className="flex items-center space-x-2 font-semibold text-xs text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Multi-Merchant Fraud Ring Detected</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-300">
                This entity participates in coordinated transaction velocities across multiple independent merchant storefronts.
              </p>
              {data.ring_id && (
                <div className="pt-1 font-mono text-[11px] text-red-400">
                  Cluster ID: {data.ring_id}
                </div>
              )}
            </div>
          )}

          {/* Connected Neighbors */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center">
                <Network className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                1-Hop Neighbors ({data.neighbors?.length || data.degree || 0})
              </h4>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(data.neighbors || []).map((neighbor: string, i: number) => (
                <div
                  key={i}
                  className="p-2 rounded bg-zinc-900/80 border border-zinc-800/80 font-mono text-xs text-zinc-300 truncate"
                >
                  {neighbor}
                </div>
              ))}
              {(!data.neighbors || data.neighbors.length === 0) && (
                <div className="text-xs text-zinc-500 italic p-2">
                  No direct co-occurrence edges recorded yet
                </div>
              )}
            </div>
          </div>

          {/* Linked Transactions */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center">
              <Activity className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Associated Transactions ({data.transactions?.length || 0})
            </h4>

            <div className="space-y-2">
              {(data.transactions || []).map((txnId: string, i: number) => (
                <div
                  key={i}
                  className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs"
                >
                  <code className="font-mono text-zinc-300 truncate max-w-[220px]">
                    {txnId}
                  </code>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-emerald-400 hover:text-white" asChild>
                    <a href="/dashboard/transactions">
                      Inspect <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </Button>
                </div>
              ))}
              {(!data.transactions || data.transactions.length === 0) && (
                <div className="text-xs text-zinc-500 italic p-2">
                  No linked transactions found
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
