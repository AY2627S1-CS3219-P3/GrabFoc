<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
Scope: Wrote this implementation plan for Phase 1 of the approved Credit Service redesign spec.
Author review: Jian Bing, 2026-10-18 — read in full; it matches what I decided.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
Author review: Jian Bing supplied what it states; the wording is Claude's.
-->

# Credit Service Phase 1 (balance read, error codes, gateway route) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the frontend show a user's credit balance (`GET /credits/:userId` through the gateway), and give every Credit error a machine-readable `code`, without changing how reserve/transfer/release work today.

**Architecture:** The Credit Service (NestJS + `pg` + Zod) gains a second, JWT-protected controller next to the existing `/internal/credits` one, which keeps its `X-Service-Key` guard. JWT verification is copied from the Supplier Service (`jwks.ts`), so Credit checks the token itself against the User Service JWKS, as root `AGENTS.md` §6/§8 require. Envoy (PR #69) gets one route file that forwards `GET /credits/*` with the JWT.

**Tech Stack:** Node ≥ 22.12, NestJS 11, `pg` 8, Zod 3, Jest 29 + ts-jest, PostgreSQL 17 in Docker, Envoy 1.38 (stock, PR #69).

**Spec:** `docs/superpowers/specs/2026-10-14-credit-service-redesign-design.md` — this plan implements **§6 Phase 1** only (spec §4.4, §4.5 and the gateway row of §5). Phases 2–3 need the team's broker choice and the User/Order owners; they get their own plans.

**Branch:** create `feature/credit-balance` from `docs/credit-service-redesign-spec` (it already contains PR #48's Credit Service and the PR #68 usage-log split).

## Global Constraints

- **Learning mode / AI policy:** Jian Bing owns the design. Details below that the spec doesn't fix are **Proposed (AI)** and listed here so he can veto them before execution: the `400` for a non-UUID path id; validating the path id *before* the ownership check; case-insensitive id comparison; the `CREDIT_JWKS_URL` / `CREDIT_JWT_ISSUER` / `CREDIT_JWT_AUDIENCE` variable names; the Envoy route regex `/credits/[^/]+`; Postman additions.
- **Identity comes from the verified token only** (root `AGENTS.md` §8). The path names whose balance; the token says who asks.
- **Strict Zod validation**; errors as Problem Details (`application/problem+json`), same shape as the Supplier Service.
- **Never log balances** (NFR5.1). Log 401/403 as structured `access_denied` (root `AGENTS.md` §8).
- **Phase 1 keeps lazy wallet creation in reserve/transfer.** Removing it is Phase 2 (spec §6); doing it now would leave every user without a wallet.
- **Every AI-influenced file** gets the `AI Assistance Disclosure` header (`Author review: pending — Jian Bing to record what he checked.`); the session goes in `ai/usage-log/jian-bing.md` (PR #68), never in `ai/usage-log.md`.
- **Tests:** unit `npm test`; integration `npm run test:int` against `credit_test` in `credit-db` (`docker compose up -d credit-db` from the repo root). All commands below run from `credit-service/` unless stated.
- **TDD:** each task writes the failing test first.

## Review Focus

Inputs the spec implies but doesn't spell out, most likely to bite first. Each has a test in the task named.

1. **A USER asks for someone else's balance** → 403, logged as `access_denied`, and the response must not contain any balance (Task 3).
2. **The path id is not a UUID** (`/credits/me`, `/credits/abc`) → 400, never a 500 from PostgreSQL's UUID cast (Task 3).
3. **Upper-case UUID in the path for the caller's own id** → 200; the token's `sub` is lower-case, so a strict string compare would wrongly 403 (Task 3).
4. **User Service / JWKS unreachable** → 503 "try again", not 500 and not 401 (Task 2).
5. **A JWT sent to an internal route, or a service key sent to the balance route** → 401 in both cases; neither credential opens the other route (Task 3).

---

### Task 1: Machine-readable error codes

**Files:**
- Create: `credit-service/src/common/error-codes.ts`
- Modify: `credit-service/src/common/problem.ts` (constructor and filter body)
- Modify: `credit-service/src/credits/credits.service.ts` (every `throw new ProblemException`)
- Test: `credit-service/src/common/problem.spec.ts` (new), `credit-service/src/credits/credits.service.int.spec.ts` (new `describe` block)

**Interfaces:**
- Produces: `ErrorCode` (const object + string-union type) from `src/common/error-codes.ts`; `new ProblemException(status: number, detail: string, code?: ErrorCode)`; Problem Details bodies gain `"code"` only when one was given.

- [ ] **Step 1: Create the branch**

```bash
cd "/Users/user/github repos/GrabFoc" && git switch -c feature/credit-balance docs/credit-service-redesign-spec
```

- [ ] **Step 2: Write the failing unit test** — `credit-service/src/common/problem.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated unit tests for the Problem Details filter's error codes.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { ArgumentsHost } from '@nestjs/common';
import { ErrorCode } from './error-codes';
import { ProblemDetailsFilter, ProblemException } from './problem';

function run(exception: unknown) {
  const res = { status: jest.fn(), type: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ originalUrl: '/x' }), getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

it('adds the code to the body when one is given', () => {
  const { status, body } = run(new ProblemException(409, 'Insufficient credits.', ErrorCode.INSUFFICIENT_CREDITS));
  expect(status).toBe(409);
  expect(body).toMatchObject({ status: 409, detail: 'Insufficient credits.', code: 'INSUFFICIENT_CREDITS' });
});

it('leaves the code out when none is given', () => {
  const { body } = run(new ProblemException(400, 'Bad input.'));
  expect(body).not.toHaveProperty('code');
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx jest src/common/problem.spec.ts`
Expected: FAIL — `Cannot find module './error-codes'`.

- [ ] **Step 4: Create `src/common/error-codes.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: The machine-readable error codes listed in the redesign spec §4.5.
 * Author review: pending — Jian Bing to record what he checked.
 */

/** Sent as `code` in Problem Details bodies, so callers needn't parse `detail`. */
export const ErrorCode = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  HOLD_MISMATCH: 'HOLD_MISMATCH',
  ALREADY_TRANSFERRED: 'ALREADY_TRANSFERRED',
  ALREADY_RELEASED: 'ALREADY_RELEASED',
  COURIER_IS_REQUESTER: 'COURIER_IS_REQUESTER',
  HOLD_NOT_FOUND: 'HOLD_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

- [ ] **Step 5: Change `src/common/problem.ts`**

Add to the header comment block (keep the existing lines):

```
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Added the optional machine-readable `code` (redesign spec §4.5).
 * Author review: pending — Jian Bing to record what he checked.
```

Add the import below the existing imports:

```ts
import type { ErrorCode } from './error-codes';
```

Replace the `ProblemException` class:

```ts
/** Throw this to send a Problem Details response with the given status, detail and optional code. */
export class ProblemException extends HttpException {
  constructor(status: number, detail: string, readonly code?: ErrorCode) {
    super({ detail, message: detail, code }, status);
  }
}
```

In `ProblemDetailsFilter.catch`, after `let detail = 'An unexpected error occurred.';` add `let code: string | undefined;`, and inside the `if (typeof body === 'object' && body && 'detail' in body) {` branch, after the `detail = …` line, add:

```ts
        const given = (body as { code?: unknown }).code;
        if (typeof given === 'string') code = given;
```

Replace the `.json({ … })` call with:

```ts
      .json({
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail,
        ...(code ? { code } : {}),
        instance: req.originalUrl,
      });
```

- [ ] **Step 6: Run the unit test**

Run: `npx jest src/common/problem.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Write the failing integration test** — append to `src/credits/credits.service.int.spec.ts`

```ts
describe('error codes', () => {
  async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
    } catch (err) {
      if (err instanceof ProblemException) return err.code;
      throw err;
    }
    throw new Error('expected the call to fail');
  }

  it('labels every reserve, transfer and release failure', async () => {
    const reserved = randomUUID();
    await service.reserve({ orderId: reserved, requesterId: requester, amount: 3 });
    expect(await codeOf(service.reserve({ orderId: randomUUID(), requesterId: requester, amount: 99 }))).toBe(
      'INSUFFICIENT_CREDITS',
    );
    expect(await codeOf(service.reserve({ orderId: reserved, requesterId: requester, amount: 4 }))).toBe('HOLD_MISMATCH');
    expect(await codeOf(service.transfer({ orderId: reserved, courierId: requester }))).toBe('COURIER_IS_REQUESTER');
    expect(await codeOf(service.transfer({ orderId: randomUUID(), courierId: courier }))).toBe('HOLD_NOT_FOUND');
    expect(await codeOf(service.release({ orderId: randomUUID() }))).toBe('HOLD_NOT_FOUND');

    const paid = randomUUID();
    await service.reserve({ orderId: paid, requesterId: requester, amount: 1 });
    await service.transfer({ orderId: paid, courierId: courier });
    expect(await codeOf(service.transfer({ orderId: paid, courierId: randomUUID() }))).toBe('ALREADY_TRANSFERRED');
    expect(await codeOf(service.release({ orderId: paid }))).toBe('ALREADY_TRANSFERRED');

    const refunded = randomUUID();
    await service.reserve({ orderId: refunded, requesterId: requester, amount: 1 });
    await service.release({ orderId: refunded });
    expect(await codeOf(service.transfer({ orderId: refunded, courierId: courier }))).toBe('ALREADY_RELEASED');
  });
});
```

- [ ] **Step 8: Run it to see it fail**

Run: `npm run test:int -- src/credits/credits.service.int.spec.ts -t 'error codes'`
Expected: FAIL — `Expected: "INSUFFICIENT_CREDITS"`, `Received: undefined`.

- [ ] **Step 9: Add the codes in `src/credits/credits.service.ts`**

Add to the header block: `Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14` / `Scope: Added error codes; added getBalance (Task 3).` / `Author review: pending — Jian Bing to record what he checked.` Add `import { ErrorCode } from '../common/error-codes';`. Then change each throw (same order as in the file):

| Current throw (detail text) | New third argument |
|---|---|
| `already has credits reserved with a different requester or amount.` | `ErrorCode.HOLD_MISMATCH` |
| `'Insufficient credits to reserve this amount.'` | `ErrorCode.INSUFFICIENT_CREDITS` |
| transfer: `No credits are reserved for order ${orderId}.` | `ErrorCode.HOLD_NOT_FOUND` |
| `'The courier cannot be the order’s requester.'` | `ErrorCode.COURIER_IS_REQUESTER` |
| transfer: the `existing.state === 'RELEASED' ? … : …` throw | replace with the two-branch version below |
| release: `No credits are reserved for order ${orderId}.` | `ErrorCode.HOLD_NOT_FOUND` |
| release: `credits were already transferred to its courier.` | `ErrorCode.ALREADY_TRANSFERRED` |

Two-branch version for transfer:

```ts
        if (existing.state === 'RELEASED') {
          throw new ProblemException(
            409,
            `Order ${orderId}'s credits were already released to the requester.`,
            ErrorCode.ALREADY_RELEASED,
          );
        }
        throw new ProblemException(
          409,
          `Order ${orderId}'s credits were already transferred to a different courier.`,
          ErrorCode.ALREADY_TRANSFERRED,
        );
```

- [ ] **Step 10: Run both suites**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run test:int`
Expected: type-check clean; unit 20 passed; integration 20 passed.

- [ ] **Step 11: Commit**

```bash
git add src/common/error-codes.ts src/common/problem.ts src/common/problem.spec.ts src/credits/credits.service.ts src/credits/credits.service.int.spec.ts
git commit -m "feat(credit-service): machine-readable error codes in Problem Details

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Verify user JWTs in the Credit Service

**Files:**
- Create (copied from Supplier, header replaced): `credit-service/src/common/jwks.ts`, `credit-service/src/common/jwks.spec.ts`, `credit-service/src/test/jwks-stub.ts`
- Create: `credit-service/src/common/jwt-auth.guard.ts`, `credit-service/src/common/jwt-auth.guard.spec.ts`
- Modify: `credit-service/src/config.ts`, `credit-service/src/test/env.setup.ts`, `credit-service/compose.yaml`, `.env.example`

**Interfaces:**
- Consumes: `ProblemException` (Task 1).
- Produces: `verifyToken(authorization: string | undefined): Promise<TokenClaims | null>`, `JwksUnavailableError`, `resetJwksCache()` (from `jwks.ts`); `JwtAuthGuard` (Nest guard, sets `req.caller`); `type Role = 'ADMIN' | 'USER'`; `interface Caller { id: string; role: Role }`; `type AuthedRequest = Request & { caller: Caller }`; `denied(req, status: 401 | 403, detail, caller?): ProblemException`; `config.jwksUrl: string | undefined`, `config.jwtIssuer?: string`, `config.jwtAudience?: string`.

- [ ] **Step 1: Copy the Supplier JWKS code and its tests**

```bash
cd "/Users/user/github repos/GrabFoc"
for f in common/jwks.ts common/jwks.spec.ts test/jwks-stub.ts; do
  { printf '%s\n' '/*' ' * AI Assistance Disclosure:' ' * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14' \
      " * Scope: Copied from supplier-service/src/$f (only SUPPLIER_JWKS_URL renamed), so Credit verifies user tokens the same way." \
      ' * Author review: pending — Jian Bing to record what he checked.' ' */'
    awk 'done{print; next} /^ \*\//{done=1}' "supplier-service/src/$f"
  } > "credit-service/src/$f"
done
sed -i '' 's/SUPPLIER_JWKS_URL/CREDIT_JWKS_URL/g' credit-service/src/common/jwks.ts credit-service/src/common/jwks.spec.ts
diff <(awk 'done{print; next} /^ \*\//{done=1}' supplier-service/src/common/jwks.ts | sed 's/SUPPLIER_JWKS_URL/CREDIT_JWKS_URL/g') <(tail -n +7 credit-service/src/common/jwks.ts) && echo "jwks.ts body identical apart from the variable name"
```

Expected: `jwks.ts body identical apart from the variable name`.

- [ ] **Step 2: Add the JWKS settings to `src/config.ts`**

Add to the header: `Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14` / `Scope: Added the JWKS URL and optional issuer/audience for the balance route.` / `Author review: pending — Jian Bing to record what he checked.` Then add three fields to the `config` object, after `serviceKey`:

```ts
  // The User Service publishes its public signing keys here; the balance route verifies every
  // user token against them (root AGENTS.md §6). The internal routes don't use it.
  // Typed as possibly undefined because jwks.ts (copied from Supplier) handles an unset URL as
  // "can't verify" (503), and its tests set it to undefined to check that.
  jwksUrl: required('CREDIT_JWKS_URL') as string | undefined,
  // Checked only when set, matching the gateway and the Supplier Service.
  jwtIssuer: process.env.CREDIT_JWT_ISSUER || undefined,
  jwtAudience: process.env.CREDIT_JWT_AUDIENCE || undefined,
```

- [ ] **Step 3: Pin the new variables in `src/test/env.setup.ts`** (append)

```ts
// Nothing listens on port 9, so a test that forgets to point this at its stub fails with
// JwksUnavailableError instead of reaching a real User Service.
process.env.CREDIT_JWKS_URL = 'http://127.0.0.1:9/.well-known/jwks.json';
process.env.CREDIT_JWT_ISSUER = '';
process.env.CREDIT_JWT_AUDIENCE = '';
```

- [ ] **Step 4: Run the copied JWKS tests**

Run: `cd credit-service && npx jest src/common/jwks.spec.ts`
Expected: PASS (same count as in `supplier-service`; they exercise only `jwks.ts` and `config.jwksUrl`/`jwtIssuer`/`jwtAudience`).

- [ ] **Step 5: Write the failing guard test** — `src/common/jwt-auth.guard.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated unit tests for the JWT guard on the balance route.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { ExecutionContext, Logger } from '@nestjs/common';
import { config } from '../config';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { resetJwksCache } from './jwks';
import { AuthedRequest, JwtAuthGuard } from './jwt-auth.guard';
import { ProblemException } from './problem';

const stub = new JwksStub();
const key = makeKey('k1');
const guard = new JwtAuthGuard();
let warn: jest.SpyInstance;
let error: jest.SpyInstance;

beforeAll(() => stub.start());
afterAll(() => stub.stop());
beforeEach(() => {
  stub.reset([key]);
  config.jwksUrl = stub.url;
  resetJwksCache();
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

function request(authorization?: string) {
  const req = {
    method: 'GET',
    originalUrl: '/credits/x',
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as unknown as AuthedRequest;
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { req, context };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ProblemException) return err.getStatus();
    throw err;
  }
  throw new Error('expected a ProblemException');
}

it('accepts a valid token and records the caller', async () => {
  const { req, context } = request(`Bearer ${signToken(key, { sub: 'u-1', role: 'ADMIN' })}`);
  expect(await guard.canActivate(context)).toBe(true);
  expect(req.caller).toEqual({ id: 'u-1', role: 'ADMIN' });
});

it.each([
  ['no Authorization header', undefined],
  ['an expired token', () => `Bearer ${signToken(key, { exp: 1 })}`],
  ['a token signed by an unpublished key', () => `Bearer ${signToken(makeKey('k1'))}`],
  ['an unknown role', () => `Bearer ${signToken(key, { role: 'SUPERUSER' })}`],
  ['a service key instead of a token', 'test-service-key-0123456789abcdef0123456789abcdef'],
])('rejects %s with 401 and logs access_denied', async (_label, auth) => {
  const { context } = request(typeof auth === 'function' ? auth() : auth);
  expect(await statusOf(guard.canActivate(context))).toBe(401);
  expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'access_denied', status: 401 });
});

// Review Focus 4: the User Service being down is not the caller's fault.
it('answers 503 when the JWKS cannot be fetched', async () => {
  stub.respond = () => ({ status: 500, body: 'down' });
  const { context } = request(`Bearer ${signToken(key)}`);
  expect(await statusOf(guard.canActivate(context))).toBe(503);
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx jest src/common/jwt-auth.guard.spec.ts`
Expected: FAIL — `Cannot find module './jwt-auth.guard'`.

- [ ] **Step 7: Write `src/common/jwt-auth.guard.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: JWT guard for the balance route, following supplier-service/src/common/auth.ts without
 *        its dev-auth header fallback or role decorator.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { JwksUnavailableError, verifyToken } from './jwks';
import { ProblemException } from './problem';

export type Role = 'ADMIN' | 'USER';
export interface Caller {
  id: string;
  role: Role;
}
export type AuthedRequest = Request & { caller: Caller };

const logger = new Logger('Access');

/** Log a denied attempt in one structured format (401 and 403) and return the exception to throw. */
export function denied(req: Request, status: 401 | 403, detail: string, caller?: Caller): ProblemException {
  logger.warn(
    JSON.stringify({
      event: 'access_denied',
      status,
      method: req.method,
      path: req.originalUrl,
      userId: caller?.id ?? null,
      role: caller?.role ?? null,
    }),
  );
  return new ProblemException(status, detail);
}

/**
 * Requires a user token issued by the User Service. The gateway checks it too, but this service
 * re-verifies rather than trusting whatever reached it over the network (root AGENTS.md §6).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    let claims;
    try {
      claims = await verifyToken(req.header('authorization'));
    } catch (err) {
      if (err instanceof JwksUnavailableError) {
        logger.error(`Cannot verify tokens: ${err.message}`);
        throw new ProblemException(503, 'Cannot verify credentials right now. Try again shortly.');
      }
      throw err;
    }
    if (!claims || (claims.role !== 'ADMIN' && claims.role !== 'USER')) {
      throw denied(req, 401, 'Missing or invalid credentials.');
    }
    req.caller = { id: claims.sub, role: claims.role };
    return true;
  }
}
```

- [ ] **Step 8: Run the guard tests and the whole unit suite**

Run: `npx jest src/common/jwt-auth.guard.spec.ts && npm test`
Expected: PASS (guard: 7 tests); whole unit suite passes.

- [ ] **Step 9: Wire the variable into Compose and `.env.example`**

In `credit-service/compose.yaml`, under `credit-service.environment`, after `CREDIT_SERVICE_KEY`:

```yaml
      # The balance route verifies user tokens against the User Service's public keys.
      CREDIT_JWKS_URL: http://user-service:3001/.well-known/jwks.json
      # Optional; checked only when set in .env.
      CREDIT_JWT_ISSUER: ${CREDIT_JWT_ISSUER:-}
      CREDIT_JWT_AUDIENCE: ${CREDIT_JWT_AUDIENCE:-}
```

In `.env.example`, in the `# ---- Credit service` section, after `CREDIT_SERVICE_KEY=`:

```dotenv
# Where the User Service publishes its public signing keys, e.g.
# http://localhost:3001/.well-known/jwks.json (http://user-service:3001/... in compose)
CREDIT_JWKS_URL=
# Optional: only checked when set, matching the gateway
CREDIT_JWT_ISSUER=
CREDIT_JWT_AUDIENCE=
```

Add to the `.env.example` header block: `# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14` / `# Scope: Added CREDIT_JWKS_URL, CREDIT_JWT_ISSUER and CREDIT_JWT_AUDIENCE.` / `# Author review: pending — Jian Bing to record what he checked.`

- [ ] **Step 10: Check Compose still parses**

Run (repo root): `docker compose config --services`
Expected: the service list includes `credit-service`, no error.

- [ ] **Step 11: Commit**

```bash
cd "/Users/user/github repos/GrabFoc"
git add credit-service/src/common/jwks.ts credit-service/src/common/jwks.spec.ts credit-service/src/test/jwks-stub.ts \
  credit-service/src/common/jwt-auth.guard.ts credit-service/src/common/jwt-auth.guard.spec.ts \
  credit-service/src/config.ts credit-service/src/test/env.setup.ts credit-service/compose.yaml .env.example
git commit -m "feat(credit-service): verify user JWTs against the User Service JWKS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `GET /credits/:userId`

**Files:**
- Create: `credit-service/src/credits/balance.controller.ts`, `credit-service/src/credits/balance.http.int.spec.ts`
- Modify: `credit-service/src/credits/credit.schemas.ts` (add `userIdParamSchema`), `credit-service/src/credits/credits.service.ts` (add `getBalance`), `credit-service/src/app.module.ts` (register controller)

**Interfaces:**
- Consumes: `JwtAuthGuard`, `AuthedRequest`, `denied` (Task 2); `ErrorCode.WALLET_NOT_FOUND` (Task 1); `parseOr400` (existing).
- Produces: `CreditsService.getBalance(userId: string): Promise<Balance>` with `interface Balance { userId: string; available: number; reserved: number }`; route `GET /credits/:userId`.

- [ ] **Step 1: Write the failing HTTP test** — `src/credits/balance.http.int.spec.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated HTTP-level tests for the balance route: access rule, 404, validation, and the
 *        separation between user tokens and the service key.
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
import { emptyTables, openTestDatabase } from '../test/database';
import { JwksStub, makeKey, signToken } from '../test/jwks-stub';
import { BalanceController } from './balance.controller';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

const stub = new JwksStub();
const key = makeKey('k1');
const alice = randomUUID();
const bob = randomUUID();
let pool: Pool;
let app: INestApplication;
let baseUrl: string;

const token = (sub: string, role: 'USER' | 'ADMIN' = 'USER') => signToken(key, { sub, role });
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers });

beforeAll(async () => {
  await stub.start();
  pool = await openTestDatabase();
  @Module({
    controllers: [BalanceController, CreditsController],
    providers: [CreditsService, { provide: PG_POOL, useValue: pool }],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
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
  await emptyTables(pool);
  await pool.query(`INSERT INTO credit_accounts (user_id, available, reserved) VALUES ($1, 7, 3)`, [alice]);
});

it('shows a user their own balance', async () => {
  const res = await get(`/credits/${alice}`, { authorization: `Bearer ${token(alice)}` });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ userId: alice, available: 7, reserved: 3 });
});

// Review Focus 3
it('accepts the caller’s own id in upper case', async () => {
  const res = await get(`/credits/${alice.toUpperCase()}`, { authorization: `Bearer ${token(alice)}` });
  expect(res.status).toBe(200);
});

// Review Focus 1
it('refuses another user’s balance with 403, logs it, and reveals nothing', async () => {
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const res = await get(`/credits/${alice}`, { authorization: `Bearer ${token(bob)}` });
  const body = await res.text();
  expect(res.status).toBe(403);
  expect(body).not.toContain('available');
  expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'access_denied', status: 403, userId: bob });
  warn.mockRestore();
});

it('lets an admin read anyone’s balance', async () => {
  const res = await get(`/credits/${alice}`, { authorization: `Bearer ${token(bob, 'ADMIN')}` });
  expect(res.status).toBe(200);
});

it('answers 404 WALLET_NOT_FOUND and creates nothing when there is no wallet', async () => {
  const res = await get(`/credits/${bob}`, { authorization: `Bearer ${token(bob)}` });
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ code: 'WALLET_NOT_FOUND' });
  const { rowCount } = await pool.query('SELECT 1 FROM credit_accounts WHERE user_id = $1', [bob]);
  expect(rowCount).toBe(0);
});

// Review Focus 2
it.each(['me', 'not-a-uuid', '1'])('answers 400 for the path id "%s"', async (id) => {
  const res = await get(`/credits/${id}`, { authorization: `Bearer ${token(alice, 'ADMIN')}` });
  expect(res.status).toBe(400);
});

it('answers 401 without a token', async () => {
  expect((await get(`/credits/${alice}`)).status).toBe(401);
});

// Review Focus 5
it('keeps user tokens and the service key apart', async () => {
  const withServiceKey = await get(`/credits/${alice}`, { 'x-service-key': config.serviceKey });
  expect(withServiceKey.status).toBe(401);

  const withToken = await fetch(`${baseUrl}/internal/credits/release`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(alice, 'ADMIN')}` },
    body: JSON.stringify({ orderId: randomUUID() }),
  });
  expect(withToken.status).toBe(401);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test:int -- src/credits/balance.http.int.spec.ts`
Expected: FAIL — `Cannot find module './balance.controller'`.

- [ ] **Step 3: Add the path schema to `src/credits/credit.schemas.ts`** (and the 2026-10-14 header lines)

```ts
// The path id for GET /credits/:userId. Lower-cased so it compares equal to the token's `sub`.
export const userIdParamSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());
```

- [ ] **Step 4: Add `getBalance` to `src/credits/credits.service.ts`**

Above the class:

```ts
export interface Balance {
  userId: string;
  available: number;
  reserved: number;
}
```

Inside the class, after `release`:

```ts
  /** A user's balance; 404 WALLET_NOT_FOUND when their wallet doesn't exist yet. Never creates one. */
  async getBalance(userId: string): Promise<Balance> {
    const { rows } = await this.pool.query<{ user_id: string; available: number; reserved: number }>(
      'SELECT user_id, available, reserved FROM credit_accounts WHERE user_id = $1',
      [userId],
    );
    if (!rows[0]) {
      throw new ProblemException(404, 'This user has no credit wallet yet.', ErrorCode.WALLET_NOT_FOUND);
    }
    return { userId: rows[0].user_id, available: rows[0].available, reserved: rows[0].reserved };
  }
```

- [ ] **Step 5: Write `src/credits/balance.controller.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: GET /credits/:userId from the redesign spec §4.4: a USER reads only their own balance,
 *        an ADMIN reads anyone's; the token says who asks, the path says whose balance.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthedRequest, denied, JwtAuthGuard } from '../common/jwt-auth.guard';
import { parseOr400, userIdParamSchema } from './credit.schemas';
import { Balance, CreditsService } from './credits.service';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class BalanceController {
  constructor(private readonly credits: CreditsService) {}

  @Get(':userId')
  balance(@Param('userId') rawUserId: string, @Req() req: AuthedRequest): Promise<Balance> {
    const userId = parseOr400(userIdParamSchema, rawUserId, 'user id');
    if (req.caller.role !== 'ADMIN' && req.caller.id.toLowerCase() !== userId) {
      throw denied(req, 403, 'You can only view your own credit balance.', req.caller);
    }
    return this.credits.getBalance(userId);
  }
}
```

- [ ] **Step 6: Register it in `src/app.module.ts`** (and the 2026-10-14 header lines)

```ts
import { BalanceController } from './credits/balance.controller';
// …
  controllers: [CreditsController, BalanceController],
```

- [ ] **Step 7: Run everything**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run test:int`
Expected: all pass, including the 10 new balance tests.

- [ ] **Step 8: Try it against the real User Service** (repo root; needs `CREDIT_SERVICE_KEY` in `.env`)

```bash
docker compose up -d --build user-service credit-service
TOKEN=$(curl -s -X POST localhost:3001/auth/login -H 'content-type: application/json' \
  -d '{"email":"<a verified test account>","password":"<its password>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
SUB=$(python3 -c "import sys,json,base64;p='$TOKEN'.split('.')[1];print(json.loads(base64.urlsafe_b64decode(p+'==='))['sub'])")
curl -s -w ' [%{http_code}]\n' localhost:3004/credits/$SUB -H "authorization: Bearer $TOKEN"
```

Expected: `{"…","code":"WALLET_NOT_FOUND",…} [404]` for an account that has never ordered (lazy creation is still Phase 1 behaviour), or `{"userId":…,"available":…,"reserved":…} [200]` after one reserve. Do not paste the token anywhere.

- [ ] **Step 9: Commit**

```bash
git add src/credits/balance.controller.ts src/credits/balance.http.int.spec.ts src/credits/credit.schemas.ts \
  src/credits/credits.service.ts src/app.module.ts
git commit -m "feat(credit-service): GET /credits/:userId for a user's own balance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Envoy route (needs PR #69 merged; Jie Yang owns the gateway)

**Files:**
- Create: `api-gateway/envoy/routes/30-credit.routes.json`
- Modify: `api-gateway/compose.yaml`, `api-gateway/.env.example`, `api-gateway/test/envoy_routes_test.py` only if its fixture lists route files explicitly
- Resolve on merge: `compose.yaml` (keep the `credit-service/compose.yaml` include **and** PR #69's `- api-gateway/compose.yaml`)

**Interfaces:**
- Consumes: the Credit route `GET /credits/:userId` (Task 3); PR #69's route-file format (`service`, `urlEnv`, `routes[{method, regex}]`, JWT required unless `"public": true`, `Authorization` forwarded).
- Produces: `GET /credits/<id>` reachable on `localhost:3003` with a valid JWT; `/internal/**` still unreachable.

- [ ] **Step 1: Stop if PR #69 isn't merged**

Run: `git fetch origin && git ls-tree origin/main api-gateway/envoy/routes/ | grep -q routes.json && echo merged || echo "not merged"`
Expected: `merged`. If `not merged`, stop here, report to Jian Bing, and skip to Task 5.

- [ ] **Step 2: Merge `main` and keep both includes**

```bash
git merge origin/main
```

If `compose.yaml` conflicts, its include list must read (in this order) `user-service`, `supplier-service`, `credit-service` (with `env_file: .env`), then PR #69's comment line and `- api-gateway/compose.yaml`, then `frontend`. Then `docker compose config --services` must list `api-gateway` and `credit-service`. Commit the merge.

- [ ] **Step 3: Write the failing end-to-end check** (repo root; save as a script you run, not a committed file)

```bash
docker compose up -d --build user-service credit-service api-gateway
TOKEN=<login as in Task 3 Step 8, but against localhost:3003/auth/login>
SUB=<decoded as in Task 3 Step 8>
curl -s -o /dev/null -w '%{http_code}\n' localhost:3003/credits/$SUB -H "authorization: Bearer $TOKEN"
```

Expected now: `404` from Envoy's final route with **no** `"code"` field (the route isn't declared yet).

- [ ] **Step 4: Create `api-gateway/envoy/routes/30-credit.routes.json`**

```json
{
  "_disclosure": "AI Assistance Disclosure:\nTool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14\nScope: Route for the Credit Service balance read (redesign spec §4.4); JWT required, path forwarded unchanged.\nAuthor review: pending — Jian Bing to record what he checked; Jie Yang to review as gateway owner.",
  "service": "credit",
  "urlEnv": "CREDIT_SERVICE_URL",
  "routes": [
    {
      "method": "GET",
      "regex": "/credits/[^/]+"
    }
  ]
}
```

- [ ] **Step 5: Give the gateway the Credit URL**

`api-gateway/compose.yaml`, in `environment`, after `SUPPLIER_SERVICE_URL`:

```yaml
      CREDIT_SERVICE_URL: ${CREDIT_SERVICE_URL:-http://credit-service:3004}
```

`api-gateway/.env.example`, after `SUPPLIER_SERVICE_URL=…`:

```dotenv
CREDIT_SERVICE_URL=http://credit-service:3004
```

- [ ] **Step 6: Run the route-loader tests**

Run: `python api-gateway/test/envoy_routes_test.py`
Expected: all pass. If a test enumerates route files or services explicitly and fails only because `credit` is new, add `credit` to that list in the same style and re-run.

- [ ] **Step 7: Re-run the end-to-end check**

```bash
docker compose up -d --build api-gateway
curl -s -w ' [%{http_code}]\n' localhost:3003/credits/$SUB -H "authorization: Bearer $TOKEN"
curl -s -o /dev/null -w 'no token: %{http_code}\n' localhost:3003/credits/$SUB
curl -s -o /dev/null -w 'internal: %{http_code}\n' -X POST localhost:3003/internal/credits/release -H 'content-type: application/json' -d '{}'
```

Expected: the Credit Service's own answer (`200` balance, or `404` with `"code":"WALLET_NOT_FOUND"`); `no token: 401`; `internal: 404`.

- [ ] **Step 8: Commit**

```bash
git add api-gateway/envoy/routes/30-credit.routes.json api-gateway/compose.yaml api-gateway/.env.example
git commit -m "feat(api-gateway): route GET /credits/:userId to the Credit Service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Postman, docs and the usage log

**Files:**
- Modify: `credit-service/postman/credit.postman_collection.json`, `credit-service/AGENTS.md`, `credit-service/README.md`, `ai/usage-log/jian-bing.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add a balance folder to the Postman collection**

```bash
cd "/Users/user/github repos/GrabFoc/credit-service/postman" && python3 - <<'EOF'
import json
p = "credit.postman_collection.json"; c = json.load(open(p))
c["variable"] += [{"key": "gatewayUrl", "value": "http://localhost:3003"},
                  {"key": "userToken", "value": ""}, {"key": "userId", "value": ""}]
def get(name, url, status, auth=True):
    headers = [{"key": "Authorization", "value": "Bearer {{userToken}}"}] if auth else []
    return {"name": name,
            "event": [{"listen": "test", "script": {"type": "text/javascript",
                       "exec": [f"pm.test('status {status}', () => pm.expect(pm.response.code).to.be.oneOf({status}));"]}}],
            "request": {"method": "GET", "header": headers, "url": {"raw": url}}}
c["item"].append({"name": "4. Balance (through the gateway)", "description":
    "Set userToken to an access token from POST {{gatewayUrl}}/auth/login and userId to that user's id (the token's sub).",
    "item": [get("Own balance → 200, or 404 WALLET_NOT_FOUND before the first order", "{{gatewayUrl}}/credits/{{userId}}", [200, 404]),
             get("Another user's balance → 403", "{{gatewayUrl}}/credits/{{$guid}}", [403]),
             get("No token → 401", "{{gatewayUrl}}/credits/{{userId}}", [401], auth=False),
             get("Not a UUID → 400", "{{gatewayUrl}}/credits/me", [400])]})
c["info"]["description"] = c["info"]["description"].replace(
    "Author review: pending — Jian Bing to record what he checked.",
    "Author review: pending — Jian Bing to record what he checked. 2026-10-14: added the balance folder.")
json.dump(c, open(p, "w"), indent=2, ensure_ascii=False)
EOF
```

If Task 4 was skipped, change `gatewayUrl` to `http://localhost:3004` in the import (Credit directly).

- [ ] **Step 2: Run the collection with Newman** (stack from Task 4 Step 7 running)

```bash
npx -y newman@6 run credit.postman_collection.json --env-var "serviceKey=<CREDIT_SERVICE_KEY>" \
  --env-var "userToken=$TOKEN" --env-var "userId=$SUB"
```

Expected: 0 failed assertions.

- [ ] **Step 3: Update `credit-service/AGENTS.md`**

In **API [Proposed]**, add a row and a paragraph:

```markdown
| `GET /credits/:userId` (through the gateway, user JWT) | — | **200** `{userId, available, reserved}` | 400 path id not a UUID; 401 no/invalid token; 403 a USER asking for another user (logged); 404 `WALLET_NOT_FOUND`; 503 JWKS unreachable |
```

```markdown
Errors carry a machine-readable `code` (`INSUFFICIENT_CREDITS`, `WALLET_NOT_FOUND`, `HOLD_MISMATCH`,
`ALREADY_TRANSFERRED`, `ALREADY_RELEASED`, `COURIER_IS_REQUESTER`, `HOLD_NOT_FOUND`); validation and
auth errors have none. The balance route verifies the user JWT itself against `CREDIT_JWKS_URL`;
the `/internal` routes keep the service key, and neither credential opens the other's routes.
```

Remove `GET own balance for users (CSFR1.2)` and the "both 409, only by detail" line from **Open items**, and add the 2026-10-14 lines to the file's disclosure header.

- [ ] **Step 4: Update `credit-service/README.md`**

Add under **Try it**:

```markdown
### Read a balance

Through the gateway with a user's access token (their own id, or any id as an ADMIN):

    curl localhost:3003/credits/<userId> -H "authorization: Bearer <accessToken>"

`404` with `"code":"WALLET_NOT_FOUND"` means the user has no wallet yet.
```

and the 2026-10-14 header lines.

- [ ] **Step 5: Add the session to `ai/usage-log/jian-bing.md`**

Insert above the newest entry, following the template in `ai/usage-log.md`: date 2026-10-14; title "Credit Service redesign: design discussion, spec, plan and Phase 1"; Tool Claude Code (Claude Opus 5.5); Mode explain, generate; Files (spec, plan, every file from Tasks 1–5); **every prompt Jian Bing sent from the `/superpowers:brainstorming okay i think we got a fe wthings to work on…` message onwards, quoted exactly, typos included**, plus the picker answers ("Discuss", "Confirm and continue", "(a) DLQ + alert"); What it produced; What I changed or rejected (his decisions D1–D10 and the corrections Claude made: wallet events come from User not Order, a sync pre-check can't be authoritative, sagas don't recover lost events, reserve stays synchronous under the hybrid, auto-fixing from the DLQ hides bugs, frontend checks can be bypassed); Verification (the actual test counts and the Newman result). Add a matching `Tool / Scope / Author review: pending` line to the file's disclosure header.

- [ ] **Step 6: Final check and commit**

```bash
cd "/Users/user/github repos/GrabFoc/credit-service" && npx tsc --noEmit -p tsconfig.json && npm test && npm run test:int
cd .. && git add credit-service/postman/credit.postman_collection.json credit-service/AGENTS.md credit-service/README.md ai/usage-log/jian-bing.md
git commit -m "docs(credit-service): document the balance route and error codes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all suites pass before the commit.
