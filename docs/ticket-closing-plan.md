# Close Ticket — Implementation Plan

Goal: replace the "pick a DONE status from a list" way of finishing a scheduled ticket with one guarded
**Close Ticket** action that (1) knows the right closing outcome for the ticket, (2) refuses to close while
required details, payment or documents are missing, (3) makes the person confirm everything is final, and
(4) locks the closed ticket against edits by non-admins.

Status of this document: **implemented in the portal and backend (rollout steps 1–3 and 5); step 4 is behind a flag.**
Decisions in §5 were taken at the plan's proposed defaults (see "Implementation notes" at the end).

---

## 1. How closing works today (what we are replacing)

| Piece | Where | Today |
|---|---|---|
| Status picker | `src/components/tickets/TicketStatusPickerPopover.tsx` (+ two inline copies in `src/pages/Tickets.tsx`, search `title: 'CLOSING'`) | A popup with two button lists: **PENDING** (16 options) and **CLOSING** (13 options). The user picks e.g. `DONE INSTALL` by hand. |
| Statuses | `src/utils/scheduleStatus.ts` — `SCHEDULE_PENDING_OPTS`, `SCHEDULE_CLOSING_OPTS`, `CLOSING_SCHEDULE_STATUSES` | Closing value is stored as `scheduleOutcome` inside `acDetails` (see `src/utils/ticketPatch.ts`) and mapped to `Ticket.Status` (`INSTALLED`/`COMPLETED`). |
| Required details | `getEmptyRequiredColumnsForClose()` in `src/utils/ticketPayment.ts` | Blocks closing when Ticket No, Customer, District, Brand, Dealer, Commit, Negotiator, Installer or Driver is empty. **Portal-only** — the backend does not check. |
| Payment | `ticketHasPaymentInfo()` + payment prompt | Asked only for DONE INSTALL / CLEANING / DISMANTLE / RELOCATED, and only when missing. |
| Documents | `TICKET_UPLOAD_ZONES` in `src/utils/ticketPhotos.ts` | Zones exist with a `required` flag (Indoor Unit, Outdoor Unit, Nameplate/Serial are required; Receipt, Job Order, Installation Photo optional) but **nothing enforces them at closing**. |
| Confirmation | — | None. One click closes. |
| Lock after closing | Backend `canModifyTicket()` in `TicketService.java` | None. A closed ticket can be edited by anyone who could edit it before. |
| Audit fields | `tickets.closed_at`, `tickets.closed_by` | Exist. `closed_at` is stamped when status becomes INSTALLED/COMPLETED; `closed_by` only if the client sends it. |

Problems: wrong DONE status picked by hand, tickets closed with no photos or wrong payment, no "are you sure",
and closed tickets silently edited afterwards (which then disagrees with payroll, DTR sync and archives).

---

## 2. Target behaviour

### 2.1 A short status popup (replaces the two long lists)
The popup shows only what makes sense for **this** ticket, as a few large buttons:

| Button | What it does |
|---|---|
| **Done ‹job›** — e.g. **Done Install** on an install ticket | Closes the ticket (checks in 2.2, confirmation in 2.3). The outcome comes from the ticket's job type, so nobody picks it from a list. |
| **Resched** | Opens the existing reschedule dialog (new date). |
| **Continuation** | Opens the existing continuation dialog (job continues another day). |
| **Cancel ticket** | Cancels it (reason required). |
| *More…* (collapsed) | The rarely used statuses — For Quotation, Pending Approval, For Negotiation, For Collection — and changing the job type (Install ↔ Cleaning ↔ Service…). |

Example: an **Install** ticket shows **Done Install · Resched · Continuation · Cancel**. A ticket already in
**Resched** shows the same, with Resched highlighted, and **Done Install** stays available once the new date is set.

Which "Done" each job type gets:

| Current status | Closes as |
|---|---|
| INSTALL, S/I | DONE_INSTALLED |
| SURVEY | DONE_SURVEY |
| CLEANING | DONE_CLEANING |
| CHECKUP | DONE_CHECKUP |
| BACKJOB | DONE_BACKJOB |
| SERVICE | DONE_SERVICE |
| MOUNTING | DONE_MOUNTING |
| FOR_NEGOTIATION | DONE_NEGOTIATION |
| SYSTEM_REPROCESS | DONE_SYSTEM_REPROCESS |
| DISMANTLE | DONE_DISMANTLE |
| RELOCATION | DONE_RELOCATED |
| FOR_APPROVAL (For Quotation) | DONE_QUOTATION |
| RESCHED, CONTINUATION | Uses the ticket's underlying job type (an install that was rescheduled still closes as DONE_INSTALLED). Disabled only while the new date is still pending. |
| PENDING_APPROVAL, FOR_COLLECTION | No Done button — these are waiting on something else. |

### 2.2 Requirements gate (blocks closing)
Clicking Close Ticket opens a **Close Ticket dialog**. Step 1 is a checklist; every line is ✓ or ✗ and closing is
impossible while any ✗ remains. Each ✗ has a "Fix" action that opens the right place.

1. **Ticket details** — the existing `getEmptyRequiredColumnsForClose()` list.
2. **Payment** — mode of payment and amount present, for outcomes that collect money
   (DONE_INSTALLED, DONE_CLEANING, DONE_DISMANTLE, DONE_RELOCATED; free/warranty commits are exempt as today).
3. **Documents** — required attachments present, by outcome (proposed defaults, see Decisions):

| Outcome | Required attachments |
|---|---|
| DONE_INSTALLED | Indoor Unit, Outdoor Unit, Nameplate/Serial, Job Order |
| DONE_CLEANING, DONE_SERVICE, DONE_CHECKUP, DONE_BACKJOB | Job Order |
| DONE_DISMANTLE, DONE_RELOCATED, DONE_MOUNTING | Job Order + one unit photo |
| DONE_SURVEY, DONE_QUOTATION, DONE_NEGOTIATION, DONE_SYSTEM_REPROCESS | none |
| any outcome paid by bank transfer / GCash / cheque | + Receipt (proof of payment) |

Schedule rows are "light" and do not carry attachments, so the dialog must load the full ticket first
(`fetchTicketById`) before evaluating the checklist.

### 2.3 Final confirmation
Step 2 shows a read-only summary: ticket no., customer, address, schedule date, installer and driver, brand /
unit / HP, commit, payment mode + amount (with the breakdown for split payments), and thumbnails of the
attachments. Below it: a checkbox —

> I have checked the ticket details, payment and documents. They are correct and final.

The **Close Ticket** button is disabled until the box is ticked. On confirm the ticket is closed and stamped with
who closed it and when.

### 2.4 Lock after closing
- A closed ticket is **read-only for non-admins**: inline cells, the edit modal, status picker, attachments
  add/remove, payment, delete. The UI shows "Closed by ‹name› on ‹date›".
- **Admins / management** can still edit, and get a **Reopen ticket** action (reason required). Reopening clears
  `closed_at`/`closed_by`, puts the ticket back to its pending status and writes a history entry.
- The lock is enforced **on the backend**, not only hidden in the portal.
- Fields that other teams legitimately update after closing stay writable for their roles: warranty
  registration fields (warranty registrars), payroll/payout flags, collection fields, happy-call fields.

---

## 3. Design

### 3.1 Backend (`ashcol-service-api`)
No schema change needed — `closed_at`, `closed_by` and `acDetails.scheduleOutcome` already exist.

1. **`POST /api/tickets/{id}/close`** (new, `TicketController` + `TicketService.closeTicket`)
   - Body: `{ confirmed: true }` (plus optional note).
   - Derives the outcome from the current status (table in 2.1) — reject if not closable.
   - Re-runs the three checks server-side (details, payment, documents). Returns `400` with a structured list
     `{ missing: [{ kind: 'detail'|'payment'|'document', label }] }` so the portal can show the same checklist.
   - Applies the outcome exactly the way the existing status-change path does (reuse that code so DSR/archive,
     payroll and happy-call side effects stay identical), sets `closed_at = now`, `closed_by = current user`,
     writes a `TicketAssignmentHistory` entry.
2. **`POST /api/tickets/{id}/reopen`** — admin/management only, body `{ reason }`. Restores the pending status
   (from the outcome → status table, reversed), clears `closed_at`/`closed_by`, history entry with the reason.
3. **Lock in `updateTicket`** (search `public TicketResponse updateTicket`): if the ticket is closed and the
   caller is not admin/management, reject with `403 "This ticket is closed. Ask an admin to reopen it."` —
   except when the request only touches whitelisted post-close fields (warranty registration, payout/payroll
   flags, collection, happy call). Implement as a helper `isClosedLocked(ticket)` + `touchesOnlyPostCloseFields(request)`.
   Same guard on photo-attachment updates and `deleteTicket`.
4. **Stop the old path from closing**: the generic update must refuse a change *into* a closing outcome for
   non-admins (`"Use Close Ticket"`), otherwise the gate can be bypassed by sending the status directly.
   Keep it allowed for admins and for imports/backfills.
5. Required-document rules live in one place on the backend (a small `TicketCloseRules` class) and are returned by
   `GET /api/tickets/close-rules` so the portal reads the same table instead of duplicating it.

### 3.2 Portal (`ashcol-web-portal`)
1. `src/utils/ticketClose.ts` (new): `getCloseOutcome(ticket)`, `getCloseBlockers(ticket, rules)` (details /
   payment / documents), `isTicketClosed(ticket)`, `canEditClosedTicket(user)`. Export through the
   `ticketHelpers` barrel.
2. `src/components/tickets/CloseTicketDialog.tsx` (new): loads the full ticket, step 1 checklist with Fix
   actions, step 2 summary + confirmation checkbox, calls `POST /close`, shows server-side blockers if any.
   Must be a module-level component (see CLAUDE.md note about cell components).
3. `TicketStatusPickerPopover.tsx` and the two inline pickers in `Tickets.tsx`: remove the CLOSING section,
   add **Close Ticket** and **Cancel Ticket** buttons. Remove the now-dead closing branches
   (`getEmptyRequiredColumnsForClose` alert, payment prompt for closing).
4. Lock in the table engine (`Tickets.tsx`): when `isTicketClosed(t) && !isAdmin`, inline cell editing, the edit
   modal's Save, photo add/remove (`TicketDetailsModal`, `RelayEditTicketModal`) and delete are disabled; show a
   "Closed" lock chip with closed-by and date. Admins see **Reopen ticket**.
5. `validateEditFormFor` in `Tickets.tsx`: the edit modal can no longer set a closing status; it offers the
   Close Ticket button instead.

### 3.3 Other clients
The mobile app (`ashcol-mobile-app`) also changes ticket status. Because the lock and the "no direct closing"
rule are enforced on the backend, check which status calls the app makes and move its "mark installed" action to
`POST /close` in the same release — otherwise installers get a 403.

---

## 4. Rollout (do in this order)

1. **Backend, no behaviour change yet:** `TicketCloseRules`, `GET /close-rules`, `POST /close`, `POST /reopen`.
   Stamp `closed_by` properly. Deploy.
2. **Portal:** `ticketClose.ts`, `CloseTicketDialog`, picker changes. Old list removed. Verify with
   `npm run build` and manually on Schedules, My Tickets and Search.
3. **Lock:** backend guard in `updateTicket`/photos/delete + portal read-only state + Reopen. Deploy backend
   first, then portal.
4. **Block the old path** (3.1 step 4) once the mobile app uses `/close`.
5. Update `docs/ASHCOL_SYSTEM_SCOPE.md` §7.2 (status model) with the Close Ticket flow.

Each step ships on its own; steps 1–2 already give the guarded closing, 3–4 add the lock.

---

## 5. Decisions needed before building

1. **Required documents per ticket type** — is the table in 2.2 right? In particular: is a Job Order photo
   required for every install, and is a payment receipt required for bank/GCash payments?
2. **Who may close** — anyone who can edit the ticket today (negotiator, coordinator, branch staff), or only
   specific roles?
3. **Already-closed tickets** — lock all of them immediately, or only tickets closed after the release date?
   (Locking all is simpler; admins can reopen.)
4. **Undo window** — should the person who closed a ticket be able to reopen it themselves for a short time
   (e.g. the same day), or is reopening always admin-only?
5. **Managers** — treated as admin for editing closed tickets (as on Request Forms), or locked like members?
6. **Free / warranty jobs** — confirm they are exempt from the payment check, as today.

---

## 6. Implementation notes

What was built, and where it differs from the plan above:

- **Backend** (`ashcol-service-api`): `TicketCloseRules` (outcome, details/payment/document checks, closed statuses), `GET /tickets/close-rules`, `POST /tickets/{id}/close`, `POST /tickets/{id}/reopen`, closed-ticket lock in `updateTicket`/`deleteTicket` (`TicketClosedException` → 403), tests in `TicketCloseRulesTest` and `TicketCloseIntegrationTest`.
- **`/close` accepts an optional `patch`** (an `UpdateTicketRequest`). The portal still builds the archive / completion-date bookkeeping client-side (`enrichCompletePatchBody`, Archives report), so that patch rides along with the close; the server overrides its status/outcome with the one it derived and re-checks the gate on what was saved.
- **Documents are matched by photo description** (the attachment gallery is free-text, and `TICKET_UPLOAD_ZONES` is not used by the UI): indoor / outdoor / nameplate-serial-sticker / "job order"-"service report" / receipt-invoice. The install presets (INDOOR UNIT, OUTDOOR UNIT, STICKER, SERVICE REPORT, PR/SALES INVOICE) satisfy the install requirements. Keywords live in `TicketCloseRules.java`.
- **Decisions (defaults):** table in 2.2 as proposed; anyone who can edit the ticket may close it; every already-closed field ticket locks immediately; reopening is admin/management/manager only (no undo window); managers count as admins for closed tickets; free/warranty commits and FREE modes skip the payment check.
- **Portal:** `ticketClose.ts`, `CloseTicketDialog`, redesigned status popup (Done button, Resched / Continue / Cancel tiles, collapsed "More statuses & job type", cancel reason, reopen), lock chip + read-only gating, edit-modal status grid now has **Close Ticket** instead of the closing list. A remark such as "installed" no longer auto-closes a ticket.
- **Step 4 (block the old path)** is implemented but **off** (`ashcol.tickets.block-direct-close=false`). The mobile app (`ashcol-mobile-app`, not in this workspace) still closes with a plain status PATCH — move it to `POST /close`, then set the flag to `true`.
- Not done: the schedule-board import path (`handleApplyImport`) still closes imported rows directly (the plan keeps imports allowed).
