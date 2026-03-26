# Sell Journey — How It All Works

A beginner-friendly guide to how listing an item works in Dukanoh. Use this as a reference when you need to understand the seller onboarding, listing form, image uploads, validation, and the auto-open field chain.

---

## The Big Picture

```
User taps Sell tab
       |
  App checks: "Is this user a seller?"
       |
   +---+---+
   |       |
  NO      YES
   |       |
Seller   Listing
Onboarding  Form
   |
 Enter code
   |
 Activated → Form
```

The sell tab has three possible screens depending on state:
1. **Loading spinner** — while checking seller status
2. **Seller Onboarding** — if the user hasn't activated as a seller yet
3. **Listing form** — the main form for creating a new listing

---

## Key Files — What Lives Where

| File | What it does |
|------|-------------|
| `app/(tabs)/sell.tsx` | The main sell screen. Checks seller status, renders onboarding or listing form, handles image uploads and submission. |
| `lib/sellHelpers.ts` | Extracted pure functions — validation, measurements builder, form dirty check, category-gender mapping. |
| `components/SellerOnboarding.tsx` | Full-screen activation flow with invite code input. |
| `components/Select.tsx` | Dropdown component using BottomSheet. Supports imperative `open()` via ref. |
| `components/BottomSheet.tsx` | Reusable bottom sheet with swipe-to-dismiss, backdrop, keyboard avoidance. |
| `lib/imageUtils.ts` | Image compression before upload (resizes to max 1080px, 75% JPEG quality). |
| `constants/theme.ts` | Data constants — Genders, CategoriesByGender, Conditions, Occasions, Sizes, Colours, Fabrics. |
| `__tests__/sellHelpers.test.ts` | 58 unit tests covering validation, measurements, form dirty check, category-gender mapping. |

---

## Flow 1: Seller Onboarding

```
Sell tab loads (user is not a seller)
    |
    v
SellerOnboarding screen
    |
    | Animated hero with staggered text entrance
    | Invite code input at bottom
    v
User enters code, taps "Activate"
    |
    v
App calls supabase.rpc('activate_seller', { code, userId })
    |
    | RPC validates code and sets is_seller = true
    v
"You're in!" confirmation screen
    |
    | User taps "Start listing"
    v
Callback sets sellerStatus = 'seller'
    |
    v
Listing form appears
```

### How activation works

The `activate_seller` RPC function runs inside Supabase. It:
1. Checks if the invite code exists and hasn't been used
2. Marks the code as used
3. Sets `is_seller = true` on the user's profile in the `users` table
4. Returns a boolean indicating success

### Supabase call

```javascript
supabase.rpc('activate_seller', {
  p_code: code.toUpperCase(),
  p_user_id: userId
})
```

### Styling notes

- Background uses `lightColors.primary` (#3735C5) — always dark-themed regardless of user's theme preference
- Hero card uses a darker blue (#1E1C8A)
- Input has transparent white background (`rgba(255,255,255,0.1)`)
- Submit button uses `lightColors.secondary` (#C7F75E) with dark text
- Text entrance is staggered — each line slides up and fades in with 500ms delay between them

---

## Flow 2: Creating a Listing

```
Listing form
    |
    | Photos (horizontal scroll, 1-8 images)
    |
    | Form fields auto-chain:
    | Title → Gender → Category → Description
    | → Condition → Size → Colour → Fabric
    | → Occasion → Price → Story
    |
    | "List Item" button at bottom
    v
Validation
    |
   +---+---+
   |       |
 FAIL    PASS
   |       |
Scroll   Upload images → Insert listing → Success screen
to first
error
```

### The auto-open chain

This is the key UX pattern. When the user finishes one field, the next field automatically scrolls into view and opens. Here's the full chain:

| Step | Field | What happens next |
|------|-------|------------------|
| 1 | **Title** (text input) | Keyboard "next" → scrolls to Gender, opens Gender dropdown |
| 2 | **Gender** (Select) | Pick a value → scrolls to Category, opens Category dropdown |
| 3 | **Category** (Select) | Pick a value → scrolls to Description, focuses text input |
| 4 | **Description** (text input) | Keyboard "next" → scrolls to Condition, opens Condition dropdown |
| 5 | **Condition** (Select) | Pick a value → scrolls to Size, opens Size dropdown |
| 6 | **Size** (Select) | Pick a value → scrolls to Colour, opens Colour dropdown. If "Custom" selected → shows measurement fields instead |
| 7 | **Colour** (Select, optional) | Pick a value → scrolls to Fabric, opens Fabric dropdown |
| 8 | **Fabric** (Select, optional) | Pick a value → scrolls to Occasion, opens Occasion dropdown |
| 9 | **Occasion** (Select, optional) | Pick a value → scrolls to Price, focuses text input |
| 10 | **Price** (text input) | Keyboard "next" → scrolls to Story, focuses text input |
| 11 | **Story** (text input) | Keyboard "done" → dismisses keyboard |

### How the chain works technically

Each Select component exposes an `open()` method via `useImperativeHandle`. The parent stores refs for every Select:

```javascript
const genderRef = useRef<SelectHandle>(null);
const categoryRef = useRef<SelectHandle>(null);
// etc.
```

When a Select's `onSelect` fires, it scrolls to the next field and opens it after a short delay:

```javascript
onSelect={val => {
  setForm(f => ({ ...f, gender: val }));
  scrollToField('category');
  setTimeout(() => categoryRef.current?.open(), 300);
}}
```

The 300ms delay lets the scroll animation finish before the bottom sheet opens.

### How scroll-to-field works

Every field wrapper has an `onLayout` that records its Y position:

```javascript
<View onLayout={e => { fieldPositions.current.gender = e.nativeEvent.layout.y; }}>
```

The `scrollToField` function uses these stored positions:

```javascript
const scrollToField = (field: string) => {
  const y = fieldPositions.current[field];
  if (y !== undefined) {
    scrollRef.current?.scrollTo({ y, animated: true });
  }
};
```

### Gender → Category dependency

When the user selects a gender, the category options update:
- **Women**: Lehenga, Saree, Anarkali, Kurta, Casualwear, Shoes
- **Men**: Sherwani, Kurta, Achkan, Pathani Suit, Casualwear, Shoes

If the user changes gender and their current category isn't valid for the new gender, the category resets to empty. This uses `isCategoryValidForGender()` from sellHelpers.

If the Category dropdown is opened without a gender selected, it shows the message "Please select a gender first" instead of an empty list (via the Select component's `emptyMessage` prop).

---

## Flow 3: Photos

```
User taps "Add Photos" card
    |
    v
Alert: "Take Photo" / "Choose from Library" / "Cancel"
    |
   +---+---+
   |       |
Camera   Library
   |       |
 Takes    Picks multiple
 photos   (up to 8 - current)
 in loop  |
   |       |
   +---+---+
       |
       v
Images appear in horizontal scroll
    |
    | First image shows "Cover" badge
    | Each image has an X button to remove
    | Long-press (200ms) enters reorder mode
    v
Reorder mode: chevron buttons to move left/right
```

### Camera loop

When taking photos, the camera reopens automatically after each shot until the user cancels or hits 8 images. There's a 500ms delay between camera dismissal and reopening to let the UI fully transition.

### Image reorder

- Long-press toggles reorder mode on that image (highlighted with primary-colored border)
- Chevron-back and chevron-forward buttons appear at the bottom of the image
- Buttons splice and reinsert the image in the array
- The first image is always the cover photo

### Layout

The photo row uses the edge-to-edge breakout pattern:
- ScreenWrapper has `paddingHorizontal: 0`
- ScrollView content has `paddingHorizontal: Spacing.base` (16px)
- Photo section uses `marginHorizontal: -Spacing.base` to break out to screen edges
- Inner content uses `paddingHorizontal: Spacing.base` for inset

---

## Flow 4: Validation

### Published listing rules

| Field | Rule | Error message |
|-------|------|--------------|
| Images | At least 1 required | "Add at least one photo" |
| Title | Required, min 3 characters | "Title is required" / "Title must be at least 3 characters" |
| Description | Required, min 10 characters | "Description is required" / "Description must be at least 10 characters" |
| Price | Required, £1–£2,000 | "Enter a price of at least £1" / "Maximum price is £2,000" |
| Gender | Required | "Select a gender" |
| Category | Required | "Select a category" |
| Condition | Required | "Select a condition" |
| Size | Required | "Select a size" |
| Measurements | 1–99 if provided | "Must be 1–99" |

### Draft rules

Drafts are much more lenient — only the title is required (min 3 chars). All other fields are optional. Measurements are still validated if provided.

### Error handling

When validation fails:
1. Error messages appear below each invalid field
2. The form automatically scrolls to the first error field
3. Errors clear individually as the user fixes each field

### Where validation lives

Validation logic is extracted into `lib/sellHelpers.ts` as a pure function (`validateListing`). This keeps it testable — there are 58 unit tests covering all validation rules, boundary cases, and edge cases.

---

## Flow 5: Submission

```
User taps "List Item"
    |
    v
validate(isDraft=false)
    |
    | If errors → scroll to first error, stop
    v
Compress each image via compressImage()
    |
    | Resizes longest dimension to max 1080px
    | Compresses to 75% quality JPEG
    v
Upload each image to Supabase storage
    |
    | Bucket: "listings"
    | Path: ${userId}/${timestamp}-${random}.jpg
    | Content-Type: image/jpeg
    | Cache-Control: 31536000 (1 year)
    | Progress shown: "Uploading photos… 2/5"
    v
Insert listing into Supabase
    |
    v
Success animation screen
```

### Supabase insert

```javascript
supabase.from('listings').insert({
  seller_id: user.id,
  title: form.title.trim(),
  description: form.description.trim() || null,
  price: parseFloat(form.price),
  gender: form.gender,
  category: form.category,
  condition: form.condition,
  size: form.size || null,
  occasion: form.occasion || null,
  colour: form.colour || null,
  fabric: form.fabric || null,
  measurements: buildMeasurements(),  // JSON object or null
  worn_at: form.worn_at.trim() || null,
  images: imageUrls,  // array of public URLs
  status: 'available',  // or 'draft'
})
```

### Success screen

After a successful publish:
- Animated circle scales up (spring animation, speed 8, bounciness 10) with a checkmark icon
- "You're live!" title and "Your item is now listed and visible to buyers." subtitle fade in
- Two buttons: "View profile" (outline, navigates to profile tab) and "List another" (primary, resets form)

### Draft submission

Drafts follow the same upload flow but:
- Validation is relaxed (only title required)
- Status is set to `'draft'` instead of `'available'`
- Shows an alert instead of the success screen: "Draft saved — Find it in your profile to publish when ready."

---

## Flow 6: Unsaved Changes Detection

```
User is filling out the form
    |
    | Taps a different tab (form loses focus)
    v
useFocusEffect cleanup runs
    |
    | Checks: isFormDirty AND NOT currently submitting
    |
   +---+---+
   |       |
 Clean   Dirty
   |       |
Nothing  Alert: "Save draft?"
         |
      +--+--+
      |     |
  Discard  Save draft
      |     |
  resetForm  submitListing('draft')
```

### How dirty checking works

`isFormDirty()` from sellHelpers returns `true` if ANY of these are non-empty:
- Any form field (title, description, price, gender, category, condition, occasion, size, colour, fabric, worn_at)
- Any measurement field (chest, waist, length)
- Image count > 0

### Stale closure prevention

The cleanup function runs when the tab loses focus, but it's created once (empty dependency array). To avoid reading stale state, the component uses refs that are updated every render:

```javascript
const formDirtyRef = useRef(isFormDirty);
const submittingRef = useRef(submitting);
const resetFormRef = useRef<(() => void) | null>(null);
const submitListingRef = useRef<((status: 'available' | 'draft') => void) | null>(null);

useEffect(() => {
  formDirtyRef.current = isFormDirty;
  submittingRef.current = submitting;
  resetFormRef.current = resetForm;
  submitListingRef.current = submitListing;
});
```

The cleanup function reads from these refs instead of the state variables directly.

---

## Data Constants (constants/theme.ts)

| Constant | Values | Required? |
|----------|--------|-----------|
| Genders | Men, Women | Yes |
| Categories (Women) | Lehenga, Saree, Anarkali, Kurta, Casualwear, Shoes | Yes |
| Categories (Men) | Sherwani, Kurta, Achkan, Pathani Suit, Casualwear, Shoes | Yes |
| Conditions | New, Excellent, Good, Fair | Yes |
| Sizes | XS, S, M, L, XL, XXL, Custom | Yes |
| Colours | Black, White, Red, Blue, Green, Gold, Pink, Maroon, Beige, Multi, Other | Optional |
| Fabrics | Silk, Chiffon, Georgette, Cotton, Velvet, Net, Brocade, Linen, Other | Optional |
| Occasions | Everyday, Eid, Diwali, Wedding, Mehndi, Party, Formal | Optional |

Optional fields use a toggle pattern — selecting the same value again deselects it:
```javascript
setForm(f => ({ ...f, colour: f.colour === val ? '' : val }))
```

---

## Measurements (Optional)

```
Size Select
    |
    | User picks "Custom"
    |   → Measurement fields appear automatically
    |
    | User picks any other size
    |   → "Add measurements (optional)" link shown
    |   → Tapping it reveals measurement fields
    v
Three inputs: Chest, Waist, Length (inches)
    |
    | Each chains to the next via keyboard "next"
    | Last one (Length) → opens Colour Select
    v
buildMeasurements() converts to JSON before insert:
    { chest: 38, waist: 32, length: 44 }
    or null if none provided
```

Validation: each measurement, if provided, must be a number between 1 and 99. Empty measurements are skipped (not an error).

---

## Supabase Columns Used

| Column | Type | Used for |
|--------|------|----------|
| `listings.seller_id` | UUID | Links to the user who created the listing |
| `listings.title` | TEXT | Listing title (3-80 chars) |
| `listings.description` | TEXT | Item description (10-500 chars, nullable) |
| `listings.price` | NUMERIC | Price in GBP (1-2000) |
| `listings.gender` | TEXT | Men or Women |
| `listings.category` | TEXT | Category from gender-specific list |
| `listings.condition` | TEXT | New, Excellent, Good, or Fair |
| `listings.size` | TEXT | Size label or "Custom" (nullable) |
| `listings.occasion` | TEXT | Occasion tag (nullable) |
| `listings.colour` | TEXT | Colour name (nullable) |
| `listings.fabric` | TEXT | Fabric type (nullable) |
| `listings.measurements` | JSONB | `{ chest, waist, length }` object (nullable) |
| `listings.worn_at` | TEXT | Story text (nullable) |
| `listings.images` | TEXT[] | Array of public image URLs |
| `listings.status` | TEXT | 'available' or 'draft' |
| `users.is_seller` | BOOLEAN | Checked on tab load to show onboarding or form |

---

## UI Details

### Progress bar

A thin 2px line at the top of the form that fills based on scroll position. Uses `onScroll` to calculate `scrollProgress` (0 to 1) and sets the fill width as a percentage.

### Select component

- Renders as a touchable field with the current value and a chevron-down icon
- Opens a BottomSheet (rendered as a Modal) with the list of options
- Selected option shows a checkmark icon and primary-coloured text
- Supports `emptyMessage` prop — shown when `options` array is empty
- Options are not scrollable — sheet height fits the content
- Row height uses `Spacing.lg` (20px) vertical padding

### Input labels

- Font: Inter Medium (`Inter_500Medium`)
- Size: 14px
- Weight: 500
- Letter spacing: 0
- Gap between label and input: `Spacing.sm` (8px)

### Form spacing

- Gap between fields: `Spacing.xl` (24px)
- Submit button margin-top: `Spacing.sm` (8px)
- Bottom padding: `Spacing.base` (16px)

---

## Quick Reference: Component → Purpose

| Component | Where it's used | What it does |
|-----------|----------------|-------------|
| `SellerOnboarding` | Sell tab (not_seller state) | Invite code activation flow |
| `Select` | All dropdown fields in form | BottomSheet-based dropdown with imperative open |
| `BottomSheet` | Inside Select | Modal sheet with swipe-to-dismiss |
| `Input` | Title, Description, Price, Story, Measurements | Themed text input with label, error, hint |
| `Header` | Top of sell form | "New Listing" title bar |
| `Button` | Submit button, success screen | Primary/outline action button |
| `LoadingSpinner` | Loading state | Shown while checking seller status |
| `ScreenWrapper` | Outer container | SafeAreaView with background color |

---

## Quick Reference: File → Supabase Call

| File | Supabase call | What it does |
|------|--------------|-------------|
| `sell.tsx` | `supabase.from('users').select('is_seller')` | Checks if user is a seller |
| `sell.tsx` | `supabase.storage.from('listings').upload()` | Uploads compressed images |
| `sell.tsx` | `supabase.storage.from('listings').getPublicUrl()` | Gets public URL for uploaded image |
| `sell.tsx` | `supabase.from('listings').insert()` | Creates the listing record |
| `SellerOnboarding.tsx` | `supabase.rpc('activate_seller')` | Validates invite code and activates seller |
