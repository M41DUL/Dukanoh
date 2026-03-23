# Browse & Discover Journey — How It All Works

A beginner-friendly guide to how browsing and searching works in Dukanoh. Use this as a reference when you need to understand how users find listings, how the search tab is structured, how filters work, and how the "See All" listings page connects to the search experience.

---

## The Big Picture

```
User taps Search tab
       |
  Browse directory appears (Women / Men / All tabs)
       |
   +---+---+---+
   |       |       |
 Tap a   Tap an   Type a
category occasion  search term
   |       |       |
   v       v       v
Results page (same screen, different mode)
   |
   | Sub-tabs for cross-filtering
   | Filter & Sort (full-screen bottom sheet)
   |
   v
Tap a listing → Listing detail screen
```

The search tab has two modes: **browse mode** (the directory) and **results mode** (the listing grid). They live in the same screen — no navigation happens. This means transitions are instant and the back gesture just flips back to browse mode.

---

## Key Files — What Lives Where

| File | What it does |
|------|-------------|
| `app/(tabs)/search.tsx` | The main search screen. Contains browse directory, results grid, sub-tabs, filter sheet, and all search logic. |
| `app/listings.tsx` | The "See All" screen accessed from the home tab. Same filter/sort UI as search results. |
| `components/SearchBar.tsx` | Animated search bar with typing placeholder, focus/blur transitions, cancel button, and inline search history. |
| `components/SearchHistoryDropdown.tsx` | Recent searches and popular search terms, displayed inline below the search bar when focused. |
| `hooks/useSearchHistory.ts` | Manages recent search history in AsyncStorage. Provides `saveSearch`, `removeSearch`, `clearSearches`, `filteredRecent`. |
| `components/BottomSheet.tsx` | Reusable bottom sheet. Extended with `fullScreen` prop for the filter page (uses a transparent Modal container). |
| `components/Radio.tsx` | Circle radio selector component — used for single-select options like Sort by. |
| `components/Checkbox.tsx` | Square checkbox component — used for multi-select options like Size, Occasion, Condition, Price. |
| `components/Button.tsx` | Shared button component — used for Reset/Apply in the filter footer. |
| `components/ListingCard.tsx` | Listing card with `highlightTerm` prop that bolds matched search terms in titles. |
| `components/Divider.tsx` | Horizontal divider used between filter sections. |

---

## Flow 1: Browsing the Directory

```
Search tab loads
    |
    | Default tab set from user's onboarding preferences
    | (Women if they picked Women, Men if Men-only, else All)
    v
Browse directory
    |
    | Women / Men / All tabs at the top
    | Each tab shows its categories and occasions
    v
User taps a category (e.g. "Lehenga")
    |
    v
Results mode activates (same screen)
    |
    | Title shows "Lehenga"
    | Sub-tabs show occasions: All, Everyday, Eid, Diwali, Wedding...
    | Listings fetched from Supabase filtered by category
    v
User taps a listing → navigates to /listing/[id]
```

### Tab system

The browse directory has three tabs, each with their own categories and occasions:

- **Women**: Lehenga, Saree, Anarkali, Kurta, Casualwear, Shoes
- **Men**: Sherwani, Kurta, Achkan, Pathani Suit, Casualwear, Shoes
- **All**: Combined list of all categories

Switching tabs plays a fade animation (120ms out, 180ms in) using `Animated.timing`.

### Hero banners

Between the categories and occasions, there are hero banner images (`hero-banner-1.png`, `hero-banner-2.png`) that link to category or occasion results. The banner shown depends on the active tab.

---

## Flow 2: Searching

```
User taps the search bar
    |
    | Search bar focuses — cancel button slides in
    | Search history dropdown appears (recent + popular)
    | Feed content hides
    v
User types a search term
    |
    | Recent searches filter as they type
    v
User submits (keyboard search button or taps a history item)
    |
    | Term saved to search history
    v
Results mode activates
    |
    | Title shows "term" (in quotes)
    | No sub-tabs for text searches
    | Results fetched with fuzzy matching (Fuse.js)
    v
Listing titles highlight the matched search term in bold
```

### Search bar animation

- **Enter focus**: 250ms fade-in, cancel button slides from right
- **Exit focus**: 120ms fade-out (intentionally quick so it feels snappy)
- Uses `Animated` API (not LayoutAnimation) for reliability with New Architecture

### Animated placeholder

When the search bar is empty and unfocused, a typing animation cycles through example terms:
"Search for lehenga", "Search for salwar kameez", "Search for Eid kurta", etc.

This is driven by a `setTimeout` chain with typing (80ms/char), holding (1500ms), and deleting (40ms/char) phases.

### Search from the Home tab

When a user searches from the home tab's search bar, they're navigated to the search tab with a `q` param:
```
router.push({ pathname: '/(tabs)/search', params: { q: query } })
```

The search tab reads this param and auto-triggers results mode — so there's **one search experience**, not two.

---

## Flow 3: Results Page

```
Results mode
    |
    | Header: ← back | Title (centered) | Filter icon
    |
    | Sub-tabs (if applicable):
    |   Browsing a category → occasion sub-tabs
    |   Browsing an occasion → category sub-tabs
    |   Text search → no sub-tabs
    |
    | 2-column grid of ListingCards
    | Skeleton loading while fetching
    | Pull-to-refresh
    | Infinite scroll pagination (20 per page)
    v
Empty state if no results:
    Category browse: "Be the first to list a {category}!" + "Start selling" CTA
    Other: "Try adjusting your filters or search term."
```

### Sub-tabs

Sub-tabs provide cross-filtering without opening the filter sheet:

- **Browsing "Lehenga"** (a category) → sub-tabs show occasions: All, Everyday, Eid, Wedding...
- **Browsing "Wedding"** (an occasion) → sub-tabs show categories: All, Lehenga, Saree, Sherwani...
- **Text search** → no sub-tabs

The sub-tabs use an underline style matching the main Women/Men/All tabs.

### Swipe-back gesture

Since results mode is state-driven (not a stack screen), there's a custom PanResponder that detects a rightward swipe from the left edge (within 30px) and triggers `exitResults` if the swipe exceeds 80px.

### Query preservation

When the user goes back from results to browse, the search query stays in the search bar so they can easily search again or modify their term. Filters and sort are reset.

---

## Flow 4: Filter & Sort

```
User taps filter icon (top-right of results header)
    |
    v
Full-screen bottom sheet slides up (uses BottomSheet with fullScreen prop)
    |
    | Drag handle (visual only — close via X button)
    |
    | SORT BY ←── Radio selectors (single select)
    |   Newest first, Price: Low to High, Price: High to Low,
    |   Most saved, Most viewed
    |
    | SIZE ←── Checkbox selectors (multi-select)
    |   XS, S, M, L, XL, XXL, 6, 8, 10, 12, 14, 16
    |
    | OCCASION ←── Checkbox selectors
    |   Everyday, Eid, Diwali, Wedding, Mehndi, Party, Formal
    |
    | CONDITION ←── Checkbox selectors
    |   New, Excellent, Good, Fair
    |
    | PRICE ←── Checkbox selectors (single select behaviour)
    |   Under £25, £25–£75, £75–£150, £150+
    |
    | Footer: [Reset (count)] [Apply]
    v
User taps Apply
    |
    | Sub-tab resets to "All" (avoids conflicting filters)
    | Sheet closes
    | Results re-fetch with new filters
    v
Filter icon shows a primary-coloured dot badge when filters are active
```

### How the BottomSheet fullScreen mode works

The `BottomSheet` component has a `fullScreen` prop that:
1. Wraps the content in a transparent `Modal` (so it renders above the tab bar and everything else)
2. Sets the sheet to fill from `insets.top` to the bottom of the screen
3. Disables swipe-to-dismiss (content is scrollable, so swipe would conflict)
4. Shows the drag handle for visual consistency, but close is via the X button

### Filter count badge

The filter icon in the header shows a small primary-coloured dot when any filters are active. The count includes:
- Number of active sizes + occasions + conditions + price range
- Plus 1 if sort is not "newest" (the default)
- The preset occasion (when browsing an occasion) is excluded from the count

### Radio vs Checkbox components

| Component | Selector style | Selection | Used for |
|-----------|---------------|-----------|----------|
| `Radio` | Circle with filled dot | Single select | Sort by |
| `Checkbox` | Square with checkmark | Multi-select | Size, Occasion, Condition, Price |

Both use `colors.primary` for the active state and place the selector on the left with the label on the right (Nike-style).

---

## Flow 5: "See All" Listings Page

```
Home tab
    |
    | "Suggested for you" → See all
    | "New arrivals" → See all
    | Trending category tile tap
    | Story CTA tap
    v
app/listings.tsx
    |
    | Same header style: ← back | Title | Filter icon
    | Same full-screen filter sheet (Radio + Checkbox)
    | Same skeleton loading + pull-to-refresh
    | Search term highlighting (when navigated from home search)
    v
Identical experience to search results
```

### Navigation params

| Source | Params passed |
|--------|-------------|
| "Suggested for you" See all | `title: "Suggested for you"`, `categories: "Women,Lehenga,Saree"` (from preferences) |
| "New arrivals" See all | `title: "New arrivals"` (no category filter) |
| Trending category tile | `title: "Lehenga"`, `categories: "Lehenga"` |
| Story CTA | No params (defaults to `title: "Listings"`) |

The listings page does **not** have sub-tabs (unlike search results) because the navigation context is more varied — some have categories, some don't.

---

## How Fetching Works

### Supabase query building

Both `search.tsx` and `listings.tsx` build queries the same way:

1. Start with `listings` table, join `users` for seller info
2. Filter by `status = 'available'`
3. Apply category/occasion/condition filters via `.eq()` or `.in()`
4. Apply size filter via `.ilike()` (single size) or client-side (multi-size)
5. Apply price range via `.gte()` and `.lte()`
6. Apply text search via `.or()` across title, category, and occasion
7. Order by the selected sort column
8. Paginate with `.range()`

### Text search specifics

- Text searches fetch up to 100 results in one go (no pagination)
- Results are re-ranked client-side using **Fuse.js** (fuzzy matching) with weights: title (0.6), category (0.2), occasion (0.2)
- Matched terms are highlighted in bold in the listing card title using the `HighlightedText` component inside `ListingCard`

### Pagination

- Category/occasion browsing uses infinite scroll with 20 items per page
- `onEndReachedThreshold: 0.5` triggers loading the next page when halfway through the list
- A `LoadingSpinner` shows at the bottom while loading more

---

## Supabase Columns Used

| Column | Used for |
|--------|----------|
| `listings.category` | Category filtering and sub-tab filtering |
| `listings.occasion` | Occasion filtering and sub-tab filtering |
| `listings.condition` | Condition filter |
| `listings.size` | Size filter (ilike for flexible matching) |
| `listings.price` | Price range filter and price sorting |
| `listings.save_count` | "Most saved" sort option (updated via database trigger on saves table) |
| `listings.view_count` | "Most viewed" sort option (updated via `increment_view_count` function) |
| `listings.created_at` | "Newest first" sort (default) |
| `listings.status` | Only `'available'` listings are shown |
| `users.preferred_categories` | Sets default browse tab (Women/Men/All) |

---

## Quick Reference: Component → Purpose

| Component | Where it's used | What it does |
|-----------|----------------|-------------|
| `SearchBar` | Search tab (browse mode), Home tab | Animated search input with history |
| `SearchHistoryDropdown` | Inside SearchBar | Recent + popular search terms |
| `BottomSheet` (fullScreen) | Search tab, Listings page | Filter & Sort sheet |
| `Radio` | Filter sheet | Single-select sort options |
| `Checkbox` | Filter sheet | Multi-select filter options |
| `Button` | Filter sheet footer | Reset and Apply actions |
| `ListingCard` | Results grid | Listing display with optional highlight |
| `SkeletonCard/Grid` | Results loading state | Pulsing placeholder cards |
| `EmptyState` | No results | Contextual empty messaging |
| `Divider` | Filter sheet sections | Visual separator |
