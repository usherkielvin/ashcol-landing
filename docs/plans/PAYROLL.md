# Payroll & Expense System Issue Resolution Plan

## Overview
This document outlines outstanding payroll discrepancies, deductions, pending accounts, and expense logging bugs that need to be resolved and updated in the system records.

---

## 1. Expense System Bug (Oct 7 Pending Purchase)
- **Status:** Open / Needs Code & Data Fix
- **Issue:** A pending purchase transaction on October 7 for the amount of ₱2,000 is incorrectly classified as a disbursement in the remarks field[cite: 1].
- **Expected Behavior:** 
  - Expense records must flag this entry as a **Pending Receipt** rather than a completed disbursement[cite: 1].
  - The status must remain "Pending Receipt" until valid receipt documentation is verified[cite: 1].
- **Action Items:**
  - [ ] Update the October 7 entry (Amount: ₱2,000) from disbursement to pending receipt[cite: 1].
  - [ ] Check transaction classification logic to ensure unverified purchases default to pending receipts instead of disbursements[cite: 1].

---

## 2. Next Cutoff Payroll Deductions (Grounding Overpayment)
- **Status:** Pending Next Cutoff Adjustment
- **Issue:** Grounding fees for 7 units were erroneously disbursed in the current payroll cutoff[cite: 2].
- **Resolution Rule:** Grounding is customer-shouldered (c/o customer) and must not be paid out as company expense[cite: 2].
- **Action Items:**
  - [ ] Calculate the total payout equivalent for the 7 grounding units[cite: 2].
  - [ ] Apply a deduction for this total amount against the technicians' next payroll cutoff[cite: 2].

---

## 3. Discrepancies & Individual Adjustments
- **Status:** Pending Ledger Adjustment
- **Items:**
  - **Glyza Cruz (Dismantle):** ₱1,000 under Sir Mariano, less ₱500 diser, resulting in a net adjustment of -₱250[cite: 2].
  - **Mikko Librado (Power Supply):** Unpaid deduction of -₱100[cite: 2].
- **Action Items:**
  - [ ] Apply net deductions totaling -₱350 to the respective employee accounts[cite: 2].
  - [ ] Verify ledger balancing for Sir Mariano’s associated accounts[cite: 2].

---

## 4. Pending Items from Previous Payroll (Sir Mariano)
- **Status:** Reconciliation Required
- **Pending Records:**
  1. **Raquel Baynosa:** Hauling fee unpaid / uncollected[cite: 2].
  2. **Juliet Rondola:** Cleaning service reconciliation[cite: 2].
  3. **Teodora San Jose:** Parts replacement reconciliation[cite: 2].
  4. **Mikko Librado / Glyza Cruz:** Outstanding shortage balance of ₱350[cite: 2].
- **Action Items:**
  - [ ] Audit previous payroll sheets for the listed client jobs[cite: 2].
  - [ ] Confirm payment receipts for hauling, cleaning, and parts replacement before clearing items[cite: 2].
  - [ ] Settle the ₱350 balance across Mikko Librado and Glyza Cruz[cite: 2].