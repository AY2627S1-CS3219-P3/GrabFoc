<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-23
Scope: Wrote this spec from Jian Bing's deployment decisions (made in learning-mode sessions,
       2026-10-14 to 2026-10-23) and the additions Claude Code proposed and he accepted as proposals.
       Claude Code's own calls are marked "(Claude's call)".
Author review: Pending Jian Bing's review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
Scope: §3.3 origin key (X-Origin-Key), from Jian Bing's decision after the automated security review.
Author review: Pending Jian Bing's review.
-->

# AWS deployment design (issue #58)

Status: **[Proposed]**, for team review. Owner of cloud deployment and CI/CD per the Gantt chart: Cole Lin. Jian
Bing led this design. Sub-issues: #99–#111, #113, #114 (#112 closed).

## 1. Intent

Run the whole FoC stack in AWS so the team can demo it at a public HTTPS URL, with a staging copy that every
merge to `main` updates automatically and a production copy that is only updated on purpose.

The guiding rule is **stay as close to the local Docker Compose setup as possible**: the same containers, the
same images, the same environment variable names, and the same databases. Where AWS has to differ, the
difference is named in §9.

### Goals

- Every service from the root `compose.yaml` runs in AWS, reachable over HTTPS.
- Infrastructure is code (Terraform), so an environment can be rebuilt from the repo.
- Merge to `main` → staging deploys and is checked automatically. Production is deployed by a manual, approved
  workflow, using the exact images staging tested.
- Data survives a container or server replacement, and is backed up daily.
- Spending stays inside the AWS credits.

### Non-goals

- High availability or autoscaling (one server per environment is enough for a class project).
- A registered domain name (not possible on the NUS-managed account; see §6).
- Managed data services (RDS, MSK, ElastiCache): they cost more and move further from the local setup.
- HTTPS for local development.

### Anti-goals (failure even if it "works")

- Secrets in the repo, in a committed `.env`, or in GitHub as long-lived AWS keys.
- Any database, Redis, Kafka or service port reachable from the internet. Only CloudFront may reach the server.
- Production running an image that staging never tested.
- A local workflow change that teammates on Windows, Linux or macOS have to work around.

## 2. Constraints

- **AWS account:** NUS-managed (`nusisb_IsbUsersPS`). Route 53 domain registration is blocked, and the credits
  don't cover domains. NUS doesn't allow a second account, so staging and production share this one (§6).
- **Region:** `ap-southeast-1` (Singapore).
- **Budget:** AWS credits only. Budget alerts exist before any resource does (#99).
- **Team platforms:** macOS (Jian Bing), Windows (Jie Yang), Linux (Cole Lin). Local setup must work unchanged on
  all three.
- **Course AI policy:** this spec is AI-written from the team's decisions; architecture changes still need the
  team's agreement.

## 3. Architecture

```
Internet
   │  HTTPS (AWS's certificate for dxxxx.cloudfront.net)
   ▼
CloudFront (one distribution per environment; caching off)
   │  plain HTTP, port 80
   ▼
┌──────────── VPC → one public subnet → one EC2 server (ECS on EC2) ─────────────────┐
│ Security group: inbound 80 only, from CloudFront's origin-facing prefix list       │
│                                                                                     │
│  Envoy (edge + API gateway)                                                         │
│    :80   /gateway/*  → strip "/gateway" → JWT check → user / supplier / … services   │
│    :80   everything else → frontend                                                 │
│    :3003 unchanged, internal only (frontend's server-side calls)                    │
│                                                                                     │
│  frontend · user · supplier · credit · order services                               │
│  user-db · supplier-db · credit-db · order-db (PostgreSQL 17) · user-redis · kafka  │
│                                                                                     │
│  EBS volume mounted at /data ── daily snapshots; daily pg_dump → S3                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
Outbound: Gmail SMTP on 587 (User Service email)
```

### 3.1 Compute: ECS on EC2 (#102, #106)

- **ECS on EC2, not Fargate or plain EC2 with compose** (Jian Bing's decision, 2026-10-18): Terraform knows every
  container and its settings, which plain EC2 + compose would hide in a script; EC2 is cheaper than Fargate for
  containers that run all day.
- One `t3.large` server per environment, from the ECS-optimised AMI, in an EC2 capacity provider.
- **Bridge network mode with ECS Service Connect**, so containers keep their compose names
  (`user-service:3001`, `kafka:9092`, …) and connection strings don't change.
- One ECS service per compose service: frontend, api-gateway, user-service, supplier-service, credit-service,
  order-service, user-db, supplier-db, credit-db, order-db, user-redis, kafka.
- One-shot containers (`kafka-init`, `order-migrate`) become one-off ECS tasks run by the deploy workflow before
  the services that need them are updated (Claude's call).
- Not deployed: `kafka-ui` (Claude's call). `mailpit` runs in staging only, as a relay (§6).
- ECS has no cross-service `depends_on`, so every service retries connecting to PostgreSQL, Redis and Kafka on
  start-up instead of exiting.
- Memory reservation and limit per container; logs go to CloudWatch Logs.
- IMDSv2 required with hop limit 1, so containers can't read the server's IAM credentials. No SSH; shell access
  through Systems Manager Session Manager.

### 3.2 Network (#101)

- One VPC per environment, one public subnet, an internet gateway, and a route table sending `0.0.0.0/0` to it.
  No private subnet or NAT gateway (Jian Bing's decision: a NAT gateway costs more than the server, and the
  security group already blocks inbound traffic).
- Security group: inbound **port 80 only, from the CloudFront origin-facing managed prefix list**
  (`com.amazonaws.global.cloudfront.origin-facing`). A self rule for ECS bridge-mode dynamic ports. Nothing else.
- Elastic IP on the server, so its public DNS name (CloudFront's origin) doesn't change when it restarts.

### 3.3 Edge: CloudFront in front of Envoy (#110, #111)

- **CloudFront terminates HTTPS** with its default `*.cloudfront.net` certificate (Jian Bing's decision,
  2026-10-23, replacing Let's Encrypt on Envoy): it fits the AWS setup, and there is no certificate to obtain or
  renew.
- CloudFront origin: the server's public DNS name, HTTP on port 80. Caching disabled for every path; all
  headers, cookies and query strings forwarded.
- **One hostname, split by path:** `/gateway/*` → API routes, everything else → frontend. The prefix is
  `/gateway` because the frontend already owns `/api/session/*` and `/admin/locations` (Jian Bing's choice of
  name). Envoy strips `/gateway` before matching its existing routes, so service routes don't change.
- Envoy's port 80 **serves requests and never redirects to HTTPS**: CloudFront talks HTTP to it, so a redirect
  would loop.
- Envoy's frontend route removes any client-sent `X-Forwarded-Proto`, then sets it from CloudFront's
  `CloudFront-Forwarded-Proto`. Today `api-gateway/envoy/compatibility.lua` strips `X-Forwarded-Proto`, so
  without this every page shows "Browser not supported" (`frontend/app/layout.tsx`).
- API routes keep stripping `Cookie`, `X-User-Id`, `X-User-Role` and `X-Forwarded-*` as they do today.
- `/internal/*` is never routed.
- Envoy gets a second listener on port 80 for this public traffic; the internal `:3003` listener is unchanged.
  The frontend route skips the JWT filter (the frontend handles its own session) (Claude's call).
- New Order and Credit routes join `/gateway/*` the same way when the gateway owner adds them; this spec doesn't
  add any.
- **Origin key** (Jian Bing's decision, 2026-10-25): the prefix list admits *any* CloudFront
  distribution, so CloudFront also adds a secret `X-Origin-Key` header (generated by Terraform, kept
  in SSM as `CLOUDFRONT_ORIGIN_KEY`, passed to the gateway as `GATEWAY_ORIGIN_KEY`), and Envoy rejects
  port-80 requests without it, like `X-Service-Key` between services. The value is in Terraform
  state, which the pull-request plan role can read (accepted: it only bypasses this one check).
- The CloudFront → Envoy leg is unencrypted. Accepted (Jian Bing's decision) because only CloudFront can reach
  port 80.

### 3.4 Frontend behind the proxy (#113)

- The origin and HTTPS checks read `X-Forwarded-Proto` / `X-Forwarded-Host` when present, and fall back to the
  plain request locally (`localhost` over HTTP stays allowed).
- Session cookies must be marked `Secure` in AWS. `frontend/lib/session-server.ts:46` uses
  `request.nextUrl.protocol`, which may be `http:` behind the proxy; test it and fix it if so.
- The public site URL comes from an environment variable (the CloudFront URL in AWS).

## 4. Data (#104, #105)

- **All stateful containers run on the one server and write to one EBS volume** mounted at `/data`
  (Jian Bing's decision: one source of truth, less to manage; data is expected to stay under 2 GB):

  | Container | Folder |
  |---|---|
  | user-db | `/data/user-db` |
  | supplier-db | `/data/supplier-db` |
  | credit-db | `/data/credit-db` |
  | order-db | `/data/order-db` |
  | user-redis | `/data/redis` |
  | kafka | `/data/kafka` |

- One PostgreSQL container per service, as locally (AGENTS.md §3: no shared database).
- The volume is kept when the server is deleted, and re-attached and mounted on start-up. Start-up also creates
  the folders with each image's user as owner (Kafka runs as non-root and can't write to a root-owned folder).
- Redis keeps AOF persistence (`--appendonly yes --appendfsync everysec`), so login lockouts and OTP request
  limits survive a restart (Jian Bing's decision).
- Kafka has a retention limit (time or size) so it can't fill the shared disk.
- CloudWatch alarm when the volume passes 80% full.
- **Backups** (Jian Bing's decision, both kinds): daily EBS snapshots kept 7 days (Data Lifecycle Manager), and a
  daily `pg_dump` of every service database to S3 kept 30 days. Restore is tested once from each.
- **Local stays on named Docker volumes** (Jian Bing's decision, 2026-10-23). Bind mounts mirroring `/data` were
  considered and dropped: PostgreSQL bind mounts fail on Windows drives, and Kafka needs folder-owner fixes on
  Linux. No local setup step is added.

## 5. Images, secrets and configuration (#106, #107)

- One ECR repository per service. CI builds each image once and tags it with the commit SHA. Production deploys
  the tag staging tested; it never rebuilds.
- Environment variable **names** stay as in `.env.example` and the compose files. Secret values (database
  passwords, `USER_JWT_PRIVATE_KEY`, HMAC/AES keys, service keys, the Gmail app password) come from SSM
  Parameter Store (SecureString), one path per environment. Non-secret values live in the task definitions.
- Nothing secret is committed or stored in GitHub; GitHub Actions reaches AWS through OIDC roles (#99).

## 6. URL, email and accounts (#99, #114)

- **URL:** the CloudFront `dxxxx.cloudfront.net` name for each environment. No domain.
- **Email: Gmail SMTP** (app password, port 587; AWS blocks port 25), the same code path as local (Jian Bing's
  decision). The User Service's existing `USER_SMTP_*` variables choose where mail goes:
  - **Production:** straight to Gmail.
  - **Staging:** to Mailpit in **relay mode**, which keeps a copy of every email and forwards it to Gmail
    (Jian Bing's decision, 2026-10-23: real Gmail delivery, with Mailpit kept for debugging and for the automated
    checks to read OTP codes). Mailpit's relay uses the same Gmail app password from SSM. Its web inbox is not
    published; the security group already blocks it.
- **One AWS account for both environments** (NUS doesn't allow a second; confirmed by Jian Bing 2026-10-23).
  Staging and production are kept apart by (Claude's call):
  - a separate VPC, server, EBS volume, CloudFront distribution and ECS cluster per environment;
  - an `env` tag and an `foc-staging-` / `foc-production-` name prefix on every resource;
  - separate SSM paths (`/foc/staging/…`, `/foc/production/…`) and Terraform state files;
  - two GitHub OIDC roles: the staging role (any run on `main`) can only touch `foc-staging-*` resources; the
    production role is trusted only from the GitHub `production` environment.
- Budget alerts before anything else; no day-to-day root-user use.

## 7. Infrastructure as code (#100)

- Terraform, state in S3 with locking.
- One set of modules for both environments, with per-environment settings (account, sizes, names).
- `terraform plan` runs on pull requests that change `infra/`.
- Layout (Claude's call): `infra/terraform/modules/…` and `infra/terraform/envs/{staging,production}`, next to
  the existing `infra/kafka/`.

## 8. Delivery (#108, #109)

- **Staging:** every merge to `main` builds the images, runs the one-off tasks (`kafka-init`, migrations), and
  updates the staging services.
- **Staging checks:** health checks for each service, then the Postman collections run with newman against the
  staging CloudFront URL. newman runs as a **one-off ECS task on the staging server**, not on GitHub's runner,
  so it can read OTP codes from Mailpit (which isn't reachable from outside). The deploy workflow starts the task
  and fails if it fails. A failed check blocks promotion.
- **Production:** a manually triggered workflow, only from `main`, behind a GitHub `production` environment that
  needs approval. It deploys the image tags staging passed.
- **Rollback:** redeploy the previous image tag.
- **Postman collections** use `{{baseUrl}}/gateway/...`. Locally, Envoy's `:3003` also accepts `/gateway/*`
  (prefix stripped) and still accepts unprefixed paths for the frontend's internal calls, so only `baseUrl`
  changes between local and AWS (Jian Bing's decision).

## 9. Local vs AWS: what differs

| | Local (Docker Compose) | AWS |
|---|---|---|
| Entry | `http://localhost:3000` (frontend), `http://localhost:3003` (gateway) | `https://dxxxx.cloudfront.net` (both, split by `/gateway`) |
| HTTPS | none | CloudFront |
| Orchestration | Compose `depends_on` | ECS services with start-up retries; one-off tasks |
| Service names | compose DNS | Service Connect (same names) |
| Data | named Docker volumes | folders on one EBS volume at `/data` |
| Email | Mailpit | Staging: Mailpit relaying to Gmail; production: Gmail |
| Secrets | git-ignored `.env` | SSM Parameter Store |
| Tools | kafka-ui, Mailpit, published ports | none published; Session Manager |

## 10. Open items

1. **Team agreement.** CloudFront replaces Envoy as the HTTPS terminator, and `/gateway/*` is a new public path
   on Jie Yang's gateway.

## 11. Left to the builder

- Terraform resource layout within modules, naming and tagging.
- Exact memory numbers per container (start from local `docker stats`).
- How start-up attaches and mounts the EBS volume (user data or an ECS daemon task).
- The `pg_dump` job's form (scheduled ECS task or a script on the server).
- Each container's health check (reuse the compose health checks; add HTTP health routes where a service lacks
  one).
- CloudFront cache and origin-request policies that achieve "no caching, forward everything".
