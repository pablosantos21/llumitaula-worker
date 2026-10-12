-- Issue #54: incidencias del colegio en el resumen diario.
--
-- El resumen muestra las incidencias de hoy cuya audiencia incluye al
-- colegio (`send_notification = true`): solo-colegio y ambas audiencias.
-- Excluye las dirigidas solo a la familia y no filtra por `reviewed` ni
-- por validación del monitor.
--
-- La lectura directa del monitor se limita a niños con el resumen permitido
-- (override de clase > escuela > catálogo): el gate vive en la política y
-- no solo en la presentación. Se conservan el tenant/rol existentes
-- (`current_user_can_access_child`) y la identidad, categoría y
-- descripción respetan así las políticas de colegio, rol y clase.
--
-- Idempotente en remoto (política recreada) y aplicable en local.

drop policy if exists incidents_select_monitor on public.incidents;
create policy incidents_select_monitor on public.incidents
  for select to authenticated
  using (
    public.current_user_active()
    and public.current_user_role() = 'monitor'
    and private.current_user_can_access_child(child_id)
    and private.monitor_daily_summary_enabled_for_child(child_id)
  );
