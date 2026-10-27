# Deploy Part 3: Delivery (CD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every merge to `main` builds the images once, rolls them onto staging, and runs the Postman checks
inside AWS. Production deploys the tag staging passed, by a manual workflow that needs approval. Pull requests
that touch `infra/` get a `terraform plan`.

**Architecture:** GitHub Actions assumes the existing OIDC roles. The deploy workflow pushes images to ECR
(`push-images.sh`). A new script copies each service's ECS task definition with the new tag and updates the
services layer by layer, then records the tag in Parameter Store, so a later manual `terraform apply` keeps it.
A one-off ECS task (`foc-staging-checks`) runs newman against the CloudFront URL and reads OTP codes from
Mailpit on the server's host port 8025.

**Tech Stack:** GitHub Actions, AWS CLI v2 + jq, Terraform (`terraform test` with a mocked provider), Bash
script tests with a fake `aws`, newman, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-10-23-aws-deployment-design.md` §5, §6, §7, §8. Issues #143 (#107, #108,
#109, #114).

**Branch:** `feat/cd-pipeline` from `feat/edge-routing` (needs the `/gateway` prefix). Worktree:
`/Users/user/github repos/GrabFoc-cd`. PR base: `feat/edge-routing`.

## Decisions (Jian Bing, 2026-10-27)

- **Rolling images:** the workflow registers new task definition revisions and updates the services; Terraform
  stays with humans. The deployed tag is recorded at `/foc-deploy/<env>/image-tag`, and the environment stacks
  read it when no `image_tag` is passed.
- **newman reaches Mailpit** through host port 8025 on the staging server (Docker bridge address `172.17.0.1`).
  The security group already blocks the port from outside.
- **Checks on staging:** the gateway smoke checks, plus flows that only create their own throw-away users. Never
  the bootstrap admin or password reset.
- **Plan role:** may read the CloudFront origin key parameter (it already sees the value in the state file and
  CloudFront's config). Every other `/foc/` secret stays denied.
- **Claude's call, flagged for review:** staging Mailpit forwards to Gmail only recipients on an allowlist
  (`mailpit_relay_to`); everything else stays in Mailpit. The checks sign up random `…@u.nus.edu` addresses,
  which must never receive real email.

## Global Constraints

- Region `ap-southeast-1`; account `690084476135`; roles `foc-github-plan`, `foc-github-deploy-staging`,
  `foc-github-deploy-production` (trust: `repo:AY2627S1-CS3219-P3@326464642/GrabFoc@1361285513:…`).
- Image tag = the 7-character commit SHA (`git rev-parse --short HEAD`), as `push-images.sh` uses; ECR tags are
  immutable.
- Production never rebuilds: it deploys the tag in `/foc-deploy/staging/passed-tag`.
- Nothing secret in GitHub or in git. The repository is **public**: email addresses go in GitHub repository
  variables (`TF_VAR_alert_emails`, `TF_VAR_mailpit_relay_to`), not in tfvars.
- Scripts run on macOS bash 3.2 and on Ubuntu; tests use a fake `aws` on `PATH` (pattern:
  `infra/scripts/test/put-secrets.test.sh`).
- Every new or changed file gets an AI Assistance Disclosure header; usage log entry in
  `ai/usage-log/jian-bing.md`.
- Live AWS and GitHub settings changes (global apply, staging apply, GitHub environment and variables) stop for
  Jian Bing's OK.

## Review Focus

1. **A deploy that fails halfway** (one layer never stabilises): the recorded image tag must not move, and the
   workflow must fail. Pinned in Task 3's test "failed wait leaves the tag".
2. **Non-FoC images in a task definition** (the Service Connect agent, Mailpit, databases): only images from
   the `foc/` ECR repositories change. Pinned in Task 3's test "only foc images change".
3. **The checks task fails or never starts** (no capacity, image pull error): `run-checks.sh` must exit non-zero
   and must not write `passed-tag`. Pinned in Task 4's tests.
4. **Collection drift:** someone adds an admin or password-reset request to a selected folder; the selection must
   still exclude it. Pinned in Task 2's test "no admin credentials or password reset".
5. **A manual `terraform apply` after a CD deploy** must not roll back to an old tag. Pinned in Task 1's
   `image_tag_from_parameter` run.

---

### Task 1: Terraform: tag parameter, Mailpit port and allowlist, checks task, IAM

**Files:**
- Modify: `infra/terraform/global/main.tf` (ECR `checks` repo; plan-role statements; deploy-role SSM access),
  `infra/terraform/global/tests/global.tftest.hcl`
- Modify: `infra/terraform/envs/{staging,production}/{main.tf,variables.tf}` (optional `image_tag`; data source)
- Modify: `infra/terraform/modules/services/{main.tf,variables.tf}`, `modules/services/tests/services.tftest.hcl`
- Modify: `infra/terraform/README.md`

**Interfaces:**
- Produces: SSM names `/foc-deploy/<env>/image-tag` and `/foc-deploy/<env>/passed-tag` (type `String`);
  ECR repo `foc/checks`; task definition family `foc-<env>-checks` (staging only) with one container `checks`,
  env `BASE_URL` (`https://<cloudfront domain>/gateway`) and `MAILPIT_URL` (`http://172.17.0.1:8025`), log group
  `/foc/<env>/checks`; services-module variables `mailpit_relay_to` (list(string)) and `checks_base_url` (string).

- [ ] **Step 1: Write the failing tests**
  - `global.tftest.hcl`, run `global`:
    - `aws_ecr_repository.service["checks"]` exists.
    - The plan role's SSM deny no longer covers `arn:aws:ssm:*:<acct>:parameter/foc/*/CLOUDFRONT_ORIGIN_KEY`
      (assert the deny's `NotResource` contains it, and still contains `arn:aws:ssm:*::parameter/aws/service/*`
      and `arn:aws:ssm:*:<acct>:parameter/foc-deploy/*`).
    - The plan role has an Allow for `kms:Decrypt` conditioned on
      `kms:EncryptionContext:PARAMETER_ARN` = the origin key ARN pattern; no other Decrypt allow.
    - Each deploy role may `ssm:GetParameter`/`ssm:PutParameter` on `parameter/foc-deploy/<its env>/*`, and the
      production role may `ssm:GetParameter` on `parameter/foc-deploy/staging/passed-tag`.
  - `services.tftest.hcl`, run `staging`:
    - Mailpit's port mappings include `{containerPort = 8025, hostPort = 8025}`.
    - Mailpit env has `MP_SMTP_RELAY_MATCHING` = `^(a@x\.edu|b@y\.com)$` for
      `mailpit_relay_to = ["a@x.edu", "b@y.com"]`, and no `MP_SMTP_RELAY_ALL`.
    - Task definition `foc-staging-checks` exists with the `BASE_URL`/`MAILPIT_URL` values above and image
      `<foc/checks url>:<image_tag>`; no ECS service runs it.
  - `services.tftest.hcl`, run `production`: no Mailpit and no checks task definition.
  - Env stack (new run `image_tag_from_parameter` in a test under `envs/staging/tests/`, or the module test if
    the env stack has none): with `image_tag = null` and `override_data` for
    `data.aws_ssm_parameter.image_tag` returning `abc1234`, the services get `abc1234`; with `image_tag =
    "def5678"` the data source isn't read (`length(data.aws_ssm_parameter.image_tag) == 0`).

- [ ] **Step 2: Run, expect FAIL** — `infra/terraform/check.sh`; the new assertions fail.

- [ ] **Step 3: Implement.**
  - The plan role's SSM Deny becomes `NotResource`: AWS public params, `/foc-deploy/*` and the origin key ARNs.
    Split `kms:Decrypt` out of the existing Deny, deny it with `StringNotLike` on
    `kms:EncryptionContext:PARAMETER_ARN`, and allow it for that ARN only.
  - `mailpit_relay_to` has no default (staging only; production passes `[]`). Build the regex by escaping `.`
    and joining with `|`. Empty list → no `MP_SMTP_RELAY_MATCHING` (nothing relayed).
  - Before wiring it in, confirm the variable in Mailpit v1.31.2:
    `docker run --rm axllent/mailpit:v1.31.2 --help | grep -i relay-matching`. If it's absent, stop and ledger.
  - README: the first-time seed `aws ssm put-parameter --name /foc-deploy/staging/image-tag --type String
    --value <tag>`, and that `-var image_tag=` is now optional.

- [ ] **Step 4: Run, expect PASS** — `infra/terraform/check.sh` → every stack valid, all tests pass.

- [ ] **Step 5: Commit** — `feat(infra): deploy tag parameter, Mailpit allowlist and port, checks task, CD IAM`

### Task 2: The checks image (selected Postman requests + newman)

**Files:**
- Create: `infra/checks/Dockerfile`, `infra/checks/select.mjs`, `infra/checks/run.sh`,
  `infra/checks/test/select.test.mjs`
- Modify: `infra/scripts/push-images.sh` (add `checks|.|infra/checks/Dockerfile`),
  `infra/scripts/test/push-images.test.sh` (now 6 pushes)

**Interfaces:**
- Produces: image `foc/checks:<tag>`; its entrypoint runs newman against `$BASE_URL` and `$MAILPIT_URL` and
  exits with newman's status.

- [ ] **Step 1: Write the failing test** `select.test.mjs`, reading
  `api-gateway/postman/gateway.postman_collection.json`:
  - "keeps the chosen folders in collection order": `Gateway smoke checks`, `User Service/Public`,
    `User Service/Sign-up`, `User Service/Session`, `User Service/Errors`, `Supplier Service/Read`,
    `Supplier Service/Errors`.
  - "no admin credentials or password reset": no kept request's JSON contains `adminPassword`, `adminEmail`,
    `/admin/` or `password/reset`.
  - "an unknown folder path throws": selecting `User Service/Nope` throws naming it, so a renamed folder fails
    the image build instead of silently running fewer checks.
- [ ] **Step 2: Run, expect FAIL** — `node --test infra/checks/test/select.test.mjs` (module missing).
- [ ] **Step 3: Implement** `select(collection, paths: string[]) => collection` and a CLI
  (`node select.mjs <in> <out>`) with the folder list above. The Dockerfile: `FROM postman/newman:6.2.1-alpine`
  (check the tag exists), copy the collection, run `select.mjs` at build time, `ENTRYPOINT ["/checks/run.sh"]`.
  `run.sh` runs `newman run` with `--env-var baseUrl=$BASE_URL --env-var mailpitUrl=$MAILPIT_URL`, and fails
  if either variable is empty.
- [ ] **Step 4: Run, expect PASS** — the select tests; `push-images.test.sh`; then build the image locally and
  run it against the local stack:
  `docker run --rm --network foc_default -e BASE_URL=http://api-gateway:3003/gateway -e MAILPIT_URL=http://mailpit:8025 foc-checks`.
  Expected: newman exits 0. Only if Jian Bing's local stack is up; it creates throw-away users only.
- [ ] **Step 5: Commit** — `feat(infra): checks image runs the safe Postman folders with newman`

### Task 3: `deploy-images.sh` — roll a tag onto an environment

**Files:**
- Create: `infra/scripts/deploy-images.sh`, `infra/scripts/test/deploy-images.test.sh`

**Interfaces:**
- Consumes: `/foc-deploy/<env>/image-tag` (Task 1); ECS services named after the services.
- Produces: `infra/scripts/deploy-images.sh staging|production <tag>`, exit 0 only when every layer is stable.

- [ ] **Step 1: Write the failing test** with a fake `aws` that serves canned `describe-services` and
  `describe-task-definition` JSON, records `register-task-definition` inputs and `update-service` calls, and
  fails `ecs wait services-stable` when `FAKE_WAIT_FAIL=<service>`:
  - "only foc images change": the registered `api-gateway` definition has `…/foc/api-gateway:new1234`, and its
    `ecs-service-connect-*`/`axllent/mailpit` images are unchanged.
  - "layers in order": update calls go user/supplier/credit/order, then api-gateway, then frontend, each
    layer's wait before the next layer's updates.
  - "read-only fields removed": registered JSON has no `taskDefinitionArn`, `revision`, `status`,
    `requiresAttributes`, `compatibilities`, `registeredAt`, `registeredBy`.
  - "tag recorded last": `put-parameter /foc-deploy/staging/image-tag new1234` is the final call.
  - "failed wait leaves the tag": with `FAKE_WAIT_FAIL=api-gateway`, the exit code is non-zero, frontend isn't
    updated, and no `put-parameter` call is made.
  - "rejects unknown env and missing tag".
- [ ] **Step 2: Run, expect FAIL** — `infra/scripts/test/deploy-images.test.sh`.
- [ ] **Step 3: Implement** with `aws ecs describe-services` → `describe-task-definition` → jq replace (`image`
  matching `/foc/<name>:` → same repo with the new tag) → `register-task-definition --cli-input-json
  file://…` → `update-service --task-definition <new arn>`; `--region ap-southeast-1` on every call; cluster
  `foc-<env>`.
- [ ] **Step 4: Run, expect PASS**; add the test to `terraform.yml`'s script step.
- [ ] **Step 5: Commit** — `feat(infra): deploy-images.sh rolls a tag onto an environment's services`

### Task 4: `run-checks.sh` — run the checks task and gate on it

**Files:**
- Create: `infra/scripts/run-checks.sh`, `infra/scripts/test/run-checks.test.sh`

**Interfaces:**
- Consumes: task definition family `foc-staging-checks`, log group `/foc/staging/checks` (Task 1).
- Produces: `infra/scripts/run-checks.sh staging <tag>`, which exits with the checks container's exit code and
  writes `/foc-deploy/staging/passed-tag` = `<tag>` only on 0.

- [ ] **Step 1: Write the failing test** (fake `aws`):
  - "pass writes passed-tag": exit code 0 → `put-parameter /foc-deploy/staging/passed-tag abc1234`.
  - "newman failure fails the run": container exit code 1 → script exits 1, no `put-parameter`.
  - "task that never starts fails": `run-task` returns a `failures` entry → non-zero, no `put-parameter`.
  - "logs are printed": the fake `aws logs tail` output appears in the script's output.
- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement** with `aws ecs run-task --cluster foc-staging --task-definition foc-staging-checks`
  (EC2 launch type), `aws ecs wait tasks-stopped`, `describe-tasks` for `containers[?name=='checks'].exitCode`,
  then `aws logs tail /foc/staging/checks --since 30m`.
- [ ] **Step 4: Run, expect PASS**; add it to `terraform.yml`'s script step.
- [ ] **Step 5: Commit** — `feat(infra): run-checks.sh runs newman on staging and records the passed tag`

### Task 5: Workflows

**Files:**
- Create: `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`
- Modify: `.github/workflows/terraform.yml` (a `plan` job)

- [ ] **Step 1: Write the workflows.**
  - `deploy-staging.yml`: on `push` to `main` and `workflow_dispatch`; `concurrency: deploy-staging` (no
    cancel); `permissions: id-token: write, contents: read`; `aws-actions/configure-aws-credentials@v4` with
    `role-to-assume: arn:aws:iam::690084476135:role/foc-github-deploy-staging`. Steps:
    1. `push-images.sh $(git rev-parse --short HEAD)`
    2. `deploy-images.sh staging <tag>`
    3. `run-checks.sh staging <tag>`
  - `deploy-production.yml`: `workflow_dispatch` with an optional `tag` input; job `if: github.ref ==
    'refs/heads/main'`; `environment: production`; role `foc-github-deploy-production`. The tag is the input,
    else `/foc-deploy/staging/passed-tag`. It fails if that tag isn't the staging-passed one, unless the input
    names an older tag for rollback (README). Runs `deploy-images.sh production <tag>`.
  - `terraform.yml` job `plan` (`needs: check`, skipped for fork PRs): role `foc-github-plan`; `terraform init
    -backend-config=bucket=foc-terraform-state-690084476135` in `envs/staging`; `terraform plan -input=false
    -var-file=staging.tfvars`. `TF_VAR_alert_emails` and `TF_VAR_mailpit_relay_to` come from repository
    variables.
- [ ] **Step 2: Lint** — `pipx run actionlint` (or `pip install actionlint-py`). Expected: no findings.
- [ ] **Step 3: Commit** — `feat(ci): staging deploy on merge, production by approval, terraform plan on PRs`

### Task 6: Live set-up and dry run (stops for Jian Bing's OK at each bullet)

- [ ] **Global apply** (`infra/terraform/global`): the OIDC subject fix from #146 and Task 1's IAM and ECR
  changes. Show the plan first.
- [ ] **GitHub settings:** environment `production` with Jian Bing as required reviewer, deployments limited to
  `main`; repository variables `TF_VAR_alert_emails`, `TF_VAR_mailpit_relay_to`.
- [ ] **Seed the tag and dry-run with Jian Bing's own credentials:** seed `/foc-deploy/staging/image-tag` =
  `fc2f431`, then:
  1. `push-images.sh <HEAD tag>` (pushes the new `checks` image too);
  2. staging `terraform apply` (Mailpit allowlist and port 8025, the checks task; tag read from the parameter);
  3. `deploy-images.sh staging <HEAD tag>`;
  4. `run-checks.sh staging <HEAD tag>`. Expected: newman passes, and `passed-tag` is set.
- [ ] **Confirm the allowlist** in the checks' logs and Mailpit: the throw-away `…@u.nus.edu` emails stay in
  Mailpit and no relay to them is attempted.
- [ ] The workflows themselves first run when this stack reaches `main` (the deploy role trusts only `main`). Say
  so in the PR.

### Task 7: Docs, usage log, PR

- [ ] `infra/terraform/README.md`: a "Delivery" section covering the workflow, rollback (production workflow
  with an older `tag`), seeding the tag, and where the checks' logs are.
- [ ] Usage log entry with the exact prompts. Final whole-branch review, then a PR into `feat/edge-routing`.
