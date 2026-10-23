<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-23
Scope: Wrote this implementation plan for deployment part 2 (#142) from the approved spec
       docs/superpowers/specs/2026-10-23-aws-deployment-design.md. Choices the spec leaves open are
       marked "(Claude's call)".
Author review: Pending Jian Bing's review.
-->

# AWS Infrastructure (Deploy Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terraform that stands up the staging and production environments (network, one ECS-on-EC2 server, the
EBS data volume, every container as an ECS service, CloudFront) in the single NUS-managed AWS account, so the
stack runs at a `*.cloudfront.net` HTTPS URL.

**Architecture:** One `global` Terraform stack for account-wide things (state bucket, GitHub OIDC roles, ECR
repositories, budget). Five small modules (`network`, `server`, `services`, `edge`, plus shared naming) composed
by `envs/staging` and `envs/production`, which differ only in their `.tfvars`. Module behaviour is pinned by
`terraform test` with a mocked AWS provider, so tests run in CI without AWS credentials.

**Tech Stack:** Terraform `>= 1.10` (S3 native state locking), AWS provider `~> 6.0`, ECS on EC2 (Amazon Linux
2023 ECS-optimised AMI), ECS Service Connect, CloudFront, SSM Parameter Store, GitHub Actions
(`hashicorp/setup-terraform@v3`).

**Spec:** `docs/superpowers/specs/2026-10-23-aws-deployment-design.md` (issues #142 → #99, #100, #101, #102, #104,
#106, #111). Read §3–§7 before starting.

## Global Constraints

- Region `ap-southeast-1`; availability zone `ap-southeast-1a` for the subnet, the server and the EBS volume.
- Every resource is named `foc-<env>-<thing>` and tagged `project=foc`, `env=<env>` (provider `default_tags`).
- No secret value ever appears in Terraform code, `.tfvars`, state, or a commit. Secrets live in SSM under
  `/foc/<env>/<NAME>` as `SecureString`, written by a script from a git-ignored file; Terraform only references
  their ARNs.
- Environment variable names are exactly those in the compose files and `.env.example`.
- Inbound to the server: TCP 80 from the `com.amazonaws.global.cloudfront.origin-facing` prefix list, and the
  security group's self rule. Nothing else. No SSH key, no port 22.
- IMDSv2 required, hop limit 1.
- EBS volume: kept when the server is replaced (`prevent_destroy`), mounted at `/data`; folders `user-db`,
  `supplier-db`, `credit-db`, `order-db`, `redis`, `kafka`; `kafka` owned by `1000:1000` (apache/kafka runs as
  `appuser` 1000; PostgreSQL and Redis start as root and fix their own folders — checked 2026-10-23).
- One `t3.large`. CloudFront uses the default certificate, caching disabled.
- AI attribution: every new file starts with the AI Assistance Disclosure header (AGENTS.md); the PR adds an
  entry to the implementer's `ai/usage-log/<member>.md`.

## Review Focus

1. **Server replaced (ASG replaces the instance):** the new instance must wait for the old one to release the
   volume, attach it, and mount it **without formatting**. Test in Task 4 (`user_data` formats only when `blkid`
   finds no filesystem).
2. **Service starts before its database or Kafka:** ECS has no `depends_on` across services. The service exits
   and ECS restarts it until the dependency is up; nothing may stay stopped (Claude's call: ECS restarts stand
   in for the spec's in-app start-up retries, so no service code changes). Test in Task 5 (every service has
   no `desired_count` 0 and the deployment circuit breaker is off so restarts continue).
3. **Request that skips CloudFront:** a direct request to the server's IP on 80 must time out. Test in Task 3
   (the only ingress rule's source is the prefix list) and Task 8 step (curl the IP).
4. **Secrets missing in SSM when a task starts:** the task fails to start with a clear `ResourceInitializationError`
   instead of running with blank secrets. Task 7's script refuses to run if any name is unset.
5. **Kafka's self-reference:** `KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093` needs the container to resolve
   `kafka` as itself. Test in Task 5 (the kafka container definition sets `hostname = "kafka"`).

---

## File Structure

```
infra/terraform/
├── README.md                     # how to bootstrap, put secrets, push images, apply, verify (Task 8)
├── global/                       # one per account: state bucket, OIDC roles, ECR repos, budget (Task 1)
│   ├── main.tf  variables.tf  outputs.tf  versions.tf
│   └── tests/global.tftest.hcl
├── modules/
│   ├── network/                  # VPC, subnet, IGW, route table, security group (Task 3)
│   ├── server/                   # IAM, launch template, ASG, capacity provider, EBS, EIP, disk alarm (Task 4)
│   ├── services/                 # namespace, log groups, task definitions, ECS services (Task 5)
│   └── edge/                     # CloudFront distribution (Task 6)
│       (each: main.tf variables.tf outputs.tf versions.tf tests/<module>.tftest.hcl;
│        server/ also user_data.sh.tftpl)
└── envs/
    ├── staging/                  # backend + module calls + staging.tfvars (Task 2, filled in Tasks 3–6)
    └── production/
infra/kafka/Dockerfile.init       # kafka-init as an image (topics.txt + create-topics.sh baked in) (Task 5)
infra/scripts/put-secrets.sh      # writes /foc/<env>/* from a git-ignored file (Task 7)
infra/scripts/push-images.sh      # one-off manual build + push to ECR until part 3's CI exists (Task 7)
.github/workflows/terraform.yml   # fmt, validate, test on PRs touching infra/terraform (Task 2)
.gitignore                        # + infra/terraform/**/.terraform/, *.tfstate*, infra/secrets/ (Task 2)
```

---

### Task 1: Global stack (state bucket, OIDC roles, ECR, budget)

**Files:**
- Create: `infra/terraform/global/{versions,variables,main,outputs}.tf`
- Test: `infra/terraform/global/tests/global.tftest.hcl`

**Interfaces:**
- Produces outputs: `state_bucket` (string, `foc-terraform-state-<account_id>`), `ecr_repository_urls`
  (map(string) keyed `user-service, supplier-service, credit-service, order-service, api-gateway, frontend,
  kafka-init`), `github_role_arns` (map: `plan`, `deploy-staging`, `deploy-production`).
- Uses local state (it creates the bucket the others use) (Claude's call); commit nothing from `terraform.tfstate`.

- [ ] **Step 1: Write the failing test** `global.tftest.hcl` with `mock_provider "aws" {}` and `command = plan`:
  - `aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"`
  - `aws_s3_bucket_public_access_block.state` blocks all four
  - `length(aws_ecr_repository.service) == 7`, each `image_tag_mutability == "IMMUTABLE"`
  - deploy-production role trust `sub` equals `repo:AY2627S1-CS3219-P3/GrabFoc:environment:production`
  - deploy-staging trust `sub` equals `repo:AY2627S1-CS3219-P3/GrabFoc:ref:refs/heads/main`
  - plan role trust `sub` like `repo:AY2627S1-CS3219-P3/GrabFoc:pull_request` and policy `ReadOnlyAccess` + state bucket read
  - `aws_budgets_budget.monthly.limit_amount == var.monthly_budget_usd` with notifications at 50/80/100 %
- [ ] **Step 2: Run** `terraform -chdir=infra/terraform/global init -backend=false && terraform -chdir=infra/terraform/global test` — Expected: FAIL (resources not defined).
- [ ] **Step 3: Implement.** Variables: `github_repo` (default `AY2627S1-CS3219-P3/GrabFoc`), `monthly_budget_usd`
  (number, no default), `budget_emails` (list(string), no default). OIDC provider for
  `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`. Deploy roles' permissions (used by part 3):
  ECR push to the 7 repos; `ecs:RegisterTaskDefinition`, `ecs:Describe*`, `ecs:UpdateService`, `ecs:RunTask`;
  `iam:PassRole` limited to `arn:aws:iam::<acct>:role/foc-<env>-*` (Claude's call: three roles, and humans run
  `terraform apply`; CI only plans).
- [ ] **Step 4: Run test** — Expected: PASS. Also `terraform -chdir=infra/terraform/global validate` → `Success!`.
- [ ] **Step 5: Commit** `feat(infra): global Terraform stack (state, OIDC, ECR, budget)`.

### Task 2: Environment skeletons and CI checks

**Files:**
- Create: `infra/terraform/envs/{staging,production}/{versions,main,variables,outputs}.tf`, `<env>.tfvars`
- Create: `.github/workflows/terraform.yml`
- Modify: `.gitignore`

**Interfaces:**
- Backend: `s3 { bucket = "foc-terraform-state-<acct>", key = "<env>/terraform.tfstate", region = "ap-southeast-1", use_lockfile = true }` (bucket name passed with `-backend-config`, documented in Task 8).
- Provider `default_tags { tags = { project = "foc", env = var.env } }`.
- Env variables used by later tasks: `env` (string), `instance_type` (default `t3.large`), `image_tag` (string),
  `edge_container_port` (number, default `3003` until part 1 adds Envoy's port-80 listener, then `80`).

- [ ] **Step 1: Write the workflow** `terraform.yml`: on `pull_request` with `paths: infra/terraform/**`; `permissions: contents: read`; one job with `hashicorp/setup-terraform@v3` (`terraform_version: "~1.15.0"`), running for each dir in `global modules/* envs/*`: `terraform fmt -check -recursive`, `init -backend=false`, `validate`, and `test` where a `tests/` dir exists. (`terraform plan` with the OIDC plan role is added in part 3 with the deploy workflows (Claude's call: needs the roles from Task 1 applied first).)
- [ ] **Step 2: Run locally** the same loop — Expected: env dirs validate (empty module calls), fmt clean.
- [ ] **Step 3: `.gitignore`** add `infra/terraform/**/.terraform/`, `*.tfstate`, `*.tfstate.*`, `infra/secrets/`. Run `git status --ignored` after a local `init` — Expected: `.terraform/` listed as ignored.
- [ ] **Step 4: Commit** `ci(infra): Terraform fmt/validate/test on pull requests`.

### Task 3: Network module (#101)

**Files:** `infra/terraform/modules/network/*`, test `modules/network/tests/network.tftest.hcl`; call it from both envs.

**Interfaces:**
- Inputs: `env` (string), `cidr` (string; staging `10.20.0.0/16`, production `10.30.0.0/16`) (Claude's call), `az` (default `ap-southeast-1a`).
- Outputs: `vpc_id`, `subnet_id`, `security_group_id`.

- [ ] **Step 1: Failing test** (mock provider, plan; mock `data.aws_ec2_managed_prefix_list.cloudfront` with `id = "pl-mock"`):
  - exactly one `aws_vpc_security_group_ingress_rule` with a non-self source: `from_port == 80`, `to_port == 80`, `ip_protocol == "tcp"`, `prefix_list_id == "pl-mock"`
  - no ingress rule has `cidr_ipv4` set
  - a self-referencing ingress rule (`referenced_security_group_id` = own SG), all ports
  - route `0.0.0.0/0` → internet gateway; subnet `map_public_ip_on_launch == true`
- [ ] **Step 2: Run** `terraform -chdir=infra/terraform/modules/network test` — Expected: FAIL.
- [ ] **Step 3: Implement** with `aws_vpc`, `aws_subnet`, `aws_internet_gateway`, `aws_route_table` + association, `aws_security_group` and separate `aws_vpc_security_group_{ingress,egress}_rule` resources (egress all to `0.0.0.0/0`). Prefix list from `data "aws_ec2_managed_prefix_list"` with `name = "com.amazonaws.global.cloudfront.origin-facing"`.
- [ ] **Step 4: Run test** — Expected: PASS; env dirs `validate` → `Success!`.
- [ ] **Step 5: Commit** `feat(infra): network module (VPC, public subnet, CloudFront-only SG)`.

### Task 4: Server module: ECS cluster, instance, EBS volume, Elastic IP (#102, #104)

**Files:** `infra/terraform/modules/server/{main,variables,outputs,versions}.tf`, `user_data.sh.tftpl`, test `tests/server.tftest.hcl`.

**Interfaces:**
- Inputs: `env`, `subnet_id`, `security_group_id`, `az`, `instance_type`, `data_volume_gb` (default `20`) (Claude's call).
- Outputs: `cluster_name` (`foc-<env>`), `cluster_arn`, `capacity_provider_name`, `public_dns` (from `aws_eip`), `data_volume_id`.

- [ ] **Step 1: Failing test** (mock provider; mock `data.aws_ssm_parameter.ecs_ami` with a fake AMI id):
  - launch template `metadata_options`: `http_tokens == "required"`, `http_put_response_hop_limit == 1`
  - launch template has no `key_name`
  - ASG `min_size == max_size == desired_capacity == 1`, single subnet
  - EBS volume in `var.az`, `type == "gp3"`, `encrypted == true`
  - instance role has `AmazonEC2ContainerServiceforEC2Role` and `AmazonSSMManagedInstanceCore` attached
  - rendered user data contains `ECS_CLUSTER=foc-<env>`, `mkdir -p /data/user-db /data/supplier-db /data/credit-db /data/order-db /data/redis /data/kafka`, `chown 1000:1000 /data/kafka`, and `blkid` before any `mkfs`
  - CloudWatch alarm on `disk_used_percent` for path `/data`, threshold `80`
- [ ] **Step 2: Run** `terraform -chdir=infra/terraform/modules/server test` — Expected: FAIL.
- [ ] **Step 3: Implement.** AMI from SSM `/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id`.
  `aws_ebs_volume.data` with `lifecycle { prevent_destroy = true }`. `user_data.sh.tftpl` (bash, `set -euo pipefail`):
  1. write `ECS_CLUSTER` to `/etc/ecs/ecs.config`;
  2. `aws ec2 associate-address` for the EIP (allow reassociation);
  3. retry `aws ec2 attach-volume` every 10 s for up to 10 min (the old instance may still hold it), wait for the device (NVMe: find by volume id via `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_vol<id without dash>`);
  4. `mkfs -t xfs` only if `blkid` reports no filesystem; add an `/etc/fstab` entry with `nofail`; mount `/data`;
  5. create the folders, `chown 1000:1000 /data/kafka`;
  6. install and start `amazon-cloudwatch-agent` with a config reporting `disk_used_percent` for `/data`.
  Instance role inline policy: `ec2:AttachVolume`/`DescribeVolumes` on this volume, `ec2:AssociateAddress` on this EIP, `cloudwatch:PutMetricData`. ECS capacity provider on the ASG, managed scaling off, managed termination protection off.
- [ ] **Step 4: Run test** — Expected: PASS. `shellcheck` on the rendered template (`terraform console` → write to a temp file) — Expected: no errors.
- [ ] **Step 5: Commit** `feat(infra): ECS-on-EC2 server with persistent /data volume`.

### Task 5: Services module: every container as an ECS service (#106)

**Files:** `infra/terraform/modules/services/*`, test `tests/services.tftest.hcl`; create `infra/kafka/Dockerfile.init`.

**Interfaces:**
- Inputs: `env`, `cluster_arn`, `capacity_provider_name`, `ecr_repository_urls` (map from Task 1), `image_tag`, `edge_container_port`, `ssm_prefix` (`/foc/<env>`), `mailpit_relay` (bool; `true` in staging, `false` in production).
- Outputs: `service_names` (list(string)), `task_definition_arns` (map), `oneoff_task_families` (`foc-<env>-kafka-init`, `foc-<env>-order-migrate`).
- Services (name → image, Service Connect alias:port, host port, `/data` folder):

  | service | image | alias:port | host port | volume |
  |---|---|---|---|---|
  | user-db, supplier-db, credit-db, order-db | `postgres:17-alpine` | `<name>:5432` | — | `/data/<name>` → `/var/lib/postgresql/data` |
  | user-redis | `redis:7-alpine`, command as compose | `user-redis:6379` | — | `/data/redis` → `/data` |
  | kafka | `apache/kafka:4.1.0`, env as compose minus EXTERNAL listener, `hostname = "kafka"`, `KAFKA_LOG_RETENTION_HOURS=168`, `KAFKA_LOG_RETENTION_BYTES=268435456` (Claude's call) | `kafka:9092` | — | `/data/kafka` → `/var/lib/kafka/data` |
  | user-service, supplier-service, credit-service, order-service | ECR `<name>:<image_tag>` | `<name>:<port>` (3001, 3002, 3004, 3005) | — | — |
  | api-gateway | ECR | `api-gateway:3003` | `80` → `edge_container_port` | — |
  | frontend | ECR | `frontend:3000` | — | — |
  | mailpit (staging only) | `axllent/mailpit:v1.31.2` | `mailpit:1025` | — | — |

  Environment values are copied from each compose file; values that embed a secret come from SSM: `POSTGRES_PASSWORD`, `SUPPLIER_POSTGRES_PASSWORD`, `CREDIT_POSTGRES_PASSWORD`, `ORDER_DB_PASSWORD`, `USER_DATABASE_URL`, `SUPPLIER_DATABASE_URL`, `PGPASSWORD` (credit, from `CREDIT_POSTGRES_PASSWORD`), `USER_AES_KEY`, `USER_EMAIL_HMAC_KEY`, `USER_OTP_HMAC_KEY`, `USER_JWT_PRIVATE_KEY`, `USER_JWT_KID`, `CREDIT_SERVICE_KEY`, `ORDER_SERVICE_KEY` (also as `ORDER_CREDIT_SERVICE_KEY`/`USER_ORDER_SERVICE_KEY` per compose), `USER_SMTP_USER`, `USER_SMTP_PASS`, `USER_SMTP_FROM`, `USER_BOOTSTRAP_ADMIN_EMAIL`.
  Email: production user-service `USER_SMTP_HOST=smtp.gmail.com`, `USER_SMTP_PORT=587`; staging `USER_SMTP_HOST=mailpit`, `USER_SMTP_PORT=1025`, and mailpit gets `MP_SMTP_RELAY_HOST=smtp.gmail.com`, `MP_SMTP_RELAY_PORT=587`, `MP_SMTP_RELAY_STARTTLS=true`, `MP_SMTP_RELAY_AUTH=login`, `MP_SMTP_RELAY_USERNAME`/`MP_SMTP_RELAY_PASSWORD` from the same SSM values, `MP_SMTP_RELAY_ALL=true` (verify these names against Mailpit v1.31 docs before coding).

- [ ] **Step 1: Failing test** (mock provider, plan, `mailpit_relay = true` and a second `run` with `false`):
  - every task definition `network_mode == "bridge"`, `requires_compatibilities == ["EC2"]`
  - only api-gateway's container definition has a `portMappings` entry with `hostPort` set, and it is `80`
  - no container definition's `environment` contains a name from the secrets list (they appear only under `secrets`, `valueFrom` starting with the SSM ARN prefix `…:parameter/foc/<env>/`)
  - kafka container `hostname == "kafka"`; its env has no `EXTERNAL` in `KAFKA_LISTENERS`
  - each stateful service mounts its row's host path; `placement_constraints` none needed (one server), but `deployment_minimum_healthy_percent == 0` and `deployment_maximum_percent == 100` for stateful services so two copies never share a data folder
  - `deployment_circuit_breaker.enable == false` on all services; `desired_count == 1`
  - mailpit service exists iff `mailpit_relay`; user-service `USER_SMTP_HOST` is `mailpit` / `smtp.gmail.com` accordingly
  - task execution role may `ssm:GetParameters` only on `arn:aws:ssm:ap-southeast-1:<acct>:parameter/foc/<env>/*`
  - one log group per service, `/foc/<env>/<service>`, `retention_in_days == 14`
- [ ] **Step 2: Run** `terraform -chdir=infra/terraform/modules/services test` — Expected: FAIL.
- [ ] **Step 3: Implement** with `aws_service_discovery_http_namespace` (`foc-<env>`), one `aws_ecs_task_definition` + `aws_ecs_service` per row (`for_each` over a local map built from the table), `service_connect_configuration { enabled = true, namespace = …, service { port_name, client_alias { dns_name, port } } }` for each server-side service and client-only Service Connect for the rest. Memory reservations (Claude's call): postgres 192 MiB each, redis 64, kafka 768 (`KAFKA_HEAP_OPTS=-Xms256m -Xmx512m`), node services 192 each, frontend 384, envoy 96, mailpit 48; hard limits at 2×. One-off task definitions (no service): `kafka-init` from ECR image built by `infra/kafka/Dockerfile.init` (`FROM apache/kafka:4.1.0`, copies `topics.txt` and `create-topics.sh`, same entrypoint as compose), `order-migrate` from the order-service image with `command = ["node","dist/db/migrate-cli.js"]`.
- [ ] **Step 4: Run test** — Expected: PASS. `docker build -f infra/kafka/Dockerfile.init infra/kafka` — Expected: builds.
- [ ] **Step 5: Commit** `feat(infra): ECS services for every container with Service Connect`.

### Task 6: Edge module: CloudFront (#111)

**Files:** `infra/terraform/modules/edge/*`, test `tests/edge.tftest.hcl`.

**Interfaces:** Inputs `env`, `origin_domain` (the server module's `public_dns`). Outputs `url` (`https://<domain_name>`), `distribution_id`.

- [ ] **Step 1: Failing test** (mock provider, plan):
  - origin `custom_origin_config`: `origin_protocol_policy == "http-only"`, `http_port == 80`
  - default behaviour: `viewer_protocol_policy == "redirect-to-https"`, all 7 methods allowed, `cache_policy_id == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"` (Managed-CachingDisabled), `origin_request_policy_id == "33f36d7e-f396-46d9-90e0-52428a34d9dc"` (Managed-AllViewerAndCloudFrontHeaders-2022-06, so `CloudFront-Forwarded-Proto` reaches Envoy)
  - `viewer_certificate.cloudfront_default_certificate == true`; `price_class == "PriceClass_200"` (includes Singapore) (Claude's call)
- [ ] **Step 2: Run** `terraform -chdir=infra/terraform/modules/edge test` — Expected: FAIL.
- [ ] **Step 3: Implement** `aws_cloudfront_distribution` with the values above, no aliases, `restrictions { geo_restriction { restriction_type = "none" } }`.
- [ ] **Step 4: Run test** — Expected: PASS; both env dirs `validate` → `Success!`.
- [ ] **Step 5: Commit** `feat(infra): CloudFront distribution in front of Envoy`.

### Task 7: Secrets and first images (scripts)

**Files:** `infra/scripts/put-secrets.sh`, `infra/scripts/push-images.sh`, `infra/secrets/README.md` (folder git-ignored except this file — add `!infra/secrets/README.md`).

**Interfaces:**
- `put-secrets.sh <staging|production>`: reads `infra/secrets/<env>.env` (same `NAME=value` format as `.env`), requires every name in Task 5's secrets list, builds `USER_DATABASE_URL` and `SUPPLIER_DATABASE_URL` from the passwords exactly as the compose files do, and runs `aws ssm put-parameter --type SecureString --overwrite --name /foc/<env>/<NAME>`. Never echoes a value; prints only names.
- `push-images.sh <tag>`: logs in to ECR, builds the 7 images with the same contexts as compose (supplier-service context is the repo root), tags `<repo>:<tag>`, pushes. Replaced by part 3's CI.

- [ ] **Step 1: Test** `put-secrets.sh` with a fake `aws` on `PATH` (a stub that records its arguments) and a sample file missing `USER_AES_KEY` — Expected: exit 1, message names `USER_AES_KEY`, stub never called. With a full file — Expected: one call per name, stub log contains no secret values in the script's stdout.
- [ ] **Step 2: Implement both scripts** (`set -euo pipefail`, `shellcheck` clean).
- [ ] **Step 3: Run the test again** — Expected: PASS.
- [ ] **Step 4: Commit** `feat(infra): scripts to load SSM secrets and push first images`.

### Task 8: Runbook, apply staging, verify (manual, by a human with AWS access)

**Files:** `infra/terraform/README.md`; update `README.md` (one line linking it) and the root `AGENTS.md` "Where to find things" table (row: "Deploying to AWS" → `infra/terraform/README.md`).

- [ ] **Step 1: Write the runbook**, in order: prerequisites (AWS CLI SSO login to the NUS account, Terraform ≥ 1.10, Docker); `global` apply with `monthly_budget_usd` and `budget_emails`; fill `infra/secrets/staging.env` and run `put-secrets.sh staging`; `push-images.sh <git sha>`; `envs/staging` `init -backend-config="bucket=<state_bucket>"` and `apply -var-file=staging.tfvars -var image_tag=<sha>`; run the one-off tasks (`aws ecs run-task --cluster foc-staging --task-definition foc-staging-kafka-init`, then `order-migrate`); how to open a shell (`aws ssm start-session`); how to tear down (volume survives; `terraform state rm` note).
- [ ] **Step 2: Apply `global` and `envs/staging`** following the runbook.
- [ ] **Step 3: Verify**, each with its expected result:
  - `aws ecs describe-services --cluster foc-staging --services $(…)` — every service `runningCount == 1`
  - `curl -s https://<staging url>/.well-known/jwks.json` — JSON with a `keys` array (Envoy → User Service through CloudFront; works before part 1)
  - `curl -m 5 http://<elastic ip>/` — times out (Review Focus 3)
  - in an SSM session: `df -h /data` shows the volume; `ls -ln /data` shows `kafka` owned by 1000
  - stop the instance's ASG instance (`aws autoscaling terminate-instance-in-auto-scaling-group … --no-should-decrement-desired-capacity`), wait for the new one — data still present (create a user before, log in after) (Review Focus 1)
- [ ] **Step 4: Production:** `put-secrets.sh production`, apply `envs/production` with the same `image_tag`; repeat the first three checks.
- [ ] **Step 5: Commit** `docs(infra): deployment runbook` and record the verification in the PR.

---

## Not in this plan (other parts)

- Envoy `/gateway` prefix, port-80 edge listener and `X-Forwarded-Proto`; frontend proxy fixes (part 1, #141). Until then, set `edge_container_port = 3003` and only API paths work; the website shows "Browser not supported".
- CI image builds, deploy workflows, `terraform plan` in CI, newman staging checks (part 3, #143).
- EBS snapshots and `pg_dump` to S3 (part 4, #144).
