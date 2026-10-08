-- Issue #55: avisos internos publicados en el resumen diario.
--
-- Reutiliza el contrato de avisos de worker #23 con el mínimo
-- contrato persistente/read-side que faltaba: avisos generales asociados
-- al colegio del monitor, con ciclo publicado / borrador / archivado /
-- retirado. El resumen solo muestra publicados vigentes (status =
-- 'published'); borradores, archivados y retirados quedan fuera.
--
-- La lectura del monitor respeta colegio y rol pero no depende del permiso
-- de publicar avisos: la política de lectura no menciona la capacidad de
-- publicación. Esa capacidad queda registrada como
-- 'monitor_notices_publish' para documentar la separación sin condicionar
-- la lectura. Sin permiso de publicación no hay escritura del monitor en
-- este ticket (sin interfaz de redacción ni publicación).
--
-- Idempotente en remoto (tabla y políticas recreadas) y aplicable en local.

create table if not exists public.school_notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived', 'withdrawn')),
  created_at timestamptz not null default now()
);

create index if not exists school_notices_school_id_idx
  on public.school_notices (school_id);
create index if not exists school_notices_status_idx
  on public.school_notices (status);

insert into public.capability_catalog (capability, default_enabled)
values ('monitor_notices_publish', false)
on conflict (capability) do nothing;

grant select, insert, update, delete on table public.school_notices to authenticated;
grant all privileges on table public.school_notices to service_role;

alter table public.school_notices enable row level security;

-- Lectura de administración por tenant (colegio y rol conservados).
drop policy if exists school_notices_select_tenant on public.school_notices;
create policy school_notices_select_tenant on public.school_notices
  for select to authenticated
  using (
    public.current_user_active()
    and public.current_user_role() = 'admin'
    and school_id = public.current_school_id()
  );

-- Lectura del monitor: solo avisos publicados de sus colegios. Sin gate por
-- capacidad de publicación: leer publicados no exige poder publicar.
drop policy if exists school_notices_select_monitor on public.school_notices;
create policy school_notices_select_monitor on public.school_notices
  for select to authenticated
  using (
    public.current_user_active()
    and public.current_user_role() = 'monitor'
    and school_id in (select private.current_user_monitor_school_ids())
    and status = 'published'
  );

-- Escritura solo de administración en el mismo colegio. El monitor no tiene
-- política de inserción: sin permiso de publicación no puede publicar.
drop policy if exists school_notices_admin_insert on public.school_notices;
create policy school_notices_admin_insert on public.school_notices
  for insert to authenticated
  with check (
    public.current_user_active()
    and public.current_user_role() = 'admin'
    and school_id = public.current_school_id()
  );

drop policy if exists school_notices_admin_update on public.school_notices;
create policy school_notices_admin_update on public.school_notices
  for update to authenticated
  using (
    public.current_user_active()
    and public.current_user_role() = 'admin'
    and school_id = public.current_school_id()
  )
  with check (
    public.current_user_active()
    and public.current_user_role() = 'admin'
    and school_id = public.current_school_id()
  );

drop policy if exists school_notices_admin_delete on public.school_notices;
create policy school_notices_admin_delete on public.school_notices
  for delete to authenticated
  using (
    public.current_user_active()
    and public.current_user_role() = 'admin'
    and school_id = public.current_school_id()
  );
