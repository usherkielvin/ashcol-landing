# Installer weekly payout sheet (print / save as PDF)

Goal: from the Payouts installer list (roster) of a branch, a **"Payout Sheet"** button opens a showcase that looks like
the paper sheet the branch uses today (reference image: *ASHCOL DASMARIÑAS INSTALLER'S WEEKLY PAYROLL & ALLOWANCE*):

```
ASHCOL AIRCONDITIONING CORP
ASHCOL <BRANCH> INSTALLER'S WEEKLY PAYROLL & ALLOWANCE
CUT-OFF DATE: <week from> – <week to>
PAYROLL DATE: <cut-off end + 2 days>
| # | LAST NAME | FIRST NAME | NET LABOR COST | G-CASH / BANK ACCOUNT | SIGNATURE |
| … one row per installer …                                                          |
| TOTAL                       | ₱ sum                                                |
```

Output: on-screen preview + **Print** (browser print dialog, `@page` landscape) + **Save PDF** (real-text PDF, same
approach as `src/utils/payoutPdf.ts`, so it is sharp/searchable and not a screenshot).

## What already exists (reuse, don't rebuild)

- Roster of installers + weekly totals: `Payouts.tsx` (`grouped`, `installerTotal`, `deductionTotal`, `rowTotal`).
- Net per installer = `installerTotal(rows) − deductionTotal(rows)` (what the roster/footer already shows). **Must use the
  same numbers** as the roster so the sheet can never disagree with the screen.
- Payroll date rule already coded in `WeekSummaryModal.tsx` (`payrollDateStr` = week end + 2 days).
- Real-text PDF helper + safe-text rules (`pdfSafe`, ₱ → "PHP "): `src/utils/payoutPdf.ts`.
- Branch weekly summary modal (`WeekSummaryModal`) is the *branch-wide / region* sheet. This new sheet is the
  *per-branch, per-installer* payout slip list — keep them separate.

## Decisions (answered 2026-10-05)

- G-Cash source: **A** (member phone). Rows: installers with a **Complete** payout (same as the closed/completed tech table), optional toggle to include pending. Names from member accounts. Net = roster net. Closed weeks supported (FINAL marker).

## Decisions needed before building (resolved above)

- [ ] **G-Cash / Bank account source.** There is no such field today (employees only have `phone`). Options:
  - A. Use the member's `phone` as the G-Cash number and show "(GCASH ACCOUNT)" — no schema change.
  - B. Add `payout_method` + `payout_account` (+ optional account name) to the member profile (backend migration + Members edit form + API) — correct for bank accounts; the reference sheet mixes G-Cash numbers and "bank account".
  - C. Type it on the sheet per print (not saved) — fastest, but retyped every week.
  **Recommendation: B**, falling back to `phone` as G-Cash when empty. (This is the schema change that makes this a multi-phase job.)
- [ ] **Which installers appear:** everyone with a payout row in the week, or only those with net > 0? Held-only /
  fully-deducted installers (net ≤ 0) → show as ₱0.00 or hide? Recommendation: show all, flag ≤ 0.
- [ ] **Name split:** the sheet uses LAST / FIRST name. Member accounts are the source (full-name based, as on the Branches
  page); ticket-derived names ("JUSTINE") must be mapped to the account first. Unmatched names get listed under the table
  as "needs account" instead of guessing.
- [ ] **Net labor cost definition:** week's own jobs minus deductions (current roster net), *excluding* held tickets and
  *including* released carry-overs / balance releases? Recommendation: same as roster net (carry-overs and adjustments
  count in the week they were released to).
- [ ] **Closed weeks:** sheet available for open and closed weeks; show a "FINAL" marker when closed.

## Phases (one phase per command)

### Phase 1 — Sheet builder + print/PDF (no backend)
- [x] `src/utils/payoutSheetPdf.ts`: real-text landscape A4 PDF (letterhead, cut-off/payroll date, numbered table with
      LAST/FIRST name, net labor cost, account, signature column with blank cells, TOTAL row, page footer).
- [x] `src/components/InstallerPayoutSheet.tsx`: on-screen preview (same table, print CSS with `@page { size: landscape }`),
      buttons **Print** and **Save PDF**.
- [x] `Payouts.tsx` (roster view): "Payout Sheet" button next to Showcase; builds rows from the same data as the roster.
- [x] Account column uses `phone` as G-Cash for now (decision A) with an editable cell on the preview for one-off fixes.

### Phase 2 — Saved payout account on the member (needs backend)
- [ ] Migration: `users` (or member profile) add `payout_method` (GCASH/BANK/CASH), `payout_account`, `payout_account_name`.
- [ ] API: include in member read/update; permissions = same roles that can edit members.
- [ ] Members edit form: payout method + account fields, validation (PH mobile for GCash).
- [ ] Sheet reads the saved account; "No account on file" warning chip per installer.

### Phase 3 — Polish
- [ ] "FINAL" stamp + closed-by/at for closed weeks; optional signature/"Prepared by / Approved by" lines.
- [ ] Remember last edits per week? (only if asked)

## Quality gates (each phase)
- `npx tsc -p tsconfig.app.json --noEmit` clean for touched files; `npm run lint` vs. baseline.
- Manual check with a real branch week: sheet total == roster total, names match accounts, PDF opens with correct peso
  amounts ("PHP …") and no cropped text.
