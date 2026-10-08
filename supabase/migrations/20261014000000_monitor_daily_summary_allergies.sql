-- Issue #53: alergias de los comensales previstos con permiso efectivo
-- monitor_daily_summary.
--
-- El monitor lee los nombres de alérgenos vinculados a niños accesibles,
-- pero solo cuando el resumen está permitido para ese niño (override de
-- clase > escuela > catálogo). La lectura directa de asociaciones
-- (child_allergens) de clases deshabilitadas también se rechaza: el gate
-- vive en la política y no solo en la presentación. Las ramas de admin y
-- padre se conservan sin cambios.
--
-- Solo se exponen la identidad del niño y los nombres de sus alérgenos; el
-- modelo no dispone de gravedad, reacciones, tratamientos ni indicaciones
-- clínicas.
--
-- Idempotente en remoto (políticas recreadas) y aplicable en local.

-- Lectura directa del monitor de asociaciones: solo niños con resumen
-- permitido. El resto de roles conserva su acceso.
drop policy if exists child_allergens_select_tenant on public.child_allergens;
create policy child_allergens_select_tenant on public.child_allergens
  for select to authenticated
  using (
    public.current_user_active()
    and exists (
      select 1
        from public.children ch
        join public.classes cl on cl.id = ch.class_id
       where ch.id = child_allergens.child_id
         and cl.school_id = public.current_school_id()
         and (
           public.current_user_role() = 'admin'
           or private.current_user_can_access_child(ch.id)
         )
         and (
           public.current_user_role() <> 'monitor'
           or private.monitor_daily_summary_enabled_for_child(ch.id)
         )
    )
  );

-- Nombres de alérgenos: se conserva el tenant/rol de admin y padre y se
-- añade la rama del monitor, limitada a alérgenos vinculados a niños
-- accesibles con el resumen permitido.
drop policy if exists allergens_select_tenant on public.allergens;
create policy allergens_select_tenant on public.allergens
  for select to authenticated
  using (
    public.current_user_role() = 'admin' and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id join public.classes cl on cl.id = ch.class_id where ca.allergen_id = allergens.id and cl.school_id = public.current_school_id())
    or public.current_user_role() = 'padre' and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id where ca.allergen_id = allergens.id and private.current_user_can_access_child(ch.id))
    or (
      public.current_user_role() = 'monitor'
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
