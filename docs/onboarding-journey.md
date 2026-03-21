# Onboarding Journey — How It All Works

A beginner-friendly guide to how onboarding works in Dukanoh. Use this as a reference when you need to understand what happens after a user signs up, how categories get saved, and how the feed gets personalised.

---

## The Big Picture

```
User signs up (new account created)
       |
  Root layout checks onboarding_completed
       |
  onboarding_completed is false
       |
  Redirects to /onboarding
       |
  Welcome bottom sheet appears over the category screen
       |
  User taps "Get started" → sheet closes
       |
  User taps category bubbles to pick what they like
       |
  Taps "Show me my feed"
       |
  Categories saved to database + onboarding_completed = true
       |
  Redirects to /(tabs)/ (home feed)
```

Onboarding only happens once — after that, the user goes straight to the home feed every time they open the app. They can reset it from Profile if they want to change their preferences.

---

## Key Files — What Lives Where

| File | What it does |
|------|-------------|
| `app/onboarding.tsx` | The onboarding screen. Single file with the category selector, welcome sheet, animations, and save logic. |
| `app/_layout.tsx` | Root layout. Checks `onboardingCompleted` and redirects new users to `/onboarding`. |
| `hooks/useAuth.ts` | Fetches `onboarding_completed` from the `users` table and exposes it. Also provides `refreshProfile()`. |
| `app/(tabs)/profile.tsx` | Has the "Reset feed preferences" button that sends users back to onboarding with `?reset=true`. |
| `components/BottomSheet.tsx` | Reusable bottom sheet component used for the welcome overlay. |
| `components/Button.tsx` | Shared button component used for "Get started" and "Show me my feed". |
| `constants/theme.ts` | Defines the `Categories` array, colour tokens, typography, and spacing used throughout. |
| `constants/logoLayout.ts` | Logo dimensions and position calculations for the watermark background. |

---

## Flow 1: First-Time User (After Signup)

```
Signup completes → session created
    |
Root layout detects session
    |
    | onboarding_completed = false (new user)
    v
Redirects to /onboarding
    |
  Bubbles animate in (centre-out stagger)
  Shimmer sweeps across the hero card
    |
  400ms later → welcome bottom sheet slides up
    |
    | "Let's personalise your feed"
    | "Dukanoh is built around what you love..."
    |
  User taps "Get started"
    |
  Sheet closes → bubbles are visible and tappable
    |
  User taps bubbles to select categories
    |
    | Haptic feedback on each tap
    | Confetti burst on selection
    | Colour fades to green (secondary)
    | Float animation on selected bubbles
    | Dynamic subtitle updates count
    |
  Taps "Show me my feed" (enabled when >= 1 selected)
    |
App calls supabase update on users table:
    | preferred_categories = ['Partywear', 'Wedding', ...]
    | onboarding_completed = true
    |
Redirects to /(tabs)/ (home)
```

### What happens behind the scenes

1. **Category bubbles** — The 10 categories (everything except "All") are laid out as circular bubbles using percentage-based positioning. Each bubble has a pre-defined position and size in the `CATEGORY_LAYOUT` array.

2. **Supabase update** — When the user taps "Show me my feed", the app updates two fields in the `users` table:
   - `preferred_categories` — an array of the categories they picked (e.g. `['Partywear', 'Wedding', 'Festive']`)
   - `onboarding_completed` — set to `true` so they never see onboarding again

3. **Root layout redirect** — After the update, `router.replace('/(tabs)/')` sends them to the home feed. The home feed uses `preferred_categories` to show relevant listings first.

---

## Flow 2: Profile Reset (Returning User)

```
Profile tab → "Reset feed preferences" button
    |
    | Alert asks "Are you sure?"
    v
User taps "Reset"
    |
App updates users table:
    | preferred_categories = []
    | onboarding_completed = false
    |
  refreshProfile() called (re-reads from DB)
    |
  router.replace('/onboarding?reset=true')
    |
Onboarding screen loads
    |
    | ?reset=true detected → welcome sheet is SKIPPED
    | Bubbles animate in immediately
    |
User picks categories → taps "Show me my feed" → back to home
```

### Why the reset param matters

When a returning user resets their preferences, they already know how the app works — they don't need the "Let's personalise your feed" welcome sheet again. The `?reset=true` query parameter tells the onboarding screen to skip it and go straight to category selection.

The param is read using `useLocalSearchParams<{ reset?: string }>()` from expo-router.

---

## How the Redirect Logic Works

### Getting to onboarding

In `app/_layout.tsx`, there are two effects that handle routing:

**Effect 1 (initial load):** When the splash animation finishes, checks if there's a session. If yes, checks `onboardingCompleted`. If `false`, redirects to `/onboarding`.

**Effect 2 (ongoing changes):** Watches for session changes after the splash is gone. If a session appears and `onboardingCompleted` is `false`, redirects to onboarding. This handles the signup case — session appears mid-app.

### Leaving onboarding

After saving preferences, `router.replace('/(tabs)/')` navigates to the home feed. Using `replace` (not `push`) means onboarding is removed from the navigation stack — the user can't swipe back to it.

### Android back button

The onboarding screen adds a `BackHandler` listener that returns `true` (consumes the event). This prevents the user from accidentally exiting the app by pressing the Android hardware back button during onboarding.

---

## The Category Bubbles — How They Work

### Layout

Each bubble has three properties defined in `CATEGORY_LAYOUT`:
- `left` — horizontal position as a fraction (0 = left edge, 1 = right edge)
- `top` — vertical position as a fraction (0 = top of the area, 1 = bottom)
- `size` — base diameter in pixels (scaled relative to screen width)

Bubbles are positioned absolutely inside a measured container. The container's height is captured via `onLayout`, and the `top` fraction is multiplied by that height.

### Responsive sizing

Bubble sizes scale with screen width using a ratio: `scaledSize = layout.size * (screenWidth / 390)`. 390px is the iPhone 14 baseline. On a wider screen, bubbles grow proportionally; on a narrower screen, they shrink.

### Categories

The 10 onboarding categories (from `constants/theme.ts`):
```
Men, Women, Casualwear, Partywear, Festive,
Formal, Achkan, Wedding, Pathani Suit, Shoes
```

"All" is excluded — it's a filter option for the home feed, not a preference.

---

## Animations — What Happens and When

| Animation | When | How |
|-----------|------|-----|
| **Centre-out stagger** | Bubbles first appear | Bubbles closer to the centre of the card appear first (200ms delay), outer bubbles appear later (up to 1000ms). Creates a ripple effect. |
| **Shimmer sweep** | First 2 seconds | A white highlight sweeps across the hero card like a loading skeleton. Stops after 2 seconds. |
| **Colour fade** | On selection | Bubble background smoothly transitions from `surface` grey to `secondary` green over 250ms. Uses `Animated.Value.interpolate()` with `useNativeDriver: false` (colour can't use native driver). |
| **Confetti burst** | On selection | 6 coloured particles burst outward from the centre of the bubble and fade out over 500ms. |
| **Float** | While selected | Selected bubbles gently bob up and down (4px) in a continuous loop. Stops when deselected. |
| **Bounce press** | On tap | Bubble squishes to 85% scale then springs back. Gives tactile feedback alongside haptics. |
| **Deselect shrink** | On deselection | Bubble shrinks to 90% then springs back to 100%. Subtler than the select animation. |
| **Haptic feedback** | On every tap | `Haptics.selectionAsync()` fires a light haptic vibration. |

### Native driver rules

- `useNativeDriver: true` — Used for `transform` (scale, translateY) and `opacity`. These run on the GPU, no jank.
- `useNativeDriver: false` — Used for `backgroundColor` and `borderColor` interpolation. These must run on the JS thread because the native driver can't animate colours.

---

## Error Handling

### Network timeout

The save operation uses `Promise.race` with an 8-second timeout:

```
Promise.race([
  actual save operation,
  8-second timeout that rejects
])
```

If the network is slow, the user sees: "Taking too long. Check your connection and try again."

### General errors

If the Supabase update fails for any other reason, the user sees: "Something went wrong. Please try again."

### Double-tap guard

The `saving` state prevents the save function from running twice if the user taps the button quickly. The button also shows a loading spinner while saving.

---

## Database — What Gets Updated

When the user completes onboarding, one row in the `users` table is updated:

```
public.users
├── preferred_categories: ['Partywear', 'Wedding', 'Festive']  ← user's picks
├── onboarding_completed: true                                  ← gate flag
└── (everything else stays the same)
```

When a user resets from Profile, the same row is updated:

```
public.users
├── preferred_categories: []      ← cleared
├── onboarding_completed: false   ← reset so they see onboarding again
```

### RLS (Row Level Security)

The update works because of this policy on the `users` table:

```sql
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND ...);
```

Users can only update their own row. The `WITH CHECK` clause also prevents them from modifying `rating_avg` and `rating_count` directly — those are managed by a database trigger.

---

## Components Inside onboarding.tsx

The onboarding screen is a single file with several components defined inside it:

| Component | What it does |
|-----------|-------------|
| `OnboardingScreen` | The main screen. Manages state, renders layout, handles save logic. |
| `Bubble` | A single category bubble. Handles its own animations (entrance, colour, float, confetti, press). |
| `ConfettiParticles` | 6 coloured dots that burst outward from a bubble's centre on selection. |
| `ShimmerOverlay` | A white highlight that sweeps across the hero card during the first 2 seconds. |

These are defined in the same file (not in `components/`) because they're tightly coupled to the onboarding screen and not reused anywhere else.

---

## Quick Reference: File → Supabase Call

| File | Supabase call | What it does |
|------|--------------|-------------|
| `onboarding.tsx` | `supabase.auth.getUser()` | Gets the current user's ID before saving |
| `onboarding.tsx` | `supabase.from('users').update()` | Saves preferred_categories and onboarding_completed |
| `profile.tsx` | `supabase.from('users').update()` | Resets preferred_categories and onboarding_completed |
| `useAuth.ts` | `supabase.from('users').select('onboarding_completed')` | Checks if user has completed onboarding |
