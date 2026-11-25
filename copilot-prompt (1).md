Build a small, deployable test project: a user points dashboard with automatic telebirr deposit verification. UI design does not matter (plain HTML forms are fine), but the money logic and security must be correct.

## Stack
- Backend: Node.js (current LTS) with Express
- Database: PostgreSQL with Prisma ORM (latest stable; follow the official setup for the installed major version)
- Schema changes ONLY through Prisma migrations, committed to the repo. Use `prisma migrate dev` locally and `prisma migrate deploy` in production. Never use `prisma db push`
- Frontend: simple HTML + vanilla JavaScript served from `public/`. No frontend framework, no build step
- `bcryptjs` for passwords, `cookie-session` for login, `express-rate-limit`
- Config from `.env`: `PORT`, `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, `SMS_SECRET`, `ADMIN_PASSWORD`, `TELEBIRR_NUMBER`, `TELEBIRR_ACCOUNT_NAME`
- Refuse to start if a required setting is missing (`TEST_DATABASE_URL` is for tests only); `SMS_SECRET` and `SESSION_SECRET` must be 32+ characters
- Include `docker-compose.yml` for a local PostgreSQL with development and test databases

## Database models
- `User`: id, username (unique), passwordHash, fullName, phone (unique), createdAt
- `Payment`: txId (primary key), amountSantim, payerName (nullable), payerLast4 (nullable), paidAt (nullable), userId (nullable), creditedAt (nullable), createdAt. Nullable payer fields are for manually approved payments
- `ManualRequest`: id, userId, txId (no foreign key, the SMS may not exist yet), status (`pending`, `approved`, `rejected`), createdAt, reviewedAt
- `SmsLog`: id, body, parsed, receivedAt
- Add a partial unique index on `ManualRequest(userId, txId)` where status is `pending`, using custom SQL in a migration

## Users
- Sign up with: username, password, full name exactly as on their telebirr account, and telebirr phone number
- Normalise phone numbers to `2519XXXXXXXX` or `2517XXXXXXXX`; each phone is unique
- Login and logout
- Every user starts with 0 points

## Points
- 1 birr deposited = 1 point (1.50 birr = 1.50 points)
- Store money as integers in santim (1 birr = 100 santim). Never use floats for stored amounts or calculations on them; parse the amount string into santim exactly
- A user's points = sum of payments credited to that user (calculate it, don't keep a separate balance)

## Dashboard
- Shows username, current points, and two buttons: Deposit and Withdraw
- Withdraw only shows "Coming soon". No backend for it
- Deposit shows:
  - the telebirr number and account name to send money to
  - a note: "Send from your registered telebirr number. Points are added automatically."
  - an optional field "Points not added? Submit your Transaction ID" (10 letters/digits)
- While the dashboard is open, refresh points every 5 seconds
- Show the user's credited payments and the status of their submitted Transaction IDs

## How payments arrive
An Android SMS forwarder app sends telebirr SMS to `POST /api/telebirr/sms`:
- Header `x-sms-secret` must equal `SMS_SECRET` (compare in constant time), otherwise 401
- Body: `{"from":"%from%","text":"%text%"}`
- Process only if `from === "127"`; otherwise ignore with status 200
- Log every authenticated message from 127 in `SmsLog` with a parsed true/false flag
- Collapse all whitespace to single spaces, trim, then parse with exactly this regex:

```js
/^Dear [^.()]{0,80}? You have received ETB ([\d,]+\.\d{2}) from ([^()]{1,100}?)\s?\(\d{4}\*+(\d{4})\) on (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})\. Your transaction number is ([A-Z0-9]{10})\./
```
Groups: amount, payer name, payer phone last 4, day, month, year, hour, minute, second, transaction ID. The time is Ethiopia time (UTC+3).

Sample message:
```
Dear TEST
You have received ETB 5.00 from Abebe Kebede(2519****0217)  on 19/10/2026 15:54:53. Your transaction number is DJJ928K0V3. Your current E-Money Account balance is ETB 5.00.
Thank you for using telebirr
Ethio telecom
```

## Automatic crediting
- Save each parsed payment in `Payment`; the `txId` primary key means a duplicate SMS can never add points twice. Treat a duplicate as success (status 200)
- Find users whose phone ends with the same last 4 digits AND whose full name matches the payer name (ignore case and extra spaces)
- If exactly ONE user matches, credit the payment to them
- If zero or more than one match, leave it uncredited for manual check. Never guess
- Insert and credit inside one Prisma transaction

## Manual check (Transaction ID)
- A logged-in user may submit a Transaction ID. Uppercase it and save it as a `ManualRequest` with status `pending`
- Submitting NEVER adds points by itself
- If that payment is already credited to this user, say "Already added". If credited to someone else, still just save the request and reveal nothing
- No duplicate pending request for the same user and ID; rate limit this endpoint

## Admin page (`/admin`)
- Protected by `ADMIN_PASSWORD`, with rate-limited login
- Lists pending manual requests next to the matching payment (if the SMS was received), uncredited payments, and unparsed SMS
- Approve:
  - If the payment exists and is uncredited, credit it to the requesting user
  - If no SMS was received, the admin types the amount after checking telebirr history; create the payment with that `txId` and credit it, so a late SMS cannot credit it again
  - If it is already credited, block approval
- Reject: mark the request rejected
- Approval must be atomic and safe under concurrency: in one transaction, credit with a conditional update (`updateMany` where `txId` matches and `userId` is null) and require exactly 1 changed row; change the request only if it is still `pending`; roll back on any failure

## Security
- Use Prisma queries; any raw SQL must be parameterised
- Session cookie: httpOnly, sameSite=lax, secure in production
- Set `trust proxy` correctly for use behind an HTTPS reverse proxy
- Accept only JSON bodies on state-changing endpoints, limited to 10kb
- Escape all user and SMS text on pages (use `textContent`)
- Never log secrets. Add `.env` and `node_modules` to `.gitignore`

## Tests (`node --test`)
Run against `TEST_DATABASE_URL` only. Cover: sample SMS parsing; non-127 sender ignored; wrong secret rejected; duplicate SMS credits once; unique match credits the user; no match or two matches stays uncredited; submitting a Transaction ID adds no points; approval credits once, even when two approvals run at the same time; late SMS after manual approval does not double credit.

## Deliverables
- Working code, Prisma schema and migrations, `.env.example`, `docker-compose.yml`, `package.json` with `start`, `test`, `migrate:dev` and `migrate:deploy` scripts
- `README.md` covering: local run, curl command simulating the SMS webhook, running migrations, deployment on a host with HTTPS and managed PostgreSQL (run `prisma migrate deploy` before start), database backup, and Android SMS forwarder setup (sender `127` only, URL, JSON payload, secret header, battery optimisation off)

Build it step by step, run the tests, and fix any failures before finishing.
