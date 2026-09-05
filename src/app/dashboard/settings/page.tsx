"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Shield,
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  Lock,
  Webhook,
  Terminal,
  AlertTriangle,
  Trash2,
  Loader2,
  Package,
  History,
  FileText,
} from "lucide-react"
import { useMerchant } from "@/components/providers/merchant-provider"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface MerchantDetails {
  id: string
  name: string
  email: string
  razorpay_key_id: string
  razorpay_webhook_secret: string
  token_preview: string
  created_at: string
  is_active: boolean
}

interface MerchantStats {
  product_count: number
  transaction_count: number
  audit_entry_count: number
  sample_product: string
}

export default function SettingsPage() {
  const router = useRouter()
  const { activeMerchant, merchantsList, setActiveMerchantId, refreshMerchants } = useMerchant()

  const [details, setDetails] = useState<MerchantDetails | null>(null)
  const [stats, setStats] = useState<MerchantStats | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Token management
  const [regeneratingToken, setRegeneratingToken] = useState(false)
  const [livePlainToken, setLivePlainToken] = useState<string | null>(null)

  // Active command tab
  const [activeCommandTab, setActiveCommandTab] = useState<"transact" | "catalog">("transact")

  // Delete modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [confirmStoreName, setConfirmStoreName] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchMerchantDetails = useCallback(async (merchantId: string) => {
    setLoadingDetails(true)
    try {
      const res = await fetch(`/api/merchant/${merchantId}`)
      if (res.ok) {
        const data = await res.json()
        setDetails(data.merchant)
        setStats(data.stats)
      }
    } catch (err) {
      console.error("Failed to load merchant details:", err)
    } finally {
      setLoadingDetails(false)
    }
  }, [])

  useEffect(() => {
    if (!activeMerchant?.id) return
    fetchMerchantDetails(activeMerchant.id)

    // Check localStorage for saved active token
    const cached = typeof window !== "undefined" ? localStorage.getItem(`nexus_token_${activeMerchant.id}`) : null
    if (cached && !cached.includes("...")) {
      setLivePlainToken(cached)
    } else {
      // Auto-generate an active token if none is cached, ensuring cURL is always ready to run
      fetch(`/api/merchant/${activeMerchant.id}/token`, { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (data.token) {
            setLivePlainToken(data.token)
            if (typeof window !== "undefined") {
              localStorage.setItem(`nexus_token_${activeMerchant.id}`, data.token)
            }
          }
        })
        .catch((err) => console.error("Auto-token generation error:", err))
    }
  }, [activeMerchant?.id, fetchMerchantDetails])

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleRegenerateToken = async () => {
    if (!activeMerchant?.id) return
    setRegeneratingToken(true)
    setNotification(null)
    try {
      const res = await fetch(`/api/merchant/${activeMerchant.id}/token`, {
        method: "POST",
      })
      const data = await res.json()
      if (res.ok && data.token) {
        setLivePlainToken(data.token)
        if (typeof window !== "undefined") {
          localStorage.setItem(`nexus_token_${activeMerchant.id}`, data.token)
        }
        if (details) {
          setDetails({ ...details, token_preview: data.preview })
        }
        copyText("token", data.token)
        setNotification({
          type: "success",
          message: "New MaaS Bearer token generated and copied to clipboard!",
        })
      } else {
        setNotification({
          type: "error",
          message: data.error || "Failed to regenerate token",
        })
      }
    } catch (err: any) {
      setNotification({
        type: "error",
        message: err.message || "Failed to regenerate token",
      })
    } finally {
      setRegeneratingToken(false)
    }
  }

  const handleDeleteStore = async () => {
    if (!activeMerchant?.id) return
    setIsDeleting(true)
    setNotification(null)

    try {
      const res = await fetch(`/api/merchant/${activeMerchant.id}`, {
        method: "DELETE",
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setDeleteDialogOpen(false)
        await refreshMerchants()

        if (data.next_merchant) {
          await setActiveMerchantId(data.next_merchant.id)
          setNotification({
            type: "success",
            message: data.message,
          })
        } else {
          router.push("/dashboard/onboard")
        }
      } else {
        setNotification({
          type: "error",
          message: data.error || "Failed to delete store",
        })
      }
    } catch (err: any) {
      setNotification({
        type: "error",
        message: err.message || "Network error while deleting store",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const currentToken =
    livePlainToken ||
    (details?.token_preview && !details.token_preview.includes("...") ? details.token_preview : null) ||
    "YOUR_MAAS_TOKEN"
  const merchantId = activeMerchant?.id || "merchant_id"
  const sampleProduct = stats?.sample_product || "Pro ANC Noise-Cancelling Headphones"

  const transactCurlCommand = `curl -X POST http://localhost:3000/api/maas/${merchantId}/transact \\
  -H "Authorization: Bearer ${currentToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "intent": "Buy 1 ${sampleProduct}",
    "buyer": {
      "email": "agent@buyer.ai",
      "ip": "198.51.100.42",
      "device_id": "dev_agent_01"
    }
  }'`

  const catalogCurlCommand = `curl -X GET "http://localhost:3000/api/maas/${merchantId}/catalog?q=headphones" \\
  -H "Authorization: Bearer ${currentToken}"`

  return (
    <div className="max-w-4xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Merchant Settings</h1>
        <p className="text-sm text-zinc-400">
          Manage your Razorpay test-mode keys, MaaS Bearer tokens, integration cURL commands, and store lifecycle.
        </p>
      </div>

      {notification && (
        <Alert
          variant={notification.type === "error" ? "destructive" : "default"}
          className={
            notification.type === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }
        >
          <AlertDescription className="text-xs">{notification.message}</AlertDescription>
        </Alert>
      )}

      {/* Store Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Store Profile</CardTitle>
              <CardDescription>Live account details and inventory statistics on the Nexus gateway.</CardDescription>
            </div>
            {details?.is_active && (
              <Badge variant="allow" className="text-xs">
                Active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Contact Email</label>
              <Input value={activeMerchant?.email || details?.email || ""} disabled className="opacity-80" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Registered Since</label>
              <Input
                value={
                  details?.created_at
                    ? new Date(details.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—"
                }
                disabled
                className="opacity-80 font-mono text-xs"
              />
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 flex items-center space-x-3">
              <div className="p-2 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Catalog Products</p>
                <p className="text-base font-mono font-bold text-zinc-200">
                  {loadingDetails ? "..." : stats?.product_count ?? 0}
                </p>
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 flex items-center space-x-3">
              <div className="p-2 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                <History className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Transactions</p>
                <p className="text-base font-mono font-bold text-zinc-200">
                  {loadingDetails ? "..." : stats?.transaction_count ?? 0}
                </p>
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 flex items-center space-x-3">
              <div className="p-2 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Audit Logs</p>
                <p className="text-base font-mono font-bold text-zinc-200">
                  {loadingDetails ? "..." : stats?.audit_entry_count ?? 0}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MaaS Agent API & cURL Command (Interactive Terminal) */}
      <Card className="border-indigo-500/20 bg-indigo-950/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-indigo-400" />
              <CardTitle>Merchant-as-an-API (MaaS) cURL Commands</CardTitle>
            </div>
            <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 text-xs">
              Agent Gateway
            </Badge>
          </div>
          <CardDescription>
            Autonomous AI buyers interact with your store using these standardized REST commands. Use the copy button to test directly in your terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bearer Token Row */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-zinc-400">MaaS Bearer Token</label>
              <span className="text-[11px] text-zinc-500 font-mono">
                {livePlainToken ? "Freshly generated (in memory)" : "Hashed at rest (SHA-256)"}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <code className="font-mono text-xs bg-zinc-950 px-3 py-2 rounded border border-zinc-800 flex-1 truncate text-zinc-200">
                {currentToken}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-800 shrink-0"
                onClick={() => copyText("token", currentToken)}
              >
                {copiedKey === "token" ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 shrink-0"
                onClick={handleRegenerateToken}
                disabled={regeneratingToken || !activeMerchant?.id}
              >
                {regeneratingToken ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate Token
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex space-x-2 border-b border-zinc-800 pt-2 pb-1">
            <button
              onClick={() => setActiveCommandTab("transact")}
              className={`text-xs px-3 py-1.5 font-medium rounded-t-md transition-colors ${
                activeCommandTab === "transact"
                  ? "bg-zinc-800 text-white border-b-2 border-indigo-400"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Autonomous Transact (POST)
            </button>
            <button
              onClick={() => setActiveCommandTab("catalog")}
              className={`text-xs px-3 py-1.5 font-medium rounded-t-md transition-colors ${
                activeCommandTab === "catalog"
                  ? "bg-zinc-800 text-white border-b-2 border-indigo-400"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Catalog Discovery (GET)
            </button>
          </div>

          {/* cURL Snippet Display */}
          <div className="relative">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>
                {activeCommandTab === "transact"
                  ? "Executes 6-step deterministic pipeline (Intent → Catalog → Trust Graph → Order → Capture → Audit)"
                  : "Vector and keyword search across merchant inventory"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-zinc-300 hover:text-white"
                onClick={() =>
                  copyText(
                    activeCommandTab,
                    activeCommandTab === "transact" ? transactCurlCommand : catalogCurlCommand
                  )
                }
              >
                {copiedKey === activeCommandTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy cURL
                  </>
                )}
              </Button>
            </div>

            <pre className="p-4 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed shadow-inner">
              {activeCommandTab === "transact" ? transactCurlCommand : catalogCurlCommand}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Razorpay Test Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <KeyRound className="w-5 h-5 text-emerald-400" />
            <CardTitle>Razorpay Test API Keys</CardTitle>
          </div>
          <CardDescription>
            Test mode key pair for order authorization and autonomous payment capture.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Test Key ID</label>
            <Input
              value={details?.razorpay_key_id || "rzp_test_..."}
              disabled
              className="font-mono text-xs opacity-90"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Test Key Secret</label>
            <div className="flex items-center space-x-2">
              <Input
                type="password"
                value="••••••••••••••••••••••••"
                disabled
                className="font-mono text-xs flex-1 opacity-80"
              />
              <Badge variant="allow" className="shrink-0">
                AES-256-GCM Encrypted
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Autonomous Commerce & Webhooks */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Webhook className="w-5 h-5 text-emerald-400" />
            <CardTitle>Webhook Notifications</CardTitle>
          </div>
          <CardDescription>
            Cryptographically signed event listener for test payment captures and settlement status.
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
            <p className="text-xs text-zinc-400 leading-relaxed">
              Nexus validates the <code className="text-zinc-300">X-Razorpay-Signature</code> header using timing-safe HMAC-SHA256 comparison via <code className="text-zinc-300">crypto.timingSafeEqual</code> against secret: <span className="font-mono text-zinc-300">{details?.razorpay_webhook_secret || "whsec_nexus_test_secret"}</span>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* DANGER ZONE: Unregister & Delete Store */}
      <Card className="border-rose-500/30 bg-rose-950/10">
        <CardHeader>
          <div className="flex items-center space-x-2 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <CardTitle className="text-rose-400">Danger Zone: Unregister & Wipe Store</CardTitle>
          </div>
          <CardDescription className="text-rose-300/70">
            Irreversible actions that completely delete your store and purge all linked records from the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Unregistering this store will permanently delete its account credentials, API tokens, all{" "}
            <span className="font-semibold text-white">{stats?.product_count ?? 0} products</span> in the catalog, all{" "}
            <span className="font-semibold text-white">{stats?.transaction_count ?? 0} transaction records</span>, and all{" "}
            <span className="font-semibold text-white">{stats?.audit_entry_count ?? 0} cryptographic audit logs</span> from the database. This action cannot be recovered.
          </p>

          <div className="pt-2">
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs flex items-center space-x-2"
                  disabled={!activeMerchant?.id}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Unregister & Delete Store
                </Button>
              </DialogTrigger>
              <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-md">
                <DialogHeader>
                  <div className="flex items-center space-x-2 text-rose-400 mb-1">
                    <AlertTriangle className="w-5 h-5" />
                    <DialogTitle className="text-white text-base">Unregister Store Confirmation</DialogTitle>
                  </div>
                  <DialogDescription className="text-zinc-400 text-xs leading-relaxed">
                    This will permanently drop <strong className="text-white">{activeMerchant?.name}</strong> and all linked data (catalog, embeddings, orders, and cryptographic audit entries) from the database.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-3 border-y border-zinc-800/80 my-2">
                  <div className="bg-zinc-900/80 rounded-md p-3 text-xs text-zinc-300 space-y-1 font-mono">
                    <p className="text-zinc-400">Records to be purged:</p>
                    <p className="text-rose-400">• {stats?.product_count ?? 0} Catalog Products & Vector Embeddings</p>
                    <p className="text-rose-400">• {stats?.transaction_count ?? 0} Orders & Transactions</p>
                    <p className="text-rose-400">• {stats?.audit_entry_count ?? 0} Cryptographic Audit Logs</p>
                    <p className="text-rose-400">• Merchant API Keys & MaaS Bearer Hash</p>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-300 block mb-1.5">
                      To confirm, type the store name <code className="text-white font-bold bg-zinc-900 px-1 py-0.5 rounded">{activeMerchant?.name}</code> below:
                    </label>
                    <Input
                      value={confirmStoreName}
                      onChange={(e) => setConfirmStoreName(e.target.value)}
                      placeholder={activeMerchant?.name}
                      className="text-xs bg-zinc-900 border-zinc-700 text-white"
                      autoFocus
                    />
                  </div>
                </div>

                <DialogFooter className="flex space-x-2 sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeleteDialogOpen(false)
                      setConfirmStoreName("")
                    }}
                    disabled={isDeleting}
                    className="border-zinc-800 text-zinc-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteStore}
                    disabled={confirmStoreName.trim() !== activeMerchant?.name?.trim() || isDeleting}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Deleting...
                      </>
                    ) : (
                      "I understand, delete store"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
