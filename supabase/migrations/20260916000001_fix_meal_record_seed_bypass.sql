-- Fix meal_records authorship trigger to allow seeding from postgres superuser
-- when no JWT is set (auth.role() returns null, not 'anon').
--
-- The bypass check on auth.role() used <> which returns NULL (not TRUE)
-- when auth.role() is null, causing the trigger to raise instead of
-- allowing the insert through. Use IS DISTINCT FROM instead.

CREATE OR REPLACE FUNCTION public.enforce_meal_record_authorship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  child_school_id uuid;
  meal_type_school_id uuid;
begin
  if auth.role() = 'service_role' then
    raise exception 'service_role cannot write meal_records through the API'
      using errcode = '42501';
  end if;

  -- Superuser seeding bypass: direct postgres connection, no JWT set,
  -- not service_role. Note current_setting('role') is 'none' on direct
  -- connections, so only rely on session_user. Use IS DISTINCT FROM so
  -- a null auth.role() passes (null is not service_role).
  if tg_op = 'INSERT'
     and session_user = 'postgres'
     and auth.uid() is null
     and auth.role() is distinct from 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'meal_records writes require an authenticated user'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT'
     and new.recorded_by is distinct from auth.uid() then
    raise exception 'meal_records.recorded_by must be the authenticated user'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.recorded_by is distinct from old.recorded_by then
      raise exception 'meal_records.recorded_by cannot be changed'
        using errcode = '42501';
    end if;
    if old.recorded_date is distinct from new.recorded_date then
      raise exception 'meal_records.recorded_date cannot be changed'
        using errcode = '23514';
    end if;
  end if;

  select cl.school_id
    into child_school_id
    from public.children ch
    join public.classes cl on cl.id = ch.class_id
   where ch.id = new.child_id;

  select mt.school_id
    into meal_type_school_id
    from public.meal_types mt
   where mt.id = new.meal_type_id;

  if child_school_id is null
     or meal_type_school_id is distinct from child_school_id
     or not private.current_user_can_access_child(new.child_id) then
    raise exception 'meal_records.recorded_by must be a valid author in the child tenant'
      using errcode = '23514';
  end if;

  return new;
end
$function$;
