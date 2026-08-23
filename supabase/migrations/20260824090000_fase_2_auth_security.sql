-- Phase 2, Task 2: identity extensions and tenant-safe meal entities.

alter type public.user_role add value if not exists 'worker';
alter type public.user_role add value if not exists 'supervisor';

alter table public.users
  add column school_id uuid,
  add column full_name text,
  add column active boolean not null default true;

-- Existing profiles can only be migrated automatically when their tenant is
-- unambiguous. Refuse to guess when the database cannot provide that guarantee.
do $$
declare
  school_count bigint;
begin
  select count(*) into school_count from public.schools;

  if exists (select 1 from public.users where school_id is null) then
    if school_count <> 1 then
      raise exception
        'cannot migrate users.school_id safely: expected exactly one school, found %',
        school_count;
    end if;

    update public.users
       set school_id = (select id from public.schools limit 1)
     where school_id is null;
  end if;

  if exists (
    select 1
      from public.users u
     where u.school_id is null
        or not exists (
          select 1 from public.schools s where s.id = u.school_id
        )
  ) then
    raise exception 'cannot migrate users.school_id: one or more profiles have no valid school';
  end if;
end
$$;

alter table public.monitors
  add column school_id uuid;

do $$
begin
  if exists (
    select 1
      from public.monitors_schools ms
     group by ms.monitor_id
    having count(distinct ms.school_id) > 1
  ) then
    raise exception 'cannot migrate monitors.school_id: a monitor belongs to multiple schools';
  end if;

  if exists (
    select 1
      from public.monitors m
     where not exists (
       select 1 from public.monitors_schools ms where ms.monitor_id = m.id
     )
  ) then
    raise exception 'cannot migrate monitors.school_id: a monitor has no school association';
  end if;

  update public.monitors m
     set school_id = (
       select ms.school_id
         from public.monitors_schools ms
        where ms.monitor_id = m.id
     );
end
$$;

alter table public.monitors
  alter column school_id set not null;

alter table public.monitors
  add constraint monitors_school_id_fkey
  foreign key (school_id) references public.schools(id);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null,
  identifier text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create table if not exists public.worker_classrooms (
  worker_id uuid not null references public.users(id),
  class_id uuid not null references public.classes(id),
  created_at timestamptz not null default now(),
  primary key (worker_id, class_id)
);
create table if not exists public.meal_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create table if not exists public.meal_records (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id),
  meal_type_id uuid not null references public.meal_types(id),
  recorded_by uuid not null references public.users(id),
  recorded_at timestamptz not null default now(),
  status public.meal_status not null,
  notes text
);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Task 3: tenant-aware authorization. These helpers read the profile through
-- the function owner, so policies never recurse through public.users.
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid()
$$;

create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select u.school_id
    from public.users u
   where u.id = auth.uid()
     and u.active
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select u.role::text
    from public.users u
   where u.id = auth.uid()
     and u.active
$$;

create or replace function public.current_user_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce((select u.active from public.users u where u.id = auth.uid()), false)
$$;

revoke execute on function public.current_user_id() from public, anon;
revoke execute on function public.current_school_id() from public, anon;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.current_user_active() from public, anon;
grant execute on function public.current_user_id() to authenticated, service_role;
grant execute on function public.current_school_id() to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_user_active() to authenticated, service_role;

create or replace function public.current_user_can_access_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.current_user_active()
     and exists (
       select 1
         from public.children ch
         join public.classes cl on cl.id = ch.class_id
        where ch.id = p_child_id
          and cl.school_id = public.current_school_id()
          and (
            public.current_user_role()::text in ('admin', 'supervisor')
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
$$;

create or replace function public.current_user_has_assigned_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.current_user_active()
     and public.current_user_role()::text = 'worker'
     and exists (
       select 1
         from public.children ch
         join public.classes cl on cl.id = ch.class_id
         join public.worker_classrooms wc on wc.class_id = cl.id
        where ch.id = p_child_id
          and wc.worker_id = public.current_user_id()
          and cl.school_id = public.current_school_id()
     )
$$;

create or replace function public.current_user_can_access_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.current_user_active()
     and exists (
       select 1
         from public.classes cl
        where cl.id = p_class_id
          and cl.school_id = public.current_school_id()
          and (
            public.current_user_role()::text in ('admin', 'supervisor')
            or exists (
              select 1 from public.worker_classrooms wc
               where wc.class_id = cl.id
                 and wc.worker_id = public.current_user_id()
            )
          )
     )
$$;

create or replace function public.user_role_change_is_safe(
  p_user_id uuid,
  p_new_role text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
      from public.users u
     where u.id = p_user_id
       and case u.role::text
             when 'admin' then 4
             when 'supervisor' then 3
             when 'worker' then 2
             when 'monitor' then 1
             when 'padre' then 1
             else 0
           end >= case p_new_role
             when 'admin' then 4
             when 'supervisor' then 3
             when 'worker' then 2
             when 'monitor' then 1
             when 'padre' then 1
             else 0
           end
  )
$$;

create or replace function public.allergen_is_tenant_private(
  p_allergen_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select not exists (
    select 1
      from public.child_allergens ca
      join public.children ch on ch.id = ca.child_id
      join public.classes cl on cl.id = ch.class_id
     where ca.allergen_id = p_allergen_id
       and cl.school_id <> p_school_id
  )
$$;

create or replace function public.monitor_assignments_are_tenant_safe(
  p_monitor_id uuid,
  p_school_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  monitor_school_id uuid;
begin
  perform pg_advisory_xact_lock(2147483647, 42042);

  select m.school_id
    into monitor_school_id
    from public.monitors m
   where m.id = p_monitor_id
   for update;

  if not found then
    return true;
  end if;

  if monitor_school_id <> p_school_id then
    return false;
  end if;

  return not exists (
    select 1
      from public.monitors_schools ms
     where ms.monitor_id = p_monitor_id
       and ms.school_id <> p_school_id
  );
end
$$;

create or replace function public.enforce_monitor_assignment_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not private.monitor_assignments_are_tenant_safe(new.monitor_id, new.school_id) then
    raise exception 'monitor cannot be assigned across schools'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function public.enforce_monitor_school_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(2147483647, 42042);

  if exists (
    select 1
      from public.monitors_schools ms
     where ms.monitor_id = new.id
       and ms.school_id <> new.school_id
  ) then
    raise exception 'monitor.school_id cannot diverge from monitor assignments'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.incidents i
      join public.children ch on ch.id = i.child_id
      join public.classes cl on cl.id = ch.class_id
     where i.monitor_id = new.id
       and cl.school_id <> new.school_id
  ) then
    raise exception 'monitor.school_id cannot diverge from incident children'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function public.incident_relations_are_tenant_safe(
  p_monitor_id uuid,
  p_child_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  monitor_school_id uuid;
  child_school_id uuid;
begin
  perform pg_advisory_xact_lock(2147483647, 42042);

  select m.school_id
    into monitor_school_id
    from public.monitors m
   where m.id = p_monitor_id
   for update;

  select cl.school_id
    into child_school_id
    from public.children ch
    join public.classes cl on cl.id = ch.class_id
   where ch.id = p_child_id;

  return monitor_school_id is not null
     and child_school_id is not null
     and monitor_school_id = child_school_id;
end
$$;

create or replace function public.enforce_incident_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not private.incident_relations_are_tenant_safe(new.monitor_id, new.child_id) then
    raise exception 'incident monitor and child must belong to the same school'
      using errcode = '23514';
  end if;

  return new;
end
$$;

alter function public.current_user_can_access_child(uuid) set schema private;
alter function public.current_user_has_assigned_child(uuid) set schema private;
alter function public.current_user_can_access_class(uuid) set schema private;
alter function public.user_role_change_is_safe(uuid, text) set schema private;
alter function public.allergen_is_tenant_private(uuid, uuid) set schema private;
alter function public.monitor_assignments_are_tenant_safe(uuid, uuid) set schema private;
alter function public.incident_relations_are_tenant_safe(uuid, uuid) set schema private;

revoke execute on function private.current_user_can_access_child(uuid) from public, anon;
revoke execute on function private.current_user_has_assigned_child(uuid) from public, anon;
revoke execute on function private.current_user_can_access_class(uuid) from public, anon;
revoke execute on function private.user_role_change_is_safe(uuid, text) from public, anon;
revoke execute on function private.allergen_is_tenant_private(uuid, uuid) from public, anon;
revoke execute on function private.monitor_assignments_are_tenant_safe(uuid, uuid) from public, anon;
revoke execute on function public.enforce_monitor_assignment_tenant() from public, anon, authenticated, service_role;
revoke execute on function public.enforce_monitor_school_tenant() from public, anon, authenticated, service_role;
revoke execute on function private.incident_relations_are_tenant_safe(uuid, uuid) from public, anon;
revoke execute on function public.enforce_incident_tenant() from public, anon, authenticated, service_role;
grant execute on function private.current_user_can_access_child(uuid) to authenticated, service_role;
grant execute on function private.current_user_has_assigned_child(uuid) to authenticated, service_role;
grant execute on function private.current_user_can_access_class(uuid) to authenticated, service_role;
grant execute on function private.user_role_change_is_safe(uuid, text) to authenticated, service_role;
grant execute on function private.allergen_is_tenant_private(uuid, uuid) to authenticated, service_role;
grant execute on function private.monitor_assignments_are_tenant_safe(uuid, uuid) to authenticated, service_role;
grant execute on function public.enforce_monitor_assignment_tenant() to postgres;
grant execute on function public.enforce_monitor_school_tenant() to postgres;
grant execute on function private.incident_relations_are_tenant_safe(uuid, uuid) to authenticated, service_role;
grant execute on function public.enforce_incident_tenant() to postgres;

create trigger monitors_schools_same_school
before insert or update on public.monitors_schools
for each row execute function public.enforce_monitor_assignment_tenant();
create trigger monitors_same_school_assignment
before update of school_id on public.monitors
for each row execute function public.enforce_monitor_school_tenant();
create trigger incidents_same_school
before insert or update on public.incidents
for each row execute function public.enforce_incident_tenant();

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  profile_role public.user_role;
  profile_school_id uuid;
  profile_active boolean;
begin
  select u.role, u.school_id, u.active
    into profile_role, profile_school_id, profile_active
    from public.users u
   where u.id = (event->>'user_id')::uuid;

  claims := jsonb_set(claims, '{user_role}', coalesce(to_jsonb(profile_role), 'null'::jsonb), true);
  claims := jsonb_set(claims, '{school_id}', coalesce(to_jsonb(profile_school_id), 'null'::jsonb), true);
  claims := jsonb_set(claims, '{active}', coalesce(to_jsonb(profile_active), 'false'::jsonb), true);
  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Remove every baseline policy before installing the complete policy set.
drop policy if exists users_insert_own on public.users;
drop policy if exists users_select on public.users;
drop policy if exists users_update on public.users;
drop policy if exists schools_select on public.schools;
drop policy if exists schools_insert on public.schools;
drop policy if exists schools_update on public.schools;
drop policy if exists schools_delete on public.schools;
drop policy if exists classes_select on public.classes;
drop policy if exists classes_insert on public.classes;
drop policy if exists classes_update on public.classes;
drop policy if exists classes_delete on public.classes;
drop policy if exists monitors_select on public.monitors;
drop policy if exists monitors_insert on public.monitors;
drop policy if exists monitors_update on public.monitors;
drop policy if exists monitors_delete on public.monitors;
drop policy if exists monitors_schools_select on public.monitors_schools;
drop policy if exists monitors_schools_insert on public.monitors_schools;
drop policy if exists monitors_schools_update on public.monitors_schools;
drop policy if exists monitors_schools_delete on public.monitors_schools;
drop policy if exists children_select on public.children;
drop policy if exists children_insert on public.children;
drop policy if exists children_update on public.children;
drop policy if exists children_delete on public.children;
drop policy if exists parents_children_select on public.parents_children;
drop policy if exists parents_children_insert on public.parents_children;
drop policy if exists parents_children_update on public.parents_children;
drop policy if exists parents_children_delete on public.parents_children;
drop policy if exists menus_select on public.menus;
drop policy if exists menus_insert on public.menus;
drop policy if exists menus_update on public.menus;
drop policy if exists menus_delete on public.menus;
drop policy if exists menus_schools_select on public.menus_schools;
drop policy if exists menus_schools_insert on public.menus_schools;
drop policy if exists menus_schools_update on public.menus_schools;
drop policy if exists menus_schools_delete on public.menus_schools;
drop policy if exists allergens_select on public.allergens;
drop policy if exists allergens_insert on public.allergens;
drop policy if exists allergens_update on public.allergens;
drop policy if exists allergens_delete on public.allergens;
drop policy if exists child_allergens_select on public.child_allergens;
drop policy if exists child_allergens_insert on public.child_allergens;
drop policy if exists child_allergens_update on public.child_allergens;
drop policy if exists child_allergens_delete on public.child_allergens;
drop policy if exists incidents_select on public.incidents;
drop policy if exists incidents_insert on public.incidents;
drop policy if exists incidents_update on public.incidents;
drop policy if exists incidents_delete on public.incidents;

-- The only authenticated user-management writes are same-tenant, non-admin
-- profiles. An administrator cannot alter their own tenant or elevate anyone.
create policy users_select_tenant on public.users for select to authenticated
using (
  public.current_user_active()
  and (id = public.current_user_id()
    or (public.current_user_role() = 'admin' and school_id = public.current_school_id()))
);
create policy users_insert_tenant on public.users for insert to authenticated
with check (
  public.current_user_role() = 'admin'
  and school_id = public.current_school_id()
  and role <> 'admin'
);
create policy users_update_admin on public.users for update to authenticated
using (
  public.current_user_active()
  and public.current_user_role() = 'admin'
  and id <> public.current_user_id()
  and school_id = public.current_school_id()
)
with check (
  public.current_user_active()
  and public.current_user_role() = 'admin'
  and id <> public.current_user_id()
  and school_id = public.current_school_id()
  and private.user_role_change_is_safe(id, role::text)
);
create policy users_update_own on public.users for update to authenticated
using (public.current_user_active() and id = public.current_user_id())
with check (
  public.current_user_active()
  and id = public.current_user_id()
  and role::text = public.current_user_role()
  and school_id = public.current_school_id()
  and active
);

create policy schools_select_tenant on public.schools for select to authenticated
using (public.current_user_active() and id = public.current_school_id());
create policy schools_insert_tenant on public.schools for insert to authenticated
with check (false);
create policy schools_update_tenant on public.schools for update to authenticated
using (public.current_user_role() = 'admin' and id = public.current_school_id())
with check (public.current_user_role() = 'admin' and id = public.current_school_id());
create policy schools_delete_tenant on public.schools for delete to authenticated
using (false);

create policy classes_select_tenant on public.classes for select to authenticated
using (
  public.current_user_active() and school_id = public.current_school_id()
  and private.current_user_can_access_class(id)
);
create policy classes_admin_insert on public.classes for insert to authenticated
with check (public.current_user_role() = 'admin' and school_id = public.current_school_id());
create policy classes_admin_update on public.classes for update to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id())
with check (public.current_user_role() = 'admin' and school_id = public.current_school_id());
create policy classes_admin_delete on public.classes for delete to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id());

create policy monitors_select_tenant on public.monitors for select to authenticated
using (public.current_user_active() and public.current_user_role() in ('admin', 'supervisor')
  and school_id = public.current_school_id());
create policy monitors_admin_insert on public.monitors for insert to authenticated
with check (public.current_user_active() and public.current_user_role() = 'admin'
  and school_id = public.current_school_id());
create policy monitors_admin_update on public.monitors for update to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin'
  and school_id = public.current_school_id())
with check (public.current_user_active() and public.current_user_role() = 'admin'
  and school_id = public.current_school_id());
create policy monitors_admin_delete on public.monitors for delete to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin'
  and school_id = public.current_school_id());

create policy monitors_schools_select_tenant on public.monitors_schools for select to authenticated
using (public.current_user_role() in ('admin', 'supervisor') and school_id = public.current_school_id());
create policy monitors_schools_admin_insert on public.monitors_schools for insert to authenticated
with check (
  public.current_user_active()
  and public.current_user_role() = 'admin'
  and school_id = public.current_school_id()
  and private.monitor_assignments_are_tenant_safe(monitor_id, public.current_school_id())
  and exists (
    select 1 from public.monitors m
     where m.id = monitor_id and m.school_id = school_id
  )
);
create policy monitors_schools_admin_update on public.monitors_schools for update to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin' and school_id = public.current_school_id())
with check (
  public.current_user_active()
  and public.current_user_role() = 'admin'
  and school_id = public.current_school_id()
  and private.monitor_assignments_are_tenant_safe(monitor_id, public.current_school_id())
  and exists (
    select 1 from public.monitors m
     where m.id = monitor_id and m.school_id = school_id
  )
);
create policy monitors_schools_admin_delete on public.monitors_schools for delete to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id());

create policy children_select_tenant on public.children for select to authenticated
using (private.current_user_can_access_child(id));
create policy children_admin_insert on public.children for insert to authenticated
with check (public.current_user_role() = 'admin' and exists (
  select 1 from public.classes cl where cl.id = children.class_id and cl.school_id = public.current_school_id()
));
create policy children_admin_update on public.children for update to authenticated
using (public.current_user_role() = 'admin' and exists (
  select 1 from public.classes cl where cl.id = children.class_id and cl.school_id = public.current_school_id()
)) with check (public.current_user_role() = 'admin' and exists (
  select 1 from public.classes cl where cl.id = children.class_id and cl.school_id = public.current_school_id()
));
create policy children_admin_delete on public.children for delete to authenticated
using (public.current_user_role() = 'admin' and exists (
  select 1 from public.classes cl where cl.id = children.class_id and cl.school_id = public.current_school_id()
));

create policy parents_children_select_tenant on public.parents_children for select to authenticated
using (
  public.current_user_active()
  and (parent_id = public.current_user_id()
    or (public.current_user_role() in ('admin', 'supervisor') and private.current_user_can_access_child(child_id)))
);
create policy parents_children_admin_insert on public.parents_children for insert to authenticated
with check (public.current_user_active() and public.current_user_role() = 'admin' and exists (
  select 1 from public.users u join public.children ch on ch.id = parents_children.child_id join public.classes cl on cl.id = ch.class_id
   where u.id = parents_children.parent_id and u.school_id = public.current_school_id() and cl.school_id = public.current_school_id()
));
create policy parents_children_admin_update on public.parents_children for update to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin' and exists (
  select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = parents_children.child_id and cl.school_id = public.current_school_id()
)) with check (public.current_user_active() and public.current_user_role() = 'admin' and exists (
  select 1 from public.users u join public.children ch on ch.id = parents_children.child_id join public.classes cl on cl.id = ch.class_id
   where u.id = parents_children.parent_id and u.school_id = public.current_school_id() and cl.school_id = public.current_school_id()
));
create policy parents_children_admin_delete on public.parents_children for delete to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin' and exists (
  select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = parents_children.child_id and cl.school_id = public.current_school_id()
));

create policy devices_select_tenant on public.devices for select to authenticated
using (public.current_user_role() in ('admin', 'supervisor') and school_id = public.current_school_id());
create policy devices_admin_insert on public.devices for insert to authenticated
with check (public.current_user_role() = 'admin' and school_id = public.current_school_id());
create policy devices_admin_update on public.devices for update to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id())
with check (public.current_user_role() = 'admin' and school_id = public.current_school_id());
create policy devices_admin_delete on public.devices for delete to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id());

create policy worker_classrooms_select_tenant on public.worker_classrooms for select to authenticated
using (public.current_user_active() and (
  private.current_user_can_access_class(class_id) or worker_id = public.current_user_id()
));
create policy worker_classrooms_admin_insert on public.worker_classrooms for insert to authenticated
with check (public.current_user_role() = 'admin' and exists (
  select 1 from public.users u join public.classes cl on cl.id = worker_classrooms.class_id
   where u.id = worker_classrooms.worker_id and u.school_id = public.current_school_id() and cl.school_id = public.current_school_id()
));
create policy worker_classrooms_admin_update on public.worker_classrooms for update to authenticated
using (public.current_user_role() = 'admin' and exists (
  select 1 from public.classes cl where cl.id = worker_classrooms.class_id and cl.school_id = public.current_school_id()
)) with check (public.current_user_role() = 'admin' and exists (
  select 1 from public.users u join public.classes cl on cl.id = worker_classrooms.class_id
   where u.id = worker_classrooms.worker_id and u.school_id = public.current_school_id() and cl.school_id = public.current_school_id()
));
create policy worker_classrooms_admin_delete on public.worker_classrooms for delete to authenticated
using (public.current_user_role() = 'admin' and exists (
  select 1 from public.classes cl where cl.id = worker_classrooms.class_id and cl.school_id = public.current_school_id()
));

create policy meal_types_select_tenant on public.meal_types for select to authenticated
using (public.current_user_role() in ('admin', 'supervisor') and school_id = public.current_school_id());
create policy meal_types_admin_insert on public.meal_types for insert to authenticated
with check (public.current_user_role() = 'admin' and school_id = public.current_school_id());
create policy meal_types_admin_update on public.meal_types for update to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id())
with check (public.current_user_role() = 'admin' and school_id = public.current_school_id());
create policy meal_types_admin_delete on public.meal_types for delete to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id());

create policy meal_records_select_tenant on public.meal_records for select to authenticated
using (public.current_user_active() and exists (
  select 1 from public.children ch join public.classes cl on cl.id = ch.class_id
   where ch.id = meal_records.child_id and cl.school_id = public.current_school_id()
     and (public.current_user_role() in ('admin', 'supervisor') or exists (
       select 1 from public.worker_classrooms wc where wc.class_id = cl.id and wc.worker_id = public.current_user_id()
     ) or meal_records.recorded_by = public.current_user_id())
));
create policy meal_records_admin_supervisor_insert on public.meal_records for insert to authenticated
with check (public.current_user_active() and public.current_user_role() = 'admin' and exists (
  select 1 from public.children ch join public.classes cl on cl.id = ch.class_id join public.meal_types mt on mt.id = meal_records.meal_type_id
   where ch.id = meal_records.child_id and cl.school_id = public.current_school_id() and mt.school_id = cl.school_id
));
create policy meal_records_worker_insert on public.meal_records for insert to authenticated
with check (public.current_user_active() and public.current_user_role() = 'worker' and recorded_by = public.current_user_id() and exists (
  select 1 from public.children ch join public.classes cl on cl.id = ch.class_id join public.worker_classrooms wc on wc.class_id = cl.id join public.meal_types mt on mt.id = meal_records.meal_type_id
   where ch.id = meal_records.child_id and wc.worker_id = public.current_user_id() and cl.school_id = public.current_school_id() and mt.school_id = cl.school_id
));
create policy meal_records_admin_supervisor_update on public.meal_records for update to authenticated
using (public.current_user_active() and public.current_user_role() in ('admin', 'supervisor') and exists (
  select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = meal_records.child_id and cl.school_id = public.current_school_id()
)) with check (public.current_user_active() and public.current_user_role() in ('admin', 'supervisor') and exists (
  select 1 from public.children ch join public.classes cl on cl.id = ch.class_id join public.meal_types mt on mt.id = meal_records.meal_type_id where ch.id = meal_records.child_id and cl.school_id = public.current_school_id() and mt.school_id = cl.school_id
));
create policy meal_records_worker_update on public.meal_records for update to authenticated
using (public.current_user_active() and public.current_user_role() = 'worker' and recorded_by = public.current_user_id() and recorded_at >= now() - interval '24 hours' and private.current_user_has_assigned_child(child_id))
with check (public.current_user_active() and public.current_user_role() = 'worker' and recorded_by = public.current_user_id() and recorded_at >= now() - interval '24 hours' and private.current_user_has_assigned_child(child_id));
create policy meal_records_admin_delete on public.meal_records for delete to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin' and exists (
  select 1 from public.children ch
  join public.classes cl on cl.id = ch.class_id
   where ch.id = meal_records.child_id and cl.school_id = public.current_school_id()
));

-- Legacy entities without a direct tenant column derive it from their links.
create policy menus_select_tenant on public.menus for select to authenticated using (exists (
  select 1 from public.menus_schools ms where ms.menu_id = menus.id and ms.school_id = public.current_school_id()
) and public.current_user_role() in ('admin', 'supervisor', 'padre'));
create policy menus_admin_insert on public.menus for insert to authenticated with check (public.current_user_role() = 'admin');
create policy menus_admin_update on public.menus for update to authenticated using (public.current_user_role() = 'admin' and exists (select 1 from public.menus_schools ms where ms.menu_id = menus.id and ms.school_id = public.current_school_id())) with check (public.current_user_role() = 'admin');
create policy menus_admin_delete on public.menus for delete to authenticated using (public.current_user_role() = 'admin' and exists (select 1 from public.menus_schools ms where ms.menu_id = menus.id and ms.school_id = public.current_school_id()));
create policy menus_schools_select_tenant on public.menus_schools for select to authenticated using (
  school_id = public.current_school_id()
  and (public.current_user_role() in ('admin', 'supervisor') or exists (
    select 1 from public.children ch
    join public.classes cl on cl.id = ch.class_id
    join public.parents_children pc on pc.child_id = ch.id
    where cl.school_id = menus_schools.school_id and pc.parent_id = public.current_user_id()
  ))
);
create policy menus_schools_admin_insert on public.menus_schools for insert to authenticated with check (public.current_user_role() = 'admin' and school_id = public.current_school_id());
create policy menus_schools_admin_update on public.menus_schools for update to authenticated using (public.current_user_role() = 'admin' and school_id = public.current_school_id()) with check (public.current_user_role() = 'admin' and school_id = public.current_school_id());
create policy menus_schools_admin_delete on public.menus_schools for delete to authenticated using (public.current_user_role() = 'admin' and school_id = public.current_school_id());

create policy allergens_select_tenant on public.allergens for select to authenticated using (
  public.current_user_role() in ('admin', 'supervisor') and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id join public.classes cl on cl.id = ch.class_id where ca.allergen_id = allergens.id and cl.school_id = public.current_school_id())
  or public.current_user_role() = 'worker' and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id where ca.allergen_id = allergens.id and private.current_user_can_access_child(ch.id))
  or public.current_user_role() = 'padre' and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id where ca.allergen_id = allergens.id and private.current_user_can_access_child(ch.id))
);
create policy allergens_admin_insert on public.allergens for insert to authenticated with check (public.current_user_role() = 'admin');
create policy allergens_admin_update on public.allergens for update to authenticated using (public.current_user_active() and public.current_user_role() = 'admin' and private.allergen_is_tenant_private(allergens.id, public.current_school_id()) and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id join public.classes cl on cl.id = ch.class_id where ca.allergen_id = allergens.id and cl.school_id = public.current_school_id())) with check (public.current_user_active() and public.current_user_role() = 'admin');
create policy allergens_admin_delete on public.allergens for delete to authenticated using (public.current_user_active() and public.current_user_role() = 'admin' and private.allergen_is_tenant_private(allergens.id, public.current_school_id()) and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id join public.classes cl on cl.id = ch.class_id where ca.allergen_id = allergens.id and cl.school_id = public.current_school_id()));
create policy child_allergens_select_tenant on public.child_allergens for select to authenticated using (public.current_user_active() and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = child_allergens.child_id and cl.school_id = public.current_school_id() and (public.current_user_role() in ('admin', 'supervisor') or private.current_user_can_access_child(ch.id))));
create policy child_allergens_admin_insert on public.child_allergens for insert to authenticated with check (public.current_user_role() = 'admin' and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = child_allergens.child_id and cl.school_id = public.current_school_id()));
create policy child_allergens_admin_update on public.child_allergens for update to authenticated using (public.current_user_role() = 'admin' and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = child_allergens.child_id and cl.school_id = public.current_school_id())) with check (public.current_user_role() = 'admin' and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = child_allergens.child_id and cl.school_id = public.current_school_id()));
create policy child_allergens_admin_delete on public.child_allergens for delete to authenticated using (public.current_user_role() = 'admin' and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = child_allergens.child_id and cl.school_id = public.current_school_id()));
create policy incidents_select_tenant on public.incidents for select to authenticated using (public.current_user_active() and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id() and (public.current_user_role() in ('admin', 'supervisor') or exists (select 1 from public.parents_children pc where pc.child_id = ch.id and pc.parent_id = public.current_user_id()))));
create policy incidents_admin_insert on public.incidents for insert to authenticated with check (public.current_user_active() and public.current_user_role() = 'admin' and private.incident_relations_are_tenant_safe(monitor_id, child_id) and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id()));
create policy incidents_admin_update on public.incidents for update to authenticated using (public.current_user_active() and public.current_user_role() = 'admin' and private.incident_relations_are_tenant_safe(monitor_id, child_id) and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id())) with check (public.current_user_active() and public.current_user_role() = 'admin' and private.incident_relations_are_tenant_safe(monitor_id, child_id) and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id()));
create policy incidents_admin_delete on public.incidents for delete to authenticated using (public.current_user_active() and public.current_user_role() = 'admin' and private.incident_relations_are_tenant_safe(monitor_id, child_id) and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id()));

-- Keep API privileges no broader than the policy matrix. service_role is the
-- separate backend path; anon receives no table access.
revoke all privileges on all tables in schema public from anon, authenticated;
grant select, insert, update on public.users to authenticated;
grant select, update on public.schools, public.classes, public.monitors, public.monitors_schools, public.children, public.parents_children, public.menus, public.menus_schools, public.allergens, public.child_allergens, public.incidents, public.devices, public.worker_classrooms, public.meal_types, public.meal_records to authenticated;
grant insert, update, delete on public.schools, public.classes, public.monitors, public.monitors_schools, public.children, public.parents_children, public.menus, public.menus_schools, public.allergens, public.child_allergens, public.incidents, public.devices, public.worker_classrooms, public.meal_types, public.meal_records to authenticated;
grant all privileges on all tables in schema public to service_role;

alter table public.users enable row level security;
alter table public.schools enable row level security;
alter table public.classes enable row level security;
alter table public.monitors enable row level security;
alter table public.monitors_schools enable row level security;
alter table public.children enable row level security;
alter table public.parents_children enable row level security;
alter table public.menus enable row level security;
alter table public.menus_schools enable row level security;
alter table public.allergens enable row level security;
alter table public.child_allergens enable row level security;
alter table public.incidents enable row level security;
alter table public.devices enable row level security;
alter table public.worker_classrooms enable row level security;
alter table public.meal_types enable row level security;
alter table public.meal_records enable row level security;

alter table public.users
  alter column school_id set not null;

alter table public.users
  add constraint users_school_id_fkey
  foreign key (school_id) references public.schools(id);

-- Report orphaned profiles before PostgreSQL attempts to add the Auth FK.
do $$
declare
  orphan_count bigint;
begin
  select count(*)
    into orphan_count
    from public.users u
   where not exists (select 1 from auth.users au where au.id = u.id);

  if orphan_count > 0 then
    raise exception
      'cannot add users_auth_user_fkey: % profile(s) have no matching auth.users row',
      orphan_count;
  end if;
end
$$;

alter table public.users
  add constraint users_auth_user_fkey
  foreign key (id) references auth.users(id) on delete cascade;

create index users_school_id_idx on public.users (school_id);

create index if not exists devices_school_id_idx on public.devices (school_id);
create index if not exists worker_classrooms_class_id_idx on public.worker_classrooms (class_id);
create index if not exists meal_records_child_id_idx on public.meal_records (child_id);
create index if not exists meal_records_meal_type_id_idx on public.meal_records (meal_type_id);
create index if not exists meal_records_recorded_by_idx on public.meal_records (recorded_by);
create index if not exists meal_records_recorded_at_idx on public.meal_records (recorded_at);

-- These checks run for direct SQL writes as well as API writes. They deliberately
-- do not rely on RLS, which is added by Task 3.
create or replace function public.enforce_same_school_relations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  worker_school uuid;
  worker_role public.user_role;
  parent_school uuid;
  class_school uuid;
  child_school uuid;
  meal_type_school uuid;
  recorder_school uuid;
begin
  -- Serialize all tenant checks before taking row-level locks.
  perform pg_advisory_xact_lock(2147483647, 42042);

  if tg_table_name = 'users' then
  if new.role::text is distinct from 'worker'
       and exists (
         select 1
           from public.worker_classrooms wc
          where wc.worker_id = new.id
       ) then
      raise exception 'users.school_id update would invalidate worker_classrooms'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from public.worker_classrooms wc
        join public.classes c on c.id = wc.class_id
       where wc.worker_id = new.id
         and c.school_id is distinct from new.school_id
    ) or exists (
      select 1
        from public.meal_records mr
        join public.children ch on ch.id = mr.child_id
        join public.classes c on c.id = ch.class_id
        join public.meal_types mt on mt.id = mr.meal_type_id
       where mr.recorded_by = new.id
         and (c.school_id is distinct from new.school_id
           or mt.school_id is distinct from new.school_id)
    ) or exists (
      select 1
        from public.parents_children pc
        join public.children ch on ch.id = pc.child_id
        join public.classes c on c.id = ch.class_id
       where pc.parent_id = new.id
         and c.school_id is distinct from new.school_id
    ) then
      raise exception 'users.school_id update would invalidate tenant relations'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'classes' then
    if exists (
      select 1
        from public.worker_classrooms wc
       where wc.class_id = new.id
         and exists (
           select 1
             from public.users u
            where u.id = wc.worker_id
              and u.school_id is distinct from new.school_id
         )
    ) or exists (
      select 1
        from public.children ch
        join public.meal_records mr on mr.child_id = ch.id
        join public.meal_types mt on mt.id = mr.meal_type_id
        join public.users u on u.id = mr.recorded_by
       where ch.class_id = new.id
         and (mt.school_id is distinct from new.school_id
           or u.school_id is distinct from new.school_id)
    ) or exists (
      select 1
        from public.children ch
        join public.parents_children pc on pc.child_id = ch.id
        join public.users u on u.id = pc.parent_id
        where ch.class_id = new.id
          and u.school_id is distinct from new.school_id
    ) or exists (
      select 1
        from public.incidents i
        join public.children ch on ch.id = i.child_id
        join public.monitors m on m.id = i.monitor_id
       where ch.class_id = new.id
         and m.school_id is distinct from new.school_id
    ) then
      raise exception 'classes.school_id update would invalidate tenant relations'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'children' then
    if exists (
      select 1
        from public.meal_records mr
        join public.meal_types mt on mt.id = mr.meal_type_id
        join public.users u on u.id = mr.recorded_by
        left join public.classes c on c.id = new.class_id
       where mr.child_id = new.id
         and (c.school_id is distinct from mt.school_id
           or c.school_id is distinct from u.school_id)
    ) then
      raise exception 'children.class_id update would invalidate meal_records'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from public.parents_children pc
        join public.users u on u.id = pc.parent_id
        left join public.classes c on c.id = new.class_id
       where pc.child_id = new.id
         and u.school_id is distinct from c.school_id
    ) then
      raise exception 'children.class_id update would invalidate parents_children'
        using errcode = '23514';
    end if;

    select c.school_id
      into child_school
      from public.classes c
     where c.id = new.class_id;

    if exists (
      select 1
        from public.incidents i
        join public.monitors m on m.id = i.monitor_id
       where i.child_id = new.id
         and m.school_id is distinct from child_school
    ) then
      raise exception 'children.class_id update would invalidate incidents'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'meal_types' then
    if exists (
      select 1
        from public.meal_records mr
        join public.children ch on ch.id = mr.child_id
        join public.classes c on c.id = ch.class_id
        join public.users u on u.id = mr.recorded_by
       where mr.meal_type_id = new.id
         and (c.school_id is distinct from new.school_id
           or c.school_id is distinct from u.school_id)
    ) then
      raise exception 'meal_types.school_id update would invalidate meal_records'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'parents_children' then
    select u.school_id, c.school_id
      into parent_school, child_school
      from public.users u
      join public.children ch on ch.id = new.child_id
      left join public.classes c on c.id = ch.class_id
     where u.id = new.parent_id;

    if parent_school is distinct from child_school then
      raise exception 'parents_children cannot relate different schools'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'worker_classrooms' then
    select u.school_id, u.role
      into worker_school, worker_role
      from public.users u
     where u.id = new.worker_id;

    select c.school_id
      into class_school
      from public.classes c
     where c.id = new.class_id;

    if worker_role::text is distinct from 'worker' then
      raise exception 'worker_classrooms.worker_id must reference a worker'
        using errcode = '23514';
    end if;

    if worker_school is distinct from class_school then
      raise exception 'worker_classrooms cannot relate different schools'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'meal_records' then
    select cl.school_id
      into child_school
      from public.children c
      join public.classes cl on cl.id = c.class_id
     where c.id = new.child_id;

    select mt.school_id
      into meal_type_school
      from public.meal_types mt
     where mt.id = new.meal_type_id;

    select u.school_id
      into recorder_school
      from public.users u
     where u.id = new.recorded_by;

    if child_school is distinct from meal_type_school
       or child_school is distinct from recorder_school then
      raise exception 'meal_records cannot relate different schools'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

create trigger worker_classrooms_same_school
before insert or update on public.worker_classrooms
for each row execute function public.enforce_same_school_relations();

create trigger meal_records_same_school
before insert or update on public.meal_records
for each row execute function public.enforce_same_school_relations();

create trigger parents_children_same_school
before insert or update on public.parents_children
for each row execute function public.enforce_same_school_relations();

create trigger users_same_school_relations
before update of school_id, role on public.users
for each row execute function public.enforce_same_school_relations();

create trigger classes_same_school_relations
before update of school_id on public.classes
for each row execute function public.enforce_same_school_relations();

create trigger children_same_school_relations
before update of class_id on public.children
for each row execute function public.enforce_same_school_relations();

create trigger meal_types_same_school_relations
before update of school_id on public.meal_types
for each row execute function public.enforce_same_school_relations();

-- Trigger execution does not need to expose this function to API roles. Keep
-- only the owner privilege needed to manage the trigger function.
revoke execute on function public.enforce_same_school_relations() from public;
grant execute on function public.enforce_same_school_relations() to postgres;

-- Existing rows must not contain a tenant contradiction. Rows whose tenant
-- cannot yet be derived remain valid for now and will be excluded by Task 3.
do $$
begin
  if exists (
    select 1
      from public.parents_children pc
      join public.users u on u.id = pc.parent_id
      join public.children ch on ch.id = pc.child_id
      join public.classes c on c.id = ch.class_id
     where c.school_id is not null
       and u.school_id is distinct from c.school_id
  ) then
    raise exception 'phase 2 tenant validation failed: parents_children crosses schools';
  end if;

  if exists (
    select 1
      from public.worker_classrooms wc
      join public.users u on u.id = wc.worker_id
      join public.classes c on c.id = wc.class_id
     where c.school_id is not null
       and u.school_id is distinct from c.school_id
  ) then
    raise exception 'phase 2 tenant validation failed: worker_classrooms crosses schools';
  end if;

  if exists (
    select 1
      from public.meal_records mr
      join public.children ch on ch.id = mr.child_id
      join public.classes c on c.id = ch.class_id
      join public.meal_types mt on mt.id = mr.meal_type_id
      join public.users u on u.id = mr.recorded_by
     where c.school_id is not null
       and (mt.school_id is distinct from c.school_id
         or u.school_id is distinct from c.school_id)
  ) then
    raise exception 'phase 2 tenant validation failed: meal_records crosses schools';
  end if;
end
$$;
