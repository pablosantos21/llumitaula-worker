-- Refresh the monitor list for an already-linked device without
-- consuming a single-use setup code.
--
-- Supports both device models:
--  1. Local model: public.devices.identifier stores the device uuid string.
--  2. Remote model: public.devices.identifier stores the 6-char setup code.
create or replace function public.get_device_monitors(p_device_identifier text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_identifier text := nullif(btrim(coalesce(p_device_identifier, '')), '');
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_device record;
  v_school_name text;
  v_monitors jsonb;
begin
  if v_identifier is not null then
    select * into v_device
      from public.devices
     where identifier = v_identifier
       and active = true
     limit 1;
  end if;

  if not found and v_code <> '' then
    select * into v_device
      from public.devices
     where identifier = v_code
       and active = true
     limit 1;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Codigo no valido');
  end if;

  update public.devices
     set last_seen_at = now()
   where id = v_device.id;

  select name into v_school_name
    from public.schools
   where id = v_device.school_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'first_name', m.first_name,
        'last_name', m.last_name,
        'login_email', coalesce(au.email, lower(m.first_name || '.' || m.last_name) || '@llumitaula.local')
      )
      order by m.last_name, m.first_name
    ),
    '[]'::jsonb
  )
  into v_monitors
  from public.monitors m
  left join auth.users au on au.id = m.user_id
  where m.school_id = v_device.school_id
    and m.user_id is not null;

  return jsonb_build_object(
    'ok', true,
    'device_id', v_device.id,
    'device_identifier', coalesce(v_identifier, v_device.identifier),
    'school_id', v_device.school_id,
    'school_name', v_school_name,
    'monitors', v_monitors
  );
end;
$$;

revoke all on function public.get_device_monitors(text, text) from public, service_role, postgres;
grant execute on function public.get_device_monitors(text, text) to anon, authenticated;
