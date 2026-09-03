"use client"

import React, { useState } from "react"
import useSWR from "swr"
import {
  Activity,
  Play,
  RefreshCw,
  Clock,
  Shield,
  FileText,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react"
import { useMerchant } from "@/components/providers/merchant-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuditDrawer } from "@/components/dashboard/audit-drawer"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function TransactionsPage() {
  const { activeMerchant } = useMerchant()
  const [simulating, setSimulating] = useState(false)
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data, error, isLoading, mutate } = useSWR(
    activeMerchant?.id ? `/api/merchant/transactions?merchant_id=${activeMerchant.id}` : null,
    fetcher,
    { refreshInterval: 3000 }
  )

  const transactions = data?.transactions || []

  const handleSimulate = async () => {
    if (!activeMerchant?.id) return
    setSimulating(true)
    try {
      const res = await fetch("/api/merchant/test-transact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: activeMerchant.id }),
      })
      if (res.ok) {
        await mutate()
      }
    } catch (e) {
      console.error("Simulation failed:", e)
    } finally {
      setSimulating(false)
    }
  }

  const copyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const openAudit = (txn: any) => {
    setSelectedTxn(txn)
    setDrawerOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Live Transactions</h1>
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>3s Live Polling</span>
            </div>
          </div>
          <p className="text-sm text-zinc-400">
            Real-time feed of autonomous agent purchases evaluated by the Trust Graph.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="border-zinc-800"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Live Feed
          </Button>

          <Button
            size="sm"
            onClick={handleSimulate}
            disabled={simulating || !activeMerchant?.id}
          >
            <Play className="w-4 h-4 mr-2 text-emerald-400" />
            {simulating ? "Executing Simulation..." : "Trigger Sample Transaction"}
          </Button>
        </div>
      </div>

      {transactions.length === 0 && !isLoading ? (
        <Card className="border-dashed border-zinc-800 bg-zinc-950/40 text-center py-16">
          <CardContent className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
              <Activity className="w-6 h-6" />
            </div>
            <CardTitle className="text-base text-zinc-200">No transactions recorded yet</CardTitle>
            <CardDescription className="max-w-sm mx-auto text-xs">
              Trigger a sample transaction to simulate an autonomous AI buying agent and view the 6-step verified audit trail.
            </CardDescription>
            <div className="pt-2">
              <Button size="sm" onClick={handleSimulate} disabled={simulating}>
                <Play className="w-4 h-4 mr-2" /> Trigger Sample Transaction
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Buyer Hash</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Trust Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Audit Trail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t: any) => {
                const isAllow = t.decision === "ALLOW"
                const isReview = t.decision === "REVIEW"
                const scoreVariant = isAllow ? "allow" : isReview ? "review" : "deny"

                return (
                  <TableRow
                    key={t.id}
                    className="border-zinc-800 cursor-pointer hover:bg-zinc-800/40"
                    onClick={() => openAudit(t)}
                  >
                    <TableCell className="text-xs text-zinc-400 font-mono">
                      {new Date(t.created_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center space-x-1.5 font-mono text-xs text-zinc-300">
                        <span>{t.id.slice(0, 8)}...{t.id.slice(-4)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
                          onClick={(e) => copyId(t.id, e)}
                        >
                          {copiedId === t.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-xs text-zinc-400">
                      {t.buyer_email_hash ? `${t.buyer_email_hash.slice(0, 10)}...` : "anonymous"}
                    </TableCell>

                    <TableCell className="font-mono text-sm text-zinc-100 font-medium">
                      ₹{(t.amount_paise / 100).toLocaleString("en-IN")}
                    </TableCell>

                    <TableCell>
                      <div className="inline-flex items-center" title={`Factors: ${JSON.stringify(t.risk_factors || [])}`}>
                        <Badge variant={scoreVariant} className="font-mono text-xs">
                          {t.trust_score} · {t.decision}
                        </Badge>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          t.status === "SUCCESS"
                            ? "allow"
                            : t.status === "DENIED"
                            ? "deny"
                            : "outline"
                        }
                        className="text-[11px] uppercase tracking-wider"
                      >
                        {t.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-zinc-800 hover:text-emerald-400"
                        onClick={(e) => {
                          e.stopPropagation()
                          openAudit(t)
                        }}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" /> View Trail
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Slide-out Audit Timeline Drawer */}
      <AuditDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        transaction={selectedTxn}
      />
    </div>
  )
}
