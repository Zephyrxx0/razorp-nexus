"use client"

import React, { useState } from "react"
import { Copy, Check, Bot, Globe, ExternalLink } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface AiAgentViewDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  merchantName?: string
  catalogData: any
}

export function AiAgentViewDrawer({
  open,
  onOpenChange,
  merchantId,
  merchantName,
  catalogData,
}: AiAgentViewDrawerProps) {
  const [copied, setCopied] = useState(false)

  const catalogEndpoint = `/api/maas/${merchantId}/catalog`
  const formattedJson = JSON.stringify(catalogData, null, 2)

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl flex flex-col h-full bg-zinc-950 border-zinc-800">
        <SheetHeader className="pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            <SheetTitle>AI Agent Catalog View</SheetTitle>
          </div>
          <SheetDescription>
            Exact machine-readable schema returned to autonomous buyers queryable via semantic vector similarity.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-4 flex-1 flex flex-col min-h-0">
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <Globe className="w-4 h-4 text-zinc-400 shrink-0" />
              <code className="text-xs font-mono text-zinc-300 truncate">
                GET {catalogEndpoint}
              </code>
            </div>
            <Badge variant="allow" className="text-[10px]">
              Active
            </Badge>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Payload Preview ({catalogData?.items?.length || 0} indexed items)</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="h-7 text-xs border-zinc-800"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy JSON
                </>
              )}
            </Button>
          </div>

          <div className="flex-1 min-h-0 relative">
            <pre className="h-full w-full overflow-auto p-4 rounded-lg bg-zinc-900/80 border border-zinc-800 text-emerald-400/90 font-mono text-xs leading-relaxed">
              {formattedJson}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
