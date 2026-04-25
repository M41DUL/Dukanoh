# Dukanoh — Brand Guidelines

## Who We Are

Dukanoh is a resale platform for South Asian clothing, built for the diaspora. We exist at the intersection of cultural identity and fashion — a place where rare, considered pieces find their next owner.

We are not a charity shop. We are not a generic marketplace. Dukanoh is where the community trades with itself.

---

## Logo & Name

- **Name:** Dukanoh — always capitalised, never all-caps, never lowercase
- **Pronunciation:** Doo-kaan-oh (from Urdu/Hindi: دکان, meaning shop)
- **Logo component:** `components/DukanohLogo.tsx`
- Do not alter, distort, or recolour the logo

---

## Colour Palette

### Primary (Light mode)

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#3735C5` | Brand blue — CTAs, active states, key UI |
| `secondary` | `#C7F75E` | Lime green — accent, secondary buttons, boosts |
| `background` | `#FFFFFF` | Screen backgrounds |
| `surface` | `#F2F2F2` | Cards, input backgrounds |
| `surfaceAlt` | `#E8E8E8` | Dividers, subtle surfaces |
| `textPrimary` | `#0D0D0D` | Headings, prices, main copy |
| `textSecondary` | `#5A5A5A` | Captions, muted metadata |
| `border` | `#E8E8E8` | Input borders, card outlines |
| `error` | `#FF4444` | Errors, destructive actions |
| `success` | `#22C55E` | Confirmations, completed states |
| `like` | `#FF4D6A` | Save/heart interactions |

### Primary (Dark mode)

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#3735C5` | Brand blue (unchanged in dark) |
| `background` | `#0D0D0D` | Screen backgrounds |
| `surface` | `#1C1C1C` | Cards |
| `textPrimary` | `#F5F5F5` | Main copy |
| `textSecondary` | `#9B9B9B` | Muted copy |
| `border` | `#2A2A2A` | Dividers |

### Dukanoh Pro palette

Pro areas (seller hub, paywall, boosts) use a separate gradient-based theme — deep indigo to near-black in dark mode, white to soft blue in light mode. Gold (`#FBCD47`) is used exclusively as the Pro identity marker (badges, pills). Do not use gold outside Pro contexts.

| Token | Value | Usage |
|---|---|---|
| `proAccent` | `#FBCD47` | Pro badges, ◆ Pro pill only |
| `gradientTop` | `#1E1C6E` (dark) / `#FFFFFF` (light) | Gradient start |
| `gradientBottom` | `#080714` (dark) / `#DFE9F3` (light) | Gradient end |
| `boostAccent` | `#C7F75E` | Boost UI only |

---

## Typography

**Typeface:** Inter — used at all weights across the app.

| Style | Size | Weight | Usage |
|---|---|---|---|
| `display` | 32px | Bold 700 | Hero headings |
| `heading` | 24px | Bold 700 | Screen titles |
| `price` | 28px | Bold 700 | Listing prices |
| `subheading` | 18px | SemiBold 600 | Section headings |
| `bodyLarge` | 16px | Regular 400 | Primary body copy |
| `body` | 14px | Regular 400 | Standard body, descriptions |
| `label` | 14px | Medium 500 | Buttons, tabs, tags |
| `caption` | 12px | Regular 400 | Metadata, muted copy |
| `small` | 11px | Regular 400 | Timestamps, footnotes |
| `micro` | 10px | Regular 400 | Badges, inline status |

Button labels always use `Inter_600SemiBold` with `letterSpacing: 0.2`.

---

## Spacing

Based on a 4px base unit.

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Tight gaps, icon padding |
| `sm` | 8px | Inner component gaps |
| `md` | 12px | Compact padding |
| `base` | 16px | Default screen horizontal padding |
| `lg` | 20px | Button padding, list gaps |
| `xl` | 24px | Section gaps |
| `2xl` | 32px | Large section separators |
| `3xl` | 48px | Screen-level vertical spacing |
| `4xl` | 64px | Hero / splash sections |

Screens use `ScreenWrapper` which applies `paddingHorizontal: 16px`. Do not add extra horizontal padding inside screens. For full-width elements, use `marginHorizontal: -16px` to break out.

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `small` | 8px | Badges, tags, small chips |
| `medium` | 12px | Cards, modals, inputs |
| `large` | 16px | Bottom sheets, image containers |
| `full` | 999px | Buttons, pills, avatars |

All primary buttons use `borderRadius: full` (pill shape).

---

## Components

### Button

Four variants:

| Variant | Background | Text | Usage |
|---|---|---|---|
| `primary` | `#3735C5` | White | Main CTAs |
| `secondary` | `#C7F75E` | `#0D0D0D` | Secondary actions |
| `outline` | Transparent | Brand blue | Tertiary, less emphasis |
| `ghost` | Transparent | Brand blue | Inline actions, destructive flows |

Three sizes: `sm` (36px), `md` (44px, default), `lg` (52px, full-width CTAs).

### Badge / Pill

Used for category filters and tags. Active state: brand blue fill, white text. Inactive: transparent, muted border.

### Listing Card

Portrait `4:5` image ratio. No badge overlay on image. Content order: title → condition · size (muted) → **bold price** → @username (muted). Shadow, not border. No Avatar in card.

---

## Categories

Women: Lehenga, Saree, Anarkali, Kurta, Dupatta, Blouse, Sharara, Salwar, Casualwear, Shoes

Men: Sherwani, Kurta, Achkan, Pathani Suit, Salwar, Nehru Jacket, Casualwear, Shoes

These are used exactly as listed — capitalised, no pluralisation in UI.

---

## Occasions

Everyday, Eid, Diwali, Wedding, Mehndi, Party, Formal

---

## Conditions

New, Excellent, Good, Fair — always in this order, never modified.

---

## Design References

- **StockX** — confidence, product-first, clean copy
- **Net-a-Porter** — elevated tone, every transaction feels significant
- **Highsnobiety** — culturally authoritative, insider voice
- **Notion** — warm and human even when things go wrong
