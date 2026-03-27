# Messaging & Offers Journey — How It All Works

A beginner-friendly guide to how messaging and offers work in Dukanoh. Use this as a reference when you need to understand conversations, real-time messaging, the offer protocol, and the inbox.

---

## The Big Picture

```
Buyer on listing detail
       |
  Taps "Message" or "Make Offer"
       |
  findOrCreateConversation()
       |
   +---+---+
   |       |
Existing  New
  conv    conv created
   |       |
   +---+---+
       |
  Conversation screen
       |
  Real-time messaging via Supabase
       |
  Messages appear in Inbox tab
  (with unread indicators)
```

The messaging system connects buyers and sellers around a specific listing. Every conversation is tied to a listing — there are no "general" DMs.

---

## Key Files — What Lives Where

| File | What it does |
|------|-------------|
| `app/(tabs)/inbox.tsx` | Inbox list — shows all conversations sorted by most recent, with unread indicators. Pull-to-refresh and realtime updates. |
| `app/conversation/[id].tsx` | Chat screen — real-time messages, offer bubbles with Accept/Decline, date grouping, sold banner. |
| `app/listing/[id].tsx` | Where conversations originate — "Message" button and "Make Offer" modal. Contains `findOrCreateConversation()`. |
| `app/user/[id].tsx` | Seller profile — "Message" button appears if a conversation already exists with that seller. |
| `app/(tabs)/_layout.tsx` | Tab bar — shows unread count badge on the Inbox tab via `useUnreadCount` hook. |
| `hooks/useUnreadCount.ts` | Single-query hook that counts conversations where the last message wasn't sent by the current user. Subscribes to realtime. |
| `components/Header.tsx` | Shared header — supports `subtitle` and `onSubtitlePress` props used by the conversation screen to link to the listing. |
| `schema.sql` | Database tables: `conversations` and `messages`, trigger `handle_new_message`, RLS policies, realtime publication. |

---

## Database Schema

### conversations table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `listing_id` | UUID | FK to listings (NOT NULL, ON DELETE CASCADE) |
| `buyer_id` | UUID | FK to users (NOT NULL) |
| `seller_id` | UUID | FK to users (NOT NULL) |
| `last_message` | TEXT | Updated by trigger on each new message |
| `last_message_sender_id` | UUID | FK to users — tracks who sent the last message (used for unread indicators) |
| `updated_at` | TIMESTAMPTZ | Updated by trigger — used for inbox sort order |
| `created_at` | TIMESTAMPTZ | |

**Unique constraint:** `(listing_id, buyer_id)` — one conversation per buyer per listing.

### messages table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK to conversations (NOT NULL) |
| `listing_id` | UUID | FK to listings (NOT NULL) |
| `sender_id` | UUID | FK to users (NOT NULL) |
| `receiver_id` | UUID | FK to users (NOT NULL) |
| `content` | TEXT | Message text or offer protocol string |
| `created_at` | TIMESTAMPTZ | |

### Trigger: handle_new_message

When a message is inserted, the trigger automatically updates the parent conversation:
- Sets `last_message` to the new message content
- Sets `last_message_sender_id` to the sender
- Sets `updated_at` to now

This keeps the inbox query simple — no joins to the messages table needed.

### Realtime

Both `messages` and `conversations` are added to the `supabase_realtime` publication:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
```

---

## Flow 1: Starting a Conversation

```
Buyer taps "Message" on listing
    |
    v
findOrCreateConversation()
    |
    | 1. Check: does a conversation already exist
    |    for this (listing_id, buyer_id)?
    |
    +-- YES → return existing conversation ID
    |
    +-- NO  → INSERT new conversation row
    |         (listing_id, buyer_id, seller_id)
    |         → return new ID
    |
    v
router.push(/conversation/{id})
```

**Error handling:** If the conversation can't be created (e.g. listing no longer available, RLS rejection), the user sees an alert: "This conversation could not be created."

**RLS policy:** Only the buyer can create a conversation. The policy checks `auth.uid() = buyer_id AND auth.uid() != seller_id` and verifies the listing status is `available`.

---

## Flow 2: Sending Messages

```
User types message, taps send
    |
    v
handleSend()
    |
    | 1. Trim text, clear input immediately
    | 2. Compute receiver_id from meta
    |    (if user is buyer → receiver is seller, and vice versa)
    | 3. INSERT into messages table
    |
    +-- Success → message appears via realtime subscription
    |
    +-- Error → restore text to input, show alert
```

**Realtime subscription:** The conversation screen subscribes to `postgres_changes` INSERT events on messages filtered by `conversation_id`. New messages from either party appear instantly.

**Input limits:** Messages are capped at 1,000 characters via `maxLength`.

---

## Flow 3: Making an Offer

Offers use a message content protocol — no separate table needed.

### Protocol strings

| Content pattern | Meaning |
|----------------|---------|
| `__OFFER__:50.00` | Offer of £50.00 |
| `__OFFER_ACCEPTED__:50.00` | Offer of £50.00 was accepted |
| `__OFFER_DECLINED__:50.00` | Offer of £50.00 was declined |

### Making an offer (from listing detail)

```
Buyer taps "Make Offer" on listing
    |
    v
Offer modal opens
    |
    | Shows preset buttons (10% off, 20% off)
    | and free-text input
    |
    v
Buyer enters amount, taps "Send Offer"
    |
    v
handleOffer()
    |
    | 1. Validate: amount > 0, < listing price, ≤ £99,999
    | 2. findOrCreateConversation()
    | 3. INSERT message with content "__OFFER__:{amount}"
    |
    +-- Success → alert with "View conversation" option
    +-- Error → show error in modal
```

### Accepting / Declining (in conversation)

```
Seller sees offer bubble with Accept / Decline buttons
    |
    | (buttons only show if: sender is other person AND
    |  no __OFFER_ACCEPTED__ or __OFFER_DECLINED__ message
    |  exists for this amount)
    |
    v
Seller taps Accept or Decline
    |
    v
respondToOffer(amount, accepted)
    |
    | INSERT message: "__OFFER_ACCEPTED__:{amount}"
    | or "__OFFER_DECLINED__:{amount}"
    |
    v
Response message appears via realtime
Accept/Decline buttons disappear (response exists)
```

### How offers render

| Message type | Visual |
|-------------|--------|
| `__OFFER__` | Amber-bordered bubble with price tag icon and amount. Own offers use primary color. |
| `__OFFER_ACCEPTED__` | Inline system message with green checkmark icon |
| `__OFFER_DECLINED__` | Inline system message with red X icon |

---

## Flow 4: Inbox

```
User taps Inbox tab
    |
    v
Fetch conversations
    |
    | SELECT from conversations
    | JOIN buyer + seller profiles
    | ORDER BY updated_at DESC
    |
    v
Render list with:
    - Avatar of other user
    - @username (bold if unread)
    - Last message preview (formatted for offers)
    - Relative time (Today/Yesterday/weekday/date)
    - Blue dot indicator for unread conversations
```

### Unread logic

A conversation is "unread" when `last_message_sender_id` is NOT the current user — meaning the other person sent the last message and you haven't replied yet.

This drives two things:
1. **Per-row indicators** in the inbox — bold text + blue dot
2. **Tab badge** — red badge with unread count on the Inbox tab icon

### Realtime

The inbox subscribes to `postgres_changes` on the conversations table (filtered by `buyer_id` and `seller_id`). When a new message triggers the `handle_new_message` function and updates the conversation row, the inbox automatically refreshes.

### Pull-to-refresh

The inbox FlatList has a `RefreshControl` for manual refresh.

---

## Flow 5: Conversation Screen Details

### Date grouping

Messages are displayed in an inverted FlatList (newest at bottom). Date labels ("Today", "Yesterday", "Monday", "12 Mar 2026") appear between messages from different days.

The logic: in an inverted list, the next item is *older*. A date label shows when the current message's date differs from the next item's date.

### Sold listing banner

If the listing's status is `sold`, a banner appears at the top: "This item has been sold". Users can still read history but should be aware the item is gone.

### Tappable listing context

The header shows the listing title as a tappable subtitle (in primary color). Tapping it navigates to the listing detail screen.

### Empty state

New conversations with no messages show a centered icon and "Send a message to start the conversation" text. The empty component uses `scaleY: -1` transform because the FlatList is inverted.

---

## Error Handling Summary

| Scenario | What happens |
|----------|-------------|
| Conversation creation fails | Alert: "This conversation could not be created" |
| Message send fails | Text restored to input, alert shown |
| Offer send fails | Error shown in offer modal |
| Offer response fails | Alert: "Failed to respond to offer" |
| Conversation fetch fails | Error state screen with back button (no broken UI) |
| Inbox fetch fails | Alert: "Could not load conversations" |

---

## Patterns & Conventions

- **All conversations require a listing** — the `listing_id` column is NOT NULL. You can't start a conversation without a listing context.
- **Only buyers create conversations** — RLS enforces `auth.uid() = buyer_id`. Sellers respond in existing ones.
- **Offer protocol lives in message content** — no separate offers table. The `__OFFER__:`, `__OFFER_ACCEPTED__:`, `__OFFER_DECLINED__:` prefixes are parsed at render time.
- **The trigger does the bookkeeping** — `handle_new_message` keeps `last_message`, `last_message_sender_id`, and `updated_at` in sync on the conversations table, so the inbox only needs one query.
- **Realtime is subscription-based** — both the conversation screen (messages INSERT) and inbox (conversations UPDATE) use Supabase Postgres Changes. Tables must be in the `supabase_realtime` publication.
