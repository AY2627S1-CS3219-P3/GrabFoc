<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Record the user-approved stock Envoy behaviours compared with the original Node gateway.
Author review: User explicitly accepted Envoy defaults; documentation review pending.
-->

# Stock Envoy behaviour differences

On 2026-10-13 the user instructed: “just change it to the ENVOY defaults but note down
all the differences in behaviour”. This replaces the earlier exact-compatibility goal.
The comparison is against `src/auth.ts`, `src/proxy.ts` and `src/request-logger.ts`, using
official Envoy **v1.38.6**, pinned by digest in `Dockerfile.envoy`.

## JWT verification

| Behaviour | Node reference | Stock Envoy in this configuration |
|---|---|---|
| Expiry and not-before | Reject at `exp <= now`; reject before `nbf`, with no tolerance | Default 60-second clock tolerance. Recently expired or slightly early tokens can pass the gateway. Services still enforce their own verification rules. |
| Expiry missing | Reject | Still reject: `require_expiration: true` is explicitly retained. This is a project setting, not Envoy's optional-expiry default. |
| Signing algorithms | Explicit RS256/ES256 whitelist | Built-in supported algorithms, constrained by the trusted JWKS. No gateway RS256/ES256-only whitelist. A trusted RSA JWK permitting RS384 can verify an RS384 token. |
| Token `kid` | String required; exact matching key selected | Optional. Without an ID, Envoy can try eligible keys. A JWK without an ID can match a token with one. |
| JWK `use` | Nonempty use must be `sig` | The verifier does not enforce the original `use == sig` condition; a usable key marked `enc` can verify a signature. |
| Duplicate eligible keys | First eligible key only | Envoy can try multiple matching keys before failing. |
| Registered claim types | Only expiry/not-before and configured issuer/audience are inspected; other claim types are ignored | Parser checks registered claim types, including `sub`, `iat`, `nbf`, `exp`, `iss`, `aud` and `jti`. Signed tokens with malformed types can be rejected even if the Node verifier accepted them. Time claims use nonnegative integer parsing, rather than general JavaScript numbers. |
| Unknown ID with an unexpired JWKS cache | Immediately fetch latest JWKS once | No forced refresh. A valid newly rotated token can be rejected until that worker's cache expires. Cache duration remains explicitly 60 seconds. |
| Cache scope | One cache per Node process | Envoy caches can be worker-local. Production has two workers; a cold worker may fetch new keys while another still has the old set. |
| Authentication header syntax | Exact capitalised `Bearer ` plus a restricted token-character expression | Envoy's configured Authorization-header extractor and JWT parser decide validity; the Node regular-expression gate is not reproduced. |

Plan key rotation by publishing the new public key before using it to sign, allowing
gateway caches to refresh, and retaining old keys while old tokens remain valid.
The current User Service normally issues RS256 tokens with integer expiry and a key ID;
the broader cases above describe gateway acceptance rules, not changes to issuance.

## Errors and frontend handling

| Situation | Node reference | Stock Envoy |
|---|---|---|
| Missing, malformed, invalid or expired token | 401 JSON `{"error":"Unauthorized"}` | 401 text describing JWT failure, normally with `WWW-Authenticate`. |
| Configured issuer mismatch | 401 JSON | 401 text. |
| Configured audience mismatch | 401 JSON | 403 text; this is distinct from a service role/ownership denial. |
| JWKS unreachable, non-success response or malformed JSON | 503 JSON `{"error":"Authentication service unavailable"}` | JWT filter returns 401 text. The response no longer reliably distinguishes a bad token from an unavailable verifier. |
| Empty JWKS | 401 JSON | 401 text from verification/fetch failure. |
| Upstream connection refused/unavailable | 502 JSON `{"error":"Upstream unavailable"}` | Default 503 text for the connection failure tested. Other resets/protocol/timeouts can have different native statuses and response details. |
| Absolute-form HTTP request target | 400 JSON | Native 404, empty body in the tested HTTP/1 case. It is never used as a proxy destination. |
| Network-path target (`//host/...`) | 400 JSON | Still rejected by the retained request-target filter with 400 JSON. Other HTTP codec failures use native responses. |
| Ordinary unknown path or unsupported method | 404 JSON | Retained 404 JSON direct response. |
| Valid upstream response, including service 403 | Forwarded status/body | Still forwarded; gateway failure mappings do not rewrite service responses. |

Frontends must check status and content type before parsing errors as JSON. A gateway
401 during a JWKS outage cannot be interpreted as proof the student's credentials are
invalid. A 403 may represent audience validation or upstream authorization.

## Proxying, request IDs and logging

| Behaviour | Node reference | Stock Envoy configuration |
|---|---|---|
| Caller request ID | Keep only 1–128 safe ASCII characters; otherwise generate UUID | Default Envoy context-sensitive handling: edge requests normally get a new UUID; internal requests can retain supplied IDs, without the custom regex/length rule. Docker tests retain `trace-123` and `unsafe/id`. |
| UUID tracing bits | No mutation | Default UUID extension may adjust tracing bits in supplied UUIDs. |
| Response ID | Gateway ID overrides upstream ID | `always_set_request_id_in_response: true` retained; response and upstream request IDs correspond. |
| Forwarded host | Node constructs Host from configured upstream URL | `auto_host_rewrite` uses upstream endpoint information. Do not depend on byte-for-byte Host/header casing or HTTP framing. |
| Timeouts | 10-second socket timeout | Explicit 3-second connect timeout and 10-second route idle timeout, with overall route timeout disabled. Idle timeout covers stream activity and is not the identical Node socket timer. |
| Response headers | Node streaming HTTP headers | Native Envoy HTTP codec and server/date/upstream timing headers may differ. Hop-by-hop headers are not an application contract. |
| Structured logs | Completion plus failure-category events; fractional milliseconds | JSON completion logs with native status, integer duration and nullable upstream cluster; additional 401/403 access-attempt events. JWKS failures no longer have a distinct `authentication_unavailable` event. Query strings, bodies and tokens are not logged. |
| Runtime/build | Node gateway or custom native candidate | Precompiled official Envoy. Python runs only to render startup configuration, then is replaced by Envoy. No helper, compiler, custom patch or release registry is required. |

The existing method/path allowlist, public authentication exceptions, bearer forwarding,
identity-header/cookie stripping, unchanged service paths/query/body forwarding, optional
issuer/audience settings, process health endpoint and service-owned authorization remain.
Normalization and slash merging stay disabled; the Lua filter strips headers but does
not clear the route cache, because it does not modify routing inputs.

`test/envoy.integration.mjs` verifies the retained contract and intentional differences,
using one test worker for deterministic cache checks. Production retains two workers.
