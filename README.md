# Seller OS Dashboard

Static Vercel dashboard prototype for multi-store ecommerce operations.

## Files

- `index.html` - page markup and layout
- `styles.css` - dashboard styling and responsive UI
- `app.js` - data loading, calculations, charts, filters, and interactions
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
