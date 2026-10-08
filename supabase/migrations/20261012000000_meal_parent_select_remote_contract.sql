-- Issue #49: registra el contrato SELECT familia de meal_records tal como
-- existe en remoto (rol 'parent' + gate de capability).
--
-- El remoto renombró 'padre' -> 'parent' (20260824170921,
-- 20260824171012) y añade el gate
-- private.family_meal_records_enabled_for_child(child_id)
-- (family_meal_records_capability_gate). La migración local
-- 20261007000000 omitió intencionadamente esta policy para no hacer
-- downgrade; esta migración la registra con la definición remota exacta
-- de forma idempotente. Aplicarla en remoto es un no-op.

DROP POLICY IF EXISTS meal_records_select_parent ON public.meal_records;
CREATE POLICY meal_records_select_parent ON public.meal_records
  FOR SELECT TO authenticated
  USING (
    public.current_user_active()
    AND public.current_user_role() = 'parent'
    AND private.current_user_can_access_child(child_id)
    AND private.family_meal_records_enabled_for_child(child_id)
  );
