-- Recurring (monthly) expense templates.
-- When the expenses page loads, any active row whose day_of_month has been
-- reached this month (and that hasn't already been generated for the current
-- month) produces an admin_expenses row and advances last_generated_ym.

CREATE TABLE IF NOT EXISTS admin_recurring_expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category            TEXT NOT NULL CHECK (category IN (
                        'stripe_fees',
                        'hosting_vercel',
                        'hosting_supabase',
                        'legal',
                        'marketing',
                        'subscriptions',
                        'other'
                      )),
  description         TEXT NOT NULL,
  amount              NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  day_of_month        SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  receipt_url         TEXT,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  last_generated_ym   TEXT, -- 'YYYY-MM' of the most recently generated instance
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link generated rows back to their template (nullable — manual entries stay null).
ALTER TABLE admin_expenses
  ADD COLUMN IF NOT EXISTS recurring_id UUID REFERENCES admin_recurring_expenses(id) ON DELETE SET NULL;

ALTER TABLE admin_recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS admin_recurring_expenses_active_idx
  ON admin_recurring_expenses (active) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS admin_expenses_recurring_id_idx
  ON admin_expenses (recurring_id);
