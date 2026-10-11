# Branch Payouts (read-only) — Implementation Plan

Goal: once payroll marks an installer's weekly payout **COMPLETED** (the green "COMPLETED · by PAYROLL" pill on
the Payouts roster), the branch that installer belongs to can **see** it. Branch OIC / members get a **Payouts**
tab that lists their own branch's released installers and each installer's payout table, with nothing editable.

Status of this document: **implemented (backend + portal), not yet tried with real accounts.** See
"Implementation notes" at the end for the decisions taken.

---

## 1. How Payouts works today

| Piece | Where | Today |
|---|---|---|
| Who sees the tab | `DashboardLayout.tsx` (`canAccessPayroll` → `canMemberAccessPayroll`) | Admin, management, and members whose job title contains "payroll". Nobody else. |
| Who can edit | `Payouts.tsx` — `canManagePayroll` (admin / payroll member), `canManageClosures` (admin / manager) | Every edit control is already hidden behind these two flags. A non-payroll viewer is pinned to `user.branchId`. |
| Where rows come from | `GET /api/v1/payroll?branchId&month` (saved sheet) **merged in the browser** with a fresh pull of Schedules tickets | The merge runs for every viewer; only the auto-save is limited to payroll users. |
| "Completed" | `PayrollEntry.status = 'COMPLETE'` per row, set by `CompletePayoutModal` (also stamps `audited` + `remarks`) | An installer shows COMPLETED when **all** their rows in that week are `COMPLETE`. |
| Weeks | `src/utils/payrollWeeks.ts` | North branches Fri–Thu, South branches Mon–Sun; a week belongs to the month it ends in. |
| Week lock | `payroll_week_closures` (`POST/DELETE /payroll/closures`) | Separate from "completed" — locks a whole branch-week against edits. |

Two things the plan has to deal with:

1. **The backend does not check who is asking.** `GET /api/v1/payroll` returns any branch's sheet to any staff
   account, and `PUT /api/v1/payroll` lets any staff account **overwrite** it. Today that is only "safe" because
   the tab is hidden. The moment branch members get the tab, read access must be scoped and write access
   must be closed on the server.
2. **The browser merge would leak unreleased pay.** A branch viewer running the Schedules merge would compute
   rows and amounts for installers payroll has not released yet. Viewer mode must show saved, released rows only.

---

## 2. Target behaviour

### 2.1 Who gets the read-only tab
Branch **OIC**, **manager**, and branch office members (coordinator, negotiator, create-tickets, registration…),
for **their own branch only**. Field technicians / installers / drivers do not get it (see Decisions).
Payroll users and admins keep the full page exactly as now.

### 2.2 What a branch viewer sees
- The same page layout: week tabs → roster of installers (payout amount, COMPLETED pill, "by ‹payroll person›",
  remarks) → click an installer for their payout table.
- **Only released installer-weeks.** An installer appears in a week only when every one of their rows in that
  week is `COMPLETE`. Anything still pending or on hold is absent — not shown greyed out, not shown with an amount.
- Weeks with nothing released show: *"No payouts released for this week yet."*
- Branch is fixed to the viewer's own branch (no branch dropdown). Taguig users see their own scope
  (Sales or Services) using the existing branch-scope resolvers.
- A small **"View only"** badge in the toolbar.

### 2.3 What a branch viewer cannot do
No Sync Latest, no Payout Settings / rates, no cell editing, no Complete / Hold / Release / Corrections /
Adjust-balance, no Close-This-Week, no add/delete row, no Excel import. The installer table renders with the
same columns, read-only.

### 2.4 Footer totals
The footer shows **Net Payout Due** and the pay breakdown (base, add-ons, deductions) for the released
installers only. **Remittance Collected** is hidden for branch viewers by default (see Decisions).

---

## 3. Design

### 3.1 Backend (`ashcol-service-api`)

1. **Access helper** — `RoleAccess.canViewBranchPayouts(user)`: OIC, MANAGER, or an EMPLOYEE that is not a field
   technician (reuse `RoleAccess.isFieldTechnician`). `RoleAccess.hasPayrollAccess(user)` (already exists) stays
   the "full access" check.
2. **`GET /api/v1/payroll`** (`PayrollController.getEntries` → `PayrollService`):
   - payroll access → unchanged.
   - branch viewer → `403` unless `branchId` is the caller's own branch (same matching the ticket code uses,
     including Taguig Sales/Services and view-branches); then return **released rows only**
     (`PayrollService.getReleasedEntries`).
   - anyone else → `403`.
3. **Release rule on the server** — group the month's rows by installer + payroll week and keep a group only
   when every row is `COMPLETE`. This needs the week boundaries on the backend: port the small
   Fri–Thu / Mon–Sun rule from `payrollWeeks.ts` into a `PayrollWeeks` util (pure, unit-tested against the
   same cases). Carry-over rows follow the week of the installer group they are shown under.
4. **`PUT /api/v1/payroll`** — require `hasPayrollAccess`; everyone else `403`. (Closes the existing hole.)
5. **`GET /payroll/closures`, `/closures/check`** — branch viewers limited to their own branch.
   `POST/DELETE /closures` unchanged (admin / management / manager).
6. Tests: extend the payroll tests — viewer gets only released rows, viewer cannot read another branch,
   viewer and plain employee cannot `PUT`, payroll user unaffected.

No schema change.

### 3.2 Portal (`ashcol-web-portal`)

1. `src/utils/api.ts` — `canViewBranchPayouts(user)` mirroring the backend helper; keep `canMemberAccessPayroll`
   for full access.
2. `DashboardLayout.tsx` — show **Payouts** when `canAccessPayroll || canViewBranchPayouts(user)`; add it to the
   sales/service workspace link lists under the same condition.
3. `Payouts.tsx` — one `accessMode: 'manage' | 'view'`:
   - `view` skips the Schedules pull + merge entirely and renders what `GET /payroll` returned.
   - `view` hides Sync Latest, Payout Settings, held/corrections buttons, Close-This-Week, the Complete modal
     trigger, row actions; cells are read-only (the existing `isReadOnly` path, forced on).
   - Roster filters to released installers (belt and braces — the server already filtered).
   - Week tabs get a dot only for weeks that have released payouts; empty-state text for the rest.
   - "View only" badge; footer per 2.4.
   - A user with neither mode who opens `/payouts` by URL gets a "no access" state instead of the page.
4. Keep `Payouts.tsx` changes behind the single `accessMode` flag rather than new scattered role checks.

### 3.3 Optional (nice to have)
When payroll completes an installer, notify that branch's OIC ("Payout released: ‹installer›, ‹week›") using the
existing notification service, linking to `/payouts/‹branch›/‹installer›`.

---

## 4. Rollout (do in this order)

1. **Backend first:** access helper, scoped `GET`, locked `PUT`, `PayrollWeeks` util + tests. Deploy.
   (Safe on its own — the current portal only sends payroll users to these endpoints.)
2. **Portal:** `canViewBranchPayouts`, sidebar entry, `accessMode: 'view'` in `Payouts.tsx`.
   Verify with `npm run build` and by logging in as an OIC, a coordinator, a technician and a payroll member.
3. Optional notification.
4. Update `docs/ASHCOL_SYSTEM_SCOPE.md` (roles / Payouts section).

---

## 5. Decisions needed before building

1. **Who exactly gets the tab** — OIC + manager + branch office members (proposed), or OIC only? Should
   installers ever see their *own* payout (not in this plan)?
2. **What "released" means** — installer fully `COMPLETE` for the week (proposed, matches the green pill), or
   only after the whole week is **closed**? The first shows payouts sooner; the second is stricter.
3. **Remittance Collected** in the footer — hide from branch viewers (proposed) or show?
4. **Held tickets / corrections** — hidden from branch viewers (proposed), or shown read-only so the branch
   knows why an amount is lower?
5. **Deductions detail** (cash advance, damages…) — show the full installer table as payroll sees it
   (proposed, since the request says "their table"), or a trimmed set of columns?
6. **Past weeks** — viewers can browse every earlier released week (proposed), or only the latest N weeks?
7. **View-branches** — a member with extra view-only branches (`viewBranchIds`) sees those branches' payouts
   too (proposed: yes, with a branch picker limited to them), or strictly their home branch?

---

## 6. Implementation notes

Decisions taken (owner's answers; the rest at the proposed defaults):

- **Who gets the tab:** every staff role — branch OIC, manager, office members **and installers**. Installers see
  only their **own** rows; everyone else sees their whole branch.
- **Released** = the installer is fully `COMPLETE` for that week (not "week closed").
- **Remittance** is hidden from viewers: the footer tile, the Remit column, and the value itself (the server
  blanks `actualCollected` for non-payroll callers).
- **Held tickets / corrections** are visible to viewers, read-only.

What was built:

- Backend: `PayrollReleaseFilter` (week rule, release rule, own-row match), `PayrollService.getEntriesFor` /
  `requireManage` / `requireBranchRead`, `PayrollAccessDeniedException` → 403. `PUT /payroll` is now
  payroll-only; `GET /payroll`, `/closures` and `/closures/check` are limited to the caller's own (or view-only)
  branch unless they have payroll access. Tests: `PayrollReleaseFilterTest`, `PayrollBranchViewIntegrationTest`.
- Portal: Payouts link for all staff roles; `viewOnly` in `Payouts.tsx` (no Schedules merge, no sync / settings /
  week summary / close-week, read-only cells, "View only" badge, own scoped branch, URL cannot switch branch).

Known limits:

- Installer own-row matching is by name (full name, nickname, a name word, or a 3+ letter prefix), like the
  roster grouping. Two installers in one branch sharing a first name could see each other's completed rows.
  Distinct nicknames on the accounts avoid it.
- The server groups by the raw name on the row; the roster groups aliases together. If payroll leaves one alias
  pending, the other alias's completed rows still show.
- A member's extra view-only branches are allowed by the server, but the portal has no branch picker for
  viewers yet — they see their home branch.
- Not done: the optional "payout released" notification (3.3) and the scope-doc update.
