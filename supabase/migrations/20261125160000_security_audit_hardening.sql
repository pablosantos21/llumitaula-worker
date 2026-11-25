-- Security audit hardening (#57):
--   1. Remove plaintext PIN/code exposure from get_device_monitors, filter out
--      inactive monitors, add per-device lookup rate limiting, and restrict
--      monitors.code column access.
--   2. Enforce strict school_id isolation for admin in
--      private.current_user_can_access_child and private.user_is_valid_in_school,
--      and validate caller tenant + prevent monitor impersonation in
--      public.record_meal_incident (preserving per-course columns and allowing
--      server-side now() when p_recorded_at is NULL).
--   3. Fix public.custom_access_token_hook to write {user_role} (never {role}),
--      populate {school_id}, and pin search_path safely.
--   4. Fix public.create_monitor: include users.school_id, use IS DISTINCT FROM,
--      validate admin tenant, decouple 6-digit text PIN from smallint code.
--   5. Harden public.claim_device: single-use config codes with mandatory
--      expiration, prevent hijacking bound devices, return uniform non-enumerable
--      errors, pin search_path, replace global 30-attempt DoS with per-code-hash
--      rate limiting.
--   6. Add server-side monitor PIN attempt tracking and lockout RPCs
--      (get_monitor_pin_lockout, verify_monitor_pin).
--   7. Allow same-school monitors to update today's meal_records while
--      preserving original recorded_by authorship.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Monitors: decouple plaintext PIN from monitors.code & restrict column read
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.monitors
  ALTER COLUMN code DROP NOT NULL;

REVOKE SELECT ON public.monitors FROM authenticated;
GRANT SELECT (id, first_name, last_name, school_id, user_id, created_at)
  ON public.monitors TO authenticated;

-- Per-identifier rate-limit table for get_device_monitors
CREATE TABLE IF NOT EXISTS public.device_monitor_lookup_attempts (
  device_identifier text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_monitor_lookup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.device_monitor_lookup_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_device_monitors(p_device_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_id        text := trim(lower(coalesce(p_device_identifier, '')));
  v_attempt   public.device_monitor_lookup_attempts%ROWTYPE;
  v_device    public.devices%ROWTYPE;
  v_monitors  jsonb;
BEGIN
  IF v_id = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_NOT_FOUND',
      'message', 'Dispositivo no encontrado. Realiza la vinculación primero.'
    );
  END IF;

  -- Per-identifier rate limit: 60 lookups / 15 minutes
  INSERT INTO public.device_monitor_lookup_attempts (
    device_identifier, window_started_at, attempt_count, last_attempt_at
  ) VALUES (v_id, now(), 1, now())
  ON CONFLICT (device_identifier) DO NOTHING;

  SELECT * INTO v_attempt
  FROM public.device_monitor_lookup_attempts
  WHERE device_identifier = v_id
  FOR UPDATE;

  IF v_attempt.window_started_at <= now() - interval '15 minutes' THEN
    UPDATE public.device_monitor_lookup_attempts
       SET window_started_at = now(), attempt_count = 1, last_attempt_at = now()
     WHERE device_identifier = v_id;
  ELSIF v_attempt.attempt_count >= 60 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMITED',
      'message', 'Demasiados intentos. Intenta de nuevo más tarde.'
    );
  ELSE
    UPDATE public.device_monitor_lookup_attempts
       SET attempt_count = attempt_count + 1, last_attempt_at = now()
     WHERE device_identifier = v_id;
  END IF;

  SELECT * INTO v_device
  FROM public.devices d
  WHERE d.identifier = v_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_NOT_FOUND',
      'message', 'Dispositivo no encontrado. Realiza la vinculación primero.'
    );
  END IF;

  IF NOT v_device.active THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_INACTIVE',
      'message', 'Este dispositivo no está activo. Contacta al administrador.'
    );
  END IF;

  IF v_device.revoked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DEVICE_REVOKED',
      'message', 'Este código ha sido revocado. Contacta al administrador.'
    );
  END IF;

  UPDATE public.devices
     SET last_seen_at = now()
   WHERE id = v_device.id;

  -- Return only active monitors and never expose code/credentials
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'first_name', m.first_name,
      'last_name', m.last_name,
      'school_id', m.school_id,
      'school_name', s.name,
      'login_email', coalesce(au.email, lower(m.first_name || '.' || m.last_name) || '@llumitaula.local')
    ) ORDER BY m.last_name, m.first_name
  ), '[]'::jsonb)
  INTO v_monitors
  FROM public.monitors m
  JOIN public.users u ON u.id = m.user_id AND u.active
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

REVOKE EXECUTE ON FUNCTION public.get_device_monitors(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_device_monitors(text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Strict multi-tenant isolation for admin & anti-impersonation in RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.current_user_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  select public.current_user_active()
     and exists (
       select 1
         from public.children ch
         join public.classes cl on cl.id = ch.class_id
        where ch.id = p_child_id
          and (
            (
              public.current_user_role() = 'admin'
              and cl.school_id = public.current_school_id()
            )
            or (
              public.current_user_role() = 'monitor'
              and cl.school_id in (select private.current_user_monitor_school_ids())
            )
            or exists (
              select 1 from public.parents_children pc
               where pc.child_id = ch.id
                 and pc.parent_id = public.current_user_id()
            )
          )
     )
$$;

CREATE OR REPLACE FUNCTION private.user_is_valid_in_school(p_user_id uuid, p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  select exists (
    select 1
      from public.users u
     where u.id = p_user_id
       and u.active
       and (
         (u.role::text = 'admin' and u.school_id = p_school_id)
         or exists (
           select 1
             from public.parents_children pc
             join public.children ch on ch.id = pc.child_id
             left join public.classes c on c.id = ch.class_id
            where pc.parent_id = u.id
              and c.school_id = p_school_id
         )
         or exists (
           select 1
             from public.monitors m
            where m.user_id = u.id
              and m.school_id = p_school_id
         )
         or exists (
           select 1
             from public.monitors_schools ms
             join public.monitors m on m.id = ms.monitor_id
            where m.user_id = u.id
              and ms.school_id = p_school_id
         )
       )
  )
$$;

CREATE OR REPLACE FUNCTION public.record_meal_incident(
  p_child_id uuid,
  p_meal_type_id uuid,
  p_status public.meal_status,
  p_notes text,
  p_recorded_date date,
  p_recorded_at timestamptz DEFAULT NULL,
  p_monitor_id uuid DEFAULT NULL,
  p_description text DEFAULT ''
)
RETURNS public.meal_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_user_school_id uuid;
  v_recorded_at timestamptz := coalesce(p_recorded_at, now());
  v_monitor_id uuid;
  child_school_id uuid;
  meal_type_school_id uuid;
  monitor_belongs_to_school boolean;
  saved_meal public.meal_records;
BEGIN
  SELECT u.role::text, u.school_id
    INTO v_role, v_user_school_id
    FROM public.users u
   WHERE u.id = v_user_id
     AND u.active;

  IF v_user_id IS NULL
     OR v_role IS NULL
     OR v_role NOT IN ('admin', 'monitor') THEN
    RAISE EXCEPTION 'only active administrators and monitors may record incidents'
      USING errcode = '42501';
  END IF;

  IF p_recorded_date IS NULL
     OR p_recorded_date < current_date - 1
     OR p_recorded_date > current_date + 1
     OR v_recorded_at > now() THEN
    RAISE EXCEPTION 'meal incident date is outside the local date envelope or recorded_at is in the future'
      USING errcode = '22023';
  END IF;

  SELECT cl.school_id
    INTO child_school_id
    FROM public.children ch
    JOIN public.classes cl ON cl.id = ch.class_id
   WHERE ch.id = p_child_id;

  SELECT mt.school_id
    INTO meal_type_school_id
    FROM public.meal_types mt
   WHERE mt.id = p_meal_type_id;

  IF child_school_id IS NULL
     OR meal_type_school_id IS DISTINCT FROM child_school_id THEN
    RAISE EXCEPTION 'child and meal type must belong to the same school'
      USING errcode = '42501';
  END IF;

  IF v_role = 'admin' THEN
    IF v_user_school_id IS DISTINCT FROM child_school_id THEN
      RAISE EXCEPTION 'administrators may only record incidents within their own school'
        USING errcode = '42501';
    END IF;

    IF p_monitor_id IS NULL THEN
      RAISE EXCEPTION 'monitor_id is required when recording an incident as administrator'
        USING errcode = '22023';
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM public.monitors m
       WHERE m.id = p_monitor_id
         AND (
           m.school_id = child_school_id
           OR EXISTS (
             SELECT 1
               FROM public.monitors_schools ms
              WHERE ms.monitor_id = m.id
                AND ms.school_id = child_school_id
           )
         )
    )
    INTO monitor_belongs_to_school;

    IF NOT monitor_belongs_to_school THEN
      RAISE EXCEPTION 'child, meal type and monitor must belong to the same school'
        USING errcode = '42501';
    END IF;

    v_monitor_id := p_monitor_id;
  ELSE
    SELECT m.id
      INTO v_monitor_id
      FROM public.monitors m
     WHERE m.user_id = v_user_id
       AND (
         m.school_id = child_school_id
         OR EXISTS (
           SELECT 1
             FROM public.monitors_schools ms
            WHERE ms.monitor_id = m.id
              AND ms.school_id = child_school_id
         )
       )
     LIMIT 1;

    IF v_monitor_id IS NULL THEN
      RAISE EXCEPTION 'monitor is not authorized for this child school'
        USING errcode = '42501';
    END IF;

    IF p_monitor_id IS NOT NULL AND p_monitor_id IS DISTINCT FROM v_monitor_id THEN
      RAISE EXCEPTION 'monitors cannot record incidents as another monitor'
        USING errcode = '42501';
    END IF;
  END IF;

  INSERT INTO public.meal_records (
    child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status, notes,
    first_course, second_course, dessert
  ) VALUES (
    p_child_id, p_meal_type_id, v_user_id, p_recorded_date,
    v_recorded_at, p_status, p_notes,
    p_status, p_status, p_status
  )
  ON CONFLICT (child_id, meal_type_id, recorded_date) DO UPDATE
    SET recorded_at = excluded.recorded_at,
        status = excluded.status,
        notes = excluded.notes,
        first_course = excluded.first_course,
        second_course = excluded.second_course,
        dessert = excluded.dessert
  RETURNING * INTO saved_meal;

  INSERT INTO public.incidents (child_id, monitor_id, description, date)
  VALUES (p_child_id, v_monitor_id, p_description, p_recorded_date);

  RETURN saved_meal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_meal_incident(uuid, uuid, public.meal_status, text, date, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_meal_incident(uuid, uuid, public.meal_status, text, date, timestamptz, uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. custom_access_token_hook: restore {user_role}, populate {school_id}, safe search_path
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  profile_role public.user_role;
  profile_school_id uuid;
  profile_active boolean;
BEGIN
  SELECT u.role, u.school_id, u.active
    INTO profile_role, profile_school_id, profile_active
    FROM public.users u
   WHERE u.id = (event->>'user_id')::uuid;

  claims := jsonb_set(claims, '{user_role}', coalesce(to_jsonb(profile_role), 'null'::jsonb), true);
  claims := jsonb_set(claims, '{school_id}', coalesce(to_jsonb(profile_school_id), 'null'::jsonb), true);
  claims := jsonb_set(claims, '{active}', coalesce(to_jsonb(profile_active), 'false'::jsonb), true);
  RETURN jsonb_set(event, '{claims}', claims, true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. create_monitor: fix NOT NULL school_id, NULL auth bypass, tenant check, 6-digit PIN
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_monitor(text, text, smallint, uuid);

CREATE OR REPLACE FUNCTION public.create_monitor(
  p_first_name text,
  p_last_name text,
  p_pin text,
  p_school_id uuid,
  p_code smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_last_name text := btrim(coalesce(p_last_name, ''));
  v_pin text := btrim(coalesce(p_pin, ''));
  v_user_id uuid;
  v_monitor_id uuid;
  v_slug text;
  v_base text;
  v_email text;
  v_n int;
BEGIN
  IF NOT public.current_user_active()
     OR public.current_user_role() IS DISTINCT FROM 'admin'
     OR p_school_id IS DISTINCT FROM public.current_school_id() THEN
    RAISE EXCEPTION 'Solo los administradores activos de este colegio pueden crear monitores'
      USING errcode = '42501';
  END IF;

  IF v_first_name = '' OR v_last_name = '' THEN
    RAISE EXCEPTION 'El nombre y los apellidos del monitor son obligatorios'
      USING errcode = '22023';
  END IF;

  IF v_pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'El PIN del monitor debe tener exactamente 6 dígitos numéricos'
      USING errcode = '22023';
  END IF;

  v_slug := translate(
    lower(
      replace(v_first_name, ' ', '.') || '.' ||
      replace(v_last_name, ' ', '.')
    ),
    'áàäâãéèëêíìïîóòöôõúùüûñç',
    'aaaaaeeeeiiiiooooouuuunc'
  );

  v_base := v_slug;
  v_email := v_base || '@llumitaula.local';
  v_n := 1;
  WHILE EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(v_email)) LOOP
    v_n := v_n + 1;
    v_email := v_base || v_n::text || '@llumitaula.local';
  END LOOP;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    email_change_token_current, reauthentication_token,
    created_at, updated_at, role, aud, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    v_email,
    extensions.crypt(v_pin, extensions.gen_salt('bf')),
    now(),
    '', '',
    '', '',
    '', '',
    now(), now(),
    'authenticated', 'authenticated',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', v_first_name || ' ' || v_last_name)
  );

  INSERT INTO public.users (id, school_id, role, full_name, active)
  VALUES (v_user_id, p_school_id, 'monitor', v_first_name || ' ' || v_last_name, true);

  INSERT INTO public.monitors (first_name, last_name, code, school_id, user_id)
  VALUES (v_first_name, v_last_name, p_code, p_school_id, v_user_id)
  RETURNING id INTO v_monitor_id;

  INSERT INTO public.monitors_schools (monitor_id, school_id)
  VALUES (v_monitor_id, p_school_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'monitor_id', v_monitor_id,
    'user_id', v_user_id,
    'email', v_email
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_monitor(text, text, text, uuid, smallint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_monitor(text, text, text, uuid, smallint) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. claim_device: single-use code, mandatory expiry, anti-hijack, generic errors,
--    per-code-hash rate limiting (no global DoS), safe search_path
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_setup_code_attempts (
  code_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_setup_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.device_setup_code_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_device(
  p_code             text,
  p_device_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_code            text := trim(coalesce(p_code, ''));
  v_id              text := trim(lower(coalesce(p_device_identifier, '')));
  v_hash            text;
  v_device          public.devices%ROWTYPE;
  v_attempt         public.device_setup_attempts%ROWTYPE;
  v_code_attempt    public.device_setup_code_attempts%ROWTYPE;
  v_generic_error   constant jsonb := jsonb_build_object(
    'success', false,
    'error', 'CLAIM_FAILED',
    'message', 'No se ha podido vincular el dispositivo. Comprueba el código e inténtalo de nuevo.'
  );
  v_rate_limited    constant jsonb := jsonb_build_object(
    'success', false,
    'error', 'RATE_LIMITED',
    'message', 'Demasiados intentos. Intenta de nuevo más tarde.'
  );
BEGIN
  IF length(v_code) < 6 OR length(v_code) > 8 OR v_id = '' THEN
    RETURN v_generic_error;
  END IF;

  -- Per-identifier rate limit: 5 attempts / 15 minutes
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
    RETURN v_rate_limited;
  ELSE
    UPDATE public.device_setup_attempts
       SET attempt_count = attempt_count + 1, last_attempt_at = now()
     WHERE device_identifier = v_id
    RETURNING * INTO v_attempt;
  END IF;

  -- Per-code-hash rate limit: 10 attempts / 15 minutes (no global DoS)
  v_hash := encode(extensions.digest(lower(v_code), 'sha256'), 'hex');

  INSERT INTO public.device_setup_code_attempts (code_hash, window_started_at, attempt_count, last_attempt_at)
  VALUES (v_hash, now(), 1, now())
  ON CONFLICT (code_hash) DO NOTHING;

  SELECT * INTO v_code_attempt
  FROM public.device_setup_code_attempts
  WHERE code_hash = v_hash
  FOR UPDATE;

  IF v_code_attempt.window_started_at <= now() - interval '15 minutes' THEN
    UPDATE public.device_setup_code_attempts
       SET window_started_at = now(), attempt_count = 1, last_attempt_at = now()
     WHERE code_hash = v_hash
    RETURNING * INTO v_code_attempt;
  ELSIF v_code_attempt.attempt_count >= 10 THEN
    RETURN v_rate_limited;
  ELSE
    UPDATE public.device_setup_code_attempts
       SET attempt_count = attempt_count + 1, last_attempt_at = now()
     WHERE code_hash = v_hash
    RETURNING * INTO v_code_attempt;
  END IF;

  SELECT * INTO v_device
  FROM public.devices d
  WHERE d.config_code_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_device.revoked
     OR NOT v_device.active
     OR v_device.config_code_expires_at IS NULL
     OR v_device.config_code_expires_at <= now() THEN
    RETURN v_generic_error;
  END IF;

  IF v_device.identifier IS NOT NULL AND v_device.identifier <> v_id THEN
    RETURN v_generic_error;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.devices d
    WHERE d.identifier = v_id
      AND d.id <> v_device.id
  ) THEN
    RETURN v_generic_error;
  END IF;

  BEGIN
    UPDATE public.devices
       SET identifier = v_id,
           active = true,
           last_seen_at = now(),
           config_code_hash = NULL,
           config_code_expires_at = NULL
     WHERE id = v_device.id;
  EXCEPTION WHEN unique_violation THEN
    RETURN v_generic_error;
  END;

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

REVOKE EXECUTE ON FUNCTION public.claim_device(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_device(text, text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Server-side monitor PIN attempt tracking and lockout
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monitor_pin_attempts (
  device_identifier text NOT NULL,
  monitor_id uuid NOT NULL REFERENCES public.monitors(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_identifier, monitor_id)
);

ALTER TABLE public.monitor_pin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.monitor_pin_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_monitor_pin_lockout(
  p_device_identifier text,
  p_monitor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id text := trim(lower(coalesce(p_device_identifier, '')));
  v_row public.monitor_pin_attempts%ROWTYPE;
BEGIN
  IF v_id = '' OR p_monitor_id IS NULL THEN
    RETURN jsonb_build_object(
      'locked', false,
      'remaining_attempts', 5,
      'retry_after_seconds', 0
    );
  END IF;

  SELECT * INTO v_row
  FROM public.monitor_pin_attempts
  WHERE device_identifier = v_id
    AND monitor_id = p_monitor_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'locked', false,
      'remaining_attempts', 5,
      'retry_after_seconds', 0
    );
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN jsonb_build_object(
      'locked', true,
      'remaining_attempts', 0,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_row.locked_until - now())))::integer)
    );
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until <= now() THEN
    RETURN jsonb_build_object(
      'locked', false,
      'remaining_attempts', 5,
      'retry_after_seconds', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'locked', false,
    'remaining_attempts', greatest(0, 5 - v_row.failed_attempts),
    'retry_after_seconds', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_monitor_pin(
  p_device_identifier text,
  p_monitor_id uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_id text := trim(lower(coalesce(p_device_identifier, '')));
  v_pin text := coalesce(p_pin, '');
  v_device public.devices%ROWTYPE;
  v_encrypted_password text;
  v_attempt public.monitor_pin_attempts%ROWTYPE;
  v_failed integer := 0;
  v_next integer;
BEGIN
  IF v_id = '' OR p_monitor_id IS NULL OR v_pin = '' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', false,
      'remaining_attempts', 0,
      'retry_after_seconds', 0
    );
  END IF;

  SELECT * INTO v_device
  FROM public.devices d
  WHERE d.identifier = v_id
    AND d.active
    AND NOT d.revoked;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', false,
      'remaining_attempts', 0,
      'retry_after_seconds', 0
    );
  END IF;

  SELECT au.encrypted_password
    INTO v_encrypted_password
    FROM public.monitors m
    JOIN public.users u ON u.id = m.user_id AND u.active
    JOIN auth.users au ON au.id = m.user_id
   WHERE m.id = p_monitor_id
     AND m.school_id = v_device.school_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', false,
      'remaining_attempts', 0,
      'retry_after_seconds', 0
    );
  END IF;

  INSERT INTO public.monitor_pin_attempts (
    device_identifier, monitor_id, failed_attempts, locked_until, last_attempt_at
  ) VALUES (v_id, p_monitor_id, 0, NULL, now())
  ON CONFLICT (device_identifier, monitor_id) DO NOTHING;

  SELECT * INTO v_attempt
  FROM public.monitor_pin_attempts
  WHERE device_identifier = v_id
    AND monitor_id = p_monitor_id
  FOR UPDATE;

  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'remaining_attempts', 0,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_attempt.locked_until - now())))::integer)
    );
  END IF;

  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until <= now() THEN
    v_failed := 0;
  ELSE
    v_failed := v_attempt.failed_attempts;
  END IF;

  IF v_encrypted_password IS NOT NULL
     AND extensions.crypt(v_pin, v_encrypted_password) = v_encrypted_password THEN
    UPDATE public.monitor_pin_attempts
       SET failed_attempts = 0,
           locked_until = NULL,
           last_attempt_at = now()
     WHERE device_identifier = v_id
       AND monitor_id = p_monitor_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'locked', false,
      'remaining_attempts', 5,
      'retry_after_seconds', 0
    );
  END IF;

  v_next := v_failed + 1;

  IF v_next >= 5 THEN
    UPDATE public.monitor_pin_attempts
       SET failed_attempts = 5,
           locked_until = now() + interval '5 minutes',
           last_attempt_at = now()
     WHERE device_identifier = v_id
       AND monitor_id = p_monitor_id;

    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'remaining_attempts', 0,
      'retry_after_seconds', 300
    );
  END IF;

  UPDATE public.monitor_pin_attempts
     SET failed_attempts = v_next,
         locked_until = NULL,
         last_attempt_at = now()
   WHERE device_identifier = v_id
     AND monitor_id = p_monitor_id;

  RETURN jsonb_build_object(
    'allowed', false,
    'locked', false,
    'remaining_attempts', greatest(0, 5 - v_next),
    'retry_after_seconds', 0
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_monitor_pin_lockout(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_monitor_pin_lockout(text, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_monitor_pin(text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_monitor_pin(text, uuid, text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Collaborative same-day monitor updates on meal_records (preserving CURRENT_DATE window)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS meal_records_monitor_update ON public.meal_records;
CREATE POLICY meal_records_monitor_update ON public.meal_records
  FOR UPDATE TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND private.current_user_can_access_child(child_id)
  )
  WITH CHECK (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND private.current_user_can_access_child(child_id)
    AND private.meal_record_author_is_unchanged(meal_records.id, meal_records.recorded_by)
    AND recorded_at <= now()
    AND recorded_date = CURRENT_DATE
  );
