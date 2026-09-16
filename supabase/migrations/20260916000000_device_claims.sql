/*
 * Migration: claim_device + get_device_monitors(p_device_identifier) — per-device config-code model
 *
 * Changes:
 *   1. Adds config_code_hash, config_code_expires_at, revoked columns to devices
 *   2. Drops devices.identifier NOT NULL constraint (allows re-binding)
 *   3. Creates device_claims audit table
 *   4. Replaces claim_device_setup(text, uuid) → claim_device(p_code, p_device_identifier)
 *   5. Replaces get_device_monitors(text, text) → get_device_monitors(p_device_identifier)
 *   6. Drops device_setup_codes table and enforce_device_limit trigger
 *   7. Alters device_setup_attempts.device_identifier to text for new RPC signature
 *   8. Grants EXECUTE to anon and authenticated roles
 */

-- ─── 1. Extend devices table ──────────────────────────────────────────────────
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS config_code_hash   text,
  ADD COLUMN IF NOT EXISTS config_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked            boolean NOT NULL DEFAULT false;

-- Allow identifier to be NULL (device can be re-bound to new identifier)
ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS devices_identifier_key;

ALTER TABLE public.devices
  ALTER COLUMN identifier DROP NOT NULL;

-- Keep unique constraint on non-null identifiers (allows only one active binding per identifier)
CREATE UNIQUE INDEX IF NOT EXISTS devices_identifier_unique
  ON public.devices (identifier)
  WHERE identifier IS NOT NULL;

-- ─── 2. device_claims audit table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_claims (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id        uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  device_identifier text NOT NULL,
  claimed_at       timestamptz NOT NULL DEFAULT now()
);

-- index for device-based lookups (audit queries)
CREATE INDEX IF NOT EXISTS idx_device_claims_device_id
  ON public.device_claims (device_id);

ALTER TABLE public.device_claims ENABLE ROW LEVEL SECURITY;

-- No user-facing RLS — only service_role (via RPC) touches this table
-- Policy: superuser only (default: no access for anon/authenticated)

-- ─── 3. Drop claim_device_setup function and device_setup_codes table ─────────
DROP TRIGGER IF EXISTS enforce_device_limit ON public.device_setup_codes;
DROP FUNCTION IF EXISTS public.claim_device_setup;
DROP TABLE IF EXISTS public.device_setup_codes;

-- ─── 4. Drop old get_device_monitors(text, text) ─────────────────────────────
DROP FUNCTION IF EXISTS public.get_device_monitors;

-- ─── 5. Rate-limit tables: align device_identifier to text ─────────────────────
-- claim_device receives a text identifier (device uuid as string), so the
-- per-identifier rate-limit store must accept text instead of uuid.
ALTER TABLE public.device_setup_attempts
  ALTER COLUMN device_identifier TYPE text;

-- ─── 6. New claim_device RPC ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_device(
  p_code             text,
  p_device_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_code            text := trim(coalesce(p_code, ''));
  v_id              text := trim(lower(coalesce(p_device_identifier, '')));
  v_hash            text;
  v_device          public.devices%ROWTYPE;
  v_global_attempt  public.device_setup_global_attempts%ROWTYPE;
  v_attempt         public.device_setup_attempts%ROWTYPE;
BEGIN
  -- ── Fast path on malformed input (no rate-limit side effects) ──
  IF length(v_code) < 6 OR length(v_code) > 8 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CODE',
      'message', 'El código debe tener entre 6 y 8 caracteres'
    );
  END IF;

  IF v_id = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_IDENTIFIER',
      'message', 'El identificador del dispositivo no es válido'
    );
  END IF;

  -- ── Rate limit: global counter (30 attempts / 15 minutes) ──
  INSERT INTO public.device_setup_global_attempts (id, window_started_at, attempt_count, last_attempt_at)
  VALUES (true, now(), 1, now())
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_global_attempt
  FROM public.device_setup_global_attempts
  WHERE id
  FOR UPDATE;

  IF v_global_attempt.window_started_at <= now() - interval '15 minutes' THEN
    UPDATE public.device_setup_global_attempts
       SET window_started_at = now(), attempt_count = 1, last_attempt_at = now()
     WHERE id
    RETURNING * INTO v_global_attempt;
  ELSIF v_global_attempt.attempt_count >= 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'GLOBAL_RATE_LIMITED',
      'message', 'Demasiados intentos. Intenta de nuevo más tarde.'
    );
  ELSE
    UPDATE public.device_setup_global_attempts
       SET attempt_count = attempt_count + 1, last_attempt_at = now()
     WHERE id
    RETURNING * INTO v_global_attempt;
  END IF;

  -- ── Rate limit: per-identifier counter (5 attempts / 15 minutes) ──
  INSERT INTO public.device_setup_attempts (device_identifier, window_started_at, attempt_count, last_attempt_at)
  VALUES (v_id, now(), 1, now())
  ON CONFLICT (device_identifier) DO NOTHING;

  SELECT * INTO v_attempt
  FROM public.device_setup_attempts
  WHERE device_identifier = v_id
  FOR UPDATE;

  IF v_attempt.window_started_at <= now() - interval '15 minutes' THEN
    UPDATE public.device_setup_attempts
       SET window_started_at = now(), attempt_count = 1, last_attempt_at = now()
     WHERE device_identifier = v_id
    RETURNING * INTO v_attempt;
  ELSIF v_attempt.attempt_count >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Demasiados intentos. Intenta de nuevo más tarde.'
    );
  ELSE
    UPDATE public.device_setup_attempts
       SET attempt_count = attempt_count + 1, last_attempt_at = now()
     WHERE device_identifier = v_id
    RETURNING * INTO v_attempt;
  END IF;

  -- ── Locate device by its config code hash ──
  v_hash := encode(digest(lower(v_code), 'sha256'), 'hex');

  SELECT * INTO v_device
  FROM public.devices d
  WHERE d.config_code_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CODE_NOT_FOUND',
      'message', 'El código de configuración no es válido'
    );
  END IF;

  -- ── Device-level checks ──
  IF v_device.revoked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_REVOKED',
      'message', 'Este dispositivo ha sido revocado.'
    );
  END IF;

  IF NOT v_device.active THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_INACTIVE',
      'message', 'Este dispositivo no está activo.'
    );
  END IF;

  IF v_device.config_code_expires_at IS NOT NULL
     AND v_device.config_code_expires_at <= now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CODE_EXPIRED',
      'message', 'El código de configuración ha expirado.'
    );
  END IF;

  -- ── Bind this device to the supplied identifier (re-linking allowed) ──
  UPDATE public.devices
     SET identifier = v_id,
         active = true,
         last_seen_at = now()
   WHERE id = v_device.id;

  -- ── Write audit row ──
  INSERT INTO public.device_claims (device_id, device_identifier, claimed_at)
  VALUES (v_device.id, v_id, now());

  RETURN jsonb_build_object(
    'success', true,
    'device_id', v_device.id,
    'device_name', v_device.name,
    'school_id', v_device.school_id,
    'identifier', v_id
  );
END;
$$;

-- ─── 7. New get_device_monitors(p_device_identifier) ───────────────────────────
CREATE OR REPLACE FUNCTION public.get_device_monitors(p_device_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_device          public.devices%ROWTYPE;
  v_monitors        jsonb;
BEGIN
  -- ── Find device by identifier ──
  SELECT * INTO v_device
  FROM public.devices d
  WHERE d.identifier = trim(lower(p_device_identifier));

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_NOT_FOUND',
      'message', 'Dispositivo no encontrado. Realiza la vinculación primero.'
    );
  END IF;

  -- ── Check active ──
  IF NOT v_device.active THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_INACTIVE',
      'message', 'Este dispositivo no está activo. Contacta al administrador.'
    );
  END IF;

  -- ── Check revoked ──
  IF v_device.revoked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_REVOKED',
      'message', 'Este código ha sido revocado. Contacta al administrador.'
    );
  END IF;

  -- ── Update last_seen_at ──
  UPDATE public.devices
  SET last_seen_at = now()
  WHERE id = v_device.id;

  -- ── Return monitors for this device's school ──
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'first_name', m.first_name,
      'last_name', m.last_name,
      'code', m.code,
      'school_id', m.school_id,
      'school_name', s.name,
      'login_email', coalesce(au.email, lower(m.first_name || '.' || m.last_name) || '@llumitaula.local')
    ) ORDER BY m.last_name, m.first_name
  ), '[]'::jsonb)
  INTO v_monitors
  FROM public.monitors m
  JOIN public.schools s ON s.id = m.school_id
  LEFT JOIN auth.users au ON au.id = m.user_id
  WHERE m.school_id = v_device.school_id
    AND m.user_id IS NOT NULL;

  RETURN jsonb_build_object(
    'success', true,
    'device_id', v_device.id,
    'device_identifier', v_device.identifier,
    'school_id', v_device.school_id,
    'school_name', (SELECT name FROM public.schools WHERE id = v_device.school_id),
    'monitors', v_monitors
  );
END;
$$;

-- ─── 8. Grants ─────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.claim_device(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_device_monitors(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_device(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_device_monitors(text) TO anon, authenticated;
