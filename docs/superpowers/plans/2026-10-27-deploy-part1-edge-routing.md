<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
Scope: Wrote this implementation plan for deployment part 1 (#141) from the approved spec
       docs/superpowers/specs/2026-10-23-aws-deployment-design.md (§3.3, §3.4, §8) and the changes Jie Yang
       approved on 2026-10-27. Choices the spec leaves open are marked "(Claude's call)".
Author review: Pending Jian Bing's review.
-->

# Edge Routing (Deploy Part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CloudFront URL serves the website: `/gateway/*` reaches the API, every other path reaches the
frontend, and only requests carrying CloudFront's `X-Origin-Key` get in.

**Architecture:** Envoy gains a second listener (the *edge* listener), enabled by `GATEWAY_EDGE_PORT`. It
checks `X-Origin-Key`, sends `/gateway/*` (prefix removed) to the existing API routes, and sends every other
path to the frontend with its cookies and Host intact. The internal `:3003` listener is unchanged except that it
also accepts `/gateway/*`, so Postman uses the same paths locally and on AWS. Terraform maps host port 80 to the
edge listener and starts the frontend after the gateway.

**Tech Stack:** Envoy 1.38.6 config rendered by Python (`api-gateway/envoy/render.py`), Envoy Lua filter,
Next.js 16 (`frontend/`), Terraform `terraform test` with the mocked AWS provider.

**Spec:** `docs/superpowers/specs/2026-10-23-aws-deployment-design.md` §3.3, §3.4, §8 and §9 (issue #141 → #110,
#113). Jie Yang approved the routing changes on 2026-10-27.

**Branch:** `feat/edge-routing`, cut from `feat/aws-infra` (PR #146 is not merged yet; Tasks 5–6 need its
Terraform). Worktree `/Users/user/github repos/GrabFoc-edge`.

## Global Constraints

- Public API prefix is exactly `/gateway`. Envoy removes it before matching, so the route files don't change.
- Edge listener: `GATEWAY_EDGE_PORT=8080` inside the container, published as host port 80 (Claude's call: Envoy
  runs as uid 65532, which can't count on binding ports below 1024).
- Origin key: header `X-Origin-Key`, value from `GATEWAY_ORIGIN_KEY` (SSM `CLOUDFRONT_ORIGIN_KEY`, already
  passed by Terraform). Missing or wrong → `403 {"error":"Forbidden"}`. The header is never forwarded upstream.
- The frontend's upstream is `FRONTEND_URL` (`http://frontend:3000` on AWS).
- API routes keep stripping `Cookie`, `X-User-Id`, `X-User-Role` and `X-Forwarded-*` (`compatibility.lua`).
  The frontend route keeps `Cookie` and `Host`, strips `X-User-Id`/`X-User-Role`/`X-Forwarded-*`, then sets
  `X-Forwarded-Proto` from `CloudFront-Forwarded-Proto` (spec §3.3).
- `/internal/*` is never routed, with or without `/gateway`.
- Envoy's edge listener never redirects to HTTPS (CloudFront talks HTTP to it; a redirect would loop).
- Every changed file gets a new AI Assistance Disclosure entry and `AI-generated` block markers. Author review
  lines say "Pending Jie Yang's review" (gateway) or "Pending review" (others); never write a review that
  didn't happen. The prompts go in `ai/usage-log/jian-bing.md`.
- Billed or outward-facing AWS steps (image push, `terraform apply`) wait for Jian Bing's OK.

## Review Focus

1. **Refreshing a page whose path is also an API path** (`/orders`, `/credits/history`, `/admin/locations`)
   through CloudFront must return the page, not API JSON. Pinned in Task 2 (`test_edge_page_paths_reach_frontend`).
2. **A request without the right `X-Origin-Key`**, including `/health` and `/gateway/...`, gets 403 and never
   reaches the frontend or a service. Pinned in Task 2 (integration test "edge rejects a missing or wrong origin key").
3. **The session cookie** must reach the frontend on page routes but still be stripped on `/gateway/*` routes.
   Pinned in Task 2 (integration test "frontend route keeps cookies and host; API route strips them").
4. **A client-sent `X-Forwarded-Proto: https`** over plain HTTP must not make the frontend think it's on HTTPS;
   only CloudFront's own header counts. Pinned in Task 2 (same integration test).
5. **Session cookies behind the proxy** must be `Secure`, and same-origin checks must pass when the browser's
   origin is `https://…` but Next.js receives plain HTTP. Pinned in Task 3 (`proxy-https` test).

---

### Task 1: Internal listener accepts `/gateway/*`

**Files:**
- Modify: `api-gateway/envoy/render.py` (`configuration()`, route building)
- Test: `api-gateway/test/envoy_routes_test.py`, `api-gateway/test/envoy.integration.mjs`
- Modify: `api-gateway/envoy/README.md` (Route files section: one paragraph on `/gateway`)

**Interfaces:**
- Produces: `GATEWAY_PREFIX = "/gateway"` and
  `api_routes(services, prefixes, settings, public_prefix="") -> list[dict]` in `render.py`. With
  `public_prefix="/gateway"`, each route matches `"/gateway" + path` (or `"/gateway" + regex`) and carries
  `"regex_rewrite": {"pattern": {"regex": "^/gateway"}, "substitution": ""}`.

- [ ] **Step 1: Write the failing tests** in `envoy_routes_test.py`:

```python
def test_internal_listener_accepts_gateway_prefix(self):
    routes = self.routes(self.renderer.configuration(self.env), listener=0)
    jwks = [r for r in routes if r["match"].get("path") == "/gateway/.well-known/jwks.json"]
    self.assertEqual(len(jwks), 1)
    self.assertEqual(jwks[0]["route"]["regex_rewrite"]["substitution"], "")
    self.assertTrue(any(r["match"].get("path") == "/.well-known/jwks.json" for r in routes))

def test_gateway_prefix_never_routes_internal_paths(self):
    patterns = [r["match"]["safe_regex"]["regex"] for r in self.routes(
        self.renderer.configuration(self.env), listener=0) if "safe_regex" in r["match"]]
    for path in ("/gateway/internal/credits/reserve", "/gateway/admin/credits/dead-letters"):
        self.assertFalse(any(re.fullmatch(p, path) for p in patterns), path)
```

`self.routes(config, listener)` is a new test helper returning that listener's route list.

- [ ] **Step 2: Run them.** `python api-gateway/test/envoy_routes_test.py` → both FAIL (no `/gateway` routes).
- [ ] **Step 3: Implement.** Move the per-entry loop in `configuration()` into `api_routes()`. The internal
  listener's list is: health, `api_routes(...)`, `api_routes(..., "/gateway")`, then the JSON 404.
- [ ] **Step 4: Run them.** Same command → all tests PASS (7 old + 2 new).
- [ ] **Step 5: Add an integration test** in `envoy.integration.mjs`:
  `test('internal listener serves /gateway paths with the prefix removed', …)`. `GET /gateway/.well-known/jwks.json`
  returns 200 and the stub User upstream sees path `/.well-known/jwks.json`. `GET /gateway/locations` with no
  token returns 401. Run `cd api-gateway && docker build -t foc-envoy:local . && node --test --test-concurrency=1 test/envoy.integration.mjs`
  → all PASS.
- [ ] **Step 6: Commit** `feat(api-gateway): accept /gateway/* on the internal listener (#141)`.

### Task 2: Edge listener (origin key, `/gateway` API, frontend catch-all)

**Files:**
- Modify: `api-gateway/envoy/render.py`
- Create: `api-gateway/envoy/frontend.lua`
- Modify: `api-gateway/Dockerfile` (copy `frontend.lua`; `EXPOSE 3003 8080`)
- Test: `api-gateway/test/envoy_routes_test.py`, `api-gateway/test/envoy.integration.mjs`
- Modify: `api-gateway/envoy/README.md`, `api-gateway/envoy/behaviour-differences.md` (the edge listener's rules)

**Interfaces:**
- Consumes: `api_routes()` and `GATEWAY_PREFIX` from Task 1.
- Produces: environment variables `GATEWAY_EDGE_PORT`, `GATEWAY_ORIGIN_KEY`, `FRONTEND_URL`. When
  `GATEWAY_EDGE_PORT` is unset there is exactly one listener (local behaviour unchanged). When it is set, there
  is a second listener named `edge` and a cluster named `frontend`.

Edge route order: (1) `api_routes(..., "/gateway")`; (2) prefix `/gateway/` and path `/gateway` → JSON 404;
(3) prefix `/` → cluster `frontend`, JWT disabled, **no** `auto_host_rewrite`, Lua per-route override
(`envoy.extensions.filters.http.lua.v3.LuaPerRoute`, `source_code` = `frontend.lua`); (4) a final prefix `/`
→ `403 {"error":"Forbidden"}`. Routes 1–3 all carry the header match
`{"name": "x-origin-key", "string_match": {"exact": <key>}}`, so a missing or wrong key falls through to 4. The
edge `route_config` has `"request_headers_to_remove": ["x-origin-key"]`. No `/health` on the edge listener.

`frontend.lua`: on request, run the same request-target check and `foc.path` metadata as `compatibility.lua`;
remove the hop-by-hop headers, `forwarded`, `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto`,
`x-user-id` and `x-user-role` (**not** `cookie`); then, if `cloudfront-forwarded-proto` is `http` or `https`, set
`x-forwarded-proto` to it. On response, remove the hop-by-hop headers only.

- [ ] **Step 1: Write the failing tests** in `envoy_routes_test.py` (env adds `GATEWAY_EDGE_PORT="8080"`,
  `GATEWAY_ORIGIN_KEY="k"*32`, `FRONTEND_URL="http://frontend:3000"`):

```python
def test_no_edge_listener_without_edge_port(self):
    self.assertEqual(len(self.renderer.configuration(self.env)["static_resources"]["listeners"]), 1)

def test_edge_listener_requires_origin_key_and_frontend(self):
    for missing in ("GATEWAY_ORIGIN_KEY", "FRONTEND_URL"):
        env = {**self.edge_env}; del env[missing]
        with self.subTest(missing=missing), self.assertRaises(ValueError):
            self.renderer.configuration(env)
    for bad in ({"GATEWAY_ORIGIN_KEY": "short"}, {"GATEWAY_EDGE_PORT": "3003"}):
        with self.subTest(bad=bad), self.assertRaises(ValueError):
            self.renderer.configuration({**self.edge_env, **bad})

def test_edge_page_paths_reach_frontend(self):
    routes = self.routes(self.renderer.configuration(self.edge_env), listener=1)
    frontend = [r for r in routes if r.get("route", {}).get("cluster") == "frontend"]
    self.assertEqual(len(frontend), 1)
    self.assertNotIn("auto_host_rewrite", frontend[0]["route"])
    self.assertEqual(frontend[0]["match"]["prefix"], "/")
    self.assertFalse(any(r["match"].get("path") == "/orders" for r in routes))  # no unprefixed API route
    self.assertEqual(routes[-1]["direct_response"]["status"], 403)
    self.assertTrue(all(any(h["name"] == "x-origin-key" for h in r["match"].get("headers", []))
                        for r in routes[:-1]))
```

- [ ] **Step 2: Run them.** `python api-gateway/test/envoy_routes_test.py` → the 3 new tests FAIL.
- [ ] **Step 3: Implement** the edge listener in `render.py` and `frontend.lua` as described above. Validation:
  the edge port is 1–65535 and differs from `GATEWAY_PORT`; the key is at least 32 characters; `FRONTEND_URL`
  passes `origin()`; a route file may not be named `frontend`.
- [ ] **Step 4: Run them.** Same command → all PASS.
- [ ] **Step 5: Add integration tests** to `envoy.integration.mjs`. Add a stub frontend upstream that echoes the
  path, `host`, `cookie` and `x-forwarded-proto` it received. Start Envoy with the edge env and publish `8080/tcp`.
  - `edge rejects a missing or wrong origin key`: `/`, `/health` and `/gateway/.well-known/jwks.json` with no key
    or a wrong key → 403 `{"error":"Forbidden"}`, and the stub frontend and User upstreams saw no request.
  - `edge sends /gateway to the API and everything else to the frontend`: with the key, `/gateway/.well-known/jwks.json`
    → 200 (the User stub sees `/.well-known/jwks.json`); `/gateway/orders/available` with no token → 401;
    `/gateway/internal/credits/reserve` → 404 JSON; `/orders` and `/credits/history` → the stub frontend.
  - `frontend route keeps cookies and host; API route strips them`: send `Host: foc.example`, `Cookie: foc_access=x`,
    `X-Forwarded-Proto: https`, `CloudFront-Forwarded-Proto: http`, `X-User-Id: evil`, `X-Origin-Key: <key>`.
    The frontend stub sees host `foc.example`, the cookie, `x-forwarded-proto: http`, no `x-user-id` and no
    `x-origin-key`. With `CloudFront-Forwarded-Proto: https` it sees `https`. The same headers sent to
    `/gateway/locations` with a valid token reach the Supplier stub with no `cookie` and no `x-origin-key`.
  - Run the integration command from Task 1 → all PASS.
- [ ] **Step 6: Commit** `feat(api-gateway): edge listener for CloudFront with origin key and frontend route (#141)`.

### Task 3: Frontend not-found page and HTTPS behind the proxy

**Files:**
- Create: `frontend/app/not-found.tsx`
- Modify (only if Step 2 fails for the cookie/origin cases): `frontend/lib/session-server.ts`
- Test: `frontend/test/routes.test.mjs`

Before writing code, read the Next.js 16 docs in `frontend/node_modules/next/dist/docs/` for `not-found`
(`frontend/AGENTS.md` requires it).

No new 401 work: every page already sends a signed-out user to `/signin` (`app/components/use-session.tsx:26`,
`app/home/page.tsx:93`, `app/profile/page.tsx:44`, `app/admin/locations/page.tsx:81`, …).

**Interfaces:**
- Produces: `requestProtocol(request: NextRequest): 'http:' | 'https:'` in `session-server.ts`, only if Step 2
  shows Next.js reports `http:` behind the proxy. It returns `https:` when `x-forwarded-proto` is `https` (Envoy
  sets it only from CloudFront's header), and `request.nextUrl.protocol` otherwise. `sameOrigin()` and
  `setSession()` use it.

- [ ] **Step 1: Write the failing tests** in `routes.test.mjs`:

```js
test("unknown pages show the not-found page with a way home", async () => {
  const page = await browser.newPage();
  try {
    const response = await page.goto(`${baseUrl}/no-such-page`);
    assert.equal(response.status(), 404);
    assert.equal(await page.getByRole("heading", { name: "Page not found" }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "Back to Home" }).getAttribute("href"), "/");
  } finally { await page.close(); }
});

test("proxy-https: login behind the proxy sets Secure cookies and passes the origin check", async () => {
  const response = await fetch(`${baseUrl}/api/session/login`, {
    method: "POST",
    headers: { origin: "https://foc.example", host: "foc.example", "x-forwarded-proto": "https",
               "content-type": "application/json" },
    body: JSON.stringify({ email: "student@u.nus.edu", password: "correct-password" }),
  });
  assert.equal(response.status, 200);
  for (const cookie of response.headers.getSetCookie()) assert.match(cookie, /;\s*Secure/i);
});
```

Use the login body the existing successful-login tests use. Node's `fetch` can't set `host`; if it drops the
header, send the request with `node:http` instead.

- [ ] **Step 2: Run them.** `cd frontend && npm run test:routes` → the not-found test FAILS (default page).
  Record whether `proxy-https` fails (403 or no `Secure`) in the ledger.
- [ ] **Step 3: Implement** `app/not-found.tsx` with the `auth-page`/`auth-card` classes from `app/layout.tsx`:
  heading "Page not found", text "This page doesn't exist or has moved.", and a `Link` "Back to Home" to `/`
  (Claude's call on the copy). If `proxy-https` failed, add `requestProtocol()` as above.
- [ ] **Step 4: Run them.** `npm run test:routes` → all PASS; `npm run lint` → clean.
- [ ] **Step 5: Commit** `feat(frontend): not-found page; secure cookies behind CloudFront (#141, #113)`.

### Task 4: Postman uses `/gateway`

**Files:**
- Modify: `api-gateway/postman/gateway.postman_collection.json` (every request URL becomes
  `{{baseUrl}}/gateway/...`; keep `baseUrl`'s default `http://localhost:3003`; update the `_disclosure`
  / description)
- Modify: `api-gateway/README.md` (Postman: set `baseUrl` to the CloudFront URL for AWS)

- [ ] **Step 1: Check** (it should fail now): `python3 -c "import json,sys; c=json.load(open('api-gateway/postman/gateway.postman_collection.json')); u=[]; w=lambda i:[w(x) for x in i.get('item',[])] or (u.append(i['request']['url']['raw']) if 'request' in i else None); w(c); bad=[x for x in u if not x.startswith('{{baseUrl}}/gateway/')]; print(len(u), bad[:3]); sys.exit(bool(bad))"`
  → exits 1 and lists unprefixed URLs.
- [ ] **Step 2: Prefix** every request's `raw` URL and its `path` array with `gateway`.
- [ ] **Step 3: Re-run the check** → prints the count and `[]`, exits 0. With the local stack rebuilt
  (`docker compose up -d --build api-gateway`), run the collection with newman as the README describes → same
  pass count as before the change.
- [ ] **Step 4: Commit** `chore(postman): call the gateway under /gateway (#141)`.

### Task 5: Terraform publishes the edge listener; frontend starts after the gateway

**Files:**
- Modify: `infra/terraform/modules/services/main.tf` (api-gateway env; layers; `moved`)
- Modify: `infra/terraform/envs/staging/variables.tf`, `infra/terraform/envs/production/variables.tf`
  (`edge_container_port` default `8080`)
- Modify: `infra/terraform/modules/services/tests/services.tftest.hcl`
- Modify: `infra/terraform/README.md` (remove the "Until deploy part 1…" paragraph; add the first-creation step below)

**Interfaces:**
- Consumes: `GATEWAY_EDGE_PORT`, `GATEWAY_ORIGIN_KEY`, `FRONTEND_URL` from Task 2.
- Produces: `aws_ecs_service.web["frontend"]`, with `depends_on = [aws_ecs_service.edge]`; `layer.edge` is
  `["api-gateway"]` only; `local.ecs_services` merges all four layers.

The frontend now starts after the gateway, so it learns the `api-gateway` name. The gateway still can't learn
`frontend` on the very first creation of an environment, because a Service Connect client only learns names
that existed when its deployment started. Runbook step for a new environment, after the first apply:
`aws ecs update-service --cluster foc-<env> --service api-gateway --force-new-deployment`
(Claude's call: a one-off manual step instead of a provisioner that would also run inside `terraform test`).

- [ ] **Step 1: Write the failing assertions** in the `staging` run of `services.tftest.hcl`:

```hcl
assert {
  condition     = contains(keys(aws_ecs_service.web), "frontend") && !contains(keys(aws_ecs_service.edge), "frontend")
  error_message = "The frontend starts in its own layer after the gateway."
}
assert {
  condition = alltrue([
    for e in jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].environment :
    e.value == "8080" if e.name == "GATEWAY_EDGE_PORT"
  ]) && contains([for e in jsondecode(aws_ecs_task_definition.service["api-gateway"].container_definitions)[0].environment : e.name], "FRONTEND_URL")
  error_message = "The gateway gets its edge port and the frontend's address."
}
```

Set `edge_container_port = 8080` in that run's variables.
- [ ] **Step 2: Run them.** `infra/terraform/check.sh` → the services test FAILS on the new assertions.
- [ ] **Step 3: Implement.** api-gateway `env` adds `GATEWAY_EDGE_PORT = tostring(var.edge_container_port)` and
  `FRONTEND_URL = "http://frontend:3000"`. Add the `web` layer and service (a copy of `edge` with
  `depends_on = [aws_ecs_service.edge]`) and
  `moved { from = aws_ecs_service.edge["frontend"]  to = aws_ecs_service.web["frontend"] }`. Change both envs'
  `edge_container_port` default to `8080`, and update the README.
- [ ] **Step 4: Run them.** `infra/terraform/check.sh` → every directory passes (envs need a fresh SSO login).
- [ ] **Step 5: Commit** `feat(infra): publish Envoy's edge listener; frontend starts after the gateway (#141)`.

### Task 6: Deploy to staging and check

Stops for Jian Bing's OK before the push and before the apply.

- [ ] **Step 1:** Build and push the images at the new commit: `infra/scripts/push-images.sh <short sha>`.
- [ ] **Step 2:** `terraform -chdir=infra/terraform/envs/staging plan -var image_tag=<short sha>`. Expected: one
  move (frontend → web), new task definitions for every service, the gateway's port mapping now 80 → 8080, no
  destroys outside task definitions. Show it to Jian Bing; apply only on OK.
- [ ] **Step 3: Check through `https://d2vc4gojrvvtgk.cloudfront.net`:**

| Check | Expected |
|---|---|
| `GET /` in a browser | redirects to `/signin`, sign-in page renders (not "Browser not supported") |
| Sign in as the staging admin, open `/orders`, refresh | page renders after refresh |
| `curl -s $URL/gateway/.well-known/jwks.json` | JSON with `keys` |
| `curl -s -o /dev/null -w '%{http_code}' $URL/gateway/locations` | `401` |
| `curl -s $URL/no-such-page` | the not-found page, status 404 |
| `curl -m 5 http://3.1.171.233/` | times out (security group) |
| Set-Cookie after sign-in (browser devtools) | `Secure; HttpOnly` |

- [ ] **Step 4:** Ledger the results; append the prompts to `ai/usage-log/jian-bing.md`; push the branch and open
  the PR (base `feat/aws-infra` until #146 merges), asking Jie Yang to review the gateway files.
