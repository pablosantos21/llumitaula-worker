-- T02a: purge the 'worker' and 'supervisor' roles.
--
-- The role enum shrinks to {'admin', 'monitor', 'padre'}, the
-- worker_classrooms table disappears, and every helper / policy that
-- referenced a worker or supervisor is rewritten. record_meal_incident
-- is the only gate that gains a role: it now accepts admin OR monitor
-- (the ticket requirement), while all other prior 'admin, supervisor'
-- policies collapse to 'admin'.
--
-- This migration ships together with the matching seed changes (T02a
-- requires both to land in the same release). SQL tests under
-- supabase/tests still exercise the old roles and are repaired in T02b.

-- Refuse to purge a database that still holds purged-role data: a deployed
-- purge must be coordinated, never silent. On `db reset` migrations run
-- before the seed, so this guard passes trivially.
do $$
begin
  if exists (
    select 1
      from public.users
     where role::text in ('worker', 'supervisor')
  ) then
    raise exception
      'cannot purge worker/supervisor: % active profiles still use one of those roles',
      (select count(*) from public.users where role::text in ('worker', 'supervisor') and active)
      using errcode = '23514';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Policies that referenced a worker or supervisor are dropped first, so the
-- enum swap and the worker_classrooms drop never hit a stale dependency.
-- ---------------------------------------------------------------------------

-- worker-only policies
drop policy if exists meal_records_worker_insert on public.meal_records;
drop policy if exists meal_records_worker_update on public.meal_records;
drop policy if exists meal_types_select_worker on public.meal_types;

-- 'admin, supervisor' policies recreated below as admin-only (+ users_insert_tenant
-- recreated unchanged because its qualifier stores the enum type OID).
drop policy if exists monitors_select_tenant on public.monitors;
drop policy if exists monitors_schools_select_tenant on public.monitors_schools;
drop policy if exists parents_children_select_tenant on public.parents_children;
drop policy if exists devices_select_tenant on public.devices;
drop policy if exists meal_types_select_admin_supervisor on public.meal_types;
drop policy if exists meal_records_select_tenant on public.meal_records;
drop policy if exists meal_records_admin_supervisor_insert on public.meal_records;
drop policy if exists meal_records_admin_supervisor_update on public.meal_records;
drop policy if exists menus_select_tenant on public.menus;
drop policy if exists menus_schools_select_tenant on public.menus_schools;
drop policy if exists allergens_select_tenant on public.allergens;
drop policy if exists child_allergens_select_tenant on public.child_allergens;
drop policy if exists incidents_select_tenant on public.incidents;
drop policy if exists incidents_admin_insert on public.incidents;
drop policy if exists incidents_admin_update on public.incidents;
drop policy if exists incidents_admin_delete on public.incidents;
drop policy if exists users_insert_tenant on public.users;
-- PostgreSQL refuses to change the type of a column referenced by any policy
-- (0A000), so the remaining users policies that touch `role` are recreated
-- below after the enum swap.
drop policy if exists users_update_admin on public.users;
drop policy if exists users_update_own on public.users;
-- users_same_school_relations only ever guarded the worker-era users branch;
-- it fired on "update of school_id, role" and is inert once that branch is
-- gone, but PostgreSQL also blocks the type change while it references `role`.
drop trigger if exists users_same_school_relations on public.users;

-- ---------------------------------------------------------------------------
-- worker_classrooms and its worker-only helper go away with the roles.
-- ---------------------------------------------------------------------------

drop table if exists public.worker_classrooms;

drop function if exists private.current_user_has_assigned_child(uuid);

-- ---------------------------------------------------------------------------
-- Rebuild the user_role enum without 'worker' / 'supervisor'.
-- The old type could only be dropped after users_insert_tenant (its sole
-- policy depender) was removed above.
-- ---------------------------------------------------------------------------

create type public.user_role_new as enum ('admin', 'monitor', 'padre');

alter table public.users
  alter column role type public.user_role_new
  using role::text::public.user_role_new;

drop type public.user_role;

alter type public.user_role_new rename to user_role;

-- ---------------------------------------------------------------------------
-- Helpers: drop the worker / supervisor branches.
-- ---------------------------------------------------------------------------

-- Admins are global (as before the purge); monitors see children in the
-- schools they are assigned to; parents via parents_children.
create or replace function private.current_user_can_access_child(p_child_id uuid)
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
          and (
            public.current_user_role() = 'admin'
            or (
              public.current_user_role() = 'monitor'
              and cl.school_id in (select private.current_user_monitor_school_ids())
            )
            or exists (
              select 1 from public.parents_children pc
               where pc.child_id = ch.id
                 and pc.parent_id = public.current_user_id()
            )
          )
     )
$$;

-- Only admins navigate classes directly; monitors use classes_select_monitor,
-- parents access classes indirectly through their children.
create or replace function private.current_user_can_access_class(p_class_id uuid)
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
          and public.current_user_role()::text = 'admin'
     )
$$;

create or replace function private.user_is_valid_in_school(p_user_id uuid, p_school_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select exists (
    select 1
      from public.users u
     where u.id = p_user_id
       and u.active
       and (
         u.role::text = 'admin'
         or exists (
           select 1
             from public.parents_children pc
             join public.children ch on ch.id = pc.child_id
             left join public.classes c on c.id = ch.class_id
            where pc.parent_id = u.id
              and c.school_id = p_school_id
         )
         or exists (
           select 1
             from public.monitors m
            where m.user_id = u.id
              and m.school_id = p_school_id
         )
         or exists (
           select 1
             from public.monitors_schools ms
             join public.monitors m on m.id = ms.monitor_id
            where m.user_id = u.id
              and ms.school_id = p_school_id
         )
       )
  )
$function$;

create or replace function private.user_role_change_is_safe(
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
             when 'admin' then 3
             when 'monitor' then 2
             when 'padre' then 1
             else 0
           end >= case p_new_role
             when 'admin' then 3
             when 'monitor' then 2
             when 'padre' then 1
             else 0
           end
  )
$$;

-- ---------------------------------------------------------------------------
-- record_meal_incident: admins and monitors may record incidents.
-- ---------------------------------------------------------------------------

create or replace function public.record_meal_incident(p_child_id uuid, p_meal_type_id uuid, p_status meal_status, p_notes text, p_recorded_date date, p_recorded_at timestamp with time zone, p_monitor_id uuid, p_description text)
returns meal_records
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  child_school_id uuid;
  meal_type_school_id uuid;
  monitor_school_id uuid;
  saved_meal public.meal_records;
begin
  select u.role::text
    into v_role
    from public.users u
   where u.id = v_user_id
     and u.active;

  if v_user_id is null
     or v_role not in ('admin', 'monitor') then
    raise exception 'only active administrators and monitors may record incidents'
      using errcode = '42501';
  end if;

  if p_recorded_date < current_date - 1
     or p_recorded_date > current_date + 1
     or p_recorded_at is null
     or p_recorded_at > now() then
    raise exception 'meal incident date is outside the local date envelope or recorded_at is in the future'
      using errcode = '22023';
  end if;

  select cl.school_id
    into child_school_id
    from public.children ch
    join public.classes cl on cl.id = ch.class_id
   where ch.id = p_child_id;

  select mt.school_id
    into meal_type_school_id
    from public.meal_types mt
   where mt.id = p_meal_type_id;

  select m.school_id
    into monitor_school_id
    from public.monitors m
   where m.id = p_monitor_id;

  if child_school_id is null
     or meal_type_school_id is distinct from child_school_id
     or monitor_school_id is distinct from child_school_id then
    raise exception 'child, meal type and monitor must belong to the same school'
      using errcode = '42501';
  end if;

  insert into public.meal_records (
    child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status, notes
  ) values (
    p_child_id, p_meal_type_id, v_user_id, p_recorded_date,
    p_recorded_at, p_status, p_notes
  )
  on conflict (child_id, meal_type_id, recorded_date) do update
    set recorded_at = excluded.recorded_at,
        status = excluded.status,
        notes = excluded.notes
  returning * into saved_meal;

  insert into public.incidents (child_id, monitor_id, description, date)
  values (p_child_id, p_monitor_id, p_description, p_recorded_date);

  return saved_meal;
end;
$function$;

-- ---------------------------------------------------------------------------
-- enforce_same_school_relations: the users and worker_classrooms branches
-- guarded worker_classrooms, which no longer exists. The remaining branches
-- (classes / children / meal_types / parents_children / meal_records) are
-- unchanged apart from the dropped worker_classrooms sub-checks on classes.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_same_school_relations()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  class_school uuid;
  child_school uuid;
  meal_type_school uuid;
begin
  perform pg_advisory_xact_lock(2147483647, 42042);

  if tg_table_name = 'classes' then
    if exists (
      select 1
        from public.children ch
        join public.meal_records mr on mr.child_id = ch.id
        join public.meal_types mt on mt.id = mr.meal_type_id
       where ch.class_id = new.id
         and (mt.school_id is distinct from new.school_id
           or not private.user_is_valid_in_school(mr.recorded_by, new.school_id))
    ) or exists (
      select 1
        from public.children ch
        join public.parents_children pc on pc.child_id = ch.id
       where ch.class_id = new.id
         and exists (
           select 1
             from public.parents_children pc_other
             join public.children ch_other on ch_other.id = pc_other.child_id
             left join public.classes c_other on c_other.id = ch_other.class_id
            where pc_other.parent_id = pc.parent_id
              and pc_other.child_id is distinct from ch.id
              and c_other.school_id is distinct from new.school_id
         )
    ) or exists (
      select 1
        from public.children ch
        join public.incidents i on i.child_id = ch.id
        join public.monitors m on m.id = i.monitor_id
       where ch.class_id = new.id
         and m.school_id is distinct from new.school_id
    ) or exists (
      select 1
        from public.children ch
        join public.child_allergens ca on ca.child_id = ch.id
       where ch.class_id = new.id
         and (
           new.school_id is null
           or exists (
             select 1
               from public.child_allergens ca_other
               join public.children ch_other on ch_other.id = ca_other.child_id
               left join public.classes cl_other on cl_other.id = ch_other.class_id
              where ca_other.allergen_id = ca.allergen_id
                and (cl_other.school_id is null or cl_other.school_id <> new.school_id)
           )
         )
    ) then
      raise exception 'classes.school_id update would invalidate tenant relations'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'children' then
    select c.school_id
      into child_school
      from public.classes c
     where c.id = new.class_id;

    if exists (
      select 1
        from public.meal_records mr
        join public.meal_types mt on mt.id = mr.meal_type_id
        left join public.classes c on c.id = new.class_id
       where mr.child_id = new.id
         and (c.school_id is distinct from mt.school_id
           or not private.user_is_valid_in_school(mr.recorded_by, child_school))
    ) then
      raise exception 'children.class_id update would invalidate meal_records'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from public.parents_children pc
       where pc.child_id = new.id
         and exists (
           select 1
             from public.parents_children pc_other
             join public.children ch_other on ch_other.id = pc_other.child_id
             left join public.classes c_other on c_other.id = ch_other.class_id
            where pc_other.parent_id = pc.parent_id
              and pc_other.child_id is distinct from new.id
              and c_other.school_id is distinct from child_school
         )
    ) then
      raise exception 'children.class_id update would invalidate parents_children'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from public.child_allergens ca
       where ca.child_id = new.id
         and (
           child_school is null
           or exists (
             select 1
               from public.child_allergens ca_other
               join public.children ch_other on ch_other.id = ca_other.child_id
               left join public.classes cl_other on cl_other.id = ch_other.class_id
              where ca_other.allergen_id = ca.allergen_id
                and (cl_other.school_id is null or cl_other.school_id <> child_school)
           )
         )
    ) then
      raise exception 'children.class_id update would invalidate child_allergens'
        using errcode = '23514';
    end if;

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
       where mr.meal_type_id = new.id
         and (c.school_id is distinct from new.school_id
           or not private.user_is_valid_in_school(mr.recorded_by, new.school_id))
    ) then
      raise exception 'meal_types.school_id update would invalidate meal_records'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'parents_children' then
    select c.school_id
      into child_school
      from public.children ch
      left join public.classes c on c.id = ch.class_id
     where ch.id = new.child_id;

    if exists (
      select 1
        from public.parents_children pc_other
        join public.children ch_other on ch_other.id = pc_other.child_id
        left join public.classes c_other on c_other.id = ch_other.class_id
       where pc_other.parent_id = new.parent_id
         and pc_other.child_id is distinct from new.child_id
         and c_other.school_id is distinct from child_school
    ) then
      raise exception 'parents_children cannot relate different schools'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'meal_records' then
    if new.recorded_date < (new.recorded_at at time zone 'UTC')::date - 1
       or new.recorded_date > (new.recorded_at at time zone 'UTC')::date + 1 then
      raise exception 'meal_records.recorded_date is outside the local date envelope'
        using errcode = '23514';
    end if;

    if new.recorded_at > now() then
      raise exception 'meal_records.recorded_at cannot be in the future'
        using errcode = '23514';
    end if;

    if tg_op = 'UPDATE' and old.recorded_date is distinct from new.recorded_date then
      raise exception 'meal_records.recorded_date cannot be changed'
        using errcode = '23514';
    end if;

    select cl.school_id
      into child_school
      from public.children c
      join public.classes cl on cl.id = c.class_id
     where c.id = new.child_id;

    select mt.school_id
      into meal_type_school
      from public.meal_types mt
     where mt.id = new.meal_type_id;

    if child_school is distinct from meal_type_school then
      raise exception 'meal_records cannot relate different schools'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- Recreate the collapsed policies. Every former 'admin, supervisor' gate
-- becomes admin-only; record_meal_incident is the exception (admin | monitor).
-- Monitor-only policies from monitor_read_access are untouched.
-- ---------------------------------------------------------------------------

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

create policy monitors_select_tenant on public.monitors for select to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin'
  and school_id = public.current_school_id());

create policy monitors_schools_select_tenant on public.monitors_schools for select to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id());

create policy parents_children_select_tenant on public.parents_children for select to authenticated
using (
  public.current_user_active()
  and (parent_id = public.current_user_id()
    or (public.current_user_role() = 'admin' and private.current_user_can_access_child(child_id)))
);

create policy devices_select_tenant on public.devices for select to authenticated
using (public.current_user_role() = 'admin' and school_id = public.current_school_id());

create policy meal_types_select_admin on public.meal_types for select to authenticated
using (
  public.current_user_active()
  and public.current_user_role() = 'admin'
  and school_id = public.current_school_id()
);

create policy meal_records_select_tenant on public.meal_records for select to authenticated
using (public.current_user_active() and exists (
  select 1 from public.children ch join public.classes cl on cl.id = ch.class_id
   where ch.id = meal_records.child_id and cl.school_id = public.current_school_id()
     and (public.current_user_role() = 'admin' or meal_records.recorded_by = public.current_user_id())
));

create policy meal_records_admin_insert on public.meal_records for insert to authenticated
 with check (public.current_user_active() and public.current_user_role() = 'admin' and exists (
   select 1 from public.children ch join public.classes cl on cl.id = ch.class_id join public.meal_types mt on mt.id = meal_records.meal_type_id
    where ch.id = meal_records.child_id and cl.school_id = public.current_school_id() and mt.school_id = cl.school_id
    ) and recorded_by = public.current_user_id() and recorded_at <= now());

create policy meal_records_admin_update on public.meal_records for update to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin' and exists (
   select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = meal_records.child_id and cl.school_id = public.current_school_id()
    ) and recorded_at <= now()) with check (public.current_user_active() and public.current_user_role() = 'admin' and recorded_at <= now() and exists (
   select 1 from public.children ch join public.classes cl on cl.id = ch.class_id join public.meal_types mt on mt.id = meal_records.meal_type_id where ch.id = meal_records.child_id and cl.school_id = public.current_school_id() and mt.school_id = cl.school_id
   ) and private.meal_record_author_is_unchanged(meal_records.id, meal_records.recorded_by));

create policy menus_select_tenant on public.menus for select to authenticated
using (public.current_user_active() and exists (
  select 1 from public.menus_schools ms where ms.menu_id = menus.id and ms.school_id = public.current_school_id()
) and public.current_user_role() in ('admin', 'padre'));

create policy menus_schools_select_tenant on public.menus_schools for select to authenticated
using (
  public.current_user_active()
  and school_id = public.current_school_id()
  and (public.current_user_role() = 'admin' or exists (
    select 1 from public.children ch
    join public.classes cl on cl.id = ch.class_id
    join public.parents_children pc on pc.child_id = ch.id
    where cl.school_id = menus_schools.school_id and pc.parent_id = public.current_user_id()
  ))
);

create policy allergens_select_tenant on public.allergens for select to authenticated
using (
  public.current_user_role() = 'admin' and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id join public.classes cl on cl.id = ch.class_id where ca.allergen_id = allergens.id and cl.school_id = public.current_school_id())
  or public.current_user_role() = 'padre' and exists (select 1 from public.child_allergens ca join public.children ch on ch.id = ca.child_id where ca.allergen_id = allergens.id and private.current_user_can_access_child(ch.id))
);

create policy child_allergens_select_tenant on public.child_allergens for select to authenticated
using (public.current_user_active() and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = child_allergens.child_id and cl.school_id = public.current_school_id() and (public.current_user_role() = 'admin' or private.current_user_can_access_child(ch.id))));

create policy incidents_select_tenant on public.incidents for select to authenticated
using (
  public.current_user_active()
  and public.current_user_role() = 'admin'
  and exists (
    select 1
      from public.children ch
      join public.classes cl on cl.id = ch.class_id
     where ch.id = incidents.child_id
       and cl.school_id = public.current_school_id()
  )
);

create policy incidents_admin_insert on public.incidents for insert to authenticated
with check (public.current_user_active() and public.current_user_role() = 'admin' and private.incident_relations_are_tenant_safe(monitor_id, child_id) and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id()));

create policy incidents_admin_update on public.incidents for update to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin' and private.incident_relations_are_tenant_safe(monitor_id, child_id) and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id()))
with check (public.current_user_active() and public.current_user_role() = 'admin' and private.incident_relations_are_tenant_safe(monitor_id, child_id) and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id()));

create policy incidents_admin_delete on public.incidents for delete to authenticated
using (public.current_user_active() and public.current_user_role() = 'admin' and private.incident_relations_are_tenant_safe(monitor_id, child_id) and exists (select 1 from public.children ch join public.classes cl on cl.id = ch.class_id where ch.id = incidents.child_id and cl.school_id = public.current_school_id()));