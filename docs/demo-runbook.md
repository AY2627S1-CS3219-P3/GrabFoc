<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Wrote this runbook by walking the whole flow against a real `docker compose up` on Cole
  Lin's machine on 2026-11-09, after the logging work merged. Every step, status code, timing note
  and gap below was observed rather than inferred; where something is untested it says so.
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Query the log store through the gateway, which now routes GET /logs, and dropped that from
  the gaps. Checked against the running stack: 401 with no token, 403 for a USER, 200 for an admin
  (#52).
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Review: the chat secrets, which joined the stack after this was walked and stop Order and
  Chat from starting without them; the smoke check polls instead of racing ingestion; and the
  "nothing is lost" line, which dead letters make untrue.
Author review: Cole Lin, read and approved.
-->

# Demo runbook

The order flow end to end, with every service's log lines visible in the Centralized Logging
store. Walked against a full `docker compose up` on 2026-11-09; the numbers and status codes here
are what it actually did.

---

## 0. Before the day

Four things, none of which you want to discover live.

1. **Three secrets in the root `.env`**, each at least 32 characters
   (`openssl rand -hex 32`). The stack will not start without them, and Compose copies each one
   into the service that pairs with it:

   | Set this | Compose also fills |
   |---|---|
   | `CREDIT_SERVICE_KEY` | `ORDER_CREDIT_SERVICE_KEY` |
   | `USER_INTERNAL_SERVICE_KEY` | `NOTIFICATION_USER_SERVICE_KEY` |
   | `CHAT_TICKET_SECRET` | `ORDER_CHAT_TICKET_SECRET`, and the chat service's own copy |

   `USER_ORDER_SERVICE_KEY` is filled from `ORDER_SERVICE_KEY` the same way.

   `CHAT_TICKET_SECRET` joined the stack after this was walked, and both Order and Chat refuse to
   start without it or with fewer than 32 characters - so leaving it out gets you two containers
   restarting rather than the healthy stack section 1 expects. `CHAT_POSTGRES_PASSWORD` wants a
   value too: its Compose default works, but only on a `chat-db` volume first created with that
   same default, which is the trap in point 3 below.

2. **`USER_BOOTSTRAP_ADMIN_EMAIL`** set to an address you can "receive" in mailpit. The first
   admin is created at startup **with no password**; it is claimed in step 3.

3. **A `logging-db` volume whose password matches `.env`.** PostgreSQL fixes the password when the
   data directory is first created, so a volume older than your current `.env` refuses every
   connection. Either recreate it or, keeping the data:

   ```bash
   docker compose -f logging-service/compose.yaml up -d logging-db
   ```

   then inside the container (the local socket is trusted, so no current password is needed):

   ```bash
   docker exec -i foc-logging-db-1 psql -U foc -d logging -c "ALTER USER foc WITH PASSWORD '<the .env value>';"
   ```

4. **Register the demo accounts the day before.** A wallet is created by the Credit Service from
   the `UserRegistered` event, not by registration itself, so for a second or two after signing up
   a user has no credits and `POST /orders` is refused with `INSUFFICIENT_CREDITS`. Pre-registered
   accounts make that invisible.

---

## 1. Bring it up

```bash
docker compose up -d --build
```

Over twenty containers. Three of them are one-shot jobs that run and exit — `kafka-init`,
`order-migrate` and `chat-migrate` — so `docker compose ps` lists fewer than it started. The first
build is slow: the frontend and seven services. Check them:

```bash
docker compose ps
```

Everything listed should be `Up`; the databases, Kafka and mailpit also report `(healthy)`. If a service
is `Restarting`, read it with `docker compose logs <service> | grep -i error` — in practice it has
always been a missing variable from step 0.

What is listening, on the host:

| | |
|---|---|
| frontend | `:3000` |
| API Gateway | `:3003` |
| log store (also on the gateway, `GET /logs`) | `:3007` |
| chat socket | `:3008` |
| mailpit inbox | `:8025` |
| Kafka UI | `:8085` |

---

## 2. Verify the loop before you present

One command, and it proves the whole feature (the loop is not optional - see below):

```bash
curl -s -o /dev/null -H "x-request-id: smoke-1" http://localhost:3002/locations
for i in $(seq 20); do
  docker exec foc-logging-db-1 psql -U foc -d logging -tAc \
    "select count(*) from log_lines where request_id = 'smoke-1';" | grep -qx 0 || break
  sleep 1
done
docker exec foc-logging-db-1 psql -U foc -d logging \
  -c "select service, event, request_id, status from log_lines where request_id = 'smoke-1';"
```

**The loop is the point.** Nothing here is synchronous: the service buffers the line and flushes
on a one-second timer, then Kafka has to deliver it and the store has to insert it. Query once,
straight after the request, and an entirely healthy pipeline shows you nothing.

A request with no token gets a 401 and writes **two** lines — `request_completed` and
`access_denied` — both carrying `smoke-1`. If they are there, ingest is consuming and the store is
writing.

---

## 3. Claim the admin

Needed for `GET /logs`, which is ADMIN-only and has no dev-auth fallback. The gateway
authenticates the request; the Logging Service is what checks the role, so a plain USER's token
reaches it and comes back **403** (`This action requires the ADMIN role.`).

1. `POST :3003/auth/password/forgot` → `{ "email": "<the bootstrap address>" }` → **202**
2. Open **mailpit at `:8025`**, read the 6-digit code from "Reset your FoC password"
3. `POST :3003/auth/password/reset` → `{ "email", "otp", "newPassword" }` → **204**
   (password rule: 8+ characters, one upper, one lower, one digit)
4. `POST :3003/auth/login` → `{ "email", "password" }` → **200** with `accessToken`

Keep that token in a shell variable. It expires in 15 minutes, so re-login before you present
rather than mid-demo.

---

## 4. The flow

Everything below goes through the gateway on `:3003` with `Authorization: Bearer <token>`. Send
the **same `x-request-id`** on every call — that is what makes step 5 work.

| # | Who | Call | Result |
|---|---|---|---|
| 1 | requester | `GET /locations?pageSize=2` | 200, 21 seeded locations |
| 2 | requester | `GET /credits/<their id>` | 200, `available: 10` |
| 3 | requester | `POST /orders` | **201**, state `PENDING`, credits now `7` available / `3` reserved |
| 4 | courier | `POST /orders/<id>/accept` | 200, `ACCEPTED` |
| 5 | courier | `POST /orders/<id>/pick-up` | 200, `PICKED_UP` |
| 6 | courier | `POST /orders/<id>/start-delivery` | 200, `IN_PROGRESS` |
| 7 | courier | `POST /orders/<id>/arrive` | 200, `ARRIVED` |
| 8 | courier | `POST /orders/<id>/confirmations` `{"kind":"COMPLETION"}` | 201 |
| 9 | requester | `POST /orders/<id>/confirmations/<cid>/respond` `{"response":"ACCEPTED"}` | 200, **`COMPLETED`** |

**Two things that will trip you up.**

- **Steps 4–7 need `{"version": n}` in the body.** That is optimistic concurrency: the version
  comes back in each response and a stale one is a 409 rather than a lost update. Without it you
  get a 400 on `version`.
- **`POST /orders` body**: `orderDescription`, `pickupLocationId`, `deliveryLocationId`,
  `creditOffer` — and nothing else, the schema is strict. `creditOffer` cannot be edited later.

Then:

- **Credits move a beat after completion**, not during it — the transfer is a Kafka command. Taken
  immediately, the requester still reads `7 / 3`; a few seconds later it is `7 / 0` and the courier
  is `13 / 0`. Pause before you show the balances.
- **The emails are in mailpit.** Completion emails both parties, so `:8025` is a good beat.

---

## 5. Show the logs

The point of the whole thing: one request id, every service that touched it.

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3003/logs?requestId=<the id you sent>&pageSize=50" | jq '.lines[] | {service, event, method, path, status}'
```

Through the gateway on `:3003`, like every other call in the demo. The store is also still on
`:3007` directly, which is the one to fall back to if the gateway is the thing being debugged.

A real run of the flow above returned **10 lines** under one id:

```
order     request_completed  POST  /orders                                201
credit    request_completed  POST  /internal/credits/reserve              201
supplier  request_completed  GET   /locations/:locationId                 200
supplier  request_completed  GET   /locations/:locationId                 200
order     request_completed  POST  /orders/:orderId/accept                200
order     request_completed  POST  /orders/:orderId/pick-up               200
order     request_completed  POST  /orders/:orderId/start-delivery        200
order     request_completed  POST  /orders/:orderId/arrive                200
order     request_completed  POST  /orders/:orderId/confirmations         201
order     request_completed  POST  /orders/:orderId/confirmations/:id     200
```

Order's calls out to Supplier and Credit carry the same id as the request that caused them, which
is what makes those middle rows possible.

Other filters worth having ready: `?service=notification`, `?event=notification_sent`,
`?level=warn`, `?userId=<id>`, `?from=`/`?to=`, `?page=`/`?pageSize=`.

`path` is always the **route template** (`/orders/:orderId`), never the caller's URL — a token or
an email in a path segment would otherwise reach the store verbatim.

---

## 6. Known gaps, and what to say about them

Be straight about these rather than hoping nobody asks.

- **No UI for the logs.** `GET /logs` is a curl call; a page in the admin dashboard is the obvious
  next step and is not built. The gateway does route it, so the call looks like every other one in
  the demo.
- **The gateway's own lines are not in the store.** Envoy has no Kafka access logger, so they stay
  in its container log — `docker compose logs api-gateway` shows them, in the same field shape as
  every service's. Collecting them needs a sidecar or an access-log service, which is the N2H.
  Envoy also cannot supply `lineId`, so whatever collects them has to mint it.
- **A just-registered user cannot order for a second or two** (the wallet, step 0.4).
- **Completion emails and the credit transfer are both asynchronous**, so the numbers lag the
  click by a beat. Usually that is all it is - but "it will arrive" is not a guarantee: a send that
  keeps failing runs out of retries and ends in Notification's dead-letter topic, and a Credit
  command can need recovering from dead letters the same way. If a balance or an email has not
  appeared after a few seconds it is not still coming; look at the dead letters in Kafka UI on
  `:8085` instead of waiting.

---

## 7. Untested here

Said plainly so nobody assumes otherwise:

- **The frontend has not been walked.** Everything above was driven through the gateway's API. The
  pages exist (`/orders`, `/credits/history`, `/admin/*`) and the frontend container is up, but a
  click-through of the flow in the browser has not been rehearsed.
- Cancellation, the timing-change proposal, and the admin dashboard screens.
- Any run on anything other than this machine.
- The chat service, which joined the stack after this walk. Nothing below depends on it, and no
  step here exercises it.
