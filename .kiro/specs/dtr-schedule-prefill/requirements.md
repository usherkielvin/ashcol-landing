# Requirements Document

## Introduction

This feature enables automatic prefilling of the Cash Transactions section in the Daily Sales/DTR form (DailySalesForm.tsx) using completed schedule ticket data from the previous day. When a user opens the DTR form for a given report date, the system fetches all tickets from the Schedules table for that date that have a "DONE_INSTALLED" or "INSTALLED" status and a "CASH" payment mode, and populates them as Cash Transaction rows. This eliminates manual re-entry of data already captured in the scheduling system.

## Glossary

- **DTR_Form**: The Daily Sales/DTR form component (DailySalesForm.tsx) used to record daily cash and online transactions, expenses, and summaries for a branch.
- **Cash_Transactions_Section**: The table within the DTR_Form that holds rows of cash-paid customer transactions with columns: Customer Name, Installer, and Amount.
- **Schedule_Ticket**: A ticket record from the scheduling system representing a service job (installation, survey, cleaning, etc.) with customer details, technician assignment, payment info, and status.
- **Schedule_Status**: The resolved status of a Schedule_Ticket determined by `getScheduleStatusValue()`, representing the current workflow state (e.g., DONE_INSTALLED, DONE_CLEANING, RESCHED).
- **Payment_Mode**: The payment method associated with a Schedule_Ticket, resolved by `resolveTicketPayment()` (e.g., CASH, ONLINE, FREE INSTALL, NO PAYMENT).
- **Payment_Amount**: The monetary value charged for a ticket, resolved from installationCharges or amountCharged via `resolveTicketPaymentAmount()`.
- **Prefill_Service**: The module responsible for fetching qualifying Schedule_Tickets and transforming them into CashTxRow entries for the DTR_Form.
- **Report_Date**: The date selected in the DTR_Form representing the business day being reported on.
- **CashTxRow**: The data structure for a single row in the Cash_Transactions_Section: `{ id, customer, installer, amount }`.

## Requirements

### Requirement 1: Fetch Schedule Tickets for Prefill

**User Story:** As a branch staff member, I want the DTR form to automatically retrieve completed schedule tickets for the report date, so that I do not have to manually look up yesterday's installed tickets.

#### Acceptance Criteria

1. WHEN the DTR_Form loads for a given Report_Date, THE Prefill_Service SHALL fetch all Schedule_Tickets for the **previous day** (Report_Date minus 1 day) from the branch-scoped tickets API endpoint within 30 seconds.
2. THE Prefill_Service SHALL include only Schedule_Tickets belonging to the currently selected branch (matching branchId).
3. THE Prefill_Service SHALL use the authenticated user's token from localStorage or sessionStorage when calling the tickets API.
4. IF the tickets API request fails due to a network error, a non-2xx HTTP response, or a timeout exceeding 30 seconds, THEN THE Prefill_Service SHALL display an error notification indicating the fetch failed and leave the Cash_Transactions_Section unchanged.
5. IF no qualifying Schedule_Tickets exist for the Report_Date, THEN THE DTR_Form SHALL display the Cash_Transactions_Section with a single empty row (default behavior).
6. IF the authenticated user's token is missing from both localStorage and sessionStorage, THEN THE Prefill_Service SHALL not attempt the API request and SHALL display an error notification indicating the user must re-authenticate.

### Requirement 2: Filter Tickets by Status and Payment Mode

**User Story:** As a branch staff member, I want only completed cash-paid installations to appear in the Cash Transactions prefill, so that the DTR accurately reflects collectible cash revenue.

#### Acceptance Criteria

1. THE Prefill_Service SHALL include only Schedule_Tickets where the Schedule_Status resolved by `getScheduleStatusValue()` equals "DONE_INSTALLED".
2. THE Prefill_Service SHALL include only Schedule_Tickets where the Payment_Mode resolved by `resolveTicketPayment()` equals "CASH".
3. THE Prefill_Service SHALL exclude Schedule_Tickets where the Payment_Amount returned by `resolveTicketPayment().amount` is zero, NaN, or undefined.
4. THE Prefill_Service SHALL exclude Schedule_Tickets where the Payment_Mode is "FREE INSTALL", "FREE", "NO PAYMENT", or "ONLINE".
5. THE Prefill_Service SHALL evaluate criteria in the following order: status check (criterion 1), then payment mode check (criteria 2 and 4), then amount check (criterion 3), short-circuiting on the first failing condition.

### Requirement 3: Map Ticket Data to Cash Transaction Rows

**User Story:** As a branch staff member, I want each qualifying ticket to automatically populate the correct fields in a Cash Transaction row, so that customer, installer, and amount data are accurate without manual entry.

#### Acceptance Criteria

1. WHEN a qualifying Schedule_Ticket is mapped to a CashTxRow, THE Prefill_Service SHALL set the `customer` field to the ticket's customerName (or customer_name), trimmed of leading and trailing whitespace, or to an empty string if neither field is present.
2. WHEN a qualifying Schedule_Ticket is mapped to a CashTxRow, THE Prefill_Service SHALL set the `installer` field by passing the ticket's assignedEmployeeName (or installerName or assigned_employee_name) and the current branch name through the `cleanInstallerName()` function, resulting in an empty string if the source field is absent or the name equals the branch name after normalization.
3. WHEN a qualifying Schedule_Ticket is mapped to a CashTxRow, THE Prefill_Service SHALL set the `amount` field to the result of `String(amount)` where `amount` is the numeric value returned by `resolveTicketPayment().amount` (e.g., 1500 becomes "1500").
4. THE Prefill_Service SHALL generate a unique `id` for each CashTxRow by calling the existing `uid()` helper, producing a non-empty string identifier.
5. IF the ticket's customerName (or customer_name) is undefined, null, or empty after trimming, THEN THE Prefill_Service SHALL set the `customer` field to an empty string and still produce the CashTxRow.

### Requirement 4: Auto-Calculate Total from Prefilled Rows

**User Story:** As a branch staff member, I want the total cash collection to automatically sum up from all prefilled rows, so that I can immediately see the day's cash total without manual calculation.

#### Acceptance Criteria

1. WHEN prefilled CashTxRows are inserted into the Cash_Transactions_Section, THE DTR_Form SHALL recalculate the total cash collection as the sum of all CashTxRow amount values, treating empty or non-numeric amount values as zero, and displaying the total formatted to exactly 2 decimal places.
2. WHEN a user edits, adds, or deletes a CashTxRow after prefill, THE DTR_Form SHALL recalculate the total cash collection to reflect the current rows, with recalculation triggered on field blur for edits and immediately on add/delete actions.
3. IF all CashTxRows are deleted or all amount fields are empty or non-numeric, THEN THE DTR_Form SHALL display the total as ₱0.00.

### Requirement 5: User Can Modify Prefilled Rows

**User Story:** As a branch staff member, I want to edit, add, or delete prefilled Cash Transaction rows, so that I can correct errors or add walk-in cash payments not captured in the schedule.

#### Acceptance Criteria

1. WHEN prefill completes, THE DTR_Form SHALL allow the user to edit the customer, installer, and amount fields of any prefilled CashTxRow inline within the Cash_Transactions_Section.
2. WHEN the user edits the amount field of a CashTxRow, THE DTR_Form SHALL accept only numeric values in the range 0.01 to 999,999,999.99 with up to two decimal places.
3. WHEN the user edits the customer or installer field of a CashTxRow, THE DTR_Form SHALL accept text input up to 150 characters in length.
4. WHEN prefill completes, THE DTR_Form SHALL allow the user to delete any prefilled CashTxRow using the existing row delete control.
5. IF the user deletes the last remaining CashTxRow, THEN THE DTR_Form SHALL insert a single empty CashTxRow so the Cash_Transactions_Section always contains at least one row.
6. WHEN prefill completes, THE DTR_Form SHALL allow the user to add new empty CashTxRows using the existing "Add row" button, up to a maximum of 100 total rows in the Cash_Transactions_Section.

### Requirement 6: Prefill Trigger Mechanism

**User Story:** As a branch staff member, I want the prefill to happen automatically when the form loads for a new date, so that I do not need to remember to sync data manually.

#### Acceptance Criteria

1. WHEN the DTR_Form loads for a Report_Date that has no previously saved DTR report, THE Prefill_Service SHALL automatically fetch and prefill qualifying Schedule_Tickets into the Cash_Transactions_Section.
2. WHEN the DTR_Form loads for a Report_Date that has a previously saved DTR report, THE DTR_Form SHALL load the saved report data and SHALL NOT trigger automatic prefill (preserving user edits).
3. THE DTR_Form SHALL provide a "Sync from Schedule" button that allows the user to manually trigger the Prefill_Service regardless of whether a saved report exists.
4. WHEN the user clicks the "Sync from Schedule" button, THE DTR_Form SHALL merge prefilled rows with any existing non-empty CashTxRows (where a non-empty row has at least one of customer, installer, or amount populated) by appending new rows below existing rows without overwriting user-entered data.
5. WHILE the Prefill_Service is fetching data, THE DTR_Form SHALL display a loading indicator on the "Sync from Schedule" button and disable the button to prevent duplicate requests.
6. IF the Prefill_Service fetch fails during a manual sync triggered by the "Sync from Schedule" button, THEN THE DTR_Form SHALL display an error notification and preserve all existing CashTxRows unchanged.

### Requirement 7: Duplicate Prevention

**User Story:** As a branch staff member, I want the prefill to avoid inserting duplicate entries when syncing, so that the Cash Transactions section remains accurate.

#### Acceptance Criteria

1. WHEN the "Sync from Schedule" button is clicked, THE Prefill_Service SHALL compare each incoming qualifying ticket against existing CashTxRows by matching the customer name (case-insensitive, leading and trailing whitespace trimmed) and the amount (compared numerically, e.g., "100" equals "100.00").
2. IF a qualifying Schedule_Ticket matches an existing CashTxRow on both customer name (case-insensitive, trimmed) and numeric amount, THEN THE Prefill_Service SHALL skip that ticket and not insert a duplicate row.
3. IF multiple qualifying Schedule_Tickets share the same customer name and amount, THEN THE Prefill_Service SHALL skip only as many tickets as there are existing CashTxRows with that same customer name and amount, and SHALL insert the remaining unmatched tickets as new rows.
4. WHEN automatic prefill runs on form load (no saved report), THE Prefill_Service SHALL insert all qualifying tickets without duplicate checking since no prior rows exist.
