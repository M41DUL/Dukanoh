# Dukanoh Pro — Feature Spec

## Overview
A Pro subscriber feature accessible from the profile tab. Only visible to users with 1+ listings who have completed Stripe Connect onboarding (Verified). Full paywall — no free tier access to Pro features. Subscription managed via RevenueCat (Apple/Google billing). 14-day free trial on first sign-up.

---

## Payment Infrastructure

Two systems work together — completely independent of each other:

| System | Handles | Why |
|--------|---------|-----|
| **Stripe Connect Express** | Buyer → seller payments, seller payouts, identity verification | Physical goods marketplace — exempt from Apple/Google IAP rules |
| **RevenueCat** | Pro subscription + paid boosts | Digital goods consumed in-app — Apple/Google mandate their own billing |

### Stripe Connect Express
Handles all money movement between buyers and sellers, and seller identity verification.

**Seller onboarding:**
- Before receiving payments, sellers complete Stripe Express onboarding (Stripe-hosted — ID verification + bank details)
- Dukanoh redirects seller to Stripe's onboarding URL
- On completion, `stripe_onboarding_complete = true` + `is_verified = true` set via Stripe webhook
- Sellers without a connected Stripe account cannot complete sales or subscribe to Pro

**Transaction flow:**
```
Buyer taps "Buy Now"
  ↓
Stripe Payment Intent created (Supabase Edge Function)
  ↓
Buyer completes payment (Stripe-hosted sheet)
  ↓
Funds held in escrow
  ↓
Seller marks shipped + enters tracking number
  ↓
Buyer confirms receipt (or 2-day auto-release)
  ↓
Funds released to seller wallet
  ↓
Seller manually withdraws to bank (3–5 days via Stripe)
```

**Fees:**
- Platform fee: 6.5% + £0.80 charged to buyer on top of listing price
- Seller always receives full asking price
- Stripe processing: ~1.4% + 20p (UK cards) — absorbed by platform fee

### RevenueCat
Handles Pro subscription and paid boosts via Apple/Google native IAP.

**Manages:**
- Pro subscription (monthly/annual recurring, 14-day free trial)
- Paid boosts (consumable IAP, purchased after free allowance used)

**Flow:**
```
RevenueCat webhook → Supabase Edge Function
  ↓
Updates seller_tier, pro_expires_at, boosts_used, boosts_reset_at
```

---

## Subscription Pricing

### Founder Plan *(first 150 subscribers only)*
- £6.99/month
- £59.99/year (~£5/month, saving 29%)
- Locked in forever — price never increases for founder subscribers
- Paywall copy: *"Lock in your price forever — only 150 founder spots available"*
- Once 150 reached, Founder Plan closed permanently
- Tracked via `platform_settings` table (`founder_count`, `founder_limit`)

### Standard Pro *(after 150 founders)*
- £9.99/month
- £84.99/year (~£7.08/month, saving 29%)
- Paywall copy: *"Price will increase as Dukanoh grows"*

### Subscription rules
- On cancellation: Pro features active until `pro_expires_at`, then all Pro features stop immediately
- On payment failure: 3-day grace period, then revert to free
- All Pro features stop on lapse — nothing persists publicly (collections, badges, ranking all removed)
- Resubscribing restores everything instantly — data is preserved in DB

---

## User Journey

```
Profile Tab
  ↓
User has 1+ listings → Dukanoh Pro entry card appears
  ↓
Not Verified → card shows feature list + "Set up payments to unlock Pro" CTA
Verified, not Pro → card shows feature list + "Start free trial" CTA
Pro subscriber → card shows live earnings, views, saves summary
  ↓
Tap card → hub slides up as modal from bottom
  ↓
Not Verified → paywall shown, "Start free trial" replaced with "Verify your account first"
              → tap → Stripe onboarding → return to paywall
Verified, not Pro → paywall shown with "Start free trial" CTA → RevenueCat purchase flow
Pro → straight into hub dashboard
```

---

## UI Spec

### Theme
Always dark regardless of system light/dark mode. Sourced from `proColors` in `constants/theme.ts`.

| Token | Colour | Use |
|-------|--------|-----|
| Background | `#0A0A1A` | Deep navy |
| Surface | `#13132E` | Card backgrounds |
| Surface elevated | `#1C1C40` | Raised cards, icon wraps |
| Primary (gold) | `#C7A84F` | CTAs, icons, numbers, Pro badge |
| Secondary | `#8888AA` | Muted labels, captions, secondary actions |
| Text primary | `#F5F5F5` | Headings, body |
| Text secondary | `#8888AA` | Captions, muted text |
| Border | `#2A2A50` | Card borders, dividers |
| Positive | `#4ADE80` | Earnings up, good stats |

All colour pairings tested against WCAG AA (4.5:1 minimum).

### Badges

| Badge | Symbol | Colour | Meaning | Shown on |
|-------|--------|--------|---------|----------|
| Pro | `◆` | Gold `#C7A84F` | Active Pro subscriber | Public profile + listing cards |
| Verified | `✓` | Dukanoh blue `#3735C5` | Stripe onboarding complete | Public profile + listing cards |
| Fast Responder | ⚡ | Gold `#C7A84F` | Avg response < 2hrs (Pro only) | Public profile only |

Both badges shown side by side on listing cards: `✓ ◆`

### Navigation
- Hub presents as a **modal** — slides up from bottom of profile tab
- Dismissed via X button top left
- Within hub: **bottom sheets** for quick actions, **push navigation** for full screens

### Entry Point on Profile Tab
Summary card below quick links. Three states:
```
State 1: No listings → card not shown
State 2: Has listings, not Verified → feature list + "Set up payments to unlock Pro"
State 3: Verified, not Pro → feature list + "Start free trial"
State 4: Pro subscriber → live summary: £earned · views · saves
```

### Paywall Screen
- Matches intro/onboarding visual style — deep navy, Dukanoh logo, animated entrance
- Feature list with Ionicons icon rows (matching profile card):
  - ⚡ 3 free boosts every month
  - 📊 Analytics & earnings dashboard
  - ◆ Pro seller badge + ranking boost
  - 📁 Collections
  - 📤 Share kit for Instagram & WhatsApp
  - 🏷 Price drop labels on your listings
- Pricing: "Free for 14 days, no charge until [exact date], then £X/month — cancel anytime"
- Founder Plan shown if `founder_count < 150`: "Lock in your price forever — only [X] founder spots left"
- Primary CTA: "Start 14-day free trial" (Verified) or "Verify your account first" (not Verified)
- Always-visible "Maybe later" subtle text link below CTA

### Hub Main Screen (Single Scroll)
```
[X]  Dukanoh Pro                   [◆ Pro]
─────────────────────────────────────────
[Earnings hero card — full width]
 Total Earned  £1,240
 This month £340 | Last month £180
 [gold line chart]
 Time filter: 7 days · This month · All time

── Performance ───────────────────────────
[Views]     [Saves]     [Profile Visits]

── Active Orders ─────────────────────────
[Orders needing action — with status indicator]

── Your Listings ─────────────────────────
[Hub listing cards with actions]

── Collections ───────────────────────────
[+ New Collection]
[Collection rows]

── Sold Archive ──────────────────────────
[Completed orders — image, title, price, date, buyer]

── Top Categories ────────────────────────
[Occasion tag performance]
```

### Hub Listing Card
- Listing image + title + price + status
- View, save, enquiry counts
- Order status indicator only when action needed: "Awaiting shipment"
- Action row: `⚡ Reach more buyers` · Edit · ⋯ (archive, delete)

**Boost button states:**
```
Default             → "⚡ Reach more buyers"
Free boosts used    → "⚡ Reach more buyers · £0.99"
Active boost        → "⚡ Live in stories · 14h"  (disabled)
```

### Empty States
All use Ionicons with personality-driven copy:

| Section | Icon | Copy |
|---------|------|------|
| No sales | `receipt-outline` | "Your first sale is closer than you think — boost a listing to get in front of the right buyers" |
| No views | `eye-outline` | "No one's looked yet — share your listings or boost them to start getting eyes on your pieces" |
| No collections | `folder-outline` | "Group your listings by occasion — Eid, wedding season, festive. Make your shop feel like a proper boutique" |
| No active boosts | `flash-outline` | "Boost a listing and reach buyers who are already interested in your category" |
| No analytics | `bar-chart-outline` | "Your stats are warming up — views, saves and earnings will appear here as buyers find your listings" |
| No price history | `pricetag-outline` | "When you edit a listing's price, your history will appear here" |

### Collections on Public Profile
Visible only while Pro subscription is active. Disappears immediately on lapse. Data preserved in DB — reappears on resubscription.
```
[profile header]  ✓ ◆

── Collections ──────────────────────────
  Eid 2025                            →
  [img][img][img] +5 more

  Wedding Season                      →
  [img][img][img] +2 more

── All Listings ─────────────────────────
[listing grid]
```

---

## Features Included in Pro

### Pro-only
1. Boosts (free allowance + discounted extras)
2. Analytics & Insights
3. Pro ranking boost (search, feed, category browse)
4. Sale Mode
5. Bulk price editing
6. Price Drop label
7. Collections (create, manage, public display)
8. Share Kit
9. Pro badge `◆`
10. Fast Responder badge ⚡ (earned, not automatic)

### Free for all sellers
- Relist sold listings
- Archive listings
- Draft listings
- Active Orders + Sold Archive
- Occasion tag performance
- Star rating + reviews
- Verified badge `✓` (via Stripe onboarding)
- Basic listing management (edit, delete)

---

## Feature 1 — Boosts

### What It Does
Promotes a listing into the stories rotation beyond its natural 5-hour organic window. Boosted listings are shown to buyers whose category preferences match the listing's category.

### Boost Allowance
| Seller type | Free boosts | Extra boost cost | Simultaneous limit |
|---|---|---|---|
| Standard | 0 | £1.49 | 5 |
| Pro | 3/month | £0.99 | 10 |

- Free boost reset: subscription anniversary date (every 30 days from subscribe date)
- Rollover: none — use it or lose it
- If Pro lapses mid-boost: active boosts continue until natural expiry, no new free boosts

### Boost Rules
| Rule | Detail |
|---|---|
| Duration | 24 hours |
| Re-boost same listing | Allowed immediately — no cooldown |
| Boost through listing edit | Continues uninterrupted |
| Boost when listing sells | Ends naturally |
| Daily purchase limit | None |
| Applies to | Available listings only |

### Boost Button States
```
Default             → "⚡ Reach more buyers"
Free boosts used    → "⚡ Reach more buyers · £0.99"
Active boost        → "⚡ Live in stories · 14h"  (disabled, countdown in hours)
```

### Organic Story Window
- Every new listing appears organically in stories for 5 hours after publishing
- Only the first listing per seller per day gets an organic story slot
- After 5 hours, listing drops off stories unless boosted

### Category Targeting
Boosted listings shown to buyers whose category preferences match:
```
Men → Pathani Suit, Achkan, Formal
Women → Partywear, Festive, Wedding, Formal
Unisex → Casualwear, Shoes
```
- Subcategory preference = exact match only
- Minimum 9 stories shown — broadens to adjacent categories if below threshold

### Buyer Experience
- Gold ring on boosted story bubble
- "Sponsored" label in story viewer top bar
- Frequency cap: shown to same buyer once per day maximum
- Same-seller cap: max 2 boosted stories per seller per buyer session

### Seller Feedback
- "Your boost reached X users interested in [category]" shown in hub
- Inbox message when boost expires: "Your boost on [listing] has ended — X users saw it"

---

## Feature 2 — Analytics & Insights

### Metrics
| Metric | Source |
|--------|--------|
| Total views | `listing_views` |
| Total saves | `saved_items` |
| Total earned | `transactions` |
| This month / last month earned | `transactions` filtered by date |
| Profile visits | `profile_views` |
| Total enquiries | `conversations` |
| Avg response time | `conversations` (first reply vs message received) |
| Per listing: views, saves, enquiries | Grouped by `listing_id` |

### Time Filter
7 days · This month · All time — defaults to 7 days

### Zero States
All metrics show immediately with a contextual message if no data exists.

---

## Feature 3 — Pro Ranking Boost

### What It Does
Pro sellers' available listings are ranked higher across all discovery surfaces — search results, home feed, and category browse pages.

### Surfaces
- Search results
- Home feed
- Category browse pages

### Ranking Rules
| Rule | Detail |
|---|---|
| Applies to | Available listings only |
| Stacking with boosts | Allowed — boost + Pro ranking both apply |
| Recency decay | 0–14 days: full boost · 14–60 days: 50% boost · 60+ days: none |
| Relevance floor | Pro ranking only within the same relevance tier — never overrides a more relevant non-Pro listing |
| Dilution cap | Max 25% of results per category can be Pro-elevated |
| Transparency | `◆` Pro badge on listing cards signals elevated ranking to buyers |

### Guardrails (detail)

**Dilution cap — per category:**
- Applied at category level, not globally
- If Pro listings exceed 25% of a page, excess reverts to natural recency position
- Which Pro listings get the boost when over cap: most recently listed wins

**Relevance tiers:**
```
Tier 1 — Exact match (title + category + size)
Tier 2 — Partial match (title + category)
Tier 3 — Category only
```
Pro boost applied within tier only. Tier 1 non-Pro always beats Tier 2 Pro.

**Recency decay:**
- Accounts for seasonal South Asian fashion cycles (Eid, Diwali, wedding season)
- 60-day window covers most occasion planning cycles

**CMA compliance:**
- UK CMA guidelines require disclosure of paid-for prominence
- `◆` badge on listing cards serves as disclosure — buyers learn Pro sellers rank higher

---

## Feature 4 — Sale Mode

### What It Does
Seller sets a % discount and activates it across all active listings at once.

- Buyers see "Was £40, Now £32" on affected listing cards and detail screens
- Original price stored separately — sale price calculated, not overwritten
- One tap to deactivate, all listings return to original prices instantly
- Pro only — stops immediately if Pro lapses

---

## Feature 5 — Bulk Price Editing

### What It Does
Seller selects multiple listings via checkboxes and applies a new price across all selected in one action.

```
Tap "Edit Prices" → checkboxes on listing cards
  ↓
Select listings
  ↓
"Set Price" bottom sheet → enter new price → confirm
  ↓
All selected listings updated simultaneously
```

- Available listings only — sold and archived not selectable
- Pro only

---

## Feature 6 — Price Drop Label

### What It Does
When a seller manually reduces a listing price, a "Price Drop" label appears on the listing card for buyers.

- Label persists for 7 days after price change, then disappears
- Seller sees price history timeline in hub listing detail: "£45 → £40 · 3 days ago"
- Buyers never see price history — label only
- Pro only

---

## Feature 7 — Collections

### Seller Side (in hub)
- Create, rename, delete collections
- Assign listings to a collection (one collection per listing)
- Collections shown as organisational view in hub

### Buyer Side (on public profile)
- Visible only while Pro subscription is active
- Disappears immediately on Pro lapse — data preserved for resubscription
- Empty collections not shown publicly
- Buyer taps collection → sees all listings within it

---

## Feature 8 — Share Kit

### What It Does
Auto-generates a shareable image card for a listing. Seller taps "Share" on any listing → card generated → native share sheet.

**Card contents:**
- Listing image (full bleed)
- Title + price
- Dukanoh logo + "Find on Dukanoh" CTA

**How it works:**
- `react-native-view-shot` renders hidden styled view, captures as PNG on-device
- No server needed — fully local
- Native share sheet handles the rest

---

## Feature 9 — Seller Profile Perks

### Pro Badge `◆`
- Automatically applied on Pro subscription, removed immediately on lapse
- Shown on public profile header + each listing card in feed
- Gold `#C7A84F`

### Verified Badge `✓`
- Awarded on Stripe Connect onboarding completion
- Never removed — permanent once verified
- Shown on public profile header + each listing card in feed
- Dukanoh blue `#3735C5`

### Fast Responder Badge ⚡
- Pro only — cannot be earned on free tier
- Auto-awarded when avg response time drops below 2 hours
- Calculated from conversation timestamps every 24 hours via Supabase Edge Function
- Removed automatically if average slips above 2 hours
- Shown on public profile only — not on listing cards
- Disappears immediately if Pro lapses

---

## Free Features (available to all sellers)

### Relist
One-tap duplicate of a sold listing. Creates new listing pre-filled with same title, price, category, condition, size, images. Seller reviews and publishes.

- Original sold listing remains visible on seller's public profile as "sold"
- Sold listings not shown in main feed or search results

### Archive
Hides listing from all buyers — not visible in feed, search, or public profile. Only seller sees it inside their listings. Can be unarchived at any time.

### Active Orders
Separate section showing orders that need action (paid, shipped, in transit, disputed). Shows order status indicator on listing card only when action is needed — "Awaiting shipment".

### Sold Archive
Complete sales history. Each entry shows: listing image + title + sale price + date sold + buyer username. Sourced from `listings` (status = 'sold') joined with `transactions`.

### Occasion Tag Performance
Shows which categories are driving the most views. Join `listing_views` with `listings` on `listing_id`, group by category, count views. Respects analytics time filter.

---

## DB Changes Required

### users table
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS seller_tier TEXT DEFAULT 'free';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS boosts_used INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS boosts_reset_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avg_response_time_mins INT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sale_mode_active BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sale_mode_discount_pct INT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_url TEXT;
```

### listings table
```sql
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS is_boosted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS boost_expires_at TIMESTAMPTZ;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS price_dropped_at TIMESTAMPTZ;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2);
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('available', 'sold', 'draft', 'archived'));
```

### New tables
```sql
-- Collections
CREATE TABLE IF NOT EXISTS public.collections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  seller_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Collections publicly readable" ON public.collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sellers manage own collections" ON public.collections FOR ALL TO authenticated USING (auth.uid() = seller_id);

-- Listing views
CREATE TABLE IF NOT EXISTS public.listing_views (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own views" ON public.listing_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Sellers read own listing views" ON public.listing_views FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Profile views
CREATE TABLE IF NOT EXISTS public.profile_views (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  viewer_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own profile views" ON public.profile_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_user_id);
CREATE POLICY "Sellers read own profile views" ON public.profile_views FOR SELECT TO authenticated USING (auth.uid() = profile_user_id);

-- Story views
CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own story views" ON public.story_views FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Listing price history
CREATE TABLE IF NOT EXISTS public.listing_price_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  old_price NUMERIC(10,2) NOT NULL,
  new_price NUMERIC(10,2) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.listing_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read own price history" ON public.listing_price_history FOR SELECT TO authenticated
  USING (listing_id IN (SELECT id FROM public.listings WHERE seller_id = auth.uid()));

-- Boost audit trail
CREATE TABLE IF NOT EXISTS public.listing_boosts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  boosted_at TIMESTAMPTZ DEFAULT NOW(),
  boost_expires_at TIMESTAMPTZ,
  was_paid BOOLEAN DEFAULT FALSE,
  amount_paid NUMERIC(10,2)
);
ALTER TABLE public.listing_boosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read own boosts" ON public.listing_boosts FOR SELECT TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "Sellers insert own boosts" ON public.listing_boosts FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);

-- Platform settings (founder count etc)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO public.platform_settings (key, value) VALUES
  ('founder_limit', '150'),
  ('founder_count', '0'),
  ('founder_monthly_price', '6.99'),
  ('founder_annual_price', '59.99'),
  ('pro_monthly_price', '9.99'),
  ('pro_annual_price', '84.99')
ON CONFLICT (key) DO NOTHING;
```

---

## Screens to Build / Update

| Screen | Route | Notes |
|--------|-------|-------|
| Dukanoh Pro paywall | `app/seller-hub.tsx` | Already built — update copy + Verified gate |
| Pro dashboard | `app/seller-hub.tsx` | Already built — add Active Orders, Sold Archive |
| Profile entry card | `app/(tabs)/profile.tsx` | Already built — add Verified state |
| Stripe onboarding | `app/stripe-onboarding.tsx` | New — prompt + redirect to Stripe Express |
| Public user profile | `app/user/[id].tsx` | Add ✓ ◆ badges, collections section |
| Listing card | `components/ListingCard.tsx` | Add ✓ ◆ badges |
| Listing detail | `app/listing/[id].tsx` | Add ✓ ◆ badges next to seller name |

---

## RevenueCat Integration Points (when ready)
- Pro subscription: `Purchases.purchasePackage()` in paywall CTA
- Boost consumable: `Purchases.purchasePackage()` on boost button
- Entitlement check: `Purchases.getCustomerInfo()` on app load
- Webhook: update `seller_tier`, `pro_expires_at`, `founder_count` in DB

## Stripe Integration Points (when ready)
- Seller onboarding: `stripe.accounts.create` + hosted onboarding link
- Webhook `account.updated`: set `is_verified = true`, `stripe_onboarding_complete = true`
- Payment capture, escrow, release, refunds: see `payments-spec.md`
