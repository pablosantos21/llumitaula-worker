begin;

select plan(22);

set local role authenticated;

-- Deterministic fixtures used by the phase 2 seed.
-- School A: ...0001, School B: ...0002.
-- Worker A is assigned only to class ...0011.

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

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000111',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (select count(*) from public.schools
   where id = '00000000-0000-4000-8000-000000000002'::uuid),
  0::bigint,
  'worker A cannot see school B'
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
  (select count(*)
   from (
     select 1 from public.children
      where id = '00000000-0000-4000-8000-000000000221'::uuid
     union all
     select 1 from public.devices
      where school_id = '00000000-0000-4000-8000-000000000002'::uuid
     union all
     select 1 from public.meal_types
      where school_id = '00000000-0000-4000-8000-000000000002'::uuid
     union all
     select 1 from public.meal_records
      where child_id = '00000000-0000-4000-8000-000000000221'::uuid
   ) as b_rows),
  0::bigint,
  'worker A cannot see B children, devices, meal types, or meal records'
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
      (id, child_id, meal_type_id, recorded_by, status)
    values
      ('00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000221'::uuid,
       '00000000-0000-4000-8000-000000000621'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       'bien')$$,
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
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, status)
    values
      ('00000000-0000-4000-8000-000000000612'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       'bien')$$,
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
select is(
  (with attempted as (
     update public.meal_records
        set notes = 'cross-tenant update'
      where id = '00000000-0000-4000-8000-000000000631'::uuid
      returning id
   ) select count(*) from attempted),
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
  (with attempted as (
     update public.meal_records
        set notes = 'too old'
      where id = '00000000-0000-4000-8000-000000000632'::uuid
      returning id
   ) select count(*) from attempted),
  0::bigint,
  'worker A cannot update a record older than 24 hours'
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
  $$insert into public.devices (id, school_id, name, identifier)
    values
      ('00000000-0000-4000-8000-000000000642'::uuid,
       '00000000-0000-4000-8000-000000000002'::uuid,
       'Worker B device', 'worker-device-b-test')$$,
  '42501',
  'worker A cannot insert a device in school B'
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
  (with attempted as (
     update public.children
        set last_name = 'cross-tenant update'
      where id = '00000000-0000-4000-8000-000000000221'::uuid
      returning id
   ) select count(*) from attempted),
  0::bigint,
  'worker A cannot update a child from school B'
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
  (select count(*) from public.schools
   where id = '00000000-0000-4000-8000-000000000001'::uuid),
  1::bigint,
  'supervisor A can see school A'
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
  (select count(*) from public.children
   where id between '00000000-0000-4000-8000-000000000201'::uuid
                 and '00000000-0000-4000-8000-000000000212'::uuid),
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
  (with attempted as (
     update public.meal_records
        set notes = 'supervisor review'
      where id = '00000000-0000-4000-8000-000000000633'::uuid
      returning id
   ) select count(*) from attempted),
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
  (select count(*) from public.meal_records
   where child_id = '00000000-0000-4000-8000-000000000221'::uuid),
  0::bigint,
  'supervisor A cannot read meal records from school B'
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
  (select count(*) from public.schools
   where id = '00000000-0000-4000-8000-000000000002'::uuid),
  0::bigint,
  'supervisor A cannot read school B'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (select count(*) from public.schools
   where id = '00000000-0000-4000-8000-000000000001'::uuid),
  1::bigint,
  'admin A can manage school A'
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
  $$insert into public.devices (id, school_id, name, identifier)
    values
      ('00000000-0000-4000-8000-000000000643'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       'A device', 'device-a-test')$$,
  'admin A can create a device in school A'
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
  $$insert into public.devices (id, school_id, name, identifier)
    values
      ('00000000-0000-4000-8000-000000000641'::uuid,
       '00000000-0000-4000-8000-000000000002'::uuid,
       'B device', 'device-b-test')$$,
  '42501',
  'admin A cannot create a device in school B'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (select count(*) from public.devices
   where school_id = '00000000-0000-4000-8000-000000000002'::uuid),
  0::bigint,
  'admin A cannot read devices from school B'
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

select * from finish();
rollback;
