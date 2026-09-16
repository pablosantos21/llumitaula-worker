/*
 * Migration: claim_device — reject identifier collisions cleanly
 *
 * A monitor whose iPad identifier is already bound to a different device must
 * get a controlled business rejection (IDENTIFIER_IN_USE), not a raw 23505
 * unique_violation from the devices_identifier_unique partial index.
 *
 * Changes:
 *   1. Replaces claim_device with a pre-update guard against identifier theft.
 *   2. Wraps the binding UPDATE so a check/update race that still hits 23505 is
 *      translated to the same rejection instead of propagating.
 *
 * The rejection happens after device-level checks and before the binding
 * UPDATE, so it shares the existing per-attempt rate-limit accounting with
 * CODE_NOT_FOUND, writes no device_claims audit row, and leaves the existing
 * binding untouched. Re-claiming the same device with its own identifier is
 * unaffected.
 */

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

  -- ── Guard against identifier theft ──
  -- The identifier is minted per browser: it may belong to only one device.
  -- Re-claiming the same device with its own identifier is allowed.
  IF EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.identifier = v_id
      AND d.id <> v_device.id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'IDENTIFIER_IN_USE',
      'message', 'Este iPad ya está vinculado a otro panel. Contacta con la administración.'
    );
  END IF;

  -- ── Bind this device to the supplied identifier (re-linking allowed) ──
  -- The pre-check above can be raced by two concurrent claims; the partial
  -- unique index is the source of truth, so translate its 23505 into the
  -- same clean rejection.
  BEGIN
    UPDATE public.devices
       SET identifier = v_id,
           active = true,
           last_seen_at = now()
     WHERE id = v_device.id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'IDENTIFIER_IN_USE',
      'message', 'Este iPad ya está vinculado a otro panel. Contacta con la administración.'
    );
  END;

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
