-- Monitor authentication flow:
-- 1. Add user_id to monitors (link to auth user)
-- 2. Replace claim_device_setup to return monitors
-- 3. Create function to provision a monitor with auth

-- ─────────────────────────────────────────────
-- 1. Link monitors → users
-- ─────────────────────────────────────────────
alter table public.monitors
  add column if not exists user_id uuid references public.users(id) on delete set null;

create index if not exists monitors_user_id_idx on public.monitors (user_id);
create index if not exists monitors_school_id_idx on public.monitors (school_id);

-- ─────────────────────────────────────────────
-- 2. Replace claim_device_setup
--    Keep SHA-256 code verification from the original,
--    but return monitors (with login_email) instead of workers.
-- ─────────────────────────────────────────────
create or replace function public.claim_device_setup(
  p_code text,
  p_device_identifier uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_code_hash text;
  v_global_attempt public.device_setup_global_attempts%rowtype;
  v_attempt public.device_setup_attempts%rowtype;
  v_setup_code public.device_setup_codes%rowtype;
  v_device_id uuid;
  v_school_name text;
  v_monitors jsonb;
begin
  if p_device_identifier is null then
    return jsonb_build_object('ok', false, 'error', 'Codigo no valido');
  end if;

  insert into public.device_setup_global_attempts (id, window_started_at, attempt_count, last_attempt_at)
  values (true, now(), 1, now())
  on conflict (id) do nothing;

  select *
    into v_global_attempt
    from public.device_setup_global_attempts
   where id
   for update;

  if v_global_attempt.window_started_at <= now() - interval '15 minutes' then
    update public.device_setup_global_attempts
       set window_started_at = now(), attempt_count = 1, last_attempt_at = now()
     where id
    returning * into v_global_attempt;
  elsif v_global_attempt.attempt_count >= 30 then
    return jsonb_build_object('ok', false, 'error', 'Codigo no valido');
  else
    update public.device_setup_global_attempts
       set attempt_count = attempt_count + 1, last_attempt_at = now()
     where id
    returning * into v_global_attempt;
  end if;

  insert into public.device_setup_attempts (
    device_identifier, window_started_at, attempt_count, last_attempt_at
  ) values (p_device_identifier, now(), 1, now())
  on conflict (device_identifier) do nothing;

  select *
    into v_attempt
    from public.device_setup_attempts
   where device_identifier = p_device_identifier
   for update;

  if v_attempt.window_started_at <= now() - interval '15 minutes' then
    update public.device_setup_attempts
       set window_started_at = now(), attempt_count = 1, last_attempt_at = now()
     where device_identifier = p_device_identifier
    returning * into v_attempt;
  elsif v_attempt.attempt_count >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Codigo no valido');
  else
    update public.device_setup_attempts
       set attempt_count = attempt_count + 1, last_attempt_at = now()
     where device_identifier = p_device_identifier
    returning * into v_attempt;
  end if;

  v_code_hash := encode(digest(v_code, 'sha256'), 'hex');

  select *
    into v_setup_code
    from public.device_setup_codes
   where code_hash = v_code_hash
   for update;

  if not found
     or not v_setup_code.active
     or v_setup_code.expires_at <= now()
     or v_setup_code.uses >= v_setup_code.max_uses then
    return jsonb_build_object('ok', false, 'error', 'Codigo no valido');
  end if;

  begin
    update public.device_setup_codes
       set uses = uses + 1, last_claimed_at = now()
     where id = v_setup_code.id;

    insert into public.devices (school_id, name, identifier, active, last_seen_at)
    values (v_setup_code.school_id, 'Device ' || p_device_identifier::text,
            p_device_identifier::text, true, now())
    on conflict (identifier) do update
      set school_id = excluded.school_id,
          active = true,
          last_seen_at = excluded.last_seen_at
      where public.devices.school_id = excluded.school_id
    returning id into v_device_id;

    if not found then
      raise exception 'Codigo no valido' using errcode = 'P0001';
    end if;

    select name into v_school_name
      from public.schools
     where id = v_setup_code.school_id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'first_name', m.first_name,
          'last_name', m.last_name,
          'login_email', 'monitor.' || m.user_id::text || '@llumitaula.local'
        )
        order by m.last_name, m.first_name
      ),
      '[]'::jsonb
    )
    into v_monitors
    from public.monitors m
    where m.school_id = v_setup_code.school_id
      and m.user_id is not null;

    return jsonb_build_object(
      'ok', true,
      'device_id', v_device_id,
      'device_identifier', p_device_identifier,
      'school_id', v_setup_code.school_id,
      'school_name', v_school_name,
      'monitors', v_monitors
    );
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Codigo no valido');
  end;
end;
$$;

revoke all on function public.claim_device_setup(text, uuid) from public, service_role, postgres;
grant execute on function public.claim_device_setup(text, uuid) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 3. Create monitor with auth user
--    Called by admin to provision a new monitor
-- ─────────────────────────────────────────────
create or replace function public.create_monitor(
  p_first_name text,
  p_last_name text,
  p_code smallint,
  p_school_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid;
  v_monitor_id uuid;
  v_email text;
  v_password text;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Solo los administradores pueden crear monitores'
      using errcode = '42501';
  end if;

  v_email := 'monitor.' || p_code || '@llumitaula.local';
  v_password := p_code::text;

  -- Create auth user via service_role insert
  -- This function runs as the definer (postgres), so it can insert into auth.users
  insert into auth.users (
    instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, role, aud, raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    now(), now(),
    'authenticated', 'authenticated',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', p_first_name || ' ' || p_last_name)
  )
  returning id into v_user_id;

  -- Create public user profile
  insert into public.users (id, role, full_name, active)
  values (v_user_id, 'monitor', p_first_name || ' ' || p_last_name, true);

  -- Create monitor record
  insert into public.monitors (first_name, last_name, code, school_id, user_id)
  values (p_first_name, p_last_name, p_code, p_school_id, v_user_id)
  returning id into v_monitor_id;

  -- Link monitor to school in monitors_schools
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
$$;

revoke all on function public.create_monitor(text, text, smallint, uuid) from public, anon, authenticated;
grant execute on function public.create_monitor(text, text, smallint, uuid) to service_role;
