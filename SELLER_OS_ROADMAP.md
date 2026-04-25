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
- Amazon Seller Central
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
- Add Amazon Selling Partner API ingestion.
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

## Immediate Next Steps

1. Turn this repo into a real app structure while preserving the current UI.
2. Add mock/fixture data so local development works without production API access.
3. Move secrets and Google API reads behind a backend route.
4. Add role-aware views before adding external platform APIs.
5. Add a daily summary generator using the existing normalized row data.

## Safety Rules

- No browser scraping of Seller Central, TikTok Shop, or eBay accounts.
- No account-control automation.
- No shared credentials between stores.
- Store tokens must be encrypted and scoped per platform/store.
- Client and operator views must be enforced by backend permissions, not just hidden UI.
