# DTR Commission Expenses — Receipt, Paid-by (COH / Online), Net Sales, Branch Expense Record

Goal: on the DTR form's **Commission Expenses** table, a commission is only **Paid** when it has a **receipt** and a
**Paid by** (Cash on Hand or Online). Until then it is **Pending**. When paid:

1. it **reduces Net Sales** (Gross Sales is **not** touched),
2. if paid in **cash (COH)** it also **reduces Cash on Hand**,
3. it is **added to the branch's Expense Records** (category **INCENTIVES**) with the receipt image, the full details
   and the **diser's name**.

Status: **Phase 1 (backend) built, not yet committed or deployed.** All decisions answered (section 6). Phases 2–4 not started.

---

## 1. What exists today

| Piece | Where | Today |
|---|---|---|
| Commission rows | `DTR_Form.tsx` (`CommissionRow`: ticket, store, **diser**, customer, brand, hp, date installed, amount) | Plain table, prefilled from schedules. **No receipt, no payment method.** |
| Saved as | report item `type: COMMISSION`, `description: "COMMISSION\|diser\|brand\|hp"` (`DTR_Form.tsx` ~2447) | `ReportItem` already has `receiptImage`, `receiptNo`, `receiptDate`, `resolvedExpenseId`, `collectionResolved*`, `collectionAmountPaid` columns. |
| "Paid" | `ReportService.java` ~153 `autoPaidCommission` | **Every commission with an amount is auto-marked paid on submit.** Nothing is verified. |
| **Net Sales** | `DailyAuditReport.tsx` `computeNetSales`; `ReportService.sumPaidCommissionExpenses` | **Already** `Gross − Expenses − Payables − Purchases − paid Commissions` (paid = `collectionResolved`). So paid commissions already reduce Net Sales; Gross is untouched. |
| Cash on Hand | `ReportService.java` ~265 `totalCohCfd` | `prev COH + fund from HO + cash returns + cash − expenses − purchases …`. Commissions are **not** in it. |
| Receipt flow for expenses | `ReceiptScanDialog.tsx` → `DTR_Form.tsx` → `upsertAuditExpense` | Scan/upload a receipt, fills company, receipt no., amount, category, source of funds; writes an **Expense Record** with a stable id (`dtr-<branch>-<date>-exp-<row>`) so re-saves update instead of duplicating. |
| Expense Records | `ExpenseRecords.tsx` (`audit_expenses`) | Per-branch list with receipt image, category (**INCENTIVES** already exists), incurred-by, source of funds. |
| Commissions page | `Commissions.tsx` | Lists commissions; **Mark as Paid** modal (amount, date, who paid) for unpaid rows. |

Receipt, expense-record and "paid" plumbing exist end to end; commissions just don't use it.

---

## 2. Target behaviour

On a commission row (DTR form), anyone who can submit the DTR can:

- tap **Receipt** (same dialog as Expenses): scan/upload, receipt no., date, amount, company;
- choose **Paid by**: **COH** (cash on hand) or **Online** (generic: any non-cash payment).

Saving the DTR:

| Row has | Result |
|---|---|
| Receipt + Paid by | **PAID** (by the submitter, dated the receipt date, amount = receipt amount). Net Sales −= amount. **COH:** Cash on Hand −= amount. **Online:** no cash change. Expense Record created. |
| No receipt, or no Paid by | **PENDING.** No Net Sales or Cash on Hand effect, no Expense Record. Can be completed later by editing the DTR or from the Commissions page. |

Expense Record per paid commission: category **INCENTIVES**; description
`Commission · <DISER> · <ticket no.> · <customer> · <store> · <brand> <hp>`; `incurredBy` = **diser**; receipt image;
source of funds **CASH** (COH) or **ONLINE**; date = receipt date. Removing the row or its receipt/paid-by removes the
record and sets the commission back to Pending.

**Behaviour change to announce:** today every commission with an amount is paid automatically, so it already lowers
Net Sales. After this, commissions **without a receipt stop reducing Net Sales** until a receipt is attached.

Commissions page: shows Status, Paid by, receipt link/thumbnail and the linked expense; **Mark as Paid** now requires
a receipt and Paid by.

---

## 3. Design

### 3.1 Data (`ashcol-service-api`)
- New column **`report_items.paid_via VARCHAR(10)`** (`COH` / `ONLINE`): migration `V160` **and** a manual Supabase
  script in `scripts/postgres/` (prod runs Flyway off with `ddl-auto=validate`; the backend will not start without
  it — apply it **before** deploying).
- `ReportItem`, request/response DTOs carry `paidVia`. `AuditExpense` is unchanged (`INCENTIVES` category exists;
  add `ONLINE` to the source-of-funds suggestions).

### 3.2 Backend (`ReportService`)
- `autoPaidCommission` is removed: a commission is `collectionResolved` only when it has `receiptImage` **and**
  `paid_via` (and a positive amount). Resolved-by / date / amount-paid come from the submitter and receipt.
- `paidCommissionExpenses` (already summed from resolved items) keeps feeding Net Sales — no formula change.
- **Cash on Hand:** subtract the **COH-paid** commissions in `totalCohCfd` (create ~265 and the recalculation ~615).
  They must **not** go into `totalExpenses`, or Net Sales would subtract them twice (once as an expense, once as a
  paid commission).
- Tests: Net Sales / COH for COH-paid, Online-paid and pending commissions; edit/re-save does not double-count;
  clearing a receipt returns the row to pending.

### 3.3 Portal
- `DTR_Form.tsx`: extend `CommissionRow` (`receiptImage`, `receiptNo`, `receiptDate`, `paidVia`, `resolvedExpenseId`);
  Receipt + Paid-by cells and a Pending/Paid badge; reuse `ReceiptScanDialog` (incurred-by = diser, category
  INCENTIVES). On submit: stable id `dtr-<branch>-<date>-comm-<row>`, `upsertAuditExpense` for paid rows,
  `deleteAuditExpense` for removed / unpaid ones (copy the expense-row logic ~2312 and ~2566).
- Form totals: Cash on Hand preview subtracts COH-paid commissions the same way the server does.
- `Commissions.tsx`: Status / Paid by / receipt columns; Mark-as-Paid modal asks for receipt + Paid by (anyone who
  could mark paid before still can).
- `DailyAuditReport.tsx`: no formula change; check the commission columns and exports still make sense.

### 3.4 Risks
- Net Sales for **existing** reports must not move: backfill is not needed because old commissions are already
  `collectionResolved = true`; only *new* submissions follow the receipt rule. Confirm re-saving an old report
  (edit) does **not** un-pay its commissions — preserve existing resolved items unless the row is edited.
- COH vs Net Sales double count (see 3.2).
- DTR edits re-save items: stable expense ids prevent duplicate Expense Records.
- Prod schema must be applied manually before the backend deploy (the same trap hit with V158/V159).

---

## 3.5 Phase 1 as built (differs slightly from 3.2)

- Column `report_items.paid_via` holds `COH`, `ONLINE`, `PENDING` (saved under the new rule, no receipt yet) or
  **NULL = legacy row**. Migration `V162`; manual prod script `scripts/postgres/add_report_items_paid_via.sql`.
- **Paid rule (server):** a commission is paid when it has an amount, a receipt image **and** `paidVia` COH/ONLINE; or
  when the client sends `collectionResolved = true` (this is how an **old** report re-saved from the form keeps its
  paid commissions — the form must keep sending that flag for loaded legacy rows; the current form sends it for
  every commission with an amount, so behaviour is unchanged until phase 2).
- Unpaid commissions are stored `PENDING`; the Commissions list shows rows with `paid_via = NULL` and an amount as
  PAID exactly as before, and `PENDING` rows as pending.
- **COH:** paid-by-COH commissions are subtracted in `totalCohCfd` and `totalCashForOffice` (create **and** the
  audit-save recalculation) — **not** in `totalExpenses`, so Net Sales is not reduced twice.
- Item responses (DTR load + Commissions list) now include `receiptImage`, `receiptNo`, `receiptDate`,
  `resolvedExpenseId`, `paidVia`.
- Tests: `ReportServiceTest` — COH, Online, receipt without paid-by, paid-by without receipt, legacy flagged row.
  Not covered by a test: the audit-save recalculation path (same helper, checked by reading the code only).

---

## 4. Phases

- [x] **Phase 1 — Backend:** `paid_via` column (migration + `scripts/postgres` SQL), DTOs, `ReportService` paid rule
      + COH deduction (create + recalculate), tests.
- [ ] **Phase 2 — DTR form:** Receipt + Paid-by + Pending/Paid on commission rows, COH preview, submit pushes /
      removes the Expense Record (INCENTIVES, diser as incurred-by, full details).
- [ ] **Phase 3 — Commissions page + Expense Records:** columns, Mark-as-Paid with receipt, category/filter check,
      docs (`ASHCOL_SYSTEM_SCOPE.md` DTR section).
- [ ] **Phase 4 — Check on real data:** one branch day: Net Sales, COH, expense record and receipt agree; edit and
      delete a commission row; an old report is unchanged.

---

## 5. Out of scope
- Moving money (the portal records payment; it does not pay anyone).
- Bulk-importing old receipts; changing how commission amounts are derived from tickets.
- Mobile app.

---

## 6. Decisions (answered)

1. **Effect:** reduces **Net Sales**, not Gross. Paid in **COH** also reduces Cash on Hand.
2. **No receipt:** commission stays **Pending**; a receipt (with Paid by) is required to mark it paid.
3. **Paid by:** **COH** or **Online**; Online is generic for any non-cash payment.
4. **Expense category:** **INCENTIVES**.
5. **Schema:** new DB column `paid_via`.
6. **Expense Record details:** all — diser, ticket no., customer, store, brand / HP, receipt.
7. **Who:** anyone who submits the DTR.
