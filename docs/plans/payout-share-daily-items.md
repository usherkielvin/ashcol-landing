# Payout Share Page — Daily Items (Allowance, Driving) Moved to the Summary

Goal: on the public payout link (`/payout/<token>`), stop showing **Allowance** and **Driving** inside each ticket
(popup breakdown, per-ticket total, table/cards) and show them once, **below, in the summary** as day-based lines:

```
Allowance   5 days × ₱100        ₱500.00
Driving     5 days × ₱500        ₱2,500.00
```

The inputs stay exactly where payroll types them (the Payouts table). Nothing is changed in saved data, in the
portal tables, or in what the installer is paid — this is a **presentation change on the shared page**.

Status: **All phases built** (the one check not done: comparing a real installer-week against the portal — do it on the first real payout) (helper in `payrollDerive.ts`, not shown anywhere yet). Decision 1 answered: the ₱100 allowance and the custom driving column. Decisions 2–5 use the proposals below.

---

## 1. What exists today

| Piece | Where | Today |
|---|---|---|
| Allowance | `payrollDerive.ts` `applyDailyAllowance` | Stamped **once per installer per day**, onto that day's first ticket only (`dailyAllowance`). So "5 working days" = 5 tickets carry ₱100, the other tickets that day carry nothing. |
| Driving | custom column "Driving 500 Day" (`customFields["custom_DRIVING_500_DAY"]`) | Typed by payroll per ticket; ₱500 on the day's driven ticket(s). Not a fixed field, so it is found by its label/key. |
| Ticket total | `rowTotal()` (`payrollDerive.ts`) | Adds every fee column **including** allowance and custom columns, scaled by `payFactor` (50% while unpaid). This is the per-ticket number in the popup, the cards and the table's Total column. |
| Pay breakdown popup | `PayoutShare.tsx` `payItems()` + `JobDetails` | Lists every non-zero money column for that ticket — this is where "Allowance ₱100" and "Driving 500 Day ₱500" appear in the screenshot. |
| Summary | `PayoutShare.tsx` `Summary` | Gross payout, previous payout, deductions, net. Gross = `installerTotal(counted)`. |

Net payout does not change, because gross already includes these amounts; they just sit on tickets today.

---

## 2. Target behaviour

- **Popup (`JobDetails`) and cards/table:** Allowance and Driving are *not listed* and *not included* in the
  ticket's total. Ticket total = that job's own fees (install fee, cleaning, add-ons…).
- **Summary:** a new "Daily pay" block above Gross, one line per day-based item:
  `<label> · <N> days × ₱<rate> = ₱<amount>`; when the rate differs between days: `<N> days = ₱<amount>`.
- **Gross payout** = tickets total + daily pay, so Gross, deductions and Net are **identical to today**.
- Example from the screenshot ticket: `₱100 + ₱700 + ₱500 + ₱1 (bug)` → the ticket now shows ₱700 (the ₱1 flag was
  already fixed); the ₱600 of allowance + driving moves to the summary.

How "N days" is counted: distinct `workDate`s that carry a non-zero amount for that item (so two driven tickets
on one day count as one day only if the amount is entered once; see decision 3).

---

## 3. Design

All in one file plus one small helper — no backend, no schema change.

1. **`payrollDerive.ts`** — `DAILY_ITEM_MATCHERS` + `dailyItems(rows)`: returns `{ key, label, days, rate | null, amount }[]`
   for the day-based items, using `amount = Σ value × payFactor(row)` so a 50%-paid ticket still counts 50%.
   A row-level `ticketTotal(row)` = `rowTotal(row)` minus its day-based items (same scaling).
2. **`PayoutShare.tsx`**
   - `payItems()` skips day-based items; `JobDetails` and `JobCards` use `ticketTotal` instead of `rowTotal`.
   - `buildColumns()` drops the Allowance column and day-based custom columns; the table's Total uses `ticketTotal`.
   - `Summary` renders the "Daily pay" block and Gross = Σ `ticketTotal` + Σ daily items (assert equals today's `installerTotal`).
3. **Not changed:** Payouts page tables and Net column, the saved data, the payout email, `PayoutShareService`.

Risks / notes
- The shared page's per-ticket totals will no longer match the portal's per-row "Net" column (which includes
  allowance/driving). The summary lines explain the difference; the portal column keeps the full amount.
- A held or carry-over row keeps its allowance/driving on the ticket (see decision 4) so no peso is dropped.

---

## 4. Phases

- [x] **Phase 1 — Helper + tests-by-hand:** `dailyItems` / `ticketTotal` in `payrollDerive.ts`; check
      `Σ ticketTotal + Σ daily = installerTotal` for a sample week (no UI yet).
- [x] **Phase 2 — Shared page:** ticket popup, cards, table and Summary in `PayoutShare.tsx`; browser check at
      phone width and laptop width with a mock payload (allowance, driving, a 50%-paid ticket, a carry-over).
- [x] **Phase 3 — Wrap-up:** confirm Gross/Net unchanged against the portal for one real installer-week; commit.

---

## 5. Decisions needed before building

1. **Which items are "daily"?** Proposed: **Allowance** (`dailyAllowance`) and any custom column whose label
   contains **"driving"**. Alternative: a tick-box per custom column in Manage Columns ("counts per day") — more
   work (touches the column manager + saved column settings), but no label guessing.
2. **Summary wording.** Proposed `Driving · 5 days × ₱500 = ₱2,500`. Prefer `Drive 5 days = ₱2,500`, or show only
   the total?
3. **Counting days.** Proposed: distinct work dates with a non-zero amount. If payroll sometimes types the ₱500 on
   two tickets in one day, that day would be paid twice — confirm that never happens, or count amounts instead.
4. **Held and carry-over tickets.** Proposed: leave their allowance/driving on the ticket (they are not "days
   worked" this week). Alternative: strip them too.
5. **Other places.** Apply the same split to the **payout email** summary and the **Finalize popup**, or only the
   shared page for now? (Proposed: shared page only.)

**Note for phase 2:** a 50%-paid day makes `amount` differ from `days × rate` (e.g. 5 days × ₱100 = ₱450 when one day is half-paid). The summary line must show the real amount, not days × rate, and flag the part-paid day.
