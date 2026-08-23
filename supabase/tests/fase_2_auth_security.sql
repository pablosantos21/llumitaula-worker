begin;

select plan(22);

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

set local role postgres;
select set_config('request.jwt.claims', '{}', true);
select is(
  (select count(*)
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
   ) as b_fixtures),
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
  (select count(*)
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
       '00000000-0000-4000-8000-000000000225'::uuid,
       '00000000-0000-4000-8000-000000000612'::uuid,
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
set local role postgres;
select set_config('request.jwt.claims', '{}', true);
select is(
  (select count(*)
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
          ))),
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
  (with attempted as (
     update public.meal_records
        set notes = 'cross-tenant update'
      where id = '00000000-0000-4000-8000-000000000624'::uuid
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
     delete from public.meal_records
      where id = '00000000-0000-4000-8000-000000000621'::uuid
      returning id
   ) select count(*) from attempted),
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
  (with attempted as (
     update public.meal_records
        set notes = 'too old'
      where id = '00000000-0000-4000-8000-000000000623'::uuid
      returning id
   ) select count(*) from attempted),
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
      where id = '00000000-0000-4000-8000-000000000622'::uuid
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
   where child_id = '00000000-0000-4000-8000-000000000225'::uuid),
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
select lives_ok(
  $test$do $inner$
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
  $inner$;$test$,
  'admin A can insert, update, and delete a device in school A'
);

set local role postgres;
select set_config('request.jwt.claims', '{}', true);
select is(
  (select count(*)
   from public.classes cl
   left join public.worker_classrooms wc
     on wc.class_id = cl.id
    and wc.worker_id = '00000000-0000-4000-8000-000000000111'::uuid
   where cl.id = '00000000-0000-4000-8000-000000000012'::uuid
     and wc.worker_id is null),
  1::bigint,
  'class A ...0012 exists and is not assigned to worker A'
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
  (select count(*) from public.devices
   where identifier = 'admin-crud-test'),
  0::bigint,
  'admin A CRUD leaves no residual device'
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
      ('00000000-0000-4000-8000-000000000695'::uuid,
       '00000000-0000-4000-8000-000000000002'::uuid,
       'B device', 'device-b-test')$$,
  '42501',
  'admin A cannot create a device in school B'
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
      where id = '00000000-0000-4000-8000-000000000621'::uuid
      returning id
   ) select count(*) from attempted),
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

select * from finish();
rollback;
