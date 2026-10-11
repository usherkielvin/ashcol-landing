# Payout Completion Email — Implementation Plan

Goal: when payroll verifies and completes a technician's weekly payout, the technician automatically gets a
clean email at the **personal email saved on their account**. The email shows the payout summary and a button
that opens the full read-only payout page.

Status: **Phases 1 (backend) and 2 (portal) built.** Section 6 was built with the proposed defaults (user said "build this"). Phase 3 partly done: docs + offline render check done; real SMTP send, Gmail/Android check and prod deploy are manual steps (checklist below).

Assumption to confirm: "from the personal email attached on each tech account" is read as *the recipient
address comes from the tech's account*. The sender stays the company mailbox (`ASHCOL <MAIL_USERNAME>`), the
same one that sends password resets and welcome emails.

---

## 1. What exists today

| Piece | Where | Today |
|---|---|---|
| "Verify and complete" | `CompletePayoutModal.tsx` → `Payouts.tsx` `onComplete` → `updateInstallerRows` | Sets every row of that installer-week to `status: 'COMPLETE'` with `audited` + `remarks`, then autosaves 1.5 s later through `PUT /api/v1/payroll`. There is **no server-side "complete" action** — the server only sees a saved sheet. |
| Full-details page | `/payout/<token>` (`PayoutShare.tsx`), `PayoutShareService`, `GET /api/public/payout-shares/{token}` | Built (see `docs/payouts-share-link-plan.md`). Read-only, no login, one installer + one week, 14-day expiry, revocable. Shows **Completed** once every counted row is `COMPLETE`. |
| Link creation | `POST /api/v1/payroll/share-links` → `PayoutShareService.createOrGet` | Idempotent per installer-week. Payroll copies the URL by hand today. |
| Tech's personal email | `users.personal_email` (`User.personalEmail`) | Edited in Employees / Profile. The employee list payroll already loads (`fetchCachedEmployees`) returns it, but `Payouts.tsx` does not keep it. |
| Installer ↔ account | `Payouts.tsx` `resolveInstallerIdentity` / `branchTechnicians` | Payroll rows carry short names ("MARK"); the browser resolves them to an account (`id`, `name`, `nickname`). The server has only loose name matching (`PayrollReleaseFilter.isOwnRow`). |
| Net payout maths | `payrollDerive.ts` (`rowTotal`, `payFactor`, `deductionTotal`), `installerNet` in `Payouts.tsx` | Browser only. The server never computes gross, deductions or net. |
| Email sending | `EmailService.sendHtmlEmail` + `buildPremiumHtmlTemplate` (`ashcol-service-api`) | Gmail SMTP, green ASHCOL header shell. Sends HTML only, concatenates values **without HTML-escaping**, no SMTP timeouts configured, and throws on prod when mail is not configured. |

---

## 2. Target behaviour

### 2.1 Payroll (portal)
- The **Finalize Payout** modal gains one line under the sign-off: *"Payout email will be sent to
  j•••••@gmail.com"* with a checkbox **Email payout to technician** (on by default).
- No personal email on the account, or the installer does not resolve to an account: the line becomes a
  warning — *"No personal email on this account. Add one in Employees to send the payout email."* Completing
  still works; nothing is sent.
- On **Confirm & Finalize**: the table is saved immediately (not after the 1.5 s debounce), then the email is
  sent. Toast: *"Payout completed — emailed to j•••••@gmail.com."* A send failure never undoes the completion;
  the toast says the email failed and offers **Retry**.
- Roster row and installer table header show the email state for the week: **Emailed Oct 5**, **Email
  failed**, or **No email on file**.
- The share-link options panel (`ShareLinkButton`) gets **Email to technician / Resend email** and a
  *"Last emailed Oct 5, 3:12 PM"* line.
- Sent automatically **once** per installer-week. Revert to Pending → complete again does not auto-send a
  second time; the modal instead offers **Email updated payout** (on by default only when the net changed).

### 2.2 Technician (email)
- **Subject:** `Your ASHCOL payout for Sep 29 – Oct 5 is ready` (no amount in the subject — it shows on lock
  screens).
- **Body**, top to bottom:
  1. Greeting: *Hi Mark,* — *Your payout for this week has been verified and completed by payroll.*
  2. Summary card: **Week**, **Branch**, **Jobs completed** (count + breakdown, e.g. `6 · 4 install, 2 repair`),
     **Gross pay**, each **deduction** line with a value (cash advance, late, uniform, damages…),
     **Net payout** (largest text on the page), **Verified by** and date.
  3. Payroll remarks, only when there are any.
  4. One button: **View full payout details** → `https://portal.ashcol.com.ph/payout/<token>`, plus the same
     URL as plain text underneath.
  5. Small print: link expires on `<date>`, it is personal — do not forward, ask payroll or the branch office
     about any discrepancy, automated email — do not reply.
- Works in Gmail web and Gmail mobile (what techs use): table layout, inline styles, 600 px max width, readable
  at 360 px, no external images or fonts. A plain-text alternative part is included.

### 2.3 What the email never contains
- Other technicians' data, remittance collected, internal correction history — the same exclusions as the
  share page.
- The per-ticket rows. Those stay behind the link, so a corrected row is corrected everywhere.

---

## 3. Design

### 3.1 Trigger: explicit send from the portal, verified by the server
The portal calls a new endpoint right after the completion save succeeds. The server does not try to detect
"became COMPLETE" inside `replaceEntries`, because that call replaces a whole month, re-fires on every
autosave, and has no idea which rows form one technician or which account they belong to.

The server still checks the claim: it refuses to send unless every counted row of that installer-week is
`COMPLETE` in the database (the rule `PayoutShareService.buildView` already uses for the **Completed** pill).

### 3.2 Backend (`ashcol-service-api`)

New table `payout_email_log` — Flyway `V160__create_payout_email_log.sql` **and** a matching
`scripts/postgres/` script (Flyway is off on prod).

| Column | Notes |
|---|---|
| `id` | UUID primary key |
| `branch_id`, `installer_label`, `week_from`, `week_to` | The installer-week, same keys as `payout_share_links` |
| `user_id` | The technician account the email was addressed to |
| `to_email` | Address used at send time (kept so a later profile edit does not rewrite history) |
| `share_link_id` | Link included in the email |
| `net_payout`, `summary_json` | Exactly what the email showed |
| `status` | `SENT`, `FAILED`, `SKIPPED_NO_EMAIL` |
| `error` | Short failure reason, null otherwise |
| `sent_by`, `sent_at` | Payroll user and time |

Endpoints, payroll-only (`payrollService.requireManage`), in `PayrollController`:

| Method | Path | Does |
|---|---|---|
| `POST` | `/api/v1/payroll/payout-emails` | Body `{ branchId, weekFrom, weekTo, installerNames[], installerLabel, technicianUserId, summary, resend }`. Returns `{ status, maskedEmail, sentAt, linkExpiresAt }` where status is `SENT`, `ALREADY_SENT`, `SKIPPED_NO_EMAIL` or `FAILED`. |
| `GET` | `/api/v1/payroll/payout-emails?branchId&weekFrom` | Latest log entry per installer for the week, so the roster can show the state. |

`summary` = `{ jobCount, jobBreakdown, grossPay, deductions[{label, amount}], netPayout, verifiedBy, remarks }`.
It comes from the browser because that is the only place the pay maths exists; it is stored in the log.

`PayoutEmailService.send(...)`:
1. `requireManage`; validate the week exactly as `createOrGet` does.
2. Load the user by `technicianUserId`. **The address is read from `users.personal_email` on the server —
   never taken from the request.**
3. Guard against a wrong account: at least one row of the installer-week must pass
   `PayrollReleaseFilter.isOwnRow(row, user)`. Otherwise reject with `400`.
4. Reject with `409` if the installer-week is not fully `COMPLETE`.
5. Blank or malformed personal email → log `SKIPPED_NO_EMAIL`, return it. No fallback to the work email
   (decision 2).
6. A `SENT` entry already exists and `resend` is false → return `ALREADY_SENT`.
7. `payoutShareService.createOrGet(...)` for the link; URL built from `app.portal.base-url`, not from the
   browser's origin, so an email sent from a preview deployment still points at the real portal.
8. Build and send; log `SENT` or `FAILED`. A mail failure is returned as `FAILED` with a readable message, not
   a 500.

`EmailService` changes:
- New `sendPayoutCompletedEmail(...)` that renders the summary card inside the existing
  `buildPremiumHtmlTemplate` shell (same green header as other ASHCOL emails).
- HTML-escape every value (`HtmlUtils.htmlEscape`) — names and remarks are free text typed by staff.
- Add a plain-text part (`helper.setText(plain, html)`).
- Add `spring.mail.properties.mail.smtp.connectiontimeout/timeout/writetimeout` (10 s) to
  `application.properties.example` and the prod profiles; JavaMail's default is to wait forever, and this
  send runs inside a request.
- Never log the token or the full address; logs use the masked form.

### 3.3 Portal (`ashcol-web-portal`)
1. `src/utils/payoutShareApi.ts` — `sendPayoutEmail(req)`, `listPayoutEmails(branchId, weekFrom)` and their
   types.
2. `Payouts.tsx` —
   - keep `personalEmail` in the `branchTechnicians` mapping;
   - a module-level helper that builds `summary` from one installer's rows using the existing `installerNet`,
     `completedJobsCount`, `completedJobsBreakdown` and the deduction helpers, so the email shows the same
     numbers as the modal;
   - `onComplete`: apply the COMPLETE patch, `flushSave` now, then `sendPayoutEmail` when the checkbox is on;
   - load `listPayoutEmails` beside `refreshShareLinks` and pass the state to the roster and header.
3. `CompletePayoutModal.tsx` — recipient line, checkbox, no-email warning; `onComplete` gains a `sendEmail`
   flag. Props only; no data fetching inside the modal.
4. `ShareLinkButton.tsx` — **Email to technician / Resend email** action and the last-emailed line.
5. New small pieces (status chip) live in `src/pages/Payouts/` at module level, not inside `Payouts()`.

### 3.4 Safety
- Pay data now lands in a personal inbox. The email carries the summary; the detail stays behind a link that
  expires in 14 days and can be revoked from the portal.
- Recipient is always the server-side `personal_email` of an account that matches the rows by name — a client
  bug cannot redirect someone's pay details to an arbitrary address.
- One automatic send per installer-week; resend is a deliberate click and is logged with the sender.
- Remaining risk, stated plainly: a wrong or shared personal email on an account sends that tech's payout to
  the wrong person. The modal shows the masked address before sending for that reason.

### 3.5 Tests
Backend, new `PayoutEmailIntegrationTest` with `JavaMailSender` mocked:
- sends to `personal_email`; request cannot override the address;
- `SKIPPED_NO_EMAIL` when blank; `409` when a row is still `PENDING`; `400` when the account does not match
  the rows; non-payroll caller is refused;
- second call returns `ALREADY_SENT`; `resend: true` sends again;
- the message contains the link built from `app.portal.base-url`, and a name with `<` / `&` is escaped.

Baseline note: `.\mvnw test` currently has 7 failing tests unrelated to payroll (`BookingServiceTest`,
`TicketImportIntegrationTest`, `DailyServiceReportIntegrationTest`, `ScheduleTicketIntegrationTest`,
`ServiceHubIntegrationTest`). Judge this work by the payroll test classes, not a green full run.

Portal has no test runner: `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` against the known baseline,
and the browser.

---

## 4. Rollout

- [x] **Phase 1 — Backend** (`ashcol-service-api`): `V160` migration + `scripts/postgres` script,
  `PayoutEmailLog` entity/repository, `PayoutEmailService`, `EmailService.sendPayoutCompletedEmail` (escaped
  HTML + plain text), SMTP timeouts, the two endpoints, `PayoutEmailIntegrationTest`.
  Gate: `.\mvnw test-compile`, then
  `.\mvnw test "-Dtest=PayoutEmailIntegrationTest,PayoutShareLinkIntegrationTest,PayrollReleaseFilterTest"`.
  Safe alone — nothing calls it yet.
  Done: gate passed (29 tests green across the 4 payroll classes). The Postgres script is
  `scripts/postgres/create_payout_email_log.sql` — **run it on Supabase before deploying this build** (prod is
  `ddl-auto=validate` and will not start without the table).
- [x] **Phase 2 — Portal**: API helpers, summary builder, `CompletePayoutModal` recipient line + checkbox,
  `onComplete` save-then-send, roster/header email state, resend action in `ShareLinkButton`.
  Gate: typecheck + lint + browser check of the modal and roster against a mock API.
  Done: `tsc` clean, lint clean on every new/changed small file (Payouts.tsx unchanged baseline noise), and
  browser-checked against a throwaway mock API: finalize saves first then sends (summary net matched the
  modal, no address in the request), roster + header chip, no-email warning, re-completion default, failure
  toast + Retry, Resend from the link panel. Also added `lastSentNet` to the status endpoint (backend) so the
  modal can default "Email updated payout" only when the net changed.
- [ ] **Phase 3 — Real-world check** (partly done; the rest needs mail credentials and the server PC)
  - [x] Rendered the real email HTML offline and viewed it at 600px and 360px; `PayoutEmailIntegrationTest` updated
    for the "Payout Certificate" redesign of `PayoutEmailTemplate.java` (29 tests green across the 4 payroll classes).
  - [x] Email layout follows the approved "Payout Certificate" mockup: plain white card (no green header band), greeting + intro above, full name and net side by side as floats that stack on narrow phones; checked at 600px and 360px, nothing clipped.
  - [ ] Local backend with real SMTP (`MAIL_USERNAME` / `MAIL_PASSWORD` = Gmail app password), complete a payout
    in the portal, send to a test inbox you own; read it in Gmail web and Gmail on Android; open the link;
    confirm the email's net equals the portal's.
  - [ ] Server PC: run `scripts/postgres/create_payout_email_log.sql` in Supabase **first** (prod is
    `ddl-auto=validate`), confirm `MAIL_USERNAME` / `MAIL_PASSWORD` are set in the `AshcolBackend` service, then
    redeploy with `scripts/redeploy-backend.ps1` (a jar rebuild is required).
- [x] Update `docs/ASHCOL_SYSTEM_SCOPE.md` (Payouts row) and the rollout list in `docs/payouts-share-link-plan.md`.

Rough size: backend about a day, portal about a day, real-world check half a day.

---

## 5. Out of scope

- SMS, Messenger or push notifications for payouts.
- Emailing a whole branch or a weekly digest to managers.
- A PDF attachment of the payout sheet.
- Sending from each staff member's own mailbox.
- Moving the pay maths to the server.

---

## 6. Decisions needed before building

1. **Trigger** — per technician, when payroll clicks *Confirm & Finalize* in the completion modal (proposed),
   or once for everyone when the branch week is **closed**?
2. **No personal email** — send nothing and warn payroll (proposed), or fall back to the account's login email?
3. **Amounts in the email** — full summary with gross, deductions and net (proposed), net only, or no amounts
   at all (just "your payout is ready" + link)?
4. **Auto or opt-in** — checkbox on by default so it sends unless payroll unticks it (proposed), or off by
   default?
5. **Re-completed payouts** — no automatic second email; payroll chooses **Email updated payout** (proposed),
   or always email again when the net changed?
6. **Link lifetime in the email** — keep the current 14 days (proposed), or longer for emailed links?
7. **Sender name / reply-to** — `ASHCOL` from the company mailbox with "do not reply" (proposed), or a reply-to
   pointing at a payroll address?
