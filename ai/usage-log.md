<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Reconstructed and expanded Jie Yang's frontend and API Gateway usage entries; recorded the Supplier gateway routing change on 2026-09-28.
Author review: Pending Jie Yang's review before merge.
-->

# AI Usage Log — FoC (CS3219 AY26/27 S1, Group 3)

Required by Appendix 2 of the project document: *"Maintain a log, `/ai/usage-log.md`, in the
repository with timestamps, prompts, and usage scenarios."* Every AI-assisted change needs an
entry here **as well as** the header comment in each affected file.

## How to add an entry

- Work under **your own `##` heading**. Five people appending to the end of one file conflicts
  on every pull request; editing separate sections does not.
- Newest entry first within your section.
- One entry per pull request. Record the **exact prompts** — paraphrases do not meet the
  policy — but summarise the responses.
- Say what you **rejected or changed**. That is the evidence you reviewed the output rather
  than pasting it.

Template:

```
### YYYY-MM-DD — <what you were doing> (PR #N)
**Tool:** <tool (model)> · **Mode:** generate | refactor | debug | explain
**Files:** <paths>

**Scenario:** why you used it and what for.

**Prompts:**
> exact prompt text

**What it produced:** …
**What I changed or rejected:** …
**Verification:** how you checked it.
```

---

## Zi Yi

<!-- Add your entries here. -->

---

## Deanson

<!-- Add your entries here. -->

## Cole Lin

<!-- Add your entries here. -->

## Jian Bing

<!-- Add your entries here. -->

## Jie Yang

### 2026-09-28 — Supplier Service gateway routes (feature/gateway-supplier-routes)

**Tool:** Codex (GPT-6) · **Mode:** generate, explain
**Files:** `api-gateway/src/server.ts`, `api-gateway/test/gateway.test.js`, `api-gateway/README.md`, `api-gateway/AGENTS.md`, `ai/usage-log.md`

**Scenario:** Map the Supplier Service routes while leaving the final service authentication handoff undecided.

**Prompts (exact):**

~~~text
can you just route the end points for user branch and supplier branch first before we decide how the authentication is going to be handled
implement the plan to integrate user and supplier service
~~~

**What it produced:** An exact Supplier route map, gateway tests, and gateway documentation. Protected routes continue the existing JWT verification and forwarding behavior.

**What I changed or rejected:** Pending owner review; the authentication handoff remains subject to team confirmation.

**Verification:** Gateway test and build results are recorded with the implementation review.

### 2026-09-28 — Reconstruct frontend and gateway AI usage (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** explain, refactor
**Files:** `ai/usage-log.md`

**Scenario:** I asked Codex to reconstruct my entries from this project's local chat transcripts after the log had been removed and restored.

**Prompts (exact):**

~~~text
can you restore the AI usage-log

Ok ONLY from now on, we shall continue on the AI Usage Log, the currently implemented gateway and frontend, can you search our chat history to populate the AI-usage log under Jie Yang

can you search our chat history to populate the AI-usage log under Jie Yang
~~~

**What it produced:** Dated entries below, based on the September 24, 25, 27 and 28 transcripts. The entries distinguish generated code, explanations, team direction and checks reported by Codex. They are provisional work-session entries until the work is assigned to PRs.

**What I changed or rejected:** I restricted the reconstruction to my frontend and gateway work. The other members' sections remain placeholders. My review of these entries is pending.

**Verification:** Codex compared the prompts with local session transcripts and the working-tree files. This log edit does not verify the application itself.

### 2026-09-28 — Gateway identity handoff and plan update (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** explain, refactor
**Files:** `docs/frontend-gateway-implementation-plan.md`; gateway code and tests were inspected, not changed in this exchange.

**Scenario:** I asked about JWT/JWKS, the gateway's authentication role, why caller-supplied identity headers are stripped, and the remaining work. I directed the gateway to forward the JWT to services, then asked Codex to update the plan.

**Prompts (exact, in chronological order):**

~~~text
middleware authorization\
authentication with api gateway

is this enough information to implement the gateway

can you explain further on how JWTK and JWT works first? what are the options i have and the drawbacks etc for each

i still dont understand  this...

so what are the different options meaning?

gateway should handle authentication while the services themselves handle authorization

ok wait what are the current implemented things, can we split them into valid commits and commit it to the branch

dont commit anything yet, jusst explain it first, and get rid of the usage-log.md

whats the proxy n whys it strip the caller supplied user id and role

whats the diff between the 2 options

so it does both now?

the gateway should just forward the JWT to the different services

does the current gateway forward the jwt to the supplier service

how far into this are we

update the plan
~~~

**What it produced:** Codex explained the current gateway behavior and updated the plan to record the JWT handoff, progress and pending contracts. It did not make a commit.

**What I changed or rejected:** I directed the JWT-forwarding approach and stopped the proposed commit. I requested removal of the old log, then later requested its restoration. Service owners still need to confirm their JWT and endpoint contracts.

**Verification:** The plan records eight passing gateway tests from prior work. No live browser-to-service integration was demonstrated in this exchange; my review remains pending.

### 2026-09-27 — Gateway scaffold, frontend routes and partial connection (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug, explain
**Files:** `api-gateway/**`, `frontend/**`, `docs/frontend-gateway-implementation-plan.md`, `.env.example`

**Scenario:** I asked Codex to plan the gateway, implement part 1, add missing frontend pages based on Figma, inspect the Supplier PR, correct two gateway mismatches, and connect token-independent registration actions to the gateway.

**Prompts (exact, in chronological order):**

~~~text
This action is unavailable right now. Please try again later.
whhy, also can you change the name to be GrabFoc instead of campus errand platform?

ok can you create some skills or use the AWWARD and frontend design skills downloaded and architecture for the frontend and API gateway.


I need to create an API gateway for the application. the Sign up and sign in will be given to the user service to handle but will go through the gateway first. The Supplier service will handle the supllier related pages

can you write a .md file of this implementation plan first then implement part 1 first

what are the routes to the other pages

can you create the supplier and user pages too? did you not refer to the figma

most recent PR looks kinda good on postman collection, can start on the gateway stuff&#x20;

this is the supplier service contracts its in the new PR, should i pull it first or can we develop the gateway without this

why cant i click courier view

should i branch out to a feature/frontend branch or should i combine the frontend and api-gateway branches?&#x20;

I was thinking checkout to a frontend-apigateway branch then i pull from the Supplier service branch first

ok can you inspect the Supplier branch?

1. `/location-types` currently returns 404 at the gateway because only `/locations` is routed.
2. The Supplier service defaults to port **3002**, while our example config points it to **3003**.&#x20;

change these 2 first

can you explain how the gateway and frontend work rn..

The gateway also currently passes client-supplied identity headers through   whats this mean and can we connect the gateway to the frontend

cant we implement the other things first before the token related issues.

how can i set up tests to check where each button sends to? I cant check if it sends to the gateway

sign in isnt routed to the api gateway?
~~~

**Additional Figma links supplied in this exchange:**

~~~text
https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-226&p=f&t=zTdyG6lDCXrt5haX-0

[https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-1069&p=f&t=zTdyG6lDCXrt5haX-0](https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-1069\&p=f\&t=zTdyG6lDCXrt5haX-0) user profile page
~~~

**What it produced:** Codex wrote the plan and gateway scaffold with health, public auth proxy, JWT/JWKS verification for protected Supplier routes, tests, configuration and Dockerfile. It added `/locations` and `/profile` frontend shells from the linked frames, made the requester/courier switch clickable, routed `/location-types`, corrected example ports, added a same-origin frontend-to-gateway rewrite, and connected sign-up and OTP resend. It added frontend route tests and changed the verification UI to six digits. Sign-in, code confirmation, session handling and live Supplier data remain pending.

**What I changed or rejected:** I requested the GrabFoc name, two specific gateway corrections, a working courier switch, and token-independent steps first. I asked Codex to inspect the Supplier PR without merging it. Codex flagged the Supplier development guard that trusts client identity headers; that integration remains pending. Final token storage and owner-confirmed service contracts remain pending.

**Verification:** Codex reported passing gateway tests after its changes (six initially, then seven after `/location-types`) and passing frontend lint/build after UI changes. The working-tree plan later records eight gateway tests. These are Codex-reported checks; a live end-to-end test and my own review remain pending.

### 2026-09-24 to 2026-09-25 — Figma authentication frontend and npm verification (uncommitted)

**Tool:** Codex (GPT-6) · **Mode:** generate, debug, explain
**Files:** `frontend/app/**`, `ai/usage-log.md` (initial draft); Figma MCP and skills were installed in local Codex configuration outside the repo.

**Scenario:** I asked Codex to read the D1 document, use the Figma mockup, install frontend skills and Figma MCP, then recreate the authentication frontend before gateway integration.

**Prompts (exact, in chronological order):**

~~~text
C:\Users\njyang\Downloads\cs3219-group3-D1.docx Read this file, i need to create the UI and API gateway for this application. The figma design can be found here. https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=0-1&t=zTdyG6lDCXrt5haX-0 can we install some frontend skills like the AWWWARDS skill and $skill-installer frontend-skill, npx skills add https://github.com/devmartinese/awwwards-animations-skill --skill awwwards-animations run these commands. Then create the neccessary components for the front end for the user service and the supllier service first.

Can you download the figma mcp

https://www.figma.com/design/SEcpUo6sobZ3U68hTcunxd/CS3219-FoC?node-id=2-122&t=zTdyG6lDCXrt5haX-0 can you refer to this now? and recreate the current front end first?

can you use the figma mcp tools

continue please

why is there a bun runtime error i dont think im using bun for this application right

js run npm instead of bun

uh how do i run dev

'npm' is not recognized as an internal or external command,
operable program or batch file.
~~~

**What it produced:** Codex installed the AWWWARDS skill through the Codex installer after `npx` was unavailable, plus frontend and Figma skills. It configured Figma's remote MCP, inspected the authentication frames, and generated responsive sign-in (`/`), sign-up (`/signup`) and verification (`/verify`) screens. Form submission remained unconnected to User Service. It initially tried Bun for checks, then used a verified portable Node installation to run npm after I objected.

**What I changed or rejected:** I asked to recreate the frontend first, questioned Bun, and directed Codex to use npm. The initial UI used the four-digit Figma mockup; the later User Service contract led to the six-digit change recorded above.

**Verification:** Codex reported `npm ci`, `npm run lint` and `npm run build` passing on September 24, with `/`, `/signup` and `/verify` generated. I still need to review the UI and test it against a live User Service.
