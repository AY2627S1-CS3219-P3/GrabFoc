<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
Scope: Moved root AGENTS.md §7 here unchanged (sections "Who gets emailed" to "Edge cases"); wrote "Status" and "Open design items" from issues #147–#155 (#149).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
Scope: Wrote "Design decisions (#148)" from the decisions Jie Yang gave in chat.
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
Scope: Updated "Status" for the schema and consumer (#150, #152).
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
Scope: Updated "Status" for sending (#153); recorded the sending decisions and closed the #151 open item.
Author review: pending — Jie Yang to record the review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
Scope: Updated "Status" and "Rules" for retries (#154); wrote "Retries (#154)" from Jie Yang's decisions in chat; marked the admin dead-letter endpoints as deferred.
Author review: pending — Jie Yang to record the review.
-->

# AGENTS.md — Notification Service

Read the root `AGENTS.md` first; this file holds only what is specific to Notification.

## Status

_Origin: AI doc_

- Scaffold (#149): NestJS on port 3006, its own PostgreSQL (`notification-db`, host port 5436), and `GET /health`.
- Schema (#150) and `order.events` consumer (#152): each event is deduplicated, checked for staleness and given one `PENDING` row in `notifications` per recipient, in one transaction. Unreadable events go to `notification.order-events.dlt` and are copied into `notification_dead_letters`.
- Sending (#153): after the event's transaction, each `PENDING` row is sent: the email comes from User's `GET /internal/users/:userId/contact` (#151), then goes out over SMTP. The row becomes `SENT`, or `FAILED` with an error category, and the event `HANDLED` once no row is `PENDING`.
- Retries (#154): an event with emails that may still go out moves through `notification.order-events.retry.<n>`, then to `notification.order-events.dlt`. An email for an order that has since moved on is dropped as `SUPERSEDED`.
- Not yet: the admin dead-letter endpoints (deferred), end-to-end and CI (#155), emails for completion/cancellation/timing-change requests (#186). Tracking issue: #147.

## Purpose

_Origin: Team (Backlog NTFR1–3, NFR3.4)_

- Email only. Consumes order-state events and emails the right party. Stores almost nothing.

## Who gets emailed [Decided]

_Origin: Team (Backlog NTFR2)_

| New state | Recipient |
|---|---|
| `ACCEPTED`, `PICKED_UP`, `IN_PROGRESS` | requester |
| `ARRIVED` | requester |
| `COMPLETED` | requester and courier |
| `CANCELLED` | requester, plus the courier if one was assigned |
| any other state | recorded and discarded |

## Rules

_Origin: Team (Backlog NTFR1, NFR3.4)_

- Deduplicate on the event ID: send at most one email per event.
- Keep the last processed state per order and discard stale events. State order: `PENDING < ACCEPTED < PICKED_UP < IN_PROGRESS < ARRIVED < COMPLETED/CANCELLED`.
- Mark an event handled only after its send outcome is saved. After a restart, resume from the last handled event.
- **[Decided]** (Jie Yang, 2026-11-04) Retry failed sends with growing delays through retry topics, like Credit; see "Retries (#154)".
- **[Decided]** (Backlog NFR3.4) Target: 95% of emails handed to the mail provider within 10 s of the event.
- **[Decided]** (Jie Yang, 2026-10-27) The recipient's email comes from a User Service endpoint, called when sending (#151). `order.events` and `user.events` carry no email addresses.

## Edge cases

_Origin: Team_

- Order events arrive out of order → no emails sent out of sequence.

## Design decisions (#148)

_Origin: Team (Jie Yang, 2026-10-30, after going through Claude Code's draft schema table by table). Full SQL in #148._

- **[Decided]** Tables: `notification_events` (one row per event; the insert deduplicates), `notification_order_states` (last state handled per order), `notifications` (one row per recipient per event, with the send result), `notification_dead_letters` (Credit's `credit_dead_letters` columns). No email address or rendered body is stored.
- **[Decided]** Email templates live in code, not in a table.
- **[Decided]** The cancellation `reason` is stored on the event; the CANCELLED email shows it.
- **[Decided]** Stale check: discard an event only when its state is earlier than the last one handled. A repeat of the same state is not discarded.
- **[Decided]** `COMPLETED` and `CANCELLED` block every later event for that order, including the other final state. Compare states by an explicit rank (both final states rank 6), never by enum order.
- **[Decided]** Retries work like Credit's: `notification.order-events.retry.<n>`, one topic per delay in `NOTIFICATION_RETRY_DELAYS`, then `notification.order-events.dlt` (root §3 Messaging rules 4 and 6).
- **[Decided]** Dead letters are also copied into `notification_dead_letters`, by consuming `notification.order-events.dlt`. Admins list them with `GET /dead-letters` and replay one with `POST /dead-letters/:eventId/replay`; both are ADMIN only, like Credit's. **Deferred** (Jie Yang, 2026-11-04): notifications that arrive late are of little use, so no long-term recovery for now; dead letters are still kept in the table.

## Sending (#153)

_Origin: Team (Jie Yang approved Claude Code's plan, 2026-11-04; the button, 2026-11-02)_

- **[Decided]** Emails are sent right after the event's transaction, before the offset is stored. The sender also runs for a duplicate delivery, so a crash between a send and saving its result sends that email again: **at least once**.
- **[Decided]** A send that fails (User unreachable or 404, SMTP error) is saved as `FAILED` with an error category in `last_error`, never the address or the provider's message. Retrying it is #154.
- **[Decided]** HTML and plain-text emails, built in `src/mail/templates.ts`, with an "Open FoC" button to `NOTIFICATION_FRONTEND_URL` (production `https://d2vc4gojrvvtgk.cloudfront.net`). It opens the home page: the frontend has no order page to link to.
- Service-to-service: `X-Service-Key` with User's `USER_INTERNAL_SERVICE_KEY` (#151, `user-service/AGENTS.md`).

## Retries (#154)

_Origin: Team (Jie Yang, 2026-11-04, from Claude Code's options)_

- **[Decided]** After a send pass, an event with emails that failed but may succeed later is copied to the next retry topic, `notification.order-events.retry.<n>`, one per delay in `NOTIFICATION_RETRY_DELAYS` (default `1s,5s,30s,2m,10m`, about 13 minutes in all). After the last one it goes to `notification.order-events.dlt` and into `notification_dead_letters`. Retries never hold up `order.events`.
- **[Decided]** A retry message is the original event. Its pass sends that event's `FAILED` emails whose error is retryable; it never records the event again. No schema change.
- **[Decided]** Retried: `USER_UNAVAILABLE`, connection and timeout errors (`ECONNECTION`, `ETIMEDOUT`, `ESOCKET`, `EDNS`, `ECONNREFUSED`, `ECONNRESET`), SMTP 4xx and `UNKNOWN`. Not retried: `USER_NOT_FOUND`, `USER_BAD_RESPONSE`, SMTP 5xx and other errors (e.g. `EAUTH`) that need a person to fix the settings.
- **[Decided]** Before any send, first or retry, an email is dropped if the order has since been handled in a later state: it is saved as `FAILED` with `last_error` `SUPERSEDED`, so emails never arrive out of sequence. Ranks as in the stale check, so `COMPLETED` and `CANCELLED` emails are never superseded.
- **[Decided]** No long-term recovery (no worker over the dead letters, no replay for now): a notification that arrives much later is of little use.
- Known gap: if the service crashes after a send pass but before the retry message is written, the redelivered event finds no `PENDING` emails and schedules no retry; those emails stay `FAILED`.
