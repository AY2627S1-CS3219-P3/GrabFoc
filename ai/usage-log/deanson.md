<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Rewrote this log from entry-by-entry records (with exact prompts) into a high-level summary
  per service: what Deanson and the AI discussed and built, and the key decisions. Prompts were
  removed at Jie Yang's request. The full entry-by-entry log is kept in git history at commit
  32bbb85 (`git show 32bbb85:ai/usage-log/deanson.md`).
Author review: Human reviewed. Confirmed by every member (recorded by Jie Yang, 2026-11-10).
-->

# AI Usage Log: Deanson

High-level summary of Deanson's AI use, grouped by service. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). The full log with every prompt is in git history at commit
`32bbb85`.

- **Period:** 2026-09-27 to 2026-11-10
- **Tool:** Claude Code (Claude Sonnet 5, then Claude Opus 5.5)
- **Modes:** explain, generate, refactor, debug, verify
- **Review status:** ✅ Human reviewed (all sections)

## User Service ✅ Human reviewed

_2026-09-27 to 2026-10-19_

**What was discussed and built**
- Admin endpoints: list users, and change a user's role safely (`AdminLockService` locks the caller
  and the active admins in one transaction).
- Self-profile: `GET /users/me` and `PATCH /users/me`.
- The six OTP-protected self-service endpoints (email, mobile, password, deactivation) and admin reactivation.
- A restructure into the agreed NestJS layout, run in Docker and covered by Postman, with an `API.md` reference.
- Password reset keeps the OTP until the new password is saved.
- `UserRegistered` published through a transactional outbox, so the Credit Service creates new
  users' wallets.

**Key decisions (Deanson)**
- List users filtered by role and status only, without pagination or an email filter.
- Caught a bug the AI's tests missed: the last-admin check could never run; had it fixed.
- No `GET /users/:userId`; `PATCH /users/me` needs a token but no OTP and changes the name only.
- Adopted the AI's "verify first, consume the OTP only on success", because his literal request
  would have let a leaked token guess passwords freely; a new password must differ from the old one.
- Reactivation relies on the role guard; the notification step waits for the Notification Service.
- Designed the outbox himself: polling relay, lean table, `{type, eventId, userId, occurredAt}`
  payload, exponential backoff, the service starts without Kafka; rejected failure columns and a backfill.

## Frontend: orders and profile ✅ Human reviewed

_2026-10-21 to 2026-11-10_

**What was discussed and built**
- An order lifecycle document and a frontend integration plan written from his screen requirements.
- The order screens: create order on Home, available orders for couriers, the Orders page with
  requester and courier tabs, and the order detail page; status badges in colour; Active /
  Completed / Cancelled sections.
- Profile page: order totals, editing the display name, OTP-protected changes to email, mobile,
  password and deactivation, and tidy-ups (grouped contact details, no empty Credits Earned card,
  no placeholder avatar).
- A start and end time for the order window in the create and edit order form.

**Key decisions (Deanson)**
- Every screen requirement, 10-second polling, and what to defer.
- Filter finished orders in the frontend instead of adding a backend filter.
- Confirmed one API change: a `status` filter on `GET /orders/assigned` for the profile totals.
- Chose the colour of each status badge.

## Real-time chat (N2H) ✅ Human reviewed

_2026-11-08_

**What was discussed and built**
- Backend: a short-lived chat ticket from the Order Service, a NestJS + Socket.IO chat service with
  history and missed messages, a gateway route, Compose and CI.
- Frontend: a chat panel on the order page.

**Key decisions (Deanson)**
- Build and test the backend in Postman before any frontend work; approved both plans.
- Chat opens only for the requester and courier of an accepted order still in progress.
