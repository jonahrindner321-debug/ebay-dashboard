# Seller OS Dashboard

Static Vercel dashboard prototype for multi-store ecommerce operations.

## Files

- `index.html` - page markup and layout
- `styles.css` - dashboard styling and responsive UI
- `app.js` - data loading, calculations, charts, filters, and interactions
- `api/sheets.js` - server-side Google Sheets proxy for Vercel
- `api/tiktok/*` - read-only TikTok Shop connector foundation
- `SELLER_OS_ROADMAP.md` - product and technical roadmap

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

## TikTok Shop Connector

The TikTok connector is read-only by design. To enable the Connect button on Vercel, configure:

```text
DATABASE_URL
DB_ADMIN_SECRET
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
TIKTOK_TOKEN_STYLE=oauth_v2
```

`oauth_v2` uses TikTok's OAuth v2 token endpoint. If the approved TikTok Shop app uses the legacy Shop Open API token exchange, set `TIKTOK_TOKEN_STYLE=shop_legacy` and provide the correct `TIKTOK_TOKEN_URL`.

Initialize the database schema after adding `DATABASE_URL`:

```bash
curl -X POST https://ebay-dashboard-gamma.vercel.app/api/db/init \
  -H "x-admin-secret: $DB_ADMIN_SECRET"
```

When linking TikTok from the dashboard, choose a store in the account filter first. Seller OS passes that store/client slug into the OAuth flow so the connected TikTok seller account is attached to the right store.
