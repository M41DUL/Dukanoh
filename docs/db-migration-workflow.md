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
