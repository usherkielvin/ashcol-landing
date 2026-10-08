# Pending receipt vs. "reimbursement not found" (Oct 7 SIR JOEMAR gas allowance ₱2,000)

## What the screenshots show
- Purchase (Oct 7): cash given ₱2,000, receipt photo ₱3,958.42, OR 001-635420.
- Expense Records flags: "Reimbursements not found on the DTR: 1 (₱1,958.42)" with the sub-line
  "Receipt photo is on the purchase, but its record was not found".
- The Oct 8 DTR then shows the amber "Reimbursements due" banner (`DTR_Form.tsx` ~3615) for the same ₱1,958.42.

## Root cause (code-verified)
The purchase row is in a contradictory state: it *counts as receipted* but has *no receipt record behind it*.

- `ReportService.hasReimburseDue` (service-api, ~L2009) only checks `receiptReturned && actualAmount > amount`.
  It never checks that a live `AuditExpense` exists in `resolvedExpenseId`.
- `resolvePurchase` writes `receiptReturned`, `actualAmount`, `receiptNo`, `receiptImage` on the item and the
  `pr-xxxx` record separately. Anything that later removes/loses the record (record deleted in Expense Records,
  DTR re-saved from a stale form that no longer matches in `carryOverPurchaseResolution` ~L298, lost link) leaves
  `receiptReturned=true` + `actualAmount=3958.42` + photo + OR no. intact, but `resolvedExpenseId` empty/dead.
- Only `reopenPurchase` prunes dead links, and only when someone clicks reopen. The list endpoint (~L1944) never does.
- Result: the portal treats the purchase as closed with an excess, so it raises a **reimbursement** remark
  (money owed) instead of **Pending receipt** (record still missing). The UI text even admits the record is missing
  (`ExpenseRecords.tsx` ~5055) but still demands a REIMBURSE row, and the DTR banner offers one on top of it.
- Related: the REIMBURSE row is only matched by worker + exact amount + date >= purchase (`reimbursementStatus`),
  so it resolves once it exists, but nothing resolves the missing-record side.

## Intended behaviour
1. A purchase is "receipted" only for amounts backed by live expense records.
2. No live record -> stays/returns to **Pending receipt** (remaining = cash given); no reimbursement due,
   no DTR banner.
3. When the receipt record is added/relinked -> pending remark clears automatically; if the receipt exceeds the
   cash, only then does the reimbursement remark appear, and it clears when a matching REIMBURSE row is on a DTR.

## Plan
- [x] Backend `ReportService`: add a helper that resolves live linked records (ids that exist in `auditExpenseRepository`).
- [x] Backend list endpoint (~L1944): derive effective `receiptReturned`/`actualAmount`/`remaining`/`receiptStatus`
      from live records; gate `reimburseDue` and `refundDue` on at least one live record. Return `receiptRecordMissing`.
- [ ] (skipped, list endpoint covers it) Backend `carryOverPurchaseResolution`: don't carry `receiptReturned`/`actualAmount` over without a live link.
- [ ] Optional repair: if `receiptNo` matches an existing record (same branch), auto-relink via `linkExpenseToPurchase`.
- [x] Portal `ExpenseRecords.tsx`: bucket `receiptRecordMissing` purchases under Pending receipts, not
      "Reimbursements not found"; keep the reimburse bucket for genuine excess only (~L1795, ~L4933).
- [x] (no change needed: banner is driven by reimburseDue, now 0) Portal `DTR_Form.tsx` (~L838, ~3615): hide the "Reimbursements due" banner for purchases with a missing record.
- [x] Verify (tsc + backend compile; manual check with real data pending): `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` vs baseline, backend build, manual check with the Oct 7 purchase.

## Open question
Whether the ₱3,958.42 record was deleted or never saved can't be told from the code; check `audit_expenses` for
`receipt_no = '001-635420'` and the item's `resolved_expense_id`. The plan fixes either case.
