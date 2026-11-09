<!--
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Handoff notes written from Jian Bing's session, so a teammate can continue the work.
Author review: Pending Jian Bing's review.
-->

# Handoff: AWS follow-ups and putting chat on AWS (2026-11-09)

Written at the end of Jian Bing's session. Everything below was checked against `main` at `114ad72`
(#191 merged) and the live staging account on 2026-11-09, around 07:20–08:00 UTC.

## 1. Where things stand

| Item | State | What's needed |
|---|---|---|
| **Staging** | https://d2vc4gojrvvtgk.cloudfront.net, running `114ad72` (deployed and passed by the first automatic deploy). | Nothing. |
| **Production** | **Doesn't exist yet.** No CloudFront distribution, no cluster. | Create it later (team decision). It needs its own secrets, including `CHAT_TICKET_SECRET`. |
| **#231** SoCLaaS output limits | Open. | A teammate's approval, then merge. |
| **#232** Pin outside GitHub Actions to commit hashes | Open. | A teammate's approval, then merge. |
| **#235** Kafka health check + CPU reservation | Open. | A teammate's approval, merge, then a staging apply (§3). |
| **Chat on AWS** | Started on branch `feat/chat-aws` (tests only, failing on purpose). | Finish it (§4). |
| **Supplier images** | Not started. | A decision by the Supplier owners (§5). |

**Merge conflicts to expect:** #231, #232, #235 and `feat/chat-aws` each add an entry at the top of
`ai/usage-log/jian-bing.md`. After one merges, the others conflict in that file only. To resolve:
keep **both** sides, with entries newest first in the body and the disclosure list in the `<!-- -->`
header oldest first. Then check that `grep -c '^### '` equals `grep -c '^\*\*Verification'`.

**Pending Author review lines:** every file #231, #232 and #235 touched has an
`Author review: Pending Jian Bing's review.` line. Jian Bing fills those in himself; don't write them
for him.

## 2. Access and tools

- **AWS account `690084476135`**, region `ap-southeast-1`.
  - Jian Bing uses the SSO profile `nusisb_IsbUsersPS-690084476135`: run `aws sso login --profile …`.
  - The `default` profile on his machine is a different account, so always run
    `aws sts get-caller-identity` first.
- **Terraform:**
  - Version `~1.15.0`.
  - State bucket: `foc-terraform-state-690084476135`.
  - Set `TF_PLUGIN_CACHE_DIR=$HOME/.terraform.d/plugin-cache` to avoid re-downloading providers.
- **Checks to run before any infra PR:**
  - `infra/terraform/check.sh` (fmt, validate and test every stack);
  - every `infra/scripts/test/*.test.sh`;
  - `node --test infra/checks/test/select.test.mjs`;
  - `actionlint`.
- **The staging apply needs two variables that aren't in the repo:** `TF_VAR_alert_emails` and
  `TF_VAR_mailpit_relay_to`. They hold teammates' emails, and the repo is public. They're GitHub
  secrets; ask Jian Bing for the values. **Never commit them.**
- **A full `terraform apply` after a CD deploy** points every app service back at Terraform's
  task-definition revisions (same image tag, so it's a restart, not a downgrade). Expect a few minutes of
  restarts.

## 3. Kafka restarts during deploys (#235)

**What happened** (run 42574854978, first automatic staging deploy):
1. Starting five services at once pushed the server's CPU to about 95%.
2. Kafka's health check (`kafka-broker-api-versions.sh`, a new JVM every 15 s with a 5 s limit) timed
   out, so ECS restarted Kafka twice.
3. Credit's and Order's first tasks failed in `kafka-init` ("Timed out waiting for a node assignment")
   and were retried about 5 minutes later.
4. The app layer missed its first 10-minute wait; the second round passed, and so did the deploy.

The same happened at 06:14 UTC during a manual apply. CPU credits aren't the cause: the server runs in
unlimited mode with about 850 credits left.

**The fix in #235** (Jian Bing chose it):
- Kafka's check: 15 s limit, every 30 s, 3-minute grace period.
- Kafka reserves 1024 CPU units.
- Nothing else changes.

**After merging:**
1. Apply staging (`infra/terraform/envs/staging`, `-var-file=staging.tfvars`, with the two `TF_VAR_*`
   set). This restarts Kafka once.
2. Watch the next automatic deploy. Its app layer should finish within its first 10-minute wait. If
   Kafka still restarts, the next option is a lighter health check (a port test, which can't tell
   whether the broker actually works).

## 4. Chat on AWS (the main unfinished task)

**Symptom:** `wss://…/gateway/socket.io/?EIO=4&transport=websocket` fails, and polling returns
`503 no healthy upstream` from Envoy. CloudFront and the gateway are fine (the gateway already has the
chat route and `CHAT_SERVICE_URL`). **There is no chat service on AWS.**

**Jie Yang's plan is the basis.** Jian Bing approved it on 2026-11-09, including its two
"Claude's call" items:
- chat-service reserves 192 MiB, like the other Node services;
- Order and Chat read the one SSM secret `CHAT_TICKET_SECRET`.

### Already done on `main` (from #191), so skip these
- The gateway's `CHAT_SERVICE_URL = "http://chat-service:3007"`.
- Order's `ORDER_CHAT_TICKET_SECRET` from SSM `CHAT_TICKET_SECRET`.
- `CHAT_TICKET_SECRET` in `new-secrets.sh` (fresh and `--add-missing`) and in `put-secrets.sh`.
- `CHAT_TICKET_SECRET` already in staging's SSM.

### Corrections to the plan
- **Notification is already on AWS.** Logging isn't.
- **Staging's server is a t3.xlarge (16 GiB),** not a t3.large. Production's default is a t3.large
  (8 GiB): check its total memory reservation before creating it.
- **`/data/chat-db` needs no manual `mkdir`.** ECS creates a missing host folder, and Postgres fixes
  the folder's owner on start. Still add it to `user_data.sh.tftpl` for new servers.
- **The ECR repositories are IMMUTABLE,** so you can't re-push an existing tag. Push images under a new
  tag, such as the PR's commit.
- **Order of steps matters** (see "Rollout"). The env stacks look repositories up by name, so the
  global apply comes first. `deploy-images.sh` stops if any service it deploys doesn't exist in ECS, so
  staging must have chat-service **before** the PR merges, or the automatic deploy fails.
- **Service Connect:** a client only learns names that existed when it deployed. The gateway's task
  definition doesn't change (its `CHAT_SERVICE_URL` is already set), so it won't redeploy on its own.
  **Force a new gateway deployment after chat-service exists.**

### What chat needs (from `chat-service/compose.yaml`)
- **`chat-db`:** `postgres:17-alpine`, database `chat`, user `foc`, password from
  `CHAT_POSTGRES_PASSWORD`.
- **`chat-migrate`:** one-off, `node dist/db/migrate-cli.js`, with
  `CHAT_DATABASE_URL=postgres://foc@chat-db:5432/chat` and `PGPASSWORD`. It needs no ticket secret.
- **`chat-service`:** port 3007, with `CHAT_PORT=3007`,
  `CHAT_DATABASE_URL=postgres://foc@chat-db:5432/chat`, `PGPASSWORD` and `CHAT_TICKET_SECRET`
  (32+ characters). It doesn't use Kafka.

### Done on branch `feat/chat-aws` (WIP commit, tests only, failing on purpose)
- `infra/terraform/global/tests/global.tftest.hcl` expects 10 repositories, including `chat-service`.
- `infra/terraform/modules/services/tests/services.tftest.hcl`:
  - `chat-service` added to the `ecr_repository_urls` fixture;
  - `chat-db` added to the folder list, the stop-first list and the data layer;
  - `chat-service` added to the app layer.

### Still to do (tests first for each)

**Terraform**
1. **More tests** in `services.tftest.hcl`, modelled on Notification's assertions (around line 250):
   - chat-service's secrets are exactly `{ PGPASSWORD = "CHAT_POSTGRES_PASSWORD", CHAT_TICKET_SECRET = "CHAT_TICKET_SECRET" }`;
   - its env has `CHAT_PORT = "3007"` and `CHAT_DATABASE_URL = "postgres://foc@chat-db:5432/chat"`;
   - its image is `foc/chat-service:abc1234`;
   - its only non-essential container is `chat-migrate`, and the app container depends on
     `chat-migrate:SUCCESS`.
2. **`infra/terraform/global/main.tf`:** add `"chat-service"` to `local.images`.
3. **`infra/terraform/envs/staging/main.tf` and `envs/production/main.tf`:** add `"chat-service"` to
   the `data "aws_ecr_repository" "image"` list.
4. **`infra/terraform/modules/services/main.tf`:**
   - `local.postgres`: add `"chat-db" = { db = "chat", password = "CHAT_POSTGRES_PASSWORD" }`.
   - `local.containers`: add `"chat-service"`. Copy notification-service's shape: `port = 3007`,
     `health = local.listening[3007]`, `memory = 192`, `env = local.chat_env`, and the secrets above.
   - New `local.chat_env` with the two values above.
   - `local.listening`: add `3007`.
   - `local.oneoffs`: add `"chat-migrate"` with `image = local.image["chat-service"]`, `memory = 128`,
     `command = ["node", "dist/db/migrate-cli.js"]`, `env = { CHAT_DATABASE_URL = … }` and
     `secrets = { PGPASSWORD = "CHAT_POSTGRES_PASSWORD" }`.
   - `local.init_containers`: add `"chat-service" = ["chat-migrate"]`.
   - `local.stops_before_replacing`: add `"chat-db"`.
   - `local.layer.data`: add `"chat-db"`. `local.layer.app`: add `"chat-service"`.
   - Update the gateway comment that says "The chat service isn't on AWS yet".
5. **`infra/terraform/modules/server/user_data.sh.tftpl`:** add `/data/chat-db` to the `mkdir -p` line,
   and update the server module's test if it checks that line.

**Scripts**

6. **`infra/scripts/push-images.sh`:** add `"chat-service|chat-service|chat-service/Dockerfile"`. Add
   a check to `test/push-images.test.sh` like the Notification one (line 44).
7. **`infra/scripts/deploy-images.sh`:** add `chat-service` to the app layer (line 36). Update
   `test/deploy-images.test.sh`: the `wait` line (93) and the repository list (106).
8. **`infra/scripts/new-secrets.sh`:** generate `CHAT_POSTGRES_PASSWORD`, both in a fresh file and in
   `--add-missing`. Add it to `put-secrets.sh`'s `required` list. Update both tests (put-secrets'
   parameter count goes up by one), and add a row to `infra/secrets/README.md`.

**Docs**

9. **`infra/terraform/README.md`:**
   - add `chat-service` to the first-apply restart loop;
   - add a short "Adding chat to an existing environment" note with the rollout below.
10. **AI policy:** add a disclosure entry to every file you change, an `AI-generated` comment on
    generated blocks, and an entry in **your own** `ai/usage-log/<you>.md`.

### Rollout to staging (before the PR merges)
1. Add the database password to SSM:
   `infra/scripts/new-secrets.sh staging --add-missing`, then `infra/scripts/put-secrets.sh staging`.
   The secrets file `infra/secrets/staging.env` is git-ignored and lives on Jian Bing's machine, so he
   may need to run this step.
2. **Global apply** from the PR branch, to create the `foc/chat-service` repository.
3. **Push the images** at the PR's head commit: `infra/scripts/push-images.sh <sha7>`.
4. **Staging apply** with that tag: `-var-file=staging.tfvars -var image_tag=<sha7>`, plus the two
   `TF_VAR_*`.
5. **Restart the gateway** so Envoy learns the `chat-service` name:
   `aws ecs update-service --cluster foc-staging --service api-gateway --force-new-deployment`
6. **Check it works:**
   - `curl -i "https://d2vc4gojrvvtgk.cloudfront.net/gateway/socket.io/?EIO=4&transport=polling"`
     no longer answers `503 no healthy upstream`;
   - two accounts on an ACCEPTED order can chat, and the history survives a page refresh;
   - CloudWatch `/foc/staging/chat-migrate` shows the migration finished;
   - creating and accepting an order still works.
7. **Merge the PR.** The automatic deploy then rolls everything, chat included.

## 5. Supplier images: slow to load (not started)

- **The cause is size, not mainly the host.** The six seed photos in `data/images/` are 2.7–5.1 MB
  each (23 MB in total).
- The seed CSV points at the **course template's** GitHub. `supplier-service/src/seed/seed.service.ts`
  rewrites those links to `raw.githubusercontent.com` and stores them in `image_url`. The database
  requires `^https?://`.
- **The options are a Supplier design decision** (AI policy: architecture and data). Cole Lin and
  Jian Bing should choose:
  - shrink the photos (about 100–300 KB each), which gives most of the gain;
  - then host them in an S3 bucket behind our CloudFront, or keep them on GitHub.

## 6. Smaller loose ends
- **Dependabot on main** failed a security update for `minimatch` (`security_update_not_possible`):
  another package pins it to an older version. It doesn't block anything; look into it separately.
- **GitHub had incidents on 2026-11-08 and 2026-11-09** (504s on release downloads). CI jobs failed in
  `npm ci` because the Kafka client's prebuilt binary couldn't download. If you see that, check
  githubstatus.com and re-run the job.
- **Ledger folder:** Jian Bing's local `.superpowers/sdd/2026-10-27-deploy-part3-delivery/` (deploy
  part 3) can be deleted now that #191 has merged. It's only on his machine.
