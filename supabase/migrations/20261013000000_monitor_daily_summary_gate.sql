-- Issue #52: previsión del colegio con permiso efectivo monitor_daily_summary.
--
-- El ajuste de clase prevalece, seguido por el del colegio; sin configurar
-- conserva el comportamiento por defecto de capability_catalog (habilitado).
-- Los datos de clases deshabilitadas no se pueden obtener mediante
-- consultas directas del monitor (hiding + rechazo directo, contrato
-- llumitaula-admin #7). Si ninguna clase está permitida, el resumen no se
-- muestra pero la selección de clase sigue disponible en la UI.
--
-- Idempotente en remoto (tablas y catálogo ya existen) y aplicable en
-- local (crea lo que falte sin downgrade).

create table if not exists public.capability_catalog (
  capability text primary key,
  default_enabled boolean not null default true
);

create table if not exists public.school_capabilities (
  school_id uuid not null references public.schools(id) on delete cascade,
  capability text not null references public.capability_catalog(capability) on delete cascade,
  enabled boolean not null,
  primary key (school_id, capability)
);

create table if not exists public.class_capability_overrides (
  class_id uuid not null references public.classes(id) on delete cascade,
  capability text not null references public.capability_catalog(capability) on delete cascade,
  enabled boolean not null,
  primary key (class_id, capability)
);

insert into public.capability_catalog (capability, default_enabled)
values ('monitor_daily_summary', true)
on conflict (capability) do nothing;

-- Permiso efectivo por clase: override > escuela > catálogo > true.
create or replace function private.monitor_daily_summary_enabled_for_class(p_class_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(
    (
      select o.enabled
        from public.class_capability_overrides o
       where o.class_id = p_class_id
         and o.capability = 'monitor_daily_summary'
    ),
    (
      select s.enabled
        from public.school_capabilities s
        join public.classes c on c.school_id = s.school_id
       where c.id = p_class_id
         and s.capability = 'monitor_daily_summary'
    ),
    (
      select k.default_enabled
        from public.capability_catalog k
       where k.capability = 'monitor_daily_summary'
    ),
    true
  )
$function$;

-- Permiso efectivo por niño: resuelve a través de su clase con el mismo
-- orden (override > escuela > catálogo > true).
create or replace function private.monitor_daily_summary_enabled_for_child(p_child_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(
    (
      select o.enabled
        from public.class_capability_overrides o
        join public.children ch on ch.class_id = o.class_id
       where ch.id = p_child_id
         and o.capability = 'monitor_daily_summary'
    ),
    (
      select s.enabled
        from public.school_capabilities s
        join public.children ch on true
        join public.classes c on c.id = ch.class_id
       where ch.id = p_child_id
         and s.school_id = c.school_id
         and s.capability = 'monitor_daily_summary'
    ),
    (
      select k.default_enabled
        from public.capability_catalog k
       where k.capability = 'monitor_daily_summary'
    ),
    true
  )
$function$;

grant execute on function private.monitor_daily_summary_enabled_for_class(uuid) to authenticated, service_role;
grant execute on function private.monitor_daily_summary_enabled_for_child(uuid) to authenticated, service_role;

-- Lectura directa del monitor: solo filas de clases con resumen permitido.
-- Otros roles conservan su acceso (role <> 'monitor' es true para ellos).

drop policy if exists children_select_tenant on public.children;
create policy children_select_tenant on public.children
  for select to authenticated
  using (
    private.current_user_can_access_child(id)
    and (
      public.current_user_role() <> 'monitor'
      or private.monitor_daily_summary_enabled_for_child(id)
    )
  );

-- classes_select_monitor oculta las clases deshabilitadas al monitor.
drop policy if exists classes_select_monitor on public.classes;
create policy classes_select_monitor on public.classes
  for select to authenticated
  using (
    public.current_user_active()
    and public.current_user_role() = 'monitor'
    and school_id in (select private.current_user_monitor_school_ids())
    and private.monitor_daily_summary_enabled_for_class(id)
  );

-- child_lunch_days: el monitor solo lee horarios de niños permitidos.
-- La policy base es por escuela; aquí se añade el gate por niño para que
-- la consulta directa de una clase deshabilitada se rechace.
drop policy if exists child_lunch_days_select on public.child_lunch_days;
create policy child_lunch_days_select on public.child_lunch_days
  for select to authenticated
  using (
    private.current_user_can_read_child_lunch_days(school_id)
    and (
      public.current_user_role() <> 'monitor'
      or private.monitor_daily_summary_enabled_for_child(child_id)
    )
  );
