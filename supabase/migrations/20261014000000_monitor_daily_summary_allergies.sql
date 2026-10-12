-- Issue #53: alergias de los comensales previstos con permiso efectivo
-- monitor_daily_summary.
--
-- El monitor lee los nombres de alérgenos vinculados a niños accesibles,
-- pero solo cuando el resumen está permitido para ese niño (override de
-- clase > escuela > catálogo). La lectura directa de asociaciones
-- (child_allergens) de clases deshabilitadas también se rechaza: el gate
-- vive en la política y no solo en la presentación.
--
-- Solo se exponen la identidad del niño y los nombres de sus alérgenos; el
-- modelo no dispone de gravedad, reacciones, tratamientos ni indicaciones
-- clínicas.
--
-- Adaptado al modelo de tenant vigente: `public.current_school_id()` se
-- eliminó en remoto (`eliminate_current_school_id_simplified`); el alcance
-- por colegio vive ahora en `private.current_user_can_access_child` y
-- `private.current_user_monitor_school_ids`. Las ramas no-monitor se
-- conservan tal cual están en remoto y solo se añade el gate al monitor.
--
-- Idempotente en remoto (políticas recreadas) y aplicable en local.

-- Lectura directa del monitor de asociaciones: solo niños con resumen
-- permitido. El resto de roles conserva su acceso intacto.
drop policy if exists child_allergens_select_tenant on public.child_allergens;
create policy child_allergens_select_tenant on public.child_allergens
  for select to authenticated
  using (
    public.current_user_active()
    and (
      public.current_user_role() = any (array['admin', 'supervisor'])
      or private.current_user_can_access_child(child_id)
    )
    and (
      public.current_user_role() <> 'monitor'
      or private.monitor_daily_summary_enabled_for_child(child_id)
    )
  );

-- Nombres de alérgenos: se conserva la rama de administración vigente y se
-- añade la rama del monitor, limitada a alérgenos vinculados a niños
-- accesibles con el resumen permitido.
drop policy if exists allergens_select_tenant on public.allergens;
create policy allergens_select_tenant on public.allergens
  for select to authenticated
  using (
    (
      public.current_user_active()
      and public.current_user_role() = any (array['admin', 'supervisor'])
    )
    or (
      public.current_user_active()
      and public.current_user_role() = 'monitor'
      and exists (
        select 1
          from public.child_allergens ca
          join public.children ch on ch.id = ca.child_id
         where ca.allergen_id = allergens.id
           and private.current_user_can_access_child(ch.id)
           and private.monitor_daily_summary_enabled_for_child(ch.id)
      )
    )
  );
