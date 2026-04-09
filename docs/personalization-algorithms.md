# Personalization Algorithms

This is the source of truth for every algorithm and ranking decision in Dukanoh. Before changing any algorithm, update the relevant section here first. Before adding a new one, write the spec here before touching any code.

---

## How to use this doc

- **Improving an existing algorithm** — read the section, check the metric, make the change in code, update the "Current limitations" and "Change log" here.
- **Adding a new algorithm** — write the spec in a new section first, get it clear in plain English, then build it.
- **Debugging unexpected feed behaviour** — this doc tells you exactly which files and logic to look at.

---

## Table of contents

1. [Suggested for You](#1-suggested-for-you)
2. [New Arrivals](#2-new-arrivals)
3. [Trending Categories strip](#3-trending-categories-strip)
4. [Price Drops](#4-price-drops)
5. [Recently Viewed](#5-recently-viewed)
6. [Pro Seller Ranking](#6-pro-seller-ranking)
7. [Listing Boost](#7-listing-boost)
8. [Search Tab default](#8-search-tab-default)
9. [Fuzzy text search](#9-fuzzy-text-search)
10. [Browse & filter sort options](#10-browse--filter-sort-options)

---

## 1. Suggested for You

**What it does**
Shows the user a section of listings tailored to their taste. Only appears when there are results to show.

**Where it lives**
`hooks/useFeed.ts` — `fetchSection()` and the category-building logic around lines 225–238.

**Data it uses**
| Source | Column | What it tells us |
|--------|--------|-----------------|
| `users.preferred_categories` | `TEXT[]` | Categories selected during onboarding |
| `saved_items` → listing category | via join | Categories the user has saved items from |
| `listing_views` → listing category | via join | Categories the user has browsed (last 20 views) |

All three sources are merged and de-duplicated into one list: `allCats`.

**How it ranks**
1. Fetch up to 25 listings matching `category IN (allCats)` AND/OR `occasion IN (allOccasions)` (two parallel queries, merged and deduplicated), `status = available`, excluding the user's own listings and blocked sellers.
2. Re-sort merged results by `created_at DESC` (newest first).
3. Apply seller diversity cap: max 2 listings per seller.
4. Apply Pro Seller Ranking (top 25% of slots go to Pro sellers, if eligible).
5. Return first 10 results.

No boost logic — boosts belong in Stories only.

**Success metric**
Tap-through rate on listings in this section. If users are tapping them and saving/buying, the signal is good.

**Current limitations**
- No price range signal — a user who only saves cheap items will still see expensive listings.
- No size preference signal.
- Categories from views are fetched from the last 20 views only.

**Improvement ideas**
- Add price range preference: infer a min/max from the user's saved items and weight results within that range higher.
- Add size preference: if the user frequently saves items in size M, surface more size M listings.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Onboarding categories as the first personalisation signal |
| 2026-04-09 | Added occasion signal from saved items | Passive learning — users who save Partywear should see more Partywear |
| 2026-04-09 | Added seller diversity cap (max 2 per seller) | Prevent one seller dominating the section |
| 2026-04-09 | New-user fallback to trending categories | Section was blank for new users with no signal |
| 2026-04-09 | Increased result limit from 6 to 10 | Section felt too thin |
| 2026-04-09 | Removed boost logic from this section | Boosts belong in Stories only |

---

## 2. New Arrivals

**What it does**
Shows the most recently listed items filtered by the user's gender preference. Keeps the feel of discovery — time-ordered, not interest-matched — but removes irrelevant gender listings.

**Where it lives**
`hooks/useFeed.ts` — `fetchNewArrivals()`.

**Data it uses**
| Source | Column | What it tells us |
|--------|--------|-----------------|
| `users.preferred_categories` | `TEXT[]` | Whether user prefers Men, Women, or neither |

**How it ranks**
1. Derive gender from onboarding: Women only → filter `category = 'Women'`; Men only → filter `category = 'Men'`; both or neither → no filter.
2. Fetch up to 25 listings, ordered by `created_at DESC`, excluding user's own and blocked sellers.
3. Apply seller diversity cap: max 2 listings per seller.
4. Apply Pro Seller Ranking.
5. Return first 10 results.

No boost logic — boosts belong in Stories only.

**Success metric**
Whether users tap through and explore listings they would not have found via their preferred categories.

**Current limitations**
- No listing quality signal — a single blurry photo ranks the same as a fully photographed listing.

**Improvement ideas**
- Listing quality score: factor in image count, description length, and seller rating as a tiebreaker.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Simple newest-first discovery, no filter |
| 2026-04-09 | Added gender filter from onboarding preference | Avoid showing Men listings to Women-only users and vice versa |
| 2026-04-09 | Removed boost logic | Boosts belong in Stories only |
| 2026-04-09 | Added seller diversity cap (max 2 per seller) | Prevent one seller dominating the section |
| 2026-04-09 | Increased result limit from 6 to 10 | Section felt too thin |

---

## 3. Trending Categories strip

**What it does**
A horizontal scrollable row of category bubbles on the home screen, showing which categories have the most buyer interest right now, filtered to the user's gender preference.

**Where it lives**
`hooks/useFeed.ts` — `fetchTrendingCategories(gender)`.

**Data it uses**
| Source | What it tells us |
|--------|-----------------|
| `saved_items.created_at` | Saves in the last 7 days — measures buyer demand |
| `listings.category` | Which category each saved listing belongs to |
| `listings.status` | Only count available listings |
| `users.preferred_categories` | Derived gender filter (Men / Women / null) |

**How it ranks**
1. Fetch up to 500 saves from the last 7 days, joined to listing category and status.
2. Count saves per category, excluding unavailable listings.
3. Apply gender filter: skip categories that don't match the user's gender preference (if set).
4. Sort by save count descending, take top 6.
5. Cache per gender variant (`all` / `Men` / `Women`) for 30 minutes.

**Success metric**
Whether users tap a trending category and then save or buy something from it.

**Current limitations**
- 7-day window is fixed — no seasonal awareness (e.g. Eid or wedding season should surface festive/wedding categories regardless of save count).

**Improvement ideas**
- Seasonal weighting: a Supabase config table mapping date ranges to category boosts (e.g. Eid window → +weight for Festive, Wedding, Partywear). Low priority until there is enough traffic to validate it.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Listing count as a proxy for trending |
| 2026-04-09 | Switched signal from listing count to save count | Save count measures buyer demand, not seller supply |
| 2026-04-09 | Added gender filter | Avoid surfacing irrelevant gender categories |
| 2026-04-09 | Made cache key gender-aware | Women and Men users get different cached results |

---

## 4. Price Drops

**What it does**
Alerts the user when a listing they saved has dropped in price since they saved it.

**Where it lives**
`hooks/useFeed.ts` — `fetchPriceDrops()` around lines 253–267.

**Data it uses**
| Column | What it tells us |
|--------|-----------------|
| `saved_items.price_at_save` | The price when the user saved the item |
| `listings.price` | The current price |
| `listings.status` | Only show if still available |

**How it ranks**
1. Filter to drops ≥ 10% relative to each user's individual `price_at_save`.
2. Sort by percentage drop descending — biggest saving first.

**Push notification (server-side)**
When a seller lowers a listing's price, the `listings` table UPDATE fires a webhook to the `push-notification` Edge Function. `handlePriceDrop` then:
1. Fetches all savers with their individual `price_at_save`.
2. For each saver, checks whether the drop is ≥ 10% relative to *their* saved price (not the old price).
3. Sends a push notification with the exact % saving: "Lehenga dropped 23% to £45.00".
4. Inserts a record into the `notifications` table for the in-app notification feed.

**Webhook required**
A Supabase Database Webhook must be configured in the Supabase Dashboard:
- Table: `public.listings`, Event: `UPDATE`
- URL: `<project-ref>.supabase.co/functions/v1/push-notification`
- Header: `Authorization: Bearer <WEBHOOK_SECRET>`

**Success metric**
Whether users who receive a price drop notification then open the app and purchase the item.

**Current limitations**
- No rate limiting per user — if a seller drops the price twice in a day, the user gets two notifications. A cooldown per listing per user (e.g. max one notification per 24 hours) would be cleaner.

**Improvement ideas**
- Add a per-user per-listing notification cooldown (24 hours) to avoid spamming.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Basic price tracking on save |
| 2026-04-09 | Added 10% minimum drop threshold (client + server) | 1p drops are noise, not signal |
| 2026-04-09 | Sort by biggest % drop first | Most significant saving should lead |
| 2026-04-09 | Per-user threshold check in Edge Function | Each user's threshold is relative to their own saved price |
| 2026-04-09 | Push notification with % saving in copy | Brings users back to the app when a saved item drops |
| 2026-04-09 | In-app `notifications` table insert on price drop | Drop appears in notification feed even if push is off |

---

## 5. Recently Viewed

**What it does**
Shows the last 10 listings the user opened, in the order they viewed them. Cross-device — persisted in the database.

**Where it lives**
`hooks/useRecentlyViewed.ts` — reads from `listing_views`, writes on each listing open.
Called from `app/listing/[id].tsx` — `recordView()` on line 123.

**Data it uses**
`listing_views` table — `user_id`, `listing_id`, `viewed_at`.

**How it ranks**
1. Query `listing_views` for the current user, ordered by `viewed_at DESC`, limit 100.
2. Deduplicate client-side — keep only the first (most recent) occurrence of each listing.
3. Take the first 10 unique listings.
4. Fetch full listing data, exclude sold/unavailable and user's own listings.
5. Return in view-recency order.

**Success metric**
Whether users use this section to return to a listing they were considering.

**Current limitations**
- `listing_views` grows indefinitely — no cleanup policy yet (old rows are never deleted).

**Improvement ideas**
- Add a DB cleanup job (pg_cron or scheduled Edge Function) to delete `listing_views` rows older than 90 days per user, keeping the table lean.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | AsyncStorage, device-only, 8 items |
| 2026-04-09 | Moved to `listing_views` DB table | Cross-device history, survives reinstalls |
| 2026-04-09 | Increased limit from 8 to 10 | More history without the device storage constraint |

---

## 6. Pro Seller Ranking

**What it does**
Gives Dukanoh Pro sellers a ranking advantage in the home feed and browse results. Pro listings appear in the top 25% of any results list.

**Where it lives**
`utils/proRankSort.ts`

**Data it uses**
| Field | What it tells us |
|-------|-----------------|
| `users.seller_tier` | Whether the seller is `'pro'` or not |
| `listings.created_at` | Only listings under 60 days old qualify |

**How it ranks**
1. Separate listings into "eligible Pro" (seller_tier = pro AND listing < 60 days old) and "everyone else".
2. Calculate the Pro cap: `floor(total listings × 0.25)` — max 25% of slots.
3. Place the first N eligible Pro listings at the top (up to the cap).
4. Place all remaining listings after them.
5. Any Pro listings that exceed the cap drop back to their natural position (not penalised, just not promoted).

**Success metric**
Whether Pro sellers see meaningfully better tap-through rates than non-Pro sellers — this is the core value proposition of the subscription.

**Current limitations**
- The 25% cap is hardcoded — requires a code change to tune.

**Improvement ideas**
- Make the cap configurable via a Supabase config table so it can be tuned without a code deploy.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Simple Pro tier promotion with 25% cap |
| 2026-04-09 | Added seller diversity cap: max 1 listing per Pro seller in promoted slots | Ensures every active Pro seller gets a fair promoted slot. Sellers paid for the boost — this means the boost is shared fairly rather than dominated by one seller. Newest listing per seller is promoted since results arrive newest-first. |

---

## 7. Listing Boost

**What it does**
A seller feature that pushes a specific listing to the top of the Stories feed for 24 hours. Non-Pro sellers pay per boost. Pro sellers get 3 free boosts per calendar month; additional boosts beyond that are paid. All boosts (Pro and non-Pro) are fulfilled via RevenueCat (stubbed until launch).

**Where it lives**
- Boost button UI: `app/listing/[id].tsx` — only on the seller's own listing detail page
- Boost creation: `app/listing/[id].tsx` → `handleBoost` — upserts into `boosts` table
- Boost consumption (Stories): `hooks/useStories.ts` — queries `boosts` table as source of truth
- DB: `boosts` table (`listing_id`, `seller_id`, `expires_at`, `amount_paid`, `created_at`)
- Free boost tracking: `users.boosts_used`, `users.boosts_reset_at`

**Data it uses**
| Column | What it tells us |
|--------|-----------------|
| `boosts.listing_id` | Which listing is boosted |
| `boosts.expires_at` | Whether the boost is still active (> now) |
| `boosts.amount_paid` | What was paid (0 for free Pro boosts) |
| `users.seller_tier` | `'pro'` = Pro seller with free monthly allowance |
| `users.boosts_used` | How many free boosts the Pro seller has used this month |
| `users.boosts_reset_at` | When the monthly allowance last reset |

**How it ranks**
1. `useStories` queries `boosts` table for all active boosts (`expires_at > now`) → fetches those listing records.
2. Boosted listings merged at front of Stories feed before organic listings.
3. Within Stories sort: boosted + unviewed → unviewed + preferred category → unviewed → viewed.

**Seller flow**
- Seller opens their own listing detail page → sees Boost button below the listing.
- If already boosted: card shows "Xh remaining · Showing at the top of Stories" — no button.
- **Non-Pro sellers**: max 5 simultaneous active boosts. Each boost is paid (RevenueCat stub).
- **Pro sellers**: 3 free boosts per calendar month. Monthly allowance resets if `boosts_reset_at < start of this month`. After 3 free boosts, additional boosts are paid. Max 10 simultaneous active boosts.
- Boost duration: **24 hours** from time of purchase.
- On confirm: upserts `{ listing_id, seller_id, expires_at: now+24h, amount_paid: 0 }` into `boosts` table.

**Surface**
Stories feed only — not applied in home feed, browse, or search results.

**Success metric**
Whether boosted listings receive more story views and saves during the boost window than they did in the 24h before. Validates the paid feature.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Basic boost flag on listings table, surfaced in home feed |
| 2026-04-09 | Complete rearchitecture: `boosts` table as single source of truth; boost button moved exclusively to listing detail page; Seller Hub boost button removed; duration fixed to 24h; Pro 3 free/month allowance with reset logic; simultaneous cap (5 non-Pro, 10 Pro); RevenueCat stub for paid path; Stories reads from `boosts` table not `listings.is_boosted` flag | `listings.is_boosted` flag and Seller Hub path were disconnected from `useStories` — boosts from the detail page were never surfacing in Stories. Centralised to `boosts` table to have a single truth. |

---

## 8. Search tab default

**What it does**
When a user opens the Search tab, it pre-selects either the Men, Women, or All tab. The last tab they manually selected is remembered across sessions. If they have never manually selected a tab, it falls back to their onboarding gender preference.

**Where it lives**
`app/(tabs)/search.tsx` — `useEffect` on mount + `onTabChange` handler.

**Data it uses**
| Source | What it tells us |
|--------|-----------------|
| AsyncStorage `@dukanoh/search_last_tab` | Last tab the user manually selected (takes priority) |
| `users.preferred_categories` | Onboarding gender preference (fallback if no stored tab) |

**How it ranks**
1. Check AsyncStorage for `@dukanoh/search_last_tab`.
2. If a valid value exists (`Women` / `Men` / `All`) → use it immediately, no DB call.
3. Otherwise → query `users.preferred_categories`: Men only → Men tab, Women present → Women tab, else → All tab.
4. On every tab change → write new tab to AsyncStorage.

**Success metric**
Whether users stay on the pre-selected tab or immediately switch away. If they always switch, the default is wrong.

**Current limitations**
- Only Men/Women/All tabs — does not pre-filter to a specific occasion or category.
- AsyncStorage is per-device, not synced across devices.

**Improvement ideas**
- Sync last tab to `users` table so it follows the user across devices.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Onboarding preference as default (DB query on every mount) |
| 2026-04-09 | Added AsyncStorage persistence of last used tab; falls back to onboarding preference only on first visit | Users shouldn't have to re-select their tab every session. Last choice is a better signal than static onboarding data. |

---

## 9. Fuzzy text search

**What it does**
When a user types in the search bar, results are ranked by relevance to their query using fuzzy matching (tolerates typos and partial matches).

**Where it lives**
`app/listings.tsx` — lines 271–294. Uses the Fuse.js library.

**Data it uses**
Listing fields: `title`, `category`, `occasion`.

**How it ranks**
The DB query casts a broad net via `ilike` on title, category, occasion, colour, and fabric (up to 100 results). Fuse.js then re-ranks client-side by weighted relevance:

| Field | Weight |
|-------|--------|
| `title` | 55% |
| `category` | 15% |
| `occasion` | 10% |
| `colour` | 10% |
| `fabric` | 10% |

Threshold: 0.4 (results below 40% match confidence are excluded).

Note: Pro Seller Ranking is intentionally **not applied** during text search — relevance takes priority over seller tier.

**Success metric**
Whether users find what they searched for and save or buy it. A high rate of zero-result searches indicates the threshold or fields need tuning.

**Current limitations**
- Fuse.js runs client-side on results already fetched from the DB — so it can only rank what was already returned, not the full catalogue.
- `description` and `size` are not Fuse keys — searching "short" or a size won't affect ranking.
- Brand/designer name is not a dedicated field, so searching a brand name only works if it appears in the title.

**Improvement ideas**
- Move to Supabase full-text search (`pg_trgm` extension) so the search runs server-side across the full catalogue, not just the fetched page.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Fuse.js client-side fuzzy search on title, category, occasion |
| 2026-04-09 | Added `colour` (10%) and `fabric` (10%) as Fuse keys; rebalanced weights | DB query already filtered by colour/fabric via ilike but Fuse wasn't scoring them — searching "silk" returned results but in arbitrary order. Now ranked by relevance. |

---

## 10. Browse & filter sort options

**What it does**
When browsing listings with filters applied, the user can choose how results are ordered.

**Where it lives**
`app/listings.tsx` — sort logic around lines 220–265.

**Options**
| Sort option | DB order |
|-------------|----------|
| Newest first | `created_at DESC` |
| Price: Low to High | `price ASC` |
| Price: High to Low | `price DESC` |
| Most saved | `save_count DESC` |
| Most viewed | `view_count DESC` |

**Pro seller visibility**
`proRankSort` is applied on top of all sort options — Pro sellers' listings are promoted across all browse and search results. Pro seller listings additionally show a **"Featured"** badge on the listing card and on the listing detail page (next to the seller name), using `seller.seller_tier === 'pro'`.

Note: the Featured badge is separate from the boost system. Boost = Stories placement only. Pro tier = Featured badge + ranking promotion in browse/search.

**Success metric**
Which sort option users choose most often — this reveals what buyers care about most and should inform default sort order.

**Current limitations**
- Default sort is always "newest first" — there is no personalised default.
- "Most saved" and "most viewed" counts are global, not recency-weighted.

**Improvement ideas**
- Remember the user's last chosen sort option and use it as their default next time.
- Apply time decay to save_count and view_count so recent engagement matters more than old engagement.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Standard sort options with newest as default |
| 2026-04-09 | Added Featured badge on listing cards and detail page for Pro sellers (`seller_tier === 'pro'`) | Pro sellers pay for visibility — the badge makes their Pro status transparent to buyers and adds a trust signal. Separate from boost (Stories only). |

---

## Proposed future algorithms

These do not exist yet. Each needs a full spec written here before being built.

### A. "You might also like" (listing detail page)
When a buyer opens a listing, show similar listings below. Similarity based on: same category + overlapping price range + same occasion (if set). Excludes the same seller. Ordered by save_count DESC.

### B. Seller quality score
A composite score per seller combining: `rating_avg`, `rating_count`, `avg_response_time_mins`, and number of completed sales. Used to break ties in Pro Seller Ranking and potentially surface in search.

### C. Seasonal category weighting
A configurable table in Supabase that maps date ranges to category boosts (e.g. Eid window → +weight for Festive, Wedding, Partywear). Feeds into Trending Categories and Suggested for You.

### D. Price range preference
Inferred from the user's saved items: calculate their median saved price and use it to soft-filter Suggested for You (prefer listings within ±50% of their median). No onboarding required — learned passively.

### E. Size preference
If the user saves multiple items of the same size, surface more listings in that size. Similar to price range preference — passive learning from saves.

---

## Rules for changing algorithms

1. **Write the change here before touching code.** Update the relevant section, note the reason in the change log.
2. **Change one algorithm at a time.** Do not improve two simultaneously.
3. **Define the metric before changing anything.** Know what "better" looks like before you build.
4. **Check the data after shipping.** Query Supabase (`listing_views`, `saved_items`, `save_count`) to verify the change had the intended effect.
