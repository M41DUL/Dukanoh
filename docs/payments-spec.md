# Dukanoh — Payments, Boosts & Subscription Spec

## Overview

Three interconnected monetisation systems:
1. **Marketplace payments** — buyer pays seller for physical listings via Stripe Connect Express
2. **Boost system** — sellers pay to promote listings in stories
3. **Dukanoh Pro subscription** — monthly/annual seller subscription via RevenueCat

All three can be built at the UI + DB layer now. Stripe and RevenueCat are dropped in at the end to make money actually move.

---

## 1. Marketplace Payments

### Fee model
- **Buyer pays** a protection fee on top of the listing price
- **Formula:** `listing_price × 6.5% + £0.80`
- Example: £40 listing → buyer pays £43.40 (£40 + £2.60 + £0.80)
- Seller always receives their full asking price
- Platform revenue = the buyer protection fee

### Order lifecycle — state machine

```
created → paid → shipped → delivered → completed
                         ↘ disputed → resolved
              ↘ cancelled (before shipped only)
```

| Status | Meaning | Who triggers |
|---|---|---|
| `created` | Buyer tapped Buy, order placed | Buyer |
| `paid` | Payment captured by Stripe | Stripe webhook |
| `shipped` | Seller marked as shipped + tracking number entered | Seller |
| `delivered` | Buyer confirmed receipt | Buyer (or auto after 2 days) |
| `completed` | Funds released to seller wallet | System |
| `disputed` | Buyer raised a dispute | Buyer |
| `resolved` | Dispute closed by admin | Admin |
| `cancelled` | Order cancelled before shipping | Buyer or Seller |

### Buyer confirmation window
- Buyer has **2 days** after seller marks as shipped to:
  - Confirm receipt → funds release immediately
  - Raise a dispute → funds held pending resolution
- If buyer does nothing within 2 days → **auto-release** to seller wallet

### Delivery address
- Buyers save a default delivery address on their profile (one-time setup)
- Address pre-fills at checkout — buyer can edit per order but changes are not saved back
- Stored as structured fields on `users` table: `address_line1`, `address_line2`, `city`, `postcode`, `country`
- Country defaults to United Kingdom

### Checkout flow
- "Buy Now" button on listing detail → straight to checkout screen (no basket)
- Checkout shows: item summary, delivery address, fee breakdown, total
- Messaging and buying are independent — buyer can message AND buy separately

### Shipping
- Seller ships via any courier of their choice
- Seller enters tracking number + courier name in app
- No in-app label generation (v2 feature)
- Buyer can see tracking number in order detail screen

### Cancellations
- **Before shipping:** both buyer and seller can cancel
  - Either party cancels → full item price refunded to buyer instantly
  - Listing automatically returns to `available` immediately on cancellation
  - Seller cancels → cancellation strike recorded on seller account
  - Too many strikes (3+) → account flagged for review
- **After shipping:** cancellation not possible — dispute process only

### Refunds
- Buyer wins dispute → **full item price refunded**
- Buyer protection fee (6.5% + £0.80) is **non-refundable**
- Refund issued to original payment method via Stripe
- Platform fee VAT: not shown to buyers. Review with accountant if revenue exceeds £90k VAT threshold.

### Disputes
- Buyer raises dispute via in-app form: reason selection + description + optional photo upload
- Dispute data stored in `orders` table (`dispute_reason`) + separate `dispute_evidence` table for photos
- On dispute creation: Supabase Edge Function sends email notification to Dukanoh support address
- Admin resolves via Supabase dashboard — updates order status to `resolved`
- Default outcome if admin doesn't act within 7 days: full refund to buyer

### Seller wallet
- Released funds sit in an **in-app wallet**
- Seller manually withdraws to their bank account when ready
- Standard payout: 3–5 business days (Stripe standard)
- Instant payout: v2 feature (1.5% fee)
- Wallet shows:
  - **Pending** — in escrow, waiting for buyer confirmation
  - **Available** — released, ready to withdraw
  - **Lifetime earned** — total all-time earnings

### Seller identity verification (Verified status)
- Seller completes Stripe Connect Express onboarding (ID + bank details)
- On successful Stripe onboarding → `is_verified = true` set via Stripe webhook
- Verified badge shown on public profile + listing cards
- Verified is a **prerequisite for Pro** — cannot subscribe to Pro without completing Stripe onboarding

---

## 2. Boost System

### What a boost does
- Promotes a listing into the stories rotation regardless of age (organic window is 5 hours)
- Boosted listings appear before organic listings in stories sort order
- Gold ring on bubble in StoriesRow
- "Sponsored" label shown in story viewer
- Boost duration: **24 hours**

### Pricing
| Seller type | Cost per boost |
|---|---|
| Standard | £1.49 |
| Pro (monthly allowance) | 3 free |
| Pro (additional beyond free) | £0.99 |

### Rules
| Rule | Detail |
|---|---|
| Max simultaneous active boosts | 5 (standard), 10 (Pro) |
| Same listing re-boost | Allowed immediately — no cooldown |
| Daily purchase limit | None |
| Boost through listing edit | Continues uninterrupted |
| Boost when listing sells | Ends naturally |
| Boost if Pro lapses mid-boost | Continues until natural expiry |
| Free boost reset | Subscription anniversary date (every 30 days from subscribe date) |
| Free boost rollover | None — use it or lose it |

### Payment method
- Standard sellers: one-off purchase per boost via RevenueCat consumable IAP
- Pro sellers: free allowance deducted first, then RevenueCat consumable for extras
- Apple/Google IAP required (digital goods — App Store rules apply)

### DB fields (already in schema)
- `listings.is_boosted` — boolean
- `listings.boost_expires_at` — timestamptz
- `users.boosts_used` — count used this period
- `users.boosts_reset_at` — next reset date

---

## 3. Dukanoh Pro Subscription

### Plans

**Founder Plan** *(first 150 subscribers only)*
- £6.99/month
- £59.99/year (~£5/month, saving 29%)
- Locked in forever — price never increases for founder subscribers
- Paywall shows: *"Lock in your price forever — only 150 founder spots available"*
- Once 150 reached, Founder Plan closed permanently

**Standard Pro** *(after 150 founders)*
- £9.99/month
- £84.99/year (~£7.08/month, saving 29%)
- Paywall shows: *"Price will increase as Dukanoh grows"*

### Pro features
| Feature | Detail |
|---|---|
| Free boosts | 3/month, resets on anniversary |
| Extra boost discount | £0.99 vs £1.49 |
| Max simultaneous boosts | 10 vs 5 |
| Analytics dashboard | Earnings, views, saves, profile visits |
| Collections | Group listings into collections |
| Share kit | Generate shareable image card |
| Price drop alerts | Notify saved buyers on price drop |
| Pro badge | ◆ shown on profile + listing cards |

### Prerequisites
- Must have at least 1 active listing
- Must be Verified (Stripe Connect onboarding complete)

### Subscription payment
- Handled entirely by RevenueCat + Apple/Google IAP
- RevenueCat webhooks update `users.seller_tier` and `users.pro_expires_at`
- On cancellation: Pro features remain until `pro_expires_at`, then revert to free
- On payment failure: grace period of 3 days, then revert to free

### Founder count tracking
- `platform_settings` table (new) — stores `founder_count` and `founder_limit` (150)
- On each new Pro subscription, check `founder_count < founder_limit`
- If under limit: apply founder pricing, increment `founder_count`
- If at limit: standard pricing only, Founder Plan option hidden from paywall

---

## DB changes required

### New columns on `users`
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS postcode TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'United Kingdom';
```
*(Note: stripe_account_id and stripe_onboarding_complete already exist in schema — confirm before running)*

### New table: `orders`
```sql
CREATE TABLE public.orders (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id        UUID REFERENCES public.listings (id) ON DELETE SET NULL,
  buyer_id          UUID REFERENCES public.users (id) ON DELETE SET NULL,
  seller_id         UUID REFERENCES public.users (id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created','paid','shipped','delivered','completed','disputed','resolved','cancelled')),
  item_price        NUMERIC(10,2) NOT NULL,
  protection_fee    NUMERIC(10,2) NOT NULL,
  total_paid        NUMERIC(10,2) NOT NULL,
  tracking_number   TEXT,
  courier           TEXT,
  stripe_payment_id TEXT,
  dispute_reason    TEXT,
  shipped_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  auto_release_at   TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      TEXT CHECK (cancelled_by IN ('buyer','seller','system')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers and sellers can read their own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Buyers can create orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Buyers and sellers can update their own orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE INDEX idx_orders_buyer   ON public.orders (buyer_id);
CREATE INDEX idx_orders_seller  ON public.orders (seller_id);
CREATE INDEX idx_orders_listing ON public.orders (listing_id);
CREATE INDEX idx_orders_status  ON public.orders (status);
```

### New table: `seller_wallet`
```sql
CREATE TABLE public.seller_wallet (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  seller_id        UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL UNIQUE,
  pending_balance  NUMERIC(10,2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  lifetime_earned  NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.seller_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can read their own wallet"
  ON public.seller_wallet FOR SELECT TO authenticated
  USING (auth.uid() = seller_id);

CREATE INDEX idx_wallet_seller ON public.seller_wallet (seller_id);
```

### New table: `platform_settings`
```sql
CREATE TABLE public.platform_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.platform_settings (key, value) VALUES
  ('founder_limit', '150'),
  ('founder_count', '0'),
  ('founder_monthly_price', '6.99'),
  ('founder_annual_price', '59.99'),
  ('pro_monthly_price', '9.99'),
  ('pro_annual_price', '84.99');
```

### New table: `cancellation_strikes`
```sql
CREATE TABLE public.cancellation_strikes (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  seller_id  UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  order_id   UUID REFERENCES public.orders (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cancellation_strikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can read their own strikes"
  ON public.cancellation_strikes FOR SELECT TO authenticated
  USING (auth.uid() = seller_id);

CREATE INDEX idx_strikes_seller ON public.cancellation_strikes (seller_id);
```

### New table: `dispute_evidence`
```sql
CREATE TABLE public.dispute_evidence (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id   UUID REFERENCES public.orders (id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES public.users (id) ON DELETE SET NULL,
  image_url  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers and sellers can read dispute evidence for their orders"
  ON public.dispute_evidence FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

CREATE POLICY "Buyers can upload dispute evidence"
  ON public.dispute_evidence FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_dispute_evidence_order ON public.dispute_evidence (order_id);
```

---

## Screens to build

### Buyer journey
| Screen | Route | Description |
|---|---|---|
| Checkout | `/checkout/[listingId]` | Item summary, delivery address (pre-filled), fee breakdown, Buy button |
| Order confirmation | `/order/[id]` | Order placed, what happens next |
| Order detail (buyer) | `/order/[id]` | Tracking info, confirm receipt, raise dispute |
| Dispute | `/order/[id]/dispute` | Reason selection + description + optional photo upload |

### Seller journey
| Screen | Route | Description |
|---|---|---|
| Order detail (seller) | `/order/[id]` | Same route, different view — enter tracking, mark shipped |
| Stripe onboarding | `/stripe-onboarding` | Prompt + redirect to Stripe Express hosted flow |
| Seller wallet | `/wallet` | Pending + available balance, withdrawal history, withdraw button |

### Shared
| Screen | Route | Description |
|---|---|---|
| Orders list | `/orders` | Extend existing screen — add Orders tab alongside Selling/Drafts/Bought |
| Delivery address | `/settings/address` | Add/edit saved delivery address — address_line1, address_line2, city, postcode, country |

---

## What can be built without Stripe/RevenueCat

| Component | Build now | Needs Stripe | Needs RevenueCat |
|---|---|---|---|
| Orders table + RLS | ✓ | | |
| Wallet table + RLS | ✓ | | |
| Checkout screen UI | ✓ | Real card capture | |
| Order detail screens | ✓ | | |
| Tracking number entry | ✓ | | |
| Buyer confirmation flow | ✓ | | |
| Auto-release logic (Edge Function) | ✓ skeleton | Actual transfer | |
| Dispute flow UI | ✓ | | |
| Cancellation flow | ✓ | Real refund | |
| Seller wallet screen | ✓ mock | Real balances | |
| Stripe onboarding UI | ✓ prompt | Actual redirect | |
| Verified badge (DB + UI) | ✓ | Webhook to flip flag | |
| Pro paywall (founder/standard) | ✓ | | Actual charge |
| Boost purchase UI | ✓ | | Actual IAP |
| Founder count tracking | ✓ | | |

---

## Stripe Stripe Connect integration points (when ready)

- Seller onboarding: `stripe.accounts.create` + hosted onboarding link
- Payment capture: `stripe.paymentIntents.create` with `transfer_data.destination`
- Escrow release: `stripe.transfers.create` to seller Stripe account
- Refund: `stripe.refunds.create`
- Webhook events to handle: `payment_intent.succeeded`, `account.updated`, `payout.paid`

## RevenueCat integration points (when ready)

- Pro subscription: `Purchases.purchasePackage()` in paywall CTA
- Boost consumable: `Purchases.purchasePackage()` on boost button
- Entitlement check: `Purchases.getCustomerInfo()` on app load → update `seller_tier`
- Webhook: update `seller_tier`, `pro_expires_at`, `founder_count` in DB
