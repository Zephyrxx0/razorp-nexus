"use client"

import React, { useState } from "react"
import { Shield, KeyRound, RefreshCw, Copy, Check, Lock, Webhook } from "lucide-react"
import { useMerchant } from "@/components/providers/merchant-provider"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"

export default function SettingsPage() {
  const { activeMerchant } = useMerchant()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [notification, setNotification] = useState<string | null>(null)

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Merchant Settings</h1>
        <p className="text-sm text-zinc-400">
          Manage your Razorpay test-mode keys, MaaS Bearer tokens, and webhook secrets.
        </p>
      </div>

      {notification && (
        <Alert variant="default" className="border-emerald-500/30 bg-emerald-500/10">
          <AlertDescription className="text-xs text-emerald-400">{notification}</AlertDescription>
        </Alert>
      )}

      {/* Store Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Store Profile</CardTitle>
          <CardDescription>Basic account details configured on the Nexus gateway.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Merchant ID</label>
              <div className="flex items-center space-x-2">
                <code className="font-mono text-xs bg-zinc-950 px-3 py-2 rounded border border-zinc-800 flex-1 truncate text-zinc-300">
                  {activeMerchant?.id || "None selected"}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-800"
                  onClick={() => activeMerchant?.id && copyText("mid", activeMerchant.id)}
                >
                  {copiedKey === "mid" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Store Name</label>
              <Input value={activeMerchant?.name || ""} disabled className="opacity-80" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Razorpay Test Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <KeyRound className="w-5 h-5 text-emerald-400" />
            <CardTitle>Razorpay API Keys</CardTitle>
          </div>
          <CardDescription>
            Test mode key pair for order authorization and payment capture. Secret is encrypted with AES-256-GCM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Test Key ID</label>
            <Input value="rzp_test_ApexStore10" disabled className="font-mono text-xs" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Test Key Secret</label>
            <div className="flex items-center space-x-2">
              <Input type="password" value="••••••••••••••••••••••••" disabled className="font-mono text-xs flex-1" />
              <Badge variant="allow" className="shrink-0">
                AES-256-GCM Encrypted
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MaaS Bearer Token & Webhooks */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Webhook className="w-5 h-5 text-emerald-400" />
            <CardTitle>Autonomous Commerce & Webhooks</CardTitle>
          </div>
          <CardDescription>
            Endpoints and cryptographic secrets used to interact with autonomous AI buyers and Razorpay webhooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Razorpay Webhook Callback URL</label>
            <div className="flex items-center space-x-2">
              <code className="font-mono text-xs bg-zinc-950 px-3 py-2 rounded border border-zinc-800 flex-1 truncate text-zinc-300">
                http://localhost:3000/api/webhooks/razorpay
              </code>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-800"
                onClick={() => copyText("webhook", "http://localhost:3000/api/webhooks/razorpay")}
              >
                {copiedKey === "webhook" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Webhook Signature Verification</label>
            <p className="text-xs text-zinc-400">
              Nexus verifies incoming Razorpay webhooks using timing-safe HMAC-SHA256 comparison via <code className="text-zinc-300">crypto.timingSafeEqual</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
