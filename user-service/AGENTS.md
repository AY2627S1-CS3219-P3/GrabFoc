# AGENTS.md — User Service & authentication

Service-specific context for `user-service/`. Read the root [`AGENTS.md`](../AGENTS.md) first: it has the product, terminology, roles, the auth model, cross-cutting rules and the plan-first rule.

Status legend: **[Decided]** · **[Proposed]** · **[Open]** (defined in the root `AGENTS.md`).

## Database [Decided: PostgreSQL + these three tables]

| Table | Key columns |
|---|---|
| `users` | id, email_lookup (unique), encrypted email/mobile, password_hash, role (`ADMIN`/`USER`), status, email_verified, failed_attempts, locked_until, timestamps |
| `refresh_tokens` | id, user_id → users, token_hash (unique), family_id, expires_at, revoked_at |
| `otps` | id, user_id → users, purpose, code_hash, attempts, expires_at, used_at, invalidated_at; partial unique index on (user_id, purpose) for live OTPs |

- **Query pattern.** Almost everything is a **point lookup**: login by `email_lookup`, token refresh by `token_hash`, profile by `id`. B+-tree indexes on these lookup columns and on the `user_id` foreign keys serve them in about h + 1 I/Os.
- **Read/write mix.** Reads dominate (logins, profile views). Writes come from registration, OTP issue/verify and refresh-token rotation.
- **Scalability [Proposed].** A campus-sized user base fits comfortably in one PostgreSQL instance. Scale with indexes first, then read replicas. Sharding (e.g. by hash of user ID) isn't needed at this scale; name it as the next step only if asked.
- Clean up expired OTPs, expired refresh tokens and unverified accounts older than 24 h with a scheduled job.

## Credentials [Decided]

- Passwords: **bcrypt** (salted, slow hash). Minimum 8 characters, with at least one uppercase letter, one lowercase letter and one digit.
- Email and mobile: encrypted with AES-256-GCM.
  - A random IV means an encrypted email can't be looked up, so also store a **blind index**: `email_lookup = HMAC-SHA256(lower(email))` with a unique index.
  - Use it for registration uniqueness and login lookup.
- OTPs: stored as an **HMAC** with a server secret. Not plain SHA-256: 6-digit codes are brute-forceable if the table leaks.
- Emails must be on the NUS domain.

## Tokens [Decided: JWT access + refresh]

- **[Open]** Signing method: RS256/ES256 + JWKS (this design) or HS256 with the template's `JWT_SECRET`; see §6 of the root `AGENTS.md`.
- Access token: a short-lived **JWT** (15 min, signed RS256/ES256) carrying only `sub`, `role`, `iat`, `exp`, `jti` — no personal data.
- Refresh token: random, 7 days, stored **hashed**. It is rotated on every use; reusing an old one revokes the whole token family.
- Browser storage: access token in memory; refresh token in an `HttpOnly`, `Secure`, `SameSite` cookie.

## Authentication vs authorization

- Tokens are verified at the API Gateway; this service issues them and exposes the JWKS public key. See §6 of the root `AGENTS.md` for the full model.

## Profile protection [Decided]

- Changing email, phone or password requires an **OTP** sent to the user's email.
- **Zod schemas** list exactly the fields each endpoint may change, using `.strict()` or an explicit pick. A body containing `role`, `status`, `id` or other protected fields is rejected, which prevents mass assignment.
- **Parameterized queries / the ORM** prevent SQL injection. Zod does not; it only validates shape.
- The user being edited is always taken from the token (`sub`), never from the body or a path parameter, for self-service endpoints.

## OTPs & lockout

- **[Proposed]** OTPs:
  - 6 digits. The mockup shows 4 — change the mockup; 4 digits is too easy to guess.
  - Valid for 10 min, with at most 5 wrong entries per OTP and at most 3 OTP requests per account per 15 min.
  - Requesting a new OTP invalidates the previous one.
  - Verify and mark as used in a single atomic `UPDATE`.
- **[Open]** Lockout threshold. Backlog U2.3.1 says 3 consecutive failures. The proposal is 5 failures → 15-minute lock (CIS benchmark; within the NIST SP 800-63B cap of 100).

## Role lifecycle [Proposed]

- **First admin.**
  - Created on startup from `BOOTSTRAP_ADMIN_EMAIL` (listed in `.env.example`), only when no admin exists.
  - The account has no password until the owner sets one via OTP (the password-reset flow).
  - No password is ever stored in config. Creation is logged.
- **Promotion (no developer involvement).**
  1. An admin opens a user in the admin UI and chooses "Promote to admin".
  2. The service asks the acting admin for OTP confirmation.
  3. It sets `role = ADMIN` and logs who promoted whom, and when.
  4. The promoted user gets the new role on their next token refresh (≤ 15 min).
- **Demotion** works the same way, in reverse.
- **An admin revoking their own privileges:** allowed only if another active admin exists. It takes effect at their next token refresh.
- **The last admin demoting or deactivating themselves:** rejected (409) with a clear message. The system can never be left without an admin.
- **Never** assign `role` from a registration or profile payload.

## Integration

- **[Open]** Registration → credit account creation: a synchronous call to Credit, or an outbox. Either way, define what happens when Credit is down.

## Edge cases

- An admin's role is revoked while their token is still valid → access continues until the token expires (≤ 15 min); the most sensitive actions re-check the role.
- The last admin tries to demote or deactivate themselves → rejected.
- A role field is sent in the registration payload → rejected by Zod; the role stays `USER`.
