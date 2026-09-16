-- The monitor role could log in but RLS had no access path for it:
-- children, classes, meal_types, monitors, meal_records and incidents only
-- allowed admin / supervisor / worker / parent. Monitors saw zero children.
-- Grant monitors access scoped to their assigned schools
-- (public.monitors.school_id plus public.monitors_schools).

CREATE OR REPLACE FUNCTION private.current_user_monitor_school_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select public.monitors.school_id
    from public.monitors
   where public.monitors.user_id = public.current_user_id()
  union
  select public.monitors_schools.school_id
    from public.monitors_schools
    join public.monitors on public.monitors.id = public.monitors_schools.monitor_id
   where public.monitors.user_id = public.current_user_id()
$function$;

GRANT EXECUTE ON FUNCTION private.current_user_monitor_school_ids() TO authenticated;

CREATE OR REPLACE FUNCTION private.current_user_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select public.current_user_active()
     and exists (
       select 1
         from public.children ch
         join public.classes cl on cl.id = ch.class_id
        where ch.id = p_child_id
          and (
            public.current_user_role() = 'admin'
            or public.current_user_role() = 'supervisor'
            or (
              public.current_user_role() = 'monitor'
              and cl.school_id in (select private.current_user_monitor_school_ids())
            )
            or exists (
              select 1 from public.worker_classrooms wc
               where wc.class_id = cl.id
                 and wc.worker_id = public.current_user_id()
            )
            or exists (
              select 1 from public.parents_children pc
               where pc.child_id = ch.id
                 and pc.parent_id = public.current_user_id()
            )
          )
      )
$function$;

DROP POLICY IF EXISTS classes_select_monitor ON public.classes;
CREATE POLICY classes_select_monitor ON public.classes
  FOR SELECT TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND school_id IN (SELECT private.current_user_monitor_school_ids())
  );

DROP POLICY IF EXISTS meal_types_select_monitor ON public.meal_types;
CREATE POLICY meal_types_select_monitor ON public.meal_types
  FOR SELECT TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND school_id IN (SELECT private.current_user_monitor_school_ids())
  );

DROP POLICY IF EXISTS monitors_select_monitor ON public.monitors;
CREATE POLICY monitors_select_monitor ON public.monitors
  FOR SELECT TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND (
      user_id = public.current_user_id()
      OR school_id IN (SELECT private.current_user_monitor_school_ids())
    )
  );

DROP POLICY IF EXISTS meal_records_select_monitor ON public.meal_records;
CREATE POLICY meal_records_select_monitor ON public.meal_records
  FOR SELECT TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND private.current_user_can_access_child(child_id)
  );

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

DROP POLICY IF EXISTS incidents_select_monitor ON public.incidents;
CREATE POLICY incidents_select_monitor ON public.incidents
  FOR SELECT TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND private.current_user_can_access_child(child_id)
  );
