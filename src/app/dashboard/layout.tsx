import React from "react"
import { Header } from "@/components/dashboard/header"
import { MerchantProvider } from "@/components/providers/merchant-provider"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MerchantProvider>
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
          {children}
        </main>
      </div>
    </MerchantProvider>
  )
}
