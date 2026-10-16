<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
Scope: Wrote this API reference from the refactored code (controllers, DTOs, common/validation/fields.ts, services).
       2026-10-16: updated paths after the rename to user-service/.
Author review: Successfully reviewed by Deanson, 2026-10-16.
-->

# User Service — API reference

**Base URL:** `http://localhost:3001` when the service runs from `user-service/compose.yaml`
(`USER_PORT=3001`). In the full stack, the API Gateway on `http://localhost:3003` forwards the same
paths to this service.

All request and response bodies are JSON (`Content-Type: application/json`). Field names are camelCase.

## Contents
- [Authentication](#authentication)
- [Errors](#errors)
- [Field rules](#field-rules)
- [Limits](#limits)
- [Endpoints](#endpoints): [Public](#public) · [Auth](#auth) · [Profile `/users/me`](#profile-usersme) · [Admin `/admin/users`](#admin-adminusers)
- [Manual testing with Postman](#manual-testing-with-postman)

---

## Authentication

- Every route needs `Authorization: Bearer <accessToken>` **except** the ones marked **Public**.
- **Access token:** RS256 JWT, valid 15 minutes (`expiresIn: 900`). Payload: `{ sub: userId, role: "USER" | "ADMIN", iat, exp }`.
  Other services verify it with the public key from `GET /.well-known/jwks.json`.
- **Refresh token:** an opaque string, valid 90 days, **single-use**. Each `POST /auth/refresh` returns a new
  one and revokes the old. Presenting a used token again ends **every** session of that user.
- Password change, password reset and deactivation revoke every refresh token of the user.
- Roles: `USER` and `ADMIN`. `/admin/*` routes need `ADMIN`. The role in a token can be up to 15 minutes
  stale; role changes and reactivation re-check the caller's role in the database.

| Situation | Status | `error.code` | `error.message` |
|---|---|---|---|
| No `Authorization: Bearer …` header | 401 | `TOKEN_INVALID` | A bearer token is required. |
| Expired, altered or foreign token | 401 | `TOKEN_INVALID` | The token is invalid or has expired. |
| `USER` calls an `/admin/*` route | 403 | `FORBIDDEN` | This action requires the ADMIN role. |

## Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": { "fields": [{ "field": "email", "message": "must be an NUS address (@u.nus.edu or @nus.edu.sg)" }] }
  }
}
```

`details` is present only when there is something to add. The frontend should switch on `code`, never on `message`.

| Status | `code` | When | `details` |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or query fails its rules; unknown field; malformed `:userId`; new password equals the current one | `fields: [{field, message}]` for field errors |
| 400 | `OTP_INVALID` | Wrong code | `attemptsRemaining` |
| 400 | `OTP_EXPIRED` | No code, code expired, or attempts used up (deliberately indistinguishable) | — |
| 401 | `TOKEN_INVALID` | Missing/bad access token, or unusable refresh token | — |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password at login (same answer for both) | — |
| 403 | `FORBIDDEN` | Not an (active) admin | — |
| 403 | `ACCOUNT_DEACTIVATED` / `ACCOUNT_SUSPENDED` | Login with a correct password on an inactive account | — |
| 404 | `NOT_FOUND` | Unknown user, no pending sign-up, unknown route | — |
| 409 | `EMAIL_TAKEN` | Address already belongs to an account | — |
| 409 | `LAST_ADMIN` | The change would leave no active admin | — |
| 409 | `CANNOT_MODIFY_SELF` | An admin demoting themselves while other admins exist | — |
| 409 | `USER_NOT_ACTIVE` | Role change on a non-active user | — |
| 409 | `NOT_DEACTIVATED` | Reactivating an account that is not deactivated | — |
| 423 | `ACCOUNT_LOCKED` | Too many failed logins | `retryAfterSeconds` |
| 429 | `RATE_LIMITED` | Too many codes requested | `retryAfterSeconds` |
| 500 | `INTERNAL_ERROR` | Unexpected failure | — |
| 503 | `SERVICE_UNAVAILABLE` | Email could not be sent, or database down (`/health`) | — |

## Field rules

Every body is **strict**: an unknown field is `400 VALIDATION_ERROR`. Values are normalised before use as shown.

| Field | Rule | Normalisation |
|---|---|---|
| `email`, `newEmail` | Valid address on `u.nus.edu` or `nus.edu.sg` exactly (no subdomains) | trimmed, lowercased |
| `password`, `newPassword` (setting one) | 8+ characters, at most 72 bytes, a lowercase letter, an uppercase letter, a digit | none |
| `password` (login) | Any non-empty string | none |
| `displayName` | 1–100 characters | trimmed; runs of whitespace become one space |
| `otp` | Exactly 6 ASCII digits, as a **string** (`"012345"`) | all whitespace removed |
| `countryCode` | `+` then 1–3 digits, e.g. `+65` | trimmed |
| `mobileNumber` | 4–15 digits, without the country code; must be a valid **mobile** number for `countryCode` | spaces and dashes removed |
| `refreshToken` | Any non-empty string | none |
| `role` | `USER` or `ADMIN` | — |
| `status` (query) | `ACTIVE`, `DEACTIVATED` or `SUSPENDED` | — |
| `purpose` | `EMAIL_CHANGE`, `MOBILE_CHANGE`, `PASSWORD_CHANGE` or `DEACTIVATION` | — |
| `:userId` (path) | UUID | — |

## Limits

| Rule | Value |
|---|---|
| OTP | 6 digits, valid 5 minutes, 3 wrong attempts then the code is gone. A newer code replaces the older one. |
| Pending sign-up | Kept 15 minutes; resend replaces the code inside that window |
| OTP requests | 3 per 10 minutes, then blocked 15 minutes. Counted per **email** on register / resend / forgot, per **user** on `/users/me/*` (one bucket for all purposes; an email change uses two). |
| Login lockout | 5 failures within 15 minutes lock the address for 15 minutes. A correct password does not lift a lock; a password reset does. |
| Access / refresh token | 15 minutes / 90 days |

All OTPs are sent by email (Mailpit at `http://localhost:8025` in development).

---

## Endpoints

| Method | Path | Auth | Success |
|---|---|---|---|
| GET | `/health` | Public | 200 |
| GET | `/.well-known/jwks.json` | Public | 200 |
| POST | `/auth/register` | Public | 201 |
| POST | `/auth/register/verify` | Public | 200 |
| POST | `/auth/register/resend-otp` | Public | 202 |
| POST | `/auth/login` | Public | 200 |
| POST | `/auth/refresh` | Public | 200 |
| POST | `/auth/logout` | Bearer | 204 |
| POST | `/auth/password/forgot` | Public | 202 |
| POST | `/auth/password/reset` | Public | 204 |
| GET | `/users/me` | Bearer | 200 |
| PATCH | `/users/me` | Bearer | 200 |
| POST | `/users/me/otp` | Bearer | 202 |
| POST | `/users/me/email` | Bearer | 202 |
| POST | `/users/me/email/verify` | Bearer | 200 |
| PATCH | `/users/me/mobile` | Bearer | 200 |
| POST | `/users/me/password` | Bearer | 204 |
| POST | `/users/me/deactivate` | Bearer | 204 |
| GET | `/admin/users` | Bearer, ADMIN | 200 |
| PATCH | `/admin/users/:userId/role` | Bearer, ADMIN | 200 |
| POST | `/admin/users/:userId/reactivate` | Bearer, ADMIN | 200 |

### Response shapes

**AuthResponse** (register/verify, login):
```json
{
  "accessToken": "eyJ…",
  "refreshToken": "q3V…",
  "expiresIn": 900,
  "user": { "userId": "uuid", "displayName": "Alex Tan", "role": "USER" }
}
```

**SelfProfile** (`/users/me*`):
```json
{ "userId": "uuid", "displayName": "Alex Tan", "email": "alex@u.nus.edu", "countryCode": "+65", "mobileNumber": "91234567" }
```
`countryCode` and `mobileNumber` are `null` only for the bootstrap admin.

**AdminProfile** (`/admin/users*`): SelfProfile plus `"role"`, `"status"` and `"createdAt"` (ISO 8601).

### Public

#### `GET /health`
`200 {"status":"ok"}`, or `503 SERVICE_UNAVAILABLE` when the database is unreachable.

#### `GET /.well-known/jwks.json`
`200 {"keys":[{"kty":"RSA","n":"…","e":"AQAB","kid":"…","alg":"RS256","use":"sig"}]}`

### Auth

#### `POST /auth/register`
Stores a pending sign-up and emails a code. No account exists until it is verified. Registering again with the same email replaces the pending sign-up.
```json
{ "displayName": "Alex Tan", "email": "alex@u.nus.edu", "countryCode": "+65", "mobileNumber": "91234567", "password": "Passw0rdSafe" }
```
`201 { "userId": "uuid", "otpExpiresAt": "2026-10-16T09:46:20.155Z" }`
Errors: 400 `VALIDATION_ERROR` · 409 `EMAIL_TAKEN` · 429 `RATE_LIMITED` · 503 `SERVICE_UNAVAILABLE`

#### `POST /auth/register/verify`
Creates the account and logs the user in.
```json
{ "email": "alex@u.nus.edu", "otp": "123456" }
```
`200 AuthResponse` (role `USER`)
Errors: 400 `VALIDATION_ERROR` / `OTP_INVALID` / `OTP_EXPIRED` (also when nothing is pending) · 409 `EMAIL_TAKEN`

#### `POST /auth/register/resend-otp`
```json
{ "email": "alex@u.nus.edu" }
```
`202 { "otpExpiresAt": "…" }`
Errors: 400 · 404 `NOT_FOUND` (no pending sign-up) · 429 · 503

#### `POST /auth/login`
```json
{ "email": "alex@u.nus.edu", "password": "Passw0rdSafe" }
```
`200 AuthResponse`
Errors: 400 · 401 `INVALID_CREDENTIALS` · 403 `ACCOUNT_DEACTIVATED` / `ACCOUNT_SUSPENDED` · 423 `ACCOUNT_LOCKED`

#### `POST /auth/refresh`
```json
{ "refreshToken": "q3V…" }
```
`200 { "accessToken", "refreshToken", "expiresIn": 900 }`. Always store the new pair; the old refresh token is now dead.
Errors: 400 · 401 `TOKEN_INVALID` (unknown, expired, reused, or the user is no longer active)

#### `POST /auth/logout` (Bearer)
Ends this session only, and only if the refresh token belongs to the caller.
```json
{ "refreshToken": "q3V…" }
```
`204`, even if the token was unknown.
Errors: 400 · 401

#### `POST /auth/password/forgot`
Same answer whether or not the address has an account. Only an ACTIVE account is emailed.
```json
{ "email": "alex@u.nus.edu" }
```
`202 { "message": "If an account exists for that email, a reset code has been sent to it." }`
Errors: 400 · 429

#### `POST /auth/password/reset`
Sets the password, ends every session and lifts any login lock. The bootstrap admin claims its account this way.
```json
{ "email": "alex@u.nus.edu", "otp": "123456", "newPassword": "Newpassw0rd" }
```
`204`
Errors: 400 `VALIDATION_ERROR` (including "must be different from your current one") / `OTP_INVALID` / `OTP_EXPIRED`
The code is only spent once the new password is saved. After a validation error (bad format or same as current), retry with the same code.

### Profile (`/users/me`)

All Bearer. The caller only ever acts on their own account.

#### `GET /users/me`
`200 SelfProfile`

#### `PATCH /users/me`
```json
{ "displayName": "Alex T." }
```
`200 SelfProfile`. Any other field (e.g. `role`) is a 400.

#### `POST /users/me/otp`
Emails a code to the caller's **current** address.
```json
{ "purpose": "EMAIL_CHANGE" }
```
`202 { "otpExpiresAt": "…" }`
Errors: 400 · 409 `LAST_ADMIN` (`DEACTIVATION` by the only active admin) · 429 · 503

#### `POST /users/me/email`
Step 2 of 3 of an email change. `otp` is the `EMAIL_CHANGE` code. Emails a second code to `newEmail`; nothing is changed yet.
```json
{ "newEmail": "alex.new@u.nus.edu", "otp": "123456" }
```
`202 { "otpExpiresAt": "…" }`
Errors: 400 `VALIDATION_ERROR` / `OTP_INVALID` / `OTP_EXPIRED` · 409 `EMAIL_TAKEN` · 429 · 503
The `EMAIL_CHANGE` code stays valid after a 409 or 503, so you can retry with it.

#### `POST /users/me/email/verify`
Step 3 of 3. `otp` is the code sent to the **new** address.
```json
{ "otp": "654321" }
```
`200 SelfProfile` with the new email
Errors: 400 · 409 `EMAIL_TAKEN`

#### `PATCH /users/me/mobile`
Needs a `MOBILE_CHANGE` code.
```json
{ "countryCode": "+65", "mobileNumber": "98765432", "otp": "123456" }
```
`200 SelfProfile`
Errors: 400 `VALIDATION_ERROR` / `OTP_INVALID` / `OTP_EXPIRED`

#### `POST /users/me/password`
Needs a `PASSWORD_CHANGE` code. Ends every session.
```json
{ "otp": "123456", "newPassword": "Newpassw0rd" }
```
`204`
Errors: 400 `VALIDATION_ERROR` (including same as current; the code stays valid) / `OTP_INVALID` / `OTP_EXPIRED`

#### `POST /users/me/deactivate`
Needs a `DEACTIVATION` code. Ends every session; login then answers 403 `ACCOUNT_DEACTIVATED`.
```json
{ "otp": "123456" }
```
`204`
Errors: 400 · 409 `LAST_ADMIN`

### Admin (`/admin/users`)

All Bearer with role `ADMIN`; a `USER` gets 403 `FORBIDDEN`.

#### `GET /admin/users?role=USER&status=ACTIVE`
Both filters optional. Newest first. Any other query parameter is a 400.
`200 { "items": [AdminProfile, …] }`

#### `PATCH /admin/users/:userId/role`
```json
{ "role": "ADMIN" }
```
`200 AdminProfile` of the target
Errors: 400 (bad body or malformed `:userId`) · 403 `FORBIDDEN` (caller is no longer an active admin) · 404 `NOT_FOUND` · 409 `USER_NOT_ACTIVE` / `CANNOT_MODIFY_SELF` / `LAST_ADMIN`

#### `POST /admin/users/:userId/reactivate`
No body. Keeps the target's role.
`200 AdminProfile` with `status: "ACTIVE"`
Errors: 400 (malformed `:userId`) · 403 `FORBIDDEN` · 404 `NOT_FOUND` · 409 `NOT_DEACTIVATED`

---

## Manual testing with Postman

### 1. Start the service
From the repo root:
```bash
docker compose -f user-service/compose.yaml --env-file .env up --build -d
curl http://localhost:3001/health          # {"status":"ok"}
```
- Mailpit's inbox, where every OTP arrives, is at **http://localhost:8025**.
- If port 5432 is already in use on your machine, stop that Postgres first.

### 2. Set up Postman
1. Create a collection (or an environment) with a variable **`baseUrl` = `http://localhost:3001`**.
   Use `http://localhost:3003` instead to go through the gateway in the full stack.
2. Add the variables `accessToken`, `refreshToken` and `otp`, all empty.
3. On every request with a body: **Body → raw → JSON**, and set the header `Content-Type: application/json`.
4. On Bearer routes: **Authorization → Bearer Token → `{{accessToken}}`**.

### 3. Walk through the main flow
Read each OTP from Mailpit and paste it into `otp` before sending the request that needs it.

| # | Request | Body | Expect |
|---|---|---|---|
| 1 | `GET {{baseUrl}}/health` | — | 200 `{"status":"ok"}` |
| 2 | `POST {{baseUrl}}/auth/register` | `{"displayName":"Alex Tan","email":"alex1@u.nus.edu","countryCode":"+65","mobileNumber":"91234567","password":"Passw0rdSafe"}` | 201, then an email "Verify your FoC account" in Mailpit |
| 3 | `POST {{baseUrl}}/auth/register/verify` | `{"email":"alex1@u.nus.edu","otp":"{{otp}}"}` | 200. Copy `accessToken` and `refreshToken` into the variables. |
| 4 | `GET {{baseUrl}}/users/me` | — | 200 SelfProfile |
| 5 | `PATCH {{baseUrl}}/users/me` | `{"displayName":"Alex T."}` | 200 with the new name |
| 6 | `POST {{baseUrl}}/auth/refresh` | `{"refreshToken":"{{refreshToken}}"}` | 200. Store the **new** pair. |
| 7 | `POST {{baseUrl}}/users/me/otp` | `{"purpose":"MOBILE_CHANGE"}` | 202 and an email |
| 8 | `PATCH {{baseUrl}}/users/me/mobile` | `{"countryCode":"+65","mobileNumber":"98765432","otp":"{{otp}}"}` | 200 with the new number |
| 9 | `POST {{baseUrl}}/auth/logout` | `{"refreshToken":"{{refreshToken}}"}` | 204 |
| 10 | `POST {{baseUrl}}/auth/refresh` | `{"refreshToken":"{{refreshToken}}"}` | 401 `TOKEN_INVALID` |
| 11 | `POST {{baseUrl}}/auth/login` | `{"email":"alex1@u.nus.edu","password":"Passw0rdSafe"}` | 200 AuthResponse |

### 4. Try the error cases
- **No token:** `GET /users/me` without Authorization → 401 `TOKEN_INVALID`.
- **Validation:**
  - `POST /auth/register` with `"email":"alex@gmail.com"` → 400, with `details.fields` naming `email`.
  - Add `"role":"ADMIN"` to any body → 400.
- **Wrong code:** verify with `"otp":"000000"` → 400 `OTP_INVALID` with `attemptsRemaining`. After three wrong codes → `OTP_EXPIRED`.
- **Lockout:** wrong password 5 times on one address → 423 `ACCOUNT_LOCKED`.
- **Not an admin:** `GET /admin/users` with a USER token → 403 `FORBIDDEN`.

### 5. Act as the admin
On first start against an empty database, the service creates an ADMIN for `USER_BOOTSTRAP_ADMIN_EMAIL` (from `.env`) **with no password**. To claim it:
1. `POST /auth/password/forgot` with `{"email":"<that address>"}` → 202, then a "Reset your FoC password" email.
2. `POST /auth/password/reset` with `{"email":"<that address>","otp":"{{otp}}","newPassword":"Adminpassw0rd"}` → 204.
3. `POST /auth/login` → 200 with `role: "ADMIN"`. Use that `accessToken` for `/admin/users`.

Then try `GET /admin/users?status=ACTIVE`, `PATCH /admin/users/<userId>/role` with `{"role":"ADMIN"}`, and `POST /admin/users/<userId>/reactivate` on an account you deactivated.

### 6. Or run everything automatically
`postman/user-service.postman_collection.json` runs every endpoint and validation case top to bottom, and reads the OTPs from Mailpit itself. Import it, set the collection variable `adminEmail` to `USER_BOOTSTRAP_ADMIN_EMAIL`, and run the whole collection in the Collection Runner. From the terminal:
```bash
npx newman@6 run user-service/postman/user-service.postman_collection.json --env-var "adminEmail=<USER_BOOTSTRAP_ADMIN_EMAIL>"
```

**Tips:**
- Each address may request 3 codes per 10 minutes, so use a new email per manual run (`alex2@…`, `alex3@…`).
- To start from an empty database: `docker compose -f user-service/compose.yaml down -v`, then `up` again.
