# Telebirr Points Dashboard

A small Express and PostgreSQL test project for crediting points from Telebirr SMS confirmations. Money is stored as integer santim; a credited user's points are calculated from their credited payments.

## Requirements

- Node.js 24 or newer and npm
- Docker Compose, or a PostgreSQL server with separate development and test databases

## Local setup

1. Copy `.env.example` to `.env`. Set strong, unique values for `SESSION_SECRET`, `SMS_SECRET` (at least 32 characters each), and `ADMIN_PASSWORD` (at least 12 characters). Set your receiving Telebirr number and account name. For local development, the app also accepts `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` instead of `DATABASE_URL`; tests still require a separate `TEST_DATABASE_URL`.
2. Start PostgreSQL:

   ```sh
   docker compose up -d postgres
   ```

   The compose service creates `telebirr_development` and `telebirr_test`. The test database is disposable and must not contain production data.
3. Install dependencies and apply the development migration:

   ```sh
   npm install
   npm run migrate
   ```

4. Start the server:

   ```sh
   npm start
   ```

Open `http://localhost:3000`. The admin interface is at `http://localhost:3000/admin`.

Schema changes are made only through committed files in `migrations/`; do not call `sequelize.sync()`.

## Test

Tests and their migration command select **only** `TEST_DATABASE_URL`. Ensure it points to a disposable test database before running:

```sh
npm test
```

The test runner applies migrations to that database and clears its application tables between cases. It does not use `DATABASE_URL`.

## Simulate a Telebirr SMS

Replace the header secret with your local `SMS_SECRET`:

```sh
curl -X POST http://localhost:3000/api/telebirr/sms \
  -H "Content-Type: application/json" \
  -H "x-sms-secret: replace-this-with-another-32-character-secret" \
  -d '{"from":"127","text":"Dear TEST\nYou have received ETB 5.00 from Abebe Kebede(2519****0217) on 19/10/2026 15:54:53. Your transaction number is DJJ928K0V3."}'
```

The webhook processes only messages whose sender is exactly `127`. A valid message is credited only when the payer's last four phone digits and normalized full name identify exactly one account. Duplicate transaction IDs are harmless.

## Deployment

Use a host with HTTPS and a managed PostgreSQL database. Configure all runtime environment variables on the host; keep secrets out of source control. Configure the service to trust exactly one HTTPS reverse proxy (the app's production setting assumes one proxy hop). Set `DATABASE_URL` to the production database, then apply committed migrations **before starting the app**:

```sh
NODE_ENV=production npm run migrate
NODE_ENV=production npm start
```

On PowerShell, set `$env:NODE_ENV = "production"` before running those commands. `TEST_DATABASE_URL` is used only by tests.

Back up PostgreSQL regularly and verify restoration. For example, from a secured machine with PostgreSQL client tools:

```sh
pg_dump "$DATABASE_URL" --format=custom --file=telebirr-backup.dump
pg_restore --list telebirr-backup.dump
```

Store backups encrypted with access controls and an off-host retention policy. Never place production credentials or backup files in this repository.

## Android SMS forwarder

Configure the Android SMS forwarder to:

- Forward SMS only when the sender is exactly `127`.
- Send an HTTP `POST` to `https://YOUR-DOMAIN/api/telebirr/sms`.
- Use `Content-Type: application/json`.
- Send JSON shaped as `{"from":"%from%","text":"%text%"}`.
- Add the header `x-sms-secret` with the exact `SMS_SECRET` configured on the server.
- Disable battery optimization for the forwarder and allow it to run in the background.

Keep the webhook URL on HTTPS. Do not share the secret with unrelated apps or put it in screenshots or logs.
