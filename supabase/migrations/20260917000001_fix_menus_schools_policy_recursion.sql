-- The menus_schools admin INSERT and UPDATE policies guarded the menu
-- binding directly with a self-referencing subquery:
--
--   not exists (select 1 from public.menus_schools existing
--                where existing.menu_id = menus_schools.menu_id
--                  and (existing.school_id is null
--                    or existing.school_id <> current_school_id()))
--
-- A policy whose expression references the same relation inlined into its
-- expression triggers "infinite recursion detected in policy for relation
-- menus_schools" (SQLSTATE 42P17) the moment the policy is evaluated, so any
-- admin write to menus_schools failed with 42P17 instead of a clean denial.
--
-- Route the binding guard through a security definer helper, the same pattern
-- the UPDATE/DELETE USING clauses already use via menu_is_tenant_private. The
-- trigger menus_schools_same_school (enforce_menu_school_tenant) still rejects
-- cross-school bindings before the policy is consulted.

create or replace function private.menu_school_binding_conflicts(
  p_menu_id uuid,
  p_school_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(2147483647, 42042);

  return exists (
    select 1
      from public.menus_schools ms
     where ms.menu_id = p_menu_id
       and ms.school_id is distinct from p_school_id
  );
end
$$;

revoke execute on function private.menu_school_binding_conflicts(uuid, uuid) from public, anon;
grant execute on function private.menu_school_binding_conflicts(uuid, uuid) to authenticated, service_role;

drop policy menus_schools_admin_insert on public.menus_schools;
create policy menus_schools_admin_insert on public.menus_schools
  for insert to authenticated
  with check (
    public.current_user_role() = 'admin'
    and school_id = public.current_school_id()
    and not private.menu_school_binding_conflicts(menu_id, public.current_school_id())
  );

drop policy menus_schools_admin_update on public.menus_schools;
create policy menus_schools_admin_update on public.menus_schools
  for update to authenticated
  using (public.current_user_role() = 'admin' and private.menu_is_tenant_private(menu_id, public.current_school_id()))
  with check (
    public.current_user_role() = 'admin'
    and school_id = public.current_school_id()
    and not private.menu_school_binding_conflicts(menu_id, public.current_school_id())
  );