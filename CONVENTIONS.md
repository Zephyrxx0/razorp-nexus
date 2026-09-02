# Conventions & Development Tools

## Web Framework Standard

- **Framework**: **Next.js 14 (App Router)** (`next@14.2.24`, `react@18.3.1`, `react-dom@18.3.1`).
- **Colocation**: Houses both the public Merchant-as-an-API (MaaS) gateway route handlers (`/api/maas/[merchant_id]/*`) and the merchant dashboard UI in a single TypeScript project.
- **Server Components & Route Handlers**: Isolate server secrets (AES keys, DB connections) completely from client components.
- **Money Model**: Strictly integer paise (`amount_paise`) throughout all schemas and handlers. Never use floating-point numbers for currency.

---

## CLI Tools Implementation

### 1. Obscura (`obscura`)
A lightweight headless browser engine with Chrome DevTools Protocol (CDP) server for web scraping, synthetic agent browsing, and frontend testing.

- **Primary Commands**:
  - `obscura fetch <URL>`: Fetch page content with full JavaScript execution.
  - `obscura scrape <URL>`: Scrape and extract clean LLM-ready markdown from web pages.
  - `obscura serve -p <PORT>`: Start headless browser CDP server (default port 9222).
  - `obscura mcp`: Run as Model Context Protocol server.
- **Critical Flags**:
  - `--allow-private-network`: Essential for local development against `http://localhost:3000` (Next.js) or `http://127.0.0.1:8000` (ADK), bypassing SSRF protections.
  - `--user-agent <STRING>`: Set custom User-Agent to emulate specific buyer agents.
  - `--storage-dir <PATH>`: Specify persistent session storage directory.

### 2. Graphify (`graphify`)
Code intelligence and knowledge graph builder that constructs structural AST and semantic dependency graphs across the codebase.

- **Primary Commands**:
  - `graphify extract <path>`: Extract AST and semantic relationships (`--backend gemini`, `--code-only`, `--postgres <DSN>` for live schema extraction).
  - `graphify query "<question>"`: Query code architecture and symbol relationships using semantic search.
  - `graphify path <source> <target>`: Trace call graphs and dependency paths between modules.
  - `graphify god-nodes`: Detect architectural hubs and high-centrality files/symbols.
  - `graphify tree`: Generate interactive D3 collapsible-tree visualization (`GRAPH_TREE.html`).
  - `graphify reflect`: Aggregate development feedback and outcomes into reflection lessons.

### 3. Fallow (`fallow` / `npx fallow`)
High-speed TypeScript and JavaScript codebase analyzer for dead code, unused dependencies, complexity hotspots, and architectural boundaries.

- **Primary Commands**:
  - `fallow dead-code`: Trace unused exports (`--trace <file>:<export>`), unreferenced dependencies (`--trace-dependency <name>`), and circular dependencies.
  - `fallow dupes`: Detect copy-paste and structural code duplication (`--trace dup:<fingerprint>`).
  - `fallow health`: Inspect cyclomatic complexity, maintainability hotspots (`--hotspots`), and test coverage gaps (`--coverage-gaps`).
  - `fallow audit --base <ref>`: Review changed files for dead code, complexity, and styling before opening a PR or committing.
  - `fallow guard <files>`: Enforce architecture boundary rules before editing files.
  - `fallow fix`: Auto-fix safe unused code findings.
