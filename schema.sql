-- =============================================================
-- Dukanoh — Supabase Database Schema
-- Run this in the Supabase SQL editor
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- TABLES
-- =============================================================

-- Users (mirrors auth.users with extra profile fields)
CREATE TABLE public.users (
  id                          UUID REFERENCES auth.users (id) ON DELETE CASCADE PRIMARY KEY,
  username                    TEXT UNIQUE NOT NULL,
  full_name                   TEXT NOT NULL,
  avatar_url                  TEXT,
  bio                         TEXT,
  preferred_categories        TEXT[] DEFAULT '{}',
  onboarding_completed        BOOLEAN DEFAULT FALSE,
  is_seller                   BOOLEAN DEFAULT FALSE,
  location                    TEXT,
  seller_invite_code          TEXT UNIQUE,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  -- Seller Hub Pro
  seller_tier                 TEXT DEFAULT 'free',
  pro_expires_at              TIMESTAMPTZ,
  -- Stripe Connect Express
  stripe_account_id           TEXT,
  stripe_onboarding_complete  BOOLEAN DEFAULT FALSE,
  -- Seller profile perks
  banner_url                  TEXT,
  avg_response_time_mins      INT,
  -- Boosts
  boosts_used                 INT DEFAULT 0,
  boosts_reset_at             TIMESTAMPTZ,
  -- Sale mode
  sale_mode_active            BOOLEAN DEFAULT FALSE,
  sale_mode_discount_pct      INT,
  -- Verified status (set via Stripe Connect onboarding webhook)
  is_verified                 BOOLEAN DEFAULT FALSE,
  -- Delivery address (saved on profile, pre-fills at checkout)
  address_line1               TEXT,
  address_line2               TEXT,
  city                        TEXT,
  postcode                    TEXT,
  country                     TEXT DEFAULT 'United Kingdom'
);

-- Invites (controls access to the platform)
CREATE TABLE public.invites (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  created_by  UUID REFERENCES public.users (id) ON DELETE SET NULL,
  used_by     UUID REFERENCES public.users (id) ON DELETE SET NULL,
  used_at     TIMESTAMPTZ,
  is_used     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Listings
CREATE TABLE public.listings (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  seller_id   UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0 AND price <= 2000),
  gender       TEXT NOT NULL CHECK (gender IN ('Men', 'Women')),
  category    TEXT NOT NULL,
  condition   TEXT NOT NULL,
  size         TEXT,
  occasion     TEXT,
  colour       TEXT,
  fabric       TEXT,
  measurements JSONB,
  worn_at      TEXT,
  images          TEXT[] DEFAULT '{}',
  buyer_id        UUID REFERENCES public.users (id) ON DELETE SET NULL,
  status          TEXT DEFAULT 'available' CHECK (status IN ('available', 'sold', 'draft', 'archived')),
  view_count      INT DEFAULT 0,
  save_count      INT DEFAULT 0,
  sold_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Seller Hub
  is_boosted      BOOLEAN DEFAULT FALSE,
  boost_expires_at TIMESTAMPTZ,
  price_dropped_at TIMESTAMPTZ,
  original_price  NUMERIC(10,2),
  collection_id   UUID REFERENCES public.collections (id) ON DELETE SET NULL
);

-- Collections (must be defined before listings for the FK reference above)
CREATE TABLE public.collections (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  seller_id  UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Collections are publicly readable"
  ON public.collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sellers can create their own collections"
  ON public.collections FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can update their own collections"
  ON public.collections FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can delete their own collections"
  ON public.collections FOR DELETE TO authenticated USING (auth.uid() = seller_id);

-- Migration for existing databases:
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'Women' NOT NULL CHECK (gender IN ('Men', 'Women'));
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS colour TEXT;
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS fabric TEXT;
-- ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_price_check;
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
-- CREATE INDEX IF NOT EXISTS idx_listings_buyer_id ON public.listings (buyer_id);
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location TEXT;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS seller_invite_code TEXT UNIQUE;
-- UPDATE public.users SET seller_invite_code = upper(substring(md5(random()::text), 1, 8)) WHERE seller_invite_code IS NULL;
-- ALTER TABLE public.listings ADD CONSTRAINT listings_price_check CHECK (price >= 0 AND price <= 2000);

-- Conversations (one per listing + buyer pair)
CREATE TABLE public.conversations (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id    UUID REFERENCES public.listings (id) ON DELETE CASCADE NOT NULL,
  buyer_id      UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  seller_id     UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  last_message  TEXT,
  last_message_sender_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (listing_id, buyer_id)
);

-- Messages
CREATE TABLE public.messages (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations (id) ON DELETE CASCADE NOT NULL,
  listing_id      UUID REFERENCES public.listings (id) ON DELETE CASCADE NOT NULL,
  sender_id       UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  receiver_id     UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- TRIGGERS — auto-create user profile on signup
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substring(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update conversations.updated_at when a new message is inserted
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message = NEW.content, last_message_sender_id = NEW.sender_id, updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_message_inserted
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages       ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "Public profiles are viewable"
  ON public.users FOR SELECT USING (true);

-- WITH CHECK prevents users from directly writing to rating fields.
-- update_seller_rating is SECURITY DEFINER (runs as postgres, bypasses RLS) so it is exempt.
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND rating_avg IS NOT DISTINCT FROM (SELECT u.rating_avg FROM public.users u WHERE u.id = auth.uid())
    AND rating_count IS NOT DISTINCT FROM (SELECT u.rating_count FROM public.users u WHERE u.id = auth.uid())
  );

-- Invites
CREATE POLICY "Anyone can check invite codes"
  ON public.invites FOR SELECT USING (true);

CREATE POLICY "Authenticated users can update invites"
  ON public.invites FOR UPDATE USING (auth.role() = 'authenticated');

-- Listings
CREATE POLICY "Listings are publicly viewable"
  ON public.listings FOR SELECT USING (status != 'draft' OR auth.uid() = seller_id);

CREATE POLICY "Sellers can create listings"
  ON public.listings FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own listings"
  ON public.listings FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete own listings"
  ON public.listings FOR DELETE USING (auth.uid() = seller_id);

-- Conversations
CREATE POLICY "Participants can view conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- INSERT: buyer must be the caller, seller_id must match the listing's actual seller,
-- listing must be available, and buyer cannot be the seller of their own listing.
CREATE POLICY "Buyers can create conversations"
  ON public.conversations FOR INSERT WITH CHECK (
    auth.uid() = buyer_id
    AND auth.uid() != seller_id
    AND seller_id = (
      SELECT l.seller_id FROM public.listings l
      WHERE l.id = listing_id AND l.status = 'available'
    )
  );

-- UPDATE: participants may only change last_message / updated_at —
-- core identity fields (buyer_id, seller_id, listing_id) must stay the same.
CREATE POLICY "Participants can update conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (
    (auth.uid() = buyer_id OR auth.uid() = seller_id)
    AND buyer_id   = (SELECT c.buyer_id   FROM public.conversations c WHERE c.id = conversations.id)
    AND seller_id  = (SELECT c.seller_id  FROM public.conversations c WHERE c.id = conversations.id)
    AND listing_id = (SELECT c.listing_id FROM public.conversations c WHERE c.id = conversations.id)
  );

-- Messages
CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.listing_id = listing_id
        AND (
          (c.buyer_id = auth.uid() AND c.seller_id = receiver_id)
          OR (c.seller_id = auth.uid() AND c.buyer_id = receiver_id)
        )
    )
  );

-- Reviews
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0;

CREATE TABLE public.reviews (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reviewer_id  UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  seller_id    UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  listing_id   UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (reviewer_id, listing_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are publicly viewable"
  ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users can create reviews"
  ON public.reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "Users can delete own reviews"
  ON public.reviews FOR DELETE USING (auth.uid() = reviewer_id);

CREATE OR REPLACE FUNCTION public.update_seller_rating()
RETURNS TRIGGER AS $$
DECLARE target_seller UUID;
BEGIN
  target_seller := CASE WHEN TG_OP = 'DELETE' THEN OLD.seller_id ELSE NEW.seller_id END;
  UPDATE public.users
  SET
    rating_count = (SELECT COUNT(*)       FROM public.reviews WHERE seller_id = target_seller),
    rating_avg   = COALESCE((SELECT AVG(rating) FROM public.reviews WHERE seller_id = target_seller), 0)
  WHERE id = target_seller;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_change
  AFTER INSERT OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_seller_rating();

-- Saved items (wishlist)
CREATE TABLE public.saved_items (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id        UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  listing_id     UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  price_at_save  NUMERIC(10,2),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, listing_id)
);

-- Price drop alert support
ALTER TABLE public.saved_items ADD COLUMN IF NOT EXISTS price_at_save NUMERIC(10,2);

ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved"
  ON public.saved_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can save listings"
  ON public.saved_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave listings"
  ON public.saved_items FOR DELETE USING (auth.uid() = user_id);

-- =============================================================
-- INDEXES (performance)
-- =============================================================

CREATE INDEX idx_listings_seller_id   ON public.listings (seller_id);
CREATE INDEX idx_listings_category    ON public.listings (category);
CREATE INDEX idx_listings_status      ON public.listings (status);
CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at DESC);
CREATE INDEX idx_conversations_buyer  ON public.conversations (buyer_id);
CREATE INDEX idx_conversations_seller ON public.conversations (seller_id);
CREATE INDEX idx_saved_items_user    ON public.saved_items (user_id);
CREATE INDEX idx_saved_items_listing ON public.saved_items (listing_id);
CREATE INDEX idx_reviews_seller      ON public.reviews (seller_id);
CREATE INDEX idx_reviews_reviewer    ON public.reviews (reviewer_id);

-- View count
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;

-- Save count (maintained by trigger on saved_items)
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS save_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION update_save_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.listings SET save_count = save_count + 1 WHERE id = NEW.listing_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.listings SET save_count = save_count - 1 WHERE id = OLD.listing_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_save_count
AFTER INSERT OR DELETE ON public.saved_items
FOR EACH ROW EXECUTE FUNCTION update_save_count();

-- Draft listings: extend status constraint + update RLS
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('available', 'sold', 'draft'));

DROP POLICY IF EXISTS "Listings are publicly viewable" ON public.listings;
CREATE POLICY "Listings are publicly viewable"
  ON public.listings FOR SELECT USING (status != 'draft' OR auth.uid() = seller_id);

-- sold_at timestamp for social proof
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- Reports
CREATE TABLE public.reports (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reporter_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  listing_id  UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  seller_id   UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (reporter_id, listing_id)
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT USING (auth.uid() = reporter_id);

-- Blocked users
CREATE TABLE public.blocked_users (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  blocker_id  UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  blocked_id  UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own blocks"
  ON public.blocked_users FOR ALL USING (auth.uid() = blocker_id);

-- Seller response rate
CREATE OR REPLACE FUNCTION public.get_seller_response_rate(p_seller_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_convs   INT;
  replied_convs INT;
BEGIN
  SELECT COUNT(*) INTO total_convs
  FROM public.conversations
  WHERE seller_id = p_seller_id;

  IF total_convs = 0 THEN RETURN NULL; END IF;

  SELECT COUNT(DISTINCT conversation_id) INTO replied_convs
  FROM public.messages
  WHERE sender_id = p_seller_id
    AND conversation_id IN (
      SELECT id FROM public.conversations WHERE seller_id = p_seller_id
    );

  RETURN ROUND((replied_convs::NUMERIC / total_convs::NUMERIC) * 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_view_count(listing_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.listings SET view_count = view_count + 1 WHERE id = listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomically consume an invite code (returns true if consumed, false if already used/not found)
-- Runs as SECURITY DEFINER so it's callable by unauthenticated users during signup
CREATE OR REPLACE FUNCTION public.consume_invite(p_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.invites
  SET is_used = TRUE, used_at = NOW()
  WHERE code = p_code AND is_used = FALSE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomically consume an invite code and activate the user as a seller.
-- Returns TRUE if both steps succeeded; rolls back entirely on failure.
CREATE OR REPLACE FUNCTION public.activate_seller(p_code TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INT;
BEGIN
  -- Consume the invite
  UPDATE public.invites
  SET is_used = TRUE, used_at = NOW()
  WHERE code = p_code AND is_used = FALSE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN FALSE;
  END IF;

  -- Activate seller
  UPDATE public.users
  SET is_seller = TRUE
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- PUSH NOTIFICATION TOKENS
-- =============================================================
CREATE TABLE public.push_tokens (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  token      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens"
  ON public.push_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tokens"
  ON public.push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tokens"
  ON public.push_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tokens"
  ON public.push_tokens FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_push_tokens_user ON public.push_tokens (user_id);

-- NOTE: A Database Webhook must be configured in Supabase Dashboard:
-- Table: public.messages, Event: INSERT
-- URL: <project-ref>.supabase.co/functions/v1/push-notification
-- Header: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>

-- =============================================================
-- REALTIME
-- Enable realtime for messaging tables
-- =============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- =============================================================
-- SELLER HUB TABLES
-- =============================================================

-- Listing views (all surfaces — grid, search, story taps, listing detail)
CREATE TABLE public.listing_views (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES public.users (id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings (id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert listing views"
  ON public.listing_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Sellers can read views on their listings"
  ON public.listing_views FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() IN (SELECT seller_id FROM public.listings WHERE id = listing_id));

CREATE INDEX idx_listing_views_listing ON public.listing_views (listing_id);
CREATE INDEX idx_listing_views_user    ON public.listing_views (user_id);

-- Story views (tracks which stories each buyer has seen)
CREATE TABLE public.story_views (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES public.users (id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings (id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, listing_id)
);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert story views"
  ON public.story_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own story views"
  ON public.story_views FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can read their own story views"
  ON public.story_views FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Profile views
CREATE TABLE public.profile_views (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_user_id UUID REFERENCES public.users (id) ON DELETE CASCADE,
  viewer_user_id  UUID REFERENCES public.users (id) ON DELETE CASCADE,
  viewed_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert profile views"
  ON public.profile_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_user_id);
CREATE POLICY "Profile owners can read their views"
  ON public.profile_views FOR SELECT TO authenticated USING (auth.uid() = profile_user_id);

CREATE INDEX idx_profile_views_profile ON public.profile_views (profile_user_id);

-- Transactions (Stripe Connect — buyer to seller payments)
CREATE TABLE public.transactions (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id       UUID REFERENCES public.listings (id) ON DELETE SET NULL,
  seller_id        UUID REFERENCES public.users (id) ON DELETE SET NULL,
  buyer_id         UUID REFERENCES public.users (id) ON DELETE SET NULL,
  amount           NUMERIC(10,2) NOT NULL,
  stripe_payment_id TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE INDEX idx_transactions_seller ON public.transactions (seller_id);
CREATE INDEX idx_transactions_buyer  ON public.transactions (buyer_id);

-- Listing price history (seller eyes only)
CREATE TABLE public.listing_price_history (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES public.listings (id) ON DELETE CASCADE,
  old_price  NUMERIC(10,2) NOT NULL,
  new_price  NUMERIC(10,2) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.listing_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can read price history for their listings"
  ON public.listing_price_history FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT seller_id FROM public.listings WHERE id = listing_id));

CREATE INDEX idx_price_history_listing ON public.listing_price_history (listing_id);

-- In-app notifications (price drop alerts etc.)
CREATE TABLE public.notifications (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES public.users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  listing_id UUID REFERENCES public.listings (id) ON DELETE CASCADE,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications"
  ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_notifications_user ON public.notifications (user_id);

-- =============================================================
-- COLLECTIONS
-- =============================================================
CREATE TABLE public.collections (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  seller_id  UUID REFERENCES public.users (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Collections are publicly readable"
  ON public.collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sellers can create their own collections"
  ON public.collections FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can update their own collections"
  ON public.collections FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can delete their own collections"
  ON public.collections FOR DELETE TO authenticated USING (auth.uid() = seller_id);

-- =============================================================
-- PAYMENTS — MARKETPLACE, WALLET, PLATFORM SETTINGS
-- =============================================================

-- New columns on users (payments + address)
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address_line1 TEXT;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address_line2 TEXT;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city TEXT;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS postcode TEXT;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'United Kingdom';
-- (stripe_account_id and stripe_onboarding_complete already exist above)

-- Orders (full order lifecycle with escrow)
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

-- Seller wallet (pending + available + lifetime balances)
CREATE TABLE public.seller_wallet (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  seller_id         UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL UNIQUE,
  pending_balance   NUMERIC(10,2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  lifetime_earned   NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.seller_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can read their own wallet"
  ON public.seller_wallet FOR SELECT TO authenticated
  USING (auth.uid() = seller_id);

CREATE INDEX idx_wallet_seller ON public.seller_wallet (seller_id);

-- Wallet update trigger (credits/debits seller_wallet on order status changes)
CREATE OR REPLACE FUNCTION public.handle_order_wallet_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' AND NEW.status = 'shipped' THEN
    UPDATE public.seller_wallet
    SET pending_balance = pending_balance + NEW.item_price
    WHERE user_id = NEW.seller_id;
  END IF;
  IF OLD.status IN ('shipped', 'delivered') AND NEW.status = 'completed' THEN
    UPDATE public.seller_wallet
    SET
      pending_balance   = GREATEST(0, pending_balance - NEW.item_price),
      available_balance = available_balance + NEW.item_price,
      lifetime_earned   = lifetime_earned + NEW.item_price,
      updated_at        = NOW()
    WHERE user_id = NEW.seller_id;
  END IF;
  IF OLD.status = 'shipped' AND NEW.status = 'cancelled' THEN
    UPDATE public.seller_wallet
    SET
      pending_balance = GREATEST(0, pending_balance - NEW.item_price),
      updated_at      = NOW()
    WHERE user_id = NEW.seller_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS order_wallet_update ON public.orders;
CREATE TRIGGER order_wallet_update
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_wallet_update();

-- Auto-release function (called by Edge Function cron every hour)
CREATE OR REPLACE FUNCTION public.auto_release_orders()
RETURNS void AS $$
BEGIN
  UPDATE public.orders
  SET status = 'completed', completed_at = NOW()
  WHERE status = 'shipped'
    AND auto_release_at IS NOT NULL
    AND auto_release_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Platform settings (Founder Plan config etc.)
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

-- Cancellation strikes (seller accountability)
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

-- Dispute evidence (photo uploads for buyer disputes)
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
