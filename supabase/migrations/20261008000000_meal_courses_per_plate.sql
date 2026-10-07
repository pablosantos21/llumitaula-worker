-- Registro de comida por plato: primero, segundo y postre.
--
-- 1) Nuevas columnas en meal_records con backfill desde status.
--    status se conserva como valoración global derivada (el peor de los
--    tres platos) para no romper meal_history ni lecturas existentes.
-- 2) meal_history expone los tres platos.
-- 3) record_meal_incident mantiene su firma y replica p_status a los tres
--    platos (compat; la UI ya no crea incidencias desde el registro).

alter table public.meal_records
  add column if not exists first_course public.meal_status not null default 'todo',
  add column if not exists second_course public.meal_status not null default 'todo',
  add column if not exists dessert public.meal_status not null default 'todo';

update public.meal_records
   set first_course = status,
       second_course = status,
       dessert = status;

drop view if exists public.meal_history;
CREATE VIEW public.meal_history AS
SELECT mr.id, mr.recorded_date AS meal_date, mt.name AS meal_type, mr.status AS rating,
  mr.first_course, mr.second_course, mr.dessert,
  cl.id AS class_id, cl.name AS class_name, cl.school_id, mr.child_id,
  c.first_name AS child_first_name, c.last_name AS child_last_name,
  mr.recorded_by AS worker_id, mon.id AS monitor_id,
  mon.first_name AS monitor_first_name, mon.last_name AS monitor_last_name, mr.recorded_at
FROM public.meal_records mr
JOIN public.children c ON mr.child_id = c.id
JOIN public.classes cl ON c.class_id = cl.id
LEFT JOIN public.meal_types mt ON mr.meal_type_id = mt.id
LEFT JOIN public.monitors mon ON mr.recorded_by = mon.id;

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
    child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status, notes,
    first_course, second_course, dessert
  ) values (
    p_child_id, p_meal_type_id, v_user_id, p_recorded_date,
    p_recorded_at, p_status, p_notes,
    p_status, p_status, p_status
  )
  on conflict (child_id, meal_type_id, recorded_date) do update
    set recorded_at = excluded.recorded_at,
        status = excluded.status,
        notes = excluded.notes,
        first_course = excluded.first_course,
        second_course = excluded.second_course,
        dessert = excluded.dessert
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
