# Closed-week corrections (a proper way to "edit" a closed payroll week)

Source problem: [PAYROLL.md](PAYROLL.md) §2–§4 (grounding overpayment, individual adjustments, pending items carried
from the previous payroll). §1 (Oct 7 pending receipt) is a different module and is already covered by
[pending-receipt-vs-reimbursement.md](pending-receipt-vs-reimbursement.md).

Repos touched: `ashcol-web-portal` and `ashcol-service-api`. **Has a schema change** (new table + new columns).

## 1. What the code does today (verified)

| Area | Behaviour | Where |
|---|---|---|
| Close week | Inserts a `payroll_week_closures` row. Rows whose work date is inside the week are frozen. | `PayrollService.closeWeek`, `replaceEntries` |
| Reopen week | **Deletes** the closure row. No reason, no record of who reopened or what changed after. (To be removed — see Phase 5.) | `PayrollService.reopenWeek`, `Payouts.tsx` `handleReopenWeek` |
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

**Lifecycle (confirmed by the user):** a tech set to *Completed* = payout released. Once every tech in the week is
Completed and their payouts are sent, the week is closed. **A closed week is never reopened and never edited.** The
only way to change money after close is a correction, which is added or deducted in the open week you pick (usually
the next one) and shows there.

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

- [x] **D1. Reopen?** Decided: a closed week is never reopened. No override.
- [x] **D2. Who may reopen?** Decided: nobody. Posting corrections and closing: anyone with payroll access.
- [x] **D6. Closing a week while some techs are not Completed** — Decided: block. A week cannot be closed until every tech with payroll rows in it is Completed; the message lists who is not.
- [ ] **D3. Deduction bigger than the next payout** — allow a negative net with a warning (recommended for v1), or split across cutoffs?
- [ ] **D4. Grounding rule** — stop auto-stamping Earth Grounding and pay it only when typed in (recommended), or keep auto-stamp and add a "c/o customer" flag per ticket? (Quick stop-gap with no code: set the branch's Earth Grounding rate to 0 in Payroll Settings.)
- [ ] **D5. Confirm reading of PAYROLL.md:** Glyza Cruz, Mikko Librado, Raquel Baynosa, Juliet Rondola and Teodora San Jose are *customers* on tickets under installer Mariano.

## 5. Phases (one per command)

### Phase 1 — Backend: ledger + atomic endpoints (schema) — DONE (ashcol-service-api, uncommitted)
- [x] `PayrollCorrection` entity + repository; migration `V163__create_payroll_corrections.sql`
- [x] Manual script `scripts/postgres/create_payroll_corrections.sql` (with RLS deny policy) and a block added to `prod-schema-patch.sql`. **Prod has Flyway off and `ddl-auto=validate`: run the SQL before deploying or the backend will not boot.**
- [x] `POST /api/v1/payroll/corrections` — one or many tickets; with a target week they post at once, without one they are recorded PENDING. One transaction, under the existing branch+month lock. Paid amounts are computed on the server (cell × 50% share + earlier posted corrections), never taken from the client.
- [x] `POST /corrections/{id}/post`, `POST /corrections/{id}/void` (a posted one is voidable only while its week is open), `GET /corrections?branchId&status&installer&weekFrom` (payroll only)
- [x] Idempotent startup backfill of existing `pay:adjLog` entries into the ledger (`PayrollCorrectionBackfill`)
- [x] Tests: `PayrollCorrectionIntegrationTest` (11) — post, repeat correction, 50% ticket, open-week origin rejected, closed target rejected and nothing written, pending→post + bulk batch, void, void after close blocked, reserved keys / missing reason, non-payroll denied, backfill
- [x] Gate: the 11 new tests and the existing payroll tests (branch view, release filter, share link, email) pass. The full `mvn test` suite was not run.
- Notes: (1) the adjustment row is created `PENDING` (the old portal flow copied the origin's `COMPLETE`), so a tech's target week has to be completed again once a correction lands in it. (2) The corrected ticket's `pay:adjLog` is still written so today's portal screens keep working; remove it in Phase 2 once the portal reads the ledger.

### Phase 2 — Portal: move Adjust Balance and History onto the ledger — DONE (uncommitted; not yet tried in a browser against a running backend)
- [x] `src/utils/payrollCorrectionsApi.ts` (types, list / create / post / void, `CorrectionError` carrying the server's message)
- [x] `submitAdjust` makes one `POST /corrections` call; the two-step `mutateSavedMonth` + manual rollback for adjustments is gone. The saved row's id is resolved from the saved month, not the on-screen row id.
- [x] "Undo adjustment" (carry-over table) and a new Void button in Correction History both call void; a voided adjustment row is dropped from the screen at once
- [x] `CorrectionHistoryModal` reads the ledger (no 3-month scan, any month); status and installer filters; posted / pending / voided badge; net counts posted only
- [x] Closed-week view: header chip "N corrections · net ₱X in later weeks" (opens the history) and a violet marker on corrected rows in the desktop list
- [x] Adjust Balance's Paid figure and "earlier adjustments" count come from the ledger; the server's rejection message shows in the modal
- [x] Backend no longer writes `pay:adjLog` on the closed row (it is now never touched); `parseAdjustmentLog` removed from the portal. Legacy logs are still imported once by the backfill.
- [x] Gate: `npx tsc -p tsconfig.app.json --noEmit` clean; lint on the changed files equals the baseline; backend payroll tests pass (11 correction tests, updated)
- Notes: the marker is desktop list only (not the mobile cards). Correction History is payroll-only because the list endpoint is. **Deploy order: run the Phase 1 SQL, deploy the backend, then the portal** — the new portal calls `/v1/payroll/corrections`.
- Still to check by hand: post an adjustment on a closed ticket, see it in the next week, open Correction History, void it, and confirm the next week's total returns.

### Phase 3 — Bulk correction — DONE (uncommitted; not yet tried in a browser against a running backend)
- [x] "Bulk Correct" button in the toolbar of a closed week → `BulkCorrectionModal`: pick one column, "Set to" an amount or "Add / deduct" a difference, tick tickets across every installer, one reason, one open target week
- [x] Each ticket shows paid → new amount and its difference; tickets with no change are dimmed and never sent. Installer sections show the net each tech will get, plus a grand total, before posting. Defaults to Earth Grounding, with every ticket that has a value selected.
- [x] One `POST /corrections` with all items = one batch: it lands whole or not at all (server transaction)
- [x] Correction History groups a bulk request under one header ("Bulk correction · N tickets · net ₱X") with **Void whole batch**
- [x] Backend `POST /corrections/batches/{batchId}/void` — all or none: if any posted item's week has since closed, nothing is voided. 2 new tests (13 in the class, all passing).
- [x] Gate: portal typecheck clean; lint on changed files equals the baseline; backend correction tests pass
- Notes: the list shows tickets that have a value in the chosen column (tick "Also show tickets with no …" to include empty ones). "Add / deduct" is computed from each ticket's own paid amount, so tickets with different amounts all move by the same difference. The server recomputes what was paid, so a stale screen can't post a wrong difference. Still to try by hand: bulk-correct Earth Grounding to 0 on a closed week, see the per-installer totals in the next week, then void the batch.

### Phase 4 — Pending items and installer-level corrections — DONE (uncommitted; not yet tried in a browser against a running backend)
- [x] **Flag for Review** on a closed-week ticket (reason required): recorded PENDING with no amount, changes no pay. Button in the ticket's detail popup.
- [x] **Add Pending Item** on a closed week: an installer-level item with no ticket (installer, optional signed amount, reason), tied to the closed week on screen
- [x] **Pending Items (N)** list for the branch (any week), grouped by installer, with age (amber after 7 days). Each item: **Post to week** (open week; a flagged ticket adds a column + corrected amount, an installer-level item an amount) or **Dismiss** (reason required, kept in history as Voided)
- [x] Roster badge "N pending" next to the installer's name (opens the list)
- [x] Closing a week now notes how many pending items from earlier weeks are still unsettled (a note in the confirm dialog, not a block)
- [x] Backend: `origin_entry_id` is nullable; a ticket item may have no `changes` (PENDING only); `PostRequest` can carry `changes` / `amount`; an installer-level amount is stored in the custom column `custom_correction` ("Correction") and counts toward the payout like any fee; the origin week must be closed
- [x] Tests: 6 new (19 in the class, all passing) — flag then post, flag + target week rejected, installer-level post, installer-level flag then post, closed-week / installer / amount rules, dismiss
- [x] Gate: portal typecheck clean; lint on changed files equals the baseline; backend correction tests pass
- **SQL to run before deploying this backend:** `scripts/postgres/payroll_corrections_origin_nullable.sql` (drops NOT NULL on `origin_entry_id`; without it, saving an installer-level item fails). Also appended to `prod-schema-patch.sql` and added as `V164`.
- Notes: flagging a ticket is recorded per ticket, not per column; posting it from the Pending list corrects one column — for several columns use Adjust Balance, then dismiss the flag. An installer-level amount shows in the target week as an "Adjustment" row (no ticket number) under that installer.
- Still to try by hand: flag a ticket, add a −₱350 item, see the roster badge, post one to the next week and confirm the installer's total, dismiss another.
- For PAYROLL.md: Raquel Baynosa (hauling), Juliet Rondola (cleaning), Teodora San Jose (parts) → Flag for Review on each ticket; the ₱350 shortage → Add Pending Item (−350) for Mikko Librado / Glyza Cruz's installer, or post it straight away.

### Phase 5 — Closed means closed (schema) — DONE (uncommitted; not yet tried in a browser against a running backend)
- [x] Reopen removed: the portal button/handler are gone, and `DELETE /v1/payroll/closures` and `reopenWeek` no longer exist (the endpoint now answers 405). The closed chip says a closed week is never reopened.
- [x] **Close guard, enforced on the server** (D6): closing a week is refused with 409 and the names of the technicians not Completed. Held tickets, released originals and in-house (salaried) crew are ignored; a carry-over or adjustment counts in the week it was released into. The portal disables Close with the same list and shows who is missing.
- [x] `payroll_week_closures.close_snapshot` (migration `V165`, script, patch): per-installer gross / deductions / net as the screen showed them at close. The portal builds it and sends it with the close request, so it is **informational (client-supplied)**, not a server calculation. The closed chip's tooltip shows the net paid at close.
- [x] Frozen rows: only `hold:` tags and the balance flow's `pay:status` / `pay:split` / `pay:balanceReleased` / `pay:copyId` may change on a closed row, **and only if its payout share stays the same** (so `pay:factor`, or a status change that would turn 100% into 50%, is refused)
- [x] A save that touches a closed week and is refused (an edited value, a refused tag, a new row dated in a closed week) is reported in `X-Payroll-Rejected-Count` / `X-Payroll-Rejected` response headers (the body is unchanged for other clients); the portal shows "Some Changes Were Not Saved". An identical resubmission of a closed week is not reported. CORS now exposes those two headers.
- [x] Close permissions: close/check/reopen already required payroll access on the server (changed earlier by someone else); the portal button uses the same rule
- [x] Tests: 9 new in `PayrollWeekCloseIntegrationTest` (guard, in-house/held/released, carry-over, snapshot + idempotence, identical resubmission, refused edit, refused payout-share tags, hold + balance tags still work, new row refused); correction tests updated to complete rows before closing
- [x] Gate: portal typecheck clean; lint on changed files equals the baseline; payroll backend tests pass. Full backend suite: 161 tests, 29 failing in ticket / booking / relay / import classes — the same classes fail on the last committed code (before Phases 3–5), so they are not from this work.
- **SQL to run BEFORE deploying this backend:** `scripts/postgres/add_close_snapshot_to_payroll_week_closures.sql`. Prod validates the schema at boot, so without this column the backend will not start.
- Notes: the in-house match uses the same loose name matching as the technician payout filter; if a salaried tech's row is matched to someone else it is skipped from the check (it can only make the check more lenient, never stuck). A week with no payout rows at all can be closed.
- Still to try by hand: Close is disabled with a list while a tech is pending; completing everyone enables it; the chip tooltip shows the paid total; try to edit a closed ticket's amount and confirm it is refused with a message.

### Phase 6 — Stop the grounding overpayment at the source — DONE (uncommitted; portal only, no backend or SQL)
- [x] **D4 decided: Earth Grounding is not paid by default; it is paid only when someone types it in.** `applyDailyAllowance` no longer stamps it; Daily Allowance is unchanged.
- [x] A hand-typed grounding value (the cell is still editable and is flagged manual) survives every sync, as before.
- [x] The "Earth Grounding" rate is removed from Payroll Settings (it would do nothing); the default rate is 0 and an already-saved branch rate is ignored.
- [x] Gate: `npx tsc -p tsconfig.app.json --noEmit` clean; lint on the two changed files equals the baseline.
- **Effect on open weeks:** the next **Sync Latest** clears any grounding amount in an open week that was auto-added and never hand-edited. Closed weeks are untouched (fix those with a correction). Anyone who typed grounding by hand keeps it. Check an open week after its first sync.
- Not done: nothing marks a ticket "grounding done / c/o customer"; staff simply enter the fee on the tickets where the company really pays it.

## Status

All six phases are built. Phases 3–6 are uncommitted, and none of this has been exercised in a browser against a running backend. SQL to run before the matching backend deploy: `payroll_corrections_origin_nullable.sql` (Phase 4) and `add_close_snapshot_to_payroll_week_closures.sql` (Phase 5, required — prod will not boot without it).
