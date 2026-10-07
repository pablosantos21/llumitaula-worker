-- Issue #35: familias y ventana de edición.
--
-- 1) SELECT padre: NO se toca. La policy real en remoto es
--    meal_records_select_parent con rol 'parent' (no 'padre') +
--    gate private.family_meal_records_enabled_for_child(child_id).
--    Recrearla aquí haría downgrade. Se conserva intacta.
--
-- 2) Ventana de edición: mismo día monitor|admin cambian valor/notas
--    libremente; días pasados el monitor queda en solo lectura y el admin
--    rectifica. Se acota el UPDATE/INSERT del monitor a
--    recorded_date = CURRENT_DATE; el admin no se toca.

-- Intencionadamente sin DROP/CREATE de meal_records_select_parent.

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
