-- Meal scale: 4 levels (todo, casi_todo, casi_nada, nada).
-- Historical mapping: bien->todo, regular->casi_todo, mal->nada.
-- Old enum values are removed; RPC record_meal_incident accepts the new scale.

-- Drop the RPC that depends on the enum; recreated below with the same
-- logic against the new type.
-- NOTE: meal_history view depends on meal_records.status, drop/recreate around swap.
DROP VIEW IF EXISTS public.meal_history;
drop function if exists public.record_meal_incident(uuid, uuid, public.meal_status, text, date, timestamptz, uuid, text);

-- New enum with the 4 values ordered from highest to lowest intake.
create type public.meal_status_new as enum ('todo', 'casi_todo', 'casi_nada', 'nada');

-- Migrate existing rows before swapping the type.
alter table public.meal_records
  alter column status type public.meal_status_new using (
    case status::text
      when 'bien' then 'todo'::public.meal_status_new
      when 'regular' then 'casi_todo'::public.meal_status_new
      when 'mal' then 'nada'::public.meal_status_new
      when 'todo' then 'todo'::public.meal_status_new
      when 'casi_todo' then 'casi_todo'::public.meal_status_new
      when 'casi_nada' then 'casi_nada'::public.meal_status_new
      when 'nada' then 'nada'::public.meal_status_new
      else 'todo'::public.meal_status_new
    end
  );

drop type public.meal_status;
alter type public.meal_status_new rename to meal_status;

-- ---------------------------------------------------------------------------
-- record_meal_incident: admins and monitors may record incidents.
-- Same logic as 20260917000000, now against the 4-level meal_status.
-- ---------------------------------------------------------------------------

create or replace function public.record_meal_incident(p_child_id uuid, p_meal_type_id uuid, p_status meal_status, p_notes text, p_recorded_date date, p_recorded_at timestamp with time zone, p_monitor_id uuid, p_description text)
returns meal_records
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  child_school_id uuid;
  meal_type_school_id uuid;
  monitor_school_id uuid;
  saved_meal public.meal_records;
begin
  select u.role::text
    into v_role
    from public.users u
   where u.id = v_user_id
     and u.active;

  if v_user_id is null
     or v_role not in ('admin', 'monitor') then
    raise exception 'only active administrators and monitors may record incidents'
      using errcode = '42501';
  end if;

  if p_recorded_date < current_date - 1
     or p_recorded_date > current_date + 1
     or p_recorded_at is null
     or p_recorded_at > now() then
    raise exception 'meal incident date is outside the local date envelope or recorded_at is in the future'
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

  if child_school_id is null
     or meal_type_school_id is distinct from child_school_id
     or monitor_school_id is distinct from child_school_id then
    raise exception 'child, meal type and monitor must belong to the same school'
      using errcode = '42501';
  end if;

  insert into public.meal_records (
    child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status, notes
  ) values (
    p_child_id, p_meal_type_id, v_user_id, p_recorded_date,
    p_recorded_at, p_status, p_notes
  )
  on conflict (child_id, meal_type_id, recorded_date) do update
    set recorded_at = excluded.recorded_at,
        status = excluded.status,
        notes = excluded.notes
  returning * into saved_meal;

  insert into public.incidents (child_id, monitor_id, description, date)
  values (p_child_id, p_monitor_id, p_description, p_recorded_date);

  return saved_meal;
end;
$function$;

revoke execute on function public.record_meal_incident(
  uuid, uuid, public.meal_status, text, date, timestamptz, uuid, text
) from public, anon, service_role;
grant execute on function public.record_meal_incident(
  uuid, uuid, public.meal_status, text, date, timestamptz, uuid, text
) to authenticated;

CREATE VIEW public.meal_history AS
SELECT mr.id, mr.recorded_date AS meal_date, mt.name AS meal_type, mr.status AS rating,
  cl.id AS class_id, cl.name AS class_name, cl.school_id, mr.child_id,
  c.first_name AS child_first_name, c.last_name AS child_last_name,
  mr.recorded_by AS worker_id, mon.id AS monitor_id,
  mon.first_name AS monitor_first_name, mon.last_name AS monitor_last_name, mr.recorded_at
FROM public.meal_records mr
JOIN public.children c ON mr.child_id = c.id
JOIN public.classes cl ON c.class_id = cl.id
LEFT JOIN public.meal_types mt ON mr.meal_type_id = mt.id
LEFT JOIN public.monitors mon ON mr.recorded_by = mon.id;
