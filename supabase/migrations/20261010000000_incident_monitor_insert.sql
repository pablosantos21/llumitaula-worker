-- #39: el monitor crea incidencias con sesión moderna (RLS por centro y rol).
-- Sin service_role: el monitor inserta cuando puede acceder al niño y el
-- monitor_id es su propio registro (monitors.user_id = auth.uid()).
-- La audiencia se resuelve en interfaz sobre los dos indicadores existentes
-- (requires_family_signature y send_notification); sin migración de campos.

drop policy if exists incidents_monitor_insert on public.incidents;

create policy incidents_monitor_insert on public.incidents
  for insert to authenticated
  with check (
    public.current_user_active()
    and public.current_user_role() = 'monitor'
    and private.current_user_can_access_child(child_id)
    and exists (
      select 1
        from public.monitors m
       where m.id = monitor_id
         and m.user_id = public.current_user_id()
    )
  );
