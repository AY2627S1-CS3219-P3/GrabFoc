<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-25
Scope: Generated from the deployment plan (docs/superpowers/plans/2026-10-23-aws-infrastructure.md, Task 8).
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

**Checks without AWS:** `infra/terraform/check.sh` (format, validate, tests with a mocked AWS) and
`infra/scripts/test/put-secrets.test.sh`. CI runs both on pull requests.

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

Fill `infra/secrets/staging.env` (names in `infra/secrets/README.md`), then:

```bash
infra/scripts/put-secrets.sh staging
```

## 3. Images

Until the CI deploy workflow exists (deploy part 3, #143):

```bash
infra/scripts/push-images.sh "$(git rev-parse --short HEAD)"
```

## 4. The environment

```bash
cd infra/terraform/envs/staging
terraform init -backend-config="bucket=<state_bucket>"
terraform apply -var-file=staging.tfvars -var image_tag=<the tag you pushed>
terraform output url                    # https://d….cloudfront.net
```

The first apply starts the server; give it a few minutes to join the cluster. Nothing else to run:
the one-shot `kafka-init` (topics) and `order-migrate` (Order's tables) run inside the Credit and
Order service tasks, which start only after they succeed. Services that start before their database
or Kafka is ready fail their health check or exit, and ECS restarts them until they come up.

## 5. Check it

| Check | Expected |
|---|---|
| `aws ecs describe-services --cluster foc-staging --services $(aws ecs list-services --cluster foc-staging --query 'serviceArns[]' --output text)` | every service `runningCount: 1` |
| `curl -s "$(terraform output -raw url)/.well-known/jwks.json"` | JSON with a `keys` array (works before deploy part 1) |
| `curl -m 5 http://<the server's public IP>/` | times out: only CloudFront may reach the server |
| In a shell on the server: `df -h /data; ls -ln /data` | the volume is mounted; `kafka` is owned by uid 1000 |

Until deploy part 1 (#141) adds Envoy's edge listener and the `/gateway` prefix, only API paths work
through CloudFront and the website answers "Browser not supported". Then set
`edge_container_port = 80` in `<env>.tfvars`.

## Day to day

- **Shell on the server** (no SSH): `aws ssm start-session --target <instance id>` (find it in the
  EC2 console or `aws ec2 describe-instances --filters Name=tag:Name,Values=foc-staging`).
- **Logs:** CloudWatch Logs, `/foc/<env>/<service>`, kept 14 days.
- **Replacing the server** is safe: the new one re-attaches the same `/data` volume and Elastic IP.
  `aws autoscaling start-instance-refresh --auto-scaling-group-name foc-staging`.
- **Tearing an environment down:** `terraform destroy` stops at the data volume
  (`prevent_destroy`), on purpose. To delete the data too, remove that line deliberately first, or
  `terraform state rm module.server.aws_ebs_volume.data` to keep the volume and destroy the rest.

## Production

Same steps with `production` in place of `staging`, its own `production.env`, and the **same image
tag** staging was tested with.
