import { describe, it, expect } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

describe("UI Components (shadcn / Radix primitives)", () => {
  it("renders Button with default and custom variants", () => {
    const { rerender } = render(<Button>Click me</Button>)
    const button = screen.getByRole("button", { name: /click me/i })
    expect(button).toBeDefined()
    expect(button.className).toContain("bg-primary")

    rerender(<Button variant="destructive">Delete</Button>)
    const deleteBtn = screen.getByRole("button", { name: /delete/i })
    expect(deleteBtn.className).toContain("bg-destructive")
  })

  it("renders Card with title and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Nexus Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Merchant metrics active</p>
        </CardContent>
      </Card>
    )
    expect(screen.getByText("Nexus Dashboard")).toBeDefined()
    expect(screen.getByText("Merchant metrics active")).toBeDefined()
  })

  it("renders Input with custom attributes", () => {
    render(<Input placeholder="Enter Razorpay Key" type="text" />)
    const input = screen.getByPlaceholderText("Enter Razorpay Key")
    expect(input).toBeDefined()
    expect(input.getAttribute("type")).toBe("text")
  })

  it("renders Alert with title and description", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Error Detected</AlertTitle>
        <AlertDescription>Invalid credentials provided</AlertDescription>
      </Alert>
    )
    expect(screen.getByRole("alert")).toBeDefined()
    expect(screen.getByText("Error Detected")).toBeDefined()
    expect(screen.getByText("Invalid credentials provided")).toBeDefined()
  })

  it("renders Badges with trust score variants (allow, review, deny)", () => {
    const { rerender } = render(<Badge variant="allow">ALLOW (95)</Badge>)
    expect(screen.getByText("ALLOW (95)").className).toContain("text-emerald-400")

    rerender(<Badge variant="review">REVIEW (50)</Badge>)
    expect(screen.getByText("REVIEW (50)").className).toContain("text-amber-400")

    rerender(<Badge variant="deny">DENY (15)</Badge>)
    expect(screen.getByText("DENY (15)").className).toContain("text-red-400")
  })

  it("renders Progress bar indicator with value", () => {
    const { container } = render(<Progress value={75} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeDefined()
  })
})
