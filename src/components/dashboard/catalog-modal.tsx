"use client"

import React, { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"

interface ProductItem {
  id?: string
  name: string
  description: string
  price_paise: number
  stock_quantity: number
  category: string
  is_ai_purchasable: boolean
}

interface CatalogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: ProductItem | null
  onSave: (productData: Partial<ProductItem>) => Promise<void>
}

export function CatalogModal({
  open,
  onOpenChange,
  product,
  onSave,
}: CatalogModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [priceInr, setPriceInr] = useState("")
  const [stock, setStock] = useState("10")
  const [category, setCategory] = useState("General")
  const [isAiPurchasable, setIsAiPurchasable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (product) {
      setName(product.name || "")
      setDescription(product.description || "")
      setPriceInr((product.price_paise / 100).toString())
      setStock(product.stock_quantity.toString())
      setCategory(product.category || "General")
      setIsAiPurchasable(product.is_ai_purchasable ?? true)
    } else {
      setName("")
      setDescription("")
      setPriceInr("")
      setStock("10")
      setCategory("General")
      setIsAiPurchasable(true)
    }
    setError("")
  }, [product, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("Product name is required")
      return
    }

    const parsedPrice = parseFloat(priceInr)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Please enter a valid non-negative price")
      return
    }

    const pricePaise = Math.round(parsedPrice * 100)
    const parsedStock = parseInt(stock, 10)
    if (isNaN(parsedStock) || parsedStock < 0) {
      setError("Please enter a valid stock quantity")
      return
    }

    setSaving(true)
    try {
      await onSave({
        id: product?.id,
        name: name.trim(),
        description: description.trim(),
        price_paise: pricePaise,
        stock_quantity: parsedStock,
        category: category.trim() || "General",
        is_ai_purchasable: isAiPurchasable,
      })
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to save product")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{product ? "Edit Product" : "Add Product to Catalog"}</DialogTitle>
            <DialogDescription>
              Products are indexed in pgvector using Gemini embeddings for autonomous agent discovery.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="p-3 my-3 text-xs rounded bg-red-950/40 border border-red-900/50 text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Product Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ergonomic Office Chair"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">
                Detailed Semantic Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description used by Gemini text-embedding-004..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">Price (₹ INR)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={priceInr}
                  onChange={(e) => setPriceInr(e.target.value)}
                  placeholder="1999.00"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">Stock Quantity</label>
                <Input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="10"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">Category</label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Furniture"
                />
              </div>
              <div className="flex items-center space-x-3 pt-4">
                <Switch
                  id="ai-switch"
                  checked={isAiPurchasable}
                  onCheckedChange={setIsAiPurchasable}
                />
                <label htmlFor="ai-switch" className="text-xs font-medium text-zinc-300 cursor-pointer">
                  AI Agent Purchasable
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving & Syncing..." : product ? "Save Changes" : "Add Product to Catalog"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
