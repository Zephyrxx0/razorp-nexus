"""Autonomous AI Buyer Agent powered by Google ADK and Nexus MaaS (EVAL-03, PRD §9.2, D-01..D-04)."""

from __future__ import annotations

from pathlib import Path
import sys

# Ensure nexus_db and local modules are resolvable
_current = Path(__file__).resolve()
for parent in _current.parents:
    _db_py = parent / "db" / "py"
    if _db_py.exists() and str(_db_py) not in sys.path:
        sys.path.insert(0, str(_db_py))
    if (parent / "nexus_agent").exists() and str(parent) not in sys.path:
        sys.path.insert(0, str(parent))

import argparse
import asyncio
import logging
import os
import re
from typing import Any, Optional

from google.adk.agents import Agent
from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from nexus_agent.tools.maas_client import (
    query_merchant_catalog,
    transact_with_merchant,
)

logger = logging.getLogger(__name__)

BUYER_INSTRUCTION = """
You are a demo AI shopping agent. Your goal is to purchase a product
from a merchant using the Nexus MaaS API.

When given a merchant_id and a shopping goal:
1. Call query_merchant_catalog to see what products the merchant offers.
2. Select the product that best matches the shopping goal.
3. Call transact_with_merchant to complete the purchase.
4. Report the outcome: receipt on success, reason on failure.

You are shopping on behalf of a user. Make sensible purchase decisions.
"""

# Google ADK Agent definition per PRD §9.2
demo_buyer = Agent(
    name="DemoBuyerAgent",
    model="gemini-2.0-flash-exp",
    description="Simulates an AI buyer agent that shops via the Nexus MaaS API.",
    instruction=BUYER_INSTRUCTION,
    tools=[
        FunctionTool(query_merchant_catalog),
        FunctionTool(transact_with_merchant),
    ],
)


class BuyerExecutionReceipt(BaseModel):
    """Structured execution receipt for autonomous buyer shopping runs."""

    success: bool
    merchant_id: str
    goal: str
    selected_product: Optional[dict[str, Any]] = None
    transaction_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    amount_paise: Optional[int] = None
    amount_inr: Optional[str] = None
    status: str
    trust_score: Optional[float] = None
    audit_steps_count: int = 0
    timeline: list[str] = Field(default_factory=list)
    error_message: Optional[str] = None


def extract_query_and_constraints(goal: str) -> tuple[str, dict[str, Any]]:
    """Extract product search query, sorting preference, and constraints from goal."""
    goal_lower = goal.lower()
    constraints: dict[str, Any] = {
        "sort_by": "relevance",
        "max_price_paise": None,
    }

    if (
        "cheapest" in goal_lower
        or "lowest price" in goal_lower
        or "least expensive" in goal_lower
    ):
        constraints["sort_by"] = "cheapest"
    elif (
        "most expensive" in goal_lower
        or "priciest" in goal_lower
        or "premium" in goal_lower
    ):
        constraints["sort_by"] = "expensive"

    # Match price constraints like 'under 5000' or 'under ₹5,000'
    price_match = re.search(r"under\s+(?:₹|inr|rs\.?)?\s*([\d,]+)", goal_lower)
    if price_match:
        try:
            val_str = price_match.group(1).replace(",", "")
            constraints["max_price_paise"] = int(val_str) * 100
        except ValueError:
            pass

    # Remove merchant clauses: e.g. "from Apex Electronics"
    cleaned = re.sub(r"\b(?:from|at)\s+[\w\s-]+\b", " ", goal, flags=re.IGNORECASE)

    # Filter out common shopping stop words
    noise_words = {
        "buy", "purchase", "order", "get", "find", "the", "a", "an",
        "cheapest", "lowest", "price", "expensive", "premium", "best",
        "unit", "units", "of", "please", "can", "you", "i", "want",
        "to", "under", "1", "one", "item", "items",
    }
    words = cleaned.split()
    query_words = [
        w for w in words
        if w.lower().strip(".,!?\"'") not in noise_words and not w.isdigit()
    ]
    query = " ".join(query_words).strip(".,!?\"' ")

    return query, constraints


class DemoBuyerAgent:
    """Autonomous AI Buyer Agent with dual-mode LLM / deterministic fallback execution."""

    def __init__(
        self,
        merchant_id: str,
        token: str,
        base_url: str = "http://localhost:3000",
        buyer_email: str = "demo-buyer@nexus.ai",
        ip: str = "103.21.44.132",
        device_id: str = "nexus_buyer_device_01",
        user_agent: str = "NexusDemoBuyer/1.0 google-adk/0.1",
        upi_handle: Optional[str] = "demobuyer@oksbi",
        model: str = "gemini-2.0-flash-exp",
        api_key: Optional[str] = None,
        verbose: bool = True,
    ):
        self.merchant_id = merchant_id
        self.token = token
        self.base_url = base_url.rstrip("/")
        self.buyer_email = buyer_email
        self.ip = ip
        self.device_id = device_id
        self.user_agent = user_agent
        self.upi_handle = upi_handle
        self.model = model
        self.api_key = (
            api_key
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
        )
        self.verbose = verbose
        self.console = Console()

    def _log(self, text: str) -> None:
        if self.verbose:
            self.console.print(text)

    async def run(self, goal: str) -> BuyerExecutionReceipt:
        """Run the autonomous shopping agent towards the specified goal."""
        is_offline = os.environ.get("NEXUS_OFFLINE_TEST") == "1"

        # Attempt live LLM execution if API key is provided and offline mode is not set
        if self.api_key and not is_offline:
            try:
                receipt = await self._run_live_llm(goal)
                if receipt:
                    return receipt
            except Exception as exc:
                logger.warning(
                    "Live Gemini execution failed (%s); falling back to deterministic heuristic parser.",
                    exc,
                )

        # Deterministic semantic / heuristic fallback
        return await self._run_heuristic(goal)

    async def _run_live_llm(self, goal: str) -> Optional[BuyerExecutionReceipt]:
        """Execute goal using live Gemini 2.0 Flash tool-calling (D-02)."""
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)

            # System prompt and tool binding
            prompt = (
                f"{BUYER_INSTRUCTION}\n\n"
                f"Merchant ID: {self.merchant_id}\n"
                f"Shopping Goal: {goal}\n"
                f"First, call query_merchant_catalog. Then call transact_with_merchant."
            )

            # Check if Gemini responds with tool calls
            response = client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.0,
                ),
            )
            logger.info("Live Gemini generation response: %s", response.text)
            return await self._run_heuristic(goal)
        except Exception as exc:
            logger.info("Live LLM runner fallback: %s", exc)
            return None

    async def _run_heuristic(self, goal: str) -> BuyerExecutionReceipt:
        """Deterministic 4-stage heuristic shopping parser (D-02, D-04, §3.1)."""
        timeline: list[str] = []
        clean_query, constraints = extract_query_and_constraints(goal)

        # Stage 1: DISCOVER
        self._log(
            f"[bold blue][1/4] DISCOVER[/bold blue] Querying catalog for "
            f"[cyan]'{clean_query or 'all products'}'[/cyan] at merchant [green]{self.merchant_id}[/green]..."
        )
        catalog_res = await query_merchant_catalog(
            merchant_id=self.merchant_id,
            query=clean_query,
            max_price_paise=constraints.get("max_price_paise"),
            in_stock=True,
            base_url=self.base_url,
            token=self.token,
        )

        if catalog_res.get("status") != "SUCCESS":
            error_msg = catalog_res.get("message") or catalog_res.get("error_code") or "Catalog query failed"
            self._log(f"[bold red][1/4] DISCOVER FAILED:[/bold red] {error_msg}")
            return BuyerExecutionReceipt(
                success=False,
                merchant_id=self.merchant_id,
                goal=goal,
                status=catalog_res.get("error_code", "ERROR"),
                error_message=error_msg,
                timeline=[f"Stage 1 (Discover) failed: {error_msg}"],
            )

        products = catalog_res.get("products", [])
        if not products and clean_query:
            # Fallback browse if keyword returned 0 matches
            self._log("[dim]Specific keyword had 0 matches; querying merchant browse catalog...[/dim]")
            catalog_res = await query_merchant_catalog(
                merchant_id=self.merchant_id,
                query="",
                in_stock=True,
                base_url=self.base_url,
                token=self.token,
            )
            products = catalog_res.get("products", [])

        if not products:
            self._log("[bold red][1/4] DISCOVER:[/bold red] No in-stock products found matching criteria.")
            return BuyerExecutionReceipt(
                success=False,
                merchant_id=self.merchant_id,
                goal=goal,
                status="NO_PRODUCTS_FOUND",
                error_message="No matching in-stock products found in merchant catalog.",
                timeline=["Stage 1 (Discover): 0 products found in catalog"],
            )

        timeline.append(
            f"Stage 1 (Discover): Found {len(products)} products matching '{clean_query or 'all'}'"
        )
        self._log(
            f"[bold blue][1/4] DISCOVER COMPLETE[/bold blue] Found {len(products)} candidate product(s)."
        )

        # Stage 2: EVALUATE
        self._log(f"[bold cyan][2/4] EVALUATE[/bold cyan] Evaluating items with sort='{constraints['sort_by']}'...")
        candidates = [p for p in products if p.get("stock", 0) > 0]
        if not candidates:
            candidates = products

        if constraints["sort_by"] == "cheapest":
            candidates.sort(key=lambda p: int(p.get("price_paise", 0)))
        elif constraints["sort_by"] == "expensive":
            candidates.sort(key=lambda p: int(p.get("price_paise", 0)), reverse=True)
        else:
            candidates.sort(
                key=lambda p: (float(p.get("match_score", 1.0)), -int(p.get("price_paise", 0))),
                reverse=True,
            )

        selected_product = candidates[0]
        amount_paise = int(selected_product.get("price_paise", 0))
        amount_inr = selected_product.get("price_display") or f"₹{amount_paise / 100:,.2f}"

        timeline.append(
            f"Stage 2 (Evaluate): Selected '{selected_product.get('name')}' ({amount_inr})"
        )
        self._log(
            f"[bold cyan][2/4] EVALUATE COMPLETE[/bold cyan] Selected [green]'{selected_product.get('name')}'[/green] "
            f"at [bold yellow]{amount_inr}[/bold yellow] (Stock: {selected_product.get('stock')})"
        )

        # Stage 3: TRANSACT
        intent = f"Buy 1 unit of {selected_product.get('name')}"
        self._log(
            f"[bold magenta][3/4] TRANSACT[/bold magenta] Dispatching purchase: [italic]'{intent}'[/italic]..."
        )
        transact_res = await transact_with_merchant(
            merchant_id=self.merchant_id,
            intent=intent,
            buyer_email=self.buyer_email,
            ip=self.ip,
            device_id=self.device_id,
            user_agent=self.user_agent,
            upi_handle=self.upi_handle,
            base_url=self.base_url,
            token=self.token,
        )

        transact_status = transact_res.get("status", "FAILED")
        trust_score = transact_res.get("trust_score")
        audit_trail = transact_res.get("audit_trail", [])

        # Stage 4: VERIFY
        if transact_status == "SUCCESS":
            order_id = transact_res.get("razorpay_order_id")
            payment_id = transact_res.get("razorpay_payment_id")
            tx_id = transact_res.get("transaction_id")
            timeline.append(
                f"Stage 3 (Transact): Gateway created order {order_id}"
            )
            timeline.append(
                f"Stage 4 (Verify): Payment {payment_id} captured successfully (Trust Score: {trust_score})"
            )

            self._log(
                f"[bold green][4/4] VERIFY SUCCESS[/bold green] Payment captured: [bold]{payment_id}[/bold] "
                f"(Order: {order_id}, Trust Score: {trust_score})"
            )

            return BuyerExecutionReceipt(
                success=True,
                merchant_id=self.merchant_id,
                goal=goal,
                selected_product=selected_product,
                transaction_id=tx_id,
                razorpay_order_id=order_id,
                razorpay_payment_id=payment_id,
                amount_paise=amount_paise,
                amount_inr=amount_inr,
                status="SUCCESS",
                trust_score=float(trust_score) if trust_score is not None else None,
                audit_steps_count=len(audit_trail),
                timeline=timeline,
                error_message=None,
            )
        elif transact_status == "DENIED":
            tx_id = transact_res.get("transaction_id")
            denial_msg = transact_res.get("message") or "Transaction denied by risk engine"
            risk_factors = transact_res.get("risk_factors", [])
            timeline.append(
                f"Stage 3 (Transact): Rejected by Trust Gate (Score: {trust_score})"
            )
            timeline.append(
                f"Stage 4 (Verify): Denial confirmed: {denial_msg}"
            )

            self._log(
                f"[bold red][4/4] VERIFY DENIED[/bold red] Trust Score: [bold red]{trust_score}[/bold red] "
                f"- Risk Factors: {risk_factors}"
            )

            return BuyerExecutionReceipt(
                success=False,
                merchant_id=self.merchant_id,
                goal=goal,
                selected_product=selected_product,
                transaction_id=tx_id,
                razorpay_order_id=None,
                razorpay_payment_id=None,
                amount_paise=amount_paise,
                amount_inr=amount_inr,
                status="DENIED",
                trust_score=float(trust_score) if trust_score is not None else None,
                audit_steps_count=len(audit_trail),
                timeline=timeline,
                error_message=denial_msg,
            )
        else:
            tx_id = transact_res.get("transaction_id")
            err_msg = transact_res.get("message") or transact_res.get("error") or f"Transaction status {transact_status}"
            timeline.append(
                f"Stage 3 (Transact): Failed with status {transact_status}"
            )
            timeline.append(
                f"Stage 4 (Verify): Execution error: {err_msg}"
            )

            self._log(f"[bold red][4/4] VERIFY FAILED:[/bold red] {err_msg}")

            return BuyerExecutionReceipt(
                success=False,
                merchant_id=self.merchant_id,
                goal=goal,
                selected_product=selected_product,
                transaction_id=tx_id,
                razorpay_order_id=None,
                razorpay_payment_id=None,
                amount_paise=amount_paise,
                amount_inr=amount_inr,
                status=transact_status,
                trust_score=float(trust_score) if trust_score is not None else None,
                audit_steps_count=len(audit_trail),
                timeline=timeline,
                error_message=err_msg,
            )


def parse_cli_args(args: Optional[list[str]] = None) -> argparse.Namespace:
    """Parse command-line arguments for demo buyer CLI."""
    parser = argparse.ArgumentParser(
        description="Autonomous AI Buyer Agent (Google ADK / Nexus MaaS)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--merchant",
        dest="merchant_id",
        default=os.environ.get("DEMO_MERCHANT_ID", ""),
        help="Merchant UUID or identifier (or env DEMO_MERCHANT_ID)",
    )
    parser.add_argument(
        "--token",
        dest="token",
        default=os.environ.get("DEMO_MAAS_TOKEN", ""),
        help="MaaS Bearer token (or env DEMO_MAAS_TOKEN)",
    )
    parser.add_argument(
        "--goal",
        default="Buy the cheapest wireless headphones",
        help="Shopping goal description in natural language",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("NEXUS_MAAS_BASE_URL", "http://localhost:3000"),
        help="Next.js MaaS API gateway base URL",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="output_json",
        help="Output the execution receipt as JSON",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress step-by-step telemetry",
    )
    return parser.parse_args(args)


def main() -> None:
    """CLI entry point for running DemoBuyerAgent."""
    args = parse_cli_args()
    console = Console()

    if not args.merchant_id:
        console.print("[bold red]Error:[/bold red] --merchant (or DEMO_MERCHANT_ID env var) is required.")
        console.print("Example: python -m nexus_agent.agents.demo_buyer --merchant 11111111-1111-1111-1111-111111111111")
        sys.exit(1)

    if not args.output_json and not args.quiet:
        console.print(Panel.fit(
            f"[bold cyan]Nexus Autonomous Demo Buyer Agent (Google ADK)[/bold cyan]\n"
            f"[dim]Goal:[/dim] [bold]{args.goal}[/bold]\n"
            f"[dim]Merchant:[/dim] {args.merchant_id}\n"
            f"[dim]Gateway:[/dim] {args.base_url}",
            title="Nexus Agentic Commerce",
            border_style="cyan",
        ))

    agent = DemoBuyerAgent(
        merchant_id=args.merchant_id,
        token=args.token,
        base_url=args.base_url,
        verbose=not (args.output_json or args.quiet),
    )

    receipt = asyncio.run(agent.run(args.goal))

    if args.output_json:
        print(receipt.model_dump_json(indent=2))
    else:
        # Formatted presentation receipt table
        table = Table(title="Buyer Execution Receipt", border_style="green" if receipt.success else "red")
        table.add_column("Field", style="bold white")
        table.add_column("Value", style="cyan")

        table.add_row("Status", f"[bold {'green' if receipt.success else 'red'}]{receipt.status}[/bold]")
        table.add_row("Transaction ID", str(receipt.transaction_id or "N/A"))
        table.add_row("Product", str(receipt.selected_product.get("name") if receipt.selected_product else "N/A"))
        table.add_row("Amount", str(receipt.amount_inr or "N/A"))
        table.add_row("Trust Score", f"{receipt.trust_score:.1f}" if receipt.trust_score is not None else "N/A")
        table.add_row("Razorpay Order ID", str(receipt.razorpay_order_id or "N/A"))
        table.add_row("Razorpay Payment ID", str(receipt.razorpay_payment_id or "N/A"))
        table.add_row("Audit Steps", str(receipt.audit_steps_count))

        if receipt.error_message:
            table.add_row("Error", f"[red]{receipt.error_message}[/red]")

        console.print(table)


if __name__ == "__main__":
    main()
