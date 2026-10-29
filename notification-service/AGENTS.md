<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
Scope: Moved root AGENTS.md §7 here unchanged (sections "Who gets emailed" to "Edge cases"); wrote "Status" and "Open design items" from issues #147–#155 (#149).
Author review: pending — Jie Yang to record the review.
-->

# AGENTS.md — Notification Service

Read the root `AGENTS.md` first; this file holds only what is specific to Notification.

## Status

_Origin: AI doc_

- Scaffold only (#149): NestJS on port 3006, its own PostgreSQL (`notification-db`, host port 5436), and `GET /health`. No tables, no Kafka consumer and no email sending yet.
- Tracking issue: #147. Next: schema (#150), `order.events` consumer (#152), sending (#153), retries (#154), end-to-end and CI (#155).

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
- **[Proposed]** Retry with exponential backoff?
- **[Decided]** (Backlog NFR3.4) Target: 95% of emails handed to the mail provider within 10 s of the event.
- **[Decided]** (Jie Yang, 2026-10-27) The recipient's email comes from a User Service endpoint, called when sending (#151). `order.events` and `user.events` carry no email addresses.

## Edge cases

_Origin: Team_

- Order events arrive out of order → no emails sent out of sequence.

## Open design items

_Origin: AI doc, listing the open points in #148; the team decides them_

- **[Open]** Tables: draft in #148 (`notification_events`, `notification_order_states`, `notification_templates`, `notifications`).
- **[Open]** Stale check: discard only earlier states (`<`, N1.3.2 as written) or the same state too (`<=`).
- **[Open]** Unreadable events: `notification.order-events.dlt` only (root §3 Messaging rule 6), or a dead-letter table as well.
- **[Open]** Retry approach (#154).
- **[Open]** The User endpoint's shape, owned by the User Service (#151).
