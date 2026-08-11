# Design Document: DTR Schedule Prefill

## Overview

A client-side prefill service that fetches completed CASH schedule tickets from the existing branch tickets API and maps them into `CashTxRow` entries for the Daily Sales form. Integrates as an auto-prefill on fresh report loads and a manual "Sync from Schedule" button for existing reports, with duplicate detection on manual sync.

## Architecture

Client-side only feature. No backend changes. A new utility module `src/utils/schedulePrefill.ts` provides fetch/filter/map/merge logic. `DailySalesForm.tsx` integrates it via a useEffect (auto-prefill) and a button handler (manual sync).

```
┌─────────────────────────────┐
│     DailySalesForm.tsx      │
│  (auto-prefill + sync btn)  │
└──────────────┬──────────────┘
               │ imports
┌──────────────▼──────────────┐
│   utils/schedulePrefill.ts  │
│  fetchAndMapTickets()       │
│  filterQualifyingTickets()  │
│  mapTicketToCashRow()       │
│  deduplicateAndMerge()      │
└──────────────┬──────────────┘
               │ imports
┌──────────────▼──────────────┐
│   utils/ticketHelpers.ts    │
│  getScheduleStatusValue()   │
│  resolveTicketPayment()     │
│  cleanInstallerName()       │
└─────────────────────────────┘
```

## Components and Interfaces

### New Module: `src/utils/schedulePrefill.ts`

```typescript
import type { Ticket } from './ticketHelpers'

export interface CashTxRow {
  id: string
  customer: string
  installer: string
  amount: string
}

export type PrefillResult =
  | { ok: true; rows: CashTxRow[] }
  | { ok: false; error: PrefillError }

export type PrefillError = 'auth_missing' | 'network_error' | 'http_error' | 'timeout'

export interface PrefillOptions {
  branchId: string
  dateKey: string       // "YYYY-MM-DD"
  branchName: string    // for cleanInstallerName
  signal?: AbortSignal
}

export async function fetchAndMapTickets(options: PrefillOptions): Promise<PrefillResult>
export function filterQualifyingTickets(tickets: Ticket[]): Ticket[]
export function mapTicketToCashRow(ticket: Ticket, branchName: string): CashTxRow
export function deduplicateAndMerge(existing: CashTxRow[], incoming: CashTxRow[]): CashTxRow[]
```

### Modified Component: `DailySalesForm.tsx`

- New state: `syncLoading: boolean`
- New useEffect for auto-prefill when `!hasSavedReport && branchId && dateKey`
- New handler: `handleSyncFromSchedule()`
- New JSX: "Sync from Schedule" button in Cash Transactions section header

## Data Models

### CashTxRow (existing, unchanged)

```typescript
interface CashTxRow {
  id: string       // unique row ID from uid()
  customer: string // customer display name
  installer: string // installer first name (cleaned)
  amount: string   // numeric string e.g. "1500"
}
```

### Ticket fields used (existing, read-only)

| Field | Usage |
|-------|-------|
| `customerName` / `customer_name` | Maps to CashTxRow.customer |
| `assignedEmployeeName` / `installerName` / `assigned_employee_name` | Maps to CashTxRow.installer via cleanInstallerName() |
| `status`, `acDetails` | Used by getScheduleStatusValue() for DONE_INSTALLED check |
| `installationCharges`, `amountCharged`, `modeOfPayment` | Used by resolveTicketPayment() for CASH + amount |

## Key Functions with Formal Specifications

### Function 0: getPreviousDayKey()

```typescript
function getPreviousDayKey(reportDateKey: string): string
```

**Purpose:** The DTR report date represents the day being reported ON, but the schedule tickets to prefill are from the **previous day**. E.g., Report Date = July 13 → fetch schedule tickets from July 12.

**Postconditions:**
- Given "2026-07-13" returns "2026-07-12"
- Given "2026-07-01" returns "2026-06-30" (handles month boundaries)
- Given "2026-01-01" returns "2025-12-31" (handles year boundaries)

### Function 1: fetchScheduleTickets()

```typescript
async function fetchScheduleTickets(
  branchId: string,
  scheduleDateKey: string,  // the PREVIOUS day, NOT the report date
  signal?: AbortSignal,
): Promise<Ticket[]>
```

**Preconditions:**
- `branchId` is a non-empty string
- `scheduleDateKey` is "YYYY-MM-DD" format — this is reportDate MINUS 1 day
- Token exists in localStorage or sessionStorage as `"ashcol-token"`

**Postconditions:**
- Returns Ticket[] from `${API_BASE_URL}/tickets/branch?branchId=${branchId}&date=${scheduleDateKey}`
- Throws typed error if token missing, network fails, non-2xx response, or timeout

### Function 2: filterQualifyingTickets()

```typescript
function filterQualifyingTickets(tickets: Ticket[]): Ticket[]
```

**Preconditions:** `tickets` is valid array

**Postconditions:**
- Returns only tickets where ALL: status=DONE_INSTALLED, mode=CASH, amount>0
- Short-circuits: status → mode → amount
- No mutations

### Function 3: mapTicketToCashRow()

```typescript
function mapTicketToCashRow(ticket: Ticket, branchName: string): CashTxRow
```

**Postconditions:**
- `row.id` = unique string from uid()
- `row.customer` = trimmed customerName
- `row.installer` = cleanInstallerName(installerName, branchName)
- `row.amount` = String(resolveTicketPayment(ticket).amount)

### Function 4: fetchAndMapTickets()

```typescript
async function fetchAndMapTickets(options: PrefillOptions): Promise<PrefillResult>
```

**Key behavior:** Internally calls `getPreviousDayKey(options.dateKey)` to compute the schedule date. Report Date = July 13 means we fetch July 12's schedule tickets.

**Postconditions:**
- On success: `{ ok: true, rows: CashTxRow[] }`
- On failure: `{ ok: false, error: PrefillError }` — never throws

### Function 5: deduplicateAndMerge()

```typescript
function deduplicateAndMerge(existing: CashTxRow[], incoming: CashTxRow[]): CashTxRow[]
```

**Postconditions:**
- Preserves non-empty existing rows at start
- Discards empty existing rows
- Skips incoming rows that match existing by (customer case-insensitive + amount numeric equality)
- Appends remaining incoming rows after existing

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Auth token missing | Return `{ ok: false, error: 'auth_missing' }`, show toast "Please log in again" |
| Network failure | Return `{ ok: false, error: 'network_error' }`, show toast "Could not reach server" |
| HTTP non-2xx | Return `{ ok: false, error: 'http_error' }`, show toast with status |
| Timeout (30s) | Abort fetch, return `{ ok: false, error: 'timeout' }`, show toast |
| No qualifying tickets | Return `{ ok: true, rows: [] }`, show info toast on manual sync |
| Auto-prefill with saved report | Skip prefill entirely, load saved data |

## Testing Strategy

- Unit tests for `filterQualifyingTickets()` with mock tickets covering all filter conditions
- Unit tests for `mapTicketToCashRow()` verifying field mapping and name cleaning
- Unit tests for `deduplicateAndMerge()` covering exact matches, partial matches, multiple duplicates
- Integration: manual testing in dev environment with real schedule data

## Correctness Properties

### Property 1: All prefilled rows have valid positive amounts

**Validates: Requirements 2.3, 3.3**

∀ row ∈ prefillResult.rows: parseFloat(row.amount) > 0

### Property 2: No duplicate rows after merge

**Validates: Requirements 7.1, 7.2, 7.3**

For any (customer, amount) pair with count N in existing rows, at most N incoming tickets with that pair are skipped.

### Property 3: Prefill never overwrites saved report data

**Validates: Requirements 6.1, 6.2**

IF hasSavedReport THEN auto-prefill is NOT triggered.

### Property 4: All rows have unique IDs

**Validates: Requirements 3.4**

∀ i,j ∈ result.rows where i ≠ j: rows[i].id ≠ rows[j].id

### Property 5: Filter is strictly conjunctive

**Validates: Requirements 2.1, 2.2, 2.5**

∀ ticket ∈ filterQualifyingTickets(input): getScheduleStatusValue(ticket) === 'DONE_INSTALLED' AND resolveTicketPayment(ticket).mode === 'CASH' AND resolveTicketPayment(ticket).amount > 0

### Property 6: Manual sync preserves all user-entered data

**Validates: Requirements 5.1, 6.4**

∀ row ∈ existingNonEmpty: row ∈ deduplicateAndMerge(existing, incoming)
