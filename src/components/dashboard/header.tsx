"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Shield, ChevronDown, Check, Plus, Store } from "lucide-react"
import { useMerchant } from "@/components/providers/merchant-provider"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function Header() {
  const pathname = usePathname()
  const { activeMerchant, merchantsList, setActiveMerchantId } = useMerchant()

  const navLinks = [
    { name: "Transactions", href: "/dashboard/transactions" },
    { name: "Catalog", href: "/dashboard/catalog" },
    { name: "Trust Graph", href: "/dashboard/trust-graph" },
    { name: "Settings", href: "/dashboard/settings" },
  ]

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link href="/dashboard" className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <span className="font-semibold text-white tracking-wide">NEXUS</span>
              <span className="text-xs text-zinc-500 block -mt-1 font-mono">MaaS Gateway</span>
            </div>
          </Link>

          <Badge variant="allow" className="text-[10px] tracking-wider uppercase font-mono">
            Razorpay Test Mode
          </Badge>

          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => {
              const isActive = pathname?.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "text-emerald-400 bg-emerald-500/10"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  {link.name}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 border-zinc-800 bg-zinc-900">
                <Store className="w-4 h-4 mr-2 text-zinc-400" />
                <span className="max-w-[140px] truncate">
                  {activeMerchant?.name || "Select Merchant"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 ml-2 text-zinc-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Switch Active Store</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {merchantsList.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => setActiveMerchantId(m.id)}
                  className="flex items-center justify-between"
                >
                  <span className="truncate">{m.name}</span>
                  {activeMerchant?.id === m.id && (
                    <Check className="w-4 h-4 text-emerald-400 ml-2" />
                  )}
                </DropdownMenuItem>
              ))}
              {merchantsList.length === 0 && (
                <div className="p-2 text-xs text-zinc-500 text-center">
                  No merchants registered
                </div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/onboard" className="flex items-center text-emerald-400">
                  <Plus className="w-4 h-4 mr-2" />
                  <span>Onboard New Store</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
