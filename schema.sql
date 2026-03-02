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
  id                    UUID REFERENCES auth.users (id) ON DELETE CASCADE PRIMARY KEY,
  username              TEXT UNIQUE NOT NULL,
  full_name             TEXT NOT NULL,
  avatar_url            TEXT,
  bio                   TEXT,
  preferred_categories  TEXT[] DEFAULT '{}',
  onboarding_completed  BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
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
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  category    TEXT NOT NULL,
  condition   TEXT NOT NULL,
  size        TEXT,
  images      TEXT[] DEFAULT '{}',
  status      TEXT DEFAULT 'available' CHECK (status IN ('available', 'sold', 'draft')),
  view_count  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (one per listing + buyer pair)
CREATE TABLE public.conversations (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id    UUID REFERENCES public.listings (id) ON DELETE CASCADE NOT NULL,
  buyer_id      UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  seller_id     UUID REFERENCES public.users (id) ON DELETE CASCADE NOT NULL,
  last_message  TEXT,
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
  SET last_message = NEW.content, updated_at = NOW()
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

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE USING (auth.uid() = id);

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
  ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

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

-- Prevent authenticated users from directly writing to rating fields.
-- update_seller_rating is SECURITY DEFINER (runs as owner) so it is exempt.
REVOKE UPDATE (rating_avg, rating_count) ON public.users FROM authenticated;

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

-- Draft listings: extend status constraint + update RLS
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('available', 'sold', 'draft'));

DROP POLICY IF EXISTS "Listings are publicly viewable" ON public.listings;
CREATE POLICY "Listings are publicly viewable"
  ON public.listings FOR SELECT USING (status != 'draft' OR auth.uid() = seller_id);

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
