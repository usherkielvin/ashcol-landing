# ASHCOL System — Project Scope & Context Brief

> **Purpose of this file.** This is a single-source context document for the whole ASHCOL platform (web + mobile + backend). Paste it into an AI assistant, hand it to a new developer, or use it as the base for capstone documentation. It describes *what exists today*, not a wishlist.
>
> **Company:** Ashcol Airconditioning Corporation ("Keeping YOU Cool") — `www.ashcol.com.ph`
> **Project type:** Capstone — enterprise field-operations & service-management platform
> **Last verified against code:** 2026-09-16

---

## 1. System at a Glance

ASHCOL is a **multi-branch field service operations platform** for an airconditioning installation and servicing company. It digitizes the full lifecycle: a customer booking or dealer referral becomes a ticket, the ticket gets scheduled and dispatched to a technician crew with a vehicle, work gets completed in the field, then it flows into archives, warranty registration, collections, commissions, and payroll.

Three codebases, one shared API and database:

| Repo | Role | Deployed to |
| :--- | :--- | :--- |
| `ashcol-web-portal` | Staff/admin web portal (the main system) + public landing & booking page | Vercel → `portal.ashcol.com.ph` |
| `ashcol-service-api` | Spring Boot REST API — single backend for both clients | Windows PC (NSSM service) → `api.ashcol.com.ph` |
| `ashcol-mobile-app` | Expo/React Native app for field technicians & drivers | Android APK/AAB (EAS) |

Supporting folders in the workspace: `Documentation/` (capstone paperwork), `inventory-ashcoldb/`, `aircon frost/`.

```
                    ┌──────────────────────────────┐
  Public visitors → │ Landing + /booking (public)  │
                    │ + Vercel AI chatbot (api/)   │
                    └──────────────┬───────────────┘
                                   │
  Staff / Admin ───► ashcol-web-portal (React 19 + Vite)
                                   │
                                   │  JWT / REST (/api/**)
                                   ▼
                    ┌──────────────────────────────┐
                    │   ashcol-service-api         │
                    │   Spring Boot 3.4.1          │
                    │   JWT auth · @PreAuthorize   │
                    └──────┬───────────────┬───────┘
                           │               │
  Technicians / Drivers ───┘               ▼
  (ashcol-mobile-app, Expo)     MySQL (local dev, Flyway)
                                Supabase PostgreSQL (prod, no Flyway)
```

---

## 2. Tech Stack

### 2.1 Web Portal (`ashcol-web-portal`)

| Layer | Technology |
| :--- | :--- |
| Framework | React **19.2** + TypeScript **5.9** |
| Build | Vite **8**, `tsc -b && vite build` |
| Routing | `react-router-dom` **7** |
| Styling | Tailwind CSS **3.4**, PostCSS, dark/light theme via `ThemeContext` |
| Icons | `lucide-react`, `react-icons` (Material subset in the sidebar) |
| Animation | `framer-motion`, `gsap` |
| Maps | `leaflet` + `react-leaflet` (fleet/technician tracking) |
| Documents | `jspdf` + `jspdf-autotable` (PDF exports), `xlsx` (Excel import/export), `html2canvas` |
| Auth | JWT (`jwt-decode`) + Google Identity (`@react-oauth/google`) |
| AI | Vercel AI SDK (`ai`, `@ai-sdk/google`) — powers "Arctic" assistant + public chatbot |
| Realtime/misc | `firebase`, `qrcode` (booking QR), `react-easy-crop` (avatar crop), `react-number-format` |
| Serverless | `api/chat.ts`, `api/branchKnowledge.ts` (Vercel functions for the public landing chatbot) |

### 2.2 Backend (`ashcol-service-api`)

| Layer | Technology |
| :--- | :--- |
| Framework | Spring Boot **3.4.1** |
| Language | Java **17** (per `pom.xml` `<java.version>`; the repo's CLAUDE.md text says 21 — `pom.xml` is authoritative) |
| Web / Data | `spring-boot-starter-web`, `spring-boot-starter-data-jpa` (Hibernate) |
| Security | `spring-boot-starter-security`, JJWT (`jjwt-api/impl/jackson`), method security via `@PreAuthorize` |
| Migrations | Flyway (`flyway-core`, `flyway-mysql`, `flyway-database-postgresql`) — **enabled on MySQL, disabled on prod Postgres** |
| Databases | MySQL (`mysql-connector-j`) local · PostgreSQL (`postgresql`) prod · H2 (tests) |
| Mail | `spring-boot-starter-mail` (password reset, technician invites) |
| AI | Spring AI (`spring-ai-openai-spring-boot-starter`) + Gemini services in `ai/` |
| Excel | Apache POI (`poi-ooxml`) for report/import generation |
| API docs | `springdoc-openapi-starter-webmvc-ui` (Swagger UI) |
| Caching | Caffeine |
| Push | `web-push` (VAPID) + `bcprov-jdk18on` |
| Observability | `spring-boot-starter-actuator`; health at `GET /api/health` |
| Boilerplate | Lombok |

### 2.3 Mobile App (`ashcol-mobile-app`)

| Layer | Technology |
| :--- | :--- |
| Framework | Expo **~54** + React Native **0.81.5** + React **19.1** |
| Routing | `expo-router` 6 (file-based) + `@react-navigation/bottom-tabs` |
| Language | TypeScript 5 |
| API | `axios` with centralized JWT interceptors (`src/services/api.ts`) |
| Maps / Location | `react-native-maps`, `expo-location`, `expo-task-manager` (background location) |
| **AR** | `@reactvision/react-viro` — AR pipe-measurement survey (`app/ar-survey.tsx`) |
| Graphics | `@shopify/react-native-skia`, `react-native-svg`, `react-native-reanimated` |
| Storage | `@react-native-async-storage/async-storage` (offline cache/queue), `expo-secure-store` (tokens) |
| Auth | `@react-native-google-signin/google-signin`, `expo-auth-session` |
| Connectivity | `@react-native-community/netinfo` (offline detection) |
| Other | `firebase`, `expo-image-picker`, `expo-haptics`, `expo-blur` |
| Build | `expo prebuild` → Gradle (`build:apk:release`), EAS (`eas.json`) |

---

## 3. Roles & Access Control

Backend enum `User.UserRole`: **`CUSTOMER`, `EMPLOYEE`, `MANAGER`, `ADMIN`, `MANAGEMENT`, `OIC`**
Account lifecycle `User.UserStatus`: **`PENDING`, `ACTIVE`, `DEACTIVATED`**

Baseline data-scope rules (enforced by `@PreAuthorize` in controllers **plus** service-level checks):

| Role | Scope |
| :--- | :--- |
| `CUSTOMER` | Own tickets only |
| `EMPLOYEE` (technician/driver) | Tickets assigned to them |
| `MANAGER` / `MANAGEMENT` / `OIC` | Their own `branch_id` only |
| `ADMIN` | Everything, all branches |

- `RoleAccess.hasPortalAdminAccess()` is the **single source of truth** for "can see the admin portal" (ADMIN or MANAGEMENT). Never re-derive this inline.
- The portal additionally uses **job-title-based** gating (e.g. coordinator/dispatcher) and per-feature flags such as `canAccessRelays`, `canAccessPayroll`, `canAccessDdrm` in `DashboardLayout.tsx` — sidebar visibility is a union of role + job title + feature flag.

---

## 4. Branch Model (important & unusual)

Operations are **branch-scoped end to end**. Branch list is data-driven from the `Branch` entity (`/api/branches`), and includes: **Head Office (Taguig/Makati)**, **Taguig**, **Calauan**, **Silang**, **Dasmariñas**, **Pampanga**, **Bulacan**, **Rizal**, **Candelaria**, and others added over time.

**The Taguig split is a real modelling quirk:** Taguig is separated into **`TAGUIG - SALES`** and **`TAGUIG - SERVICES`** as distinct operating scopes derived from one branch record (`<id>-sales` / `<id>-services`). Sales handles commercial/negotiation work, Services handles technical/field work. Lots of filtering code special-cases this (`isTaguigBranchRef`, `isTaguigServicesScope`, `isTaguigServiceTicket`). Treat "branch" as **scope**, not just a row ID.

Supporting concept: **installer lineup overrides** and **driver-only names** can re-assign which branch a ticket effectively belongs to, so branch resolution is a function (`resolveTicketScheduleBranchId`), not a raw column read.

---

## 5. Web Portal — Modules & Tabs

The sidebar is organized into **four groups** (`buildNavGroups` in `src/layouts/DashboardLayout.tsx`). 39 page components live in `src/pages/`.

### 5.1 Group: **Tickets**

| Tab | Route | What it does |
| :--- | :--- | :--- |
| **Relays** | `/relays` | Sales/negotiation pipeline — incoming dealer & direct jobs before they become firm schedules. Relay→warranty linkage lives here. |
| **Bookings** | `/bookings` | Customer-submitted bookings from the public `/booking` page; QR intake (`BookingQrModal`). |
| **My Tickets** | `/my-tickets` | A negotiator's personal queue: their still-open, not-yet-closed tickets (survey/install/service/resched…). Thin wrapper over the shared Tickets table (`surface="my-tickets"`). |
| **Schedules** | `/schedules` | The operational day view — dated schedule board per branch, with day chips, month view, status filters, driver/vehicle assignment, showcase export. |
| **Archives** | `/service-report` | Immutable completed-work records (Daily Service Report), monthly accounting periods, collections & payment modes. |
| **Registration** | `/registration` | Warranty registration records tied to completed installations. |
| **Happy Calls** | `/happy-calls` | Post-service customer follow-up / satisfaction calls and leads. |
| *(also)* | `/search` | Global ticket search (`SearchTickets`), `/tickets` redirects here. |
| *(also)* | `/create-ticket` | Manual ticket intake + Excel import panel. |

`Tickets.tsx` is the **shared table engine** behind Schedules / My Tickets / Search — one component driven by a `surface` prop, with inline cell editing, per-column renderers, auto-fit text, ghost rows, and expand-on-click cells. It is by far the largest frontend file; read it before touching any table behavior.

### 5.2 Group: **Operations**

| Tab | Route | What it does |
| :--- | :--- | :--- |
| **LINEUP** | `/lineup` | Daily field dispatch planner: vehicle trips ↔ drivers ↔ technicians ↔ districts. Sub-tabs: main lineup, **Weekly** field schedule, **Vehicles**. Showcase modal + PDF export for morning briefings. |
| **HRIS** | `/admin-hris` | HR module — sub-tabs for **Leaves**, **Cash Advances**, **Drivers**. Leave balances/requests, overtime requests. |
| **DDRM** | `/ddrm` | Driver Daily Route Monitoring — route sheets & logs per driver/vehicle. |
| **Request Forms** | `/operations-forms` | Digital operations intake forms (survey, repair authorization, satisfaction certificates). |
| **Office tasks** | `/office-tasks` | Non-field (office-category) ticket work queue. |

### 5.3 Group: **Finance**

| Tab | Route | What it does |
| :--- | :--- | :--- |
| **Daily Transactions** | `/audit-report` | Daily branch report (DTR) — per-branch daily sales/collections submission + audit view. Includes DTR scanner/form pages and history. |
| **Expenses** | `/audit-expenses` | Audit/finance expense records with categories; receipt scanning (`ReceiptScanController`). |
| **Collections** | `/collections` | For-Collections tracker — unpaid balances, rebates, incentives; mark-as-paid workflows. |
| **Commissions** | `/commissions` | Sales/negotiator commission computation & records. |
| **Cash Advance** | `/cash-advances` | Employee cash advances + repayment tracking. |
| **Payroll** | `/payroll` | Payroll entries derived from attendance/DTR, advances, overtime and commissions. |
| **Bills** | `/admin-bills` | Monthly bills & dues, bill payments per branch. |
| **Telecoms** | `/admin-telecom` | Telecom account monitoring (lines, plans, payments). |

### 5.4 Group: **Directory**

| Tab | Route | What it does |
| :--- | :--- | :--- |
| **Members** | `/employees` | Employee directory + profile details modal (photo, role, job title, contact). |
| **Vehicles** | `/vehicles` | Fleet registry + vehicle expenses; fleet map (`FleetMap`). |
| **Branches** | `/branches` | Branch directory (addresses, hotlines, departments). |

### 5.5 Public / auth surfaces

`/` landing (`Landing.tsx` + `PublicAIChatBot`), `/booking` (`PublicBooking.tsx` — customer self-service booking), `/login`, `/forgot-password`, `/create-account`.

### 5.6 Cross-cutting portal features

- **Arctic** (`ArcticContext`, `components/arctic/`) — in-portal AI assistant drawer. Pages publish `pageContext` + `dataContext` (e.g. the rows currently visible in a table) so Arctic answers from what's actually on screen instead of guessing.
- **Messaging** (`MessagingContext`, `Messages.tsx`, `FloatingChatWindow`) — internal staff chat with conversations, presence status, floating chat window.
- **Notifications** (`NotificationContext`, dropdowns + detail modal) — backed by persisted `Notification` entities; web push via VAPID.
- **Theme** (`ThemeContext`) — full dark/light theming; every component takes explicit theme tokens rather than relying on CSS classes alone.
- **Employee details** (`EmployeeDetailsContext`) — global, click-any-name-anywhere employee profile modal (`EmployeeNameLink`).
- **Caching / cross-tab sync** — multi-tier local cache (`ticketTabCache`, `portalDirectoryCache`) + BroadcastChannel-style events so tabs stay consistent.
- **Ticket history** — timeline modal, table, and graph views over the assignment/status audit trail.

---

## 6. Mobile App — Screens & Features

File-based routes (`app/`), tab bar in `app/(tabs)/`:

| Screen | Purpose |
| :--- | :--- |
| `(tabs)/index`, `(tabs)/dashboard` | Technician home — today's assignments and lineup briefing |
| `(tabs)/tickets`, `tickets/[id]` | Assigned ticket list + full ticket detail / status updates |
| `(tabs)/create-ticket` | Field ticket intake |
| `(tabs)/activity` | Activity feed / history |
| `(tabs)/driver-dashboard`, `(tabs)/driver-vehicle` | Driver-specific views (route + assigned vehicle) |
| `(tabs)/audit-expenses` | Field expense submission |
| `(tabs)/branches` | Branch directory |
| `(tabs)/messages` | Staff messaging |
| `(tabs)/profile`, `appearance` | Profile & theme preference |
| `ar-survey` | **AR pipe-measurement survey** (Viro) — measure IDU↔ODU copper pipe runs, dual meters/feet output, attach result to ticket remarks/BOM |
| `login`, `signup`, `signup-password`, `create-account`, `forgot-password`, `landing` | Auth flows (incl. Google sign-in) |

Mobile-specific capabilities: **offline cache + background sync queue** (AsyncStorage + NetInfo), **background location** reporting for technician tracking (`locationService`, `expo-task-manager`, feeding `TechnicianLocationController`), branch-scoped job filtering.

---

## 7. Core Domain Concepts

### 7.1 Ticket categories (`TicketCategory` enum — 11 values)

- **FIELD** (`isField()`): `INSTALLATION`, `SERVICES`, `SURVEY`
- **OFFICE** (`isOffice()`): `ADMIN_TASK`, `CLAIMS`, `HR_TASKS`, `PARTS_SALES`, `PAYROLL_TASKS`, `QUOTATION`, `REQUEST_FOR_FUND`, `WTY_REGISTRATION`

Schedules/Relays show FIELD categories; Office tasks shows OFFICE categories. Category is auto-derived from `service_type` text via `TicketCategory.fromServiceType()`, with a startup backfill component (`TicketCategoryBackfill`) repairing legacy rows.

### 7.2 Ticket status model (`Ticket.Status` enum)

```
PENDING, ASSIGNED, ON_THE_WAY, IN_PROGRESS, COMPLETED, INSTALLED, CANCELLED,
SCHEDULED, RESCHED, FOR_APPROVAL, SURVEY, CONTINUATION,
SYSTEM_REPROCESS, DONE_SYSTEM_REPROCESS, DISMANTLE, DONE_DISMANTLE,
MOUNTING, DONE_MOUNTING, RELOCATION, DONE_RELOCATED,
PENDING_APPROVAL, FOR_NEGOTIATION, DONE_NEGOTIATION, FOR_COLLECTION
```

On top of the raw enum, the UI works with a derived **schedule status** (`getScheduleStatusValue()`) split into two groups:

- **Pending group** — `S/I`, `INSTALL`, `SURVEY`, `CLEANING`, `CHECKUP`, `BACKJOB`, `SERVICE`, `RESCHED`, `CONTINUATION`, `FOR_APPROVAL` (shown as "FOR QUOTATION"), `SYSTEM_REPROCESS`, `DISMANTLE`
- **Closing group** — `DONE_INSTALLED`, `DONE_CLEANING`, `DONE_SURVEY`, `DONE_CHECKUP`, `DONE_BACKJOB`, `DONE_SERVICE`, `DONE_SYSTEM_REPROCESS`, `DONE_DISMANTLE`, `DONE_QUOTATION`, plus `CANCELLED`

> **Rule that trips people up:** a ticket stays on a negotiator's *My Tickets* queue until it reaches a **closing** outcome — **not** merely because it has been given a schedule date. Having a `finalDate` does not mean the negotiator is done with it.

**Closing a ticket (Close Ticket flow).** Closing outcomes are no longer picked from a list. The status popup shows one **Done ‹job›** button (outcome derived from the ticket — `TicketCloseRules.deriveOutcome` on the backend, `getCloseOutcome` in `src/utils/ticketClose.ts`), which opens the **Close Ticket dialog**: a checklist of details, payment and documents (all must be ✓), then a read-only summary + "correct and final" confirmation. The save goes to `POST /api/tickets/{id}/close`, which re-runs the same checks server-side (400 with `{ missing: [{kind,label}] }`), applies the close through the normal update path and stamps `closed_at`/`closed_by`. The rules table (documents per outcome, payment outcomes, proof-of-payment modes) lives only in `TicketCloseRules.java` and is served by `GET /api/tickets/close-rules`.

A closed field ticket (`COMPLETED`/`INSTALLED`/`DONE_*`; office categories are exempt) is **read-only for everyone except admin / management / manager** — enforced in `TicketService.updateTicket`/`deleteTicket` (403 "This ticket is closed…"), mirrored in the portal (`isTicketLockedFor`). Still writable after close: warranty registration, payroll/payout flags, collection, happy-call/rating fields. Admins/managers reopen with `POST /api/tickets/{id}/reopen` (reason required; restores the pending status, clears `closed_at`/`closed_by`, writes history). Config: `ashcol.tickets.close-lock-enabled` (default true) and `ashcol.tickets.block-direct-close` (default false — turn on once the mobile app uses `/close`, so non-admins can no longer close via a plain status PATCH).

Status transitions are intricate and centralized in `TicketService` (the largest backend file). Every status change, reschedule and relay writes to `TicketAssignmentHistory` — the **"ghost history"** audit trail that also drives muted "ghost rows" on the schedule board.

### 7.3 Ticket numbering

Auto-generated per ticket. Current scheme is **`AC-001`** and counts up (`AC-` prefix, its own counter). The legacy schemes were `AS-###` and, before that, `TKT-###`; historical tickets keep their old numbers and a one-off migration/backfill normalizes missing ones (`TicketNumberBackfill`).

### 7.4 Soft delete

Deleting a ticket is **never a hard delete**: `deleteTicket()` writes a full JSON snapshot into the `deleted_tickets` table (with `original_ticket_id`, ticket number, branch, who deleted it, timestamp) before removing the live row. `GET /api/tickets/deleted` (ADMIN/MANAGEMENT) lists them.

### 7.5 Relay → warranty flow

Relay tickets (sales pipeline) link to installations, which link to warranty registration records. `RelayWarrantySyncService` handles linkage repair, duplicate merging and dedup key normalization across the `AS-`/`AC-`/`TKT-` numbering spaces. See `docs/relay-ticket-lifecycle-flow.md`.

---

## 8. Backend Surface

**37 controllers** in `com.ashcol.controller`, grouped by domain:

- **Tickets & field ops** — `TicketController`, `TicketWorkflowController`, `TicketScanController`, `DispatchController`, `DriverRouteController`, `LineupController`, `DailyServiceReportController`, `TechnicianLocationController`, `BookingController`, `HappyCallController`
- **People & org** — `AuthController`, `UserController`, `AdminController`, `ManagerController`, `BranchController`, `BranchV1Controller`, `DealerController`, `VehicleController`
- **HR** — `LeaveHrisController`, `OvertimeRequestController`, `CashAdvanceController`, `PayrollController`
- **Finance** — `AuditExpenseController`, `AuditExpenseCategoryController`, `BudgetRequestController`, `BillsDuesController`, `CommissionController`, `TelecomMonitoringController`, `ReceiptScanController`, `ReportController`
- **Platform** — `DashboardController`, `AnalyticsController`, `MessagingController`, `NotificationController`, `PushController`, `AiChatController`, `HealthController`

**38 JPA entities** in `com.ashcol.model`:

- Core ticketing: `Ticket`, `TicketCategory`(+`Converter`), `TicketAssignmentHistory`, `DeletedTicket`, `Booking`, `HappyCallLead`, `DailyServiceReport`
- Org: `User`, `Branch`, `Dealer`, `Vehicle`, `VehicleExpense`
- Dispatch: `LineupSchedule`, `DriverRouteSheet`, `DriverRouteLog`
- HR: `LeaveRequest`, `LeaveBalance`, `OvertimeRequest`, `CashAdvance`, `CashAdvanceRepayment`, `PayrollEntry`
- Finance: `AuditExpense`, `AuditExpenseCategory`, `BudgetRequest`, `MonthlyBill`, `BillPayment`, `DailyBranchReport`(+`History`), `ReportItem`, `TelecomAccount`, `TelecomPayment`
- Platform: `Notification`, `PushSubscription`, `Conversation`, `Message`

Package layout: `controller/` → `service/` → `repository/` → `model/`, with `dto/request/`, `dto/response/`, `security/` (JWT + `RoleAccess`), `config/` (SecurityConfig, CorsConfig, GlobalExceptionHandler, **startup data-repair components**), `ai/` (Gemini: `GeminiChatService`, `AgenticDispatchService`), `util/`.

---

## 9. Environments & Deployment

| | Local dev | Production |
| :--- | :--- | :--- |
| **Database** | MySQL, Flyway **enabled** (baseline v9) | Supabase PostgreSQL via JDBC **session pooler** (port 5432), Flyway **disabled** |
| **Schema changes** | Flyway migration in `src/main/resources/db/migration/V###__*.sql` (MySQL syntax) | Manual SQL in `scripts/postgres/` — notably `prod-schema-patch.sql`, run in the Supabase SQL editor |
| **API host** | `http://localhost:8080/api` (`.\run-backend.ps1`) | `https://api.ashcol.com.ph/api` — one Windows PC running the jar as NSSM service `AshcolBackend` |
| **Web host** | `http://localhost:5173` (`npm run dev`) | Vercel (`VITE_API_BASE_URL=https://api.ashcol.com.ph/api`) |
| **Mobile** | Expo dev server (`npm start`, port 8081) | Android APK/AAB via Gradle/EAS, `EXPO_PUBLIC_API_URL=https://api.ashcol.com.ph/api` |

**Critical deploy rule:** production deploys must **rebuild the jar**. `git pull` + `nssm start` alone does *not* pick up code changes. Use `scripts\redeploy-backend.ps1` (or `force-recover-backend.ps1` for full recovery incl. `.env` → NSSM sync). Full runbook: `ashcol-service-api/WINDOWS_BACKEND.md`.

**Schema-change checklist when touching a JPA entity:** (1) Flyway migration for MySQL, (2) matching statement appended to `scripts/postgres/prod-schema-patch.sql` for Supabase, (3) run it in Supabase **before/with** the deploy — prod boots with Hibernate schema validation and will fail if the table/column is missing.

Config files: `application.properties` is gitignored (copy `application.properties.example`); web uses `.env` (`VITE_*` values are public in the bundle — never put secrets there).

---

## 10. Conventions & Gotchas

- **`RoleAccess` for admin checks** — don't hand-roll ADMIN/MANAGEMENT logic.
- **`TicketService` is intricate** (~5k lines). Read the transition logic before changing any status behavior; reschedule/relay deliberately share one history-capture path.
- **Startup repair components** (`PostgresSchemaRepair`, `TicketCategoryBackfill`, `TicketNumberBackfill`) run on every boot to patch data drift. Check them before assuming a migration is the only fix path.
- **Branch scope ≠ `branch_id`** — use the resolver helpers; Taguig Sales/Services and installer-lineup overrides change the answer.
- **`ticketHelpers.ts` is a barrel** re-exporting `ticketTypes`, `scheduleStatus`, `scheduleRows`, `ticketDates`, `ticketPayment`, `ticketDisplay`, `ticketSearch`, `ticketImport`, `ticketPatch`, `ticketFilters` — imports stay backward-compatible, implementations are split by concern.
- **Table components must be module-level.** Defining a cell component inside `Tickets()` remounts every cell on every parent render — a real perf problem at hundreds of rows.
- **Known pre-existing lint noise** — `react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`, `react-refresh/only-export-components`, and `@typescript-eslint/no-explicit-any` appear across the codebase. When verifying a change, diff lint output against a baseline rather than expecting zero.
- **Tests** — backend integration tests run on H2 under the `test` profile; `TicketRbacIntegrationTest` is the canonical RBAC/status reference. One pre-existing failure (`invalid_status_transition_is_rejected`) is known and unrelated to new work.

---

## 11. Reference Docs

| Doc | Contents |
| :--- | :--- |
| `ashcol-web-portal/README.md` | Portal feature overview & stack table |
| `ashcol-web-portal/docs/relay-ticket-lifecycle-flow.md` | Relay → ticket → warranty lifecycle |
| `ashcol-web-portal/docs/audit_system_blueprint.md` | Audit/finance module design |
| `ashcol-web-portal/docs/ashcol_branch_details.md` | Branch addresses, hotlines, departments |
| `ashcol-service-api/CLAUDE.md` | Backend architecture, role model, DB/env notes |
| `ashcol-service-api/WINDOWS_BACKEND.md` | Production deploy & recovery runbook |
| `ashcol-mobile-app/README.md` | Mobile feature overview & stack table |

---

## 12. Glossary

| Term | Meaning |
| :--- | :--- |
| **Relay** | A sales/negotiation-stage job before it becomes a firm scheduled ticket |
| **Lineup** | The daily dispatch plan pairing vehicles, drivers, technicians and districts |
| **DDRM** | Driver Daily Route Monitoring |
| **DTR** | Daily Transaction Report (branch daily sales/collections submission) |
| **DSR** | Daily Service Report (archived completed field work) |
| **OIC** | Officer In Charge (branch-level role, displayed in full, not abbreviated, in profile views) |
| **PMS** | Preventive Maintenance Service (cleaning) |
| **Backjob** | Return visit to correct or finish previous work |
| **S/I** | Survey & Install (combined job type) |
| **RF** | Request for Fund |
| **Happy Call** | Post-service customer satisfaction follow-up call |
| **Ghost row / ghost history** | Muted row on the schedule board for a cancelled/completed/moved ticket, backed by `TicketAssignmentHistory` |
| **Showcase** | Full-screen presentation view of the day's schedule/lineup, used for morning briefings and PDF export |
| **Arctic** | The in-portal, context-aware AI assistant drawer |
