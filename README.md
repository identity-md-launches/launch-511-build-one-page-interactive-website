# Token Weather

Token Weather is a one-page Ethereum ERC-20 activity dashboard. Paste a token contract address to read an on-chain forecast: recent transfer count, distinct senders and receivers, the largest movement, a one-minute activity comparison, and a short weather summary. It is read-only and never asks for a wallet, private key, signature, or transaction approval.

The page starts with a clearly labelled illustrative USDC sample so the layout is useful before a network request is made. **Read the forecast** performs the live request against Ethereum Blockscout's public REST API. The client follows keyset pagination until it has both one-minute windows, or stops after 40 pages / 45 seconds and returns an explicit error instead of showing a partial count. The dashboard links to Etherscan for indexed transactions and the full contract address can be copied.

## Run locally

Requirements: Node 20+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To serve the committed production export locally:

```sh
npm run build
npm run preview
```

The Vite base is `./`, so `dist/index.html` and its hashed assets work from a static subpath, gateway prefix, or ENS-hosted directory. Publish the complete `dist/` directory to a static host; there is no server route to configure.

## Checks run

The final source was checked with:

```sh
npm run typecheck   # tsc --noEmit — passes
npm run build       # Vite production build — passes; writes dist/index.html and dist/assets/*
npm run validate    # bounded Playwright + axe interaction/viewport checks (see artifacts/check-results.json)
```

A local Playwright pass served `dist/` at desktop and 320px mobile widths. It confirmed the page title and primary dashboard render, keyboard-reachable form and controls exist, invalid address submission announces a field error with `aria-invalid="true"`, the sample action updates the dashboard, the production export has no console errors or failed resources, and the document has no horizontal overflow at 320px. `@axe-core/playwright` reported zero automated violations for the initial page. The live USDC request also completed in the browser and replaced the sample badge with an indexed transfer snapshot.

The visual review and remaining coverage are recorded in [`artifacts/validation.md`](artifacts/validation.md). The implemented design tokens and reuse points are in [`DESIGN.md`](DESIGN.md).

## Publish

Build once, then upload `dist/` as-is. Keep the `assets/` directory beside `index.html`; its relative URLs are part of the export contract. No `.env` file or API key is required. The public Blockscout endpoint can rate-limit or lag behind the chain, and the interface keeps the previous forecast visible while a new read is in progress.
