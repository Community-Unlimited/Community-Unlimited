# design-sync notes — CU-OS

Project: **Community-OS** (`b3c9f19e-f5b4-432d-b81d-ebb3b212620e`).
First sync 2026-08-29. Shape: `package`.

## Run it

```sh
cd frontend && npm run build:ds && cd ..
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules ./frontend/node_modules \
  --entry ./frontend/src/components/ui.tsx \
  --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```

**Both flags are mandatory.** Without `--entry`, the converter resolves
`PKG_DIR` as `node_modules/<pkg>`, which never exists here (npm does not
self-install). Pointing `--entry` at `ui.tsx` makes it walk up to
`frontend/package.json` instead.

## Repo-specific gotchas

- **This is an app, not a component library.** `frontend/package.json` is
  `private`, with no `main`/`module`/`exports`, and `dist/` is a built SPA. The
  design system is one file: `src/components/ui.tsx`.
- **All 10 components live in that single file**, so the converter's
  one-file-per-component discovery finds nothing. `cfg.componentSrcMap` pins
  every component to `src/components/ui.tsx` — that map is what *adds* the
  names, not just where they resolve. Removing it yields `[ZERO_MATCH]`.
- **`.d.ts` contracts depend on `npm run build:types`.** Without a declaration
  tree, ts-morph parses 0 files and every props body degrades to
  `{[key: string]: unknown}` — the design agent then has no idea `Button` takes
  a `variant`. The `types` field in `package.json` points at
  `dist/types/components/ui.d.ts`; `dirname()` of that path is the parse root,
  which usefully scopes it to the UI kit and keeps app pages out.
- **The Tailwind safelist in `src/index.css` is load-bearing.** Tailwind emits
  utilities on demand, so a class the app never uses is absent from the
  compiled CSS — and Claude Design renders static CSS with no compiler.
  Measured before the safelist: 18 of 23 colour tokens and 29 of 74 utilities.
  The `@source inline(...)` block forces the full brand surface for +2.8 KB.
  **Adding a token to `@theme` without adding it there means it will not ship.**
- **`cssEntry` is `dist/ds.css`**, a stable copy of Tailwind's hash-named
  output. `npm run build:ds` makes it; plain `npm run build` leaves it stale.
- **`cfg.pkg` is `frontend`** (the real package name), so authored previews
  import from `'frontend'`. Rule 1 of `story-imports` maps that to
  `window.CUOS`.

## Converter environment

- **`typescript@5` is pinned in `.ds-sync`** solely for `package-validate`'s
  `.d.ts` parse check. The repo itself uses TS ~6 and `.ds-sync` first got TS 7,
  whose native rewrite exposes no classic compiler API — `createSourceFile` is
  undefined, the whole `try` block throws, and validate misreports it as
  "typescript not in node_modules". `ts-morph` bundles its own TS and is
  unaffected.
- **playwright `1.62.1`** pins chromium build `1234`, which matches the local
  `~/.cache/ms-playwright/chromium-1234`. A different playwright version fails
  with `Executable doesn't exist`.
- **Windows/Python:** read the converter's JSON with `encoding="utf-8"`.
  `.render-check.json` contains `✓`/`⚠` and the cp1252 default raises
  `UnicodeDecodeError`.

## Known render warns

None. All ten components have authored previews and the final validate is
clean — no `[RENDER_THIN]`, no floor cards. **A warn on a future run is new**;
look at it rather than assuming it was always there.

## Re-sync risks

- **Safelist drift.** New `@theme` tokens silently fail to ship unless added to
  the `@source inline(...)` list. Cross-check token count against the compiled
  CSS after any token change.
- **`dist/ds.css` staleness.** It is a *copy*. If someone runs `npm run build`
  instead of `build:ds`, the converter ships the previous build's CSS with no
  warning.
- **Preview data is illustrative, not live.** `Meter` and `StatTile` use a
  mid-programme snapshot (186/300, 94/119, 5/17). Real values today are
  1/300 and 0/17, which render as empty tracks and demonstrate nothing. Do not
  "correct" these to live numbers.
- **Only verified in headless chromium**, never in the real Claude Design
  renderer. Worth a skim in the DS pane.
- **`conventions.md` names 55 concrete tokens, utilities and components.**
  Every one was checked against the build. Re-validate after any rename — a
  header naming something that no longer exists is worse than no header,
  because the agent trusts it and ships silently unstyled output.
- **Grouping is flat** (`components/general/…`) — there are no per-component
  docs to carry a `category`. If the system grows, add doc stubs with
  frontmatter `category:` to group the pane.
