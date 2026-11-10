-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
-- Scope: Made order_confirmations an order.events outbox too (#186): each proposal publishes an
--        OrderChangeRequest when it is made (outcome CREATED) and when it is approved, rejected or
--        expires. Outbox on order_confirmations and the event's shape chosen by Jie Yang, 2026-11-10.
-- Author review: pending — Jie Yang to record the review.

ALTER TABLE order_confirmations
    -- When Kafka stored this proposal's CREATED event (its eventId is the confirmation id).
    ADD COLUMN proposal_published_at TIMESTAMPTZ,
    -- The eventId of the APPROVED / REJECTED / EXPIRED event: a proposal has two events, so the
    -- second needs an id of its own.
    ADD COLUMN resolution_event_id UUID NOT NULL DEFAULT gen_random_uuid(),
    -- When Kafka stored that resolution event. A SUPERSEDED proposal publishes none: the order's
    -- own state event (completed, cancelled or arrived) already says more.
    ADD COLUMN resolution_published_at TIMESTAMPTZ;

-- Proposals made before this migration were never announced; don't email about them now. A proposal
-- still PENDING here publishes its resolution when that happens.
UPDATE order_confirmations
   SET proposal_published_at = now(),
       resolution_published_at = CASE WHEN status <> 'PENDING' THEN now() END;

CREATE INDEX order_confirmations_proposal_unpublished_idx ON order_confirmations(created_at)
    WHERE proposal_published_at IS NULL;
CREATE INDEX order_confirmations_resolution_unpublished_idx ON order_confirmations(resolved_at)
    WHERE resolution_published_at IS NULL AND status IN ('APPROVED','REJECTED','EXPIRED');
