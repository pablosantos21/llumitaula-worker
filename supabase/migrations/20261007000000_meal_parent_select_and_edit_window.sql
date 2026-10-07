-- Issue #35: familias y ventana de edición.
--
-- 1) Nueva policy SELECT para rol padre sobre meal_records de sus hijos
--    vía parents_children (a través de private.current_user_can_access_child,
--    que ya contempla padre). Sin UI de familia en este issue, solo contrato
--    de datos. Administración ya lee vía meal_records_select_tenant.
--
-- 2) Ventana de edición: mismo día monitor|admin cambian valor/notas
--    libremente; días pasados el monitor queda en solo lectura y el admin
--    rectifica. Se acota el UPDATE/INSERT del monitor a
--    recorded_date = CURRENT_DATE; el admin no se toca.

DROP POLICY IF EXISTS meal_records_select_parent ON public.meal_records;
CREATE POLICY meal_records_select_parent ON public.meal_records
  FOR SELECT TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'padre'
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
    AND recorded_date = CURRENT_DATE
  );

DROP POLICY IF EXISTS meal_records_monitor_update ON public.meal_records;
CREATE POLICY meal_records_monitor_update ON public.meal_records
  FOR UPDATE TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND private.current_user_can_access_child(child_id)
    AND recorded_date = CURRENT_DATE
  )
  WITH CHECK (
    public.current_user_active()
    AND public.current_user_role() = 'monitor'
    AND recorded_by = public.current_user_id()
    AND private.current_user_can_access_child(child_id)
    AND recorded_at <= now()
    AND recorded_date = CURRENT_DATE
  );
