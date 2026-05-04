# CatchTable API Workflows — Per-diagram Mermaid files

This folder contains the **30 Mermaid diagrams** that document the CatchTable
POS + reservation API, **one diagram per `.mmd` file**.

Every file in here is a standalone, valid Mermaid document. You can drop it
straight into:

- **GitHub** (renders `.mmd`/`mermaid` blocks natively)
- **Mermaid Live Editor** ([mermaid.live](https://mermaid.live))
- **VS Code / Cursor** with the *Mermaid* preview extension
- **`@mermaid-js/mermaid-cli`** (`mmdc -i NN-name.mmd -o NN-name.svg`)
- **Notion**, **Obsidian**, **Slab**, etc.

> Why this folder exists: the parent `workflows.mmd` is a *catalog* of all 30
> diagrams concatenated. A strict Mermaid renderer expects **one diagram per
> file**, so the catalog can only be opened in tools that understand the
> `BEGIN/END` markers (or in Markdown via `workflows.md`'s appendix). The
> per-diagram files in *this* folder are the ones to use for direct rendering.

## Index

| # | File | Type | Topic |
| --- | --- | --- | --- |
| 01 | [`01-api-map.mmd`](./01-api-map.mmd) | flowchart | High-level surface map (actors → tag groups → store) |
| 02 | [`02-er-diagram.mmd`](./02-er-diagram.mmd) | erDiagram | 13-collection schema relationships |
| 03 | [`03-auth-token-lifecycle.mmd`](./03-auth-token-lifecycle.mmd) | sequenceDiagram | Sign-in → access/refresh → 401 → refresh → sign-out |
| 04 | [`04-customer-signup-wizard.mmd`](./04-customer-signup-wizard.mmd) | flowchart | Customer 5-step sign-up |
| 05 | [`05-password-reset.mmd`](./05-password-reset.mmd) | sequenceDiagram | Forgot → OTP → reset |
| 06 | [`06-staff-onboarding.mmd`](./06-staff-onboarding.mmd) | sequenceDiagram | Register-restaurant vs join-restaurant |
| 07 | [`07-discovery-to-booking.mmd`](./07-discovery-to-booking.mmd) | flowchart | Discovery → restaurant detail → reservation flow |
| 08 | [`08-reservation-state-machine.mmd`](./08-reservation-state-machine.mmd) | stateDiagram-v2 | `requested → confirmed → arrived → dining → bill_requested → bill → visited` |
| 09 | [`09-invite-flow.mmd`](./09-invite-flow.mmd) | stateDiagram-v2 | `pending → accepted/declined/expired` |
| 10 | [`10-qr-checkin.mmd`](./10-qr-checkin.mmd) | sequenceDiagram | QR scan → server verifies → host arrives |
| 11 | [`11-pos-reservation-staff.mmd`](./11-pos-reservation-staff.mmd) | sequenceDiagram | Approve / decline / no-show / check-in |
| 12 | [`12-order-lifecycle.mmd`](./12-order-lifecycle.mmd) | flowchart | Open → with sent items → bill_requested → bill → paid |
| 13 | [`13-order-item-state.mmd`](./13-order-item-state.mmd) | stateDiagram-v2 | `draft → sent → in_progress → ready` (and voided) |
| 14 | [`14-kitchen-board.mmd`](./14-kitchen-board.mmd) | sequenceDiagram | Three lanes — accept-batch / complete / recall |
| 15 | [`15-pos-payment-flow.mmd`](./15-pos-payment-flow.mmd) | sequenceDiagram | Cash / credit / mix / wallet |
| 16 | [`16-refund-flow.mmd`](./16-refund-flow.mmd) | stateDiagram-v2 | `pending → succeeded / failed` |
| 17 | [`17-wallet-topup-async.mmd`](./17-wallet-topup-async.mmd) | sequenceDiagram | PSP webhook + poll fallback |
| 18 | [`18-ledger-cache-pattern.mmd`](./18-ledger-cache-pattern.mmd) | flowchart | Ledger collections + cache fields on `customer_users` |
| 19 | [`19-subscription-state.mmd`](./19-subscription-state.mmd) | stateDiagram-v2 | `trialing/active/past_due/cancelled/expired` |
| 20 | [`20-invoice-state.mmd`](./20-invoice-state.mmd) | stateDiagram-v2 | `open/paid/uncollectible/voided` |
| 21 | [`21-support-conversation.mmd`](./21-support-conversation.mmd) | stateDiagram-v2 | `open/pending_user/pending_agent/resolved/closed` |
| 22 | [`22-notifications-fanout.mmd`](./22-notifications-fanout.mmd) | flowchart | Domain event → in-app + push + email/sms + WS |
| 23 | [`23-realtime-channels.mmd`](./23-realtime-channels.mmd) | flowchart | Canonical `RealtimeChannel` enum, grouped by entity |
| 24 | [`24-idempotency.mmd`](./24-idempotency.mmd) | sequenceDiagram | `Idempotency-Key` cache hit/miss path |
| 25 | [`25-error-retry-decision.mmd`](./25-error-retry-decision.mmd) | flowchart | Status code + error code → retry vs surface |
| 26 | [`26-pagination.mmd`](./26-pagination.mmd) | flowchart | Offset (`page`/`pageSize`) vs cursor (`cursor`/`limit`) |
| 27 | [`27-table-state.mmd`](./27-table-state.mmd) | stateDiagram-v2 | Table life — available/reserved/occupied/needs_cleaning |
| 28 | [`28-friend-graph.mmd`](./28-friend-graph.mmd) | stateDiagram-v2 | Friend-edge — pending/accepted/declined/blocked |
| 29 | [`29-daily-bonus-referral.mmd`](./29-daily-bonus-referral.mmd) | sequenceDiagram | Daily bonus claim + referral redemption |
| 30 | [`30-permissions-matrix.mmd`](./30-permissions-matrix.mmd) | flowchart | Staff role → POS endpoint capability matrix |

## Quick render — single diagram

```bash
# Mermaid Live Editor — paste the file content into https://mermaid.live
# or render to SVG with the official CLI:
npx --package=@mermaid-js/mermaid-cli mmdc \
  -i 08-reservation-state-machine.mmd \
  -o 08-reservation-state-machine.svg
```

## Render everything (this folder's tooling)

```bash
cd docs/api-docs/page-driven/workflows
npm install                # installs mermaid + @mermaid-js/mermaid-cli
npm run validate           # strict per-file syntax check (Mermaid grammar)
npm run render             # renders all 30 to ./_render-out/*.svg via mmdc
```

`_render.mjs` reads `_puppeteer.json` to point Puppeteer at your installed
Chrome/Edge — adjust the path inside `_puppeteer.json` if Chrome lives
elsewhere on your machine.

## Files in this folder

- `NN-name.mmd` — the 30 standalone diagrams. Each file's first non-blank
  line is the Mermaid diagram-type declaration (`flowchart TD`,
  `sequenceDiagram`, `stateDiagram-v2`, `erDiagram`); leading `%%` comments
  follow it. This layout works in every Mermaid version we tested
  (`mermaid` v10/v11, `mmdc`, Mermaid Live, GitHub, Cursor, Notion).
- `_split.mjs` — regenerates the 30 files from the parent `workflows.mmd`,
  enforcing the type-line-first layout.
- `_validate.mjs` — strict per-file Mermaid-grammar parse check.
- `_render.mjs` — full mmdc render to `_render-out/*.svg`.
- `_reorder-parents.mjs` — one-off; rewrites the parent `workflows.mmd`
  catalog blocks and the `workflows.md` appendix blocks so direct copy from
  either is also safe.
- `_check-parents.mjs` — verifies every block in the parent files starts
  with a diagram-type line.
- `_puppeteer.json` — Puppeteer config for `mmdc` (system Chrome path).
- `_find-chrome.ps1` — helper to locate a Chrome/Edge binary on Windows.
- `package.json` — pins the validation/render dependencies.
- `_render-out/`, `node_modules/` — generated, gitignored.

## Tested on this repo

```
30/30 ok  (mermaid.parse — same grammar as mmdc / Mermaid Live)
30/30 rendered  (mmdc + system Chromium)
```

## See also

- [`../workflows.mmd`](../workflows.mmd) — single-file catalog (BEGIN/END markers)
- [`../workflows.md`](../workflows.md) — companion explainer + render-ready appendix
