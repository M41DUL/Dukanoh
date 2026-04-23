-- Audit log for admin dispute resolutions
-- Records every dispute action taken, when, and for which order.
-- Service role access only — RLS blocks all client access.

CREATE TABLE IF NOT EXISTS admin_dispute_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('release_seller', 'refund_buyer')),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_dispute_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS admin_dispute_log_order_id_idx    ON admin_dispute_log (order_id);
CREATE INDEX IF NOT EXISTS admin_dispute_log_resolved_at_idx ON admin_dispute_log (resolved_at DESC);
