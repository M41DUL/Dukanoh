# Deferred migrations

Migrations here are **intentionally not applied yet** and are kept **out of
`supabase/migrations/`** so `supabase db push` cannot apply them prematurely.

## `20260628150000_lock_orders_status_writes.sql`
Drops the direct buyer/seller `UPDATE` policies on `orders`, forcing all order
status changes through the `raise_dispute` / `withdraw_dispute` / `cancel_order`
RPCs.

**Do not apply until a mobile app build that uses those RPCs is live for all
testers.** The currently-installed build still does direct `.update()` calls;
applying this before that build ships would break dispute/withdraw/cancel.

When ready: move the file back into `supabase/migrations/` and apply it (via the
dashboard / MCP, matching this project's manual-migration workflow), or run it
directly. Its version (`20260628150000`) sorts after the latest applied
migration, so it will apply cleanly.
