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
    '{role}',
    to_jsonb((select role from public.users where id = (event->>'user_id')::uuid)),
    true
  );
  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

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

create policy users_insert_own on public.users for insert to authenticated
  with check (auth.uid() = id);
create policy users_select on public.users for select to authenticated
  using (auth.uid() = id or (auth.jwt() ->> 'role') = 'admin');
create policy users_update on public.users for update to authenticated
  using (auth.uid() = id or (auth.jwt() ->> 'role') = 'admin')
  with check (auth.uid() = id or (auth.jwt() ->> 'role') = 'admin');

create policy schools_select on public.schools for select to authenticated using (true);
create policy schools_insert on public.schools for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy schools_update on public.schools for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy schools_delete on public.schools for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy classes_select on public.classes for select to authenticated using (true);
create policy classes_insert on public.classes for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy classes_update on public.classes for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy classes_delete on public.classes for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy monitors_select on public.monitors for select to authenticated using (true);
create policy monitors_insert on public.monitors for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy monitors_update on public.monitors for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy monitors_delete on public.monitors for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy monitors_schools_select on public.monitors_schools for select to authenticated using (true);
create policy monitors_schools_insert on public.monitors_schools for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy monitors_schools_update on public.monitors_schools for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy monitors_schools_delete on public.monitors_schools for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy children_select on public.children for select to authenticated
  using (
    (auth.jwt() ->> 'role') = 'admin'
    or class_id in (
      select c.id from public.classes c
      join public.monitors_schools ms on ms.school_id = c.school_id
      where ms.monitor_id in (select m.id from public.monitors m where m.code is not null)
    )
    or id in (select pc.child_id from public.parents_children pc where pc.parent_id = auth.uid())
  );
create policy children_insert on public.children for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy children_update on public.children for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy children_delete on public.children for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy parents_children_select on public.parents_children for select to authenticated
  using ((auth.jwt() ->> 'role') in ('admin', 'monitor') or parent_id = auth.uid());
create policy parents_children_insert on public.parents_children for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy parents_children_update on public.parents_children for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy parents_children_delete on public.parents_children for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy menus_select on public.menus for select to authenticated
  using (
    (auth.jwt() ->> 'role') = 'admin'
    or id in (
      select m.id from public.menus m
      join public.menus_schools ms on ms.menu_id = m.id
      where ms.school_id in (
        select monitor_schools.school_id from public.monitors_schools monitor_schools
        where monitor_schools.monitor_id in (select mon.id from public.monitors mon where mon.code is not null)
      )
    )
    or id in (
      select m.id from public.menus m
      join public.menus_schools ms on ms.menu_id = m.id
      join public.schools s on s.id = ms.school_id
      where s.id in (
        select distinct c.school_id from public.classes c
        join public.children ch on ch.class_id = c.id
        join public.parents_children pc on pc.child_id = ch.id
        where pc.parent_id = auth.uid()
      )
    )
  );
create policy menus_insert on public.menus for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy menus_update on public.menus for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy menus_delete on public.menus for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy menus_schools_select on public.menus_schools for select to authenticated
  using (
    (auth.jwt() ->> 'role') = 'admin'
    or school_id in (
      select ms.school_id from public.monitors_schools ms
      where ms.monitor_id in (select mon.id from public.monitors mon where mon.code is not null)
    )
    or school_id in (
      select distinct c.school_id from public.classes c
      join public.children ch on ch.class_id = c.id
      join public.parents_children pc on pc.child_id = ch.id
      where pc.parent_id = auth.uid()
    )
  );
create policy menus_schools_insert on public.menus_schools for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy menus_schools_update on public.menus_schools for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy menus_schools_delete on public.menus_schools for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy allergens_select on public.allergens for select to authenticated using (true);
create policy allergens_insert on public.allergens for insert to authenticated
  with check ((auth.jwt() ->> 'role') = 'admin');
create policy allergens_update on public.allergens for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy allergens_delete on public.allergens for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');

create policy child_allergens_select on public.child_allergens for select to authenticated using (true);
create policy child_allergens_insert on public.child_allergens for insert to authenticated with check (true);
create policy child_allergens_update on public.child_allergens for update to authenticated using (true) with check (true);
create policy child_allergens_delete on public.child_allergens for delete to authenticated using (true);

create policy incidents_select on public.incidents for select to authenticated
  using (
    (auth.jwt() ->> 'role') = 'admin'
    or child_id in (
      select ch.id from public.children ch
      join public.classes c on c.id = ch.class_id
      join public.monitors_schools ms on ms.school_id = c.school_id
      where ms.monitor_id in (select mon.id from public.monitors mon where mon.code is not null)
    )
    or child_id in (select pc.child_id from public.parents_children pc where pc.parent_id = auth.uid())
  );
create policy incidents_insert on public.incidents for insert to authenticated
  with check (
    (auth.jwt() ->> 'role') = 'admin'
    or child_id in (
      select ch.id from public.children ch
      join public.classes c on c.id = ch.class_id
      join public.monitors_schools ms on ms.school_id = c.school_id
      where ms.monitor_id in (select mon.id from public.monitors mon where mon.code is not null)
    )
  );
create policy incidents_update on public.incidents for update to authenticated
  using ((auth.jwt() ->> 'role') = 'admin') with check ((auth.jwt() ->> 'role') = 'admin');
create policy incidents_delete on public.incidents for delete to authenticated
  using ((auth.jwt() ->> 'role') = 'admin');
