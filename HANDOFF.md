# Seller OS Developer Handoff

Last updated: April 25, 2026

## Project Summary

Seller OS is evolving from an eBay/Google Sheets dashboard into a read-only multi-store ecommerce operating system.

The current production app is a static Vercel dashboard with serverless API routes. It already supports:

- Google Sheets-backed ecommerce metrics.
- Admin dashboard views for operations and growth.
- Client-only deep links through `#client=<slug>`.
- TikTok-styled channel views in the UI.
- Database-backed TikTok Shop OAuth connection foundation.
- Public legal/security policy pages for app review.

Production URL:

```text
https://ebay-dashboard-gamma.vercel.app/
```

Repository:

```text
jonahrindner321-debug/ebay-dashboard
```

## Current Architecture

Main files:

- `index.html` - dashboard markup.
- `styles.css` - dashboard styling.
- `app.js` - dashboard data loading, charts, client views, channel filters, and TikTok connect button logic.
- `api/sheets.js` - Vercel serverless Google Sheets proxy.
- `api/db/init.js` - database schema initializer.
- `api/_lib/db.js` - Neon/Postgres helper functions.
- `api/tiktok/*` - TikTok Shop OAuth/status/placeholders.
- `db/schema.sql` - database schema.
- `legal/*` - public Privacy, Security, Data Deletion, Terms, and contact pages.

Local preview:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:8000
```

## Deployment Status

Vercel is linked to GitHub `main`.

Recent production deploys were forced with:

```bash
npx vercel --prod
```

Production was verified after the latest changes. The legal pages returned HTTP 200:

- `/legal/`
- `/legal/privacy.html`
- `/legal/security.html`
- `/legal/data-deletion.html`
- `/legal/terms.html`
- `/legal/contact.html`

The TikTok status endpoint returned configured/read-only/database-backed with zero connected accounts:

```json
{
  "configured": true,
  "missing": [],
  "connected": false,
  "readOnly": true,
  "storage": "database",
  "databaseConfigured": true,
  "connections": []
}
```

Zero connected accounts is expected until TikTok approves/publishes the app and a seller completes OAuth.

Database schema has already been initialized in production through `POST /api/db/init`.

## TikTok Shop Work Completed

TikTok app/service was created in TikTok Shop Partner Center as a Custom app:

- App name: `Seller OS Dashboard (Jonah)`
- Type: Custom
- Category: Analytics & Reporting
- Market: United States, Local sellers
- Redirect URL:

```text
https://ebay-dashboard-gamma.vercel.app/api/tiktok/callback
```

Important: do not commit or expose the app secret. It is stored in Vercel env vars.

### Vercel Environment Variables

Production Vercel env vars were configured for:

```text
DATABASE_URL
DB_ADMIN_SECRET
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
TIKTOK_TOKEN_SECRET
TIKTOK_AUTH_URL
TIKTOK_TOKEN_URL
TIKTOK_TOKEN_STYLE
TIKTOK_SCOPES
GOOGLE_API_KEY
```

TikTok Shop OAuth mode:

```text
TIKTOK_TOKEN_STYLE=shop_v2
TIKTOK_AUTH_URL=https://auth.tiktok-shops.com/api/v2/token/authorize
TIKTOK_TOKEN_URL=https://auth.tiktok-shops.com/api/v2/token/get
```

Read-only scopes configured:

```text
seller.order.info seller.global_product.info seller.finance.info seller.global_product.category.info data.bestselling.public.read
```

Avoid write/delete/fulfillment-control scopes unless the product direction changes and the risk is reviewed.

### TikTok Code Paths

OAuth start:

```text
GET /api/tiktok/connect
```

Callback/token exchange:

```text
GET /api/tiktok/callback
```

Status:

```text
GET /api/tiktok/status
```

Placeholder data routes:

```text
GET /api/tiktok/orders
GET /api/tiktok/products
```

The `shop_v2` flow builds an authorization URL using `app_key`, `state`, and `redirect_uri`, then exchanges the returned auth code with TikTok Shop's token endpoint. Tokens are encrypted before database storage.

## TikTok Partner Center Review Status

As of this handoff:

- The custom app is still in `Draft`.
- The US data security questionnaire was submitted.
- The data security and privacy questionnaire was submitted.
- Company details and app category/partner registration forms were submitted by the owner.
- TikTok still needs to review/pass these items before final publish may be allowed.
- After publishing, TikTok will run app review.

Expected next action:

1. Wait for TikTok Partner Center review items to pass.
2. Click `Publish` once TikTok allows it.
3. Test `Link TikTok` from production.
4. Complete seller OAuth.
5. Verify `/api/tiktok/status` shows a connection in `connections`.

## Legal / Security Pages Added

To support TikTok review, public policy pages were added:

- Legal Center: `https://ebay-dashboard-gamma.vercel.app/legal/`
- Privacy: `https://ebay-dashboard-gamma.vercel.app/legal/privacy.html`
- Security: `https://ebay-dashboard-gamma.vercel.app/legal/security.html`
- Data Deletion: `https://ebay-dashboard-gamma.vercel.app/legal/data-deletion.html`
- Terms: `https://ebay-dashboard-gamma.vercel.app/legal/terms.html`
- Contact: `https://ebay-dashboard-gamma.vercel.app/legal/contact.html`

These are practical policy pages for a custom/internal read-only app. They are not a substitute for formal legal review.

## What Is Not Done Yet

TikTok integration is not yet pulling real orders/products into dashboard metrics.

Still needed:

- Wait for TikTok app approval/publish.
- Complete first TikTok seller OAuth.
- Determine exact TikTok Shop Open API request signing requirements for approved endpoints.
- Implement signed read-only calls in `api/tiktok/orders.js` and `api/tiktok/products.js`.
- Normalize TikTok results into the same model used by Google Sheets/eBay rows.
- Add sync runs and error logs to the database.
- Show real TikTok data in the dashboard instead of only the existing visual TikTok mode.

## Recommended Next Developer Checklist

1. Pull latest `main`.
2. Confirm production env vars with `npx vercel env ls`.
3. Check TikTok review state in Partner Center.
4. If TikTok is approved/published, test:

```bash
curl -s https://ebay-dashboard-gamma.vercel.app/api/tiktok/status
curl -s -D - -o /dev/null https://ebay-dashboard-gamma.vercel.app/api/tiktok/connect
```

5. Connect one TikTok seller account through the dashboard.
6. Verify the connection is stored in `platform_connections`.
7. Implement signed TikTok read endpoints.
8. Add a small sync job or manual sync endpoint.
9. Merge TikTok order/product metrics into dashboard data.
10. Add backend auth and real role enforcement before giving broader client/operator access.

## Recent Commit Trail

Useful recent commits:

```text
b77a4e4 Add public legal and security policies
a909422 Support TikTok Shop OAuth flow
2da5b51 Document TikTok custom app setup
c3761e2 Ignore local Vercel env files
09981b0 Fix database schema initializer
bca78ed Add database-backed TikTok connections
f90e9d7 Add TikTok Shop connector foundation
18c8997 Lock client deep-link views; update roadmap
```

## Product Direction To Preserve

Keep Seller OS:

- Read-only by default.
- OAuth/API-based, not login scraping.
- Multi-store and multi-client safe.
- Database-backed for platform connections.
- Honest about client views: frontend-only link hiding is not true security.
- Practical and fast-moving, but careful with tokens, client data, and platform permissions.

Do not add browser automation for Amazon, TikTok, eBay, or Seller Central accounts.
