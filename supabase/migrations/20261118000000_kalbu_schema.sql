-- ============================================================
-- Kalbu — Full-Stack Database Schema & Live Dataset Sync
-- Copy & Run this entire script in Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Custom Enums (Safe creation)
DO $$ BEGIN
  CREATE TYPE emotion_label AS ENUM (
    'sadness', 'joy', 'love', 'anger', 'fear', 'surprise'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE match_status AS ENUM (
    'searching', 'matched', 'expired', 'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- TABLE 1: kalbu_users (Registered Users & Email Verification)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kalbu_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  anonymous_handle TEXT NOT NULL,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT true,
  agreed_to_terms_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified_at TIMESTAMPTZ,
  verification_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: encrypted_diary_entries (Zero-Knowledge AES-GCM-256)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.encrypted_diary_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure user_id accepts both email and UUID strings seamlessly
ALTER TABLE public.encrypted_diary_entries
  DROP CONSTRAINT IF EXISTS encrypted_diary_entries_user_id_fkey;
ALTER TABLE public.encrypted_diary_entries
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

CREATE INDEX IF NOT EXISTS idx_diary_user_recorded
  ON public.encrypted_diary_entries(user_id, recorded_at DESC);

-- ============================================================
-- TABLE 3: emotion_vectors (AI Emotion Dataset & Circumplex)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.emotion_vectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL UNIQUE REFERENCES public.encrypted_diary_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  primary_emotion emotion_label NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  valence REAL NOT NULL CHECK (valence >= -1.0 AND valence <= 1.0),
  arousal REAL NOT NULL CHECK (arousal >= -1.0 AND arousal <= 1.0),
  quadrant TEXT GENERATED ALWAYS AS (
    CASE
      WHEN valence >= 0 AND arousal >= 0 THEN 'High-Energy Pleasant'
      WHEN valence < 0  AND arousal >= 0 THEN 'High-Energy Unpleasant'
      WHEN valence < 0  AND arousal < 0  THEN 'Low-Energy Unpleasant'
      ELSE 'Low-Energy Pleasant'
    END
  ) STORED,
  emotion_probs vector(6) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.emotion_vectors
  DROP CONSTRAINT IF EXISTS emotion_vectors_user_id_fkey;
ALTER TABLE public.emotion_vectors
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

CREATE INDEX IF NOT EXISTS idx_emotion_user_date
  ON public.emotion_vectors(user_id, recorded_at DESC);

-- ============================================================
-- TABLE 4: matching_pool ("Feeling Twin" Real-Time Queue)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matching_pool (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL UNIQUE,
  anonymous_handle TEXT DEFAULT 'Anonymous Student',
  emotion_vector_id UUID REFERENCES public.emotion_vectors(id) ON DELETE CASCADE,
  emotion_probs vector(6) NOT NULL,
  valence REAL NOT NULL,
  arousal REAL NOT NULL,
  primary_emotion emotion_label NOT NULL,
  status match_status NOT NULL DEFAULT 'searching',
  matched_with_user_id TEXT,
  room_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

ALTER TABLE public.matching_pool
  DROP CONSTRAINT IF EXISTS matching_pool_user_id_fkey;
ALTER TABLE public.matching_pool
  DROP CONSTRAINT IF EXISTS matching_pool_matched_with_user_id_fkey;
ALTER TABLE public.matching_pool
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.matching_pool
  ADD COLUMN IF NOT EXISTS anonymous_handle TEXT DEFAULT 'Anonymous Student';

CREATE INDEX IF NOT EXISTS idx_matching_pool_vector
  ON public.matching_pool USING hnsw (emotion_probs vector_cosine_ops);

-- ============================================================
-- TABLE 5: feeling_twin_messages (Anonymous Solidarity Notes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.feeling_twin_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id TEXT NOT NULL,
  recipient_handle TEXT NOT NULL,
  shared_emotion TEXT NOT NULL,
  similarity_score REAL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 6: faq_questions (Chatbot Questions & Answers Dataset)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.faq_questions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General Guide',
  asked_count INTEGER NOT NULL DEFAULT 1,
  is_user_submitted BOOLEAN NOT NULL DEFAULT true,
  last_asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 7: music_mapping (ISO Principle Music Therapy Catalog)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.music_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  external_embed_url TEXT,
  target_emotion emotion_label NOT NULL,
  valence_min REAL NOT NULL CHECK (valence_min >= -1.0 AND valence_min <= 1.0),
  valence_max REAL NOT NULL CHECK (valence_max >= -1.0 AND valence_max <= 1.0),
  arousal_min REAL NOT NULL CHECK (arousal_min >= -1.0 AND arousal_min <= 1.0),
  arousal_max REAL NOT NULL CHECK (arousal_max >= -1.0 AND arousal_max <= 1.0),
  therapeutic_stage INTEGER NOT NULL DEFAULT 1 CHECK (therapeutic_stage IN (1, 2, 3)),
  bpm INTEGER,
  tags TEXT[] DEFAULT '{}'
);

-- ============================================================
-- TABLE 8: banned_words_registry (18+ / Explicit Terms Database)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.banned_words_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  banned_term TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '18+_sexual_explicit',
  auto_added_from_violation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 9: restricted_incident_logs (18+ Violation Backup DB)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.restricted_incident_logs (
  incident_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  strike_number INTEGER NOT NULL CHECK (strike_number >= 1),
  action_taken TEXT NOT NULL CHECK (
    action_taken IN ('STRIKE_1_FINAL_WARNING_ISSUED', 'STRIKE_2_PERMANENT_ACCOUNT_BAN')
  ),
  flagged_keywords TEXT[] NOT NULL DEFAULT '{}',
  raw_title TEXT,
  raw_content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR FULL APP SYNC
-- ============================================================
ALTER TABLE public.kalbu_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feeling_twin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_words_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restricted_incident_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow app access to kalbu_users" ON public.kalbu_users;
CREATE POLICY "Allow app access to kalbu_users" ON public.kalbu_users
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow app access to encrypted_diary_entries" ON public.encrypted_diary_entries;
CREATE POLICY "Allow app access to encrypted_diary_entries" ON public.encrypted_diary_entries
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow app access to emotion_vectors" ON public.emotion_vectors;
CREATE POLICY "Allow app access to emotion_vectors" ON public.emotion_vectors
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow app access to matching_pool" ON public.matching_pool;
CREATE POLICY "Allow app access to matching_pool" ON public.matching_pool
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow app access to feeling_twin_messages" ON public.feeling_twin_messages;
CREATE POLICY "Allow app access to feeling_twin_messages" ON public.feeling_twin_messages
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow app access to faq_questions" ON public.faq_questions;
CREATE POLICY "Allow app access to faq_questions" ON public.faq_questions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow app access to music_mapping" ON public.music_mapping;
CREATE POLICY "Allow app access to music_mapping" ON public.music_mapping
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow app access to banned_words_registry" ON public.banned_words_registry;
CREATE POLICY "Allow app access to banned_words_registry" ON public.banned_words_registry
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow app access to restricted_incident_logs" ON public.restricted_incident_logs;
CREATE POLICY "Allow app access to restricted_incident_logs" ON public.restricted_incident_logs
  FOR ALL USING (true) WITH CHECK (true);
