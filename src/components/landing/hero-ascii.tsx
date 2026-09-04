"use client"

import React from "react"
import Link from "next/link"
import { ShieldCheck, Cpu, ArrowRight, Zap, Terminal, Activity } from "lucide-react"

export function HeroAscii() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-[#09090b] text-foreground flex flex-col justify-between select-none">
      {/* Ambient Cybernetic Grid & Radial Glow Background */}
      <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(16,185,129,0.12),transparent)] pointer-events-none" />
      <div className="absolute inset-0 w-full h-full bg-[linear-gradient(to_right,#27272a22_1px,transparent_1px),linear-gradient(to_bottom,#27272a22_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_45%,#000_65%,transparent_100%)] pointer-events-none" />
      <div className="absolute inset-0 w-full h-full stars-bg pointer-events-none opacity-30" />

      {/* Top Header / Navigation Bar */}
      <div className="relative z-20 border-b border-border/40 bg-background/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="font-mono text-xl sm:text-2xl font-black tracking-widest italic transform -skew-x-12 text-primary group-hover:text-emerald-400 transition-colors">
                NEXUS
              </span>
              <span className="hidden sm:inline-block h-3.5 w-px bg-border" />
              <span className="hidden sm:inline-block text-muted-foreground text-[10px] font-mono uppercase tracking-wider">
                MaaS & Trust Graph
              </span>
            </Link>
          </div>

          {/* Center Coordinates & Network Telemetry */}
          <div className="hidden md:flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              BLR · 12.9716° N, 77.5946° E
            </span>
            <span className="text-border">|</span>
            <span>RZP TEST-MODE: ENGAGED</span>
          </div>

          {/* Right Action Links */}
          <div className="flex items-center gap-3 font-mono text-xs">
            <Link
              href="/dashboard/trust-graph"
              className="hidden sm:inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors px-3 py-1"
            >
              <Activity className="w-3.5 h-3.5 text-primary" />
              Trust Graph
            </Link>
            <Link
              href="/dashboard/transactions"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary/10 border border-primary/40 text-primary hover:bg-primary hover:text-black font-semibold rounded transition-all duration-200"
            >
              <span>Console</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Technical Corner Frame Accents */}
      <div className="absolute top-12 left-0 w-8 h-8 lg:w-12 lg:h-12 border-t-2 border-l-2 border-primary/30 z-10 pointer-events-none" />
      <div className="absolute top-12 right-0 w-8 h-8 lg:w-12 lg:h-12 border-t-2 border-r-2 border-primary/30 z-10 pointer-events-none" />
      <div
        className="absolute left-0 w-8 h-8 lg:w-12 lg:h-12 border-b-2 border-l-2 border-primary/30 z-10 pointer-events-none"
        style={{ bottom: "52px" }}
      />
      <div
        className="absolute right-0 w-8 h-8 lg:w-12 lg:h-12 border-b-2 border-r-2 border-primary/30 z-10 pointer-events-none"
        style={{ bottom: "52px" }}
      />

      {/* Hero Body Content */}
      <div className="relative z-10 flex-1 flex items-center py-12 lg:py-20">
        <div className="max-w-7xl w-full mx-auto px-6 sm:px-8 lg:px-12">
          <div className="max-w-xl lg:max-w-2xl relative">
            {/* Top decorative line with 001 index */}
            <div className="flex items-center gap-2 mb-4 opacity-70">
              <div className="w-8 h-px bg-primary" />
              <span className="text-primary text-[10px] font-mono tracking-widest uppercase">
                001 // AUTONOMOUS AGENT COMMERCE PROTOCOL
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Main Headline */}
            <div className="relative mb-5">
              <div className="hidden lg:block absolute -left-4 top-0 bottom-0 w-1 dither-pattern opacity-60" />
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight text-white leading-none">
                AUTONOMOUS
                <span className="block text-primary mt-2 font-mono tracking-wide drop-shadow-[0_0_24px_rgba(16,185,129,0.3)]">
                  COMMERCE.
                </span>
              </h1>
            </div>

            {/* Technical Sub-headline */}
            <p className="text-sm sm:text-base text-zinc-300 mb-6 leading-relaxed font-mono opacity-90 max-w-lg">
              The dual-layered <span className="text-white font-semibold">Merchant-as-an-API</span> gateway
              and real-time <span className="text-primary font-semibold">Trust Graph</span> evaluating
              cross-merchant fraud rings in <span className="text-white">&lt;500ms</span> before money moves on Razorpay.
            </p>

            {/* Live Telemetry Chips */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8 max-w-md font-mono text-[11px]">
              <div className="border border-border/80 bg-zinc-900/60 backdrop-blur-sm p-2.5 rounded">
                <div className="text-muted-foreground text-[9px] uppercase">Scoring Gate</div>
                <div className="text-emerald-400 font-bold">&lt;500ms</div>
              </div>
              <div className="border border-border/80 bg-zinc-900/60 backdrop-blur-sm p-2.5 rounded">
                <div className="text-muted-foreground text-[9px] uppercase">Chain Length</div>
                <div className="text-white font-bold">6 Deterministic</div>
              </div>
              <div className="border border-border/80 bg-zinc-900/60 backdrop-blur-sm p-2.5 rounded">
                <div className="text-muted-foreground text-[9px] uppercase">Audit Ledger</div>
                <div className="text-emerald-400 font-bold">SHA-256 Chain</div>
              </div>
            </div>

            {/* CTA Button Array */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 font-mono">
              <Link
                href="/dashboard/transactions"
                className="relative px-6 py-3 bg-primary text-black font-bold text-xs uppercase tracking-wider hover:bg-emerald-400 transition-all duration-200 flex items-center justify-center gap-2 group shadow-[0_0_20px_rgba(16,185,129,0.25)]"
              >
                <span className="hidden lg:block absolute -top-1 -left-1 w-2 h-2 border-t border-l border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="hidden lg:block absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <Cpu className="w-4 h-4" />
                <span>Launch Live Feed</span>
              </Link>

              <Link
                href="/dashboard/onboard"
                className="relative px-6 py-3 bg-transparent border border-border text-white text-xs uppercase tracking-wider hover:border-primary hover:text-primary transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                <span>Onboard Store</span>
              </Link>

              <Link
                href="/dashboard/trust-graph"
                className="px-5 py-3 text-zinc-400 hover:text-white text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>Inspect Graph</span>
              </Link>
            </div>

            {/* Bottom Technical Notation */}
            <div className="hidden lg:flex items-center gap-2 mt-8 opacity-40 font-mono text-[9px]">
              <span className="text-primary font-bold">●</span>
              <span>GOOGLE ADK ORCHESTRATED</span>
              <div className="flex-1 h-px bg-border" />
              <span>NETWORKX GRAPH ENGINE</span>
              <div className="flex-1 h-px bg-border" />
              <span>PGVECTOR RETRIEVAL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Technical HUD Footer */}
      <div className="relative z-20 border-t border-border/40 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between text-[9px] font-mono text-muted-foreground">
          {/* Left: System state & equalizer */}
          <div className="flex items-center gap-3 sm:gap-6">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              SYSTEM.ACTIVE
            </span>
            <div className="hidden sm:flex items-center gap-1">
              {[8, 14, 6, 18, 11, 20, 15, 9, 13, 7].map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-emerald-500/40 rounded-full"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <span className="hidden sm:inline text-zinc-500">V1.0.0-PROD</span>
          </div>

          {/* Center: Architecture protocol note */}
          <div className="hidden md:flex items-center gap-2 text-zinc-400">
            <Terminal className="w-3 h-3 text-primary" />
            <span>POST /api/maas/[merchant_id]/transact</span>
          </div>

          {/* Right: Graph status and frame ticker */}
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-emerald-400">◐ GRAPH ENGINE</span>
            <div className="flex gap-1">
              <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
              <div
                className="w-1 h-1 bg-emerald-400/60 rounded-full animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
              <div
                className="w-1 h-1 bg-emerald-400/30 rounded-full animate-pulse"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
            <span className="hidden sm:inline">FRAME: ∞</span>
          </div>
        </div>
      </div>

      {/* Dither and starfield styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .dither-pattern {
          background-image:
            repeating-linear-gradient(0deg, transparent 0px, transparent 1px, rgba(16, 185, 129, 0.4) 1px, rgba(16, 185, 129, 0.4) 2px),
            repeating-linear-gradient(90deg, transparent 0px, transparent 1px, rgba(16, 185, 129, 0.4) 1px, rgba(16, 185, 129, 0.4) 2px);
          background-size: 3px 3px;
        }

        .stars-bg {
          background-image:
            radial-gradient(1px 1px at 20% 30%, rgba(16, 185, 129, 0.6), transparent),
            radial-gradient(1px 1px at 60% 70%, rgba(255, 255, 255, 0.4), transparent),
            radial-gradient(1px 1px at 50% 50%, rgba(16, 185, 129, 0.5), transparent),
            radial-gradient(1px 1px at 80% 10%, rgba(255, 255, 255, 0.3), transparent),
            radial-gradient(1px 1px at 90% 60%, rgba(16, 185, 129, 0.4), transparent),
            radial-gradient(1px 1px at 33% 80%, rgba(255, 255, 255, 0.5), transparent),
            radial-gradient(1px 1px at 15% 60%, rgba(16, 185, 129, 0.3), transparent),
            radial-gradient(1px 1px at 70% 40%, rgba(255, 255, 255, 0.4), transparent);
          background-size: 200% 200%, 180% 180%, 250% 250%, 220% 220%, 190% 190%, 240% 240%, 210% 210%, 230% 230%;
          background-position: 0% 0%, 40% 40%, 60% 60%, 20% 20%, 80% 80%, 30% 30%, 70% 70%, 50% 50%;
          opacity: 0.4;
        }
      `,
        }}
      />
    </section>
  )
}
