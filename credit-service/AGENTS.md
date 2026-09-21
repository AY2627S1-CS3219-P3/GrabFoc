# AGENTS.md — Credit Service

Service-specific context for `credit-service/`. Read the root [`AGENTS.md`](../AGENTS.md) first: it has the product, terminology, roles, the auth model, cross-cutting rules and the plan-first rule.

Status legend: **[Decided]** · **[Proposed]** · **[Open]** (defined in the root `AGENTS.md`).

- One account per user, created at registration with 10 available credits.
- Available and reserved balances are kept separately. The available balance may never go negative.
- **Reserve** on order creation (only if the available balance is enough).
- **Transfer** requester-reserved → courier-available on `COMPLETED`.
- **Release** reserved → requester-available on `CANCELLED`.
- **Invariant:** total credits in the system never change during a reserve, transfer or release.
- Every operation is atomic and idempotent: applying the same operation twice must not change balances twice. For example, a completion processed twice must not pay the courier twice.
- Users can see only their own balance; admins can see any.

## Edge cases

- A completion is processed twice → the courier is paid once.
- A crash between debiting the requester and crediting the courier → no credits are lost.
