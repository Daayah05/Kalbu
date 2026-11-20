-- ============================================================
-- Kalbu — Full-Stack Database Schema & pgvector Migration
-- Tables: users, encrypted_diary_entries, emotion_vectors,
--         matching_pool, music_mapping
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Custom Enums
CREATE TYPE emotion_label AS ENUM (
  'sadness', 'joy', 'love', 'anger', 'fear', 'surprise'
);

CREATE TYPE match_status AS ENUM (
  'searching', 'matched', 'expired', 'cancelled'
);

-- ============================================================
-- TABLE 1: users (Public Profile & Zero-Knowledge Key Metadata)
-- ============================================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_handle TEXT NOT NULL UNIQUE,
  avatar_seed TEXT NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  encryption_salt TEXT NOT NULL,
  key_check_cipher TEXT NOT NULL,
  key_check_iv TEXT NOT NULL,
  preferred_music_principle TEXT NOT NULL DEFAULT 'iso'
    CHECK (preferred_music_principle IN ('iso', 'compensatory')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: encrypted_diary_entries (Zero-Knowledge AES-GCM-256)
-- ============================================================
CREATE TABLE public.encrypted_diary_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_diary_user_recorded
  ON public.encrypted_diary_entries(user_id, recorded_at DESC);

-- ============================================================
-- TABLE 3: emotion_vectors (Russell's Circumplex & 6D Vector)
-- ============================================================
CREATE TABLE public.emotion_vectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL UNIQUE REFERENCES public.encrypted_diary_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

CREATE INDEX idx_emotion_user_date
  ON public.emotion_vectors(user_id, recorded_at DESC);

-- ============================================================
-- TABLE 4: matching_pool ("Feeling Twin" Real-Time Queue)
-- ============================================================
CREATE TABLE public.matching_pool (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  emotion_vector_id UUID NOT NULL REFERENCES public.emotion_vectors(id) ON DELETE CASCADE,
  emotion_probs vector(6) NOT NULL,
  valence REAL NOT NULL,
  arousal REAL NOT NULL,
  primary_emotion emotion_label NOT NULL,
  status match_status NOT NULL DEFAULT 'searching',
  matched_with_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  room_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX idx_matching_pool_vector
  ON public.matching_pool USING hnsw (emotion_probs vector_cosine_ops);

-- ============================================================
-- TABLE 5: music_mapping (ISO Principle Music Therapy Catalog)
-- ============================================================
CREATE TABLE public.music_mapping (
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
-- RPC FUNCTION: Find "Feeling Twin" via Cosine Similarity
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_feeling_twin(
  p_user_id UUID,
  p_query_vector vector(6),
  p_valence REAL,
  p_arousal REAL,
  p_similarity_threshold REAL DEFAULT 0.92
)
RETURNS TABLE (
  twin_pool_id UUID,
  twin_user_id UUID,
  twin_emotion emotion_label,
  cosine_similarity REAL,
  circumplex_distance REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mp.id AS twin_pool_id,
    mp.user_id AS twin_user_id,
    mp.primary_emotion AS twin_emotion,
    (1 - (mp.emotion_probs <=> p_query_vector))::REAL AS cosine_similarity,
    sqrt(power(mp.valence - p_valence, 2) + power(mp.arousal - p_arousal, 2))::REAL AS circumplex_distance
  FROM public.matching_pool mp
  WHERE mp.user_id <> p_user_id
    AND mp.status = 'searching'
    AND mp.expires_at > NOW()
    AND (1 - (mp.emotion_probs <=> p_query_vector)) >= p_similarity_threshold
  ORDER BY (mp.emotion_probs <=> p_query_vector) ASC, circumplex_distance ASC
  LIMIT 1;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile" ON public.users
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users manage own encrypted entries" ON public.encrypted_diary_entries
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own emotion vectors" ON public.emotion_vectors
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own matching pool state" ON public.matching_pool
  FOR ALL USING (auth.uid() = user_id OR auth.uid() = matched_with_user_id);

CREATE POLICY "Anyone authenticated can read music catalog" ON public.music_mapping
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- SEED DATA: ISO Principle Therapeutic Soundtracks
-- ============================================================
INSERT INTO public.music_mapping
  (title, artist, audio_url, target_emotion, valence_min, valence_max, arousal_min, arousal_max, therapeutic_stage, bpm, tags)
VALUES
  ('Rain on Quiet Glass (ISO Stage 1: Mirror)', 'Kalbu Sound Lab', '/audio/rain-glass.mp3', 'sadness', -1.0, -0.3, -1.0, -0.2, 1, 58, ARRAY['ambient', 'rain', 'iso-mirror']),
  ('Warm Cello Horizon (ISO Stage 2: Bridge)', 'Kalbu Sound Lab', '/audio/cello-horizon.mp3', 'sadness', -0.4, 0.2, -0.6, 0.0, 2, 66, ARRAY['cello', 'warm', 'iso-bridge']),
  ('First Morning Light (ISO Stage 3: Uplift)', 'Kalbu Sound Lab', '/audio/morning-light.mp3', 'joy', 0.2, 1.0, -0.2, 0.5, 3, 76, ARRAY['piano', 'serene', 'iso-uplift']),
  ('Beta-to-Alpha Grounding Pulse', 'Kalbu Sound Lab', '/audio/alpha-grounding.mp3', 'fear', -1.0, -0.2, 0.3, 1.0, 1, 84, ARRAY['binaural', 'grounding', 'anxiolytic']),
  ('Deep Cedar Breathwork', 'Kalbu Sound Lab', '/audio/cedar-breath.mp3', 'anger', -1.0, -0.2, 0.4, 1.0, 2, 62, ARRAY['slow-tempo', 'de-escalation', 'nature']),
  ('Golden Hour Lo-Fi Study', 'Kalbu Sound Lab', '/audio/golden-hour.mp3', 'love', 0.3, 1.0, -0.3, 0.4, 1, 72, ARRAY['lofi', 'warmth', 'focus']);

-- ============================================================
-- TABLE 6: banned_words_registry (18+ / Explicit Terms Database)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.banned_words_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  banned_term TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '18+_sexual_explicit',
  auto_added_from_violation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 7: restricted_incident_logs (Forensic & Police Backup DB)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.restricted_incident_logs (
  incident_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
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

