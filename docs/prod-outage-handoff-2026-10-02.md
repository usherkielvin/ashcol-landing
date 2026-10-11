# Handoff — production instability & pending backend deploy (2026-10-02)

For a model (or person) picking this up cold. Read `docs/ASHCOL_SYSTEM_SCOPE.md` for the architecture and
`docs/expenses-dtr-cashflow-plan.md` (Tasks 1–34) for the Expense Records / DTR work that led here.
Everything below is what was observed on 2026-10-02, not guesses, unless marked **(hypothesis)**.

## 1. Setup in one paragraph

- Portal: React/Vite (this repo), deployed on Vercel at `portal.ashcol.com.ph`. Sibling repo `ashcol-service-api`
  (Spring Boot, `master`) is the backend.
- **Production backend = a Windows PC at the office** (`C:\Users\Server\Documents\ashcol-service-api`):
  `Cloudflare tunnel (cloudflared) -> Caddy :8080 -> live Spring Boot service "AshcolBackend" (NSSM) on :8081`.
  Blue-green deploys use a canary on :8082 (`scripts/redeploy-backend.ps1`, `scripts/backend-bluegreen-lib.ps1`).
- Database = **Supabase Postgres** via the session pooler (host `aws-1-ap-southeast-1.pooler.supabase.com`, port from
  `.env` `SPRING_DATASOURCE_URL`). Prod uses `ddl-auto=validate`, Flyway disabled: schema changes are hand-run SQL.
- The developer PC (`C:\Users\usher\ASHCOL\...`) is a different machine; its local backend uses the `local` profile and a
  local DB, not Supabase. Something auto-commits (and sometimes pushes) in both repos in the background.

## 2. Symptoms seen

1. Portal Expense Records page stuck on the ASHCOL loading screen / "Could not load the expense records" banner.
   Browser console: `api.ashcol.com.ph/api/public/branches` -> **503**, `/api/auth/...` -> **500**,
   `Login Error: Database error: Read timed out`. i.e. the API process was up but its DB calls timed out.
2. From the dev PC at ~14:46 `https://api.ashcol.com.ph/...` did not answer in 30 s (twice); later it answered but in 0.7–5 s
   (the local backend answers in ~45 ms).
3. Server-side deploy failures (see timeline). Canary logs:
   - 15:06: `Schema-validation: wrong column type ... column [id] in table [messages]; found [uuid]` (suspected cause:
     Supabase's own `realtime.messages` table, `id uuid`, is picked up by Hibernate's name lookup).
   - 15:16: `PSQLException: SSL error: Read timed out` right after `HikariPool-1 - Starting...` (TLS handshake to Supabase stalls);
     canary never healthy in 120 s.
4. `git fetch` on the server: `Connection reset by 20.205.243.160 port 443` (GitHub); `git push` from the dev PC also stalled once.

## 3. Timeline (server clock)

| Time | Event |
|---|---|
| 13:29 | Deploy OK at `95d5d67` (canary healthy in ~18 s, swapped in). Live jar = built 11:24. |
| 14:46–14:49 | Public API unreachable from outside; server `git fetch` reset by GitHub. |
| 15:06 | Redeploy at the same commit: canary fails on the `messages` schema validation. |
| 15:15 | `git pull` -> `087d61d` (adds `hibernate.default_schema=public` to prod properties). |
| 15:16 | Canary fails: SSL read timeout to Supabase. |
| 15:21 | Redeploy: canary HEALTHY (so the `default_schema` fix works), Caddy switched to :8082, live service stopped, new jar swapped in, **live :8081 never healthy in 120 s**. |
| 15:23–15:25 | Script "restored previous jar", waited another 120 s, failed, then **stopped the canary while Caddy still pointed at :8082 -> public API = 502 (outage)**. |
| 15:27–15:29 | Manual `nssm restart AshcolBackend` -> :8081 healthy (on the OLD jar); Caddy pointed back to :8081 by hand -> API 200. |
| 15:5x–16:0x | Network diagnosis (section 5). Cloudflare One (WARP) client installed/enabled on the server; reported "speeds up". |

## 4. Current state (as of the last message)

- **Production is up, running the OLD jar** (`ashcol-backend-1.0.0.jar` == `.previous`, 2026-10-02 11:24:53, commit `95d5d67`).
  That jar already contains all backend features (return-as-cash close, reimbursement/cash-return checks, narrower queries,
  `returnedAll`, widened entity). It does **not** contain `hibernate.default_schema=public`.
- The **new jar** (with the schema fix) is built at `target\ashcol-backend-staging.jar` (15:16:39) and passed the canary once.
- Server repo is at `087d61d`. **`7c54b15` (the deploy-script fix) is pushed to GitHub but not yet pulled on the server.**
- Caddyfile (`deploy\caddy\Caddyfile`) points at :8081 again.
- **Unknown:** whether the Supabase SQL `ALTER TABLE report_items ALTER COLUMN resolved_expense_id TYPE varchar(1000);`
  was run. Until it is, a purchase with more than ~7 receipts shows "Too many receipts" / a message naming the SQL file.
- Portal changes (Task 33/34 area) are pushed to `main` (`87ab963`): 25 s/90 s deadlines, error banner + Retry on the
  Expense Records page, refetch-on-focus throttled to once a minute. Production portal picks these up only when Vercel redeploys `main`.

## 5. What the diagnosis showed (server PC)

- Router 0% loss, 8.8.8.8 0% loss; **1.1.1.1 13–30% loss**; ping to github.com ~50% and api.ashcol.com.ph ~55% loss
  (but ping to Cloudflare/GitHub is unreliable; HTTPS to `api.ashcol.com.ph/api/health` from the server: 784, 295, 290, 344, 340 ms).
- Packet loss at every packet size (32 B: 4/20 lost; 1464 B: 3/20; 1452 B: 7/20; 1400 B: 1/20) -> **not an MTU problem**.
  MTU on `Ethernet` was set to 1492 (harmless; revert with `mtu=1500` if desired).
- Supabase DB side is healthy: `pg_stat_activity` showed only idle pooler connections and nothing long-running; the SQL editor responds instantly.
- **(hypothesis)** Globe Fiber's route to some CDNs/destinations (Cloudflare, GitHub, possibly the Supabase pooler path) is lossy or
  stalls large TLS handshakes, intermittently. The Cloudflare tunnel (QUIC/UDP by default) may also suffer; setting cloudflared
  `--protocol http2` was suggested but not tried.
- The GitHub HTTPS timing line from the last test had not been pasted yet.

## 6. Bugs found (not network)

1. **Deploy script bug (fixed, commit `7c54b15`, not yet on server):** in `Invoke-ZeroDowntimeSwap`, when the live service fails on
   the new jar and the rollback's own health wait also times out, the `finally` stopped the canary while Caddy still pointed to it.
   Now: switch Caddy to :8081 if healthy, otherwise leave the canary running and log a WARN.
2. **Portal:** the first Expense Records request had no timeout (fixed: `loadAuditExpensesStrict`, 90 s; branches 25 s; summary feeds 25 s).
3. The `/audit-expenses` endpoint returns every record of every branch (heavy); see plan Task 30 for the not-yet-done improvements.

## 7. Next steps (in order)

1. Re-run the connectivity test on the server (loss/HTTPS) a few times over 10–15 min; need **low loss and no HTTPS FAIL to github.com**.
2. `cd C:\Users\Server\Documents\ashcol-service-api; git pull` (gets `7c54b15`). If GitHub keeps resetting, wait; do not deploy with the old script.
3. `.\scripts\redeploy-backend.ps1` (add `-SkipPull -Force` only if the code is already on disk). Success = `Deploy OK at 7c54b15`.
   On canary failure: `Get-Content logs\canary-8082.log -Tail 80`, look at the `Caused by` lines. Live service stays up on failure.
4. Confirm the widening SQL was run (`SELECT character_maximum_length FROM information_schema.columns WHERE table_name='report_items' AND column_name='resolved_expense_id';` -> 1000).
5. Retry the purchase receipt that said "Too many receipts on this purchase" (Nano tape, branch Taguig Sales).
6. Optional hardening if stalls persist: longer JDBC connect/handshake limits and retry-at-startup in `application-prod.properties`
   (Hikari `initialization-fail-timeout`, pg `connectTimeout`/`socketTimeout`); cloudflared `protocol: http2`; make the Cloudflare One
   client start at boot (production now depends on it if it stays installed on the server).

## 8. Rules that were agreed / learned

- **Do not restart or redeploy the live service during a network incident** unless production is already down; a restart needs fresh
  Supabase handshakes, which is exactly what fails. If prod is down: `nssm restart AshcolBackend`, wait ~90 s, check
  `http://localhost:8081/api/health`, then point Caddy back (`Set-CaddyUpstream ... -UpstreamPort 8081` + `Invoke-CaddyReload`).
- Health checks: `GET /api/health` (200) and `/api/v1/audit-expenses` (403 without a token = up). The portal pages live at
  `/expenses/<branch>`; the API paths are unchanged (`/api/v1/audit-expenses`).
- Never put secrets in chat/docs; DB credentials live only in the server `.env`.
- Ask before: restarting production, running SQL that changes data, pushing to `main`/`master` (the owner has approved pushes case by case).
- The page file is `src/pages/ExpenseRecords.tsx` (renamed from `AuditFinanceExpenses.tsx`), helpers in `src/pages/ExpenseRecords/`.
