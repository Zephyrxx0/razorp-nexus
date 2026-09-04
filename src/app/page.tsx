"use client"

import React, { useState } from "react"
import Link from "next/link"
import { HeroAscii } from "@/components/landing/hero-ascii"
import {
  Shield,
  Cpu,
  Layers,
  Lock,
  ArrowRight,
  Terminal,
  CheckCircle2,
  Activity,
  Database,
  Sparkles,
  Zap,
  Network,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react"

export default function LandingPage() {
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  const sampleCurl = `curl -X POST https://nexus-commerce.io/api/maas/merch_9942a1/transact \\
  -H "Authorization: Bearer nx_live_77e92ab01c" \\
  -H "Content-Type: application/json" \\
  -d '{
    "intent": "Purchase 1 mechanical keyboard under ₹5,000",
    "buyer_context": {
      "buyer_email": "agent-buyer@autonomous.ai",
      "ip_address": "198.51.100.42",
      "device_hash": "e3b0c44298fc1c149afbf4c8996fb924"
    }
  }'`

  const handleCopy = () => {
    navigator.clipboard.writeText(sampleCurl)
    setCopiedSnippet(true)
    setTimeout(() => setCopiedSnippet(false), 2000)
  }

  const steps = [
    {
      num: "01",
      name: "parse_intent",
      sub: "Gemini 2.0 Flash",
      desc: "Extracts structured SKU parameters, budget limits, and buyer specifications from natural language agent prompts.",
      tag: "LLM Parser",
    },
    {
      num: "02",
      name: "resolve_catalog",
      sub: "pgvector 768-D",
      desc: "Executes cosine similarity search over merchant catalog embeddings to pinpoint exact inventory in real time.",
      tag: "Vector Search",
    },
    {
      num: "03",
      name: "check_trust_graph",
      sub: "NetworkX Engine",
      desc: "Traverses cross-merchant identity graph in <500ms to detect coordinated fraud rings and Sybil attacks.",
      tag: "Risk Gate",
    },
    {
      num: "04",
      name: "create_order",
      sub: "Razorpay Server API",
      desc: "Provisions test-mode order with integer paise precision, locking merchant inventory and currency amounts.",
      tag: "Gateway",
    },
    {
      num: "05",
      name: "capture_payment",
      sub: "HMAC-SHA256",
      desc: "Executes server-to-server capture with timing-safe signature verification to finalize the transaction.",
      tag: "Settlement",
    },
    {
      num: "06",
      name: "log_audit_entry",
      sub: "Sealed Hash Chain",
      desc: "Appends transaction record to immutable cryptographic hash chain ensuring 100% explainable audit trails.",
      tag: "Audit Log",
    },
  ]

  return (
    <div className="min-h-screen bg-[#09090b] text-foreground flex flex-col font-sans">
      {/* 1. Interactive ASCII Vitruvian Hero Section */}
      <HeroAscii />

      {/* 2. Key Value Pillars */}
      <section className="relative z-10 border-t border-border/60 bg-zinc-950 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs text-primary mb-3">
                <span className="w-2 h-2 rounded-full bg-primary" />
                SYSTEM ARCHITECTURE
              </div>
              <h2 className="text-2xl sm:text-4xl font-mono font-bold text-white tracking-tight">
                Dual-Layered Agentic Commerce
              </h2>
            </div>
            <p className="font-mono text-xs sm:text-sm text-zinc-400 max-w-md leading-relaxed">
              Designed for the autonomous agent era: programmatic catalog resolution paired with network-level defense before money moves.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {/* Layer 1: MaaS Gateway */}
            <div className="relative border border-border/80 bg-zinc-900/40 p-6 sm:p-8 rounded-lg hover:border-primary/50 transition-colors group">
              <div className="flex items-center justify-between mb-6">
                <div className="p-3 bg-primary/10 rounded-md text-primary group-hover:bg-primary group-hover:text-black transition-colors">
                  <Layers className="w-6 h-6" />
                </div>
                <span className="font-mono text-[10px] px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  LAYER 01
                </span>
              </div>
              <h3 className="text-xl font-mono font-bold text-white mb-2">
                Merchant-as-an-API (MaaS)
              </h3>
              <p className="text-sm text-zinc-400 font-mono mb-6 leading-relaxed">
                Transforms traditional merchant stores into autonomous agent endpoints. Exposes semantic catalog querying, stock reservation, and payment execution via machine-readable JSON schemas.
              </p>
              <ul className="space-y-2.5 font-mono text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Gemini text-embedding-004 vector search in pgvector</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Bearer token auth with SHA-256 key hashing</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Integer paise currency model for zero precision drift</span>
                </li>
              </ul>
              <div className="mt-8 pt-6 border-t border-border/60">
                <Link
                  href="/dashboard/catalog"
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:text-emerald-400 font-semibold"
                >
                  <span>Explore Catalog Manager</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Layer 2: Trust Graph */}
            <div className="relative border border-border/80 bg-zinc-900/40 p-6 sm:p-8 rounded-lg hover:border-primary/50 transition-colors group">
              <div className="flex items-center justify-between mb-6">
                <div className="p-3 bg-primary/10 rounded-md text-primary group-hover:bg-primary group-hover:text-black transition-colors">
                  <Network className="w-6 h-6" />
                </div>
                <span className="font-mono text-[10px] px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  LAYER 02
                </span>
              </div>
              <h3 className="text-xl font-mono font-bold text-white mb-2">
                Cross-Merchant Trust Graph
              </h3>
              <p className="text-sm text-zinc-400 font-mono mb-6 leading-relaxed">
                Network-wide defense engine connecting buyer signals (hashed emails, IP subnets, device IDs) across all onboarded merchants. Catches coordinated rings before checkout.
              </p>
              <ul className="space-y-2.5 font-mono text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Sub-500ms in-memory NetworkX graph scoring</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Connected component clustering for multi-entity rings</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Cytoscape.js force-directed visualizer & node inspection</span>
                </li>
              </ul>
              <div className="mt-8 pt-6 border-t border-border/60">
                <Link
                  href="/dashboard/trust-graph"
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:text-emerald-400 font-semibold"
                >
                  <span>Open Force-Directed Visualizer</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 6-Step Deterministic Execution Pipeline */}
      <section className="relative z-10 border-t border-border/60 bg-[#09090b] py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 font-mono text-xs text-primary px-3 py-1 bg-primary/10 border border-primary/20 rounded-full mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>DETERMINISTIC TOOL CHAIN</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-mono font-bold text-white tracking-tight mb-4">
              6-Step Verified Commerce Loop
            </h2>
            <p className="font-mono text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Autonomous execution without unconstrained hallucination loops. Bounded, explainable, and cryptographically anchored.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            {steps.map((step) => (
              <div
                key={step.num}
                className="border border-border/80 bg-zinc-950/60 p-5 rounded-lg hover:border-primary/40 transition-colors relative"
              >
                <div className="flex items-center justify-between mb-3 font-mono">
                  <span className="text-2xl font-black text-primary/40">{step.num}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {step.tag}
                  </span>
                </div>
                <div className="font-mono font-bold text-white text-base mb-1">{step.name}</div>
                <div className="font-mono text-[11px] text-emerald-400 mb-3">{step.sub}</div>
                <p className="text-xs text-zinc-400 font-mono leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Developer API & Terminal Preview */}
      <section className="relative z-10 border-t border-border/60 bg-zinc-950 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5">
              <div className="flex items-center gap-2 font-mono text-xs text-primary mb-3">
                <Terminal className="w-4 h-4" />
                <span>AGENT INTEGRATION</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white tracking-tight mb-4">
                One Endpoint for Autonomous Buyers
              </h2>
              <p className="font-mono text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">
                Autonomous AI agents interact with your store using a standard HTTP payload. The Nexus gateway orchestrates semantic catalog retrieval, trust verification, and Razorpay payment execution behind a single call.
              </p>

              <div className="space-y-3 font-mono text-xs text-zinc-300 mb-8">
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                  <span>Instant intent matching to merchant inventory</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                  <span>Real-time graph gating: ALLOW, REVIEW, or DENY</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                  <span>Returns Razorpay order ID and cryptographic audit receipt</span>
                </div>
              </div>

              <Link
                href="/dashboard/onboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-black font-mono font-bold text-xs uppercase rounded hover:bg-emerald-400 transition-colors"
              >
                <span>Get Merchant API Token</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Terminal Window */}
            <div className="lg:col-span-7">
              <div className="rounded-lg border border-border bg-black shadow-2xl overflow-hidden font-mono text-xs">
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                    <span className="ml-2 text-zinc-400 text-[11px]">POST /api/maas/[merchant_id]/transact</span>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-[11px]"
                  >
                    {copiedSnippet ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-4 sm:p-6 overflow-x-auto text-zinc-300 leading-relaxed">
                  <pre className="text-emerald-400">
                    <code>{sampleCurl}</code>
                  </pre>
                  <div className="mt-4 pt-4 border-t border-zinc-800 text-zinc-500 text-[11px]">
                    <span className="text-zinc-400 font-semibold">Response (HTTP 200 OK):</span>
                    <pre className="text-zinc-300 mt-2">
{`{
  "status": "COMPLETED",
  "transaction_id": "tx_88a9e201b",
  "product_id": "prod_keyboard_01",
  "amount_paise": 449900,
  "trust_score": 94,
  "decision": "ALLOW",
  "razorpay_order_id": "order_Kq8s104bA",
  "audit_hash": "3f79a8bc41...7de"
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Call to Action / Footer */}
      <footer className="border-t border-border/80 bg-black py-12 lg:py-16 font-mono">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-10 border-b border-zinc-800">
            <div>
              <div className="text-xl font-black italic tracking-widest text-primary mb-2">
                NEXUS
              </div>
              <p className="text-xs text-zinc-400 max-w-sm">
                Dual-layered autonomous agent commerce on Razorpay with real-time cross-merchant Trust Graph fraud protection.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/transactions"
                className="px-5 py-2.5 bg-primary text-black font-bold text-xs uppercase rounded hover:bg-emerald-400 transition-colors"
              >
                Launch Console
              </Link>
              <Link
                href="/dashboard/trust-graph"
                className="px-5 py-2.5 border border-border text-white text-xs uppercase rounded hover:border-primary transition-colors"
              >
                Trust Graph
              </Link>
              <Link
                href="/dashboard/onboard"
                className="px-5 py-2.5 border border-border text-white text-xs uppercase rounded hover:border-primary transition-colors"
              >
                Onboard Store
              </Link>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-zinc-500">
            <div>© 2026 NEXUS PROTOCOL · RAZORPAY TEST MODE · GOOGLE ADK & GEMINI 2.0 FLASH</div>
            <div className="flex items-center gap-4">
              <Link href="/dashboard/transactions" className="hover:text-zinc-300 transition-colors">
                Live Feed
              </Link>
              <Link href="/dashboard/catalog" className="hover:text-zinc-300 transition-colors">
                Catalog
              </Link>
              <Link href="/dashboard/trust-graph" className="hover:text-zinc-300 transition-colors">
                Graph
              </Link>
              <Link href="/dashboard/settings" className="hover:text-zinc-300 transition-colors">
                Settings
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

