import type { Metadata } from "next"
import "@/app/globals.css"

export const metadata: Metadata = {
  title: "NEXUS — Autonomous Agent Commerce & Trust Graph Platform",
  description:
    "Merchant-as-an-API (MaaS) gateway with real-time cross-merchant Trust Graph fraud ring defense.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
