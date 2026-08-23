-- Baseline for project hjrxyobgukrwrcaslhok.
-- The policies depend on Supabase Auth's local auth.users, auth.uid() and
-- auth.jwt(). The local stack must keep Auth enabled; this migration does not
-- create or seed auth.users.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'monitor', 'padre');
create type public.meal_status as enum ('bien', 'regular', 'mal');

create table public.users (
  id uuid primary key default auth.uid(),
  role public.user_role not null,
  created_at timestamptz default now()
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_id uuid references public.schools(id)
);

create table public.monitors (
  first_name text not null,
  last_name text not null,
  created_at timestamptz default now(),
  code smallint not null,
  id uuid primary key default gen_random_uuid()
);

create table public.monitors_schools (
  monitor_id uuid not null references public.monitors(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  primary key (school_id, monitor_id)
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  class_id uuid references public.classes(id),
  created_at timestamptz default now()
);

create table public.parents_children (
  parent_id uuid not null references public.users(id),
  child_id uuid not null references public.children(id),
  primary key (parent_id, child_id)
);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  first_course text not null,
  second_course text not null,
  side text,
  salad text,
  dessert text,
  type text not null
);

create table public.menus_schools (
  menu_id uuid not null references public.menus(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  date date not null default current_date,
  primary key (menu_id, school_id)
);

create table public.allergens (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.child_allergens (
  child_id uuid not null references public.children(id) on delete cascade,
  allergen_id uuid not null references public.allergens(id) on delete cascade,
  primary key (child_id, allergen_id)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references public.children(id),
  description text,
  created_at timestamptz default now(),
  monitor_id uuid not null references public.monitors(id),
  date date default current_date,
  reviewed boolean default false,
  requires_family_signature boolean default false,
  send_notification boolean default false,
  family_seen boolean default false,
  family_response text,
  family_responded_at timestamptz,
  monitor_validated boolean default false
);

create index children_class_id_idx on public.children (class_id);
create index classes_school_id_idx on public.classes (school_id);
create index child_allergens_allergen_id_idx on public.child_allergens (allergen_id);
create index incidents_child_id_idx on public.incidents (child_id);
create index incidents_monitor_id_idx on public.incidents (monitor_id);
create index incidents_date_idx on public.incidents (date);
create index menus_schools_school_id_idx on public.menus_schools (school_id);
create index menus_schools_date_idx on public.menus_schools (date);
create index menus_type_idx on public.menus (type);
create index monitors_schools_monitor_id_idx on public.monitors_schools (monitor_id);
create index parents_children_child_id_idx on public.parents_children (child_id);

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claims jsonb;
begin
  claims := event->'claims';
  claims := jsonb_set(
    claims,
    '{user_role}',
    to_jsonb((select role from public.users where id = (event->>'user_id')::uuid)),
    true
  );
  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

-- Grants define which API roles can reach the objects; RLS policies below
-- remain the effective row-level authorization for authenticated clients.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on table public.users to authenticated;
grant select, insert, update, delete on table public.schools to authenticated;
grant select, insert, update, delete on table public.classes to authenticated;
grant select, insert, update, delete on table public.monitors to authenticated;
grant select, insert, update, delete on table public.monitors_schools to authenticated;
grant select, insert, update, delete on table public.children to authenticated;
grant select, insert, update, delete on table public.parents_children to authenticated;
grant select, insert, update, delete on table public.menus to authenticated;
grant select, insert, update, delete on table public.menus_schools to authenticated;
grant select, insert, update, delete on table public.allergens to authenticated;
grant select, insert, update, delete on table public.child_allergens to authenticated;
grant select, insert, update, delete on table public.incidents to authenticated;

grant all privileges on table public.users to service_role;
grant all privileges on table public.schools to service_role;
grant all privileges on table public.classes to service_role;
grant all privileges on table public.monitors to service_role;
grant all privileges on table public.monitors_schools to service_role;
grant all privileges on table public.children to service_role;
grant all privileges on table public.parents_children to service_role;
grant all privileges on table public.menus to service_role;
grant all privileges on table public.menus_schools to service_role;
grant all privileges on table public.allergens to service_role;
grant all privileges on table public.child_allergens to service_role;
grant all privileges on table public.incidents to service_role;

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

-- Monitor-facing access remains disabled until monitors has a verifiable
-- auth.users identity link; only admins can view monitor records and assignments.
create policy users_insert_own on public.users for insert to authenticated
  with check (
    (auth.jwt() ->> 'user_role') = 'admin'
    or (auth.uid() = id and role = 'padre')
  );
create policy users_select on public.users for select to authenticated
  using (auth.uid() = id or (auth.jwt() ->> 'user_role') = 'admin');
create policy users_update on public.users for update to authenticated
  using (auth.uid() = id or (auth.jwt() ->> 'user_role') = 'admin')
  with check (
    (auth.jwt() ->> 'user_role') = 'admin'
    or (auth.uid() = id and role = 'padre')
  );

create policy schools_select on public.schools for select to authenticated using (true);
create policy schools_insert on public.schools for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy schools_update on public.schools for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy schools_delete on public.schools for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy classes_select on public.classes for select to authenticated using (true);
create policy classes_insert on public.classes for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy classes_update on public.classes for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy classes_delete on public.classes for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy monitors_select on public.monitors for select to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');
create policy monitors_insert on public.monitors for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy monitors_update on public.monitors for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy monitors_delete on public.monitors for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy monitors_schools_select on public.monitors_schools for select to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');
create policy monitors_schools_insert on public.monitors_schools for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy monitors_schools_update on public.monitors_schools for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy monitors_schools_delete on public.monitors_schools for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy children_select on public.children for select to authenticated
  using (
    (auth.jwt() ->> 'user_role') = 'admin'
    or id in (select pc.child_id from public.parents_children pc where pc.parent_id = auth.uid())
  );
create policy children_insert on public.children for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy children_update on public.children for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy children_delete on public.children for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy parents_children_select on public.parents_children for select to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin' or parent_id = auth.uid());
create policy parents_children_insert on public.parents_children for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy parents_children_update on public.parents_children for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy parents_children_delete on public.parents_children for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy menus_select on public.menus for select to authenticated
  using (
    (auth.jwt() ->> 'user_role') = 'admin'
    or id in (
      select ms.menu_id from public.menus_schools ms
      join public.classes c on c.school_id = ms.school_id
      join public.children ch on ch.class_id = c.id
      join public.parents_children pc on pc.child_id = ch.id
      where pc.parent_id = auth.uid()
    )
  );
create policy menus_insert on public.menus for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy menus_update on public.menus for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy menus_delete on public.menus for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy menus_schools_select on public.menus_schools for select to authenticated
  using (
    (auth.jwt() ->> 'user_role') = 'admin'
    or school_id in (
      select distinct c.school_id from public.classes c
      join public.children ch on ch.class_id = c.id
      join public.parents_children pc on pc.child_id = ch.id
      where pc.parent_id = auth.uid()
    )
  );
create policy menus_schools_insert on public.menus_schools for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy menus_schools_update on public.menus_schools for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy menus_schools_delete on public.menus_schools for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy allergens_select on public.allergens for select to authenticated using (true);
create policy allergens_insert on public.allergens for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy allergens_update on public.allergens for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy allergens_delete on public.allergens for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy child_allergens_select on public.child_allergens for select to authenticated
  using (
    (auth.jwt() ->> 'user_role') = 'admin'
    or child_id in (
      select pc.child_id from public.parents_children pc where pc.parent_id = auth.uid()
    )
  );
create policy child_allergens_insert on public.child_allergens for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy child_allergens_update on public.child_allergens for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin')
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy child_allergens_delete on public.child_allergens for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');

create policy incidents_select on public.incidents for select to authenticated
  using (
    (auth.jwt() ->> 'user_role') = 'admin'
    or child_id in (select pc.child_id from public.parents_children pc where pc.parent_id = auth.uid())
  );
create policy incidents_insert on public.incidents for insert to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy incidents_update on public.incidents for update to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin') with check ((auth.jwt() ->> 'user_role') = 'admin');
create policy incidents_delete on public.incidents for delete to authenticated
  using ((auth.jwt() ->> 'user_role') = 'admin');
