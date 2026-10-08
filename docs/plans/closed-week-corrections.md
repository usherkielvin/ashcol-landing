# Closed-week corrections (a proper way to "edit" a closed payroll week)

Source problem: [PAYROLL.md](PAYROLL.md) §2–§4 (grounding overpayment, individual adjustments, pending items carried
from the previous payroll). §1 (Oct 7 pending receipt) is a different module and is already covered by
[pending-receipt-vs-reimbursement.md](pending-receipt-vs-reimbursement.md).

Repos touched: `ashcol-web-portal` and `ashcol-service-api`. **Has a schema change** (new table + new columns).

## 1. What the code does today (verified)

| Area | Behaviour | Where |
|---|---|---|
| Close week | Inserts a `payroll_week_closures` row. Rows whose work date is inside the week are frozen. | `PayrollService.closeWeek`, `replaceEntries` |
| Reopen week | **Deletes** the closure row. No reason, no record of who reopened or what changed after. | `PayrollService.reopenWeek`, `Payouts.tsx` `handleReopenWeek` |
| Adjust Balance | One closed-week ticket at a time. Posts the difference as an adjustment row in an open week and logs it on the ticket in `customFields['pay:adjLog']`. | `Payouts.tsx` `submitAdjust`, `AdjustBalanceModal.tsx` |
| Correction History | Rebuilt in the browser by downloading 3 whole months and parsing each row's JSON log. | `Payouts.tsx` `refreshCorrections`, `CorrectionHistoryModal.tsx` |
| Earth Grounding | Stamped automatically from the branch rate (default ₱100) on the first ticket of every installer-day, whether grounding was done or not. | `payrollDerive.ts` `applyDailyAllowance` |

## 2. Why PAYROLL.md keeps happening

1. **Two ways to change a closed week, and the easy one is unsafe.** Reopen unlocks everything, the next sync can
   re-stamp fees, and the net silently changes after the tech was already paid (their PDF / link / email now disagree
   with the screen). Nothing records what the week paid at close.
2. **Corrections are one ticket at a time.** The grounding case (same column wrong on 7 tickets) needs 7 separate posts.
3. **A correction needs an amount right away.** There is no way to flag "check this later" (hauling uncollected,
   cleaning to reconcile, parts to reconcile), so those live in chat notes and get lost between cutoffs.
4. **A correction must be a fee column on an existing ticket row.** A plain "₱350 shortage, installer X" has no home
   except a deduction typed into the next open week with no link to where it came from.
5. **The adjustment is stored as JSON inside a whole-month save.** It takes two browser round trips with a manual
   rollback (`mutateSavedMonth` ×2), the history only reaches back 3 months, and it cannot be reported on.
6. **The lock has gaps.** A closed row still accepts any `pay:` key, including `pay:factor` / `pay:status`, which
   change the payout. A save that touches a frozen row returns 200 and silently drops it. Close/Reopen buttons show
   for payroll job titles, but the backend only allows ADMIN / MANAGEMENT / MANAGER (403 for a payroll clerk).
7. **Grounding is paid by default.** That is the root cause of §2, not a typing mistake.

## 3. Proposed model

**Rule: a closed week is what was paid. It never changes. Every later change is a correction that points back to it
and lands in an open week.**

Two clear paths, chosen by the system, not by habit:

- **Not paid out yet** (no payout in the week is marked Completed) → *Reopen with reason*. Logged, and the week's
  totals at close are kept so the difference after re-closing is visible.
- **Already paid** → *Correction*. Reopen is blocked (admin override with a typed reason).

### Corrections ledger (new backend table `payroll_corrections`)

One row per correction, replacing the `pay:adjLog` JSON as the source of truth:

- who/where: `branch_id`, `installer_name`, origin week, origin ticket (id, number, customer) — ticket is optional
- what: `changes` (JSON: column, paid, corrected, difference), `net_amount` (signed), `reason`, `batch_id`
- state: `PENDING` (flagged, no amount or week yet) → `POSTED` (lands in a target week) → `VOID`
- where it lands: target week, id of the adjustment row it created
- audit: created / posted / voided by + at

Posting still creates the same adjustment row in `payroll_entries` (`hold:carryOver` + `pay:adjust`), so roster
totals, the PDF, the share link, the email and the week summary keep working with no change. The difference is that
the **backend does it in one transaction** behind one endpoint, instead of the browser doing two saves and a rollback.

### What this gives the PAYROLL.md items

| Item | Today | With this plan |
|---|---|---|
| §2 Grounding ×7 | 7 separate Adjust Balance posts | One bulk correction: pick column "Earth Grounding", tick 7 tickets, set to 0, one reason |
| §3 Glyza Cruz / Mikko Librado | Adjust Balance per ticket (works) | Same, but stored in the ledger and visible on the closed week |
| §4 Baynosa / Rondola / San Jose | Not tracked anywhere | Pending items on the installer, shown every cutoff until posted or dismissed |
| §4 ₱350 shortage | Loose deduction, no origin | Installer-level correction (no ticket needed) linked to the origin week |

## 4. Decisions needed before coding

- [ ] **D1. Block Reopen once any payout in the week is Completed?** Recommended: yes, admin/management override with reason.
- [ ] **D2. Who may reopen?** Recommended: admin/management only. Posting corrections and closing: anyone with payroll access.
- [ ] **D3. Deduction bigger than the next payout** — allow a negative net with a warning (recommended for v1), or split across cutoffs?
- [ ] **D4. Grounding rule** — stop auto-stamping Earth Grounding and pay it only when typed in (recommended), or keep auto-stamp and add a "c/o customer" flag per ticket? (Quick stop-gap with no code: set the branch's Earth Grounding rate to 0 in Payroll Settings.)
- [ ] **D5. Confirm reading of PAYROLL.md:** Glyza Cruz, Mikko Librado, Raquel Baynosa, Juliet Rondola and Teodora San Jose are *customers* on tickets under installer Mariano.

## 5. Phases (one per command)

### Phase 1 — Backend: ledger + atomic endpoints (schema)
- [ ] `PayrollCorrection` entity + repository; migration `V163__create_payroll_corrections.sql`
- [ ] Matching manual script in `scripts/postgres/` (RLS deny policy like `create_payroll_week_closures.sql`) and add to `prod-schema-patch.sql`. **Prod has Flyway off and `ddl-auto=validate`: the SQL must be run before deploy or the backend will not boot.**
- [ ] `POST /v1/payroll/corrections` — one or many items; creates ledger rows + adjustment rows in one transaction, under the existing branch+month lock; rejects a closed target week with a real error
- [ ] `POST /v1/payroll/corrections/{id}/post` (pending → posted), `/{id}/void` (removes the adjustment row; only while the target week is open), `GET /v1/payroll/corrections?branchId&status&installer&weekFrom`
- [ ] One-time idempotent backfill of existing `pay:adjLog` entries into the ledger (same pattern as `TicketCategoryBackfill`)
- [ ] Tests next to `PayrollBranchViewIntegrationTest`: post, bulk, void, closed-target rejection, non-payroll user denied
- [ ] Gate: `mvn test` (or the repo's wrapper) passes

### Phase 2 — Portal: move Adjust Balance and History onto the ledger
- [ ] `src/utils/payrollCorrectionsApi.ts` (feature API helper, like `vehicleApi.ts`)
- [ ] `submitAdjust` calls the new endpoint; delete the two-step `mutateSavedMonth` + rollback path for adjustments
- [ ] "Undo adjustment" calls void
- [ ] `CorrectionHistoryModal` reads the ledger (no 3-month scan); add status and installer filters
- [ ] Closed-week view: banner "N corrections posted from this week, net ₱X" and a marker on corrected tickets
- [ ] Gate: `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` vs baseline, manual check in the browser

### Phase 3 — Bulk correction
- [ ] In a closed week: "Bulk correct" → pick one column → tick tickets (across installers) → new value or ₱ difference → one reason, one target week
- [ ] Preview grouped by installer with the net each one will get before posting
- [ ] Posts as one batch (`batch_id`); history groups by batch; void whole batch
- [ ] Gate: as Phase 2

### Phase 4 — Pending items and installer-level corrections
- [ ] "Flag for review" on a closed-week ticket (reason required, amount optional) → `PENDING`
- [ ] Installer-level correction with no ticket (amount + reason + origin week)
- [ ] Roster badge "N pending" per installer; a Pending Items list for the branch; actions: Post to week / Dismiss with reason
- [ ] Warn when closing a week while the branch still has pending items older than one cutoff
- [ ] Gate: as Phase 2

### Phase 5 — Reopen and lock hardening (schema)
- [ ] `payroll_week_closures`: add `close_snapshot` (per-installer gross / deductions / net at close), `reopened_by`, `reopened_at`, `reopen_reason`; reopen keeps the row as history instead of deleting it (migration + manual script)
- [ ] Reopen requires a reason; blocked per D1; permissions per D2, and backend + portal use the same rule
- [ ] On re-close, show what changed against the previous snapshot
- [ ] Frozen rows accept only an explicit whitelist of `hold:` / `pay:` keys (no `pay:factor`, `pay:status`, `pay:split`) unless the request is the balance-release flow
- [ ] A save that had frozen rows dropped reports them in the response, and the portal shows it instead of a silent "saved"
- [ ] Gate: backend tests + portal typecheck/lint

### Phase 6 — Stop the grounding overpayment at the source
- [ ] Implement D4 in `payrollDerive.ts` (`applyDailyAllowance` / re-sync merge)
- [ ] Gate: typecheck/lint; sync an open week and confirm grounding is no longer added on its own

## 6. Not in this plan

- PAYROLL.md §1 (expense pending receipt).
- Automatic instalments for large deductions (see D3).
- Rewriting the whole-month save for normal open-week editing.

## 7. This cutoff, with what exists today

Nothing needs to wait for the build. In the closed week, open each affected ticket → **Adjust Balance** → set the
corrected amount (Earth Grounding → 0 for the 7 grounding tickets; Dismantling / Power Supply for §3) → target the
next open week → reason. The §4 items have to stay on a manual list until Phase 4.
