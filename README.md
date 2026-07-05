# Seller OS Dashboard

Static Vercel dashboard prototype for multi-store ecommerce operations.

## Files

- `index.html` - page markup and layout
- `styles.css` - dashboard styling and responsive UI
- `app.js` - data loading, calculations, charts, filters, and interactions
- `api/sheets.js` - server-side Google Sheets proxy for Vercel
- `api/snapshot.js` - reads the free Seller OS snapshot sheet when configured
- `scripts/sync-seller-os-snapshot.cjs` - GitHub Actions worker that builds the snapshot
- `api/tiktok/*` - read-only TikTok Shop connector foundation
- `SELLER_OS_ROADMAP.md` - product and technical roadmap
- `HANDOFF.md` - current status, TikTok setup, review state, and next developer checklist
- `legal/*` - public privacy, security, data deletion, terms, and contact pages

## Local Preview

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:8000
```

The live Google Sheets API key may reject localhost if it is restricted to production domains. That is expected. Production currently runs on Vercel from the `main` branch.

## Deploy

Push changes to GitHub `main`; Vercel deploys the static site automatically.

For the latest working state and next-developer checklist, read [`HANDOFF.md`](./HANDOFF.md).

## Free Snapshot Worker

Seller OS does **not** use Neon/Postgres. The fast path is now a free Google Sheets snapshot:

```text
GitHub Actions cron -> scripts/sync-seller-os-snapshot.cjs -> snapshot Google Sheet
Seller OS -> /api/snapshot -> snapshot Google Sheet -> dashboard
```

If the snapshot is missing or misconfigured, the dashboard falls back to live Google Sheets loading.

GitHub requires a token with `workflow` scope to edit `.github/workflows/*`. If an agent cannot push workflow changes, copy `workflow-templates/sync-seller-os-snapshot.yml` into `.github/workflows/sync-dashboard.yml` manually after secrets are configured. Until then, the existing `/api/sync-dashboard` route is a no-op success response so the old cron does not touch Neon or spam failures.

One-time setup:

1. Create a Google Cloud service account and enable Google Sheets API.
2. Create a blank Google Sheet named something like `Seller OS Snapshot`.
3. Share that snapshot Sheet with the service account email as Editor.
4. Share each source store Sheet with the service account email as Viewer.
5. Add GitHub repository secrets:

```text
SELLER_OS_SNAPSHOT_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_API_KEY
```

`GOOGLE_SERVICE_ACCOUNT_JSON` can be the full service account JSON, or use `GOOGLE_SERVICE_ACCOUNT_EMAIL` plus `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

6. Add matching Vercel env vars so `/api/snapshot` can read the private snapshot Sheet:

```text
SELLER_OS_SNAPSHOT_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON
```

This avoids Google OAuth consent/app verification because no user is authorizing a public app. The service account is just a machine identity that the Sheets are explicitly shared with.

## TikTok Shop Connector

The TikTok connector is read-only by design. Database storage is disabled for Seller OS; do not add Neon/Postgres env vars back to this project. To enable the Connect button on Vercel, configure:

```text
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
TIKTOK_TOKEN_SECRET
TIKTOK_REDIRECT_URI=https://ebay-dashboard-gamma.vercel.app/api/tiktok/callback
TIKTOK_SCOPES=<approved read-only TikTok Shop scopes>
```

Partner Center setup notes:

- Complete Developer onboarding in TikTok Shop Partner Center.
- Create a Custom app first, not a Public App Store listing.
- Enable API access for the app.
- Use this Redirect URL: `https://ebay-dashboard-gamma.vercel.app/api/tiktok/callback`
- Choose the smallest read-only scopes TikTok approves for shops, orders, products, and finance/reporting data.

Optional advanced settings:

```text
TIKTOK_AUTH_URL
TIKTOK_TOKEN_URL
TIKTOK_TOKEN_STYLE=shop_v2
```

`shop_v2` uses TikTok Shop's authorization/token endpoint family. `oauth_v2` remains available for generic TikTok OAuth, and `shop_legacy` is kept as a fallback for older Shop Open API apps.

When linking TikTok from the dashboard, choose a store in the account filter first. Seller OS passes that store/client slug into the OAuth flow so the connected TikTok seller account is attached to the right store.

Current status: the TikTok Shop custom app has been created and configured in Vercel, read-only scopes have been enabled, security/privacy questionnaires have been submitted in TikTok Partner Center, and the app is waiting on TikTok review/publish before real seller OAuth can complete.

Public policy pages for review:

- `https://ebay-dashboard-gamma.vercel.app/legal/privacy.html`
- `https://ebay-dashboard-gamma.vercel.app/legal/security.html`
- `https://ebay-dashboard-gamma.vercel.app/legal/data-deletion.html`
- `https://ebay-dashboard-gamma.vercel.app/legal/terms.html`
