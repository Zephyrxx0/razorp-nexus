"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Package,
  Cpu,
  Terminal,
  Play,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useMerchant } from "@/components/providers/merchant-provider"

export default function OnboardPage() {
  const router = useRouter()
  const { refreshMerchants, setActiveMerchantId } = useMerchant()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Step 1: Store info
  const [storeName, setStoreName] = useState("Apex Electronics")
  // Unique suffix per session so demo re-runs don't hit the duplicate-email constraint
  const [storeEmail, setStoreEmail] = useState(
    () => `merchant-${Math.random().toString(16).slice(2, 6)}@apex.io`
  )

  // Step 2: Razorpay test credentials
  const [keyId, setKeyId] = useState("rzp_test_Apex10203040")
  const [keySecret, setKeySecret] = useState("secret_ApexDevPass99")
  const [keyValidating, setKeyValidating] = useState(false)
  const [keyValidated, setKeyValidated] = useState(false)
  const [keyError, setKeyError] = useState("")

  // Step 3: Initial product
  const [prodName, setProdName] = useState("Pro ANC Noise-Cancelling Headphones")
  const [prodDesc, setProdDesc] = useState("High-fidelity active noise-cancelling Bluetooth 5.3 headphones with 40-hour battery life")
  const [prodPrice, setProdPrice] = useState("4999")
  const [prodStock, setProdStock] = useState("25")
  const [prodCategory, setProdCategory] = useState("Audio")

  // Step 5: Created delivery data
  const [createdData, setCreatedData] = useState<{
    merchant_id: string
    maas_token: string
    catalog_url: string
    transact_url: string
  } | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleValidateKeys = async () => {
    setKeyValidating(true)
    setKeyError("")
    try {
      const res = await fetch("/api/merchant/verify-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_id: keyId, key_secret: keySecret }),
      })
      const data = await res.json()
      if (data.valid) {
        setKeyValidated(true)
      } else {
        setKeyValidated(false)
        setKeyError(data.error || "Failed to validate credentials")
      }
    } catch (e: any) {
      setKeyError(e.message || "Failed to reach verification endpoint")
      setKeyValidated(false)
    } finally {
      setKeyValidating(false)
    }
  }

  const handleCompleteOnboarding = async () => {
    setLoading(true)
    setErrorMsg("")
    setStep(4) // Show progress step

    try {
      const res = await fetch("/api/merchant/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: storeName,
          email: storeEmail,
          key_id: keyId,
          key_secret: keySecret,
          initial_products: [
            {
              name: prodName,
              description: prodDesc,
              price_inr: prodPrice,
              stock: prodStock,
              category: prodCategory,
            },
          ],
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Onboarding failed")
      }

      setCreatedData(data)
      if (typeof window !== "undefined" && data.maas_token && data.merchant_id) {
        localStorage.setItem(`nexus_token_${data.merchant_id}`, data.maas_token)
      }
      await refreshMerchants()
      await setActiveMerchantId(data.merchant_id)
      setStep(5)
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to complete onboarding")
      setStep(3)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 2000)
  }

  const triggerSampleSimulation = async () => {
    if (!createdData?.merchant_id) return
    setSimulating(true)
    setSimResult(null)
    try {
      const res = await fetch("/api/merchant/test-transact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: createdData.merchant_id }),
      })
      const data = await res.json()
      if (res.ok) {
        setSimResult(`Transaction authorized! Status: ${data.status || "SUCCESS"} | Order: ${data.razorpay_order_id || "sim_rzp_order"}`)
      } else {
        setSimResult(`Simulation response: ${data.message || data.error}`)
      }
    } catch (e: any) {
      setSimResult(`Simulation error: ${e.message}`)
    } finally {
      setSimulating(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="max-w-2xl mx-auto py-6">
      {/* Step Indicators */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 mb-2">
          <span className={step >= 1 ? "text-emerald-400" : ""}>1. Store Profile</span>
          <span className={step >= 2 ? "text-emerald-400" : ""}>2. Razorpay Keys</span>
          <span className={step >= 3 ? "text-emerald-400" : ""}>3. Initial Catalog</span>
          <span className={step >= 5 ? "text-emerald-400" : ""}>4. Endpoints & Token</span>
        </div>
        <Progress value={step === 1 ? 25 : step === 2 ? 50 : step === 3 ? 75 : 100} />
      </div>

      {errorMsg && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>Onboarding Error</AlertTitle>
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Store Profile */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Welcome to Nexus MaaS</CardTitle>
            <CardDescription>
              Set up your merchant identity to expose your catalog to autonomous AI buyers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Store / Business Name</label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Apex Electronics"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Contact Email</label>
              <Input
                type="email"
                value={storeEmail}
                onChange={(e) => setStoreEmail(e.target.value)}
                placeholder="merchant@apex.io"
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={!storeName.trim() || !storeEmail.trim()}
            >
              Continue to Keys <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Razorpay Credentials */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <KeyRound className="w-5 h-5 text-emerald-400" />
              <CardTitle>Razorpay Test Credentials</CardTitle>
            </div>
            <CardDescription>
              Enter your test-mode API keys. All keys are encrypted at rest with AES-256-GCM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Razorpay Test Key ID</label>
              <Input
                value={keyId}
                onChange={(e) => {
                  setKeyId(e.target.value)
                  setKeyValidated(false)
                }}
                placeholder="rzp_test_..."
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Razorpay Test Key Secret</label>
              <Input
                type="password"
                value={keySecret}
                onChange={(e) => {
                  setKeySecret(e.target.value)
                  setKeyValidated(false)
                }}
                placeholder="••••••••••••••••"
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleValidateKeys}
                disabled={keyValidating || !keyId || !keySecret}
              >
                {keyValidating ? "Verifying with Razorpay..." : "Validate Credentials"}
              </Button>

              {keyValidated && (
                <div className="flex items-center text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Credentials Verified
                </div>
              )}
            </div>

            {keyError && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>Validation Failed</AlertTitle>
                <AlertDescription>{keyError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!keyId.startsWith("rzp_test_") || !keySecret}
            >
              Continue to Catalog <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Initial Catalog */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Package className="w-5 h-5 text-emerald-400" />
              <CardTitle>Initial Product Setup</CardTitle>
            </div>
            <CardDescription>
              Add a starter product to test autonomous AI agent discovery and semantic vector search.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Product Name</label>
              <Input
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="e.g. Mechanical Keyboard"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Detailed Description</label>
              <Input
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
                placeholder="Description used by Gemini for 768-dim vector embeddings"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">Price (₹ INR)</label>
                <Input
                  type="number"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  placeholder="4999"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">Initial Stock</label>
                <Input
                  type="number"
                  value={prodStock}
                  onChange={(e) => setProdStock(e.target.value)}
                  placeholder="25"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">Category</label>
                <Input
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                  placeholder="Audio"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button
              onClick={handleCompleteOnboarding}
              disabled={loading || !prodName.trim() || !prodPrice}
            >
              Save & Connect Razorpay <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Progress Indicator */}
      {step === 4 && (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center animate-pulse">
              <Cpu className="w-6 h-6 text-emerald-400" />
            </div>
            <CardTitle>Connecting Store to Nexus</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Encrypting merchant secrets, registering MaaS Bearer token, and synchronizing Gemini vector embeddings into pgvector...
            </CardDescription>
            <div className="max-w-xs mx-auto pt-4">
              <Progress value={75} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Endpoint Delivery Card */}
      {step === 5 && createdData && (
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <CardTitle>Store Onboarded & Active</CardTitle>
            </div>
            <CardDescription>
              Your store is registered on the Nexus gateway. Provide this Bearer token to autonomous AI buying agents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">MaaS Bearer Token</span>
                <Badge variant="allow">Active</Badge>
              </div>
              <div className="flex items-center space-x-2">
                <code className="font-mono text-xs bg-zinc-900 px-3 py-1.5 rounded border border-zinc-800 flex-1 truncate text-emerald-400">
                  {createdData.maas_token}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(createdData.maas_token)}
                >
                  {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 block">Agent Curl Command Snippet</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-zinc-300 hover:text-white"
                  onClick={() => {
                    const baseUrl = typeof window !== "undefined" && window.location.origin
                      ? window.location.origin
                      : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
                    const snippet = `curl -X POST ${baseUrl}${createdData.transact_url} \\
  -H "Authorization: Bearer ${createdData.maas_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "intent": "Buy 1 ${prodName}",
    "buyer": {
      "email": "agent@buyer.ai",
      "ip": "198.51.100.42",
      "device_id": "dev_agent_01"
    }
  }' | python3 -m json.tool`
                    navigator.clipboard.writeText(snippet)
                    setCopiedSnippet(true)
                    setTimeout(() => setCopiedSnippet(false), 2000)
                  }}
                >
                  {copiedSnippet ? (
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
              <pre className="font-mono text-xs bg-zinc-950 p-4 rounded-lg border border-zinc-800 text-zinc-300 overflow-x-auto whitespace-pre-wrap">
{`curl -X POST ${(typeof window !== "undefined" && window.location.origin) || "http://localhost:3000"}${createdData.transact_url} \\
  -H "Authorization: Bearer ${createdData.maas_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "intent": "Buy 1 ${prodName}",
    "buyer": {
      "email": "agent@buyer.ai",
      "ip": "198.51.100.42",
      "device_id": "dev_agent_01"
    }
  }' | python3 -m json.tool`}
              </pre>
            </div>

            {simResult && (
              <Alert variant="default" className="border-emerald-500/30 bg-emerald-500/10">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <AlertTitle className="text-emerald-400">Simulation Complete</AlertTitle>
                <AlertDescription className="text-zinc-300 font-mono text-xs">{simResult}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button
              variant="outline"
              onClick={triggerSampleSimulation}
              disabled={simulating}
            >
              <Play className="w-4 h-4 mr-2 text-emerald-400" />
              {simulating ? "Executing Simulation..." : "Trigger Sample Transaction"}
            </Button>
            <Button onClick={() => router.push("/dashboard/transactions")}>
              Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
