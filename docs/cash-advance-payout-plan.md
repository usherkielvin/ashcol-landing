# Cash advance ↔ Payouts deduction plan

Status: **plan only — nothing built yet.** Written 2026-10-03 after tracing the real flow. It replaces the
"Cash advance follow-through" bullet in `expenses-dtr-cashflow-plan.md` (Deferred section), whose approach
(link each DTR row to an HRIS advance by employee id) is not the right shape — see "What was wrong" below.

## What actually exists today (three unrelated things)

| # | Where | Data | Status model |
|---|-------|------|--------------|
| 1 | **DTR form → Cash Advance section** (`DTR_Form.tsx`) | `report_items` row, `type = CASH_ADVANCE`, `description = "<member name typed>\|<details>"`, `amount`. Counted as a cash **expense** on that DTR (`ReportService` ~L213) and mirrored to Expense Records as `CASH ADVANCED` (`resolvedExpenseId = dtr-<branch>-<date>-ca-<rowId>`). | `collection_resolved` false/true = **PENDING / PAID** (+ `collection_date_paid`, `collection_amount_paid`, `collection_notes`, resolved_by/at). Edited on the **For Cash Advances** page (`CashAdvances.tsx`, `/v1/reports/cash-advances`). |
| 2 | **HRIS cash advances** (`/api/hris/cash-advances`, `CashAdvance` + `CashAdvanceRepayment`) | Employee-requested loan with approval, `monthly_deduction`, `remaining_balance`, repayments (`PAYROLL_DEDUCTION` / `CASH_PAYMENT`). | PENDING → APPROVED → DISBURSED → FULLY_PAID / RELEASED… |
| 3 | **Payouts → Deductions modal → "AC Loan / CA"** | Two hand-typed numbers saved as `ded:loan` (amount, summed) and `ded:loanBalance` (snapshot) in the installer's row `customFields`. | None. Nothing reads #1 or #2; nothing is written back. |

So the DTR advance sits PENDING forever unless someone flips it by hand on the For Cash Advances page, and the
payout deduction is retyped from memory. That is the gap.

## What was wrong with the earlier plan

1. **Linking each DTR row to an HRIS advance by employee id is the wrong join.** A DTR advance is a one-off cash
   hand-out the branch already paid from the till; an HRIS advance is an approved loan with a repayment schedule.
   Forcing every DTR row to create/point at an HRIS loan would invent approvals that never happened and double-count
   the money (the DTR already booked it as an expense).
2. **Settlement belongs in Payouts, keyed by the DTR `report_items.id`.** The recovery is "withhold from this
   installer's pay in week X" — no new cash moves, so it must **not** create an expense/income record anywhere.
3. **`PAID` on the existing page already means "recovered"**, so reuse it; don't add a second boolean. But it needs an
   in-between state, otherwise a deduction that sits in an open week is indistinguishable from money that was never
   taken.
4. **Member name is free text** (`"JUSTINE"` vs `"JUSTIN ROI BIEN"`), and payroll installer names are uppercased
   ticket names. Matching has to be best-effort with a manual "assign to installer" fallback — never silent.

## Target flow

States for a DTR cash advance (stored on `report_items`; PENDING and PAID are what the existing page already shows):

```
PENDING ──(add to payout deduction, open week)──▶ QUEUED ──(that payout week is closed)──▶ PAID
   ▲                                                  │                                      │
   └──────────(remove from deduction / reopen week)───┘◀──────(reopen week = revert)────────┘
```

* **PENDING** — on the DTR, not yet recovered. Shown in Payouts → Deductions → "AC Loan / CA" as a checklist for
  that installer (date, DTR/branch, details, amount).
* **QUEUED** — ticked for the open week. The installer's `ded:loan` = sum of ticked items (+ any manual remainder);
  the item ids ride in `ded:caItems` (JSON list of `{id, amount}`) so the modal can redraw and undo. Item shows
  "Queued · Week 2 (Sep 4 – Sep 10)" on the For Cash Advances page; it is **not** PAID yet and cannot be queued twice.
* **PAID** — set automatically when that payout week is **closed** (the same moment the payout becomes final):
  `collection_resolved = true`, `collection_date_paid = week end`, `collection_notes = "Deducted from payout wk …"`.
  Reopening the week puts them back to QUEUED, and removing the tick puts it back to PENDING.
* **Partial deduction** — allowed: the tick takes an amount ≤ the open balance. `collection_amount_paid` accumulates
  recovered money; the item flips to PAID only when `collection_amount_paid ≥ amount`; the remainder stays PENDING and
  shows as "balance" (this also replaces the typed `ded:loanBalance`).
* HRIS advances (#2) stay a separate, later phase: show them in the same modal as "Approved loan — ₱X/month" rows and
  write a `PAYROLL_DEDUCTION` repayment when the week closes. Out of scope for phase 1.

## Backend work (`ashcol-service-api`)

1. Migration: `report_items` add `payout_state` (`NULL|QUEUED`), `payout_week_from`, `payout_week_to`,
   `payout_installer`, `payout_amount` (the queued amount, so a partial tick is remembered). Reuse the existing
   `collection_*` columns for the PAID side.
2. `GET /v1/reports/cash-advances/pending?branchId&installer=` → unpaid + queued items for an installer, name-matched
   (normalize: strip `ASHCOL`/branch prefix, `normalizeInstallerName` aliases, case-insensitive; return a `matchedBy`
   field so the UI can flag a guess).
3. `POST /v1/reports/cash-advances/{id}/queue` `{weekFrom, weekTo, installer, amount}` and `/unqueue` — idempotent,
   rejects if the week is already closed or the item is already queued elsewhere.
4. **Week close/reopen hook** in `PayrollService` (`closeWeek` / `reopenWeek`): settle or revert every item whose
   `payout_week_from/to` equals the week. Doing this server-side (not from the browser) is what stops it drifting if
   someone closes the week from another device.
5. Closed-week lock: `ded:caItems` / `ded:loan` are plain customFields on a frozen row, so they are already immutable
   after close; no change to the freeze rules needed.

## Frontend work

* `Payouts.tsx` Deductions modal: replace the "AC Loan / CA" amount box with the checklist above (keep a small
  "Other / manual" amount for loans not on a DTR). Per-item state chip PENDING / QUEUED / PAID. Read-only on a closed
  week (shows what was deducted and when).
* `CashAdvances.tsx`: add the QUEUED filter/chip, show "Queued for payout · Week N", and disable the manual Paid
  toggle for queued items (deduction owns that state) — otherwise two screens fight over one flag.
* `DTR_Form.tsx`: turn the free-text **Member** field into a picker over the branch's member accounts (same
  account-based names as the Branches change) and store the employee id alongside the name. Old free-text rows keep
  working via the name matcher.
* Savebar: queue/unqueue go straight to the server (like Hold/Release), not through the debounced table save, so a
  failed write can't leave the modal and the item disagreeing; the modal re-reads item states after each action.

## Risks / things to decide before building

* **Name matching:** ambiguous or unmatched names must land in an "unassigned" bucket for a human to assign, not guess.
* **Two writes, no transaction** (payroll customFields + `report_items`): queue the item first, then save the payroll
  deduction, and run an idempotent reconcile on modal open (items QUEUED for this week but absent from `ded:caItems`
  → show a warning/Fix button).
* **Branch transfers:** an advance given at branch A to someone now paid at branch B — match by employee id first,
  branch second.
* **Over-deduction:** warn when net payout would go negative; allow partial amount instead of blocking.
* **Where it counts on the DTR:** nothing changes there — the cash-out stays an expense on the day it was given.
  Recovery through payroll is not a DTR cash movement.
* Needs a backend deploy + migration before the portal part can ship; the portal alone can only show PENDING items
  and cannot make QUEUED/auto-PAID reliable.
