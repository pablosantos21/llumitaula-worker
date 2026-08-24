drop policy if exists meal_types_select_tenant on public.meal_types;

create policy meal_types_select_admin_supervisor on public.meal_types for select to authenticated
using (
  public.current_user_active()
  and public.current_user_role() in ('admin', 'supervisor')
  and school_id = public.current_school_id()
);

create policy meal_types_select_worker on public.meal_types for select to authenticated
using (
  public.current_user_active()
  and public.current_user_role() = 'worker'
  and school_id = public.current_school_id()
);
