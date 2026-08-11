# Implementation Tasks

## Task 1: Create schedulePrefill.ts utility module

Create `src/utils/schedulePrefill.ts` with the core functions: `fetchScheduleTickets()`, `filterQualifyingTickets()`, `mapTicketToCashRow()`, `fetchAndMapTickets()`, and `deduplicateAndMerge()`.

### Sub-tasks
- 1.1: Create `src/utils/schedulePrefill.ts` file with CashTxRow, PrefillResult, PrefillError, PrefillOptions type exports
- 1.2: Implement `fetchScheduleTickets()` - fetches tickets from API with auth token and timeout handling
- 1.3: Implement `filterQualifyingTickets()` - filters by DONE_INSTALLED status, CASH payment mode, positive amount
- 1.4: Implement `mapTicketToCashRow()` - maps ticket fields to CashTxRow using cleanInstallerName()
- 1.5: Implement `fetchAndMapTickets()` - orchestrator that combines fetch, filter, and map; returns PrefillResult
- 1.6: Implement `deduplicateAndMerge()` - merges incoming rows with existing, skipping duplicates by customer+amount

### Requirements
- Requirement 1: Fetch Schedule Tickets for Prefill
- Requirement 2: Filter Tickets by Status and Payment Mode
- Requirement 3: Map Ticket Data to Cash Transaction Rows
- Requirement 7: Duplicate Prevention

## Task 2: Integrate auto-prefill into DailySalesForm on load

Add a useEffect in DailySalesForm.tsx that auto-prefills Cash Transactions from schedule data when no saved report exists for the selected date.

### Sub-tasks
- 2.1: Import `fetchAndMapTickets` from schedulePrefill.ts
- 2.2: Add useEffect that triggers when dateKey/branchId change and no saved report is loaded
- 2.3: Call fetchAndMapTickets with AbortController for 30s timeout
- 2.4: On success with rows, call setCashTx(rows) to prefill the Cash Transactions section
- 2.5: On error, show error toast notification and leave section unchanged

### Requirements
- Requirement 1: Fetch Schedule Tickets for Prefill
- Requirement 6: Prefill Trigger Mechanism

### Dependencies
- Task 1

## Task 3: Add "Sync from Schedule" button and manual sync handler

Add a "Sync from Schedule" button in the Cash Transactions section header that triggers manual prefill with duplicate detection and merge.

### Sub-tasks
- 3.1: Add `syncLoading` state variable
- 3.2: Implement `handleSyncFromSchedule()` handler that calls fetchAndMapTickets then deduplicateAndMerge
- 3.3: Add "Sync from Schedule" button JSX in Cash Transactions section header with loading indicator
- 3.4: Show appropriate toast messages for empty results, errors, and successful sync
- 3.5: Disable button while syncing to prevent duplicate requests

### Requirements
- Requirement 6: Prefill Trigger Mechanism
- Requirement 7: Duplicate Prevention

### Dependencies
- Task 1

## Task 4: Verify build and local testing

Run TypeScript compilation and Vite dev server to ensure no build errors and the feature works end-to-end locally.

### Sub-tasks
- 4.1: Run `npx tsc --noEmit` to verify no TypeScript errors
- 4.2: Start Vite dev server and confirm no runtime errors in console
- 4.3: Verify the DailySalesForm page loads without crashes

### Dependencies
- Task 2
- Task 3
