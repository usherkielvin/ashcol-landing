# Member Self-Registration Link — Implementation Plan

Goal: on the Members page, an admin clicks **Copy registration link** and sends the URL to a new hire. The
new hire opens it (no login), fills in a clean page-by-page form — name, nickname, emails, phone, birthdate,
date hired, password — and their own portal account is created as a **Member**. They never pick a role.

Status: **plan only — nothing built.** Section 6 lists the decisions built into this plan; change them before
Phase 1 if any are wrong.

---

## 1. What exists today

| Piece | Where | Today |
|---|---|---|
| Admin creates a member | `Members.tsx` — `handleCreate`, 3-step modal (`CREATE_STEPS`) | Admin types everything. `POST /admin/technicians` then `PATCH /admin/users/{id}` for phone, personal email, dates. Backend generates a temporary password and emails it. |
| "Member" role | `ROLE_META.EMPLOYEE` (label `Member`) | Backend role `EMPLOYEE`. Needs a branch and at least one job title (`AdminService.validateRolePlacement`). |
| Public sign-up page | `pages/CreateAccount.tsx` at `/create-account` | For **customers** only. `AuthService.register` rejects any role other than `customer`. Uses an emailed 6-digit code (`/auth/send-signup-code`). |
| Tokenized public link | `pages/PayoutShare.tsx` at `/payout/:token`, `PublicPayoutController`, `PayoutShareService`, `payout_share_links` | Working pattern: random 32-byte token, expiry, revoke, per-IP rate limit, one generic 404. |
| Public-path handling | `AuthContext.tsx` (`isPayoutSharePath`), `main.tsx:65` | `/payout/` is exempt from the "stale token → bounce to /login" logic. A new public route needs the same exemption. |
| Public endpoints | `SecurityConfig` — `/api/public/**` is `permitAll` | No change needed for a new `/api/public/...` endpoint. |

Why `/create-account` cannot be reused: it creates customers, and the backend refuses any other role on that
endpoint — correctly, since it is open to the whole internet. A staff account must only be creatable by
someone holding a link an admin issued.

---

## 2. Target behaviour

### 2.1 Admin (Members page)
- Next to **Add Member**: a **Registration link** button (admins only, same `isAdmin` gate).
- Opens a small popover:
  - **Branch** (required) — the branch new members from this link are placed in.
  - **Expires** — 7 days (default), 1 day, 30 days.
  - **Copy link** → creates (or reuses the active link for that branch) and copies it.
    Toast: *"Link copied — expires Oct 17."*
  - Active links list: branch, expiry, times used, **Revoke**, **New link** (revokes the old one).
- New sign-ups appear in the member list with a **Pending** pill and float to the top. Clicking one opens the
  normal edit modal with an **Approve** action — the admin confirms branch and sets access tags there.

### 2.2 New member (public page)
- URL: `https://<portal host>/join/<token>` — outside `DashboardLayout`, no sidebar, no login.
- Reuses the Login / CreateAccount split layout (branding panel left, form right, theme toggle) so it feels
  like the same product. Header shows *"Joining ASHCOL — <Branch name>"*.
- One question group per page, with a progress bar, Back / Continue, Enter to advance, slide transition:

| # | Page | Fields |
|---|---|---|
| 1 | Who you are | Full name · Nickname |
| 2 | How to reach you | Login email · Personal email (optional, "same as login" toggle) · Phone |
| 3 | Dates | Birthdate · Date hired (optional) |
| 4 | Secure your account | Password · Confirm password (show/hide, strength hint) |
| 5 | Verify email | 6-digit code sent to the login email (existing `/auth/send-signup-code`) |
| 6 | Review | Read-only summary with an Edit link per section → **Create my account** |
| ✓ | Done | *"You're registered. An admin will activate your account — you'll get an email when you can log in."* + link to `/login` |

- Per-page validation only (cannot advance with an invalid page); errors inline under the field.
- Progress is kept in `sessionStorage` (password excluded) so a refresh on a phone does not lose the form.
- No role, branch, job-title or access-tag input anywhere on the page.
- Expired / revoked / unknown link: *"This registration link is no longer active. Ask your admin for a new one."*

### 2.3 What the link can never do
- Create anything other than role `EMPLOYEE` — the role is not read from the request at all.
- Choose a branch — it comes from the link record, server-side.
- Grant portal access on its own — the account starts **inactive** until an admin approves it.

---

## 3. Design

### 3.1 Data model (`ashcol-service-api`)

New table `member_invite_links` — next free Flyway version (**V166** at the time of writing).

| Column | Notes |
|---|---|
| `id` | UUID primary key |
| `token` | 32 random bytes, base64url, unique index. The only secret. |
| `branch_id` | Branch new members are placed in (stored via `BranchIdNormalizer`) |
| `created_by`, `created_at` | Admin who issued it |
| `expires_at` | Default 7 days |
| `revoked_at`, `revoked_by` | Null while active |
| `use_count`, `last_used_at` | For the admin popover |
| `max_uses` | Nullable; null = unlimited until expiry |

`users` gets one column: `invite_link_id` (nullable) — audit trail of which link created the account, and how
the Members page knows a row is a pending self-registration (`invite_link_id` set and `is_active = false`).

### 3.2 Backend endpoints

Admin (JWT, admin-only — same guard as `/admin/technicians`):
- `POST /api/admin/member-invites` `{ branchId, expiresInDays }` → link (reuses the active one for that branch)
- `GET /api/admin/member-invites` → active links
- `POST /api/admin/member-invites/{id}/revoke`
- `POST /api/admin/users/{id}/approve` → sets `is_active = true`, sends the "you can log in now" email

Public (`/api/public/**`, rate-limited per IP like `PublicPayoutController`):
- `GET /api/public/member-invites/{token}` → `{ branchName, expiresAt }` or a generic 404
- `POST /api/public/member-invites/{token}/register`
  `{ name, nickname, email, personalEmail, phone, birthDate, dateHired, password, verificationCode }`
  - Validates the token, the signup code (`SignupVerificationService`), unique email, password rules.
  - Creates the user: role `EMPLOYEE` (hard-coded), `branchId` from the link, `jobTitle = "TECHNICIAN"`
    as a placeholder so `validateRolePlacement` passes, `isActive = false`, `inviteLinkId` set.
  - Returns **no JWT** — the account cannot log in until approved.
  - Notifies admins (existing notification service) that a member is waiting for approval.

New service `MemberInviteService`, modelled on `PayoutShareService` (token generation, resolve, revoke).

### 3.3 Frontend (`ashcol-web-portal`)

- `src/pages/JoinTeam.tsx` — the public wizard. Step subcomponents at module level.
- `src/utils/memberInviteApi.ts` — the admin + public calls (keeps `api.ts` from growing).
- `src/components/directory/RegistrationLinkPopover.tsx` — the admin popover.
- `App.tsx` — `<Route path="/join/:token" element={<JoinTeam />} />` beside `/payout/:token`.
- `AuthContext.tsx` + `main.tsx` — treat `/join/` as public, same as `/payout/`.
- `Members.tsx` — the button, the Pending pill/sort, and Approve in the edit modal.

### 3.4 Safety
- Token is unguessable (256 bits) and the public endpoints are rate-limited per IP.
- Email ownership is proven by the 6-digit code before the account exists.
- Accounts start inactive; a leaked link yields only pending rows an admin can delete.
- Revoke works instantly; expiry is enforced server-side on every call.
- Responses carry `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.

---

## 4. Phases

### Phase 1 — Backend: links + public registration
- [x] `V166__create_member_invite_links.sql` (table + `users.invite_link_id`)
- [x] `MemberInviteLink` entity + repository
- [x] `MemberInviteService` (create/reuse, list, revoke, resolve, register)
- [x] Admin endpoints (create, list, revoke) and `POST /admin/users/{id}/approve`
- [x] `PublicMemberInviteController` (GET resolve, POST register) with rate limiting
- [x] Expose `inviteLinkId` / pending flag on `UserResponse`
- [x] Admin notification + approval email
- [x] Gate: backend compiles (live endpoint test still pending — needs the backend running)

### Phase 2 — Public wizard page
- [x] `memberInviteApi.ts` (public calls)
- [x] `JoinTeam.tsx` — layout, progress bar, six pages + done screen, per-page validation
- [x] `sessionStorage` draft (no password), inactive-link screen
- [x] Route in `App.tsx`; `/join/` public in `AuthContext.tsx` and `main.tsx`
- [x] Gate: typecheck, lint vs baseline, browser preview at desktop + phone widths, light + dark

### Phase 3 — Admin UI on Members
- [x] `RegistrationLinkPopover.tsx` (branch, expiry, copy, active links, revoke, new link)
- [x] **Registration link** button beside Add Member
- [x] Pending pill + sort-to-top; Approve action in the edit modal
- [x] Gate: typecheck, lint vs baseline, full flow in the browser (copy link → register → approve → log in)

### Phase 4 — Docs
- [x] Add the flow to `docs/ASHCOL_SYSTEM_SCOPE.md` (§5.5 public / auth surfaces)

---

## 5. Files touched

Portal: `src/pages/JoinTeam.tsx` (new), `src/utils/memberInviteApi.ts` (new),
`src/components/directory/RegistrationLinkPopover.tsx` (new), `src/App.tsx`, `src/contexts/AuthContext.tsx`,
`src/main.tsx`, `src/pages/Members.tsx`, `docs/ASHCOL_SYSTEM_SCOPE.md`.

Backend: migration V166, `MemberInviteLink`, `MemberInviteLinkRepository`, `MemberInviteService`,
`PublicMemberInviteController`, `AdminController`, `AdminService`, `User`, `UserResponse`, `EmailService`.

---

## 6. Decisions built into this plan

| # | Decision | Chosen | Alternative |
|---|---|---|---|
| 1 | Can a self-registered account log in right away? | **No — pending until an admin approves** | Active immediately (faster, but anyone holding the link gets portal access) |
| 2 | Branch | **Set by the admin on the link** | New member picks from a branch list |
| 3 | Link reuse | **Many people, one link per branch, 7-day expiry** | Single-use link per person |
| 4 | Password | **Member sets their own + email code** | Emailed temporary password, as in admin-create |
| 5 | Access tags | **Placeholder `TECHNICIAN`; admin sets the real ones at approval** | New member picks their job |
| 6 | Who can issue links | **Admins only** | Also Officers In Charge, locked to their own branch |
| 7 | Profile photo | **Not in the form** (added later from Profile) | Optional upload page |
