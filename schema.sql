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
  status      TEXT DEFAULT 'available' CHECK (status IN ('available', 'sold')),
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
  ON public.listings FOR SELECT USING (true);

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

CREATE POLICY "Buyers can create conversations"
  ON public.conversations FOR INSERT WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Participants can update conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Messages
CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- =============================================================
-- INDEXES (performance)
-- =============================================================

CREATE INDEX idx_listings_seller_id   ON public.listings (seller_id);
CREATE INDEX idx_listings_category    ON public.listings (category);
CREATE INDEX idx_listings_status      ON public.listings (status);
CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at DESC);
CREATE INDEX idx_conversations_buyer  ON public.conversations (buyer_id);
CREATE INDEX idx_conversations_seller ON public.conversations (seller_id);
