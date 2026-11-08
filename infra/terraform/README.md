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
Author review: Pending Jian Bing's review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Merging main into #191: the first-apply restart also covers notification-service, the fifth app service.
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

## 1. Account-wide stack (once)

```bash
cd infra/terraform/global
terraform init
terraform apply -var monthly_budget_usd=50 -var 'budget_emails=["you@u.nus.edu"]'
terraform output state_bucket          # needed below
```

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
the one-shot `kafka-init` (topics) and `order-migrate` (Order's tables) run inside the Credit and
Order service tasks, which start only after they succeed. Services that start before their database
or Kafka is ready fail their health check or exit, and ECS restarts them until they come up.

**Only on an environment's very first apply:** a Service Connect client only learns the names that
existed when it started. The five app services start together and call each other (for example
user-service and order-service each call the other, and notification-service calls user-service),
and the gateway is created before the frontend, so some of these calls fail until the caller
restarts. Once every service is running, restart them once:

```bash
for service in user-service supplier-service credit-service order-service notification-service api-gateway; do
  aws ecs update-service --cluster foc-<env> --service "$service" --force-new-deployment
done
```

Later applies and deploys don't need this: the services and their names already exist, and every
deploy restarts all services anyway.

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
- **Logs:** CloudWatch Logs, `/foc/<env>/<service>`, kept 14 days.
- **Replacing the server** is safe: the new one re-attaches the same `/data` volume and Elastic IP.
  `aws autoscaling start-instance-refresh --auto-scaling-group-name foc-staging`.
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
