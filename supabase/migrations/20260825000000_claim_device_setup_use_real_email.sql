-- Fix claim_device_setup to retrieve the actual email from auth.users
-- instead of constructing it synthetically from user_id.

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
          'login_email', au.email
        )
        order by m.last_name, m.first_name
      ),
      '[]'::jsonb
    )
    into v_monitors
    from public.monitors m
    join auth.users au on au.id = m.user_id
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
