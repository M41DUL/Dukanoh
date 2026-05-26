-- Per-session tokens for the admin panel. Previously the admin_session cookie
-- value was a static env secret (ADMIN_SESSION_SECRET), which meant logout
-- could not invalidate, secrets could not rotate without locking out the
-- admin, and a leaked secret = permanent admin access. Now: login generates
-- a random token, stores its sha256 hash here, and sets the cookie to the
-- raw token. Logout marks the row revoked.

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip text
);

create index admin_sessions_expires_at_idx on public.admin_sessions (expires_at);

alter table public.admin_sessions enable row level security;
-- No policies: only service role (supabaseAdmin) reads/writes this table.
