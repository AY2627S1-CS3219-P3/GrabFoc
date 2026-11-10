<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Rewrote this log from entry-by-entry records (with exact prompts) into a high-level summary
  per service: what Jie Yang and the AI discussed and built, and the key decisions. Prompts were
  removed at Jie Yang's request. The full entry-by-entry log is kept in git history at commit
  32bbb85 (`git show 32bbb85:ai/usage-log/jie-yang.md`).
Author review: Human reviewed. Confirmed by every member (recorded by Jie Yang, 2026-11-10).
-->

# AI Usage Log: Jie Yang

High-level summary of Jie Yang's AI use, grouped by service. The template and rules are in
[`ai/usage-log.md`](../usage-log.md). The full log with every prompt is in git history at commit
`32bbb85`.

- **Period:** 2026-09-24 to 2026-11-10
- **Tools:** Codex (GPT-6) at first, then Claude Code (Claude Opus 5.5)
- **Modes:** explain, generate, refactor, debug
- **Review status:** ✅ Human reviewed (all sections)

## Frontend ✅ Human reviewed

_2026-09-24 to 2026-11-10_

**What was discussed and built**
- Sign-in, sign-up and verification screens from the Figma mockup.
- Connecting the User Service: sessions kept in secure cookies on the server, token refresh handled
  on the server, password recovery, profile and logout.
- Connecting the Supplier Service: browsing, searching and filtering locations, admin screens,
  error messages and location thumbnails.
- Showing the credit balance and history.
- A full visual redesign ("campus route slip"), a design skill for future screens, and the admin
  dashboard and chat restyled to match.
- A "Propose new time" option on the order page.

**Key decisions (Jie Yang)**
- Use npm; keep tokens out of the browser; never reuse a refresh result.
- Frontend work does not change the User or Supplier Services; thumbnails use the image link the
  Supplier Service already returns.

## API Gateway ✅ Human reviewed

_2026-09-27 to 2026-10-22_

**What was discussed and built**
- A first gateway in Node (routing, token checks, clear error codes), then a move to Envoy with one
  route file per service, settings from the environment, a Postman collection and CI.
- Routes for Credit and other services as they were added.

**Key decisions (Jie Yang)**
- The gateway checks the token and forwards it; each service decides what the user may do.
- The gateway reads only its own settings file.
- Use stock Envoy and record every behaviour that differs from the old gateway; remove the old one.
- A key-server outage returns 503, not 401.

## Order Service: database ✅ Human reviewed

_2026-10-11 to 2026-10-13_

**What was discussed and built**
- The order schema, reviewed with the AI one topic at a time, then the database migrations and tests.

**Key decisions (Jie Yang)**
- One description per order; pickup and drop-off as location references with a snapshot of their details.
- Plain SQL migrations; new orders start as `PENDING`; a 24-hour default window.
- Only one courier can accept an order; a courier has one active order at a time; edits are checked
  against the version the user saw.
- Proposals need both parties, only one proposal at a time, and they expire or close with the order.

## Supplier Service ✅ Human reviewed

_2026-10-19_

- A `SupplierDeactivated` event sent through an outbox, so the Order Service can cancel affected
  orders. **Decision:** approved the outbox design; the owners confirmed the event.

## Containers and shared setup ✅ Human reviewed

_2026-09-29 to 2026-10-23_

- The gateway and frontend in the root Compose stack; automatic restarts for every long-running
  container; services no longer crash when their database restarts; Unix line endings for the
  Kafka setup scripts.

## Notification Service ✅ Human reviewed

_2026-10-26 to 2026-11-10_

**What was discussed and built**
- The service from scratch: planning issues, database, reading order events, sending emails with
  retries, CI, and emails for account suspension and reactivation.
- An internal User Service endpoint that returns a user's email to other services.
- Emails for proposals (time change, cancellation, completion), with a new `OrderChangeRequest`
  event from the Order Service.

**Key decisions (Jie Yang)**
- How each table works, the email templates, and who is emailed for each event.
- Retries reuse the Credit Service's delays; an email is dropped if the order has moved on.
- Old account events are recorded but not emailed.
- One proposal event with an outcome field (created, approved, rejected, expired); an unsent request
  email is cancelled once its proposal is resolved.

## Cloud deployment ✅ Human reviewed

_2026-11-09 to 2026-11-10_

- Found why the deployed chat failed (no chat service on AWS) and planned its deployment.
- Explained how to move location images to S3; the bucket design was left to the team and Jian Bing.

## Usage logs ✅ Human reviewed

_2026-11-10_

- Summarised every member's log by service, marked the reviews as done, and rewrote each log into
  this high-level form without prompts.
