-- public.users.school_id no longer exists, so the author-school lookups in
-- the meal write guards always raised 42703: nobody (admin included) could
-- write meal_records. Resolve the author through the same access helper the
-- SELECT policies use, keep recorded_by = auth.uid(), and keep
-- recorded_date immutable. The same-school branch of
-- enforce_same_school_relations on meal_records is redundant with this
-- trigger plus the date-boundaries trigger, so drop it instead of
-- rewriting it around the missing column.

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

  if tg_op = 'INSERT'
     and session_user = 'postgres'
     and current_setting('role', true) = 'postgres'
     and auth.uid() is null
     and auth.role() <> 'service_role' then
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

DROP TRIGGER IF EXISTS meal_records_same_school ON public.meal_records;

-- Monitor writes follow the same authorship convention as every other role:
-- recorded_by is the authenticated user id, never the monitors.id.
DROP POLICY IF EXISTS meal_records_monitor_insert ON public.meal_records;
CREATE POLICY meal_records_monitor_insert ON public.meal_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND recorded_by = public.current_user_id()
    AND private.current_user_can_access_child(child_id)
    AND recorded_at <= now()
  );

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
    AND recorded_by = public.current_user_id()
    AND private.current_user_can_access_child(child_id)
    AND recorded_at <= now()
  );
