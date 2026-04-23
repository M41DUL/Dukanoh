-- Tracks failed admin login attempts for persistent rate limiting.
-- Service role only — no RLS policies means anon/user roles have no access.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  ip          text        NOT NULL,
  attempted_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX admin_login_attempts_ip_time_idx
  ON admin_login_attempts (ip, attempted_at);

ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;
