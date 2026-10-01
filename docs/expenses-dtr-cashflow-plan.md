# Expenses, DTR & Cash Flow — Improvement Plan

Goal: from **October 2026** each branch's Expense Records must match its DTR totals, every peso must be traceable
(receipt photo, deposit slip, or a DTR line), and cash on hand must never "disappear".

This plan is written to be executed task by task. Do the tasks **in order**; each one is independent enough
to ship on its own. Read the whole "Ground rules" section first.

---

## 0. Ground rules for the executor

- Repos: portal = `C:\Users\usher\ASHCOL\ashcol-web-portal` (React 19 + TS + Vite),
  backend = `C:\Users\usher\ASHCOL\ashcol-service-api` (Spring Boot). Read `CLAUDE.md` in the portal first.
- **Never trust line numbers** in this doc — files change. Every location is given as a search anchor
  (a string you can grep for). If an anchor is not found exactly once, stop and re-read the surrounding code.
- Verify every portal task with `npm run build` (runs `tsc -b`). There is **no test runner**; do not add one.
  `npm run lint` has known noise (see CLAUDE.md) — only make sure you add no *new* errors.
- **Pre-existing errors:** earlier versions of this plan listed errors in `ForCollections.tsx` /
  `UnitSummaryGrid.tsx`. As of 2026-09-30 `npm run build` passes cleanly, so treat **any** build error as yours.
- Backend: prod uses `spring.jpa.hibernate.ddl-auto=validate` and Flyway is **disabled**. Any new column needs a
  hand-written SQL file in `src/main/resources/db/migration/` **and** the user must run it on prod before deploy.
  Prefer designs that need **no schema change** (all tasks below except the "Deferred" ones avoid it).
- Match the surrounding code style: inline Tailwind + theme tokens (`textPrimary`, `textMuted`, `border`,
  `accent`, `danger`, `cardBg`) in `AuditFinanceExpenses.tsx`; Tailwind `dark:` classes in `DTR_Form.tsx`.
- Do not commit unless the user asks. Keep each task's diff small and focused.

### Key code map

| What | Where |
|---|---|
| DTR form (expenses, deposits, cash advance, submit) | `src/pages/DTR_Form.tsx` |
| Receipt scan popup used by the DTR | `src/components/ReceiptScanDialog.tsx` |
| Expense Records page + Records-vs-DTR summary | `src/pages/AuditFinanceExpenses.tsx` |
| Expense Records API helpers | `src/utils/auditExpenseStorage.ts` (`loadAuditExpenses`, `upsertAuditExpense`, `deleteAuditExpense`) |
| Expense record type / fallback categories | `src/types/auditExpense.ts` |
| DTR save + totals (backend) | `ashcol-service-api/.../service/ReportService.java` (search `// Calculate totals`) |
| DTR line items for a branch (all dates) | `GET /v1/reports/purchases?branchId=&auditLine=&pendingOnly=` (returns EXPENSE + PURCHASE items with `reportDate`, `resolvedExpenseId`, `receiptReturned`, `type`) |
| Month summary per branch | `GET /v1/reports/audit-summary-range?from=&to=` (rows matched by **branch name**, no branchId) |
| Current COH + deposit threshold | `ReportService.getCurrentCoh` (`CASH_DEPOSIT_THRESHOLD = 5000`); already shown as a header chip in `DashboardLayout.tsx` (search `currentCoh.overThreshold`) |

How DTR totals are built (backend, `// Calculate totals`):
`totalExpenses = EXPENSE + CASH_ADVANCE`, `totalForPurchase = PURCHASE (excluding "ORDER|" rows)`,
`totalDeposits = DEPOSIT`. Incentives/commission/rebates/payables are separate and NOT in expenses.

How DTR rows become Expense Records (portal): each DTR row carries a stable `resolvedExpenseId`
(`dtr-<branch>-<date>-exp|dep|ca-<rowId>`) saved on the report item; on submit the portal `upsertAuditExpense`s
that id, so re-saving updates instead of duplicating. Purchases become records only when resolved (backend
`resolvePurchase`, random UUID id).

---

## Task 1 — BUG: re-saving a DTR resets record category/company/source — ✅ DONE (2026-09-30, uncommitted)

**Problem.** DTR expense items are saved without `company`, `expenseCategory`, `sourceOfFunds`. When a DTR is
reopened those row fields are empty, and on re-save the push sends `expenseCategory: 'OTHER'`,
`company: ''`, `sourceOfFunds: 'CASH'` — overwriting the record's real values.

**Files:** `src/pages/DTR_Form.tsx` only (no backend change: `ReportItem.company` already exists; category and
source are recovered from the linked Expense Record).

**Steps**
1. Send company with expense items. Find the anchor `type: 'EXPENSE',` inside `executeDtrSubmit` (the
   `...expReceiptForSave.filter(...)` block). Add `company: r.company || null,` to that object.
2. Add a ref near the other `useRef`s: `const linkedExpenseCache = useRef<Map<string, AuditExpense>>(new Map())`.
   Re-add `AuditExpense` to the type import from `'../types/auditExpense'` and import `loadAuditExpenses`
   from `'../utils/auditExpenseStorage'`.
3. Hydrate rows after a report loads. Find `setExpReceipt(expReceiptList.length > 0 ? expReceiptList : [mkExp()])`
   (inside `fetchReportDetails`). Right after it, add a non-blocking hydration:
   ```ts
   const linkedIds = expReceiptList.map(r => r.resolvedExpenseId).filter(Boolean) as string[]
   if (linkedIds.length > 0) {
     void loadAuditExpenses().then(all => {
       const byId = new Map(all.filter(e => linkedIds.includes(e.id)).map(e => [e.id, e]))
       linkedExpenseCache.current = byId
       setExpReceipt(prev => prev.map(r => {
         const rec = r.resolvedExpenseId ? byId.get(r.resolvedExpenseId) : undefined
         if (!rec) return r
         return {
           ...r,
           company: r.company || rec.company || '',
           expenseCategory: r.expenseCategory || rec.expenseCategory || '',
           sourceOfFunds: r.sourceOfFunds || rec.sourceOfFunds || '',
           receiptDate: r.receiptDate || rec.date || '',
         }
       }))
     })
   }
   ```
4. Never push defaults over real values. In both push sites — `const syncExpenseRowOnBlur` and the loop after
   `const expensesToPush` — replace the fallbacks:
   - `expenseCategory: (row.expenseCategory as AuditExpenseCategory) || 'OTHER'` →
     `expenseCategory: (row.expenseCategory || linkedExpenseCache.current.get(<id>)?.expenseCategory || 'OTHER') as AuditExpenseCategory`
   - same pattern for `sourceOfFunds` (fallback `'CASH'`) and `company` (fallback `''`).
   `<id>` is `row.resolvedExpenseId` in `syncExpenseRowOnBlur` and `expenseId` in the submit loop.

**Implemented** in `src/pages/DTR_Form.tsx` as specified, plus one addition: `linkedExpenseLoad` (a ref holding the
hydration promise) is awaited before the submit push loop, so saving right after reopening a report cannot race the
record lookup and fall back to `'OTHER'`/`'CASH'`. The cache is reset on every report load. Backend needed no
change (`ReportItem.company` is persisted and returned).

**Acceptance**
- `npm run build` passes. ✅ (verified)
- Manual (**still to do by the user**): scan an expense on a DTR (category e.g. GASOLINE, company CALTEX), submit, reopen the DTR, click
  Edit Report, change nothing, update. The record on Expense Records still shows GASOLINE / CALTEX.

---

## Task 2 — Cash-on-hand chain check on the DTR — ✅ DONE (2026-09-30, uncommitted)

**Problem.** COH (previous day) is pre-filled from yesterday's `totalCohCfd` but staff can overwrite it. A
changed value silently breaks the chain (this is how undocumented deposits "disappeared").

**Files:** `src/pages/DTR_Form.tsx`.

**Steps**
1. Add state `const [prevDayCoh, setPrevDayCoh] = useState<number | null>(null)`.
2. **Look back, don't just use yesterday.** `loadDateData` currently checks only the calendar day before, so on a
   Monday (Sunday has no DTR) nothing is prefilled and nothing would be checked. Add a helper that walks back up to
   ~7 days using `lookupExistingReport(dateStr, { skipCache: true })` and returns the most recent non-empty report.
   Use it for both the existing prefill and `setPrevDayCoh(Number(prev.totalCohCfd))`; when none is found,
   `setPrevDayCoh(null)`. Word the warning with that report's date, not "yesterday".
   Also fetch it when opening an existing report: in `fetchReportDetails`, after the report loads, look up the
   previous day with the existing `lookupExistingReport(prevDateStr, { skipCache: true })` helper (compute
   `prevDateStr` the same way `loadDateData` does) and set `prevDayCoh`.
3. Under the COH / "Cash on Hand (previous day)" input (search the input bound to `cashOnHand`), render an amber
   warning when `prevDayCoh != null && Math.abs(num(cashOnHand) - prevDayCoh) >= 0.01`:
   "Yesterday's DTR ended with ₱X. If cash left the branch, record it (COH Deposit / expense) on yesterday's DTR
   instead of changing this amount." Include a small "Use ₱X" button that sets `cashOnHand` to `prevDayCoh`.
4. In `handleDtrSubmit`, inside the existing `if (reportDate >= DOCUMENTATION_REQUIRED_FROM)` block, push an issue
   when the mismatch exists: `Cash on hand does not match the previous DTR's ending balance (₱X)`.
   **Decided (user, 2026-09-30):** hard block for members; admins may override.

**Implemented** in `DTR_Form.tsx` (differs slightly from the steps above):
- `findPreviousDayCoh(branchId, auditLine, date)` walks back up to 7 days via the lookup endpoint using its own fetch
  (it deliberately does **not** use `lookupExistingReport`, whose cache is keyed by the currently selected branch).
  It drives both the COH prefill and the check, so Mondays now chain from Saturday.
- A `useEffect` on `[selectedBranchId, selectedAuditLine, reportDate]` sets `prevDayCoh` for new and reopened reports
  alike. It is only active for `reportDate >= DOCUMENTATION_REQUIRED_FROM`, so legacy September DTRs show no warning.
- Amber warning + "Use ₱X" button under Cash on Hand; the submit check sits in the October block of `handleDtrSubmit`.
- **Admin override = an acknowledgement checkbox, not a typed note.** The DTR has no free-text field to persist a
  note in, and a required note that is thrown away would be theatre. The changed COH value and editor are already
  captured by the DTR history snapshots. If a stored reason is wanted, add a `coh_override_note` column to
  `daily_branch_reports` (+ migration SQL run on prod) — deferred.

**Acceptance:** build passes ✅; changing the pre-filled COH shows the warning and blocks October submits (member) / requires the override checkbox (admin). **Manual test still to do**, including a Monday after a Saturday DTR.

---

## Task 3 — Pending purchases aging (Expense Records summary) — ✅ DONE (2026-09-30, uncommitted)

**Problem.** Purchases awaiting their receipt are now the main reason DTR ≠ records. Nobody sees how old they are.

**Files:** `src/pages/AuditFinanceExpenses.tsx`.

**Steps**
1. New effect next to the `dtrLines` fetch (search `const [dtrLines, setDtrLines]`): fetch
   `/v1/reports/purchases?branchId=<base id>&pendingOnly=true` (+ `auditLine` for Taguig, copy the logic from the
   `dtrLines` effect). Keep only `type === 'PURCHASE'` (or missing type) and not `description.startsWith('ORDER|')`.
2. Compute age in days from `reportDate` to today. Bucket: `0–2 days`, `3–7 days`, `8+ days`.
3. In the summary card (search `Why the difference?` — the JSX comment has extra text after it), add a compact box before it:
   "Purchases awaiting receipt: N (₱total) · 8+ days: M" with M in `danger` color. Clicking expands a list
   (date, description split on `|`, amount, age) sorted oldest first — copy the expand/collapse pattern used by the
   "Why the difference?" rows (`openBucket`).

**Implemented** in `AuditFinanceExpenses.tsx` (`agingPurchases` state + effect, box above "Why the difference?").
Notes: the state is named `agingPurchases` because the summary IIFE already has a local `pendingPurchases` number.
It fetches `pendingOnly=true` for the selected branch across **all dates** (not limited to the month), so it will
differ from the month-bound "Purchases waiting for receipt" bucket below it. `pendingOnly` also returns EXPENSE
rows, hence the `type` filter. Ages are whole days from `reportDate` to local today; colours: 8+ days red, 3–7
amber. The box sits inside the `dtrPeriod` summary, so it shows wherever the summary does.

**Acceptance:** build passes ✅; box hidden when there are none. **Manual test pending** (needs a branch with
unreceipted purchases).

---

## Task 4 — DTR-linked records are read-only on Expense Records — ✅ UI DONE (2026-09-30, uncommitted)

**Problem.** Editing a DTR-created record on Expense Records changes the record but not the DTR → "Amount
differs" drift.

**Files:** `src/pages/AuditFinanceExpenses.tsx`.

**Steps**
1. Helper at module level: `const isDtrLinked = (e: { id: string }) => e.id.startsWith('dtr-')`.
2. Find every edit/delete entry point for a row: `const startEdit`, `const startEditInModal`, the table/mobile
   row edit (pencil) and delete (trash) buttons, and the detail modal's edit/delete actions (grep `startEdit(`,
   `startEditInModal(`, `deleteAuditExpense(`). For linked rows when `!isAdmin`: hide the buttons and show a small
   muted label "From DTR" with `title="Edit this on the DTR for <date>"`.
3. For admins keep the buttons, but before saving an edit to a linked record show
   `window.confirm('This record comes from a DTR. Changing it here will not update the DTR. Continue?')`.

4. **Backend guard — NOT doable as first written; do not implement.** The DTR itself writes `dtr-*` records as
   the branch member through the same `POST /v1/audit-expenses` and `DELETE /v1/audit-expenses/{id}` endpoints
   (`upsertAuditExpense` / `deleteAuditExpense` in `DTR_Form.tsx`), so rejecting non-admins on that prefix would break
   the DTR. A real control needs origin awareness, e.g. the DTR save endpoint upserting its linked records
   server-side, after which the public endpoints can reject non-admin `dtr-*` writes. Until then Task 4 is a UI
   guard only (a member could still call the API directly). Fold this into the month-close/lock work.

**Implemented** in `AuditFinanceExpenses.tsx`: module-level `isDtrLinked`; `canModifyRecord(row)` (`isAdmin ||
!isDtrLinked`) gates the desktop pencil/trash, the detail-modal Edit/Delete, the mobile action menu, and
`startEdit`/`startEditInModal`/`handleDeleteRecord` themselves. Non-admins see a muted "From DTR" label with the
tooltip "Edit this on the DTR for <date>". Admins get the "will not update the DTR" confirm on edit save, on
delete, and on the duplicate-receipt "update existing" path (managers are non-admin, so they are blocked there).
Verified: `npm run build` passes. **Manual test still to do** (see acceptance).

**Acceptance:** members cannot edit/delete `dtr-*` records (UI and API); admins get the confirm.

---

## Task 5 — Category discipline — ✅ DONE (2026-09-30, uncommitted)

**Files:** `src/components/ReceiptScanDialog.tsx`, `src/pages/DTR_Form.tsx`, `src/pages/AuditFinanceExpenses.tsx`.

**Steps**
1. `ReceiptScanDialog.tsx`: in the `missing` memo (search `const missing = useMemo`), for expense mode add
   `'description'` to `m` when `f.expenseCategory === 'OTHER' && f.description.trim().length < 10`; show hint
   text under Category when OTHER is selected: "Other needs a clear description (what and why)."
2. `DTR_Form.tsx` → `handleDtrSubmit`, inside the October block: issue when an expense row with amount has no
   `expenseCategory` ("N expenses with no category — open Scan on each to pick one").
3. `AuditFinanceExpenses.tsx` → `const submitReceipt`: if `form.expenseCategory === 'OTHER'` and description is
   shorter than 10 chars, `alert(...)` and return.

**Implemented** as specified, in all three files. Behaviours to know: `ReceiptScanDialog` defaults the category to
`OTHER` when the scan finds none, so staff must pick a category or write a real description; the hint shows
whenever OTHER is selected (red after a failed confirm). The DTR "no category" check only catches rows that never
went through Scan — and rows of older DTRs whose record lookup (Task 1 hydration) hasn't filled the category yet.
On Expense Records the rule also applies when *editing* an existing OTHER record with a short description. Not
covered: Excel import (`bulkImportAuditExpenses`) and the DTR's own `handleDtrSubmit` does not re-check OTHER
descriptions (the scan dialog already enforces it per row). Verified: `npm run build` passes; manual test pending.

**Note:** a 10-character minimum is a nudge, not enforcement ("miscellaneous" passes), and existing `OTHER`
records are untouched.

**Acceptance:** OTHER can't be saved with a vague description anywhere.

---

## Task 6 — Missing DTR alert (needs backend deploy, no schema change)

**Problem.** A day with no DTR hides cash movement and breaks the COH chain.

**Backend** (`ReportController.java` + `ReportService.java`):
1. New endpoint `GET /v1/reports/missing-days?from=YYYY-MM-DD&to=YYYY-MM-DD` with the same `@PreAuthorize` as
   `/audit-summary-range`. Service: load `dailyBranchReportRepository.findByReportDateBetween(from, to)`, and for
   each active branch (reuse the branch list + Taguig split logic from `getRangeAuditSummary`) list every date in
   range that is **Mon–Sat** (skip Sundays; ask the user if holidays should be skipped) with no non-empty report
   (reuse `isEffectivelyEmpty`). Return `[{ branchName, auditLine, missingDates: [...] }]`.
2. Return `branchId` alongside `branchName` so the portal doesn't have to match by name.
3. **Open question:** holidays and branches that don't open Saturdays will show false "missing" days — ask the user.
4. `mvn -q -DskipTests package` must compile.

**Portal:** on `src/pages/DailyAuditReport.tsx` range view, show a red "Missing DTR: N days" chip per branch row
(match rows by `branchName`), tooltip listing the dates. On `AuditFinanceExpenses.tsx` summary, show the same for
the selected branch/month.

**Acceptance:** endpoint compiles; chips render; user deploys backend.

---

## Task 7 — Month-end branch report export — ✅ DONE (2026-09-30, uncommitted)

**Files:** `src/pages/AuditFinanceExpenses.tsx` (`XLSX` is already imported).

**Steps:** add an "Export month report" button in the summary header (search `<span className="text-xs font-black" style={{ color: textPrimary }}>Summary</span>`).
Build a workbook with sheets:
1. `Summary` — branch, month, Expense Records total, DTR Expenses, DTR purchases with receipt, pending purchases,
   difference, Deposit to HO (DTR vs records), possible duplicates count, records without photo.
2. `Differences` — one row per item in each "Why the difference?" bucket (bucket, date, description, amount, note).
   Reuse the `reconciliation` memo.
3. `Records` — the period's records (date, incurred by, company, description, receipt no., category, source,
   amount, has photo Y/N).
File name: `<BRANCH>_<YYYY-MM>_expense_reconciliation.xlsx`.

**Implemented** as `handleExportMonthReport` in `AuditFinanceExpenses.tsx`, button "Export month report" in the
Summary header (disabled while DTR data loads). Details: Summary holds the plan's metrics plus DTR purchases,
deposit difference and all-dates pending-purchase counts (from Task 3); when no DTR is found, DTR-dependent cells
say "N/A (no DTR found)" instead of a misleading 0. Differences lists every bucket item with an "Affects"
column (DTR/Records) and the cash-advance line; for "Amount differs" the Amount is the DTR−record difference and
the Note shows both figures. Records includes the period's deposit records too (category shows DEPOSIT) and a
"From DTR" Y/N column. With "All Months" selected the period is the span of the branch's records and the file name
uses `<BRANCH>_<from>_to_<to>_expense_reconciliation.xlsx`; with a month selected it is `<BRANCH>_<YYYY-MM>_...`.

**Acceptance:** build passes ✅. **Manual test pending**: file downloads and opens in Excel with the three sheets.

---

## Task 8 — Records with no receipt photo (added 2026-09-30, uncommitted)

**Why records lack a photo:** (1) the photo rule only starts 2026-10-01, so everything earlier is exempt;
(2) records created by **resolving a purchase** never get one — `ResolvePurchaseRequest` has no image field and
`ReportService.resolvePurchase` builds the `AuditExpense` without `receiptImageUri` (**open, needs backend + the
screen that resolves purchases, probably the mobile app**); (3) cash advances have no receipt (excluded from the
count); (4) admin-added records and Excel imports skip the check; (5) old DTR rows entered without Scan.

**Done (portal):**
- DTR re-save no longer wipes a photo attached elsewhere: hydration and both push sites fall back to the linked
  record's `receiptImageUri` (same class of bug as Task 1).
- Expense Records: rows with no photo (except cash advances) show a red **Add photo** button (desktop table) /
  **Add Receipt Photo** (mobile menu). It uploads via `uploadReceiptImage` and upserts the record with only the
  photo changed. It is available to members even for DTR-linked records, because Task 4 otherwise leaves them no way
  to fix a missing photo. The DTR row itself picks the photo up on next open (hydration) and saves it on re-save.
- Caveat: `uploadReceiptImage` falls back to a Base64 data URL if Supabase is unavailable, so a record can hold a
  very large string in that case.

**Open:** purchase-resolve photo (above); Excel import check; manual test of the Add photo button.

---

## Task 9 — BUG: Taguig Services records showing under Taguig Sales (2026-10-01, uncommitted)

**Cause:** Taguig Sales and Services share one branch id on the DTR (only `selectedAuditLine` differs). The DTR
pushed records with that base id, and `BranchIdNormalizer.normalizeForStorage` stores any Taguig id without
"SERVICE" in it as `BR-TAGUIG-SALES`. So Services DTR records were saved as Sales, and the Expense Records filter
matched them by exact id.

**Fixed (portal):** `DTR_Form.tsx` `expenseRecordBranch()` sends `<base>-services|sales` plus an explicit
`TAGUIG - SERVICES|SALES` name on every record push (receipt scan, blur sync, submit loop, cash advance, deposit).
`AuditFinanceExpenses.tsx` `branchExpenses` now checks the line first: for a `-sales`/`-services` selection a record
counts as Services if its id ends `-services` **or its branch name contains "service"**, and is excluded from the
other line before any id/alias fallback.

**Not fixed — existing data:** records already saved with branch id `BR-TAGUIG-SALES` whose name does *not* say
services cannot be told apart. Re-saving the Services DTR rewrites them with the right id (the push upserts by the
same record id). A bulk repair would need a script matching `resolvedExpenseId` to each report's `auditLine`.
Backend `normalizeForStorage` is unchanged. Build passes; manual test pending.

---

## Task 10 — Add a receipt to a pending purchase + cash-return check (2026-10-01, uncommitted)

**Needs a backend build + deploy (no schema change).** Portal and backend compile; nothing manually tested.

**Backend** (`ReportService`, `ResolvePurchaseRequest`):
- `resolvePurchase` now accepts `receiptImage` and stores it on the Expense Record **and** the DTR purchase item
  (this also closes the "resolved purchases never get a photo" gap from Task 8). Rejects a purchase that already has its
  receipt and a missing/zero receipt amount. The record's branch id/name now carry the Taguig line (same fix as Task 9;
  before, a Services purchase resolved as Sales). Response adds `refundDue` and `cashReturnFound`.
- `getPurchases` adds `refundDue` (advanced − receipt, for resolved purchases) and `cashReturnFound` per item.
- Cash-return rule (`cashReturnStatus`): a `CASH_SALE` item `RETURN|name|desc` on the same branch **and audit line**, same
  amount (±0.01), on a DTR dated **on or after** the purchase. Each return satisfies one purchase; same worker name is
  preferred but not required. ORDER| purchases are excluded.

**Portal** (`AuditFinanceExpenses.tsx`):
- Each pending purchase has an **Add receipt** button → `ReceiptScanDialog` (photo, scan, receipt no., actual amount,
  category…) → `POST /v1/reports/purchases/{id}/resolve`. That one call creates the record and marks the DTR line received,
  so the DTR shows it next time it is opened. Lists and summary refresh afterwards.
- If the receipt is lower than the cash given and no matching Cash Return exists, an alert tells the user to enter it on
  the DTR. A red box "Cash returns not found on the DTR" lists those (selected period) and they count in the month export.
- **"Fix the report":** purchases dated before 2026-10-01 are split out of the main count into "plus N older than Oct 1
  (₱X)" with a show/hide toggle (`PENDING_LEGACY_BEFORE`), so the box reflects what can still be acted on. Nothing is hidden
  or deleted. Change the constant if the cutoff should differ.

**Known limits:** the check matches on amount, so two purchases with the same refund can be mismatched; it does not
auto-create the Cash Return. A DTR opened *before* a receipt was added and re-saved afterwards can overwrite the
received flags (it sends its stale rows). The DTR's own Purchases table has no Add receipt button yet. The resolve
endpoint does not check the caller's branch (pre-existing).

---

## Task 11 — DTR "Expenses with Receipts": make Scan/Add receipt the obvious path (2026-10-01, uncommitted)

`DTR_Form.tsx` only. Scanning is the only way to attach a receipt there, but it was a tiny "Scan" text link.
- Header has a solid **Scan receipt** button (`SectionHeader` got an optional `action` slot). It reuses the empty row or
  adds one, opens the scanner, and removes the row again if the scan is cancelled (`startNewReceipt`, `closeReceiptDialog`).
- Empty section shows a large dashed "Scan a receipt" card; otherwise a status line "N of M expenses have a receipt
  photo", red from Oct 1 when any are missing.
- Rows without a photo show an **Add receipt** button (red from Oct 1 for filled rows, green otherwise); rows with a
  photo show the thumbnail with Edit/View + Remove; read-only DTRs show "No receipt". "Add row" is now "Add row manually".
Build passes; not viewed in a browser yet.

---

## Task 12 — DTR expenses are dated with the DTR, not the receipt (2026-10-01, uncommitted)

**Problem:** an Oct 1 DTR carried "ON CALL … payslip" expenses with a Sep 30 receipt date. The DTR counted them in October,
but the Expense Records were dated Sep 30, so they fell in September and showed up under "Recorded in a different month".

**Change (`DTR_Form.tsx`):** all three expense pushes (receipt scan, blur sync, submit loop) now use `formatExpenseDate()` =
the DTR's report date, as deposits and cash advances already did. The scan dialog says so under the date field
(`dateNote` prop). The receipt date is still kept on the DTR row/item and in the photo; it is no longer the record's date.
Records made from *purchases* (Add receipt on Expense Records) still use the receipt date.

**Existing records — automatic, no manual step:** Expense Records now treats a DTR-created record as belonging to the day of
its DTR, read from the DTR date embedded in the record id (`dtr-<branch>-<YYYY-MM-DD>-exp|dep|ca-<row>`, `dtrDateFromId`).
That date drives the table, month filter, period totals, exports and the "Recorded in a different month" check, so a
receipt dated Sep 30 entered on the Oct 1 DTR counts as October with nobody editing any date. An earlier one-click
"Fix dates" button was removed as redundant. The stored date of old records is unchanged until the DTR is re-saved or the
record is edited; other consumers that read the raw date (mobile app, backend reports) still see the receipt date.
Caveat: the rule relies on the id date matching the DTR date; DTR dates cannot be edited on an existing report (changing
the date starts a fresh form with new ids). Purchase-resolved records (UUID ids) keep their receipt date.
Build passes; manual test pending.

---

## Task 13 — One "Pending receipts" list (2026-10-01, uncommitted)

The Expense Records summary box (was "Purchases awaiting receipt") now lists **everything still waiting for a receipt** in one
place, oldest first: purchases with no receipt (button **Add receipt**) and records with no photo — expenses and deposit
slips, not cash advances (button **Add photo**, the Task 8 attach flow). Each row has a Purchase / No photo tag and its age.
The pre-October backlog is no longer hidden behind a toggle: it is listed below the current items under a
"Before Oct 1, 2026" divider, while the headline count and amount cover only current items (legacy shown as "plus N").
The list scrolls (max height 24rem). Build passes; manual test pending.

---

## Deferred (need a decision or a schema change — ask the user before starting)

- **Month close / lock** (recommended right after Task 4 — it is the only control that makes "must match from October" stick). Admin marks a branch-month "Closed" once Balanced; DTRs and records for that month become
  read-only. Needs a new table (e.g. `expense_month_close(branch_id, month, closed_by, closed_at)`) + migration SQL +
  checks in DTR save, audit-expense upsert/delete. Decide who can reopen.
- **Reused receipt photo detection.** Hash the compressed image (SHA-256 of the blob from `uploadReceiptImage`) and
  store it on the record; warn on a repeat. Needs a `receipt_image_hash` column on audit expenses.
- **Cash advance follow-through.** Match DTR `CASH ADVANCED` records with HRIS cash advances
  (`/hris/cash-advances`) so branch-given advances are deducted from pay. Needs a design for linking a DTR row to an
  HRIS advance (employee id, not just a typed name).
- **Deposit due banner on the DTR.** The header chip already warns (`currentCoh.overThreshold`); optionally repeat
  it inside the DTR form next to the COH Deposit section.

---

## Already done — status as of 2026-09-30

The earlier "uncommitted" work is now **committed** (portal commits `32a6d53`, `cafdca3`, `f852c8b`, `681de8a`,
`4fad27d`; backend working tree is clean). The only uncommitted portal change is Task 1 above (`DTR_Form.tsx`).
**Unverified:** whether the backend has been built and deployed. Confirm before relying on these:

Portal (committed):
- DTR: receipt scan popup (`ReceiptScanDialog.tsx`), deposits and cash advances pushed to Expense Records
  (`CASH ADVANCED`), October documentation checks (`DOCUMENTATION_REQUIRED_FROM`), Taguig schedule auto-sync fix,
  cash-return description column.
- Expense Records: Records-vs-DTR summary, possible duplicates, Deposit to HO, "Why the difference?", receipt-photo
  check, members cannot Add Record, searchable alphabetical categories, current-month default.
- Operations → Request Forms: Pending/Released/Cancelled only, Release/Cancel popup with required note, members can
  release/cancel their own, full-width view, submitted-by field.

Backend (**no schema change**; confirm deployed — Task 3 depends on `type` in `getPurchases`):
- `ReportService.getPurchases` returns `type`.
- `/release` endpoints on Cash Advance, Budget and Overtime controllers; cancel/status endpoints save the note;
  RELEASED/CANCELLED notification wording.

## Recommended order (revised)

1. Task 1 ✅ → 2. Task 4 ✅ (UI only) → 3. Task 2 ✅ (with multi-day lookback) → 4. Task 5 ✅, Task 3 ✅, Task 7 ✅, then
5. Task 6 (after the holiday question) → 6. Month close/lock.
