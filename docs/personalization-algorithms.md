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
11. [Seasonal category weighting](#11-seasonal-category-weighting)
12. [Similar listings](#12-similar-listings-listing-detail-page)
13. [Dukanoh Fit](#13-dukanoh-fit)

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
1. Derive gender from onboarding: Women only → filter `listings.gender = 'Women'`; Men only → `listings.gender = 'Men'`; both or neither → no filter.
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
| 2026-09-17 | Gender filter moved from the retired gender-as-category list to the `gender` column | The old filter matched `category IN ('Women', 'Partywear', …)`, so members with a gender preference saw almost no garment listings |
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
3. Apply gender filter: skip saves whose listing's `gender` column doesn't match the user's preference (if set).
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
| 2026-09-17 | Gender filter reads `listings.gender` | It compared the category name to 'Women'/'Men', which never matched, so Trending was always empty for members with a preference |
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

---

## 11. Seasonal category weighting

**What it does**
During key cultural seasons (Eid, Diwali, wedding season), specific categories get a visibility boost in Trending Categories and Suggested for You. Managed entirely via the Supabase dashboard — no code deploy needed to add or edit a season.

**Where it lives**
- DB: `seasonal_weights` table
- `hooks/useFeed.ts` — `fetchActiveSeason()`, applied in `fetchTrendingCategories()` and `loadData()`

**Data it uses**
| Column | What it tells us |
|--------|-----------------|
| `seasonal_weights.start_date` | When the season begins |
| `seasonal_weights.end_date` | When the season ends |
| `seasonal_weights.categories` | Which categories to boost |
| `seasonal_weights.weight` | Multiplier applied to save counts (default 1.5) |

**How it works**
1. On feed load, query `seasonal_weights` for a row where `start_date <= today <= end_date`.
2. **Trending Categories**: save counts for seasonal categories are multiplied by `weight` before ranking — they naturally rise to the top during the season.
3. **Suggested for You**: seasonal categories are merged into the user's `effectiveCats` pool, so listings from those categories appear in the suggested section even if the user hasn't explicitly shown interest in them.

**How to maintain it**
Managed directly in the Supabase dashboard (`seasonal_weights` table). Add a row before each season:

| Field | Example |
|-------|---------|
| `label` | `Eid 2027` |
| `start_date` | `2027-03-20` |
| `end_date` | `2027-04-05` |
| `categories` | `{Festive,Wedding,Partywear}` |
| `weight` | `1.5` |

Only one season is active at a time (the query takes the first matching row). Rows for past seasons can be left in the table for historical reference.

**Success metric**
Whether saves and views on seasonal categories increase during the active window compared to the same period without weighting.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| 2026-04-09 | Initial implementation | South Asian fashion has strong seasonal demand peaks — Eid, Diwali, and wedding season are predictable and high-intent. Static algorithms miss this entirely. |

---

---

## 12. Similar listings (listing detail page)

**What it does**
When a buyer opens a listing, shows up to 4 similar listings below. Surfaces the most relevant alternatives to help buyers find what they're looking for even if this specific listing doesn't work for them.

**Where it lives**
`app/listing/[id].tsx` — `simQ` query + client-side occasion sort, around lines 133–185.

**Data it uses**
| Signal | What it tells us |
|--------|-----------------|
| `listings.category` | Primary match — same category only |
| `listings.occasion` | Secondary match — occasion-matched listings shown first |
| `listings.save_count` | Popularity signal — most saved shown first within each group |

**How it ranks**
1. Fetch up to 20 listings in the same category, ordered by `save_count DESC`, excluding the current listing and same seller.
2. Client-side: split into occasion-match group and remainder (both already save_count ordered).
3. Return `[...occasionMatches, ...rest].slice(0, 4)`.
4. If the listing has no occasion set, all results are treated as one group ordered by save_count.

**Success metric**
Whether buyers who see similar listings tap through and save or purchase one. A high tap-through rate validates relevance.

**Current limitations**
- Only 4 listings shown — enough for a compact section but may miss better matches.
- No price range filter — intentional, similar pieces vary widely in price.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| — | Initial implementation | Same category, newest first, limit 4 |
| 2026-04-09 | Order by `save_count DESC`; fetch 20, prioritise occasion matches client-side, slice to 4; added `seller_tier` to select for Featured badge | Newest first surfaced low-engagement listings. Save count is a better proxy for what buyers actually want. Occasion matching surfaces more relevant alternatives. |

---

## 13. Dukanoh Fit

**What it does**
A buyer-facing outfit matching tool. The member photographs a clothing piece they own; AWS Rekognition validates it is clothing and auto-detects the category and colour. The member confirms or overrides the form (category, who it's for, colour, optional occasion and fabric weight), then the algorithm finds complementary listings from the platform's inventory.

**Where it lives**
- Screen: `app/dukanoh-fit.tsx`
- Intro sheet + photo check: `components/DukanohFitSheet.tsx`
- Matching logic: `utils/styleMatch.ts` (tests: `__tests__/styleMatch.test.ts`)
- Clothing validation: `supabase/functions/validate-clothing/index.ts` (AWS Rekognition; pure logic in `_lib.ts`, tests in `__tests__/validateClothing.test.ts`)
- Training photos: `supabase/functions/store-training-image/index.ts` → S3 bucket `dukanoh-fit-training`, tracked in `fit_training_images`
- Entry points: camera icon in search bar (`app/(tabs)/search.tsx`), nudge card on home feed (`app/(tabs)/index.tsx`), and the `dukanoh-fit` deep-link destination for app stories / broadcasts

**Data it uses**
| Source | What it tells us |
|--------|-----------------|
| AWS Rekognition `DetectLabels` | Whether the photo is clothing; detected category and dominant colour |
| `listings.category` | Complementary category filter |
| `listings.gender` | Who the piece is for — hard filter, so a Sherwani search never returns women's Salwars |
| `listings.colour` | Colour compatibility filter and score |
| `listings.occasion` | Occasion scoring signal |
| `listings.fabric` | Mapped to a fabric weight (Light / Structured / Heavy) for scoring — there is no `fabric_weight` column |
| `listings.save_count` | Popularity signal |
| `users.seller_tier` | Pro seller ranking |
| `users.tax_hold` | Tax-held sellers are excluded — their pieces can't be bought |

**How it works — validation**
1. Member takes a photo. Image is compressed to 800px wide, 0.7 JPEG quality, sent as base64 to the `validate-clothing` Edge Function.
2. Rekognition `DetectLabels` runs with `MinConfidence: 60`, `MaxLabels: 30`, features `GENERAL_LABELS` + `IMAGE_PROPERTIES`.
3. A label is classified as clothing if its `Name` is in the root set (`Clothing`, `Apparel`, `Silk`, `Saree` etc.) **or** any of its `Parents` has `Name: 'Clothing'` or `Name: 'Apparel'`. This catches generic Western labels like `Dress` or `Shirt` which Rekognition returns with `Clothing` as a parent rather than as a top-level label.
4. If not clothing → member is shown an alert and asked to retake. If clothing → form is pre-filled with detected category and colour; member can override either.
5. If the check itself fails (network, Rekognition down — the function returns 503 `validation_unavailable`), the member is told the photo couldn't be checked and to try again. A failed check is never reported as "not clothing". The sell form, which calls the same function, fails open.
6. After a search runs, the photo is uploaded once, in the background, to S3 for training (`store-training-image`, capped at 200 per category, stored with no link to the member). The sheet discloses this and the privacy policy covers it.

**How it works — who it's for**
Single-gender categories settle it (Lehenga → Women, Sherwani → Men — from `CategoriesByGender` in `constants/theme.ts`). Kurta and Salwar are listed under both genders, so the form asks "Who's it for?". The listings query filters on `gender`, so cross-gender suggestions cannot appear.

**How it ranks — matching**
1. Look up complementary categories for the base piece using `COMPLEMENTARY_CATEGORIES` map (e.g. Lehenga → Dupatta, Blouse).
2. **Strict pass**: fetch top 100 listings by `save_count DESC` in complementary categories, matching gender, status = available, excluding own listings and blocked sellers, and **only colour-compatible pieces**. Beige and White are compatible with every base colour. A neutral base colour (Beige, White, Other) applies no colour filter at all.
3. **Widen pass**: if the strict pass returns fewer than `MIN_STRICT_RESULTS` (8), fetch up to 50 more pieces whose colour is unset, 'Other', or outside the compatible set. The results screen tells the member the search was widened.
4. Drop pieces from tax-held sellers.
5. Score each listing client-side:

| Signal | Points |
|--------|--------|
| Occasion matches exactly | +3 |
| Colour is a primary compatible match | +2 |
| Colour is a secondary compatible match (incl. Beige / White) | +1 |
| Fabric weight (from `listings.fabric`) is compatible | +1 |
| `save_count` ≥ 5 (popularity boost) | +1 |

6. Sort: colour-compatible pieces first, then score descending, then `save_count` descending.
7. Apply seller diversity cap: max 2 listings per seller.
8. Apply Pro Seller Ranking (`proRankSort`).

**Complementary categories**
Defined in `utils/styleMatch.ts` (`COMPLEMENTARY_CATEGORIES`). Each base category maps to what should be paired with it:

| Base | Suggests |
|------|---------|
| Lehenga | Dupatta, Blouse, Jewellery, Accessories |
| Saree | Blouse, Jewellery, Accessories |
| Anarkali | Dupatta, Salwar, Sharara, Jewellery |
| Salwar Kameez | Dupatta, Jewellery, Accessories |
| Kurta | Dupatta, Salwar, Sharara, Nehru Jacket, Jewellery |
| Sharara | Kurta, Anarkali, Dupatta, Jewellery |
| Gown | Jewellery, Accessories, Dupatta |
| Dupatta | Lehenga, Anarkali, Salwar Kameez, Kurta, Saree |
| Blouse | Saree, Lehenga |
| Salwar | Kurta, Achkan, Sherwani, Pathani Suit |
| Sherwani | Kurta, Salwar, Accessories, Jewellery |
| Kurta Pajama | Nehru Jacket, Accessories |
| Achkan | Kurta, Salwar, Accessories |
| Pathani Suit | Salwar, Accessories |
| Nehru Jacket | Kurta, Kurta Pajama |
| Jewellery | Lehenga, Saree, Anarkali, Salwar Kameez, Gown, Sharara, Sherwani |
| Accessories | Lehenga, Saree, Salwar Kameez, Gown, Sherwani, Achkan, Kurta Pajama |

The gender filter trims these per search: a men's Kurta only ever gets Salwar and Nehru Jacket; a women's Kurta gets Dupatta, Salwar and Sharara.

**Colour compatibility**
Defined in `utils/styleMatch.ts` (`COLOUR_MAP`). Two tiers — primary (+2) and secondary (+1). Cream and White are neutral: as a base they apply no filter, and as a candidate they are added as secondary for every base unless the map already ranks them primary. Nineteen colours since the 2026-09-17 refresh (Cream replaced Beige).

| Base colour | Primary matches | Secondary matches |
|-------------|----------------|-----------------|
| Red | Gold, Maroon, Green | Pink, Black, Orange, Navy, Cream, White |
| Maroon | Gold, Pink, Cream | Red, Peach, Green, Silver, White |
| Pink | Gold, Cream, Silver | Red, Multi, Peach, Green, Teal, White |
| Peach | Gold, Cream, Teal | Pink, Green, Silver, Maroon, White |
| Orange | Gold, Cream, Navy | Green, Pink, Teal, Red, White |
| Yellow | Gold, Green, Navy | Pink, Purple, Orange, Cream, White |
| Gold | Red, Maroon, Green, Navy, Purple | Blue, Pink, Teal, Black, Orange, Cream, White |
| Green | Gold, Cream, Pink | Multi, Yellow, Orange, Peach, Maroon, White |
| Teal | Gold, Cream, Peach | Pink, Orange, Silver, Navy, White |
| Blue | Gold, Cream, Silver | Multi, Peach, Pink, Navy, White |
| Navy | Gold, Cream, Silver | Red, Orange, Yellow, Pink, Teal, White |
| Purple | Gold, Silver, Cream | Pink, Yellow, Green, Grey, White |
| Black | Gold, White, Silver | Cream, Multi, Red, Pink, Grey |
| Grey | Silver, Pink, Navy | Black, Teal, Purple, Maroon, Cream, White |
| Silver | Navy, Purple, Black | Blue, Pink, Grey, Teal, Cream, White |
| Multi | Cream, White, Black, Gold | Silver |
| Cream / White / Other | — (neutral, matches everything) | — |

**Fabric weight**
Sellers pick a fabric, not a weight. `fabricToWeight()` maps it: Chiffon / Georgette / Net / Lawn / Satin / Crepe → Light; Silk / Cotton / Linen / Organza → Structured; Velvet / Brocade → Heavy; Other or unset → no weight (signal skipped).

**Rate limiting**
10 searches per member per calendar day, enforced server-side via the `record_fit_search()` Postgres RPC. Uses `pg_advisory_xact_lock` to atomically check-and-insert — no race condition. Resets at midnight UTC (calendar day boundary in the DB). The RPC rejects unauthenticated callers and is granted to `authenticated` only. A transport error from the RPC is shown as a connection problem, never as the daily limit.

**Success metric**
Tap-through. `fit_result_taps` records every result a member opens (user, listing, time). Tap-through rate = taps ÷ rows in `fit_search_logs`; join taps to `saved_items` / `orders` on `listing_id` + `user_id` to see whether tapped pieces were saved or bought. A high abandon rate after seeing results suggests the matches aren't relevant enough.

**Data foundation (2026-09-18)**
The parts of the Fit rebuild that no engine swap touches:

| Piece | Where | What it does |
|-------|-------|--------------|
| `garment_labels` | table | Every labelled photo. Listing photos arrive by trigger with the seller's labels; Fit photos arrive from `store-training-image` with the member's confirmed labels and the engine's guess copied in as plain values; seed images carry a licence. `corrected` is generated: the engine guessed a different category from the one confirmed. |
| `recognition_events` | table | One row per engine call from `validate-clothing`: who asked, engine and version, outcome, answer, confidence, whether a person was in frame, latency. No image, no reference from any stored photo. |
| `platform_settings.recognition_engine` | row | The engine switch. `rekognition` today. `validate-clothing` reads it per call; an unknown value is recorded and Rekognition still answers. |
| `recognition_accuracy` | view | Per engine, per source, per week: predictions, category correct, colour compared, colour correct. From confirmed labels vs. the guess stored next to them. |

Privacy rules, enforced in code and constraints: a Fit row never carries a member id or listing id (`garment_labels_fit_rows_unlinked`); a photo with a person in frame is used for the search and never stored (`detectHasPerson` → `validateSubmission` refuses it); listing rows leave with the listing or the seller (`anonymize_user_account`). Retention for Fit copies is the privacy policy's figure; nothing enforces it yet — that is an S3 lifecycle rule until the move to Supabase Storage, then a scheduled delete.

The contract `validate-clothing` answers with is `{ isClothing, detectedCategory, detectedColour, engine, engineVersion, confidence, hasPerson }`. The Fit sheet passes `source: 'fit'`; the sell form's calls are `sell`.

**Current limitations**
- Rekognition is a Western-trained model — South Asian garments (lehenga, sherwani) are rarely identified by name. The function falls back to Western equivalents (Dress → Lehenga, Suit → Sherwani) which are close but not exact.
- No price range signal — the algorithm doesn't try to match the price tier of the uploaded piece.
- Colour detection is from the full image, not just the garment — background colour can skew the dominant colour result.
- Colour and fabric are optional on the sell form. Pieces without a colour only appear via the widen pass; pieces without a fabric never earn the fabric-weight point.
- Camera only — a member can't pick an existing photo from their library.
- The training upload has never been observed succeeding in production (`fit_training_images` is empty despite logged searches); the S3 bucket needs a manual check.

**Improvement ideas**
- **Price tier matching**: infer a price band from the photo (e.g. fabric richness, embroidery) and filter suggestions to a similar range.
- **Size preference**: if the member's profile has a saved size, prioritise listings in that size.
- **Choose from library**: let members match a photo they already have.

**Change log**
| Date | Change | Reason |
|------|--------|--------|
| 2026-04-09 | Initial implementation | Feature launch |
| 2026-04-09 | Upgraded clothing detection to use Rekognition label `Parents` hierarchy instead of flat name matching | Rekognition returns `Dress` (parent: Clothing) not `Clothing` directly — flat matching caused almost all clothing to be rejected |
| 2026-04-09 | Lowered `MinConfidence` from 70 to 60, raised `MaxLabels` from 20 to 30 | More lenient threshold reduces false rejections on borderline images |
| 2026-04-09 | Occasion demoted from hard DB filter to scoring signal (+3) | Hard filter returned too few results when inventory is thin; occasion-matched pieces still rank first |
| 2026-04-09 | Added popularity boost: +1 if `save_count` ≥ 5 | Well-loved listings are a trust signal; mild boost doesn't override colour relevance |
| 2026-04-09 | Expanded complementary categories: Anarkali → Salwar/Sharara; Sherwani/Achkan → Kurta | Missing pairings meant valid outfit combinations were never surfaced |
| 2026-04-09 | Increased fetch limit from 50 to 100 | More candidates to score from now that occasion isn't filtering server-side |
| 2026-04-10 | Rate limiting moved from AsyncStorage (client-only) to server-side `record_fit_search()` RPC with advisory lock | Client-side limit was trivially bypassable; server-side is authoritative and race-condition-free |
| 2026-04-10 | Added JWT auth to `validate-clothing` and `store-training-image` Edge Functions | Functions were publicly callable without authentication, exposing free AWS Rekognition access |
| 2026-04-10 | Removed recent looks feature | Simplified form flow; feature added complexity without clear user value at this stage |
| 2026-09-16 | Gender filter on the listings query; form asks "Who's it for?" when the category is Kurta or Salwar | No gender was ever applied — a Sherwani search returned women's Salwars, a men's Kurta search only women's Salwars |
| 2026-09-16 | Beige / White compatible with every base colour; widen pass when fewer than 8 strict results, with a note on the results screen | Colour hard filter emptied results on a thin catalogue (9 of 17 live pieces had colour Other or unset; Red and Gold bases also excluded White) |
| 2026-09-16 | Fabric weight derived from `listings.fabric` via `fabricToWeight()` | Scoring always received `undefined` — the form's fabric-weight input did nothing; docs referenced a `fabric_weight` column that doesn't exist |
| 2026-09-16 | Tax-held sellers excluded | Matches feed / stories / listings; their pieces can't be bought, so the detail page was a dead end |
| 2026-09-16 | `validate-clothing` returns 503 when Rekognition fails and imports its tested `_lib.ts`; the sheet distinguishes "couldn't check" from "not clothing"; RPC transport errors no longer shown as the daily limit | Server failures were being reported to members as verdicts on their photo or their quota |
| 2026-09-16 | Results header and Android back return to the form; query failure shows a retry state; training upload once per photo and only after a search ran; home nudge card has an explicit dismiss and stays until Fit is used | UX gaps from the launch review |
| 2026-09-16 | `fit_result_taps` table; sheet discloses the training copy; camera permission string covers Fit | Success metric was unmeasurable; photo retention was undisclosed; purpose string only mentioned listings |
| 2026-09-16 | `record_fit_search()` guards `auth.uid()` and is granted to `authenticated` only | Predated the June default-deny; was executable by anon |
| 2026-09-17 | Taxonomy refresh: + Salwar Kameez, Gown, Kurta Pajama, Jewellery, Accessories; 19 colours (Cream replaces Beige); + Lawn, Organza, Satin, Crepe; + Festive; every category has a one-line definition; lists pinned by DB constraints | The three-piece suit had no category, 9 of 17 live pieces were colour 'Other', and free-text columns let a retired category survive |
| 2026-09-18 | Recognition foundation: `garment_labels` fed by listings (trigger) and Fit confirmations, `recognition_events` prediction log, `recognition_engine` setting, `recognition_accuracy` view; Fit photos stored unlinked and never with a person in frame; the 200-per-category cap removed; `fit_training_images` superseded | Build the dataset and scoreboard before swapping engines, so the swap is a setting and every engine is measured against confirmed labels |

---

## Rules for changing algorithms

1. **Write the change here before touching code.** Update the relevant section, note the reason in the change log.
2. **Change one algorithm at a time.** Do not improve two simultaneously.
3. **Define the metric before changing anything.** Know what "better" looks like before you build.
4. **Check the data after shipping.** Query Supabase (`listing_views`, `saved_items`, `save_count`) to verify the change had the intended effect.
