# Database Migration Workflow

## Rule: Never change the database directly in the Supabase dashboard.

All schema changes must go through this process so `schema.sql` stays in sync with production.

---

## Steps for any DB change

1. **Write the SQL** in a new file under `supabase/migrations/`:
   ```
   supabase/migrations/YYYYMMDD_description.sql
   ```
   Example: `20260407_add_boosts_table.sql`

2. **Update `schema.sql`** to reflect the same change.  
   `schema.sql` is the single source of truth for the full DB state.  
   It should always be applyable to a fresh database.

3. **Apply via Supabase MCP or CLI**:
   ```bash
   supabase db push
   ```
   Or use the Supabase MCP `apply_migration` tool in Claude Code.

4. **Commit both files** together in the same commit.

---

## New table checklist

Every new table must have:

- [ ] `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;`
- [ ] SELECT policy — who can read rows?
- [ ] INSERT policy — who can create rows? (or a comment if server-only)
- [ ] UPDATE policy — who can update rows, and with `WITH CHECK`?
- [ ] DELETE policy — who can delete rows?
- [ ] Indexes on all foreign keys and columns used in WHERE clauses
- [ ] Entry added to `schema.sql`

If client INSERT is not allowed (e.g. server-side only), add a comment:
```sql
-- INSERT is server-side only (Edge Function / trigger). No client policy by design.
```

---

## Examples

### Adding a column
```sql
-- supabase/migrations/20260407_add_is_featured_to_listings.sql
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
```

Then in `schema.sql`, add `is_featured BOOLEAN DEFAULT false` to the listings table definition.

### Adding a table
```sql
-- supabase/migrations/20260407_add_boosts_table.sql
CREATE TABLE IF NOT EXISTS public.boosts (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings (id) ON DELETE CASCADE NOT NULL,
  seller_id  UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Boosts are publicly readable"
  ON public.boosts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sellers can create boosts for their listings"
  ON public.boosts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id);
```

---

## After applying: always verify the DDL actually ran

Recording a migration in `supabase_migrations.schema_migrations` is **not the same** as executing its SQL. Always sanity-check the live DB before trusting that a migration "applied":

```bash
# Regenerate types — if the new column/table appears, the DDL ran
supabase gen types typescript --project-id <project-id> > lib/database.types.ts

# Or query directly
psql $DATABASE_URL -c "\d public.<table>"
```

If `apply_migration` (MCP) returned `{"success": true}` but the column still isn't there, something rolled back silently — investigate before continuing.

---

## Never run `supabase migration repair --status applied` on a NEW local migration

This is the trap that produced the 2026-04-21 ghost-migration incident.

`supabase migration repair --status applied <version>` inserts a row into `schema_migrations` (with the file's SQL stored verbatim) **without executing anything**. Once a version is in that table, every future `supabase db push` skips it forever.

**Only safe use case:** acknowledging a migration that *already ran* through another channel (dashboard SQL editor, MCP `apply_migration`, manual `psql`). In other words: bringing local tracking in line with reality, never the other way around.

**Unsafe use case:** "supabase db push complains about my new migration, let me just mark it applied so it stops complaining." The DDL never runs and the column you wanted will never exist. The local file looks correct, the migration table looks correct, and the bug only surfaces at runtime when code tries to read the missing column — usually months later.

If `db push` is failing on a new migration, fix the underlying push error. Don't repair around it.

---

## TypeScript safety — the second line of defence

The Supabase client in `lib/supabase.ts` is typed via `createClient<Database>(...)` using the generated types in `lib/database.types.ts`. **Always regenerate types after any DDL change**:

```bash
supabase gen types typescript --project-id <project-id> > lib/database.types.ts
npx tsc --noEmit
```

If a column you're trying to read doesn't exist in production, `tsc` will catch it (the field is missing from the generated row type). This is the safety net the `as unknown as Listing[]` casts used to bypass — keep new code free of `as unknown as` against DB query results so the typed client can do its job.

---

## Recovery: re-applying a ghost migration

If you discover a migration row that was repaired but never executed (columns missing despite being recorded as applied), the cleanest fix is:

1. Re-run the original DDL via MCP `apply_migration` with a `reapply_<original_name>` name. The original migration's `IF NOT EXISTS` guards make it idempotent.
2. Leave the original `supabase_migrations.schema_migrations` row in place — it now claims correct state.
3. Regenerate types and run typecheck.
4. The local migration file keeps its original timestamp; the new "reapply_" row is the audit trail of when the actual execution happened.
