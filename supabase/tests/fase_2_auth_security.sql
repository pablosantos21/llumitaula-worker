begin;

select plan(51);

set local role postgres;

create or replace function pg_temp.count_rows(query text)
returns bigint
language plpgsql
as $$
declare
  result bigint;
begin
  execute query into result;
  return result;
exception when undefined_table or undefined_column then
  return -1;
end;
$$;

create or replace function pg_temp.privileged_count_rows(query text)
returns bigint
language plpgsql
security definer
set search_path = pg_temp, public
as $$
declare
  result bigint;
begin
  execute query into result;
  return result;
exception when undefined_table or undefined_column then
  return -1;
end;
$$;

create or replace function pg_temp.execute_test(query text)
returns void
language plpgsql
as $$
begin
  execute query;
exception when undefined_table or undefined_column then
  raise exception 'required phase 2 relation is missing' using errcode = 'P0001';
end;
$$;

create or replace function pg_temp.change_role_and_verify(
  p_user_id uuid,
  p_role text
)
returns boolean
language plpgsql
as $$
declare
  affected_rows integer;
  persisted_role text;
begin
  update public.users
     set role = p_role::public.user_role
   where id = p_user_id;
  get diagnostics affected_rows = row_count;

  select role::text
    into persisted_role
    from public.users
   where id = p_user_id;

  return affected_rows = 1 and persisted_role = p_role;
end;
$$;

set local role authenticated;

-- Deterministic fixtures used by the phase 2 seed.
-- School A: ...0001, School B: ...0002.
-- Worker A is assigned only to class ...0011.

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select ok(
  (select count(*) = 16
   from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in (
       'users', 'schools', 'classes', 'children', 'devices',
       'worker_classrooms', 'meal_types', 'meal_records',
       'monitors', 'monitors_schools', 'menus', 'menus_schools',
       'allergens', 'child_allergens', 'parents_children', 'incidents'
     )
     and relrowsecurity),
  'all sensitive and phase 2 tables have RLS enabled'
);

select set_config('request.jwt.claims', '{}', true);
select is(
  pg_temp.privileged_count_rows($query$
    select count(*)
    from (
     select 1 from public.schools
      where id = '00000000-0000-4000-8000-000000000002'::uuid
     union all
     select 1 from public.classes
      where id = '00000000-0000-4000-8000-000000000021'::uuid
     union all
     select 1 from public.children
      where id = '00000000-0000-4000-8000-000000000225'::uuid
     union all
     select 1 from public.devices
      where id = '00000000-0000-4000-8000-000000000602'::uuid
     union all
     select 1 from public.meal_types
      where id = '00000000-0000-4000-8000-000000000612'::uuid
     union all
     select 1 from public.meal_records
      where id = '00000000-0000-4000-8000-000000000621'::uuid
    ) as b_fixtures
  $query$),
  6::bigint,
  'school B fixtures exist before cross-tenant checks'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select results_eq(
  $$select id from public.classes order by id$$,
  $$values ('00000000-0000-4000-8000-000000000011'::uuid)$$,
  'worker A sees only the class assigned to the worker'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (select count(*) from public.classes
   where id in (
     '00000000-0000-4000-8000-000000000012'::uuid,
     '00000000-0000-4000-8000-000000000021'::uuid
   )),
  0::bigint,
  'worker A cannot see unassigned or cross-tenant classes'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select results_eq(
  $$select id from public.children order by id$$,
  $$values
    ('00000000-0000-4000-8000-000000000201'::uuid),
    ('00000000-0000-4000-8000-000000000202'::uuid),
    ('00000000-0000-4000-8000-000000000203'::uuid),
    ('00000000-0000-4000-8000-000000000204'::uuid),
    ('00000000-0000-4000-8000-000000000205'::uuid),
    ('00000000-0000-4000-8000-000000000206'::uuid)$$,
  'worker A sees only children in the assigned class'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
    select count(*)
    from (
     select 1 from public.children
      where id = '00000000-0000-4000-8000-000000000225'::uuid
     union all
     select 1 from public.schools
      where id = '00000000-0000-4000-8000-000000000002'::uuid
     union all
     select 1 from public.devices
      where school_id = '00000000-0000-4000-8000-000000000002'::uuid
     union all
     select 1 from public.meal_types
      where school_id = '00000000-0000-4000-8000-000000000002'::uuid
     union all
     select 1 from public.meal_records
      where child_id = '00000000-0000-4000-8000-000000000225'::uuid
    ) as b_rows
  $query$),
  0::bigint,
  'worker A cannot see B children, devices, meal types, or meal records'
);

set local role postgres;
insert into public.parents_children (parent_id, child_id)
values ('00000000-0000-4000-8000-000000000111'::uuid,
        '00000000-0000-4000-8000-000000000213'::uuid)
on conflict (parent_id, child_id) do nothing;
insert into public.child_allergens (child_id, allergen_id)
values ('00000000-0000-4000-8000-000000000213'::uuid,
        '00000000-0000-4000-8000-000000000401'::uuid)
on conflict (child_id, allergen_id) do nothing;
insert into public.worker_classrooms (worker_id, class_id)
values ('00000000-0000-4000-8000-000000000116'::uuid,
        '00000000-0000-4000-8000-000000000011'::uuid)
on conflict (worker_id, class_id) do nothing;
insert into public.child_allergens (child_id, allergen_id)
values ('00000000-0000-4000-8000-000000000202'::uuid,
        '00000000-0000-4000-8000-000000000401'::uuid)
on conflict (child_id, allergen_id) do nothing;
insert into public.children (id, first_name, last_name, class_id)
values ('00000000-0000-4000-8000-000000000227'::uuid,
        'Allergy', 'Class Change',
        '00000000-0000-4000-8000-000000000011'::uuid)
on conflict (id) do nothing;
insert into public.child_allergens (child_id, allergen_id)
values ('00000000-0000-4000-8000-000000000227'::uuid,
        '00000000-0000-4000-8000-000000000401'::uuid)
on conflict (child_id, allergen_id) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
    select 1 from public.children
     where id = '00000000-0000-4000-8000-000000000213'::uuid
  $query$),
  0::bigint,
  'worker A parental links do not grant access to unassigned children'
);
select is(
  pg_temp.count_rows($query$
    select 1 from public.child_allergens
     where child_id = '00000000-0000-4000-8000-000000000213'::uuid
  $query$),
  0::bigint,
  'worker A parental links do not grant access to unassigned child allergens'
);
select is(
  pg_temp.count_rows($query$
    select 1 from public.classes
     where id = '00000000-0000-4000-8000-000000000012'::uuid
  $query$),
  0::bigint,
  'worker A cannot see the unassigned class in school A'
);
select results_eq(
  $$select worker_id, class_id from public.worker_classrooms
     where class_id = '00000000-0000-4000-8000-000000000011'::uuid
     order by worker_id$$,
  $$values ('00000000-0000-4000-8000-000000000111'::uuid,
            '00000000-0000-4000-8000-000000000011'::uuid)$$,
  'worker A sees only their own classroom assignments'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select results_eq(
  $$select worker_id, class_id from public.worker_classrooms
     where class_id in ('00000000-0000-4000-8000-000000000011'::uuid,
                        '00000000-0000-4000-8000-000000000012'::uuid,
                        '00000000-0000-4000-8000-000000000021'::uuid)
     order by worker_id, class_id$$,
  $$values
    ('00000000-0000-4000-8000-000000000111'::uuid,
     '00000000-0000-4000-8000-000000000011'::uuid),
    ('00000000-0000-4000-8000-000000000116'::uuid,
     '00000000-0000-4000-8000-000000000011'::uuid),
    ('00000000-0000-4000-8000-000000000116'::uuid,
     '00000000-0000-4000-8000-000000000012'::uuid)$$,
  'admin A sees all assignments in school A and no school B assignments'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select results_eq(
  $$select id from public.incidents
     where child_id = '00000000-0000-4000-8000-000000000205'::uuid
        or child_id = '00000000-0000-4000-8000-000000000218'::uuid
     order by id$$,
  $$values ('00000000-0000-4000-8000-000000000501'::uuid)$$,
  'worker A sees incidents only for assigned children'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$select pg_temp.execute_test($sql$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, status)
    values
      ('00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000225'::uuid,
       '00000000-0000-4000-8000-000000000612'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       'bien'$sql$)$$,
  '42501',
  'worker A cannot insert a meal record for school B'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select lives_ok(
  $$select pg_temp.execute_test($sql$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, status)
    values
      ('00000000-0000-4000-8000-000000000612'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       'bien'$sql$)$$,
  'worker A can insert a meal record for an assigned child'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000613'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       now() + interval '1 hour',
       'bien')$$,
  '42501',
  'worker A cannot insert a future meal record'
);
select throws_ok(
  $$update public.meal_records
       set recorded_at = now() + interval '1 hour'
     where id = '00000000-0000-4000-8000-000000000612'::uuid$$,
  '42501',
  'worker A cannot update a meal record to the future'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select set_config('request.jwt.claims', '{}', true);
select is(
  pg_temp.privileged_count_rows($query$
    select count(*)
    from public.meal_records mr
   where (mr.id = '00000000-0000-4000-8000-000000000623'::uuid
          and mr.recorded_by = '00000000-0000-4000-8000-000000000111'::uuid
          and mr.recorded_at < now() - interval '24 hours')
      or (mr.id = '00000000-0000-4000-8000-000000000624'::uuid
          and mr.recorded_by <> '00000000-0000-4000-8000-000000000111'::uuid
          and exists (
            select 1
            from public.children c
            join public.classes cl on cl.id = c.class_id
            where c.id = mr.child_id
              and cl.school_id = '00000000-0000-4000-8000-000000000001'::uuid
          )))
  $query$),
  2::bigint,
  'old own and same-tenant other-worker records exist with expected ownership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
   with attempted as (
     update public.meal_records
        set notes = 'cross-tenant update'
      where id = '00000000-0000-4000-8000-000000000624'::uuid
      returning id
   ) select count(*) from attempted
  $query$),
  0::bigint,
  'worker A cannot update another worker meal record'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
   with attempted as (
     delete from public.meal_records
      where id = '00000000-0000-4000-8000-000000000621'::uuid
      returning id
   ) select count(*) from attempted
  $query$),
  0::bigint,
  'worker A cannot delete a meal record from school B'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
   with attempted as (
     update public.meal_records
        set notes = 'too old'
      where id = '00000000-0000-4000-8000-000000000623'::uuid
      returning id
   ) select count(*) from attempted
  $query$),
  0::bigint,
  'worker A cannot update a record older than 24 hours'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (select count(*)
   from public.children c
   join public.classes cl on cl.id = c.class_id
   join public.schools s on s.id = cl.school_id
   where s.id = '00000000-0000-4000-8000-000000000001'::uuid
     and c.id in (
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000202'::uuid,
       '00000000-0000-4000-8000-000000000203'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000205'::uuid,
       '00000000-0000-4000-8000-000000000206'::uuid,
       '00000000-0000-4000-8000-000000000207'::uuid,
       '00000000-0000-4000-8000-000000000208'::uuid,
       '00000000-0000-4000-8000-000000000209'::uuid,
       '00000000-0000-4000-8000-000000000210'::uuid,
       '00000000-0000-4000-8000-000000000211'::uuid,
       '00000000-0000-4000-8000-000000000212'::uuid
     )),
  12::bigint,
  'supervisor A can see all children in school A'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
   with attempted as (
     update public.meal_records
        set notes = 'supervisor review'
      where id = '00000000-0000-4000-8000-000000000622'::uuid
      returning id
   ) select count(*) from attempted
  $query$),
  1::bigint,
  'supervisor A can update a meal record in school A'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
    select count(*) from public.meal_records
     where child_id = '00000000-0000-4000-8000-000000000225'::uuid
  $query$),
  0::bigint,
  'supervisor A cannot read meal records from school B'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select lives_ok(
  $test$select pg_temp.execute_test($inner$do $body$
  begin
    insert into public.devices (id, school_id, name, identifier)
    values (
      '00000000-0000-4000-8000-000000000693'::uuid,
      '00000000-0000-4000-8000-000000000001'::uuid,
      'Admin CRUD device',
      'admin-crud-test'
    );
    update public.devices
       set name = 'Admin CRUD device updated'
     where id = '00000000-0000-4000-8000-000000000693'::uuid;
    if not found then
      raise exception 'admin update did not affect the inserted device';
    end if;
    delete from public.devices
     where id = '00000000-0000-4000-8000-000000000693'::uuid;
    if not found then
      raise exception 'admin delete did not affect the inserted device';
    end if;
  end
  $body$;$inner$)$test$,
  'admin A can insert, update, and delete a device in school A'
);

select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$update public.users
       set role = 'supervisor'
     where id = '00000000-0000-4000-8000-000000000111'::uuid$$,
  '42501',
  'worker cannot elevate their own role to supervisor'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
set local role postgres;
insert into public.menus (id, first_course, second_course, type)
values
  ('00000000-0000-4000-8000-000000000696'::uuid, 'B-only', 'Menu', 'test'),
  ('00000000-0000-4000-8000-000000000697'::uuid, 'Unassigned', 'Menu', 'test');
insert into public.menus_schools (menu_id, school_id)
values ('00000000-0000-4000-8000-000000000696'::uuid,
        '00000000-0000-4000-8000-000000000002'::uuid);
select is(
  pg_temp.privileged_count_rows($query$
    select count(*)
      from public.menus m
      left join public.menus_schools ms on ms.menu_id = m.id
     where m.id in (
       '00000000-0000-4000-8000-000000000696'::uuid,
       '00000000-0000-4000-8000-000000000697'::uuid
     )
     group by m.id
    having (m.id = '00000000-0000-4000-8000-000000000696'::uuid
            and count(ms.school_id) = 1
            and bool_and(ms.school_id = '00000000-0000-4000-8000-000000000002'::uuid))
        or (m.id = '00000000-0000-4000-8000-000000000697'::uuid
            and count(ms.school_id) = 0)
  $query$),
  2::bigint,
  'menu cross-tenant mutation fixtures have exact associations'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
    update public.menus
       set first_course = 'blocked'
     where id in (
       '00000000-0000-4000-8000-000000000696'::uuid,
       '00000000-0000-4000-8000-000000000697'::uuid
     )
     returning id
  $query$),
  0::bigint,
  'admin A cannot update a B-only or unassigned menu'
);
select is(
  pg_temp.count_rows($query$
    delete from public.menus
     where id in (
       '00000000-0000-4000-8000-000000000696'::uuid,
       '00000000-0000-4000-8000-000000000697'::uuid
     )
     returning id
  $query$),
  0::bigint,
  'admin A cannot delete a B-only or unassigned menu'
);

select is(
  pg_temp.count_rows($query$
    select 1 from public.menus_schools
     where menu_id = '00000000-0000-4000-8000-000000000696'::uuid
       and school_id = '00000000-0000-4000-8000-000000000002'::uuid
  $query$),
  0::bigint,
  'admin A cannot read a B-only menu association'
);
select throws_ok(
  $$insert into public.menus_schools (menu_id, school_id)
    values ('00000000-0000-4000-8000-000000000696'::uuid,
            '00000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501',
  'admin A cannot associate a B-only menu with school A'
);
select is(
  pg_temp.count_rows($query$
    update public.menus_schools
       set school_id = '00000000-0000-4000-8000-000000000001'::uuid
     where menu_id = '00000000-0000-4000-8000-000000000696'::uuid
       and school_id = '00000000-0000-4000-8000-000000000002'::uuid
     returning menu_id
  $query$),
  0::bigint,
  'admin A cannot move a B-only menu association to school A'
);
select is(
  pg_temp.count_rows($query$
    delete from public.menus_schools
     where menu_id = '00000000-0000-4000-8000-000000000696'::uuid
       and school_id = '00000000-0000-4000-8000-000000000002'::uuid
     returning menu_id
  $query$),
  0::bigint,
  'admin A cannot delete a B-only menu association'
);

set local role service_role;
select throws_ok(
  $$insert into public.menus_schools (menu_id, school_id)
    values ('00000000-0000-4000-8000-000000000696'::uuid,
            '00000000-0000-4000-8000-000000000001'::uuid)$$,
  '23514',
  'direct menu association rejects a cross-tenant school'
);
set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$select pg_temp.execute_test($sql$insert into public.devices (id, school_id, name, identifier)
    values
      ('00000000-0000-4000-8000-000000000695'::uuid,
       '00000000-0000-4000-8000-000000000002'::uuid,
       'B device', 'device-b-test'$sql$)$$,
  '42501',
  'admin A cannot create a device in school B'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
    select 1 from public.schools
     where id = '00000000-0000-4000-8000-000000000002'::uuid
  $query$),
  0::bigint,
  'supervisor A cannot read school B'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
   with attempted as (
     update public.meal_records
        set notes = 'cross-tenant update'
      where id = '00000000-0000-4000-8000-000000000621'::uuid
      returning id
   ) select count(*) from attempted
  $query$),
  0::bigint,
  'worker A cannot update a meal record from school B'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$insert into public.users (id, school_id, full_name, role)
    values
      ('00000000-0000-4000-8000-000000000199'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       'Orphan profile', 'worker')$$,
  '23503',
  'a profile without a matching auth user is rejected by the FK'
);

select ok(
  pg_temp.privileged_count_rows($query$
    select count(*)
      from (
        select u.id
          from public.users u
          join (values
            ('00000000-0000-4000-8000-000000000111'::uuid, 'worker'),
            ('00000000-0000-4000-8000-000000000112'::uuid, 'supervisor'),
            ('00000000-0000-4000-8000-000000000113'::uuid, 'admin')
          ) expected(id, role) on expected.id = u.id
         where u.role::text = expected.role
           and u.school_id = '00000000-0000-4000-8000-000000000001'::uuid
           and u.active
        union all
        select au.id
          from auth.users au
          where (au.id, au.email) in (
            ('00000000-0000-4000-8000-000000000111'::uuid, 'worker.a@local.test'),
            ('00000000-0000-4000-8000-000000000112'::uuid, 'supervisor.a@local.test'),
            ('00000000-0000-4000-8000-000000000113'::uuid, 'admin.a@local.test')
          )
           and au.role = 'authenticated'
        union all
        select a.id
          from public.allergens a
         where (a.id, a.name) in (
           ('00000000-0000-4000-8000-000000000498'::uuid, 'B-only test allergen'),
           ('00000000-0000-4000-8000-000000000499'::uuid, 'Shared test allergen')
         )
        union all
        select c.id
          from public.children c
          join public.classes cl on cl.id = c.class_id
         where (c.id, cl.school_id) in (
           ('00000000-0000-4000-8000-000000000214'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
           ('00000000-0000-4000-8000-000000000225'::uuid, '00000000-0000-4000-8000-000000000002'::uuid)
         )
           and not exists (
             select 1
               from public.worker_classrooms wc
              where wc.class_id = c.class_id
                and wc.worker_id = '00000000-0000-4000-8000-000000000111'::uuid
           )
        union all
        select ca.child_id
          from public.child_allergens ca
         where (ca.child_id, ca.allergen_id) in (
            ('00000000-0000-4000-8000-000000000225'::uuid, '00000000-0000-4000-8000-000000000499'::uuid),
           ('00000000-0000-4000-8000-000000000225'::uuid, '00000000-0000-4000-8000-000000000498'::uuid)
         )
        union all
        select c.id
         from public.children c
         where c.id = '00000000-0000-4000-8000-000000000226'::uuid
           and c.first_name = 'Null'
           and c.last_name = 'Class'
           and c.class_id is null
      ) fixtures
  $query$) = 13,
  'role, auth, allergy, and null-class fixtures have exact values'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$update public.users
       set role = 'admin'
     where id = '00000000-0000-4000-8000-000000000112'::uuid$$,
  '42501',
  'admin cannot elevate a supervisor to admin'
);

select ok(
  pg_temp.change_role_and_verify(
    '00000000-0000-4000-8000-000000000112'::uuid,
    'worker'
  ),
  'admin can safely demote a supervisor to worker'
);

select ok(
  pg_temp.change_role_and_verify(
    '00000000-0000-4000-8000-000000000112'::uuid,
    'supervisor'
  ),
  'admin can restore the supervisor role in the same transaction'
);

select throws_ok(
  $$update public.users
       set role = 'supervisor'
     where id = '00000000-0000-4000-8000-000000000113'::uuid$$,
  '42501',
  'admin cannot change their own role'
);

select is(
  pg_temp.count_rows($query$
    update public.allergens
       set name = 'shared allergen blocked'
     where id = '00000000-0000-4000-8000-000000000499'
     returning id
  $query$),
  0::bigint,
  'admin cannot update a B-only allergen from another school'
);

select is(
  pg_temp.count_rows($query$
    delete from public.allergens
     where id = '00000000-0000-4000-8000-000000000499'
     returning id
  $query$),
  0::bigint,
  'admin cannot delete a B-only allergen from another school'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
set local role postgres;
do $$
begin
  if not exists (
    select 1 from public.children
     where id = '00000000-0000-4000-8000-000000000226'::uuid
       and class_id is null
  )
  or not exists (
    select 1 from public.allergens
     where id = '00000000-0000-4000-8000-000000000401'::uuid
  )
  or exists (
    select 1 from public.child_allergens
     where child_id = '00000000-0000-4000-8000-000000000226'::uuid
       and allergen_id = '00000000-0000-4000-8000-000000000401'::uuid
  ) then
    raise exception 'child without class allergy fixtures are not exact';
  end if;
end
$$;
set local role service_role;
select throws_ok(
  $$insert into public.child_allergens (child_id, allergen_id)
    values ('00000000-0000-4000-8000-000000000226'::uuid,
            '00000000-0000-4000-8000-000000000401'::uuid)$$,
  '23514',
  'direct child_allergens insert rejects a child without a class'
);

set local role postgres;
do $$
begin
  if not exists (
    select 1
      from public.children c
      join public.classes cl on cl.id = c.class_id
     where c.id = '00000000-0000-4000-8000-000000000202'::uuid
       and cl.school_id = '00000000-0000-4000-8000-000000000001'::uuid
  )
  or not exists (
    select 1
      from public.child_allergens ca
      join public.children c on c.id = ca.child_id
      join public.classes cl on cl.id = c.class_id
     where ca.child_id = '00000000-0000-4000-8000-000000000225'::uuid
       and ca.allergen_id = '00000000-0000-4000-8000-000000000498'::uuid
       and cl.school_id = '00000000-0000-4000-8000-000000000002'::uuid
  )
  or (select count(*) from public.child_allergens ca
       where ca.allergen_id = '00000000-0000-4000-8000-000000000499'::uuid
         and ca.child_id = '00000000-0000-4000-8000-000000000225'::uuid) <> 1
  or exists (
    select 1 from public.child_allergens
     where child_id = '00000000-0000-4000-8000-000000000201'::uuid
       and allergen_id = '00000000-0000-4000-8000-000000000499'::uuid
  )
  or (select count(*) from public.child_allergens ca
       where ca.child_id = '00000000-0000-4000-8000-000000000202'::uuid
         and ca.allergen_id = '00000000-0000-4000-8000-000000000401'::uuid) <> 1
  or exists (
    select 1 from public.child_allergens
     where child_id = '00000000-0000-4000-8000-000000000202'::uuid
       and allergen_id in (
         '00000000-0000-4000-8000-000000000498'::uuid,
         '00000000-0000-4000-8000-000000000499'::uuid
       )
  ) then
    raise exception 'allergy association fixtures are not exact';
  end if;
end
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$insert into public.child_allergens (child_id, allergen_id)
    values ('00000000-0000-4000-8000-000000000202'::uuid,
            '00000000-0000-4000-8000-000000000499'::uuid)$$,
  '42501',
  'admin A cannot associate allergen 499 from B with a school A child'
);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
    select 1 from public.allergens a
     where a.id = '00000000-0000-4000-8000-000000000499'::uuid
  $query$),
  0::bigint,
  'worker A cannot read the B-only shared-test allergen'
);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$update public.child_allergens
       set allergen_id = '00000000-0000-4000-8000-000000000499'::uuid
     where child_id = '00000000-0000-4000-8000-000000000202'::uuid
       and allergen_id = '00000000-0000-4000-8000-000000000401'::uuid$$,
  '42501',
  'admin A cannot update an A association to allergen 499 from B'
);

set local role postgres;
do $$
begin
  if not exists (
    select 1
      from public.children c
      join public.classes cl on cl.id = c.class_id
     where c.id = '00000000-0000-4000-8000-000000000227'::uuid
       and cl.id = '00000000-0000-4000-8000-000000000011'::uuid
       and cl.school_id = '00000000-0000-4000-8000-000000000001'::uuid
  )
  or (select count(*) from public.child_allergens
       where child_id = '00000000-0000-4000-8000-000000000227'::uuid
         and allergen_id = '00000000-0000-4000-8000-000000000401'::uuid) <> 1 then
    raise exception 'child class allergy fixtures are not exact';
  end if;
end
$$;
set local role service_role;
select throws_ok(
  $$update public.children
       set class_id = '00000000-0000-4000-8000-000000000021'::uuid
     where id = '00000000-0000-4000-8000-000000000227'::uuid$$,
  '23514',
  'direct child class change rejects an allergy tenant mismatch'
);

set local role postgres;
select lives_ok(
  $$delete from auth.users
     where id = '00000000-0000-4000-8000-000000000111'::uuid$$,
  'deleting Auth user with profile relations does not raise a foreign-key error'
);
select is(
  (select count(*)
     from (
       select 1 from auth.users
        where id = '00000000-0000-4000-8000-000000000111'::uuid
       union all
       select 1 from public.users
        where id = '00000000-0000-4000-8000-000000000111'::uuid
       union all
       select 1 from public.parents_children
        where parent_id = '00000000-0000-4000-8000-000000000111'::uuid
       union all
       select 1 from public.worker_classrooms
        where worker_id = '00000000-0000-4000-8000-000000000111'::uuid
       union all
       select 1 from public.meal_records
        where recorded_by = '00000000-0000-4000-8000-000000000111'::uuid
     ) remaining),
  0::bigint,
  'deleting Auth user cascades profile and dependent relations'
);

select * from finish();
rollback;
