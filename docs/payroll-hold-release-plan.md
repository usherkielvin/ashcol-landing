# Plan: Payroll Ticket Hold & Release (carry-over to a later week)

Implementation plan for another model. **Frontend only — no backend changes, no new endpoints.**
Read `CLAUDE.md` first. Verify with `npm run build` (no test runner exists). Lint noise for
`no-explicit-any` / `exhaustive-deps` is pre-existing — diff against baseline.

**Status: implemented** (`payrollDerive.ts`, `Payroll.tsx`, `WeekSummaryModal.tsx`). One backend
change was added beyond the original "frontend only" scope, by request: `PayrollService.
replaceEntries` (`ashcol-service-api`) previously froze — silently dropped — any save touching a
row inside a closed week, including a hold/release/undo customFields-only tag change. It now
special-cases exactly that: a frozen row's incoming counterpart is allowed to update in place only
when every field except `customFields` is byte-identical AND every differing customFields key
starts with `hold:`. Everything else about a closed week is still fully locked. This means a
ticket held in a week that later gets closed still shows in Held Tickets and can be released into
any open week; the backend needs the matching redeploy for this to take effect.

## Goal

- **Hold:** a job row in an open payroll week is put on hold → excluded from that week's totals,
  listed in a branch-wide "Held Tickets" view.
- **Release:** a held row is released into an open target week (default: current week) → its full
  payout appears in that week as a carry-over, counted under **Add-ons**, not Base Install.
- **Undo release:** removes the carry-over and puts the original back on hold.

## Decisions (already agreed — do not re-ask)

1. Hold only while the row's own week is **open**; release only into an **open** week. Use the
   existing `closures` state in `Payroll.tsx` (`PayrollWeekClosure`, matched on `branchId` +
   `weekFrom` + `weekTo`) to check. Blocked → show a `ConfirmDialog` message, do nothing.
2. Released tickets show in a **separate "Released Hold Tickets (Carried Over)" table** under the
   installer's job table (desktop + mobile), not inline.
3. A released ticket's **full** `rowTotal` counts as **Add-ons** (exclude it from Base Install).
4. In the North/South Installers Summary (`WeekSummaryModal`), carry-over amounts feed the
   **"Salary amount from previous payroll"** column (`prevSalary`) automatically, not `amount`.
5. Anyone with payroll access (`canManagePayroll`) can hold/release.
6. Record both a typed approval note (e.g. "Approved by Ma'am Patt") and the logged-in user's name.
7. Held Tickets view = **whole branch**, filterable by installer. Loads the current month + the
   previous 2 months (the payroll API requires `month`; there's no all-months endpoint).
8. Release target = **any open week**, default the currently viewed week.

## How it's stored (important — read before coding)

Payroll rows are saved per **branch + month** via `PUT /v1/payroll` with the **full entry list for
that month** (it replaces the month). Hold/release data lives in each row's `customFields`
(string values), the same pattern as `ded:` deductions and `manual:` fee flags.

### customFields keys (all prefixed `hold:`)

On the **original** row (stays in its original month forever):

| key | value |
|---|---|
| `hold:state` | `'held'` or `'released'` |
| `hold:reason` | hold reason text |
| `hold:heldAt` / `hold:heldBy` | ISO timestamp / user name |
| `hold:heldWeekFrom` / `hold:heldWeekTo` | the row's week at hold time (YYYY-MM-DD) |
| `hold:releasedAt` / `hold:releasedBy` / `hold:approvalNote` | set on release |
| `hold:targetWeekFrom` / `hold:targetWeekTo` | target week |
| `hold:copyId` | id of the carry-over copy row |

On the **carry-over copy** (new row, saved into the **target** week's month):

| key | value |
|---|---|
| `hold:carryOver` | `'1'` |
| `hold:originRowId` / `hold:originMonth` | original row id / month key it's saved under |
| `hold:originWeekFrom` / `hold:originWeekTo` | original week |
| `hold:originTicketId` | original `ticketId` |
| `hold:targetWeekFrom` / `hold:targetWeekTo` | target week |
| `hold:saveMonth` | `targetWeekFrom.slice(0, 7)` |
| `hold:approvalNote` / `hold:releasedBy` / `hold:releasedAt` | copied from release |

The copy is a clone of the original row with a **new `id`**, **`ticketId: undefined`** (keep
`ticketNumber`), and all fee fields unchanged. Clearing `ticketId` makes the Schedules sync
(`deduplicateAndMergePayroll`, keyed on `ticketId|installer`) treat it as a manual row, so a
re-sync never overwrites it or collides with the original when both are in the same month.

### Landmines

1. **`flushSave` groups rows by `workDate` month** (`Payroll.tsx`, `flushSave`). The copy keeps the
   original `workDate`, so it would be saved into the **original** month. If that month isn't
   loaded, that save **overwrites the whole month with just the copy**. Fix: add a helper
   `saveMonthOf(r) = r.customFields?.['hold:saveMonth'] || (r.workDate ? r.workDate.slice(0,7) : fallback)`
   and use it in `flushSave`'s grouping.
2. **Never write to a month that isn't fully loaded through `flushSave`.** Hold/release/undo touch
   rows that may live in other months (the Held list spans 3 months). Add a dedicated helper that
   does fetch → modify → put for exactly one month:
   ```ts
   // GET /v1/payroll?branchId&month → map with mapSavedPayrollEntry → apply mutator → PUT via savePayrollToBackend
   async function mutateSavedMonth(branchId: string, monthKey: string, mutate: (rows: PayrollRow[]) => PayrollRow[]): Promise<boolean>
   ```
   After any hold/release/undo, call `loadAndSync(true)` to refresh the view. Don't also call
   `scheduleAutoSave` for these operations, or the debounced full save can race the helper.
3. **Week filter drops the copy.** `filteredRows` and `technicianOptions` filter on `workDate`
   between `dateFrom`/`dateTo`. Carry-over copies must instead match on
   `hold:targetWeekFrom === dateFrom && hold:targetWeekTo === dateTo`.
4. **`monthsToFetch`** loads the months of `dateFrom` and `dateTo`. The copy's `saveMonth` =
   `targetWeekFrom.slice(0,7)`, which is always in that set.
5. **Deductions live on the first row of the period** (`setDeduction` uses `installerRows[0]`).
   Rows sort by `workDate`, so a carry-over copy (older date) would sort first, and undoing the
   release would delete the deductions. `setDeduction` must pick the first row that is **not** a
   carry-over copy and not held/released.
6. `hold:` keys must never count as money or become custom columns:
   - `customFieldsFeeTotal` in `src/utils/payrollDerive.ts`: skip `k.startsWith('hold:')`.
   - Custom-column auto-discovery in `Payroll.tsx` (`loadAndSync`, the loop that skips `ded:`,
     `xfer:`, and `MANUAL_FEE_PREFIX`): also skip `hold:`.

## Steps

### 1. `src/utils/payrollDerive.ts` — shared helpers (export all)

```ts
export const HOLD_PREFIX = 'hold:'
export const isHeldRow      = (r: PayrollRow) => r.customFields?.['hold:state'] === 'held'
export const isReleasedOrig = (r: PayrollRow) => r.customFields?.['hold:state'] === 'released'
export const isCarryOver    = (r: PayrollRow) => r.customFields?.['hold:carryOver'] === '1'
/** Counts toward its own week's totals: not held, not a released original. */
export const isActivePayRow = (r: PayrollRow) => !isHeldRow(r) && !isReleasedOrig(r)
```

Also update `customFieldsFeeTotal` (landmine 6).

### 2. `Payroll.tsx` — week filtering and totals

- `filteredRows` (and `technicianOptions`): exclude `!isActivePayRow(r)` rows. Include carry-over
  copies by target week (landmine 3), not by `workDate`.
- Split each installer's rows into `regularRows` (not carry-over) and `carryRows` (carry-over).
  - The job table renders `regularRows`. The new carry-over table renders `carryRows`.
  - Gross and net totals (`installerTotal`, `installerNet`, roster "Payroll Amount", global
    tiles) use **both** lists.
- `baseInstallTotal`: skip carry-over rows, so their full payout lands in Add-ons
  (`Add-ons = gross − base` already).
- `completedJobsCount` / `completedJobsBreakdown`: skip carry-over rows.
- `flushSave`: group with `saveMonthOf` (landmine 1).
- `setDeduction`: landmine 5.

### 3. `Payroll.tsx` — Hold action

- In the job detail popup (`{detailRow && createPortal(`, next to the "View Ticket action" footer),
  add a **"Put on Hold"** button. Show it only if `canManagePayroll && !isWeekClosed && !isCarryOver(row)`.
- It opens a small modal. Follow the existing modal pattern: portal, `z-[999999]`, no
  close-on-backdrop, closes only via X / Cancel / Confirm. The modal has a required reason
  textarea.
- On confirm: `mutateSavedMonth(branchFilter, saveMonthOf(row), rows => set hold:state='held', hold:reason, hold:heldAt, hold:heldBy=user.name, hold:heldWeekFrom/To = activeWeek.from/to on that row id)`,
  then close the popup and run `loadAndSync(true)`.

### 4. `Payroll.tsx` — Held Tickets view

- Toolbar button **"Held Tickets (N)"**, shown when `canManagePayroll && branchFilter`. It opens a
  large modal (same modal rules as above).
- Data: for the active month and the 2 months before it (use `prevMonth` from `payrollWeeks.ts`),
  fetch `GET /v1/payroll?branchId&month` and map with `mapSavedPayrollEntry`. Collect the rows
  where `isHeldRow`, and remember each row's month key. N = that count; refresh it after
  hold/release.
- Filters: an installer dropdown (use `resolveGroupKey`/`displayInstallerName` for names) and a
  search box.
- Columns: Date, Ticket #, Customer, Installer, Original week (`hold:heldWeekFrom–To`), Reason,
  Held by/at, Payout (`rowTotal`), and an action **"Release to Payroll"**.

### 5. `Payroll.tsx` — Release flow

Release modal fields:
- **Target week** select. Options: the weeks of the active month and the next month
  (`weeksOfMonth(m, branchWeekCycle(branchFilter))`), excluding closed weeks. Default: the
  currently viewed `activeWeek` if it's open.
- **Approval note** (optional text).

On confirm:
1. Build the copy (see "How it's stored"). Set `hold:releasedBy = user.name` and
   `hold:releasedAt = now`.
2. `mutateSavedMonth(branchFilter, copy saveMonth, rows => [...rows, copy])`.
3. `mutateSavedMonth(branchFilter, originMonth, rows => mark the original: hold:state='released', hold:releasedAt/By, hold:approvalNote, hold:targetWeekFrom/To, hold:copyId)`.
4. If step 3 fails, remove the copy (step 2 in reverse) so it isn't paid twice. Show an error
   dialog.
5. Refresh the Held list and run `loadAndSync(true)`.

### 6. `Payroll.tsx` — Carry-over table (installer detail view)

- Under the job table (desktop list and mobile cards), when `carryRows.length > 0`, add a section
  titled **"Released Hold Tickets (Carried Over)"**.
- Columns: Date (original), Ticket #, Customer, "Released from <originWeekFrom–To>" pill, Note /
  approver, Payout (`rowTotal`).
- Row action **"Undo release"** (only if `canManagePayroll` and the week isn't closed):
  1. `mutateSavedMonth(copy saveMonth, remove copy by id)`.
  2. `mutateSavedMonth(originMonth, set the original back to hold:state='held' and delete hold:releasedAt/releasedBy/approvalNote/targetWeek*/copyId)`.
  3. Run `loadAndSync(true)`.
- The footer's Gross / Base / Add-ons / Net numbers already come from the step 2 totals. Check
  that Add-ons increases by the carry-over total.

### 7. `src/components/WeekSummaryModal.tsx`

In `compiledRows`, per installer group:
- Build the group from rows in the week (`workDate` range) **plus** carry-over copies whose
  `hold:targetWeekFrom/To` match `weekFrom/weekTo`. The carry-over rows are in the fetched months
  (landmine 4).
- `amount` / `computedAmount`: use only rows where `isActivePayRow(r) && !isCarryOver(r)`.
- `prevSalary` default (when there's no override): the sum of `rowTotal` over that installer's
  carry-over rows. Import `rowTotal` from `payrollDerive`.
- `totalForRelease` already adds `prevSalary`. The grand total is `finalTotal + totalPrevSalary`
  (already fixed).
- If an installer's only rows are carry-overs, still show the row: `amount = 0`, with the
  `prevSalary` value.

## Acceptance checks (manual, in browser)

1. Hold a row in an open week → the row leaves the table, totals drop by its `rowTotal`, and Held
   Tickets (N) goes up by one.
2. Hold is blocked in a closed week.
3. Release into the current week → the row appears in the carry-over table, Add-ons and Gross
   rise by its payout, Base is unchanged, and it's gone from the Held list.
4. Sync Latest after the release → no duplicate row. The original stays hidden and the copy is
   unchanged.
5. Release into a week in another month → the source month's other rows are intact (reload that
   month and check).
6. Undo release → the copy is gone, the ticket is back in the Held list, and totals return.
7. Deductions entered on a week that has a carry-over survive an undo release.
8. The North/South Summary for the target week shows the payout under "Salary amount from
   previous payroll", `amount` excludes it, and the grand total = final + previous.
9. `npm run build` passes.
