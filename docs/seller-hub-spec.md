# Seller Hub — Feature Spec

## Overview
A Pro subscriber feature accessible from the profile tab. Only visible to users with 1+ listings. Full paywall — no free tier access. Subscription managed via RevenueCat (Apple/Google billing). 14-day free trial on first sign-up.

---

## Payment Infrastructure

Two systems work together — they are completely independent of each other:

| System | Handles | Why |
|--------|---------|-----|
| **Stripe Connect Express** | Buyer → seller payments for listing purchases, seller payouts | Physical goods marketplace transactions — exempt from Apple/Google IAP rules |
| **RevenueCat** | Pro subscription + paid boosts | Digital goods consumed in-app — Apple/Google require their own IAP system for these |

### Stripe Connect Express

Handles all money movement between buyers and sellers for listing purchases.

**Seller onboarding:**
- Before receiving payments, sellers complete Stripe Express onboarding (Stripe-hosted — ID verification + bank details)
- Dukanoh redirects seller to Stripe's onboarding URL on first listing publish
- On completion, Stripe returns `stripe_account_id` stored on seller's profile
- Sellers without a connected Stripe account cannot complete sales

**Transaction flow:**
```
Buyer taps "Buy Now" on listing
  ↓
Stripe Payment Intent created (Supabase Edge Function)
  ↓
Buyer completes payment (Stripe-hosted sheet)
  ↓
Stripe transfers funds to seller's connected account
  ↓
Stripe webhook → Supabase Edge Function → inserts row into transactions table
  ↓
Listing status updated to 'sold' automatically
```

**Fees:**
- UK/European cards: 1.4% + 20p per transaction
- Non-European cards: 2.9% + 30p per transaction
- Connect payout: 0.25% + 25p per seller payout

**DB changes:**
```sql
ALTER TABLE public.profiles
ADD COLUMN stripe_account_id TEXT,
ADD COLUMN stripe_onboarding_complete BOOLEAN DEFAULT false;
```

### RevenueCat

Handles Pro subscription and paid boosts via Apple/Google's native IAP system. Required for App Store compliance — Apple and Google mandate their own billing for digital goods consumed in-app.

**Free tier:** Covers up to $2,500/month in tracked revenue — no cost until revenue exceeds this.

**Manages:**
- Pro subscription (monthly recurring, 14-day free trial)
- Paid boosts (consumable in-app purchase, purchased after free 3/month are used)

**Flow:**
```
RevenueCat webhook → Supabase Edge Function
  ↓
Updates seller_tier, pro_expires_at, boosts_used on profiles
```

**DB changes:**
```sql
ALTER TABLE public.profiles
ADD COLUMN seller_tier TEXT DEFAULT 'free',
ADD COLUMN pro_expires_at TIMESTAMPTZ;
```

---

## User Journey

```
Profile Tab
  ↓
User has 1+ listings → "Seller Hub" button appears
  ↓
Tap "Seller Hub"
  ↓
Paywall Screen (full screen)
  ├── Feature list
  ├── Price (£X/month)
  └── "Start 14-day free trial" CTA
  ↓
Apple/Google native payment sheet (via RevenueCat)
  ↓
Payment confirmed → Seller Hub unlocks immediately
  ↓
Returning subscribers → skip paywall, go straight in
```

---

## Features Included in Pro

### 1. Boosts
### 2. Analytics & Insights
### 3. Listing Management Tools
### 4. Seller Profile Perks
### 5. Buyer Tools
### 6. Pricing & Sales Strategy
### 7. Inventory & Organisation
### 8. South Asian Platform-Specific
### 9. Growth & Reach

---

## Feature 1 — Boosts

### What It Does
Temporarily re-enters a listing into the stories rotation beyond its natural 5-hour organic window. Boosted listings are shown to buyers whose category preferences match the listing's category.

### Boost Allowance
- Pro subscribers get 3 free boosts per month
- Monthly counter resets on the same date each month
- After 3 free boosts are used, seller can purchase additional boosts individually (pay-as-you-go)
- If Pro subscription lapses, no new free boosts — any active boosts continue until their expiry date

### Boost Duration
- 3 days per boost
- After expiry, listing returns to normal (no story presence unless re-boosted)
- Seller can re-boost the same listing immediately after expiry
- Only one active boost per listing at a time — boost button disabled while boost is active, shows "Boosted — X days remaining"

### Organic Story Window (Context)
- Every new listing appears organically in stories for 5 hours after publishing
- Only the first listing per seller per day gets an organic story slot — subsequent listings published the same day do not appear in stories organically
- After 5 hours the listing drops off stories entirely unless boosted

### Category Targeting
Boosted listings are only shown to buyers whose category preferences include the listing's category. Uses a hardcoded parent-child category map:

```
Men
  └── Pathani Suit
  └── Achkan
  └── Formal

Women
  └── Partywear
  └── Festive
  └── Wedding
  └── Formal

Unisex
  └── Casualwear
  └── Shoes
```

Matching rules:
- User follows "Women" → sees boosts from Partywear, Festive, Wedding, Formal
- User follows "Partywear" → sees Partywear boosts only, not all Women
- Subcategory preference = exact match only, no upward broadening

### Buyer Experience
- Boosted stories show a subtle "Sponsored" label next to the seller username in the story top bar
- Frequency cap: a boosted listing is shown to the same buyer once per day maximum (uses existing `story_views` timestamp)
- Same seller cap: max 2 boosted stories per seller per buyer session — if a seller has 3+ active boosts, 2 are selected at random per session

### Story Pool & Minimum Threshold
- Minimum 9 stories shown in the stories row
- If a buyer's category preferences return fewer than 9 stories, adjacent categories are broadened until threshold is met
- Fallback chain: exact preferences → adjacent categories → all categories
- Adjacency map is hardcoded for now

### Seller Feedback
- Seller sees in hub: "Your boost reached X users interested in [category]"
- Push notification / inbox message when boost expires: "Your boost on [listing] has ended — X users saw it"
- Boost button on listing card in hub shows "Boosted — X days remaining" while active

### DB Changes

```sql
-- Profiles
ALTER TABLE public.profiles
ADD COLUMN category_preferences TEXT[] DEFAULT '{}',
ADD COLUMN boosts_used INT DEFAULT 0,
ADD COLUMN boosts_reset_at TIMESTAMPTZ;

-- Listings
ALTER TABLE public.listings
ADD COLUMN is_boosted BOOLEAN DEFAULT false,
ADD COLUMN boost_expires_at TIMESTAMPTZ;

-- Boost audit trail
CREATE TABLE listing_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id),
  seller_id UUID REFERENCES users(id),
  boosted_at TIMESTAMPTZ DEFAULT NOW(),
  boost_expires_at TIMESTAMPTZ,
  was_paid BOOLEAN DEFAULT false
);
```

### Stories Query Change
Current query filters listings by `created_at > now - 24hrs`.

Updated query:
```sql
SELECT * FROM listings WHERE
  (created_at > now() - interval '5 hours' AND is_first_listing_today = true)
  OR
  (is_boosted = true AND boost_expires_at > now())
```

Boosted listings are then filtered client-side against the buyer's `category_preferences` using the hardcoded adjacency map.

---

## Feature 2 — Analytics & Insights

### Dashboard Layout

```
┌─────────────────┐  ┌─────────────────┐
│  Total Views    │  │  Total Saves    │
│     1,240       │  │      86         │
└─────────────────┘  └─────────────────┘

┌─────────────────────────────────────┐
│  Total Earned                       │
│  £1,240                             │
│  This month £340  |  Last month £180│
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Profile Visits        42           │
│  Total Enquiries       18           │
│  Avg Response Time     2h           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Per Listing Breakdown              │
│  ─────────────────────────────────  │
│  [listing image] Title              │
│  👁 240 views  🤍 12 saves  💬 4    │
│                                     │
│  [listing image] Title              │
│  👁 180 views  🤍 8 saves   💬 2    │
└─────────────────────────────────────┘
```

### Time Filter
7 days | 30 days | All time — defaults to 30 days. Applies to all metrics.

### Metrics

| Metric | Source | Notes |
|--------|--------|-------|
| Total views | `listing_views` | All surfaces — grid, search, story taps, listing detail |
| Total saves | `saved_listings` | Anonymised count only — no buyer identities shown |
| Total earned | `transactions` | Gross sale amount via Stripe Connect. No platform fees shown |
| This month earned | `transactions` | Current calendar month |
| Last month earned | `transactions` | Previous calendar month |
| Profile visits | `profile_views` | Unique visits to seller's profile |
| Total enquiries | `conversations` | Conversations where seller is recipient |
| Avg response time | `conversations` | Derived from first reply timestamp vs message received timestamp |
| Per listing: views | `listing_views` | Grouped by listing_id |
| Per listing: saves | `saved_listings` | Grouped by listing_id |
| Per listing: enquiries | `conversations` | Grouped by listing_id |

### Zero States
All metrics show immediately. If no data exists yet, display a zero with a short contextual message:
```
Profile Visits
0
"Visits will appear once buyers view your profile"
```

### DB Changes

```sql
-- Profile visits
CREATE TABLE profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id UUID REFERENCES users(id),
  viewer_user_id UUID REFERENCES users(id),
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saves/favourites
CREATE TABLE saved_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  listing_id UUID REFERENCES listings(id),
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

-- Transactions (Stripe Connect)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id),
  seller_id UUID REFERENCES users(id),
  buyer_id UUID REFERENCES users(id),
  amount NUMERIC(10,2) NOT NULL,
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Note: `listing_views` already exists. Ensure it is written to from all surfaces — grid, search, story taps, and listing detail screen.

---

## Feature 3 — Listing Management Tools

### Relist
One-tap duplicate of a sold listing. Creates a new listing pre-filled with the same title, price, category, condition, size, and images. Seller reviews and publishes.

- Original sold listing remains visible on the seller's public profile as "sold" — builds trust and track record
- Sold listings do not appear in the main feed or search results
- Sold listings are visible when a buyer browses that seller's profile directly

### Bulk Edit (Price Only)
Seller selects multiple listings via checkboxes in the hub and applies a new price across all selected listings in one action.

```
Hub listing view
  ↓
Tap "Edit Prices" → checkboxes appear on each listing card
  ↓
Select listings
  ↓
"Set Price" bottom sheet → enter new price → confirm
  ↓
All selected listings updated simultaneously
```

Only available on `available` listings — sold and archived listings are not selectable.

### Archive
Hides a listing completely from all buyers. Not visible in feed, search, or the seller's public profile. Only the seller sees it inside their hub under a dedicated "Archived" section. Can be unarchived at any time, returning it to available status.

### DB Changes

```sql
-- Update listings status enum to include archived
ALTER TABLE public.listings
DROP CONSTRAINT IF EXISTS listings_status_check;

ALTER TABLE public.listings
ADD CONSTRAINT listings_status_check
CHECK (status IN ('available', 'sold', 'archived'));
```

---

## Feature 4 — Seller Profile Perks

### Pro Seller Badge
- Automatically applied when seller subscribes to Pro, removed if subscription lapses
- Shown on the seller's public profile header and on each of their listing cards in the feed
- Small, non-intrusive badge treatment

### Fast Responder Badge
- Auto-awarded when seller's average response time drops below 2 hours
- Calculated from conversation timestamps — time between buyer's first message and seller's first reply
- Recalculated every 24 hours via Supabase Edge Function
- Removed automatically if average slips above 2 hours
- Shown on seller's public profile only — not on listing cards

### Custom Storefront Banner
- Pro sellers can upload a banner image to the top of their public profile
- Replaces the default blank/surface colour header
- Same upload flow as listing images — expo-image-picker + Supabase storage

### DB Changes

```sql
ALTER TABLE public.profiles
ADD COLUMN banner_url TEXT,
ADD COLUMN avg_response_time_mins INT;
```

Pro badge is derived from `seller_tier` — no extra column needed.

---

## Feature 5 — Buyer Tools

### Save Counts Per Listing
Anonymised save count shown on each listing card within the hub. Seller sees at a glance which listings are generating genuine buyer interest.

- Sourced from `saved_listings` table (specced in Feature 2)
- Shown on the listing card in the hub — e.g. "🤍 12 saves"
- No buyer identities exposed — count only

### Notes
- Offer management already fully built — buyers make offers from listing detail, sellers accept/decline in conversation screen via message protocol
- Bundle deals deferred to v2 — requires cart + multi-item payment infrastructure with Stripe Connect

### DB Changes
None — `saved_listings` table already specced in Feature 2.

---

## Feature 6 — Pricing & Sales Strategy

### Price History
- Every price change on a listing is logged with old price, new price, and timestamp
- Visible to seller only inside the hub listing detail — buyers never see it
- Shown as a simple timeline: "£45 → £40 · 3 days ago"

### Sale Mode
- Seller sets a % discount (e.g. 20%) and activates it across all active listings at once
- Buyers see "Was £40, Now £32" on affected listing cards and detail screens
- Original price stored separately — sale price is calculated, not overwritten
- One tap to deactivate, all listings return to original prices instantly

### Price Drop Signal
- When a seller manually reduces a listing's price outside of Sale Mode, a "Price Drop" label appears on the listing card for buyers
- Label persists for 7 days after the price change, then disappears
- Buyers who have saved that listing receive an in-app notification in their inbox: "💰 [Title] dropped to £32 (was £40)" — taps through to listing detail
- Requires a `notifications` table and a notifications section in the inbox tab

### DB Changes

```sql
-- Price history
CREATE TABLE listing_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id),
  old_price NUMERIC(10,2) NOT NULL,
  new_price NUMERIC(10,2) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sale mode on profiles
ALTER TABLE public.profiles
ADD COLUMN sale_mode_active BOOLEAN DEFAULT false,
ADD COLUMN sale_mode_discount_pct INT;

-- Price drop tracking on listings
ALTER TABLE public.listings
ADD COLUMN price_dropped_at TIMESTAMPTZ,
ADD COLUMN original_price NUMERIC(10,2);

-- In-app notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  listing_id UUID REFERENCES listings(id),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Feature 7 — Inventory & Organisation

### Collections
Seller creates named groups to organise their listings — e.g. "Eid 2025", "Wedding Season", "Size 12".

**Seller side (in hub):**
- Create, rename, and delete collections
- Assign listings to a collection — one collection per listing
- Collections shown in hub as a separate organisational view alongside the main listings list

**Buyer side (on seller's public profile):**
- Collections appear as browsable sections on the seller's profile
- Buyer can tap a collection to see all listings within it
- Empty collections not shown publicly

### Sold Archive
A dedicated "Sold" section within the hub showing the seller's complete sales history.

Each entry shows:
- Listing image + title
- Sale price
- Date sold
- Buyer username

Sourced from `listings` filtered by `status = 'sold'` joined with `transactions` for sale price and buyer. Ordered by most recently sold.

### DB Changes

```sql
-- Collections
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.listings
ADD COLUMN collection_id UUID REFERENCES collections(id) ON DELETE SET NULL;
```

Sold Archive requires no new DB changes — sourced from existing `listings` and `transactions` tables.

---

## Feature 8 — South Asian Platform-Specific

### Occasion Tag Performance
Shows the seller which categories are driving the most views on their listings. Surfaced inside the Analytics section of the hub.

**What it shows:**
```
Your top performing categories
─────────────────────────────
🥇 Festive       340 views
🥈 Partywear     210 views
🥉 Wedding        95 views
```

**How it works:**
- Join `listing_views` with `listings` on `listing_id` to get the category of each viewed listing
- Group by category, count views, filter to the seller's listings only
- Ordered by view count descending
- Respects the analytics time filter (7 days / 30 days / All time)

**Zero state:** "No view data yet — share your listings to get started"

### Deferred
- Seasonal prompts — deferred to v2
- Size demand signal — deferred until sufficient search volume data exists

### DB Changes
None — fully derivable from existing `listing_views` and `listings` tables.

---

## Feature 9 — Growth & Reach

### Share Kit
Auto-generate a shareable image card for a listing. Seller taps "Share" on any listing in the hub → card is generated → native share sheet opens → seller shares to Instagram, WhatsApp, or anywhere else.

**Card contents:**
- Listing image (full bleed)
- Title + price overlaid
- Dukanoh logo/branding
- "Find on Dukanoh" CTA

**How it works:**
- `react-native-view-shot` renders a hidden styled view and captures it as an image on-device
- No server needed — fast, fully local
- Native share sheet handles the rest

**New package required:**
```
react-native-view-shot
```

### Deferred
- Follower system — new social graph, scoped as a separate future feature
- Referral tracker — deferred to v2

### DB Changes
None.
