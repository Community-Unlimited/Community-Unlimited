# CU-OS frontend

React 19 + Vite + Tailwind 4 + TanStack Query. See `../CU-OS.md` for the whole
system.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to 127.0.0.1:8010
npm run build
```

## Talking to the API

In development, `vite.config.ts` proxies `/api` to the FastAPI server on
:8010, so the browser stays on one origin and CORS never comes up.

A deployed build is **static** and has no backend of its own. Point it at one:

```
VITE_API_BASE_URL=https://your-api-host
```

Set it as a Vercel environment variable, then redeploy — Vite inlines env vars
at build time, so changing it does not take effect until the next build. With
it unset, the sign-in screen says so rather than failing with a bare 404.

Whatever host you pick must allow this origin in `CU_CORS_ORIGINS` on the API.

## vercel.json

JSON with no comment support, so the reasoning lives here:

- **`rewrites`** — SPA fallback so `/people` and `/events` resolve on a hard
  refresh. `/api` is deliberately excluded from the fallback: without that
  exclusion a call to a missing backend returns `index.html` with a `200`, and
  the client fails on JSON parsing instead of reporting an honest 404.
- **`headers`** — fonts are content-hashed and immutable, so they get a
  one-year cache. `nosniff`, `DENY` framing and a strict referrer policy apply
  everywhere.
