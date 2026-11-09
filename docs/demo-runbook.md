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
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Review: ORDER_SERVICE_KEY is a secret you have to set, not a note; the smoke check takes a
  fresh request id, because the store keeps rows and a fixed id passes forever; and the retry
  window is about 13 minutes, so a missing email is not a dead letter yet.
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Review: the first admin is only created on an empty users table, so a reused volume with no
  admin has no way back and blocks GET /logs.
Author review: Cole Lin, read and approved.
-->

# Demo runbook

The order flow end to end, with every service's log lines visible in the Centralized Logging
store. Walked against a full `docker compose up` on 2026-11-09; the numbers and status codes here
are what it actually did.

---

## 0. Before the day

Four things, none of which you want to discover live.

1. **Four secrets in the root `.env`**, each at least 32 characters
   (`openssl rand -hex 32`). The stack will not start without them, and Compose copies each one
   into the service that pairs with it:

   | Set this | Compose also fills |
   |---|---|
   | `CREDIT_SERVICE_KEY` | `ORDER_CREDIT_SERVICE_KEY` |
   | `USER_INTERNAL_SERVICE_KEY` | `NOTIFICATION_USER_SERVICE_KEY` |
   | `CHAT_TICKET_SECRET` | `ORDER_CHAT_TICKET_SECRET`, and the chat service's own copy |
   | `ORDER_SERVICE_KEY` | `USER_ORDER_SERVICE_KEY` |

   All four are rejected below 32 characters by the service that reads them, so a blank one means a
   restarting container rather than a clear error at the top.

   `CHAT_TICKET_SECRET` joined the stack after this was walked, and both Order and Chat refuse to
   start without it or with fewer than 32 characters - so leaving it out gets you two containers
   restarting rather than the healthy stack section 1 expects. `CHAT_POSTGRES_PASSWORD` wants a
   value too: its Compose default works, but only on a `chat-db` volume first created with that
   same default, which is the trap in point 3 below.

2. **`USER_BOOTSTRAP_ADMIN_EMAIL`** set to an address you can "receive" in mailpit. The first
   admin is created at startup **with no password**; it is claimed in step 3.

   **Only on an empty `users` table.** The User Service inserts that admin *if there are no users
   at all*, so on a `user-db` volume from an earlier run it logs "Users already exist; skipping the
   admin bootstrap" and changing the variable does nothing. Two consequences worth knowing before
   the day:

   - On a reused volume, claim the admin that is already there - not whatever address you have just
     put in `.env`.
   - If there are rows but no ACTIVE admin, the service says so loudly at startup ("No ACTIVE admin
     exists") and there is no reset flow out of it: recovery is a manual database change, described
     under "First admin" in `user-service/AGENTS.md`. `GET /logs` is ADMIN-only, so that blocks
     section 5 entirely. The safe move on the day is a fresh volume (`docker compose down -v`,
     which also wipes the orders and the log lines).

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
id="smoke-$(date +%s)"
curl -s -o /dev/null -H "x-request-id: $id" http://localhost:3002/locations
for attempt in $(seq 20); do
  docker exec foc-logging-db-1 psql -U foc -d logging -tAc \
    "select count(*) from log_lines where request_id = '$id';" | grep -qx 0 || break
  sleep 1
done
docker exec foc-logging-db-1 psql -U foc -d logging \
  -c "select service, event, request_id, status from log_lines where request_id = '$id';"
```

**The loop is the point.** Nothing here is synchronous: the service buffers the line and flushes
on a one-second timer, then Kafka has to deliver it and the store has to insert it. Query once,
straight after the request, and an entirely healthy pipeline shows you nothing.

A request with no token gets a 401 and writes **two** lines — `request_completed` and
`access_denied` — both carrying that id. If they are there, ingest is consuming and the store is
writing.

**A fresh id every time, not a fixed one.** The store's volume survives a `down`/`up`, so a
hard-coded id finds the rows from the last rehearsal and reports success whatever the shipper, the
consumer or the database are doing now. The whole value of this check is that the rows cannot
already exist.

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
  click by a beat. On a healthy stack that beat is a second or two, which is all you will see.

  If something does not arrive, **do not jump to the dead letters.** Both consumers retry on
  `NOTIFICATION_RETRY_DELAYS` / `CREDIT_RETRY_DELAYS`, which default to `1s,5s,30s,2m,10m` - so a
  transient failure is re-attempted over roughly **13 minutes**, waiting in a retry topic
  (`credit.commands.retry.0` … `.4`, and Notification's equivalents) and not lost. Only after that
  window does it move to a dead-letter topic (`credit.commands.dlt`,
  `notification.order-events.dlt`), and only then is it genuinely stuck and waiting for an admin.
  Kafka UI on `:8085` shows both, and which topic the message is sitting in is the answer. Nothing
  in the demo flow is worth waiting 13 minutes for on stage: say that it retries, show the topic,
  and move on.

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
