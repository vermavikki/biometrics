-- ==============================================================================
-- Supabase Migration: Advanced Face Liveness Detection & Anti-Spoofing System
-- Date: 2026-11-10
-- Description:
--   1. Enables pgvector for 128-dimensional biometric embeddings.
--   2. Preserves and configures 'user_face_profiles' and 'verify_user_face' RPC.
--   3. Creates 'face_verification_sessions' for cryptographically secured sessions.
--   4. Creates 'face_verification_logs' for security auditing and presentation attack logging.
--   5. Creates 'face_rate_limits' to thwart brute-force and credential stuffing attacks.
--   6. Enforces strict Row Level Security (RLS) policies.
-- ==============================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Base table for enrolled facial biometric profiles
CREATE TABLE IF NOT EXISTS public.user_face_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    embedding vector(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for biometric vector similarity search
CREATE INDEX IF NOT EXISTS idx_user_face_profiles_embedding 
ON public.user_face_profiles 
USING ivfflat (embedding vector_l2_ops) 
WITH (lists = 100);

-- 3. Stored Procedure: verify_user_face using pgvector Euclidean distance
CREATE OR REPLACE FUNCTION public.verify_user_face(
    candidate_embedding vector(128),
    match_threshold DOUBLE PRECISION DEFAULT 0.45
)
RETURNS TABLE (
    is_match BOOLEAN,
    distance DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_uid UUID;
    stored_embedding vector(128);
    calculated_distance DOUBLE PRECISION;
BEGIN
    current_uid := auth.uid();
    
    IF current_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT embedding INTO stored_embedding
    FROM public.user_face_profiles
    WHERE user_id = current_uid;

    IF stored_embedding IS NULL THEN
        RETURN QUERY SELECT FALSE, 999.0::DOUBLE PRECISION;
        RETURN;
    END IF;

    -- Calculate L2 Euclidean distance between vectors
    calculated_distance := stored_embedding <-> candidate_embedding;

    RETURN QUERY
    SELECT 
        (calculated_distance <= match_threshold) AS is_match,
        calculated_distance AS distance;
END;
$$;

-- 4. Table: face_verification_sessions (Short-lived, server-issued verification sessions)
CREATE TABLE IF NOT EXISTS public.face_verification_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('enroll', 'verify')),
    challenges JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_step INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'EXPIRED', 'SPOOF_DETECTED')),
    passive_score NUMERIC(5, 4),
    spoof_indicators JSONB DEFAULT '[]'::jsonb,
    device_info JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_face_sessions_token 
ON public.face_verification_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_face_sessions_user 
ON public.face_verification_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_face_sessions_expires 
ON public.face_verification_sessions(expires_at);

-- 5. Table: face_verification_logs (Comprehensive security audit trail)
CREATE TABLE IF NOT EXISTS public.face_verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.face_verification_sessions(id) ON DELETE SET NULL,
    user_id UUID,
    mode TEXT NOT NULL CHECK (mode IN ('enroll', 'verify')),
    decision TEXT NOT NULL CHECK (decision IN ('VERIFIED', 'FAILED', 'SPOOF_DETECTED', 'INCONCLUSIVE', 'EXPIRED', 'RETRY_REQUIRED')),
    rejection_reason TEXT,
    passive_metrics JSONB DEFAULT '{}'::jsonb,
    active_metrics JSONB DEFAULT '{}'::jsonb,
    device_info JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_logs_created 
ON public.face_verification_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_face_logs_decision 
ON public.face_verification_logs(decision);

-- 6. Table: face_rate_limits (Anti-hammering / brute-force protection)
CREATE TABLE IF NOT EXISTS public.face_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL UNIQUE, -- e.g. user_id or hashed IP
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_rate_limits_ident 
ON public.face_rate_limits(identifier);

-- 7. Storage Bucket setup for biometric reference images
INSERT INTO storage.buckets (id, name, public)
VALUES ('face-verifications', 'face-verifications', false)
ON CONFLICT (id) DO NOTHING;

-- 8. Row Level Security (RLS) Configuration

-- Enable RLS
ALTER TABLE public.user_face_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_verification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_rate_limits ENABLE ROW LEVEL SECURITY;

-- user_face_profiles policies
CREATE POLICY "Users can view their own biometric profile"
ON public.user_face_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own biometric profile"
ON public.user_face_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own biometric profile"
ON public.user_face_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- face_verification_sessions policies
CREATE POLICY "Users can view their own sessions"
ON public.face_verification_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- face_verification_logs policies
CREATE POLICY "Users can view their own logs"
ON public.face_verification_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Storage bucket access policies
CREATE POLICY "Users can read own verification images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'face-verifications' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload own verification images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'face-verifications' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Comment on tables explaining security compliance
COMMENT ON TABLE public.user_face_profiles IS 'Enrolled face embeddings (128D) for biometric comparison.';
COMMENT ON TABLE public.face_verification_sessions IS 'Server-issued cryptographic liveness verification sessions with one-time challenges.';
COMMENT ON TABLE public.face_verification_logs IS 'Audit trail recording all face liveness outcomes, presentation attack detection, and decisions.';
COMMENT ON TABLE public.face_rate_limits IS 'Failed attempt counter and temporary lockout mechanism for biometric security.';

