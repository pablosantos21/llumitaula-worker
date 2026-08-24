create or replace function public.record_meal_incident(
  p_child_id uuid,
  p_meal_type_id uuid,
  p_status public.meal_status,
  p_notes text,
  p_recorded_date date,
  p_recorded_at timestamptz,
  p_monitor_id uuid,
  p_description text
)
returns public.meal_records
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_school_id uuid;
  v_role text;
  child_school_id uuid;
  meal_type_school_id uuid;
  monitor_school_id uuid;
  saved_meal public.meal_records;
begin
  select u.school_id, u.role::text
    into v_school_id, v_role
    from public.users u
   where u.id = v_user_id
     and u.active;

  if v_user_id is null
     or v_role not in ('admin', 'supervisor') then
    raise exception 'only active administrators and supervisors may record incidents'
      using errcode = '42501';
  end if;

  if p_recorded_date is distinct from current_date
     or p_recorded_at is null
     or p_recorded_at > now() then
    raise exception 'meal incident date must be today and recorded_at cannot be in the future'
      using errcode = '22023';
  end if;

  select cl.school_id
    into child_school_id
    from public.children ch
    join public.classes cl on cl.id = ch.class_id
   where ch.id = p_child_id;

  select mt.school_id
    into meal_type_school_id
    from public.meal_types mt
   where mt.id = p_meal_type_id;

  select m.school_id
    into monitor_school_id
    from public.monitors m
   where m.id = p_monitor_id;

  if child_school_id is distinct from v_school_id
     or meal_type_school_id is distinct from v_school_id
     or monitor_school_id is distinct from v_school_id then
    raise exception 'child, meal type, monitor, and user must belong to the same school'
      using errcode = '42501';
  end if;

  insert into public.meal_records (
    child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status, notes
  ) values (
    p_child_id, p_meal_type_id, v_user_id, p_recorded_date,
    p_recorded_at, p_status, p_notes
  )
  on conflict (child_id, meal_type_id, recorded_date) do update
    set recorded_by = excluded.recorded_by,
        recorded_at = excluded.recorded_at,
        status = excluded.status,
        notes = excluded.notes
  returning * into saved_meal;

  insert into public.incidents (child_id, monitor_id, description, date)
  values (p_child_id, p_monitor_id, p_description, p_recorded_date);

  return saved_meal;
end;
$$;

revoke execute on function public.record_meal_incident(
  uuid, uuid, public.meal_status, text, date, timestamptz, uuid, text
) from public, anon, service_role;
grant execute on function public.record_meal_incident(
  uuid, uuid, public.meal_status, text, date, timestamptz, uuid, text
) to authenticated;
