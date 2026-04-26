# Seller OS Roadmap

## Current Prototype

This repo is a static single-file dashboard:

- `index.html` contains all HTML, CSS, and JavaScript.
- Vercel serves it as a static site.
- The app reads Google Sheets directly from the browser.
- Production is connected to GitHub and deploys from `main`.

The prototype already proves the core idea: one command center can combine store performance, listing activity, profit splits, charts, projections, client views, and operator accountability.

## Product Vision

Seller OS should become a read-only, multi-store operating system for ecommerce operations.

Primary roles:

- Admin: full network view across stores, platforms, operators, clients, and prep flow.
- Client: limited view for one store or portfolio, focused on clear outcomes.
- Operator: assigned-store performance, listing accountability, bottlenecks, and daily actions.

Primary platforms:

- eBay
- Amazon reporting via Sellerboard/report imports first; direct Amazon SP-API is deferred
- TikTok Shop
- Prep center / inventory flow
- Google Sheets as a temporary bridge while real integrations are added

The system should never automate platform accounts or browser sessions. Store connections should be read-only and token-based, using official APIs and OAuth where available.

## Target Data Model

Everything should flow into normalized entities instead of platform-specific dashboards:

- `stores`: store identity, platform, owner/client, operator assignments, status.
- `orders`: order date, revenue, fees, cost, profit, SKU/product references.
- `listings`: active listings, created date, platform status, operator attribution.
- `inventory_events`: supplier, prep, received, shipped, live, sold, stranded, returned.
- `daily_metrics`: store/day aggregates for fast charts and summaries.
- `users`: admin, operator, client roles and permissions.
- `connections`: per-store OAuth/API credentials, encrypted and isolated.
- `alerts`: generated findings, risks, and daily action items.

## Practical Build Layers

### Layer 1: Stabilize the Existing Dashboard

- Split the single `index.html` into maintainable source files.
- Add a local dev workflow with `package.json`.
- Add fixture data so the dashboard can be tested without live Google Sheets access.
- Add basic linting/formatting.
- Document the data columns expected from each Google Sheet.
- Keep Vercel deployment simple and fast.

### Layer 2: Add a Backend

- Move API keys and data fetching out of the browser.
- Add server routes for Google Sheets reads.
- Cache normalized data server-side.
- Prevent clients/operators from seeing stores they do not own or manage.
- Add a proper auth layer.

### Layer 3: Normalize Multi-Platform Data

- Keep Google Sheets as one connector.
- Add eBay API ingestion.
- Add TikTok Shop API ingestion.
- Add Amazon reporting through Sellerboard exports, scheduled reports, Google Sheets, email attachments, or an official Sellerboard API if available.
- Defer direct Amazon Selling Partner API multi-account linking unless platform/compliance risk is reviewed and accepted.
- Store all platform data in the shared data model.

### Layer 4: Decision Layer

- Daily summary: what changed since yesterday.
- Risk alerts: stalled stores, falling profit, fee spikes, missing listing activity.
- Opportunity alerts: high ROI stores, scaling candidates, operator wins.
- Prep bottlenecks: supplier to prep to live to sold cycle time.
- Phone delivery through SMS or Telegram.

### Layer 5: Productize

- Onboarding flow for new stores and clients.
- Per-store connection status and sync logs.
- Billing-ready roles and permissions.
- Audit logs for data access.
- White-label or client-facing portal.

## Completed Work

### Layer 1 ✅
- Refactored from single `index.html` into `index.html` + `styles.css` + `app.js`
- Vercel deployment live from `main` branch via GitHub auto-deploy
- Repo: `jonahrindner321-debug/ebay-dashboard`

### Layer 2 — In progress
- ✅ Google API key moved server-side: `api/sheets.js` Vercel serverless function
  - Set `GOOGLE_API_KEY` in Vercel project env vars
  - Set Google Cloud Console API key Application restrictions to "None" (key is server-side only, HTTP referrer restrictions don't apply; API restriction to Sheets API is the real protection)
  - `_proxyOk` flag in `app.js` handles proxy → direct Google API fallback automatically
- ✅ Client link lockdown: `#client=<slug>` deep links lock the user into that view
  - Exit button is hidden, `closeClientView()` is blocked via `_clientOnlyMode` flag
  - Admins opening a client from inside the dashboard still see the Exit button
- ✅ TikTok Shop connector foundation
  - Header button: `⟡ Link TikTok`
  - OAuth routes: `api/tiktok/connect` and `api/tiktok/callback`
  - Connection status route: `api/tiktok/status`
  - Neon Postgres schema for clients, stores, platform connections, encrypted tokens, and sync runs
  - TikTok connections can be attached to the selected dashboard store/client during OAuth
  - Encrypted HttpOnly cookie remains only as a prototype fallback if `DATABASE_URL` is missing
  - Placeholder read-only data routes: `api/tiktok/orders` and `api/tiktok/products`
  - No posting, account control, scraping, or write scopes
- ✅ TikTok Shop Partner Center setup progress
  - Custom app created for Seller OS
  - Redirect URL set to production callback
  - Read-only scopes enabled for orders, products/categories, finance, and bestsellers
  - Vercel env vars set for TikTok Shop `shop_v2` OAuth/token endpoints
  - Security/privacy questionnaires submitted and awaiting TikTok review
- ✅ Public compliance/policy pages
  - Privacy Policy
  - Security Policy
  - Data Deletion Policy
  - Terms of Use
  - Security/privacy contact page
  - Dashboard footer links to the legal pages
- ✅ Amazon data strategy decision
  - Do not directly link multiple Amazon seller accounts to Seller OS right now
  - Use Sellerboard or a similar established Amazon analytics/reporting tool as the safer bridge
  - Ingest Sellerboard-generated exports, scheduled reports, Google Sheets outputs, email attachments, or an official Sellerboard API if available
  - Keep Amazon data read-only and mapped per store/client inside Seller OS

### Immediate Next Steps

1. **Finalize TikTok app setup**
   - Wait for TikTok review to pass for company/app category/security/privacy items
   - Publish the custom app once TikTok allows it
   - Complete first seller OAuth from the live dashboard
   - Confirm `/api/tiktok/status` shows a stored database connection
2. **Wire TikTok data reads**
   - Add signed, read-only TikTok Shop order/product requests after app approval
   - Normalize TikTok orders into the existing Seller OS row model
   - Keep TikTok data read-only
3. **Amazon via Sellerboard/import bridge**
   - Get one sample Sellerboard export or scheduled report from a non-sensitive test account/report
   - Define the normalized Amazon import schema: date, store, revenue, orders, fees, COGS, net profit, SKU/product where available
   - Build a manual CSV/XLSX or Google Sheets importer first
   - Add store/client mapping so imported Amazon rows cannot bleed across clients
   - Later, add automated email/Drive ingestion or an official Sellerboard API integration if Sellerboard supports it
4. **Real auth** — Password-protect the dashboard using a signed token system:
   - `api/auth.js` endpoint: checks `DASHBOARD_PASSWORD` env var, returns a signed token (HMAC-SHA256 via Node built-in `crypto`, no npm packages)
   - Token format: `${expiry_unix_timestamp}.${hmac(expiry, TOKEN_SECRET)}`
   - `api/sheets.js` validates token on every request
   - Frontend shows auth overlay on load; client `#client=` links bypass auth entirely
   - Env vars needed: `DASHBOARD_PASSWORD`, `TOKEN_SECRET`
5. Add mock/fixture data so local development works without production API access.
6. Add role-aware backend permission enforcement (not just hidden UI).

## Safety Rules

- No browser scraping of Seller Central, TikTok Shop, or eBay accounts.
- No account-control automation.
- No direct multi-account Amazon SP-API linking until platform/linkage risk is reviewed.
- No Sellerboard scraping; use exports, scheduled reports, Sheets/email delivery, or official API access.
- No shared credentials between stores.
- Store tokens must be encrypted and scoped per platform/store.
- Client and operator views must be enforced by backend permissions, not just hidden UI.
