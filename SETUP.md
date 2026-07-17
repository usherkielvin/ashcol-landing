# Capstone Project Setup

This folder hosts three workspaces that work together:

- `ashcol-service-api/` — Spring Boot 3.4 backend on `http://localhost:8080`
- `ashcol-web-portal/` — Vite + React admin/operator portal
- `ashcol-mobile-app/` — Expo (React Native) customer + technician app

## Prerequisites

- JDK 25 (the `ashcol-service-api/run-backend.ps1` script auto-detects it from `HKLM\SOFTWARE\JavaSoft\JDK\25.0.2`)
- Node.js LTS + npm
- MySQL 8 running locally on `localhost:3306` with a `root` user (default password in this repo: `ushpons08`)
- Expo CLI for the Native App (`npx expo` is enough)

## First-time database setup

The Spring API uses Flyway with `baseline-version=9`, which means it expects a "post-V9" base schema (legacy users / tickets / branches / notifications) to already exist before it applies V10+. Use the bootstrap helper:

```powershell
cd ashcol-service-api
./scripts/reset-db.ps1            # prompts before wiping
# or: ./scripts/reset-db.ps1 -Force
```

This drops `ashcol_db`, recreates it with `utf8mb4_unicode_ci` collation, and applies `src/main/resources/db/init/bootstrap.sql` so schema types align with V12's ServiceHub FKs, then runs every Flyway migration above the V9 baseline (V10 through whatever is newest — check `src/main/resources/db/migration/` for the current top version).

Note: this script backs up any existing table data (`mysqldump`) before wiping and restores it after re-migrating, so re-running it is **not** a guaranteed clean slate — see Troubleshooting below.

## Run order

1. Make sure MySQL is up. If you've never set up the DB on this machine (or want a clean slate), run `ashcol-service-api/scripts/reset-db.ps1`.
2. **Spring API**

   ```powershell
   cd ashcol-service-api
   ./run-backend.ps1
   ```

   On boot, Flyway baselines at V9 and applies every migration above it. Look for `Started BackendApp` and `Tomcat started on port 8080`.

3. **Web Portal**

   ```powershell
   cd ashcol-web-portal
   npm install            # first time only
   npm run dev
   ```

   App is on `http://localhost:5173`. Copy `.env.example` to `.env` — leave `VITE_API_BASE_URL` unset (or set it to `http://localhost:8080/api`) so it points at your local backend. Do **not** uncomment the production URL in `.env.example`, or local dev will silently talk to the live production API instead of your local Spring instance.

4. **Native App** (optional, for mobile)

   ```powershell
   cd ashcol-mobile-app
   npm install            # first time only
   npx expo start
   ```

   `EXPO_PUBLIC_API_URL` defaults to `http://localhost:8080/api` (works for the Web preview / Android emulator). For Expo Go on a real device, change it to `http://<your-PC-LAN-IP>:8080/api` and add that origin to `CORS_ALLOWED_ORIGINS` in `ashcol-service-api/.env` (or `application.properties`).

## Default admin credentials

Created automatically by `V11__portal_admin_ashcol_com_ph.sql`:

- Email: `admin@ashcol.com.ph`
- Password: `ushpons08`

Use these in the Web Portal login screen or any authenticated API request.

## Smoke test

After the backend is up, run the API smoke script:

```powershell
cd ashcol-service-api
./scripts/verify-servicehub-api.ps1
```

It exercises the inventory and parts endpoints to confirm the ServiceHub schema is healthy.

## Environment files

- `ashcol-service-api/.env.example` documents the env vars referenced by `application.properties`.
- `ashcol-web-portal/.env.example` and `ashcol-mobile-app/.env.example` document client-side vars.

Copy each `.env.example` to `.env` and fill in secrets (Gmail App Password, Gemini API key, etc.). The `.env` files are gitignored — never commit real secrets into a tracked `application*.properties` file; use `application-local.properties` (also gitignored) or env vars instead.

## Troubleshooting

- "Port 8080 is in use" — `run-backend.ps1` has no automatic fallback; `server.port` is fixed at `8080` (overridable via the `PORT` env var). Find the holder with `netstat -ano | findstr :8080` and `Stop-Process -Id <pid> -Force`, or set `PORT=8081` in `ashcol-service-api/.env` and update the portal/mobile API base URLs to match.
- Flyway migration failure — usually means the DB drifted from the bootstrap baseline. Run `scripts/reset-db.ps1` (dev only). Note it restores your prior data by default (see above) — if the drift/corruption lives in that data itself, pass `-Force` and additionally delete `db_backup.sql` in `ashcol-service-api/` beforehand, or truncate the offending tables manually after reset, to get a genuinely empty schema.
- Hibernate `Schema-validation` errors at startup — entity columns expected by JPA don't exist in the DB. Either add them via a new Flyway migration (`Vxx__add_<col>.sql`) or, in dev, regenerate via `reset-db.ps1`.
