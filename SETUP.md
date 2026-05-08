# Capstone Project Setup

This folder hosts three workspaces that work together:

- `Spring API/` — Spring Boot 3.4 backend on `http://localhost:8080`
- `Web Portal/` — Vite + React admin/operator portal
- `Native App/` — Expo (React Native) customer + technician app

## Prerequisites

- JDK 25 (the `Spring API/run-backend.ps1` script auto-detects it from `HKLM\SOFTWARE\JavaSoft\JDK\25.0.2`)
- Node.js LTS + npm
- MySQL 8 running locally on `localhost:3306` with a `root` user (default password in this repo: `ushpons08`)
- Expo CLI for the Native App (`npx expo` is enough)

## First-time database setup

The Spring API uses Flyway with `baseline-version=9`, which means it expects a "post-V9" base schema (legacy users / tickets / branches / notifications) to already exist before it applies V10+. Use the bootstrap helper:

```powershell
cd "Spring API"
./scripts/reset-db.ps1            # prompts before wiping
# or: ./scripts/reset-db.ps1 -Force
```

This drops `ashcol_db`, recreates it with `utf8mb4_unicode_ci` collation, and applies `src/main/resources/db/init/bootstrap.sql` so schema types align with V12's ServiceHub FKs.

## Run order

1. Make sure MySQL is up. If you've never set up the DB on this machine (or want a clean slate), run `Spring API/scripts/reset-db.ps1`.
2. **Spring API**

   ```powershell
   cd "Spring API"
   ./run-backend.ps1
   ```

   On boot, Flyway baselines at V9 and applies V10..V13. Look for `Started BackendApp` and `Tomcat started on port 8080`.

3. **Web Portal**

   ```powershell
   cd "Web Portal"
   npm install            # first time only
   npm run dev
   ```

   App is on `http://localhost:5173`. The local `.env` already points `VITE_API_BASE_URL` at `http://localhost:8080/api`.

4. **Native App** (optional, for mobile)

   ```powershell
   cd "Native App"
   npm install            # first time only
   npx expo start
   ```

   `EXPO_PUBLIC_API_URL` defaults to `http://localhost:8080/api` (works for the Web preview / Android emulator). For Expo Go on a real device, change it to `http://<your-PC-LAN-IP>:8080/api` and add that origin to `CORS_ALLOWED_ORIGINS` in `Spring API/.env` (or `application.properties`).

## Default admin credentials

Created automatically by `V11__portal_admin_ashcol_com_ph.sql`:

- Email: `admin@ashcol.com.ph`
- Password: `ushpons08`

Use these in the Web Portal login screen or any authenticated API request.

## Smoke test

After the backend is up, run the API smoke script:

```powershell
cd "Spring API"
./scripts/verify-servicehub-api.ps1
```

It exercises the inventory and parts endpoints to confirm the ServiceHub schema is healthy.

## Environment files

- `Spring API/.env.example` documents the env vars referenced by `application.properties`.
- `Web Portal/.env.example` and `Native App/.env.example` document client-side vars.

Copy each `.env.example` to `.env` and fill in secrets (Gmail App Password, Gemini API key, etc.). The `.env` files are gitignored.

## Troubleshooting

- "Port 8080 is in use" — `run-backend.ps1` falls back to 8081 in that case. Find the holder with `netstat -ano | findstr :8080` and `Stop-Process -Id <pid> -Force`.
- Flyway migration failure — usually means the DB drifted from the bootstrap baseline. Run `scripts/reset-db.ps1` to start fresh (dev only; you will lose local data).
- Hibernate `Schema-validation` errors at startup — entity columns expected by JPA don't exist in the DB. Either add them via a new Flyway migration (`Vxx__add_<col>.sql`) or, in dev, regenerate via `reset-db.ps1`.
