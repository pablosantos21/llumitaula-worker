-- GoTrue scans auth.users token columns into Go strings: NULLs raise
-- "converting NULL to string is unsupported" and login returns 500
-- "Database error querying schema". Manually inserted monitor users had
-- NULL tokens, so backfill them and make create_monitor insert '' instead.
-- NOTE: confirmed_at is GENERATED in newer versions, never write it directly.
UPDATE auth.users
   SET confirmation_token = '',
       recovery_token = '',
       email_change_token_new = '',
       email_change = '',
       email_change_token_current = COALESCE(email_change_token_current, ''),
       reauthentication_token = COALESCE(reauthentication_token, '')
 WHERE confirmation_token IS NULL
    OR recovery_token IS NULL
    OR email_change_token_new IS NULL
    OR email_change IS NULL;

CREATE OR REPLACE FUNCTION public.create_monitor(p_first_name text, p_last_name text, p_code smallint, p_school_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_user_id uuid;
  v_monitor_id uuid;
  v_slug text;
  v_base text;
  v_email text;
  v_password text;
  v_n int;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Solo los administradores pueden crear monitores'
      using errcode = '42501';
  end if;

  -- Email: nombre.apellido@llumitaula.local
  -- lowercase, accents stripped, spaces -> dots ("Ana García López" -> ana.garcia.lopez)
  v_slug := translate(
    lower(
      replace(btrim(p_first_name), ' ', '.') || '.' ||
      replace(btrim(p_last_name), ' ', '.')
    ),
    'áàäâãéèëêíìïîóòöôõúùüûñç',
    'aaaaaeeeeiiiiooooouuuunc'
  );

  -- Globally unique emails required by auth.users: ana.serra -> ana.serra2 -> ...
  v_base := v_slug;
  v_email := v_base || '@llumitaula.local';
  v_n := 1;
  while exists (select 1 from auth.users u where lower(u.email) = lower(v_email)) loop
    v_n := v_n + 1;
    v_email := v_base || v_n::text || '@llumitaula.local';
  end loop;

  v_user_id := gen_random_uuid();
  v_password := p_code::text;

  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    email_change_token_current, reauthentication_token,
    created_at, updated_at, role, aud, raw_app_meta_data, raw_user_meta_data
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    '', '',
    '', '',
    '', '',
    now(), now(),
    'authenticated', 'authenticated',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', p_first_name || ' ' || p_last_name)
  );

  insert into public.users (id, role, full_name, active)
  values (v_user_id, 'monitor', p_first_name || ' ' || p_last_name, true);

  insert into public.monitors (first_name, last_name, code, school_id, user_id)
  values (p_first_name, p_last_name, p_code, p_school_id, v_user_id)
  returning id into v_monitor_id;

  insert into public.monitors_schools (monitor_id, school_id)
  values (v_monitor_id, p_school_id)
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'monitor_id', v_monitor_id,
    'user_id', v_user_id,
    'email', v_email
  );
end;
$function$;
