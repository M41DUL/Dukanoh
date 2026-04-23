-- Admin finance tables
-- Access is service-role only. RLS blocks all anon/authenticated access.

CREATE TABLE IF NOT EXISTS admin_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL,
  category    TEXT NOT NULL CHECK (category IN (
                'stripe_fees',
                'hosting_vercel',
                'hosting_supabase',
                'legal',
                'marketing',
                'subscriptions',
                'other'
              )),
  description TEXT NOT NULL,
  amount      NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  receipt_url TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_compliance_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rules_summary  TEXT NOT NULL,
  confirmed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: enable but add no permissive policies — blocks all client access
ALTER TABLE admin_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_compliance_log ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS admin_expenses_date_idx ON admin_expenses (date DESC);
CREATE INDEX IF NOT EXISTS admin_expenses_category_idx ON admin_expenses (category);
CREATE INDEX IF NOT EXISTS admin_compliance_log_confirmed_at_idx ON admin_compliance_log (confirmed_at DESC);
