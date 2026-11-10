<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 8).
Author review (Jian Bing, 2026-11-06): Went through it with Claude Code's walkthrough and understood it; ran
  infra/terraform/check.sh (every stack valid, all tests passed) and checked staging (the locations list and the
  admin locations page load).
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-27
Scope: Checks through /gateway; the first-apply gateway redeploy (deploy part 1, #141).
Author review (Jian Bing, 2026-11-07): Looked through the code and think it's okay.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-07
Scope: The first-apply restart also covers the four app services, which call each other (Codex review on #146).
Author review: Pending Jian Bing's review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
Scope: The Delivery section; images, tags and the Mailpit allowlist (deploy part 3, #143).
Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Merging main into #191: the first-apply restart also covers notification-service, the fifth app service.
Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: The first-apply restart also covers logging-service, the sixth app service (issue #52).
Author review: pending - Jian Bing owns the deployment.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: A new image means re-applying global before any env plan can succeed - the CI plan on the
  pull request that added one fails on the missing repository, which is the correct answer and not
  a broken change.
Author review: pending - Jian Bing owns the deployment.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Replacing the server: the downtime, the refresh preferences, and why ECS managed draining is off.
Author review (Jian Bing, 2026-11-09): Looked through the code and think it's okay; watched the staging dry run pass (deploy, checks, and the fixes it needed).
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-11
Scope: Applies and deploys take turns (the shared state lock).
Author review: Pending Jian Bing's review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Chat on AWS: chat-migrate, chat-service in the first-apply restart, and adding a service to a running environment.
Author review: Pending Jian Bing's review.
-->

# AWS deployment runbook

Terraform for the staging and production environments in the NUS-managed AWS account (design:
`docs/superpowers/specs/2026-10-23-aws-deployment-design.md`). Local development is unaffected.

```
infra/terraform/
├── global/            once per account: state bucket, GitHub OIDC roles, ECR repositories, budget
├── modules/           network · server (ECS on EC2 + /data volume) · services (every container) · edge (CloudFront)
└── envs/staging/      one environment = network + server + services + edge
    envs/production/
```

**Checks without AWS:** `infra/terraform/check.sh` (format, validate, tests with a mocked AWS),
`infra/scripts/test/*.test.sh` and `node --test infra/checks/test/select.test.mjs`. CI runs all of them
on pull requests, then `terraform plan` against staging.

## Prerequisites

- AWS CLI v2, logged in to the NUS account (`aws sso login` or your usual profile; check with
  `aws sts get-caller-identity`). Region `ap-southeast-1`.
- Terraform ≥ 1.10 (CI uses 1.15) and Docker (running).

## 1. Account-wide stack (once, and again whenever a service is added)

```bash
cd infra/terraform/global
terraform init
terraform apply -var monthly_budget_usd=50 -var 'budget_emails=["you@u.nus.edu"]'
terraform output state_bucket          # needed below
```

**Re-apply it whenever a service is added.** `global` owns the ECR repositories, and each
environment reads them with `data "aws_ecr_repository" "image"` - a data source, so a repository
that does not exist yet is an error, not something a plan creates. Until someone applies `global`,
the pull request that added the service fails CI's staging plan with:

```
Error: reading ECR Repository (foc/<name>): couldn't find resource
  with data.aws_ecr_repository.image["<name>"]
```

That is the right answer rather than a fault in the change: the repository has to exist before an
environment can point a task definition at it. The order for a new service is **apply `global`**,
then `push-images.sh <tag>`, then `put-secrets.sh <env>`, then the environment's apply.

`global` keeps its state locally (`terraform.tfstate`, git-ignored): it creates the bucket the other
stacks use. Keep that file safe, or import the resources again if it's lost.

## 2. Secrets for an environment

Create `infra/secrets/staging.env` with `infra/scripts/new-secrets.sh staging`, fill in its four
Gmail/admin lines (see `infra/secrets/README.md`), then:

```bash
infra/scripts/put-secrets.sh staging
```

## 3. Images

The deploy workflow does this on every merge to `main`. For a new environment, or by hand:

```bash
infra/scripts/push-images.sh "$(git rev-parse --short=7 HEAD)"
```

## 4. The environment

```bash
cd infra/terraform/envs/staging
terraform init -backend-config="bucket=<state_bucket>"
# alert_emails: disk alarms (confirm the email AWS sends). mailpit_relay_to: staging only, see Delivery.
terraform apply -var-file=staging.tfvars -var image_tag=<the tag you pushed> \
  -var 'alert_emails=["you@u.nus.edu"]' -var 'mailpit_relay_to=["you@u.nus.edu"]'
terraform output url                    # https://d….cloudfront.net
```

Record the tag, so the deploy workflow and later applies start from it:

```bash
aws ssm put-parameter --name /foc-deploy/staging/image-tag --type String --value <the tag you pushed>
```

After that, leave `-var image_tag` out: a manual apply keeps the tag the workflow last deployed.

The first apply starts the server; give it a few minutes to join the cluster. Nothing else to run:
the one-shot `kafka-init` (topics), `order-migrate` (Order's tables) and `chat-migrate` (chat's
tables) run inside the service tasks that need them (Credit, Order, Notification, chat), which start
only after they succeed. Services that start before their database
or Kafka is ready fail their health check or exit, and ECS restarts them until they come up.

**Only on an environment's very first apply:** a Service Connect client only learns the names that
existed when it started. The six app services start together and call each other (for example
user-service and order-service each call the other, and notification-service calls user-service),
and the gateway is created before the frontend, so some of these calls fail until the caller
restarts. Once every service is running, restart them once:

```bash
for service in user-service supplier-service credit-service order-service notification-service chat-service logging-service api-gateway; do
  aws ecs update-service --cluster foc-<env> --service "$service" --force-new-deployment
done
```

Later applies and deploys don't need this: the services and their names already exist, and every
deploy restarts all services anyway.

### Adding a service to a running environment

<!-- AI-generated (Claude Code, 2026-11-09): written for chat (#230), which reached AWS after staging existed. -->
A new service needs these steps **before** the pull request that adds it merges. The deploy workflow
stops if a service it deploys doesn't exist in ECS yet, and the environment looks its image
repository up by name.

1. Add its secrets: `infra/scripts/new-secrets.sh <env> --add-missing`, then
   `infra/scripts/put-secrets.sh <env>`.
2. Apply `global` from the branch, to create its image repository.
3. Push the branch's images under a new tag (repositories are immutable, so an existing tag can't be
   pushed again): `infra/scripts/push-images.sh "$(git rev-parse --short=7 HEAD)"`.
4. Apply the environment from the branch with that tag: `-var image_tag=<the tag>`.
5. Restart the services that call it, so Service Connect gives them its name. For chat, that's
   only the gateway, whose task definition doesn't otherwise change:
   `aws ecs update-service --cluster foc-<env> --service api-gateway --force-new-deployment`.
6. Merge. The deploy workflow then deploys the merge commit to every service, the new one included.

A new database folder under `/data` needs no manual step: ECS creates a missing host folder, and
`user_data.sh.tftpl` creates it on a new server.

### Applies and deploys take turns

<!-- AI-generated (Claude Code, 2026-11-11): after a deploy and an apply changed production at once. -->
A deploy (`deploy-images.sh`, so both deploy workflows) holds the environment's Terraform state
lock, the same `<env>/terraform.tfstate.tflock` file `terraform apply` takes. So the two can't
change one environment at once:

- **An apply during a deploy** fails with "Error acquiring the state lock", and its Lock Info
  names the deploy (`Who: GitHub run …`). Add `-lock-timeout=20m` to wait for it instead.
- **A deploy during an apply** waits up to 15 minutes, then stops without changing anything.
- **A lock left by a crashed run** is taken over after 3 hours. To clear it sooner, run
  `terraform force-unlock <ID>` in `envs/<env>` (the ID is in the error).
- A change that skips the lock (the ECS console, say) and moves a service mid-deploy makes the
  deploy stop at once with "<service> was moved to <revision> by another change". Run it again.

## 5. Check it

| Check | Expected |
|---|---|
| `aws ecs describe-services --cluster foc-staging --services $(aws ecs list-services --cluster foc-staging --query 'serviceArns[]' --output text)` | every service `runningCount: 1` |
| `curl -s "$(terraform output -raw url)/gateway/.well-known/jwks.json"` | JSON with a `keys` array |
| `curl -s -o /dev/null -w '%{http_code}' "$(terraform output -raw url)/gateway/locations"` | `401` (no token) |
| The URL in a browser | the sign-in page |
| `curl -m 5 http://<the server's public IP>/` | times out: only CloudFront may reach the server |
| In a shell on the server: `df -h /data; ls -ln /data` | the volume is mounted; `kafka` is owned by uid 1000 |

CloudFront reaches Envoy's edge listener (container port 8080, `edge_container_port`): `/gateway/*`
goes to the API, everything else to the website, and only with CloudFront's `X-Origin-Key`.

## Day to day

- **Shell on the server** (no SSH): `aws ssm start-session --target <instance id>` (find it in the
  EC2 console or `aws ec2 describe-instances --filters Name=tag:Name,Values=foc-staging`).
- **Logs:** CloudWatch Logs, `/foc/<env>/<service>`, kept 14 days. Those are the containers' own
  stdout. The services also ship their structured lines to the Centralized Logging store, which an
  admin queries with `GET /logs` through the gateway (issue #52); it keeps them for
  `LOGGING_RETENTION_DAYS` (30).
- **Replacing the server** is safe, but the environment is down while it happens (about 10 to 20
  minutes; there is only one server). The old server stops first, then the new one re-attaches the
  same `/data` volume and Elastic IP and every service starts again:
  `aws autoscaling start-instance-refresh --auto-scaling-group-name foc-<env> --preferences '{"MinHealthyPercentage":0}'`.
  This is also how a new `instance_type` takes effect. ECS managed draining is off on purpose: it
  would wait for the old server's tasks to move, which they can't until the new server has the volume.
- **Tearing an environment down:** `terraform destroy` stops at the data volume
  (`prevent_destroy`), on purpose. To delete the data too, remove that line deliberately first, or
  `terraform state rm module.server.aws_ebs_volume.data` to keep the volume and destroy the rest.

## Delivery

| Workflow | When | What it does |
|---|---|---|
| `terraform.yml` | Pull requests that touch `infra/` | Tests, then `terraform plan` against staging |
| `deploy-staging.yml` | Every merge to `main` | Builds the images once (tag: the first 7 characters of the commit), rolls them onto staging, runs the checks |
| `deploy-production.yml` | Started by hand from `main`, after approval | Rolls the tag staging last passed onto production |

- **The tag** an environment runs is in `/foc-deploy/<env>/image-tag`, written once every layer is
  stable. A deploy that fails halfway leaves it on the last good tag, though some services may already
  run the new one: fix forward, or deploy the old tag again.
- **The checks** are `infra/checks/`: the safe folders of the gateway Postman collection, as a one-off
  ECS task (`foc-staging-checks`). They create throw-away users, and never use the admin account or
  reset a password. Their output is in the workflow log and in `/foc/staging/checks`. A pass writes
  `/foc-deploy/staging/passed-tag`.
- **A deploy is not seamless, by design.** Every service except the frontend stops before its
  replacement starts, so each is unreachable for a few seconds during its own step and the gateway
  answers 503. Rolling them instead would put a second copy of every app service on the server at
  once, which does not fit on a `t3.large` - and it would buy nothing, because `api-gateway` stops
  too, so every deploy already has a gap at the one public entry point. If that gap ever matters,
  roll the app layer one service at a time in `deploy-images.sh`: the peak stays low and no service
  doubles.
- **The server is nearly full.** With chat and logging deployed, the rollout peak is **6,992 MiB of
  the 7,000** the module's test allows, and the steady state is 5,328. The next service added, or
  any increase to an existing reservation, needs a larger instance - `instance_type` in the
  environment's variables - or a smaller footprint somewhere else. The test will say so rather than
  letting a task fail to place on the server.
- **Rollback past a service's first deploy:** the preflight refuses a tag whose images are not all
  in ECR, and a service added after that tag has none. Run `infra/scripts/push-images.sh <tag>`
  once first: it skips every image already there and pushes only the missing one, built from the
  current checkout - which for a service that did not exist at that tag is the only build there is.
- **Rollback:** start `deploy-production.yml` with an older `tag`. To roll back staging, run
  `infra/scripts/deploy-images.sh staging <tag>` with your own login.
- **Staging email:** Mailpit keeps every message and forwards only the addresses in
  `mailpit_relay_to`, so the checks' random addresses never get real mail. To see the rest, open a
  Session Manager port forward to the server's port 8025.
- **Infrastructure changes** stay manual: the workflows only change image tags. A new setting or
  secret needs `put-secrets.sh` and `terraform apply` **before** the code that reads it reaches `main`.
- **GitHub set-up (once):** a `production` environment with required reviewers, limited to `main`, and
  the repository secrets `TF_VAR_alert_emails` and `TF_VAR_mailpit_relay_to` as JSON lists. They're
  secrets, not tfvars or variables, because the repository and its Actions logs are public.
- **Staging sign-ups by teammates** get their OTP email only if their address is in `mailpit_relay_to`.

## Production

Same steps with `production` in place of `staging`, its own `production.env`, and the **same image
tag** staging was tested with. After that, `deploy-production.yml` does it.
