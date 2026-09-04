---
status: complete
quick_id: 260905-1mz
date: 2026-09-05
description: "Fix root layout missing html and body tags"
---

# Quick Task Summary: Fix Root Layout Missing HTML and Body Tags

## Summary
Resolved the Next.js App Router error `Missing required html tags: The following tags are missing in the Root Layout: <html>, <body>`.

## Changes Made
1. **Created Root Layout (`src/app/layout.tsx`)**:
   - Defined `<html>` (with `dark` theme class) and `<body>` tags enclosing `{children}`.
   - Imported `@/app/globals.css` to activate Tailwind styles across all routes.
   - Configured page metadata (title and description) for the NEXUS platform.
2. **Created Root Route (`src/app/page.tsx`)**:
   - Added server-side redirect from root `/` to `/dashboard/transactions`.
3. **Dependencies**:
   - Ran `npm install` to ensure missing package `@radix-ui/react-scroll-area` is available in `node_modules`.

## Verification
- `npm run build`: Successfully built all static and dynamic pages with 0 errors.
- `npm test`: All 15 test suites and 106 tests passed.
