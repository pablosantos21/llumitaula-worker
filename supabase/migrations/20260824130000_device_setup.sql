create table public.device_setup_codes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  max_uses integer not null default 1,
  uses integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_claimed_at timestamptz,
  constraint device_setup_codes_code_hash_format
    check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint device_setup_codes_code_hash_key unique (code_hash),
  constraint device_setup_codes_max_uses_positive
    check (max_uses > 0),
  constraint device_setup_codes_uses_valid
    check (uses >= 0 and uses <= max_uses)
);

create table public.device_setup_attempts (
  device_identifier uuid primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz not null default now(),
  constraint device_setup_attempts_count_valid check (attempt_count >= 0)
);

-- Basic global defense against rotating device UUIDs. This is not a perfect
-- abuse-prevention mechanism; a trusted edge or network control is outside
-- this RPC's scope.
create table public.device_setup_global_attempts (
  id boolean primary key default true,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz not null default now(),
  constraint device_setup_global_attempts_singleton check (id),
  constraint device_setup_global_attempts_count_valid check (attempt_count >= 0)
);
insert into public.device_setup_global_attempts (id)
values (true);

create index device_setup_codes_school_id_idx
  on public.device_setup_codes (school_id);
create index device_setup_codes_active_expires_at_idx
  on public.device_setup_codes (active, expires_at);
create index device_setup_attempts_last_attempt_at_idx
  on public.device_setup_attempts (last_attempt_at);

alter table public.device_setup_codes enable row level security;
alter table public.device_setup_attempts enable row level security;
alter table public.device_setup_global_attempts enable row level security;

revoke all privileges on table public.device_setup_codes from public, anon, authenticated, service_role;
revoke all privileges on table public.device_setup_attempts from public, anon, authenticated, service_role;
revoke all privileges on table public.device_setup_global_attempts from public, anon, authenticated, service_role;

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
  v_workers jsonb;
begin
  if p_device_identifier is null then
    return jsonb_build_object('ok', false, 'error', 'Codigo no valido');
  end if;

  -- Keep this counter independent from the client-controlled identifier.
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

  -- Lock the per-device counter before validating the code so invalid codes
  -- cannot be used to bypass the rate limit.
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
               jsonb_build_object('id', u.id, 'full_name', u.full_name)
               order by u.full_name, u.id
             ),
             '[]'::jsonb
           )
      into v_workers
      from public.users u
     where u.school_id = v_setup_code.school_id
       and u.role::text = 'worker'
       and u.active;

    return jsonb_build_object(
      'ok', true,
      'device_id', v_device_id,
      'device_identifier', p_device_identifier,
      'school_id', v_setup_code.school_id,
      'school_name', v_school_name,
      'workers', v_workers
    );
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Codigo no valido');
  end;
end;
$$;

revoke all privileges on function public.claim_device_setup(text, uuid)
  from public, service_role, postgres;
grant execute on function public.claim_device_setup(text, uuid) to anon, authenticated;
