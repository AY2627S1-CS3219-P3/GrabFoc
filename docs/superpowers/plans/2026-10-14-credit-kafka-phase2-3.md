<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Wrote this implementation plan from the redesign spec §9 (Jian Bing's Kafka decisions and
       the proposals he confirmed). 2026-10-15: rewrote it after his walkthrough (K5–K13): infra/kafka,
       one topic list, central topic creation, per-consumer DLTs, tolerant reading, one PR per phase.
Author review: Jian Bing, 2026-10-18 — read in full; it matches what I decided.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
Author review: Jian Bing supplied what it states; the wording is Claude's.
-->

# Credit Service on Kafka (Phases 2–3, Credit side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credit creates wallets from `UserRegistered` events (Phase 2) and applies `TransferCredits` / `ReleaseCredits` commands from Kafka with retry topics, dead-letter topics copied into a table, and admin routes to list and replay dead letters (Phase 3).

**Architecture:** A shared Kafka broker lives in `infra/kafka/`; an init container creates every topic from one list file. One Credit consumer (group `credit-service`) dispatches by topic. Phase 2: `user.events` → create wallet; unreadable events → `credit.user-events.dlt`. Phase 3: a pure `CommandProcessor` applies a command through the existing `CreditsService` and returns the next message on failure (a retry topic with a due time, or `credit.commands.dlt`); not-yet-due retries pause their partition; a `DeadLettersService` copies both DLTs into `credit_dead_letters` and replays commands; admin-only routes expose it. Lazy wallet creation and the HTTP transfer/release routes stay (spec §9.3, #79).

**Tech Stack:** NestJS 11, `pg`, Zod 3, `@confluentinc/kafka-javascript` 1.11.0 (KafkaJS-style API), Jest, Kafka 4.1 (KRaft), Kafka UI (kafbat), Node 24 locally.

**Spec:** `docs/superpowers/specs/2026-10-14-credit-service-redesign-design.md` (§4, §7, and §9 with decisions K1–K13). Root `AGENTS.md` §3 "Messaging (Kafka)" holds the rules for every service.

**PRs (one per phase, stacked):**
- **Phase 2** (Tasks 1–5): branch `feature/credit-kafka` → PR into `feature/credit-balance` (#73). Body: `Closes #75`, `Closes #76` (separate lines), `Refs #54`, `Refs #79`. Also carries the spec, this plan and the root `AGENTS.md` changes.
- **Phase 3** (Tasks 6–10): branch `feature/credit-kafka-commands` from `feature/credit-kafka` → PR into `feature/credit-kafka`. Body: `Closes #77`, `Closes #78`, `Refs #53`, `Refs #56`, `Refs #60`, `Refs #79`.

## Global Constraints

- Every AI-touched file gets an `AI Assistance Disclosure` header (append a dated `Tool/Scope/Author review` block to files that already have one); log the work in `ai/usage-log/jian-bing.md` with the exact prompts (root `AGENTS.md`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Never log balances, tokens or the service key (NFR5.1, root `AGENTS.md` §8).
- Topics (spec §9.2): `user.events` (key `userId`, 3 partitions), `credit.commands` (key `orderId`, 3), `credit.commands.retry.<i>` (1 each, from `CREDIT_RETRY_DELAYS`), `credit.commands.dlt` (1), `credit.user-events.dlt` (1). **No service creates topics** (K9).
- `CREDIT_RETRY_DELAYS` default `1s,5s,30s,2m,10m`, read by both `kafka-init` and the Credit Service (K10).
- Commands are validated strictly; `UserRegistered` is read tolerantly: only `type === "UserRegistered"` and a UUID `userId` are required (K12).
- Dead-letter routes: `GET /admin/credits/dead-letters?status=open|replayed|all`, `POST /admin/credits/dead-letters/:eventId/replay`; ADMIN JWT only; codes `DEAD_LETTER_NOT_FOUND` (404), `ALREADY_REPLAYED` (409), `NOT_REPLAYABLE` (409).
- Images: `apache/kafka:4.1.0`, `ghcr.io/kafbat/kafka-ui:v1.3.0` (both verified to exist). Kafka host port `127.0.0.1:9094`; Kafka UI `127.0.0.1:8085`.
- Do not remove `ensureAccount` or the `/internal/credits/{transfer,release}` routes (#79).
- Use **Node 24** on the host (`credit-service/.nvmrc`): the client's prebuilt binaries cover Node 18–24; Node 26 compiles librdkafka from source. The Docker image (`node:22-alpine`) gets a prebuilt binary.

## Review Focus

1. A retry message that isn't due yet must not be applied early, and must not hold up other topics → Task 9 "retries a transfer whose wallet is missing, then applies it, without holding up other topics".
2. A replayed command that dies again reopens its row; an older duplicate DLT message must not reopen a replayed row → Task 7 tests.
3. Unreadable messages (not JSON, no ids) reach their DLT without blocking the partition, and two of them don't overwrite each other → Tasks 4, 6, 9 and Task 7 "keeps two malformed messages apart".
4. A database outage while applying a command is retried, not dead-lettered → Task 6 "retries an unexpected error such as the database being down".
5. A USER with a valid token gets 403 on both admin routes before any validation, logged; a user-event dead letter can't be replayed → Task 8 tests and Task 7 "refuses to replay a user-event dead letter".

---

# Phase 2 — broker and wallets (PR 1)

### Task 1: Kafka in `infra/kafka`

**Files:**
- Create: `infra/kafka/compose.yaml`, `infra/kafka/topics.txt`, `infra/kafka/create-topics.sh`, `infra/kafka/README.md`
- Modify: `compose.yaml` (root), `credit-service/compose.yaml`, `.env.example`

**Interfaces:**
- Produces: broker `kafka:9092` (Compose) / `localhost:9094` (host); every topic in Global Constraints; Kafka UI `http://localhost:8085`; env vars `CREDIT_KAFKA_BROKERS`, `CREDIT_RETRY_DELAYS`, `CREDIT_TEST_KAFKA_BROKERS`.

- [ ] **Step 1: Write `infra/kafka/topics.txt`**

```
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Listed the topics from the redesign spec §9.2.
# Author review: pending — Jian Bing to record what he checked.
#
# Every Kafka topic in the system, created by kafka-init (root AGENTS.md §3 Messaging, rule 4).
# Add a topic by adding a line: <name> <partitions>. Partitions can be raised later, never lowered.
# Credit's retry topics are not listed: kafka-init creates one per entry in CREDIT_RETRY_DELAYS.

# Events, written by their owner
user.events 3

# Commands, written to the receiver's topic
credit.commands 3

# Dead-letter topics, one per consumer and source topic (rule 6)
credit.commands.dlt 1
credit.user-events.dlt 1
```

- [ ] **Step 2: Write `infra/kafka/create-topics.sh`**

```sh
#!/bin/sh
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Generated the topic creation run by kafka-init (spec §9.2, decisions K9–K10).
# Author review: pending — Jian Bing to record what he checked.
#
# Creates every topic in topics.txt, then Credit's retry topics. Safe to run again: existing topics
# are left alone.
set -eu

BOOTSTRAP=kafka:9092

create() {
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$1" --partitions "$2" --replication-factor 1
}

# Skip comments and blank lines; read from a file (not a pipe) so a failure stops the script.
grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' /topics.txt > /tmp/topics
while read -r name partitions; do
  create "$name" "$partitions"
done < /tmp/topics

# One retry topic per delay, so their number always matches what the Credit Service expects.
i=0
for _delay in $(echo "$CREDIT_RETRY_DELAYS" | tr ',' ' '); do
  create "credit.commands.retry.$i" 1
  i=$((i + 1))
done
```

- [ ] **Step 3: Write `infra/kafka/compose.yaml`**

```yaml
# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Generated the shared Kafka broker, topic init container and Kafka UI (spec §9.2, K7, K9).
# Author review: pending — Jian Bing to record what he checked.
#
# Shared by every service, so it lives in infra/ rather than in one service's folder.
# One KRaft broker (no ZooKeeper), replication factor 1: local only, not for the cloud.

name: foc

services:
  kafka:
    image: apache/kafka:4.1.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      # PLAINTEXT for containers, EXTERNAL for tools and tests on the host, CONTROLLER for KRaft.
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093,EXTERNAL://:9094
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,EXTERNAL://localhost:9094
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,EXTERNAL:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      # Topics come only from topics.txt, so a typo in a topic name fails loudly instead of
      # silently creating a new topic.
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_LOG_DIRS: /var/lib/kafka/data
    ports:
      # Host tools and the Kafka tests; localhost only because there is no authentication.
      - "127.0.0.1:9094:9094"
    volumes:
      # Named volume, so messages survive `docker compose down` (root AGENTS.md §8).
      - kafka-data:/var/lib/kafka/data
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 > /dev/null 2>&1"]
      interval: 5s
      timeout: 10s
      retries: 20

  # Creates every topic once, then exits.
  kafka-init:
    image: apache/kafka:4.1.0
    depends_on:
      kafka:
        condition: service_healthy
    environment:
      # Same variable and default as the Credit Service, so the retry topics match (K10).
      CREDIT_RETRY_DELAYS: ${CREDIT_RETRY_DELAYS:-1s,5s,30s,2m,10m}
    volumes:
      - ./topics.txt:/topics.txt:ro
      - ./create-topics.sh:/create-topics.sh:ro
    entrypoint: ["/bin/sh", "/create-topics.sh"]
    restart: "no"

  # Web UI for topics and messages, used to demo the async workflow.
  kafka-ui:
    image: ghcr.io/kafbat/kafka-ui:v1.3.0
    depends_on:
      kafka:
        condition: service_healthy
    environment:
      KAFKA_CLUSTERS_0_NAME: foc
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
    ports:
      # No login, so localhost only.
      - "127.0.0.1:8085:8080"

volumes:
  kafka-data:
```

- [ ] **Step 4: Include it from the root `compose.yaml`** before the Credit Service, with a dated disclosure block (`Scope: Included infra/kafka/compose.yaml.`):

```yaml
  - path: supplier-service/compose.yaml
    env_file: .env
  - path: infra/kafka/compose.yaml
    env_file: .env
  - path: credit-service/compose.yaml
    env_file: .env
```

- [ ] **Step 5: Point the Credit Service at Kafka** in `credit-service/compose.yaml` (dated disclosure block):

```yaml
    depends_on:
      credit-db:
        condition: service_healthy
      # Every topic must exist before Credit subscribes; no service creates topics.
      kafka-init:
        condition: service_completed_successfully
```

```yaml
      CREDIT_KAFKA_BROKERS: kafka:9092
      # Same default as kafka-init, which creates one retry topic per entry.
      CREDIT_RETRY_DELAYS: ${CREDIT_RETRY_DELAYS:-1s,5s,30s,2m,10m}
```

- [ ] **Step 6: Add the variables to `.env.example`** (Credit section; dated line in its header):

```
# Kafka bootstrap servers, comma-separated. Compose sets kafka:9092; from the host use localhost:9094.
CREDIT_KAFKA_BROKERS=
# Wait before each automatic retry of a credit command. kafka-init creates one retry topic per entry.
# Empty means 1s,5s,30s,2m,10m.
CREDIT_RETRY_DELAYS=
# Broker for `npm run test:kafka`; defaults to localhost:9094.
CREDIT_TEST_KAFKA_BROKERS=
```

- [ ] **Step 7: Write `infra/kafka/README.md`**

```markdown
<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
Scope: Wrote this README for the shared Kafka setup.
Author review: pending — Jian Bing to record what he checked.
-->

# Kafka (shared message broker)

One KRaft broker for every service (redesign spec §9; rules in root `AGENTS.md` §3 "Messaging").
Started by the root `docker compose up`; only Kafka: `docker compose up -d kafka kafka-init kafka-ui`.

| What | Where |
|---|---|
| Broker, from containers | `kafka:9092` |
| Broker, from the host | `localhost:9094` |
| Kafka UI | http://localhost:8085 |

**Topics** are never auto-created. `kafka-init` creates every topic in `topics.txt`, plus one
`credit.commands.retry.<i>` per entry in `CREDIT_RETRY_DELAYS`. To add a topic, add a line to
`topics.txt` and run `docker compose up kafka-init`.

**Local only:** one broker, no authentication, replication factor 1 (losing the volume loses the
messages). The cloud needs a managed Kafka (e.g. Amazon MSK) or a private, authenticated broker (#58).
```

- [ ] **Step 8: Verify**

Run: `docker compose up -d kafka kafka-init kafka-ui && docker compose wait kafka-init && docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list`
Expected: `kafka-init` exits 0; the list is exactly `credit.commands`, `credit.commands.dlt`, `credit.commands.retry.0` … `.retry.4`, `credit.user-events.dlt`, `user.events` (plus internal `__consumer_offsets` if present). `docker compose up kafka-init` a second time also exits 0. `curl -s -o /dev/null -w '%{http_code}' http://localhost:8085` prints `200`. `docker compose config --quiet && echo ok` prints `ok`.

- [ ] **Step 9: Commit**

```bash
git add infra compose.yaml credit-service/compose.yaml .env.example
git commit -m "feat(infra): shared Kafka broker, topic list and Kafka UI in infra/kafka

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Node 24, client library, configuration and topic names

**Files:**
- Create: `credit-service/.nvmrc`, `credit-service/src/messaging/topics.ts`, `credit-service/src/messaging/topics.spec.ts`
- Modify: `credit-service/package.json`, `credit-service/package-lock.json`, `credit-service/src/config.ts`, `credit-service/src/test/env.setup.ts`

**Interfaces:**
- Produces: `parseDelays(spec: string): number[]`; `buildTopics(delaysMs: number[], prefix?: string): Topics`; `interface RetryTopic { topic: string; delayMs: number }`; `interface Topics { userEvents: string; commands: string; retries: RetryTopic[]; commandsDeadLetter: string; userEventsDeadLetter: string }`; `const TOPICS: unique symbol`; `config.kafkaBrokers: string[]`, `config.kafkaGroupId: string`, `config.retryDelaysMs: number[]`.

- [ ] **Step 1: Switch to Node 24**

Create `credit-service/.nvmrc` containing `24`. Run: `cd credit-service && nvm install && nvm use && node -v`
Expected: `v24.x`. (If `nvm` isn't installed, stop and ask Jian Bing how he manages Node versions.)

- [ ] **Step 2: Write the failing test** `credit-service/src/messaging/topics.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated unit tests for the retry-delay parser and topic names (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { buildTopics, parseDelays } from './topics';

describe('parseDelays', () => {
  it('reads the default list', () => {
    expect(parseDelays('1s,5s,30s,2m,10m')).toEqual([1000, 5000, 30000, 120000, 600000]);
  });

  it('accepts milliseconds and spaces', () => {
    expect(parseDelays(' 300ms , 2s ')).toEqual([300, 2000]);
  });

  it('reads an empty string as no retries', () => {
    expect(parseDelays('')).toEqual([]);
  });

  it.each(['5', '0s', '-1s', '1h', '1.5s', '1s,,2s'])('rejects %p', (spec) => {
    expect(() => parseDelays(spec)).toThrow(/Invalid retry delay/);
  });
});

describe('buildTopics', () => {
  it('matches the names in infra/kafka/topics.txt and create-topics.sh', () => {
    expect(buildTopics([1000, 5000])).toEqual({
      userEvents: 'user.events',
      commands: 'credit.commands',
      retries: [
        { topic: 'credit.commands.retry.0', delayMs: 1000 },
        { topic: 'credit.commands.retry.1', delayMs: 5000 },
      ],
      commandsDeadLetter: 'credit.commands.dlt',
      userEventsDeadLetter: 'credit.user-events.dlt',
    });
  });

  it('prefixes every name, so tests never touch the real topics', () => {
    const t = buildTopics([1000], 'test-1.');
    expect([t.userEvents, t.commands, t.retries[0].topic, t.commandsDeadLetter, t.userEventsDeadLetter]).toEqual([
      'test-1.user.events',
      'test-1.credit.commands',
      'test-1.credit.commands.retry.0',
      'test-1.credit.commands.dlt',
      'test-1.credit.user-events.dlt',
    ]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd credit-service && npx jest src/messaging/topics.spec.ts`
Expected: FAIL, `Cannot find module './topics'`.

- [ ] **Step 4: Write `credit-service/src/messaging/topics.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the topic names and the retry-delay parser from spec §9.2.
 * Author review: pending — Jian Bing to record what he checked.
 */

export interface RetryTopic {
  topic: string;
  delayMs: number;
}

/** The topics Credit reads and writes. kafka-init creates them all (infra/kafka); Credit creates none. */
export interface Topics {
  userEvents: string;
  commands: string;
  /** One per retry, in order: a command's n-th failure goes to retries[n - 1]. */
  retries: RetryTopic[];
  commandsDeadLetter: string;
  userEventsDeadLetter: string;
}

/** Injection token for the Topics in use. */
export const TOPICS = Symbol('TOPICS');

const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000 };

/** "1s,5s,30s,2m,10m" → [1000, 5000, 30000, 120000, 600000]. An empty string means no retries. */
export function parseDelays(spec: string): number[] {
  if (spec.trim() === '') return [];
  return spec.split(',').map((part) => {
    const match = /^(\d+)(ms|s|m)$/.exec(part.trim());
    if (!match || Number(match[1]) <= 0) {
      throw new Error(
        `Invalid retry delay "${part.trim()}": use a positive whole number followed by ms, s or m, e.g. 30s.`,
      );
    }
    return Number(match[1]) * UNIT_MS[match[2]];
  });
}

/**
 * The topic names Credit uses; keep them in step with infra/kafka/topics.txt and create-topics.sh.
 * `prefix` keeps the Kafka tests' topics apart from the real ones.
 */
export function buildTopics(delaysMs: number[], prefix = ''): Topics {
  const commands = `${prefix}credit.commands`;
  return {
    userEvents: `${prefix}user.events`,
    commands,
    retries: delaysMs.map((delayMs, i) => ({ topic: `${commands}.retry.${i}`, delayMs })),
    commandsDeadLetter: `${commands}.dlt`,
    userEventsDeadLetter: `${prefix}credit.user-events.dlt`,
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd credit-service && npx jest src/messaging/topics.spec.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Install the client and add the configuration**

Run: `cd credit-service && npm install @confluentinc/kafka-javascript@1.11.0`
Expected: installs quickly with a prebuilt binary on Node 24. If it fails, stop and ask Jian Bing whether to switch to `kafkajs`.

In `credit-service/src/config.ts` add (and a dated disclosure block):

```ts
import { parseDelays } from './messaging/topics';
```

```ts
  // Kafka bootstrap servers, comma-separated: kafka:9092 inside Compose, localhost:9094 from the host.
  kafkaBrokers: required('CREDIT_KAFKA_BROKERS')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean),
  // The Kafka tests set their own, so they never take the running service's messages.
  kafkaGroupId: 'credit-service',
  // Wait before each automatic retry of a credit command. kafka-init creates one retry topic per
  // entry from the same variable (K10). `||`, not `??`: an unset variable reaches us as "".
  retryDelaysMs: parseDelays(process.env.CREDIT_RETRY_DELAYS || '1s,5s,30s,2m,10m'),
```

In `credit-service/src/test/env.setup.ts` add:

```ts
// Nothing listens on port 1; the Kafka tests use CREDIT_TEST_KAFKA_BROKERS instead.
process.env.CREDIT_KAFKA_BROKERS = '127.0.0.1:1';
process.env.CREDIT_RETRY_DELAYS = '';
```

- [ ] **Step 7: Verify the image builds and the unit tests pass**

Run: `docker compose build credit-service && cd credit-service && npx tsc --noEmit -p . && npm test`
Expected: build succeeds; no type errors; 79 unit tests pass (68 + 11).

- [ ] **Step 8: Commit**

```bash
git add credit-service/.nvmrc credit-service/package.json credit-service/package-lock.json credit-service/src/config.ts credit-service/src/test/env.setup.ts credit-service/src/messaging/topics.ts credit-service/src/messaging/topics.spec.ts
git commit -m "feat(credit-service): Kafka client, broker config and topic names (Node 24)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Message shapes and wallet creation

**Files:**
- Create: `credit-service/src/messaging/messages.ts`, `credit-service/src/messaging/messages.spec.ts`
- Modify: `credit-service/src/credits/credits.service.ts`, `credit-service/src/credits/credits.service.int.spec.ts`

**Interfaces:**
- Produces: `InboundMessage { topic; key: string | null; value: Buffer | null; headers: Record<string, string> }`; `OutboundMessage { topic; key: string | null; value: string; headers: Record<string, string> }`; `Publisher { send(message: OutboundMessage): Promise<void> }`; `PUBLISHER`; `HEADER = { attempt: 'x-attempt', dueAt: 'x-due-at', error: 'x-error', errorCode: 'x-error-code', sourceTopic: 'x-source-topic', deadLetteredAt: 'x-dead-lettered-at' }`; `class InvalidMessageError extends Error`; `type CreditCommand`; `interface UserRegistered { userId: string; eventId: string | null }`; `parseCommand(value): CreditCommand`; `parseUserEvent(value): UserRegistered | null`; `peekIds(value): { eventId; orderId; type }`; `CreditsService.createWallet(userId: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing unit test** `credit-service/src/messaging/messages.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated unit tests for the command parser (strict) and the UserRegistered reader
 *        (tolerant, decision K12).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { randomUUID } from 'crypto';
import { InvalidMessageError, parseCommand, parseUserEvent, peekIds } from './messages';

const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const eventId = randomUUID();
const orderId = randomUUID();
const userId = randomUUID();

describe('parseCommand', () => {
  it('reads a transfer', () => {
    const courierId = randomUUID();
    expect(parseCommand(json({ type: 'TransferCredits', eventId, orderId, courierId }))).toEqual({
      type: 'TransferCredits',
      eventId,
      orderId,
      courierId,
    });
  });

  it('reads a release', () => {
    expect(parseCommand(json({ type: 'ReleaseCredits', eventId, orderId }))).toEqual({
      type: 'ReleaseCredits',
      eventId,
      orderId,
    });
  });

  it('rejects unknown fields, because Credit owns this contract', () => {
    expect(() => parseCommand(json({ type: 'ReleaseCredits', eventId, orderId, amount: 5 }))).toThrow(
      InvalidMessageError,
    );
  });

  it('rejects an unknown type', () => {
    expect(() => parseCommand(json({ type: 'RefundCredits', eventId, orderId }))).toThrow(InvalidMessageError);
  });

  it('rejects a value that is not JSON', () => {
    expect(() => parseCommand(Buffer.from('not json'))).toThrow(/not valid JSON/);
  });

  it('rejects an empty message', () => {
    expect(() => parseCommand(null)).toThrow(InvalidMessageError);
  });
});

describe('parseUserEvent (tolerant reader)', () => {
  it('reads the user id and event id', () => {
    expect(
      parseUserEvent(json({ type: 'UserRegistered', eventId, userId, occurredAt: '2026-10-15T10:00:00Z' })),
    ).toEqual({ userId, eventId });
  });

  it('needs nothing but the user id: no occurredAt, extra fields and a bad event id are fine', () => {
    expect(parseUserEvent(json({ type: 'UserRegistered', userId, eventId: 'evt-1', email: 'x@u.nus.edu' }))).toEqual({
      userId,
      eventId: null,
    });
  });

  it('lower-cases the user id', () => {
    expect(parseUserEvent(json({ type: 'UserRegistered', userId: userId.toUpperCase() }))?.userId).toBe(userId);
  });

  it('ignores other event types on the topic', () => {
    expect(parseUserEvent(json({ type: 'UserSuspended', userId }))).toBeNull();
  });

  it('rejects a UserRegistered without a valid user id', () => {
    expect(() => parseUserEvent(json({ type: 'UserRegistered', userId: 'nope' }))).toThrow(InvalidMessageError);
  });

  it('rejects a value that is not a JSON object', () => {
    expect(() => parseUserEvent(Buffer.from('not json'))).toThrow(InvalidMessageError);
    expect(() => parseUserEvent(json([1, 2]))).toThrow(InvalidMessageError);
  });
});

describe('peekIds', () => {
  it('reads ids from a valid command, lower-cased', () => {
    expect(peekIds(json({ type: 'ReleaseCredits', eventId: eventId.toUpperCase(), orderId }))).toEqual({
      eventId,
      orderId,
      type: 'ReleaseCredits',
    });
  });

  it('returns nulls for a message it can’t read', () => {
    expect(peekIds(Buffer.from('not json'))).toEqual({ eventId: null, orderId: null, type: null });
  });

  it('drops ids that aren’t UUIDs', () => {
    expect(peekIds(json({ type: 'ReleaseCredits', eventId: '1', orderId: 'x' }))).toEqual({
      eventId: null,
      orderId: null,
      type: 'ReleaseCredits',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd credit-service && npx jest src/messaging/messages.spec.ts`
Expected: FAIL, `Cannot find module './messages'`.

- [ ] **Step 3: Write `credit-service/src/messaging/messages.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the message types, headers and parsers: credit commands strictly (Credit owns
 *        them, K6) and UserRegistered tolerantly (the User Service owns it, K12).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { z } from 'zod';

/** A message as Credit sees it, whichever Kafka client delivered it. */
export interface InboundMessage {
  topic: string;
  key: string | null;
  value: Buffer | null;
  headers: Record<string, string>;
}

export interface OutboundMessage {
  topic: string;
  key: string | null;
  value: string;
  headers: Record<string, string>;
}

export interface Publisher {
  send(message: OutboundMessage): Promise<void>;
}

/** Injection token for the Publisher (Kafka in the app, a fake in tests). */
export const PUBLISHER = Symbol('PUBLISHER');

/** Headers Credit adds to messages it retries or dead-letters. */
export const HEADER = {
  /** How many times the message has failed so far. */
  attempt: 'x-attempt',
  /** When a retry may run, in milliseconds since the epoch. */
  dueAt: 'x-due-at',
  error: 'x-error',
  errorCode: 'x-error-code',
  /** The topic the message originally came from. */
  sourceTopic: 'x-source-topic',
  deadLetteredAt: 'x-dead-lettered-at',
} as const;

/** A message that can never be handled, however often it is retried. */
export class InvalidMessageError extends Error {}

const uuid = z.string().uuid();

// Credit owns the command contract, so unknown fields are rejected (root AGENTS.md §8).
export const creditCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TransferCredits'), eventId: uuid, orderId: uuid, courierId: uuid }).strict(),
  z.object({ type: z.literal('ReleaseCredits'), eventId: uuid, orderId: uuid }).strict(),
]);
export type CreditCommand = z.infer<typeof creditCommandSchema>;

// The User Service owns UserRegistered (K6). Credit reads only what it uses (K12): the user id,
// and the event id for logs when it is a valid one. Everything else is ignored.
const userRegisteredSchema = z.object({
  userId: uuid,
  eventId: uuid.optional().catch(undefined),
});

export interface UserRegistered {
  userId: string;
  eventId: string | null;
}

function parseJson(value: Buffer | null): unknown {
  if (!value) throw new InvalidMessageError('The message has no value.');
  try {
    return JSON.parse(value.toString('utf8'));
  } catch {
    throw new InvalidMessageError('The message is not valid JSON.');
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

export function parseCommand(value: Buffer | null): CreditCommand {
  const result = creditCommandSchema.safeParse(parseJson(value));
  if (!result.success) throw new InvalidMessageError(`Invalid credit command: ${describeIssues(result.error)}`);
  return result.data;
}

/** The UserRegistered event in `value`, or null for any other event type on the topic. */
export function parseUserEvent(value: Buffer | null): UserRegistered | null {
  const json = parseJson(value);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new InvalidMessageError('The message is not a JSON object.');
  }
  if ((json as { type?: unknown }).type !== 'UserRegistered') return null;
  const result = userRegisteredSchema.safeParse(json);
  if (!result.success) throw new InvalidMessageError(`Invalid UserRegistered event: ${describeIssues(result.error)}`);
  return { userId: result.data.userId.toLowerCase(), eventId: result.data.eventId?.toLowerCase() ?? null };
}

/** Best-effort ids for logs and the dead-letter table; nulls when the message can't be read. */
export function peekIds(value: Buffer | null): { eventId: string | null; orderId: string | null; type: string | null } {
  let json: unknown;
  try {
    json = parseJson(value);
  } catch {
    return { eventId: null, orderId: null, type: null };
  }
  const fields = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const id = (v: unknown) => (uuid.safeParse(v).success ? (v as string).toLowerCase() : null);
  return {
    eventId: id(fields.eventId),
    orderId: id(fields.orderId),
    type: typeof fields.type === 'string' ? fields.type.slice(0, 64) : null,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd credit-service && npx jest src/messaging/messages.spec.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Write the failing integration test** — append to `credit-service/src/credits/credits.service.int.spec.ts` (dated disclosure block):

```ts
describe('createWallet', () => {
  it('creates a wallet with 10 credits', async () => {
    const userId = randomUUID();
    expect(await service.createWallet(userId)).toBe(true);
    expect(await balance(userId)).toEqual({ available: 10, reserved: 0 });
  });

  it('does nothing for a repeated event, so credits are never granted twice', async () => {
    const userId = randomUUID();
    await service.createWallet(userId);
    await pool.query('UPDATE credit_accounts SET available = 4 WHERE user_id = $1', [userId]);
    expect(await service.createWallet(userId)).toBe(false);
    expect(await balance(userId)).toEqual({ available: 4, reserved: 0 });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `docker compose up -d credit-db && cd credit-service && npm run test:int -- src/credits/credits.service.int.spec.ts -t createWallet`
Expected: FAIL, `Property 'createWallet' does not exist on type 'CreditsService'`.

- [ ] **Step 7: Add `createWallet` to `CreditsService`** (after `getBalance`; header: `Scope: Added createWallet (Kafka plan Task 3).`)

```ts
  /** Creates a wallet with the starting credits; false when it already existed (spec §4.1). */
  async createWallet(userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'INSERT INTO credit_accounts (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [userId],
    );
    return rowCount === 1;
  }
```

- [ ] **Step 8: Run the whole integration suite**

Run: `cd credit-service && npm run test:int`
Expected: PASS, 32 tests (30 + 2).

- [ ] **Step 9: Commit**

```bash
git add credit-service/src/messaging/messages.ts credit-service/src/messaging/messages.spec.ts credit-service/src/credits/credits.service.ts credit-service/src/credits/credits.service.int.spec.ts
git commit -m "feat(credit-service): parse credit commands and UserRegistered; create wallets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Kafka connection and the wallet consumer

**Files:**
- Create: `credit-service/src/messaging/kafka.connection.ts`, `credit-service/src/messaging/kafka.runner.ts`, `credit-service/src/messaging/wallets.kafka.spec.ts`, `credit-service/src/test/kafka.ts`, `credit-service/jest.kafka.config.js`
- Modify: `credit-service/src/app.module.ts`, `credit-service/package.json`, `credit-service/src/test/database.ts`

**Interfaces:**
- Consumes: `Topics`, `TOPICS`, `buildTopics` (Task 2); `HEADER`, `InboundMessage`, `OutboundMessage`, `Publisher`, `PUBLISHER`, `InvalidMessageError`, `parseUserEvent` (Task 3); `CreditsService.createWallet`.
- Produces: `class KafkaConnection implements Publisher { readonly kafka: KafkaJS.Kafka; onModuleInit(); onModuleDestroy(); send(message) }`; `toInbound(topic, message: KafkaJS.KafkaMessage): InboundMessage`; `class KafkaRunner { constructor(credits: CreditsService, connection: KafkaConnection, topics: Topics); onApplicationBootstrap(); onModuleDestroy() }` (Task 9 adds a `DeadLettersService` parameter); `setting(name)` exported from `src/test/database.ts`; `testKafkaBrokers()`, `waitFor()`, `createTestTopics()`, `collect()` in `src/test/kafka.ts`; npm script `test:kafka`.

- [ ] **Step 1: Add the Kafka test config and helpers**

`credit-service/jest.kafka.config.js`:

```js
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Jest config for the tests that need a real Kafka broker, following jest.int.config.js.
 * Author review: pending — Jian Bing to record what he checked.
 */

// The Kafka tests (*.kafka.spec.ts) need `docker compose up -d kafka credit-db`.
module.exports = {
  ...require('./package.json').jest,
  testMatch: ['**/*.kafka.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // They share the credit_test tables with the integration tests.
  maxWorkers: 1,
  testTimeout: 60000,
};
```

In `credit-service/package.json` add the script `"test:kafka": "jest --config jest.kafka.config.js"` and add `"\\.kafka\\.spec\\.ts$"` to `jest.testPathIgnorePatterns`. In `credit-service/src/test/database.ts` change `function setting` to `export function setting`.

`credit-service/src/test/kafka.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated helpers for the Kafka tests.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { randomUUID } from 'crypto';
import { Topics } from '../messaging/topics';
import { setting } from './database';

/** The broker the Kafka tests use: CREDIT_TEST_KAFKA_BROKERS, else the Compose broker's host port. */
export function testKafkaBrokers(): string {
  return setting('CREDIT_TEST_KAFKA_BROKERS') || 'localhost:9094';
}

/** Polls `check` every 100 ms until it returns something truthy, or fails after `timeoutMs`. */
export async function waitFor<T>(check: () => Promise<T | null | undefined | false>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const allTopics = (t: Topics) => [
  t.userEvents,
  t.commands,
  ...t.retries.map((r) => r.topic),
  t.commandsDeadLetter,
  t.userEventsDeadLetter,
];

/**
 * Creates the test's own prefixed topics, standing in for kafka-init. One partition each, so
 * messages sent one after another are handled in that order. Returns a function deleting them.
 */
export async function createTestTopics(admin: KafkaJS.Admin, topics: Topics): Promise<() => Promise<void>> {
  const names = allTopics(topics);
  await admin.createTopics({ topics: names.map((topic) => ({ topic, numPartitions: 1 })) });
  return () => admin.deleteTopics({ topics: names });
}

/** Reads every message on `topic` into the returned array, from the start, until `stop()`. */
export async function collect(
  kafka: KafkaJS.Kafka,
  topic: string,
): Promise<{ messages: KafkaJS.KafkaMessage[]; stop: () => Promise<void> }> {
  const messages: KafkaJS.KafkaMessage[] = [];
  const consumer = kafka.consumer({ kafkaJS: { groupId: `collect-${randomUUID()}`, fromBeginning: true } });
  await consumer.connect();
  await consumer.subscribe({ topics: [topic] });
  await consumer.run({
    eachMessage: async ({ message }) => {
      messages.push(message);
    },
  });
  return { messages, stop: () => consumer.disconnect() };
}
```

- [ ] **Step 2: Write the failing test** `credit-service/src/messaging/wallets.kafka.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated end-to-end tests against a real Kafka broker and PostgreSQL for wallets from
 *        UserRegistered and the user-event dead-letter topic (spec §7, §9; K11–K12).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { config } from '../config';
import { CreditsService } from '../credits/credits.service';
import { emptyTables, openTestDatabase } from '../test/database';
import { collect, createTestTopics, testKafkaBrokers, waitFor } from '../test/kafka';
import { KafkaConnection } from './kafka.connection';
import { KafkaRunner } from './kafka.runner';
import { HEADER } from './messages';
import { buildTopics } from './topics';

// Own topics and consumer group, so a running Credit Service never sees these messages.
const prefix = `test-${randomUUID().slice(0, 8)}.`;
const topics = buildTopics([1000], prefix);

let pool: Pool;
let connection: KafkaConnection;
let admin: KafkaJS.Admin;
let deleteTopics: () => Promise<void>;
let runner: KafkaRunner;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  config.kafkaBrokers = [testKafkaBrokers()];
  config.kafkaGroupId = `credit-test-${prefix}`;
  pool = await openTestDatabase();
  connection = new KafkaConnection();
  admin = connection.kafka.admin();
  await admin.connect();
  deleteTopics = await createTestTopics(admin, topics);
  await connection.onModuleInit();
  runner = new KafkaRunner(new CreditsService(pool), connection, topics);
  await runner.onApplicationBootstrap();
});
afterAll(async () => {
  await runner?.onModuleDestroy();
  await connection?.onModuleDestroy();
  await deleteTopics?.();
  await admin?.disconnect();
  await pool?.end();
  jest.restoreAllMocks();
});
beforeEach(() => emptyTables(pool));

const send = (key: string, body: unknown) =>
  connection.send({
    topic: topics.userEvents,
    key,
    value: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {},
  });
const registered = (userId: string) => ({
  type: 'UserRegistered',
  eventId: randomUUID(),
  userId,
  occurredAt: new Date().toISOString(),
});
async function balanceOf(userId: string): Promise<{ available: number; reserved: number } | undefined> {
  const { rows } = await pool.query('SELECT available, reserved FROM credit_accounts WHERE user_id = $1', [userId]);
  return rows[0];
}
/** Sends a valid event last and waits for it: once handled, everything sent before it has been. */
async function drain(): Promise<void> {
  const marker = randomUUID();
  await send(marker, registered(marker));
  await waitFor(() => balanceOf(marker));
}

it('creates one wallet with 10 credits from a duplicated UserRegistered', async () => {
  const userId = randomUUID();
  const event = registered(userId);
  await send(userId, event);
  await send(userId, event);
  await drain();

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM credit_accounts WHERE user_id = $1', [userId]);
  expect(rows[0].n).toBe(1);
  expect(await balanceOf(userId)).toEqual({ available: 10, reserved: 0 });
});

it('ignores other event types on user.events', async () => {
  const userId = randomUUID();
  await send(userId, { type: 'UserSuspended', userId });
  await drain();
  expect(await balanceOf(userId)).toBeUndefined();
});

// Review Focus 3
it('sends an unreadable UserRegistered to credit.user-events.dlt without stopping the partition', async () => {
  const dlt = await collect(connection.kafka, topics.userEventsDeadLetter);
  try {
    await send('bad-1', { type: 'UserRegistered', userId: 'not-a-uuid' });
    await send('bad-2', 'not json');
    await drain();

    await waitFor(async () => dlt.messages.length >= 2);
    const [first, second] = dlt.messages;
    expect(first.value?.toString()).toBe(JSON.stringify({ type: 'UserRegistered', userId: 'not-a-uuid' }));
    expect(first.headers?.[HEADER.sourceTopic]?.toString()).toBe(topics.userEvents);
    expect(first.headers?.[HEADER.error]?.toString()).toMatch(/userId/);
    expect(first.headers?.[HEADER.attempt]?.toString()).toBe('1');
    expect(second.value?.toString()).toBe('not json');
  } finally {
    await dlt.stop();
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker compose up -d kafka credit-db && cd credit-service && npm run test:kafka`
Expected: FAIL, `Cannot find module './kafka.connection'`.

- [ ] **Step 4: Write `credit-service/src/messaging/kafka.connection.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the Kafka client and producer (spec §9.2: @confluentinc/kafka-javascript).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../config';
import { InboundMessage, OutboundMessage, Publisher } from './messages';

@Injectable()
export class KafkaConnection implements Publisher, OnModuleInit, OnModuleDestroy {
  readonly kafka = new KafkaJS.Kafka({
    kafkaJS: { clientId: 'credit-service', brokers: config.kafkaBrokers, logLevel: KafkaJS.logLevel.WARN },
  });

  // acks = all in-sync replicas is the default; idempotent stops a retried send writing twice.
  private readonly producer = this.kafka.producer({ kafkaJS: { idempotent: true } });

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async send({ topic, key, value, headers }: OutboundMessage): Promise<void> {
    await this.producer.send({ topic, messages: [{ key, value, headers }] });
  }
}

/** Converts a consumed message to Credit's own shape; a repeated header keeps its last value. */
export function toInbound(topic: string, message: KafkaJS.KafkaMessage): InboundMessage {
  const headers: Record<string, string> = {};
  for (const [name, raw] of Object.entries(message.headers ?? {})) {
    const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    if (value !== undefined) headers[name] = value.toString();
  }
  return { topic, key: message.key ? message.key.toString() : null, value: message.value ?? null, headers };
}
```

- [ ] **Step 5: Write `credit-service/src/messaging/kafka.runner.ts`** (Phase 2: user events only)

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the Kafka consumer for wallets from UserRegistered, with unreadable events sent
 *        to credit.user-events.dlt (spec §9.2, K11–K12).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config';
import { CreditsService } from '../credits/credits.service';
import { KafkaConnection, toInbound } from './kafka.connection';
import { HEADER, InboundMessage, InvalidMessageError, parseUserEvent } from './messages';
import { Topics, TOPICS } from './topics';

/** How long a partition rests after an unexpected error (e.g. the database is down). */
const ERROR_PAUSE_MS = 5000;

@Injectable()
export class KafkaRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Kafka');
  private readonly timers = new Set<NodeJS.Timeout>();
  private consumer?: KafkaJS.Consumer;

  constructor(
    private readonly credits: CreditsService,
    private readonly connection: KafkaConnection,
    @Inject(TOPICS) private readonly topics: Topics,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // fromBeginning: a new group starts at the oldest message, so no event sent before Credit
    // first started is missed. Offsets are stored only after eachMessage succeeds.
    this.consumer = this.connection.kafka.consumer({ kafkaJS: { groupId: config.kafkaGroupId, fromBeginning: true } });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [this.topics.userEvents] });
    await this.consumer.run({ eachMessage: (payload) => this.onMessage(payload) });
    this.logger.log('Consuming user events');
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    await this.consumer?.disconnect();
  }

  private async onMessage({ topic, message, pause }: KafkaJS.EachMessagePayload): Promise<void> {
    try {
      await this.onUserEvent(toInbound(topic, message));
    } catch (err) {
      this.logger.error(
        `Couldn't handle a message from ${topic}; trying again in ${ERROR_PAUSE_MS / 1000}s: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.pauseFor(pause, ERROR_PAUSE_MS);
      // Throwing makes the client seek back, so the message is read again after the pause.
      throw err;
    }
  }

  private async onUserEvent(message: InboundMessage): Promise<void> {
    let event;
    try {
      event = parseUserEvent(message.value);
    } catch (err) {
      if (!(err instanceof InvalidMessageError)) throw err;
      await this.deadLetterUserEvent(message, err);
      return;
    }
    if (!event) return;
    if (await this.credits.createWallet(event.userId)) {
      this.logger.log(JSON.stringify({ event: 'wallet_created', eventId: event.eventId, userId: event.userId }));
    }
  }

  /** An unreadable event can never succeed: park it on Credit's own DLT and move on (K11). */
  private async deadLetterUserEvent(message: InboundMessage, err: Error): Promise<void> {
    await this.connection.send({
      topic: this.topics.userEventsDeadLetter,
      key: message.key,
      value: message.value?.toString('utf8') ?? '',
      headers: {
        [HEADER.attempt]: '1',
        [HEADER.error]: err.message.slice(0, 500),
        [HEADER.sourceTopic]: message.topic,
        [HEADER.deadLetteredAt]: new Date().toISOString(),
      },
    });
    this.logger.error(JSON.stringify({ event: 'user_event_dead_lettered', reason: err.message }));
  }

  private pauseFor(pause: () => () => void, ms: number): void {
    const resume = pause();
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      resume();
    }, ms);
    this.timers.add(timer);
  }
}
```

- [ ] **Step 6: Run the Kafka tests to verify they pass**

Run: `cd credit-service && npm run test:kafka`
Expected: PASS, 3 tests. If pause/resume or seek misbehaves, debug with superpowers:systematic-debugging rather than raising timeouts.

- [ ] **Step 7: Wire it into the app** — `credit-service/src/app.module.ts` (dated disclosure block):

```ts
import { Module } from '@nestjs/common';
import { config } from './config';
import { BalanceController } from './credits/balance.controller';
import { CreditsController } from './credits/credits.controller';
import { CreditsService } from './credits/credits.service';
import { DatabaseModule } from './db/database';
import { KafkaConnection } from './messaging/kafka.connection';
import { KafkaRunner } from './messaging/kafka.runner';
import { PUBLISHER } from './messaging/messages';
import { buildTopics, TOPICS } from './messaging/topics';

@Module({
  imports: [DatabaseModule],
  controllers: [CreditsController, BalanceController],
  providers: [
    CreditsService,
    KafkaConnection,
    { provide: PUBLISHER, useExisting: KafkaConnection },
    { provide: TOPICS, useFactory: () => buildTopics(config.retryDelaysMs) },
    KafkaRunner,
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Check the running stack**

Run: `docker compose up -d --build credit-service && docker compose logs credit-service | tail -5`
Expected: `Consuming user events` and `listening on port 3004`. Publishing `{"type":"UserRegistered","userId":"<uuid>"}` to `user.events` from Kafka UI creates that wallet (`docker compose exec credit-db psql -U foc -d credit -c 'select user_id, available from credit_accounts'`); publishing `{"type":"UserRegistered"}` puts a message on `credit.user-events.dlt`.

- [ ] **Step 9: Run every suite and commit**

Run: `cd credit-service && npx tsc --noEmit -p . && npm test && npm run test:int && npm run test:kafka`
Expected: all pass.

```bash
git add credit-service/src/messaging/kafka.connection.ts credit-service/src/messaging/kafka.runner.ts credit-service/src/messaging/wallets.kafka.spec.ts credit-service/src/test/kafka.ts credit-service/src/test/database.ts credit-service/jest.kafka.config.js credit-service/package.json credit-service/src/app.module.ts
git commit -m "feat(credit-service): create wallets from UserRegistered events on Kafka

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Phase 2 docs, attribution and PR

**Files:**
- Modify: `credit-service/AGENTS.md`, `credit-service/README.md`, `ai/usage-log/jian-bing.md`
- Commit as well: `AGENTS.md` (root), `docs/superpowers/specs/2026-10-14-credit-service-redesign-design.md`, this plan

- [ ] **Step 1: `credit-service/AGENTS.md`**: a "Messaging [Proposed]" section covering what Phase 2 built: consumer group, `user.events` → wallet (tolerant reader, K12), `credit.user-events.dlt` for unreadable events, offsets stored after success, Node 24 (`.nvmrc`), `npm run test:kafka`; pointer to root `AGENTS.md` §3 rules and spec §9. Note that lazy creation stays until #79.
- [ ] **Step 2: `credit-service/README.md`**: starting Kafka (`docker compose up -d kafka kafka-init kafka-ui`), Kafka UI URL, `nvm use`, `npm run test:kafka` and what it needs, the new env vars.
- [ ] **Step 3: Usage log** — a 2026-10-14/15 entry in `ai/usage-log/jian-bing.md` (Claude Code, Opus 5.5; modes: explain, generate) with this session's exact prompts in order from "wait which mq did u use" through the execution prompt, the key responses (broker comparison; ordering correction; retry patterns; hybrid A; endpoint; walkthrough decisions K5–K13; partitions, upstream/downstream and coupling explanations), and the files changed in Phase 2.
- [ ] **Step 4: Final check and commit**

Run: `cd credit-service && npx tsc --noEmit -p . && npm test && npm run test:int && npm run test:kafka`
Expected: all pass.

```bash
git add credit-service/AGENTS.md credit-service/README.md ai/usage-log/jian-bing.md AGENTS.md docs/superpowers
git commit -m "docs: Kafka messaging rules, Credit Phase 2 docs and the redesign spec §9

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Final review, then the PR.** Run the whole-branch review (executing-plans "Final Review") for Phase 2. Then push `feature/credit-kafka` and open the PR into `feature/credit-balance` with the body from **PRs** above.

---

# Phase 3 — commands, retries and dead letters (PR 2)

Create `feature/credit-kafka-commands` from `feature/credit-kafka` before Task 6.

### Task 6: Command processor (retry and dead-letter routing)

**Files:**
- Create: `credit-service/src/messaging/command-processor.ts`, `credit-service/src/messaging/command-processor.spec.ts`

**Interfaces:**
- Consumes: `Topics`; `HEADER`, `InboundMessage`, `OutboundMessage`, `CreditCommand`, `InvalidMessageError`, `parseCommand`, `peekIds`; `ProblemException` (`code`), `ErrorCode`.
- Produces: `describeFailure(err): { retryable: boolean; message: string; code?: string }`; `msUntilDue(message, now): number`; `class CommandProcessor { constructor(apply: (command: CreditCommand) => Promise<unknown>, topics: Topics); process(message, now): Promise<OutboundMessage | null> }`.

- [ ] **Step 1: Write the failing test** `credit-service/src/messaging/command-processor.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated unit tests for the retry and dead-letter routing of credit commands (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { CommandProcessor, describeFailure, msUntilDue } from './command-processor';
import { HEADER, InboundMessage, InvalidMessageError } from './messages';
import { buildTopics } from './topics';

const topics = buildTopics([1000, 5000]);
const NOW = 1_800_000_000_000;
const eventId = randomUUID();
const orderId = randomUUID();
const value = JSON.stringify({ type: 'ReleaseCredits', eventId, orderId });

const message = (headers: Record<string, string> = {}, raw: string | null = value): InboundMessage => ({
  topic: topics.commands,
  key: orderId,
  value: raw === null ? null : Buffer.from(raw),
  headers,
});
const failWith = (err: unknown) => jest.fn().mockRejectedValue(err);
const noWallet = () => new ProblemException(404, 'No wallet yet.', ErrorCode.WALLET_NOT_FOUND);

let warn: jest.SpyInstance;
let error: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('CommandProcessor', () => {
  it('applies a valid command and sends nothing further', async () => {
    const apply = jest.fn().mockResolvedValue(undefined);
    expect(await new CommandProcessor(apply, topics).process(message(), NOW)).toBeNull();
    expect(apply).toHaveBeenCalledWith({ type: 'ReleaseCredits', eventId, orderId });
  });

  it('sends a missing-wallet failure to the first retry topic, due after the first delay', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(message(), NOW);
    expect(next).toEqual({
      topic: 'credit.commands.retry.0',
      key: orderId,
      value,
      headers: {
        [HEADER.attempt]: '1',
        [HEADER.dueAt]: String(NOW + 1000),
        [HEADER.error]: 'No wallet yet.',
        [HEADER.errorCode]: ErrorCode.WALLET_NOT_FOUND,
        [HEADER.sourceTopic]: 'credit.commands',
      },
    });
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({
      event: 'credit_command_retry_scheduled',
      eventId,
      orderId,
      attempt: 1,
    });
  });

  it('sends the second failure to the second retry topic', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(
      message({ [HEADER.attempt]: '1' }),
      NOW,
    );
    expect(next?.topic).toBe('credit.commands.retry.1');
    expect(next?.headers[HEADER.dueAt]).toBe(String(NOW + 5000));
  });

  it('dead-letters a command once its retries run out, and logs it without balances', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), topics).process(
      message({ [HEADER.attempt]: '2' }),
      NOW,
    );
    expect(next).toEqual({
      topic: 'credit.commands.dlt',
      key: orderId,
      value,
      headers: {
        [HEADER.attempt]: '3',
        [HEADER.error]: 'No wallet yet.',
        [HEADER.errorCode]: ErrorCode.WALLET_NOT_FOUND,
        [HEADER.sourceTopic]: 'credit.commands',
        [HEADER.deadLetteredAt]: new Date(NOW).toISOString(),
      },
    });
    expect(JSON.parse(String(error.mock.calls[0][0]))).toEqual({
      event: 'credit_command_dead_lettered',
      eventId,
      orderId,
      attempts: 3,
      code: ErrorCode.WALLET_NOT_FOUND,
    });
  });

  it('dead-letters a permanent conflict at once', async () => {
    const conflict = new ProblemException(409, 'Already released.', ErrorCode.ALREADY_RELEASED);
    const next = await new CommandProcessor(failWith(conflict), topics).process(message(), NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
    expect(next?.headers[HEADER.attempt]).toBe('1');
    expect(next?.headers[HEADER.errorCode]).toBe(ErrorCode.ALREADY_RELEASED);
  });

  it('dead-letters a release with no hold at once, as a bug (K11)', async () => {
    const noHold = new ProblemException(404, 'No hold.', ErrorCode.HOLD_NOT_FOUND);
    const next = await new CommandProcessor(failWith(noHold), topics).process(message(), NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
  });

  // Review Focus 4
  it('retries an unexpected error such as the database being down', async () => {
    const next = await new CommandProcessor(failWith(new Error('connect ECONNREFUSED')), topics).process(
      message(),
      NOW,
    );
    expect(next?.topic).toBe('credit.commands.retry.0');
    expect(next?.headers[HEADER.errorCode]).toBeUndefined();
  });

  // Review Focus 3
  it('dead-letters a message that is not JSON without calling the service', async () => {
    const apply = jest.fn();
    const next = await new CommandProcessor(apply, topics).process(message({}, 'not json'), NOW);
    expect(apply).not.toHaveBeenCalled();
    expect(next?.topic).toBe('credit.commands.dlt');
    expect(next?.value).toBe('not json');
    expect(next?.headers[HEADER.error]).toMatch(/not valid JSON/);
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({ eventId: null, orderId: null });
  });

  it('dead-letters at once when no retries are configured', async () => {
    const next = await new CommandProcessor(failWith(noWallet()), buildTopics([])).process(message(), NOW);
    expect(next?.topic).toBe('credit.commands.dlt');
  });
});

describe('describeFailure', () => {
  it('treats an invalid message as permanent', () => {
    expect(describeFailure(new InvalidMessageError('bad'))).toEqual({ retryable: false, message: 'bad' });
  });

  it('treats a missing wallet as retryable', () => {
    expect(describeFailure(noWallet())).toMatchObject({ retryable: true, code: ErrorCode.WALLET_NOT_FOUND });
  });
});

describe('msUntilDue', () => {
  it('is the time left until x-due-at', () => {
    expect(msUntilDue(message({ [HEADER.dueAt]: String(NOW + 250) }), NOW)).toBe(250);
  });

  it('is 0 when due, overdue, missing or unreadable', () => {
    expect(msUntilDue(message({ [HEADER.dueAt]: String(NOW) }), NOW)).toBe(0);
    expect(msUntilDue(message({ [HEADER.dueAt]: String(NOW - 5) }), NOW)).toBe(0);
    expect(msUntilDue(message(), NOW)).toBe(0);
    expect(msUntilDue(message({ [HEADER.dueAt]: 'soon' }), NOW)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd credit-service && npx jest src/messaging/command-processor.spec.ts`
Expected: FAIL, `Cannot find module './command-processor'`.

- [ ] **Step 3: Write `credit-service/src/messaging/command-processor.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the routing of failed credit commands to retry topics and the dead-letter
 *        topic, from Jian Bing's decisions K2–K3 and K11 and the details in spec §9.2.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Logger } from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { CreditCommand, HEADER, InboundMessage, InvalidMessageError, OutboundMessage, parseCommand, peekIds } from './messages';
import { Topics } from './topics';

export interface Failure {
  retryable: boolean;
  message: string;
  code?: string;
}

/**
 * Retryable: might succeed later (the wallet doesn't exist yet, the database is down).
 * Permanent: never will (an invalid message, a conflict, or no hold, which is a bug: K11).
 */
export function describeFailure(err: unknown): Failure {
  if (err instanceof InvalidMessageError) return { retryable: false, message: err.message };
  if (err instanceof ProblemException) {
    return { retryable: err.code === ErrorCode.WALLET_NOT_FOUND, message: err.message, code: err.code };
  }
  return { retryable: true, message: err instanceof Error ? err.message : String(err) };
}

/** Milliseconds until a retry message is due; 0 when it is due now or carries no due time. */
export function msUntilDue(message: InboundMessage, now: number): number {
  const dueAt = Number(message.headers[HEADER.dueAt]);
  return Number.isFinite(dueAt) && dueAt > now ? dueAt - now : 0;
}

export class CommandProcessor {
  private readonly logger = new Logger('CreditCommands');

  constructor(
    private readonly apply: (command: CreditCommand) => Promise<unknown>,
    private readonly topics: Topics,
  ) {}

  /** Applies one command. Returns where to send it next if it failed, or null when it is done. */
  async process(message: InboundMessage, now: number): Promise<OutboundMessage | null> {
    try {
      await this.apply(parseCommand(message.value));
      return null;
    } catch (err) {
      const failure = describeFailure(err);
      const attempts = (Number(message.headers[HEADER.attempt]) || 0) + 1;
      const { eventId, orderId } = peekIds(message.value);
      const headers: Record<string, string> = {
        [HEADER.attempt]: String(attempts),
        [HEADER.error]: failure.message.slice(0, 500),
        ...(failure.code ? { [HEADER.errorCode]: failure.code } : {}),
        [HEADER.sourceTopic]: this.topics.commands,
      };
      const next = { key: message.key, value: message.value?.toString('utf8') ?? '' };

      const retry = failure.retryable ? this.topics.retries[attempts - 1] : undefined;
      if (retry) {
        this.logger.warn(
          JSON.stringify({
            event: 'credit_command_retry_scheduled',
            eventId,
            orderId,
            attempt: attempts,
            delayMs: retry.delayMs,
            code: failure.code ?? null,
          }),
        );
        return { ...next, topic: retry.topic, headers: { ...headers, [HEADER.dueAt]: String(now + retry.delayMs) } };
      }

      // Spec §4.3: logged at error so someone looks at it; ids only, never balances (NFR5.1).
      this.logger.error(
        JSON.stringify({ event: 'credit_command_dead_lettered', eventId, orderId, attempts, code: failure.code ?? null }),
      );
      return {
        ...next,
        topic: this.topics.commandsDeadLetter,
        headers: { ...headers, [HEADER.deadLetteredAt]: new Date(now).toISOString() },
      };
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes, then all unit tests**

Run: `cd credit-service && npx jest src/messaging/command-processor.spec.ts && npx tsc --noEmit -p . && npm test`
Expected: 13 new tests pass; all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add credit-service/src/messaging/command-processor.ts credit-service/src/messaging/command-processor.spec.ts
git commit -m "feat(credit-service): route failed credit commands to retry topics or the DLT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Dead-letter table and service

**Files:**
- Create: `credit-service/src/dead-letters/dead-letters.service.ts`, `credit-service/src/dead-letters/dead-letters.service.int.spec.ts`, `credit-service/src/test/fake-publisher.ts`
- Modify: `credit-service/src/db/schema.ts`, `credit-service/src/common/error-codes.ts`, `credit-service/src/test/database.ts`

**Interfaces:**
- Consumes: `HEADER`, `InboundMessage`, `Publisher`, `PUBLISHER`, `peekIds`; `Topics`, `TOPICS`, `buildTopics`; `PG_POOL`.
- Produces: `type DeadLetterStatus = 'open' | 'replayed' | 'all'`; `interface DeadLetter { eventId: string | null; orderId: string | null; sourceTopic: string; commandType: string | null; payload: string; error: string; errorCode: string | null; attempts: number; deadLetteredAt: string; replayedAt: string | null }`; `class DeadLettersService { constructor(pool, publisher, topics); record(message): Promise<void>; list(status): Promise<DeadLetter[]>; replay(eventId): Promise<DeadLetter> }`; `ErrorCode.DEAD_LETTER_NOT_FOUND`, `.ALREADY_REPLAYED`, `.NOT_REPLAYABLE`; `class FakePublisher { sent: OutboundMessage[]; failNext: boolean }`.

- [ ] **Step 1: Add the table, error codes and test helpers**

Append to `SCHEMA_SQL` in `credit-service/src/db/schema.ts` (dated disclosure block):

```sql
-- Messages from Credit's dead-letter topics (spec §9.2, K3 and K11), copied here so admins can
-- inspect them and replay credit commands.
CREATE TABLE IF NOT EXISTS credit_dead_letters (
    id                BIGSERIAL PRIMARY KEY,
    event_id          UUID UNIQUE,            -- null when the message was too malformed to read
    order_id          UUID,
    source_topic      TEXT NOT NULL,          -- where it came from: credit.commands or user.events
    command_type      TEXT,                   -- the message's `type`
    payload           TEXT NOT NULL,
    error             TEXT NOT NULL,
    error_code        TEXT,
    attempts          INTEGER NOT NULL CHECK (attempts > 0),
    dead_lettered_at  TIMESTAMPTZ NOT NULL,
    replayed_at       TIMESTAMPTZ
);
```

Add to `ErrorCode` in `credit-service/src/common/error-codes.ts` (dated disclosure block):

```ts
  DEAD_LETTER_NOT_FOUND: 'DEAD_LETTER_NOT_FOUND',
  ALREADY_REPLAYED: 'ALREADY_REPLAYED',
  NOT_REPLAYABLE: 'NOT_REPLAYABLE',
```

In `credit-service/src/test/database.ts` change `emptyTables` to:

```ts
/** Empties every table. */
export async function emptyTables(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE credit_holds, credit_accounts, credit_dead_letters');
}
```

Create `credit-service/src/test/fake-publisher.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated an in-memory Publisher for tests that don't need Kafka.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { OutboundMessage, Publisher } from '../messaging/messages';

export class FakePublisher implements Publisher {
  sent: OutboundMessage[] = [];
  /** Makes the next send fail, as if Kafka were down. */
  failNext = false;

  async send(message: OutboundMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Kafka is unavailable');
    }
    this.sent.push(message);
  }
}
```

- [ ] **Step 2: Write the failing test** `credit-service/src/dead-letters/dead-letters.service.int.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated integration tests for recording, listing and replaying dead letters (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { ProblemException } from '../common/problem';
import { HEADER, InboundMessage } from '../messaging/messages';
import { buildTopics } from '../messaging/topics';
import { emptyTables, openTestDatabase } from '../test/database';
import { FakePublisher } from '../test/fake-publisher';
import { DeadLettersService } from './dead-letters.service';

const topics = buildTopics([1000]);
let pool: Pool;
let publisher: FakePublisher;
let service: DeadLettersService;

beforeAll(async () => {
  pool = await openTestDatabase();
});
afterAll(() => pool.end());
beforeEach(async () => {
  await emptyTables(pool);
  publisher = new FakePublisher();
  service = new DeadLettersService(pool, publisher, topics);
});

function deadLetter(
  overrides: { eventId?: string; orderId?: string; at?: string; code?: string; raw?: string; source?: string } = {},
): InboundMessage {
  const eventId = overrides.eventId ?? randomUUID();
  const orderId = overrides.orderId ?? randomUUID();
  return {
    topic: topics.commandsDeadLetter,
    key: orderId,
    value: Buffer.from(overrides.raw ?? JSON.stringify({ type: 'ReleaseCredits', eventId, orderId })),
    headers: {
      [HEADER.attempt]: '1',
      [HEADER.error]: 'No hold.',
      [HEADER.errorCode]: overrides.code ?? 'HOLD_NOT_FOUND',
      [HEADER.sourceTopic]: overrides.source ?? topics.commands,
      [HEADER.deadLetteredAt]: overrides.at ?? '2026-10-15T10:00:00.000Z',
    },
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ProblemException) return err.code;
    throw err;
  }
  throw new Error('expected the call to fail');
}

it('records a dead letter with its ids, source, error and attempts', async () => {
  const eventId = randomUUID();
  const orderId = randomUUID();
  await service.record(deadLetter({ eventId, orderId }));
  expect(await service.list('open')).toEqual([
    {
      eventId,
      orderId,
      sourceTopic: 'credit.commands',
      commandType: 'ReleaseCredits',
      payload: JSON.stringify({ type: 'ReleaseCredits', eventId, orderId }),
      error: 'No hold.',
      errorCode: 'HOLD_NOT_FOUND',
      attempts: 1,
      deadLetteredAt: '2026-10-15T10:00:00.000Z',
      replayedAt: null,
    },
  ]);
});

it('replays a command to credit.commands with a fresh attempt count, once', async () => {
  const eventId = randomUUID();
  const orderId = randomUUID();
  await service.record(deadLetter({ eventId, orderId }));

  const replayed = await service.replay(eventId);

  expect(replayed.replayedAt).not.toBeNull();
  expect(publisher.sent).toEqual([
    {
      topic: 'credit.commands',
      key: orderId,
      value: JSON.stringify({ type: 'ReleaseCredits', eventId, orderId }),
      headers: {},
    },
  ]);
  expect(await service.list('open')).toEqual([]);
  expect(await service.list('replayed')).toHaveLength(1);
  expect(await codeOf(service.replay(eventId))).toBe('ALREADY_REPLAYED');
  expect(publisher.sent).toHaveLength(1);
});

it('answers DEAD_LETTER_NOT_FOUND for an unknown event id', async () => {
  expect(await codeOf(service.replay(randomUUID()))).toBe('DEAD_LETTER_NOT_FOUND');
});

// Review Focus 5
it('refuses to replay a user-event dead letter: it must be fixed at its source', async () => {
  const eventId = randomUUID();
  await service.record({
    topic: topics.userEventsDeadLetter,
    key: 'u1',
    value: Buffer.from(JSON.stringify({ type: 'UserRegistered', eventId, userId: 'bad' })),
    headers: { [HEADER.attempt]: '1', [HEADER.error]: 'Invalid UserRegistered event', [HEADER.sourceTopic]: topics.userEvents },
  });
  expect(await codeOf(service.replay(eventId))).toBe('NOT_REPLAYABLE');
  expect(publisher.sent).toEqual([]);
  expect((await service.list('open'))[0]).toMatchObject({ sourceTopic: 'user.events', commandType: 'UserRegistered' });
});

it('keeps the row open when Kafka refuses the replay, so it can be tried again', async () => {
  const eventId = randomUUID();
  await service.record(deadLetter({ eventId }));
  publisher.failNext = true;
  await expect(service.replay(eventId)).rejects.toThrow('Kafka is unavailable');
  expect(await service.list('open')).toHaveLength(1);
});

// Review Focus 2
it('reopens the row when a replayed command dies again', async () => {
  const eventId = randomUUID();
  await service.record(deadLetter({ eventId }));
  await service.replay(eventId);
  await service.record(deadLetter({ eventId, at: '2026-10-15T11:00:00.000Z', code: 'ALREADY_TRANSFERRED' }));

  const [row] = await service.list('open');
  expect(row).toMatchObject({ eventId, errorCode: 'ALREADY_TRANSFERRED', replayedAt: null });
  expect(row.deadLetteredAt).toBe('2026-10-15T11:00:00.000Z');
});

// Review Focus 2
it('does not reopen a replayed row for an older duplicate of the same dead letter', async () => {
  const eventId = randomUUID();
  await service.record(deadLetter({ eventId }));
  await service.replay(eventId);
  await service.record(deadLetter({ eventId }));
  expect(await service.list('open')).toEqual([]);
});

// Review Focus 3
it('keeps two malformed messages apart instead of overwriting one', async () => {
  await service.record(deadLetter({ raw: 'not json' }));
  await service.record(deadLetter({ raw: 'also not json' }));
  const rows = await service.list('all');
  expect(rows.map((r) => [r.eventId, r.payload])).toEqual(
    expect.arrayContaining([
      [null, 'not json'],
      [null, 'also not json'],
    ]),
  );
});

it('lists newest first', async () => {
  const older = randomUUID();
  const newer = randomUUID();
  await service.record(deadLetter({ eventId: older, at: '2026-10-15T09:00:00.000Z' }));
  await service.record(deadLetter({ eventId: newer, at: '2026-10-15T12:00:00.000Z' }));
  expect((await service.list('all')).map((r) => r.eventId)).toEqual([newer, older]);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd credit-service && npm run test:int -- src/dead-letters`
Expected: FAIL, `Cannot find module './dead-letters.service'`.

- [ ] **Step 4: Write `credit-service/src/dead-letters/dead-letters.service.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the dead-letter table access: copy from both DLTs, list, and replay credit
 *        commands (Jian Bing's decisions K3, K4 and K11; spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { PG_POOL } from '../db/database';
import { HEADER, InboundMessage, peekIds, Publisher, PUBLISHER } from '../messaging/messages';
import { Topics, TOPICS } from '../messaging/topics';

export type DeadLetterStatus = 'open' | 'replayed' | 'all';

export interface DeadLetter {
  eventId: string | null;
  orderId: string | null;
  sourceTopic: string;
  commandType: string | null;
  payload: string;
  error: string;
  errorCode: string | null;
  attempts: number;
  deadLetteredAt: string;
  replayedAt: string | null;
}

interface DeadLetterRow {
  event_id: string | null;
  order_id: string | null;
  source_topic: string;
  command_type: string | null;
  payload: string;
  error: string;
  error_code: string | null;
  attempts: number;
  dead_lettered_at: Date;
  replayed_at: Date | null;
}

const COLUMNS =
  'event_id, order_id, source_topic, command_type, payload, error, error_code, attempts, dead_lettered_at, replayed_at';

const WHERE: Record<DeadLetterStatus, string> = {
  open: 'WHERE replayed_at IS NULL',
  replayed: 'WHERE replayed_at IS NOT NULL',
  all: '',
};

function toDeadLetter(row: DeadLetterRow): DeadLetter {
  return {
    eventId: row.event_id,
    orderId: row.order_id,
    sourceTopic: row.source_topic,
    commandType: row.command_type,
    payload: row.payload,
    error: row.error,
    errorCode: row.error_code,
    attempts: row.attempts,
    deadLetteredAt: row.dead_lettered_at.toISOString(),
    replayedAt: row.replayed_at?.toISOString() ?? null,
  };
}

@Injectable()
export class DeadLettersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PUBLISHER) private readonly publisher: Publisher,
    @Inject(TOPICS) private readonly topics: Topics,
  ) {}

  /**
   * Copies one message from a dead-letter topic into the table. A command that dies again after
   * a replay updates its row and reopens it; an older copy of the same dead letter changes nothing.
   */
  async record(message: InboundMessage): Promise<void> {
    const ids = peekIds(message.value);
    const at = new Date(message.headers[HEADER.deadLetteredAt] ?? '');
    await this.pool.query(
      `INSERT INTO credit_dead_letters
              (event_id, order_id, source_topic, command_type, payload, error, error_code, attempts, dead_lettered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (event_id) DO UPDATE SET
              order_id = EXCLUDED.order_id, source_topic = EXCLUDED.source_topic,
              command_type = EXCLUDED.command_type, payload = EXCLUDED.payload, error = EXCLUDED.error,
              error_code = EXCLUDED.error_code, attempts = EXCLUDED.attempts,
              dead_lettered_at = EXCLUDED.dead_lettered_at, replayed_at = NULL
        WHERE credit_dead_letters.dead_lettered_at < EXCLUDED.dead_lettered_at`,
      [
        ids.eventId,
        ids.orderId,
        message.headers[HEADER.sourceTopic] ?? message.topic,
        ids.type,
        message.value?.toString('utf8') ?? '',
        message.headers[HEADER.error] ?? 'Unknown error.',
        message.headers[HEADER.errorCode] ?? null,
        Number(message.headers[HEADER.attempt]) || 1,
        Number.isNaN(at.getTime()) ? new Date() : at,
      ],
    );
  }

  /** The newest 100 dead letters with the given status. */
  async list(status: DeadLetterStatus): Promise<DeadLetter[]> {
    const { rows } = await this.pool.query<DeadLetterRow>(
      `SELECT ${COLUMNS} FROM credit_dead_letters ${WHERE[status]}
        ORDER BY dead_lettered_at DESC, id DESC LIMIT 100`,
    );
    return rows.map(toDeadLetter);
  }

  /** Sends a dead credit command back to credit.commands with a fresh attempt count, at most once. */
  async replay(eventId: string): Promise<DeadLetter> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // The row lock makes a second, concurrent replay wait and then see replayed_at set.
      const { rows } = await client.query<DeadLetterRow>(
        `SELECT ${COLUMNS} FROM credit_dead_letters WHERE event_id = $1 FOR UPDATE`,
        [eventId],
      );
      const row = rows[0];
      if (!row) {
        throw new ProblemException(404, `No dead letter has event id ${eventId}.`, ErrorCode.DEAD_LETTER_NOT_FOUND);
      }
      if (row.source_topic !== this.topics.commands) {
        throw new ProblemException(
          409,
          `Dead letter ${eventId} came from ${row.source_topic}; fix it and publish it again from its source.`,
          ErrorCode.NOT_REPLAYABLE,
        );
      }
      if (row.replayed_at) {
        throw new ProblemException(409, `Dead letter ${eventId} was already replayed.`, ErrorCode.ALREADY_REPLAYED);
      }
      // Publish before committing: if Kafka refuses, the row stays open and can be replayed again.
      // If the commit then fails, the command may be sent twice, which the handlers already absorb.
      await this.publisher.send({ topic: this.topics.commands, key: row.order_id, value: row.payload, headers: {} });
      const updated = await client.query<DeadLetterRow>(
        `UPDATE credit_dead_letters SET replayed_at = now() WHERE event_id = $1 RETURNING ${COLUMNS}`,
        [eventId],
      );
      await client.query('COMMIT');
      return toDeadLetter(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
```

- [ ] **Step 5: Run the whole integration suite**

Run: `cd credit-service && npm run test:int`
Expected: PASS, 41 tests (32 + 9).

- [ ] **Step 6: Commit**

```bash
git add credit-service/src/dead-letters credit-service/src/db/schema.ts credit-service/src/common/error-codes.ts credit-service/src/test/database.ts credit-service/src/test/fake-publisher.ts
git commit -m "feat(credit-service): dead-letter table with record, list and replay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin dead-letter routes

**Files:**
- Create: `credit-service/src/dead-letters/dead-letters.controller.ts`, `credit-service/src/dead-letters/dead-letters.http.int.spec.ts`

**Interfaces:**
- Consumes: `DeadLettersService`, `DeadLetter`; `JwtAuthGuard`, `AuthedRequest`, `denied`; `parseOr400`; `FakePublisher`; `buildTopics`, `TOPICS`; `PUBLISHER`; `HEADER`.
- Produces: `GET /admin/credits/dead-letters?status=` → `200 {items: DeadLetter[]}`; `POST /admin/credits/dead-letters/:eventId/replay` → `200 DeadLetter`.

- [ ] **Step 1: Write the failing test** `credit-service/src/dead-letters/dead-letters.http.int.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated HTTP-level tests for the admin dead-letter routes: admin-only access, listing,
 *        replay, and their errors (spec §9.2).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { INestApplication, Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { resetJwksCache } from '../common/jwks';
import { ProblemDetailsFilter } from '../common/problem';
import { config } from '../config';
import { PG_POOL } from '../db/database';
import { HEADER, PUBLISHER } from '../messaging/messages';
import { buildTopics, TOPICS } from '../messaging/topics';
import { emptyTables, openTestDatabase } from '../test/database';
import { FakePublisher } from '../test/fake-publisher';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { DeadLettersController } from './dead-letters.controller';
import { DeadLettersService } from './dead-letters.service';

const stub = new JwksStub();
const key = makeKey('k1');
const publisher = new FakePublisher();
let pool: Pool;
let app: INestApplication;
let baseUrl: string;
let service: DeadLettersService;
let eventId: string;

const admin = () => ({ authorization: `Bearer ${signToken(key, { sub: randomUUID(), role: 'ADMIN' })}` });
const user = () => ({ authorization: `Bearer ${signToken(key, { sub: randomUUID(), role: 'USER' })}` });
const call = (method: 'GET' | 'POST', path: string, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, { method, headers });

beforeAll(async () => {
  await stub.start();
  pool = await openTestDatabase();
  @Module({
    controllers: [DeadLettersController],
    providers: [
      DeadLettersService,
      { provide: PG_POOL, useValue: pool },
      { provide: PUBLISHER, useValue: publisher },
      { provide: TOPICS, useValue: buildTopics([1000]) },
    ],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  service = app.get(DeadLettersService);
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await stub.stop();
});
beforeEach(async () => {
  stub.reset([key]);
  config.jwksUrl = stub.url;
  resetJwksCache();
  publisher.sent = [];
  await emptyTables(pool);
  eventId = randomUUID();
  const orderId = randomUUID();
  await service.record({
    topic: 'credit.commands.dlt',
    key: orderId,
    value: Buffer.from(JSON.stringify({ type: 'ReleaseCredits', eventId, orderId })),
    headers: {
      [HEADER.attempt]: '1',
      [HEADER.error]: 'No hold.',
      [HEADER.errorCode]: 'HOLD_NOT_FOUND',
      [HEADER.sourceTopic]: 'credit.commands',
    },
  });
});

it('refuses a request without a token with 401', async () => {
  expect((await call('GET', '/admin/credits/dead-letters')).status).toBe(401);
});

// Review Focus 5
it('refuses a USER on both routes with 403, logs it, and replays nothing', async () => {
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const list = await call('GET', '/admin/credits/dead-letters?status=bogus', user());
  const replay = await call('POST', '/admin/credits/dead-letters/not-a-uuid/replay', user());
  expect([list.status, replay.status]).toEqual([403, 403]);
  expect(await list.text()).not.toContain(eventId);
  expect(publisher.sent).toEqual([]);
  expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'access_denied', status: 403, role: 'USER' });
  warn.mockRestore();
});

it('lists open dead letters for an ADMIN', async () => {
  const res = await call('GET', '/admin/credits/dead-letters', admin());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.items).toHaveLength(1);
  expect(body.items[0]).toMatchObject({ eventId, sourceTopic: 'credit.commands', errorCode: 'HOLD_NOT_FOUND', replayedAt: null });
});

it('rejects an unknown status with 400', async () => {
  expect((await call('GET', '/admin/credits/dead-letters?status=bogus', admin())).status).toBe(400);
});

it('replays a dead letter once, then answers 409 ALREADY_REPLAYED', async () => {
  const first = await call('POST', `/admin/credits/dead-letters/${eventId}/replay`, admin());
  expect(first.status).toBe(200);
  expect((await first.json()).replayedAt).not.toBeNull();
  expect(publisher.sent).toHaveLength(1);

  const again = await call('POST', `/admin/credits/dead-letters/${eventId}/replay`, admin());
  expect(again.status).toBe(409);
  expect((await again.json()).code).toBe('ALREADY_REPLAYED');
});

it('answers 404 DEAD_LETTER_NOT_FOUND for an unknown event id', async () => {
  const res = await call('POST', `/admin/credits/dead-letters/${randomUUID()}/replay`, admin());
  expect(res.status).toBe(404);
  expect((await res.json()).code).toBe('DEAD_LETTER_NOT_FOUND');
});

it('rejects an event id that is not a UUID with 400', async () => {
  expect((await call('POST', '/admin/credits/dead-letters/nope/replay', admin())).status).toBe(400);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd credit-service && npm run test:int -- src/dead-letters/dead-letters.http.int.spec.ts`
Expected: FAIL, `Cannot find module './dead-letters.controller'`.

- [ ] **Step 3: Write `credit-service/src/dead-letters/dead-letters.controller.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the admin-only routes to list and replay dead letters (Jian Bing's decision K4;
 *        paths and status codes proposed by Claude Code and confirmed by him).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthedRequest, denied, JwtAuthGuard } from '../common/jwt-auth.guard';
import { parseOr400 } from '../credits/credit.schemas';
import { DeadLetter, DeadLettersService } from './dead-letters.service';

const statusSchema = z.enum(['open', 'replayed', 'all']);
const eventIdSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

/** Dead letters name other users' orders, so only admins may see or replay them. */
function requireAdmin(req: AuthedRequest): void {
  if (req.caller.role !== 'ADMIN') {
    throw denied(req, 403, 'Only admins can view or replay dead letters.', req.caller);
  }
}

@Controller('admin/credits/dead-letters')
@UseGuards(JwtAuthGuard)
export class DeadLettersController {
  constructor(private readonly deadLetters: DeadLettersService) {}

  @Get()
  async list(@Query('status') rawStatus: string | undefined, @Req() req: AuthedRequest): Promise<{ items: DeadLetter[] }> {
    // The role check comes first, so a USER learns nothing from validation errors.
    requireAdmin(req);
    const status = parseOr400(statusSchema, rawStatus ?? 'open', 'status');
    return { items: await this.deadLetters.list(status) };
  }

  @Post(':eventId/replay')
  @HttpCode(200)
  replay(@Param('eventId') rawEventId: string, @Req() req: AuthedRequest): Promise<DeadLetter> {
    requireAdmin(req);
    return this.deadLetters.replay(parseOr400(eventIdSchema, rawEventId, 'event id'));
  }
}
```

- [ ] **Step 4: Run the whole integration suite**

Run: `cd credit-service && npm run test:int`
Expected: PASS, 48 tests (41 + 7).

- [ ] **Step 5: Commit**

```bash
git add credit-service/src/dead-letters/dead-letters.controller.ts credit-service/src/dead-letters/dead-letters.http.int.spec.ts
git commit -m "feat(credit-service): admin routes to list and replay dead letters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Consume commands, retries and dead letters

**Files:**
- Create: `credit-service/src/messaging/commands.kafka.spec.ts`
- Modify: `credit-service/src/messaging/kafka.runner.ts`, `credit-service/src/messaging/wallets.kafka.spec.ts`, `credit-service/src/app.module.ts`

**Interfaces:**
- Consumes: `CommandProcessor`, `msUntilDue` (Task 6); `DeadLettersService` (Task 7); `DeadLettersController` (Task 8); Task 4's runner and test helpers.
- Produces: `KafkaRunner` constructor becomes `(credits: CreditsService, deadLetters: DeadLettersService, connection: KafkaConnection, topics: Topics)`.

- [ ] **Step 1: Write the failing test** `credit-service/src/messaging/commands.kafka.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated end-to-end tests against a real Kafka broker and PostgreSQL for credit commands:
 *        duplicates, retries, dead letters and replay (spec §7, §9).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { config } from '../config';
import type { TransferRequest } from '../credits/credit.schemas';
import { CreditsService } from '../credits/credits.service';
import { DeadLettersService } from '../dead-letters/dead-letters.service';
import { emptyTables, openTestDatabase } from '../test/database';
import { createTestTopics, testKafkaBrokers, waitFor } from '../test/kafka';
import { KafkaConnection } from './kafka.connection';
import { KafkaRunner } from './kafka.runner';
import { buildTopics } from './topics';

const prefix = `test-${randomUUID().slice(0, 8)}.`;
const topics = buildTopics([1000, 1000], prefix);

/** CreditsService whose next `transferFailures` transfers fail as if the courier had no wallet. */
class FlakyCredits extends CreditsService {
  transferFailures = 0;
  override transfer(request: TransferRequest) {
    if (this.transferFailures > 0) {
      this.transferFailures--;
      return Promise.reject(new ProblemException(404, 'No wallet yet.', ErrorCode.WALLET_NOT_FOUND));
    }
    return super.transfer(request);
  }
}

let pool: Pool;
let credits: FlakyCredits;
let connection: KafkaConnection;
let admin: KafkaJS.Admin;
let deleteTopics: () => Promise<void>;
let deadLetters: DeadLettersService;
let runner: KafkaRunner;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  config.kafkaBrokers = [testKafkaBrokers()];
  config.kafkaGroupId = `credit-test-${prefix}`;
  pool = await openTestDatabase();
  connection = new KafkaConnection();
  admin = connection.kafka.admin();
  await admin.connect();
  deleteTopics = await createTestTopics(admin, topics);
  await connection.onModuleInit();
  credits = new FlakyCredits(pool);
  deadLetters = new DeadLettersService(pool, connection, topics);
  runner = new KafkaRunner(credits, deadLetters, connection, topics);
  await runner.onApplicationBootstrap();
});
afterAll(async () => {
  await runner?.onModuleDestroy();
  await connection?.onModuleDestroy();
  await deleteTopics?.();
  await admin?.disconnect();
  await pool?.end();
  jest.restoreAllMocks();
});
beforeEach(async () => {
  credits.transferFailures = 0;
  await emptyTables(pool);
});

const send = (topic: string, key: string, body: unknown) =>
  connection.send({ topic, key, value: typeof body === 'string' ? body : JSON.stringify(body), headers: {} });
async function balanceOf(userId: string): Promise<{ available: number; reserved: number } | undefined> {
  const { rows } = await pool.query('SELECT available, reserved FROM credit_accounts WHERE user_id = $1', [userId]);
  return rows[0];
}
async function deadLetterFor(eventId: string) {
  const { rows } = await pool.query('SELECT * FROM credit_dead_letters WHERE event_id = $1', [eventId]);
  return rows[0];
}
/** Reserves `amount` for a new order and returns its ids. */
async function reservedOrder(amount = 4) {
  const ids = { orderId: randomUUID(), requesterId: randomUUID(), courierId: randomUUID() };
  await credits.reserve({ orderId: ids.orderId, requesterId: ids.requesterId, amount });
  return ids;
}

it('moves credits once for a duplicated TransferCredits', async () => {
  const order = await reservedOrder(4);
  const command = { type: 'TransferCredits', eventId: randomUUID(), orderId: order.orderId, courierId: order.courierId };
  await send(topics.commands, order.orderId, command);
  await send(topics.commands, order.orderId, command);
  // Sent last on the same partition, so once it is handled both copies above have been.
  const marker = await reservedOrder(1);
  await send(topics.commands, marker.orderId, { type: 'ReleaseCredits', eventId: randomUUID(), orderId: marker.orderId });
  await waitFor(async () => (await balanceOf(marker.requesterId))?.reserved === 0);

  expect(await balanceOf(order.courierId)).toEqual({ available: 14, reserved: 0 });
  expect(await balanceOf(order.requesterId)).toEqual({ available: 6, reserved: 0 });
});

// Review Focus 1
it('retries a transfer whose wallet is missing, then applies it, without holding up other topics', async () => {
  credits.transferFailures = 2;
  const order = await reservedOrder(3);
  const eventId = randomUUID();
  const started = Date.now();
  await send(topics.commands, order.orderId, { type: 'TransferCredits', eventId, orderId: order.orderId, courierId: order.courierId });

  // While the transfer waits in the retry topics, a user event is still handled.
  const userId = randomUUID();
  await send(topics.userEvents, userId, { type: 'UserRegistered', userId });
  await waitFor(() => balanceOf(userId));
  expect(await balanceOf(order.courierId)).toBeUndefined();

  await waitFor(async () => (await balanceOf(order.courierId))?.available === 13);
  expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
  expect(await deadLetterFor(eventId)).toBeUndefined();
});

it('dead-letters a transfer after its retries run out', async () => {
  credits.transferFailures = 10;
  const order = await reservedOrder(3);
  const eventId = randomUUID();
  await send(topics.commands, order.orderId, { type: 'TransferCredits', eventId, orderId: order.orderId, courierId: order.courierId });

  const row = await waitFor(() => deadLetterFor(eventId));
  expect(row).toMatchObject({ attempts: 3, error_code: 'WALLET_NOT_FOUND', source_topic: topics.commands, replayed_at: null });
  expect(await balanceOf(order.requesterId)).toEqual({ available: 7, reserved: 3 });
});

it('dead-letters a release with no hold at once, and applies it when replayed after the hold exists', async () => {
  const orderId = randomUUID();
  const requesterId = randomUUID();
  const eventId = randomUUID();
  await send(topics.commands, orderId, { type: 'ReleaseCredits', eventId, orderId });
  const row = await waitFor(() => deadLetterFor(eventId));
  expect(row).toMatchObject({ attempts: 1, error_code: 'HOLD_NOT_FOUND' });

  await credits.reserve({ orderId, requesterId, amount: 2 });
  await deadLetters.replay(eventId);

  await waitFor(async () => (await balanceOf(requesterId))?.reserved === 0);
  expect(await balanceOf(requesterId)).toEqual({ available: 10, reserved: 0 });
  expect((await deadLetterFor(eventId)).replayed_at).not.toBeNull();
});

// Review Focus 3
it('dead-letters a malformed command without stopping the partition', async () => {
  await send(topics.commands, randomUUID(), 'not json');
  const order = await reservedOrder(2);
  await send(topics.commands, order.orderId, { type: 'ReleaseCredits', eventId: randomUUID(), orderId: order.orderId });

  await waitFor(async () => (await balanceOf(order.requesterId))?.reserved === 0);
  const { rows } = await waitFor(async () => {
    const result = await pool.query("SELECT * FROM credit_dead_letters WHERE payload = 'not json'");
    return result.rowCount ? result : undefined;
  });
  expect(rows[0]).toMatchObject({ event_id: null, error_code: null });
});

it('records an unreadable user event in the table, where it cannot be replayed', async () => {
  const eventId = randomUUID();
  await send(topics.userEvents, 'bad', { type: 'UserRegistered', eventId, userId: 'nope' });
  const row = await waitFor(() => deadLetterFor(eventId));
  expect(row).toMatchObject({ source_topic: topics.userEvents, command_type: 'UserRegistered' });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd credit-service && npm run test:kafka -- src/messaging/commands.kafka.spec.ts`
Expected: FAIL to compile: `Expected 3 arguments, but got 4` for `new KafkaRunner(...)`.

- [ ] **Step 3: Extend `credit-service/src/messaging/kafka.runner.ts`** (add a dated `Scope: Phase 3: credit commands, retries and dead letters.` block). Replace the class's constructor, `onApplicationBootstrap` and `onMessage` with the following, add the imports, and keep `onUserEvent`, `deadLetterUserEvent`, `pauseFor` and `onModuleDestroy` unchanged:

```ts
import { DeadLettersService } from '../dead-letters/dead-letters.service';
import { CommandProcessor, msUntilDue } from './command-processor';
```

```ts
/** Thrown to leave a retry message unread until it is due; the client then seeks back to it. */
class NotDueYet extends Error {}
```

```ts
  private readonly processor: CommandProcessor;

  constructor(
    private readonly credits: CreditsService,
    private readonly deadLetters: DeadLettersService,
    private readonly connection: KafkaConnection,
    @Inject(TOPICS) private readonly topics: Topics,
  ) {
    this.processor = new CommandProcessor(
      (command) =>
        command.type === 'TransferCredits'
          ? credits.transfer({ orderId: command.orderId, courierId: command.courierId })
          : credits.release({ orderId: command.orderId }),
      topics,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    // fromBeginning: a new group starts at the oldest message, so no event sent before Credit
    // first started is missed. Offsets are stored only after eachMessage succeeds.
    this.consumer = this.connection.kafka.consumer({ kafkaJS: { groupId: config.kafkaGroupId, fromBeginning: true } });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [
        this.topics.userEvents,
        this.topics.commands,
        ...this.topics.retries.map((r) => r.topic),
        this.topics.commandsDeadLetter,
        this.topics.userEventsDeadLetter,
      ],
    });
    await this.consumer.run({ eachMessage: (payload) => this.onMessage(payload) });
    this.logger.log('Consuming user events and credit commands');
  }

  private async onMessage({ topic, message, pause }: KafkaJS.EachMessagePayload): Promise<void> {
    const inbound = toInbound(topic, message);
    try {
      if (topic === this.topics.userEvents) return await this.onUserEvent(inbound);
      if (topic === this.topics.commandsDeadLetter || topic === this.topics.userEventsDeadLetter) {
        return await this.deadLetters.record(inbound);
      }

      const wait = msUntilDue(inbound, Date.now());
      if (wait > 0) {
        // Every message in a retry topic has the same delay, so nothing behind this one is due
        // sooner: resting this partition delays no other message.
        this.pauseFor(pause, wait);
        throw new NotDueYet();
      }
      const next = await this.processor.process(inbound, Date.now());
      if (next) await this.connection.send(next);
    } catch (err) {
      if (!(err instanceof NotDueYet)) {
        this.logger.error(
          `Couldn't handle a message from ${topic}; trying again in ${ERROR_PAUSE_MS / 1000}s: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        this.pauseFor(pause, ERROR_PAUSE_MS);
      }
      // Throwing makes the client seek back, so the message is read again after the pause.
      throw err;
    }
  }
```

In `credit-service/src/messaging/wallets.kafka.spec.ts`, construct the runner with a dead-letter service (add the imports `DeadLettersService` from `'../dead-letters/dead-letters.service'`):

```ts
  const credits = new CreditsService(pool);
  runner = new KafkaRunner(credits, new DeadLettersService(pool, connection, topics), connection, topics);
```

- [ ] **Step 4: Run the Kafka tests to verify they pass**

Run: `cd credit-service && npm run test:kafka`
Expected: PASS, 9 tests (3 + 6). The client logs "Consumer encountered error … may be reprocessed" for each not-yet-due retry; that is expected.

- [ ] **Step 5: Wire the dead-letter pieces into the app** — `credit-service/src/app.module.ts` (dated disclosure block): add `DeadLettersController` to `controllers` and `DeadLettersService` to `providers`, with their imports from `./dead-letters/dead-letters.controller` and `./dead-letters/dead-letters.service`.

- [ ] **Step 6: Check the running stack**

Run: `docker compose up -d --build credit-service && docker compose logs credit-service | tail -5`
Expected: `Consuming user events and credit commands`. Publishing `{"type":"ReleaseCredits","eventId":"<uuid>","orderId":"<uuid>"}` to `credit.commands` from Kafka UI puts it on `credit.commands.dlt` (no hold) and `GET /admin/credits/dead-letters` with an ADMIN token lists it.

- [ ] **Step 7: Run every suite and commit**

Run: `cd credit-service && npx tsc --noEmit -p . && npm test && npm run test:int && npm run test:kafka`
Expected: all pass.

```bash
git add credit-service/src/messaging credit-service/src/app.module.ts
git commit -m "feat(credit-service): consume credit commands with retry topics and dead letters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Phase 3 docs, Postman, attribution and PR

**Files:**
- Modify: `credit-service/AGENTS.md`, `credit-service/README.md`, `credit-service/postman/credit.postman_collection.json`, `ai/usage-log/jian-bing.md`

- [ ] **Step 1: `credit-service/AGENTS.md`**: Schema gains `credit_dead_letters`; API table gains the two admin routes (200; 400 bad status or id; 401; 403 USER, logged; 404 `DEAD_LETTER_NOT_FOUND`; 409 `ALREADY_REPLAYED` / `NOT_REPLAYABLE`) and the three codes; Messaging section gains commands, `type` field, retryable vs permanent, headers, `CREDIT_RETRY_DELAYS`, `credit.commands.dlt`, replay. Open items: replace the Phases 2–3 line with #79 (remove lazy creation and HTTP routes after #54 / #53 / #56), gateway `/admin/credits/**` with #60, whole-team confirmation of root `AGENTS.md` §3 Messaging.
- [ ] **Step 2: `credit-service/README.md`**: the admin routes and how to replay a dead letter.
- [ ] **Step 3: Postman folder "5. Dead letters"** with a new collection variable `adminToken` (empty; description: an ADMIN access token from the User Service) and the existing `balanceUrl`:
  - `List open dead letters (ADMIN)`: `GET {{balanceUrl}}/admin/credits/dead-letters`, `Authorization: Bearer {{adminToken}}`; tests: 200, `items` is an array.
  - `List dead letters as a USER → 403`: same URL with `{{userToken}}`; test: 403.
  - `Replay an unknown dead letter → 404`: `POST {{balanceUrl}}/admin/credits/dead-letters/00000000-0000-4000-8000-000000000000/replay` with `{{adminToken}}`; tests: 404, `code` is `DEAD_LETTER_NOT_FOUND`.

  Run: `npx newman run credit-service/postman/credit.postman_collection.json --env-var userToken=<USER token> --env-var adminToken=<ADMIN token>` against the running stack.
  Expected: 0 failures.
- [ ] **Step 4: Usage log** — extend the entry in `ai/usage-log/jian-bing.md` with the Phase 3 files and any new prompts.
- [ ] **Step 5: Final check and commit**

Run: `cd credit-service && npx tsc --noEmit -p . && npm test && npm run test:int && npm run test:kafka`
Expected: all pass.

```bash
git add credit-service/AGENTS.md credit-service/README.md credit-service/postman ai/usage-log/jian-bing.md
git commit -m "docs(credit-service): document credit commands, dead letters and the admin routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Final review, then the PR.** Whole-branch review of Phase 3, then push `feature/credit-kafka-commands` and open the PR into `feature/credit-kafka` with the body from **PRs** above.
