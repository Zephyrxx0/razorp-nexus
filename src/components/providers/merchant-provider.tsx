"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

export interface MerchantInfo {
  id: string
  name: string
  email: string
}

interface MerchantContextType {
  activeMerchant: MerchantInfo | null
  merchantsList: MerchantInfo[]
  isLoading: boolean
  setActiveMerchantId: (id: string) => Promise<void>
  refreshMerchants: () => Promise<void>
}

const MerchantContext = createContext<MerchantContextType>({
  activeMerchant: null,
  merchantsList: [],
  isLoading: true,
  setActiveMerchantId: async () => {},
  refreshMerchants: async () => {},
})

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const [activeMerchant, setActiveMerchant] = useState<MerchantInfo | null>(null)
  const [merchantsList, setMerchantsList] = useState<MerchantInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchMerchants = async () => {
    try {
      const listRes = await fetch("/api/merchant/list")
      if (listRes.ok) {
        const data = await listRes.json()
        setMerchantsList(data.merchants || [])
      }

      const sessionRes = await fetch("/api/merchant/session")
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json()
        if (sessionData.merchant) {
          setActiveMerchant(sessionData.merchant)
        }
      }
    } catch (e) {
      console.error("Failed to load merchants:", e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMerchants()
  }, [])

  const setActiveMerchantId = async (id: string) => {
    try {
      const res = await fetch("/api/merchant/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: id }),
      })
      if (res.ok) {
        const data = await res.json()
        setActiveMerchant(data.merchant)
      }
    } catch (e) {
      console.error("Failed to set active merchant:", e)
    }
  }

  return (
    <MerchantContext.Provider
      value={{
        activeMerchant,
        merchantsList,
        isLoading,
        setActiveMerchantId,
        refreshMerchants: fetchMerchants,
      }}
    >
      {children}
    </MerchantContext.Provider>
  )
}

export function useMerchant() {
  return useContext(MerchantContext)
}
