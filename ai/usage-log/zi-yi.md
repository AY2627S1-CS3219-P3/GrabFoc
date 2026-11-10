<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Rewrote this log from entry-by-entry records (with exact prompts) into a high-level summary
  per service: what Zi Yi and the AI discussed and built, and the key decisions. Prompts were
  removed at Jie Yang's request. The full entry-by-entry log is kept in git history at commit
  32bbb85 (`git show 32bbb85:ai/usage-log/zi-yi.md`).
Author review: Human reviewed. Confirmed by every member (recorded by Jie Yang, 2026-11-10).
-->

# AI Usage Log: Zi Yi

High-level summary of Zi Yi's AI use, grouped by service. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). The full log with every prompt is in git history at commit
`32bbb85`.

- **Period:** 2026-09-24 to 2026-11-10
- **Tool:** Claude Code (Claude Opus 5, then Claude Opus 5.5)
- **Modes:** explain, generate, debug, verify
- **Review status:** ✅ Human reviewed (all sections)

## User Service ✅ Human reviewed

_2026-09-24 to 2026-10-21 · PRs #9–#18_

**What was discussed and built**
- The foundation: configuration, database and migrations, encryption, JWT signing and the JWKS endpoint.
- Registration with OTP, login with lockout, refresh and logout, password reset, and the
  first-admin bootstrap.
- A check with the Order Service before an account is deactivated, and admin suspension of users
  with a `UserSuspended` event.

**Key decisions (Zi Yi)**
- RS256 with JWKS instead of HS256; `pg` with plain SQL; numbered migrations; stacked PRs.
- Refresh tokens last 90 days; five failed logins lock an account.
- Accepted the AI's suggestions: a decoy OTP so unknown emails can't be detected, lifting a lockout
  after a reset, and a startup warning when no admin exists.
- The event uses the flat shape the Credit Service already reads; deactivation fails closed when
  the Order Service is down.
- Adopted Deanson's outbox when merging, dropping his branch's own table.
- A suspended user's access token stays valid for up to 15 minutes; left to the team.

## Order Service ✅ Human reviewed

_2026-10-14 to 2026-11-05_

**What was discussed and built**
- The service in phases on Jie Yang's database: access, creating, editing and accepting orders,
  the lifecycle steps, cancellation, proposals needing both parties, credit settlement over Kafka,
  an expiry worker, `order.events` for notifications, tests and a Postman collection.
- Cancelling orders automatically when a user is suspended or a location is deactivated.
- Read-only admin routes for the dashboard (overview, order list, order history).

**Key decisions (Zi Yi)**
- New orders wait in an `AWAITING_CREDIT` state while credits are reserved, with a clean-up job;
  this replaced his first insert-reserve-commit design.
- Reserve credits over HTTP; transfer and release as Kafka commands.
- Expired orders refuse lifecycle steps but can still be cancelled.
- Either party may propose a new time (a change to an earlier team rule; the team was told).
- Order history doubles as the event outbox.
- A deactivated pickup point cancels orders not yet picked up; a deactivated drop-off point cancels
  every unfinished order.

## API Gateway ✅ Human reviewed

_2026-11-06_

- Gateway routes for the admin dashboard. **Decision:** keep `/admin/credits/**` unrouted.

## Frontend ✅ Human reviewed

_2026-10-16 to 2026-11-10_

**What was discussed and built**
- Feedback on the forgot-password screen.
- The admin dashboard: overview, orders, logins, users, suspend and reactivate, and banners on
  finished orders.
- Making users admins and removing admin rights, with an Admins tab.

**Key decisions (Zi Yi)**
- Record who was suspended on the cancelled order, instead of guessing.
- Allow the frontend to call the change-role endpoint after the AI flagged the security trade-off.
