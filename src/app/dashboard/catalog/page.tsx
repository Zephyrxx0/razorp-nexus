"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  Package,
  Plus,
  Upload,
  Bot,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Minus,
  Sparkles,
} from "lucide-react"
import { useMerchant } from "@/components/providers/merchant-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { CatalogModal } from "@/components/dashboard/catalog-modal"
import { AiAgentViewDrawer } from "@/components/dashboard/ai-agent-view-drawer"

interface Product {
  id: string
  merchant_id: string
  name: string
  description: string
  price_paise: number
  stock_quantity: number
  category: string
  is_ai_purchasable: boolean
  has_embedding?: boolean
}

export default function CatalogPage() {
  const { activeMerchant } = useMerchant()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  // Modal and drawer state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchProducts = async () => {
    if (!activeMerchant?.id) return
    try {
      setLoading(true)
      const res = await fetch(`/api/merchant/products?merchant_id=${activeMerchant.id}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
      }
    } catch (e: any) {
      setNotification({ type: "error", msg: "Failed to load products" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [activeMerchant?.id])

  const handleSaveProduct = async (productData: Partial<Product>) => {
    if (!activeMerchant?.id) return
    const isEdit = Boolean(productData.id)

    if (isEdit) {
      const res = await fetch("/api/merchant/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...productData,
          merchant_id: activeMerchant.id,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to update product")
      }
      setNotification({ type: "success", msg: "Product updated & embeddings synchronized" })
    } else {
      const res = await fetch("/api/merchant/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...productData,
          merchant_id: activeMerchant.id,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create product")
      }
      setNotification({ type: "success", msg: "Product added & embeddings generated" })
    }

    await fetchProducts()
    setTimeout(() => setNotification(null), 3500)
  }

  const handleDeleteProduct = async (id: string) => {
    if (!activeMerchant?.id) return
    if (!confirm("Are you sure you want to remove this product from the catalog?")) return

    try {
      const res = await fetch(`/api/merchant/products?id=${id}&merchant_id=${activeMerchant.id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== id))
        setNotification({ type: "success", msg: "Product removed" })
      }
    } catch (e) {
      setNotification({ type: "error", msg: "Failed to delete product" })
    }
    setTimeout(() => setNotification(null), 3000)
  }

  const handleToggleAiPurchasable = async (product: Product) => {
    if (!activeMerchant?.id) return
    const newStatus = !product.is_ai_purchasable

    // Optimistic UI update
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_ai_purchasable: newStatus } : p))
    )

    try {
      await fetch("/api/merchant/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          merchant_id: activeMerchant.id,
          is_ai_purchasable: newStatus,
        }),
      })
    } catch (e) {
      // Rollback on failure
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_ai_purchasable: !newStatus } : p))
      )
      setNotification({ type: "error", msg: "Failed to update AI availability" })
    }
  }

  const handleUpdateStock = async (product: Product, delta: number) => {
    if (!activeMerchant?.id) return
    const newStock = Math.max(0, product.stock_quantity + delta)

    // Optimistic UI update
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, stock_quantity: newStock } : p))
    )

    try {
      await fetch("/api/merchant/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          merchant_id: activeMerchant.id,
          stock_quantity: newStock,
        }),
      })
    } catch (e) {
      // Rollback
      fetchProducts()
    }
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeMerchant?.id) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
        if (lines.length < 2) {
          setNotification({ type: "error", msg: "CSV file is empty or missing headers" })
          return
        }

        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
        const nameIdx = headers.indexOf("name")
        const descIdx = headers.indexOf("description")
        const priceIdx = headers.indexOf("price_inr") !== -1 ? headers.indexOf("price_inr") : headers.indexOf("price")
        const stockIdx = headers.indexOf("stock")
        const catIdx = headers.indexOf("category")

        if (nameIdx === -1 || priceIdx === -1) {
          setNotification({ type: "error", msg: "CSV must contain at least 'name' and 'price_inr' columns" })
          return
        }

        const items = []
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim())
          if (cols.length <= nameIdx || !cols[nameIdx]) continue

          const priceVal = parseFloat(cols[priceIdx]) || 0
          items.push({
            merchant_id: activeMerchant.id,
            name: cols[nameIdx],
            description: descIdx !== -1 ? cols[descIdx] : "",
            price_paise: Math.round(priceVal * 100),
            stock_quantity: stockIdx !== -1 ? parseInt(cols[stockIdx], 10) || 10 : 10,
            category: catIdx !== -1 ? cols[catIdx] : "General",
            is_ai_purchasable: true,
          })
        }

        if (items.length > 0) {
          const res = await fetch("/api/merchant/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(items),
          })
          if (res.ok) {
            setNotification({ type: "success", msg: `Imported ${items.length} products with Gemini embeddings` })
            fetchProducts()
          } else {
            setNotification({ type: "error", msg: "Failed to upload products from CSV" })
          }
        }
      } catch (err: any) {
        setNotification({ type: "error", msg: `CSV parsing error: ${err.message}` })
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const catalogJsonPreview = {
    merchant_id: activeMerchant?.id,
    merchant_name: activeMerchant?.name,
    items: products
      .filter((p) => p.is_ai_purchasable && p.stock_quantity > 0)
      .map((p) => ({
        product_id: p.id,
        name: p.name,
        description: p.description,
        price_paise: p.price_paise,
        price_formatted: `₹${(p.price_paise / 100).toLocaleString("en-IN")}`,
        currency: "INR",
        stock: p.stock_quantity,
        category: p.category,
        agent_purchase_url: `/api/maas/${activeMerchant?.id}/transact`,
      })),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Catalog Management</h1>
          <p className="text-sm text-zinc-400">
            Configure stock, prices, and AI buying availability for autonomous commerce.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleCsvUpload}
            accept=".csv"
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="border-zinc-800"
          >
            <Upload className="w-4 h-4 mr-2" /> Upload CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAiDrawerOpen(true)}
            className="border-zinc-800"
          >
            <Bot className="w-4 h-4 mr-2 text-emerald-400" /> AI Agent View
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setEditingProduct(null)
              setModalOpen(true)
            }}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Product
          </Button>
        </div>
      </div>

      {notification && (
        <Alert
          variant={notification.type === "success" ? "success" : "destructive"}
          className="py-2.5"
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <AlertDescription className="text-xs font-medium">
            {notification.msg}
          </AlertDescription>
        </Alert>
      )}

      {products.length === 0 && !loading ? (
        <Card className="border-dashed border-zinc-800 bg-zinc-950/40 text-center py-16">
          <CardContent className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
              <Package className="w-6 h-6" />
            </div>
            <CardTitle className="text-base text-zinc-200">No products in catalog</CardTitle>
            <CardDescription className="max-w-sm mx-auto text-xs">
              Add products or import a CSV file to make your inventory discoverable by AI purchasing agents.
            </CardDescription>
            <div className="pt-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditingProduct(null)
                  setModalOpen(true)
                }}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Product to Catalog
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-zinc-800 bg-zinc-900/50">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="w-[300px]">Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price (₹)</TableHead>
                <TableHead>Stock Level</TableHead>
                <TableHead>AI Purchasable</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id} className="border-zinc-800">
                  <TableCell>
                    <div className="font-medium text-white text-sm">{p.name}</div>
                    <div className="text-xs text-zinc-400 line-clamp-1 max-w-[280px]">
                      {p.description}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px] font-normal border-zinc-800">
                      {p.category || "General"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-zinc-200">
                    ₹{(p.price_paise / 100).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-6 w-6 border-zinc-800"
                        onClick={() => handleUpdateStock(p, -1)}
                        disabled={p.stock_quantity <= 0}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span
                        className={`font-mono text-xs w-6 text-center ${
                          p.stock_quantity === 0 ? "text-red-400 font-bold" : "text-zinc-200"
                        }`}
                      >
                        {p.stock_quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-6 w-6 border-zinc-800"
                        onClick={() => handleUpdateStock(p, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={p.is_ai_purchasable}
                        onCheckedChange={() => handleToggleAiPurchasable(p)}
                      />
                      <span className="text-xs text-zinc-400">
                        {p.is_ai_purchasable ? "Active" : "Disabled"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-zinc-400 hover:text-white"
                        onClick={() => {
                          setEditingProduct(p)
                          setModalOpen(true)
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-zinc-400 hover:text-red-400"
                        onClick={() => handleDeleteProduct(p.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Catalog Create/Edit Modal */}
      <CatalogModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        product={editingProduct}
        onSave={handleSaveProduct}
      />

      {/* AI Agent Machine-Readable View Drawer */}
      <AiAgentViewDrawer
        open={aiDrawerOpen}
        onOpenChange={setAiDrawerOpen}
        merchantId={activeMerchant?.id || ""}
        merchantName={activeMerchant?.name}
        catalogData={catalogJsonPreview}
      />
    </div>
  )
}
