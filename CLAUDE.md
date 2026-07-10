# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The **Web Portal** of a three-workspace capstone project (ServiceHub / Ashcol Airconditioning). It's a Vite + React 19 + TypeScript admin/operator portal. It talks to a separate Spring Boot backend (`ashcol-service-api`, sibling working directory) and shares data with an Expo mobile app (`ashcol-mobile-app`, sibling working directory). This repo has no backend of its own except two small Vercel serverless functions under `api/`.

Local dev requires the Spring API running on `http://localhost:8080` (MySQL-backed, `SPRING_PROFILES_ACTIVE=local`) — see `SETUP.md` for full bootstrap (DB reset scripts, Flyway baseline, default admin login `admin@ashcol.com.ph` / `ushpons08`).

### Production topology

```
portal.ashcol.com.ph (this repo, on Vercel)  ──HTTPS──>  api.ashcol.com.ph (Windows PC, Spring Boot via NSSM, :8080)  ──JDBC──>  Supabase PostgreSQL (session pooler)
```

Production backend is **not** a managed cloud host — it's a Windows PC running the Spring Boot jar as an NSSM service, reachable via DNS/port-forward at `api.ashcol.com.ph`, using `SPRING_PROFILES_ACTIVE=prod`/`production` against Supabase Postgres over the session pooler (not the MySQL used in local dev). Full details, redeploy scripts, and the DB-connection troubleshooting playbook live in `ashcol-service-api/WINDOWS_BACKEND.md` — check there before assuming a "can't reach API" or "database unavailable" symptom is a portal bug.

## Commands

```bash
npm run dev       # vite dev server on :5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # preview production build
```

There is no test suite/runner configured in this repo (no `test` script, no test framework installed). Don't invent test commands.

`npm run dev` has no Vercel functions available — the two `/api/*` routes (public landing AI chat) only work via `vercel dev` or by proxying to a deployed origin (`PUBLIC_AI_DEV_PROXY` in `.env`, wired in [vite.config.ts](vite.config.ts)).

## Architecture

### Two apps in one router

[src/App.tsx](src/App.tsx) serves two audiences from the same build:
- **Public landing site** (`/`) — marketing page + public AI chatbot, shown unless on the portal subdomain.
- **Portal** (everything under `DashboardLayout`) — gated by `portal.` hostname, `VITE_IS_PORTAL=true`, or `?portal=true`. Auth state comes from `AuthContext`; unauthenticated users are redirected to `/login`.

Where a logged-in user lands (`getPortalHomePath` in [src/utils/api.ts](src/utils/api.ts)) depends on role/workspace: portal admins → `/audit-report`, sales workspace → `/audit-report?tab=submit`, service workspace → `/service-report`, plain employee/staff → `/my-tickets`.

### Branch scoping is the trickiest domain concept

Ashcol branches are mostly 1:1, **except Taguig, which splits into `BR-TAGUIG-SALES` and `BR-TAGUIG-SERVICES`** — two logically separate workspaces sharing one physical branch/UUID. A large fraction of [src/utils/api.ts](src/utils/api.ts) exists to resolve this split correctly from inconsistent inputs (legacy UUIDs, `BR-*` ids, free-text branch names, job titles, email addresses, dealer/technician name heuristics). Key functions to reuse rather than reinvent:
- `resolveScopedBranchId`, `parseGlobalBranchScope`, `isTaguigBranchRef`, `branchAuditLineIsService` — normalize/classify a raw branch reference.
- `branchScopesMatch`, `isSameBaseBranch` — compare two branch refs (Taguig-aware).
- `isSalesWorkspaceUser` / `isServiceWorkspaceUser` / `isPortalAdmin` / `isCoordinatorOrOicUser` — classify the *logged-in user's* workspace.
- `resolveTicketArchiveBranchId` / `resolveTicketScheduleBranchId` — resolve a ticket's *effective* branch (installer lineup roster wins over stored `branchId`, with fallbacks) for Archives vs Schedules views.
- `resolveInstallerLineupBranchId` / `isDriverOnlyOnLineup` — installer-name-based branch inference from the lineup roster, with fuzzy name matching.

Any new branch-filtering logic (schedules, archives, employee directory, negotiator dropdowns) should route through these helpers instead of comparing branch id strings directly — direct string comparison silently breaks Taguig Sales/Services and legacy-UUID branches.

### Ticket lifecycle (Relays → My Tickets → Schedules → Archives)

A ticket moves through exactly one primary work queue at a time, driven by fields inside the `acDetails` JSON blob (not separate columns):

1. **Relays** ([src/pages/ClientMasterlist.tsx](src/pages/ClientMasterlist.tsx)) — intake/dispatch. Leaves once `acDetails.finalDate` is set.
2. **My Tickets** ([src/pages/Tickets.tsx](src/pages/Tickets.tsx) at `/my-tickets`) — negotiator's personal queue (assigned, no `finalDate` yet).
3. **Schedules** (`Tickets.tsx` at `/schedules`) — day-of ops once `acDetails.finalDate` exists; branch + installer/driver lineup.
4. **Archives** ([src/pages/DailyServiceReport.tsx](src/pages/DailyServiceReport.tsx) at `/service-report`) — permanent record created on install-complete via `postTicketArchiveReport` in [src/utils/ticketArchive.ts](src/utils/ticketArchive.ts).

Full details, gaps, and the field-by-field contract are documented in [docs/relay-ticket-lifecycle-flow.md](docs/relay-ticket-lifecycle-flow.md) — read it before touching relay/schedule/archive filtering logic.

### Scheduled dates, reschedules, and "ghost rows"

`acDetails` carries the date state for a ticket once it's in Schedules:
- `finalDate` — kept for backward compat; `scheduledDate` mirrors it going forward (additive, both present on newer tickets).
- `previousScheduleDates` — array of dates a ticket was previously scheduled on. This is what drives the grayed-out **ghost row**: a rescheduled ticket must still show a muted row on its *old* date, not disappear from it, while the active row appears on the new date. **Never reset this array to `[]` on a normal status transition** — the only legitimate place that clears it is `applyReturnToNegotiatorMyTicketsPatch` in [src/pages/Tickets.tsx](src/pages/Tickets.tsx), because that path removes the ticket from scheduling entirely (back to My Tickets, no date at all). Clearing it anywhere else (e.g. in `clearRescheduleMetaInto`, or in `commitSaveEditTicket`'s status-transition merge) silently deletes the ghost row's history.
- `rescheduledTo` / `reschedulePending` — transient "this ticket has a pending reschedule to X" markers; these *do* get cleared once the reschedule resolves, unlike `previousScheduleDates`.

Backend (`ashcol-service-api`) matches tickets to a schedule date by substring-matching the `ac_details` TEXT column (`LIKE CONCAT('%key%', :value, '%')`, in `TicketRepository`/`TicketService`) since it's not a `jsonb` column — queries need an explicit `previousScheduleDates` OR-clause to surface ghost rows for a given date, not just `finalDate`.

### Driver / vehicle fields

Driver name and vehicle code are separate, independently-saved fields: `driverName` (new `driver_name` DB column) and `serviceVehicle` (holds only the vehicle code, e.g. `T2`, going forward). Legacy tickets stored a combined `"DRIVER VEHICLECODE"` string in `serviceVehicle` — `getServiceVehicleParts` in [src/pages/Tickets.tsx](src/pages/Tickets.tsx) splits that for backward-compat display, and must return an empty driver (not misclassify the vehicle code as a driver name) when the string is just a bare vehicle code. Use `getTicketDriverDisplay`/`getTicketVehicleDisplay` for display and read/write `driverName`/`serviceVehicle` independently when saving — don't recombine them into one string.

### Auth

[src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx) is a custom JWT-based auth (no library) — Google OAuth is one login path, feeding the same JWT session. The token lives in `localStorage`/`sessionStorage` under `ashcol-token`/`ashcol-user`, decoded client-side to check expiry on an interval (no silent refresh — expiry forces a hard redirect to `/login?expired=true`). `role` is always normalized to lowercase on write.

### Directory structure

- `src/pages/` — one component per route, generally self-contained with their own data fetching.
- `src/components/` — shared UI; `operations/`, `relays/`, `schedules/` subfolders hold components specific to those feature areas (e.g. `RelayEditTicketModal`, `ScheduleEditTicketModal`).
- `src/contexts/` — `AuthContext`, `ThemeContext`, `NotificationContext`, `EmployeeDetailsContext`.
- `src/utils/` — the real logic layer. [src/utils/api.ts](src/utils/api.ts) is the largest and most load-bearing file (branch scoping, role checks, ticket fetch/cache helpers, formatting). Other notable ones: `ticketArchive.ts` (archive sync), `relayScheduleSync.ts`, `localDataCache.ts` / `portalDirectoryCache.ts` (localStorage caches), `smartDate.ts`.
- `src/data/` — static reference data (PH addresses, branch list, Ashcol branch knowledge used by the AI chatbot).
- `api/` — two Vercel serverless functions (`chat.ts`, `branchKnowledge.ts`) for the **public landing page's** AI chat only; unrelated to the Spring portal's own `/api/ai/chat`.

### Environment

Copy `.env.example` to `.env`. Key vars: `VITE_API_BASE_URL` (Spring API base, defaults to prod `https://api.ashcol.com.ph/api` when `PROD`, else `localhost:8080/api`), `VITE_GOOGLE_CLIENT_ID`. `VITE_*` vars are bundled into the public client — never put real secrets behind that prefix (see comments in `.env.example` for the AI chat proxy options).
