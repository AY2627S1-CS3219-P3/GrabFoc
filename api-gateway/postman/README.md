<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-13
Scope: Document importing and using the gateway Postman collection.
Author review: Pending human review.
-->

# Gateway Postman collection

In Postman, select **Import**, then choose
[`gateway.postman_collection.json`](gateway.postman_collection.json).
The imported collection contains gateway smoke checks and the existing User and
Supplier request examples, all using `http://localhost:3003`.

Start the Compose stack, open the collection's **Variables** tab, and keep
`baseUrl` set to `http://localhost:3003`. Send the requests in **Gateway smoke
checks** first. These require no account and do not change data. Missing or invalid
tokens should return Envoy's text `401` response.

To test authenticated requests, set collection variables for an existing account:

| Account | Variables | Request to send | Automatically saved token |
|---|---|---|---|
| USER | `signupEmail`, `password` | User Service / Session / Login | `accessToken`, `refreshToken` |
| ADMIN | `adminEmail`, `adminPassword` | User Service / Admin / Admin: login | `adminAccessToken` |

Supplier read requests use `accessToken`; Supplier admin requests use
`adminAccessToken`. They do not send development identity headers. Supplier create
and update scripts save `locationId` and `version` for subsequent requests. Log in
again or refresh when your token expires. Environment variables with the same
names override collection variables; remove stale overrides if login appears to
save a token but later requests still fail.

Send individual requests while learning the collection. Running every folder
changes data: User Profile changes credentials and deactivates a generated account;
Admin resets the bootstrap admin password and changes roles/account state;
Supplier Write creates, updates, deactivates and restores a location. Full User
workflows require Mailpit at `mailpitUrl` (default `http://localhost:8025`) to
retrieve OTPs. Use disposable local test accounts for those workflows.

Tokens initially have empty values. Do not share exports containing live tokens
or credentials. Gateway authentication responses follow the documented
[stock Envoy behaviour](../envoy/behaviour-differences.md); responses forwarded
from services retain their own JSON formats.
