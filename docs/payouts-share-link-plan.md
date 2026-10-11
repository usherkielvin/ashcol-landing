# Payout Share Link (read-only, per installer) — Implementation Plan

Goal: on the Payouts page, payroll clicks **Copy link** on an installer's payout table and sends the URL to
that installer. Opening the URL shows that installer's payout table for that week — the rows, the pay columns,
deductions and the net payout — **read-only, with no login**.

Status of this document: **Phases 1 (backend), 2 (public page) and 3 (payroll UI) built.** Remaining: phone check and docs (see rollout list). Section 6 decisions were
built with the proposed defaults (no login, visible with a "Not final yet" label, 14-day expiry, one installer + one
week, customer details and each deduction line shown, held rows shown) — change them before phase 2 if wrong.

---

## 1. What exists today

| Piece | Where | Today |
|---|---|---|
| Installer table URL | `App.tsx` — `/payouts/:branchSlug/:installerSlug` | Opens an installer's table, but only inside the portal (login required). The week is **not** in the URL; it comes from `localStorage` (`PAYROLL_WEEK_KEY`). |
| Read-only mode | `Payouts.tsx` — `viewOnly = !canManagePayroll` | Logged-in branch staff and installers already get a read-only page. Installers see only their own rows. |
| What a viewer may see | `PayrollService.getEntriesFor` + `PayrollReleaseFilter` | Only installer-weeks that are fully `COMPLETE`, plus held tickets. Remittance (`actualCollected`) is blanked. |
| Installer ↔ rows | `PayrollReleaseFilter.isOwnRow` | Matched by **name** (full name, nickname, a name word, 3+ letter prefix). Two installers sharing a first name can collide. |
| Where rows come from | `GET /api/v1/payroll?branchId&month`, merged in the browser with a fresh Schedules pull, then auto-saved | The server only knows what payroll last **saved**. |
| Deductions | `customFields` on the rows (`ded:` prefix, `payrollDerive.ts`) | Travel with the rows — no separate fetch needed. |
| Copy to clipboard | `Payouts.tsx` showcase modal | Copies a **PNG image** of the payout summary. No link sharing exists. |
| Public endpoints | `SecurityConfig` — `/api/public/**` is `permitAll` | Used by public booking (`BookingController`), which also uses `RateLimiterService`. |

Why the existing login route is not enough: the installer must have a portal account, log in on their phone,
and land on the right week — and they can only see the payout after it is marked COMPLETE. A share link removes
all four hurdles, at the cost of putting pay data behind an unguessable URL instead of a login. Section 3.4
covers how that is kept safe.

---

## 2. Target behaviour

### 2.1 Payroll (portal)
- In an installer's payout table header, next to Sync / Save: a **Copy link** button. Payroll and admins only
  (`canManagePayroll`).
- Click → the link is created (or the existing one for that installer-week is reused) and copied.
  Toast: *"Link copied — expires Oct 19."*
- If the table has unsaved changes, it is saved first (`saveTableNow`) so the link shows what payroll sees.
- A small menu beside the button: **expiry date**, **times opened / last opened**, **Revoke**, **New link**
  (revokes the old one).
- The same action is offered per row on the roster (the installer list), so payroll can copy links without
  opening each table.

### 2.2 Installer (public page)
- URL shape: `https://<portal host>/payout/<token>` — outside `DashboardLayout`, no sidebar, no login.
- Shows: installer name, branch, week range, status pill (**Completed** / **Not final yet**), the rows table
  (date, ticket no., customer, unit, each pay column with a value), deductions, and **Net Payout**.
- Phone-first: the table scrolls sideways with date / ticket / customer pinned (same pinning as the portal
  table, `LIST_PINNED_KEYS`); totals sit in a sticky footer.
- Nothing is editable. No links to other installers, other weeks, or the rest of the portal.
- Expired or revoked link: *"This link is no longer active. Ask payroll for a new one."*
- The page is **live**: if payroll corrects a row, reopening the link shows the corrected table.

### 2.3 What the link never shows
- Other installers' rows, other weeks, or the branch roster.
- Remittance collected (`actualCollected`) and `amountCollected` — same rule as today's branch viewers.
- Payroll-internal notes: correction history, audit stamps, who completed it.

---

## 3. Design

### 3.1 Data model (`ashcol-service-api`)

New table `payout_share_links` — next free Flyway version (V159 at the time of writing; V158 is the DTR
coverage migration).

| Column | Notes |
|---|---|
| `id` | UUID primary key |
| `token` | 32 random bytes, base64url (43 chars), unique index. The only secret. |
| `branch_id` | As stored on `payroll_entries` |
| `installer_names` | JSON array of normalized row names that make up this installer on the roster |
| `installer_label` | Display name shown on the public page |
| `week_from`, `week_to` | The payout week |
| `created_by`, `created_at` | Payroll user who created it |
| `expires_at` | Default 14 days after creation (decision 3) |
| `revoked_at`, `revoked_by` | Null while active |
| `view_count`, `last_viewed_at` | Simple access trail |

Unique on (`branch_id`, `installer_label`, `week_from`) for active links, so clicking **Copy link** twice
returns the same URL instead of minting a new one each time.

**Why `installer_names` is a list.** The roster groups aliases ("MARK", "MARK A.") under one installer in the
browser, while the server only sees raw names. The portal sends the exact raw names in the group when it creates
the link, so the server filters by an explicit list rather than by the loose name matching used for logged-in
installers. This avoids the shared-first-name collision listed as a known limit in
`payouts-branch-readonly-plan.md`.

### 3.2 Backend endpoints

Payroll-only, under the existing controller (all call `payrollService.requireManage`):

| Method | Path | Does |
|---|---|---|
| `POST` | `/api/v1/payroll/share-links` | Body `{ branchId, weekFrom, weekTo, installerNames[], installerLabel }`. Returns the active link for that installer-week, creating it if needed: `{ id, token, expiresAt, viewCount, lastViewedAt }`. |
| `GET` | `/api/v1/payroll/share-links?branchId&weekFrom` | Lists active links for the week, so the roster can show which installers already have one. |
| `DELETE` | `/api/v1/payroll/share-links/{id}` | Revokes. |
| `POST` | `/api/v1/payroll/share-links/{id}/rotate` | Revokes and issues a new token. |

Public, in a new `PublicPayoutController`:

| Method | Path | Does |
|---|---|---|
| `GET` | `/api/public/payout-shares/{token}` | Returns `{ installerLabel, branchName, weekFrom, weekTo, status, rows[] }` or `404`. |

How the public read works (`PayoutShareService.resolve(token)`):

1. Look up the token. Unknown, revoked, or expired → `404` with one generic body (no hint which).
2. Load `payroll_entries` for the branch for the month(s) the week touches. A week belongs to the month it ends
   in (`payrollWeeks.ts` → `owningMonthOf`), but load both the `week_from` and `week_to` months to be safe.
3. Keep rows whose normalized `installerName` is in `installer_names` **and** whose week key equals `week_from`.
   Reuse the week logic already in `PayrollReleaseFilter` (carry-over rows use `hold:targetWeekFrom`; otherwise
   the week of `workDate`) — make `groupKey`'s week part a shared package-private helper rather than copying it.
4. Apply the release rule chosen in decision 2.
5. Map to a response DTO — **not** the `PayrollEntry` entity. Drop `actualCollected` and `amountCollected`;
   from `customFields` pass through only the keys the page needs (`ded:*`, `pay:*`, `hold:state`,
   `hold:carryOver`, custom pay columns, `txt:*`) and drop everything else.
6. Bump `view_count` / `last_viewed_at`.

There is no public write endpoint of any kind; read-only is enforced by the API surface, not just by the page.

### 3.3 Portal (`ashcol-web-portal`)

1. **`src/utils/payoutShareApi.ts`** (new, like `vehicleApi.ts`) — `createShareLink`, `listShareLinks`,
   `revokeShareLink`, `rotateShareLink`, and `fetchSharedPayout(token)` (the only call made without a JWT).
2. **`Payouts.tsx`** — Copy link button + link menu in the installer table header (the action cluster with
   Sync Latest / Save, already marked `data-html2canvas-ignore`), and a copy action on roster rows. Both gated
   by `canManagePayroll`. The raw names for `installerNames` come from the installer's existing roster group.
   - Clipboard: Safari drops the user-gesture permission across an `await`, so write with
     `navigator.clipboard.write([new ClipboardItem({ 'text/plain': promise })])` and fall back to showing the
     URL in the menu with a manual copy field.
   - Any new button/menu component goes at module level or in `src/pages/Payouts/`, not inside `Payouts()`.
3. **`src/pages/PayoutShare.tsx`** (new, lazy-loaded) — the public page. It must **not** import `Payouts.tsx`
   (368 KB and tied to auth). It reuses the pure helpers instead: `COLUMN_DEFS`, `peso`, `shortDate` from
   `Payouts/payoutUtils.ts`; `mapSavedPayrollEntry`, `rowTotal`, `payFactor`, `deductionTotal`, `isHeldRow`,
   `isCarryOver` from `payrollDerive.ts`. Columns with no value in any row are hidden so the phone table stays
   narrow.
4. **`App.tsx`** — `<Route path="/payout/:token" element={<PayoutShare />} />` with the other public routes,
   above the `DashboardLayout` group. `RootRouter` only handles `/`, so the route works on the portal host
   without touching the hostname logic. The link is built from `window.location.origin`.
5. The token stays in the path only — never in a query string, never logged to analytics.

### 3.4 Safety (pay data on a public URL)

- **Unguessable**: 256-bit random token; nothing about the installer, branch or week appears in the URL.
- **Narrow**: one installer, one week, read-only, remittance removed.
- **Short-lived and revocable**: expiry by default, one-click revoke, access count visible to payroll.
- **Rate-limited**: per-IP limit on `/api/public/payout-shares/**` using the existing `RateLimiterService`.
- **Not cached or indexed**: `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`
  on the API response; `<meta name="robots" content="noindex">` on the page.
- **Creation is logged**: who created, rotated and revoked each link.
- Remaining risk, stated plainly: anyone the installer forwards the link to can read that one table until it
  expires. If that is not acceptable, use the login-only option in decision 1.

### 3.5 Tests

Backend (portal has no test runner — verify there with `npm run build`, `npm run lint`, and the browser):

- `PayoutShareLinkIntegrationTest`: a valid token returns only that installer's rows for that week; another
  installer in the same branch and another week of the same installer are excluded; remittance fields are
  absent; expired, revoked and unknown tokens all return the same `404`; a non-payroll account cannot create,
  list, revoke or rotate; creating twice returns the same token.
- Unit test for the shared week-key helper, including a carry-over row and a week spanning two months.

---

## 4. Rollout

- [x] **Phase 1 — Backend** (`ashcol-service-api`): migration `V159__create_payout_share_links.sql`, `PayoutShareLink`
  entity/repository, `PayoutShareService`, payroll endpoints (`/api/v1/payroll/share-links`), public endpoint
  (`GET /api/public/payout-shares/{token}`, `PublicPayoutController`), per-IP rate limit, no-store/noindex headers,
  `PayoutShareLinkIntegrationTest`, week-key helper shared via `PayrollReleaseFilter.weekKey`. Safe alone — nothing calls it yet.
- [x] **Phase 2 — Portal public page**: `utils/payoutShareApi.ts` (`fetchSharedPayout`), `pages/PayoutShare.tsx`, route
  `/payout/:token` in `App.tsx`; `AuthContext` and the `main.tsx` fetch interceptor treat `/payout/*` and `/api/public/*`
  as public so a stale staff token can't bounce a viewer to `/login`. Checked in the browser against a mock API
  (desktop + 375px, all states); not yet against the real backend with a link created through the API.
- [x] **Phase 3 — Portal payroll UI**: payroll calls in `utils/payoutShareApi.ts`; `pages/Payouts/ShareLinkButton.tsx`
  (Copy link + options panel: URL, expiry, open count, New link, Revoke); wired into `Payouts.tsx` in the installer
  table header (full) and on each roster row (icon, dot = link already active). Saves unsaved edits first.
  Checked in a harness against a mock API; not yet exercised inside the real Payouts page with the real backend.
- [ ] Check on a real phone (Android Chrome, iOS Safari): open, scroll, totals match the portal table.
- [x] Update `docs/ASHCOL_SYSTEM_SCOPE.md` (Payouts row added with the share link + completion email).
- [ ] Known-limits list in `payouts-branch-readonly-plan.md`.
- Emailing the link to the technician on completion is built: `docs/plans/payout-completion-email.md`.

Rough size: backend about a day, public page about a day, payroll UI half a day.

---

## 5. Out of scope

- Editing, acknowledging or signing the payout from the link.
- Sending the link by SMS / Messenger from the portal (payroll pastes it wherever they chat today).
- Links for a whole branch or a whole roster.
- The mobile app.

---

## 6. Decisions needed before building

1. **Login or no login** — a tokenized link that opens without login (proposed, it is what "view via a URL"
   needs for installers without accounts), or a portal deep link (`/payouts/<branch>/<installer>?week=…`) that
   requires the installer to log in? The second needs no backend work, only a `week` URL parameter, but every
   installer must have an account.
2. **When the table is visible** — as soon as payroll shares it, labelled **"Not final yet"** until the
   installer-week is `COMPLETE` (proposed: payroll chose to share it, and installers can check their jobs before
   payout), or only after COMPLETE, matching the branch read-only rule?
3. **Expiry** — 14 days (proposed), 7 days, 30 days, or until revoked?
4. **Scope of one link** — one installer + one week (proposed, smallest exposure), or one lasting link per
   installer that shows all their weeks with week tabs?
5. **Customer details** — show customer name and city (proposed, so the installer recognises each job), or
   ticket number only?
6. **Deductions** — show each deduction line (cash advance, late, uniform, damages) (proposed), or only the
   total deducted?
7. **Held tickets** — show held rows read-only with their reason (proposed, matches the branch view), or hide
   them?
