begin;

select plan(132);

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

select ok(
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'meal_records'
       and column_name = 'recorded_date'
       and is_nullable = 'NO'
       and column_default = 'CURRENT_DATE'
  ),
  'meal_records has a required current-date default'
);
select ok(
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.meal_records'::regclass
       and contype = 'u'
       and conname = 'meal_records_child_meal_type_date_key'
  ),
  'meal_records has a daily composite uniqueness constraint'
);
select ok(
  exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'meal_records'
       and indexname = 'meal_records_child_meal_date_idx'
  ),
  'meal_records has a daily lookup index'
);
select is(
  (select count(*) from public.meal_records
    where child_id = '00000000-0000-4000-8000-000000000201'::uuid
      and meal_type_id = '00000000-0000-4000-8000-000000000611'::uuid),
  2::bigint,
  'seed contains daily and historical records for the same child and meal type'
);
select ok(
  exists (
    select 1 from pg_trigger
     where tgrelid = 'public.meal_records'::regclass
       and tgname = 'meal_records_date_boundaries'
  ),
  'meal_records has a date-boundary trigger'
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
select set_config('request.jwt.claims', '{}', true);
set local role service_role;
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-0000-0000-000000000627'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  'service_role without auth.uid cannot insert a meal record'
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
    select 1 from public.meal_types
     where school_id = '00000000-0000-4000-8000-000000000001'::uuid
  $query$),
  1::bigint,
  'worker A can read meal types from their school'
);

select throws_ok(
  $$insert into public.meal_types (id, school_id, name)
    values ('00000000-0000-4000-8000-000000000699'::uuid,
            '00000000-0000-4000-8000-000000000001'::uuid,
            'Worker write must fail')$$,
  '42501',
  'worker meal types access is read-only'
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
set local role postgres;
select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-0000-0000-000000000626'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       current_date, now(), 'bien')$$,
  'postgres seed context may insert without auth.uid'
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
select is(
  pg_temp.count_rows($query$
    select id from public.incidents
     where child_id = '00000000-0000-4000-8000-000000000205'::uuid
        or child_id = '00000000-0000-4000-8000-000000000218'::uuid
  $query$),
  0::bigint,
  'worker A cannot see incidents, even for assigned children'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select lives_ok(
  $$insert into public.incidents (id, child_id, monitor_id, description, date)
    values ('00000000-0000-4000-8000-000000000503'::uuid,
            '00000000-0000-4000-8000-000000000201'::uuid,
            '00000000-0000-4000-8000-000000000021'::uuid,
            'Supervisor incident', current_date)$$,
  'supervisor A can create an incident in school A'
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
  $$insert into public.incidents (id, child_id, monitor_id, description, date)
    values ('00000000-0000-4000-8000-000000000504'::uuid,
            '00000000-0000-4000-8000-000000000201'::uuid,
            '00000000-0000-4000-8000-000000000021'::uuid,
            'Worker incident', current_date)$$,
  '42501',
  'worker A cannot create an incident'
);

select ok(
  exists (
    select 1
      from pg_proc
     where oid = 'public.record_meal_incident(uuid,uuid,public.meal_status,text,date,timestamptz,uuid,text)'::regprocedure
       and prosecdef
       and proconfig @> array['search_path=pg_catalog, public, pg_temp']
  ),
  'record_meal_incident is a secure definer function'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.record_meal_incident(uuid,uuid,public.meal_status,text,date,timestamptz,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.record_meal_incident(uuid,uuid,public.meal_status,text,date,timestamptz,uuid,text)',
    'EXECUTE'
  ),
  'record_meal_incident is executable only by authenticated users'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select lives_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'bien'::public.meal_status,
    'RPC meal note', current_date, now(),
    '00000000-0000-4000-8000-000000000021'::uuid,
    'RPC combined incident'
  )$$,
  'supervisor can record meal and incident atomically'
);
select ok(
  exists (
    select 1 from public.meal_records
     where child_id = '00000000-0000-4000-8000-000000000201'::uuid
       and meal_type_id = '00000000-0000-4000-8000-000000000611'::uuid
       and recorded_date = current_date
       and notes = 'RPC meal note'
  ) and exists (
    select 1 from public.incidents
     where child_id = '00000000-0000-4000-8000-000000000201'::uuid
       and description = 'RPC combined incident'
       and date = current_date
  ),
  'RPC upserts the meal and inserts the incident'
);

select lives_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000202'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'bien'::public.meal_status,
    'local browser date', current_date + 1, now(),
    '00000000-0000-4000-8000-000000000021'::uuid,
    'Local date incident'
  )$$,
  'RPC accepts a browser-local date within one day of server date'
);
select throws_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000203'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'mal'::public.meal_status,
    'future date must fail', current_date + 2, now(),
    '00000000-0000-4000-8000-000000000021'::uuid,
    'Invalid future incident'
  )$$,
  '22023',
  'RPC rejects a date beyond the local date envelope'
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
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'mal'::public.meal_status,
    'worker must fail', current_date, now(),
    '00000000-0000-4000-8000-000000000021'::uuid,
    'Worker RPC incident'
  )$$,
  '42501',
  'worker cannot call record_meal_incident'
);
select throws_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000225'::uuid,
    '00000000-0000-4000-8000-000000000612'::uuid,
    'mal'::public.meal_status,
    'cross tenant must fail', current_date, now(),
    '00000000-0000-4000-8000-000000000021'::uuid,
    'Cross tenant incident'
  )$$,
  '42501',
  'RPC rejects a cross-tenant child'
);
select ok(
  (select count(*) from public.incidents where description = 'Cross tenant incident') = 0
  and (select count(*) from public.meal_records
    where child_id = '00000000-0000-4000-8000-000000000225'::uuid
      and meal_type_id = '00000000-0000-4000-8000-000000000612'::uuid
      and recorded_date = current_date) = 0,
  'failed RPC rolls back both the meal upsert and incident insert'
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
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000614'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000113'::uuid,
       date '2026-08-20',
       timestamp '2026-08-20 10:00:00+00',
       'bien')$$,
  '23505',
  'a child and meal type cannot have two records on one date'
);
select lives_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000615'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000113'::uuid,
       date '2026-08-21',
       timestamp '2026-08-21 10:00:00+00',
       'bien')$$,
  'a child and meal type may have records on different dates'
);
select throws_ok(
  $$update public.meal_records
      set recorded_date = current_date
    where id = '00000000-0000-4000-8000-000000000622'::uuid$$,
  '23514',
  'a meal record date cannot be changed after creation'
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
set local role service_role;
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000616'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       current_date,
       now() + interval '1 hour',
       'bien')$$,
  '23514',
  'meal record timestamp cannot be in the future'
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
select lives_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000617'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       (now() at time zone 'UTC')::date + 1,
       now(),
       'bien')$$,
  'worker A can insert a valid browser-local date ahead of UTC date'
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000618'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       (now() at time zone 'UTC')::date + 2,
       now(),
       'bien')$$,
  '23514',
  'worker A cannot insert a date outside the local date envelope'
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
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000631'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  'admin cannot insert a meal record for another author'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000632'::uuid,
       '00000000-0000-4000-8000-000000000205'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  'supervisor cannot insert a meal record for another author'
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
  $$update public.meal_records
       set recorded_by = '00000000-0000-4000-8000-000000000111'::uuid
     where id = '00000000-0000-4000-8000-000000000625'::uuid$$,
  '42501',
  'admin cannot change the author of a meal record'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$update public.meal_records
       set recorded_by = '00000000-0000-4000-8000-000000000111'::uuid
     where id = '00000000-0000-4000-8000-000000000622'::uuid$$,
  '42501',
  'supervisor cannot change the author of a meal record'
);
select lives_ok(
  $$update public.meal_records
       set status = 'mal', notes = 'supervisor may edit content'
     where id = '00000000-0000-4000-8000-000000000622'::uuid$$,
  'supervisor can edit status and notes without changing authorship'
);
select is(
  (select recorded_by from public.meal_records
    where id = '00000000-0000-4000-8000-000000000622'::uuid),
  '00000000-0000-4000-8000-000000000112'::uuid,
  'supervisor content update preserves the original author'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'service_role'
  )::text,
  true
);
set local role service_role;
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000633'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  'service_role cannot spoof the insert author'
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000634'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000111'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  'service_role cannot insert when sub matches the author'
);
select throws_ok(
  $$update public.meal_records
       set recorded_by = '00000000-0000-4000-8000-000000000111'::uuid
     where id = '00000000-0000-4000-8000-000000000625'::uuid$$,
  '42501',
  'service_role cannot change the existing author'
);
set local role authenticated;

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
select lives_ok(
  $$select pg_temp.execute_test($sql$do $body$
  begin
    update public.meal_records
       set notes = 'supervisor review'
     where id = '00000000-0000-4000-8000-000000000622'::uuid;
    if not found then
      raise exception 'supervisor update did not affect a school A record';
    end if;

    insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000618'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000112'::uuid,
       current_date - 1,
       now(),
       'bien');
  end
  $body$;$sql$)$$,
  'supervisor A can insert and update meal records in school A'
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
do $$
begin
  if not exists (
    select 1
      from public.menus m
      join public.menus_schools ms on ms.menu_id = m.id
     where m.id = '00000000-0000-4000-8000-000000000696'::uuid
       and ms.school_id = '00000000-0000-4000-8000-000000000002'::uuid
  )
  or not exists (
    select 1 from public.menus
     where id = '00000000-0000-4000-8000-000000000697'::uuid
  )
  or exists (
    select 1 from public.menus_schools
     where menu_id = '00000000-0000-4000-8000-000000000696'::uuid
       and school_id <> '00000000-0000-4000-8000-000000000002'::uuid
  )
  or exists (
    select 1 from public.menus_schools
     where menu_id = '00000000-0000-4000-8000-000000000697'::uuid
  ) then
    raise exception 'menu cross-tenant mutation fixtures are not exact';
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
    with changed as (
      update public.menus_schools
         set school_id = '00000000-0000-4000-8000-000000000001'::uuid
       where menu_id = '00000000-0000-4000-8000-000000000696'::uuid
         and school_id = '00000000-0000-4000-8000-000000000002'::uuid
       returning menu_id
    )
    select count(*)::bigint from changed
  $query$),
  0::bigint,
  'admin A cannot move a B-only menu association to school A'
);
select is(
  pg_temp.count_rows($query$
    with changed as (
      delete from public.menus_schools
       where menu_id = '00000000-0000-4000-8000-000000000696'::uuid
         and school_id = '00000000-0000-4000-8000-000000000002'::uuid
       returning menu_id
    )
    select count(*)::bigint from changed
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

set local role postgres;
do $$
begin
  if not exists (
    select 1 from public.users
     where id = '00000000-0000-4000-8000-000000000101'::uuid
       and active
  )
  or not exists (
    select 1 from public.parents_children
     where parent_id = '00000000-0000-4000-8000-000000000101'::uuid
       and child_id = '00000000-0000-4000-8000-000000000201'::uuid
  )
  or not exists (
    select 1 from public.menus_schools
     where menu_id = '00000000-0000-4000-8000-000000000301'::uuid
       and school_id = '00000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'inactive parent menu fixtures are not exact';
  end if;

  update public.users
     set active = false
   where id = '00000000-0000-4000-8000-000000000101'::uuid;
end
$$;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  pg_temp.count_rows($query$
    select 1 from public.menus_schools
     where menu_id = '00000000-0000-4000-8000-000000000301'::uuid
       and school_id = '00000000-0000-4000-8000-000000000001'::uuid
  $query$),
  0::bigint,
  'inactive parent cannot read menu school associations'
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

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000112',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$update public.users
       set role = 'supervisor'
     where id = '00000000-0000-4000-8000-000000000112'::uuid$$,
  '42501',
  'a demoted worker cannot elevate themselves to supervisor'
);
select is(
  (select role::text from public.users
    where id = '00000000-0000-4000-8000-000000000112'::uuid),
  'worker',
  'supervisor demotion remains persisted after rejected self elevation'
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

-- Delivery 1: device setup RPC security contract. The implementation is
-- intentionally absent in this red phase; these assertions define its API.
select ok(
  exists (
    select 1
      from pg_class
       where oid = to_regclass('public.device_setup_codes')
       and relrowsecurity
  ),
  'device setup codes are stored in an RLS-protected table'
);
select ok(
  to_regclass('public.device_setup_attempts') is not null,
  'device setup attempts table exists'
);
select ok(
  exists (
    select 1 from pg_class
     where oid = to_regclass('public.device_setup_codes')
       and relrowsecurity
  ),
  'device setup codes have RLS enabled'
);
select ok(
  exists (
    select 1 from pg_class
     where oid = to_regclass('public.device_setup_attempts')
       and relrowsecurity
  ),
  'device setup attempts have RLS enabled'
);
select has_column('public', 'device_setup_codes', 'code_hash', 'device setup codes store only a hash');
select has_column('public', 'device_setup_codes', 'school_id', 'device setup codes are scoped to a school');
select has_column('public', 'device_setup_codes', 'expires_at', 'device setup codes expire');
select has_column('public', 'device_setup_codes', 'max_uses', 'device setup codes define a usage limit');
select has_column('public', 'device_setup_codes', 'uses', 'device setup codes track usage');
select has_column('public', 'device_setup_codes', 'active', 'device setup codes have an active state');
select has_column('public', 'device_setup_codes', 'claimed_at', 'device setup codes audit first claim time');
select has_column('public', 'device_setup_codes', 'last_seen_at', 'device setup codes audit last use time');
select ok(
  exists (
    select 1
      from pg_proc
     where oid = to_regprocedure('public.claim_device_setup(text,uuid)')
       and prosecdef
       and proconfig @> array['search_path=pg_catalog, public, pg_temp']
  ),
  'claim_device_setup is a SECURITY DEFINER RPC with a fixed search path'
);
select ok(
  exists (
    select 1
      from pg_proc p
     where p.oid = to_regprocedure('public.claim_device_setup(text,uuid)')
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and not has_function_privilege('service_role', p.oid, 'EXECUTE')
       and not has_function_privilege('postgres', p.oid, 'EXECUTE')
       and not exists (
         select 1
           from aclexplode(coalesce(p.proacl, '{}'::aclitem[])) acl
          where acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
       )
  ),
  'claim_device_setup is executable only by anon and authenticated roles'
);
select ok(
  to_regclass('public.device_setup_codes') is not null
  and not has_table_privilege('anon', 'public.device_setup_codes', 'SELECT')
  and not has_table_privilege('anon', 'public.device_setup_codes', 'INSERT')
  and not has_table_privilege('anon', 'public.device_setup_codes', 'UPDATE')
  and not has_table_privilege('anon', 'public.device_setup_codes', 'DELETE')
  and not has_table_privilege('authenticated', 'public.device_setup_codes', 'SELECT')
  and not has_table_privilege('authenticated', 'public.device_setup_codes', 'INSERT')
  and not has_table_privilege('authenticated', 'public.device_setup_codes', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.device_setup_codes', 'DELETE')
  and not has_table_privilege('service_role', 'public.device_setup_codes', 'SELECT')
  and not has_table_privilege('service_role', 'public.device_setup_codes', 'INSERT')
  and not has_table_privilege('service_role', 'public.device_setup_codes', 'UPDATE')
  and not has_table_privilege('service_role', 'public.device_setup_codes', 'DELETE'),
  'anon, authenticated, and service_role cannot access device setup codes directly'
);
select ok(
  to_regclass('public.device_setup_attempts') is not null
  and not has_table_privilege('anon', 'public.device_setup_attempts', 'SELECT')
  and not has_table_privilege('anon', 'public.device_setup_attempts', 'INSERT')
  and not has_table_privilege('anon', 'public.device_setup_attempts', 'UPDATE')
  and not has_table_privilege('anon', 'public.device_setup_attempts', 'DELETE')
  and not has_table_privilege('authenticated', 'public.device_setup_attempts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.device_setup_attempts', 'INSERT')
  and not has_table_privilege('authenticated', 'public.device_setup_attempts', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.device_setup_attempts', 'DELETE')
  and not has_table_privilege('service_role', 'public.device_setup_attempts', 'SELECT')
  and not has_table_privilege('service_role', 'public.device_setup_attempts', 'INSERT')
  and not has_table_privilege('service_role', 'public.device_setup_attempts', 'UPDATE')
  and not has_table_privilege('service_role', 'public.device_setup_attempts', 'DELETE'),
  'anon, authenticated, and service_role cannot access device setup attempts directly'
);

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select * from public.claim_device_setup('invalid-code', '00000000-0000-4000-8000-000000000701'::uuid)$$,
  'P0001',
  'invalid setup codes are rejected without exposing validation details'
);
-- The uuid signature rejects malformed text during argument casting, before
-- the function body runs; this is not an internal UUID validation assertion.
select throws_ok(
  $$select * from public.claim_device_setup('valid-code', 'not-a-uuid')$$,
  '22P02',
  'the uuid signature rejects malformed text before the function body'
);

select throws_ok(
  $$select * from public.claim_device_setup('wrong-code', '00000000-0000-4000-8000-000000000710'::uuid)$$,
  'P0001',
  'rate-limit attempt 1 is rejected generically'
);
select throws_ok(
  $$select * from public.claim_device_setup('wrong-code', '00000000-0000-4000-8000-000000000710'::uuid)$$,
  'P0001',
  'rate-limit attempt 2 is rejected generically'
);
select throws_ok(
  $$select * from public.claim_device_setup('wrong-code', '00000000-0000-4000-8000-000000000710'::uuid)$$,
  'P0001',
  'rate-limit attempt 3 is rejected generically'
);
select throws_ok(
  $$select * from public.claim_device_setup('wrong-code', '00000000-0000-4000-8000-000000000710'::uuid)$$,
  'P0001',
  'rate-limit attempt 4 is rejected generically'
);
select throws_ok(
  $$select * from public.claim_device_setup('wrong-code', '00000000-0000-4000-8000-000000000710'::uuid)$$,
  'P0001',
  'rate-limit attempt 5 is rejected generically'
);
select throws_ok(
  $$select * from public.claim_device_setup('wrong-code', '00000000-0000-4000-8000-000000000710'::uuid)$$,
  'P0001',
  'the sixth setup attempt is rejected by the rate limit'
);
select ok(
  exists (
    select 1
      from public.device_setup_attempts attempt
     where attempt.device_identifier = '00000000-0000-4000-8000-000000000710'::uuid
       and (to_jsonb(attempt) ->> 'attempt_count')::integer >= 5
       and to_jsonb(attempt) ->> 'window_started_at' is not null
  ),
  'rate-limit attempts retain a counter and a bounded window'
);

select set local role postgres;
select lives_ok(
  $$insert into public.device_setup_codes
      (id, school_id, code_hash, expires_at, max_uses, uses, active)
    values
      ('00000000-0000-4000-8000-000000000601'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', timestamp '2099-01-01 00:00:00+00', 1, 0, true),
      ('00000000-0000-4000-8000-000000000708'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', timestamp '2099-01-01 00:00:00+00', 1, 0, true),
      ('00000000-0000-4000-8000-000000000709'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', timestamp '2099-01-01 00:00:00+00', 1, 0, true),
      ('00000000-0000-4000-8000-000000000702'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', timestamp '2020-01-01 00:00:00+00', 2, 0, true),
      ('00000000-0000-4000-8000-000000000703'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', timestamp '2099-01-01 00:00:00+00', 1, 1, true),
      ('00000000-0000-4000-8000-000000000704'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', timestamp '2099-01-01 00:00:00+00', 2, 0, false)$$,
  'test setup codes can be provisioned by a privileged issuer'
);
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$select * from public.claim_device_setup('123456', '00000000-0000-4000-8000-000000000701'::uuid)$$,
  'a valid setup code can be claimed'
);
select is(
  (select uses from public.device_setup_codes where id = '00000000-0000-4000-8000-000000000601'::uuid),
  1,
  'a successful claim consumes exactly one use'
);
select ok(
  (with claimed as materialized (
     select to_jsonb(response) as payload
       from public.claim_device_setup(
          '123456', '00000000-0000-4000-8000-000000000709'::uuid
       ) response
   )
   select exists (
     select 1 from claimed
      where jsonb_path_exists(payload, '$.device_id')
        and jsonb_path_exists(payload, '$.device_identifier')
        and jsonb_path_exists(payload, '$.school_id')
        and jsonb_path_exists(payload, '$.school_name')
        and jsonb_path_exists(payload, '$.workers')
        and payload ->> 'school_id' = '00000000-0000-4000-8000-000000000001'
   )
   and not exists (
     select 1 from claimed
          where payload::text like '%School B%'
             or payload::text like '%Worker B%'
             or payload::text like '%00000000-0000-4000-8000-000000000002%'
   )),
  'a successful response contains school A only and no school B name or workers'
);
select ok(
  exists (
    select 1 from public.devices
     where identifier = '00000000-0000-4000-8000-000000000701'
       and school_id = '00000000-0000-4000-8000-000000000001'::uuid
       and active
       and last_seen_at is not null
  ),
  'a valid claim creates a device in the code school and records last seen'
);
select throws_ok(
  $$select * from public.claim_device_setup('123456', '00000000-0000-4000-8000-000000000702'::uuid)$$,
  'P0001',
  'expired setup codes are rejected'
);
select throws_ok(
  $$select * from public.claim_device_setup('123456', '00000000-0000-4000-8000-000000000703'::uuid)$$,
  'P0001',
  'exhausted setup codes are rejected'
);
select throws_ok(
  $$select * from public.claim_device_setup('123456', '00000000-0000-4000-8000-000000000704'::uuid)$$,
  'P0001',
  'inactive setup codes are rejected'
);
select throws_ok(
  $$select * from public.claim_device_setup('123456', '00000000-0000-4000-8000-000000000701'::uuid)$$,
  'P0001',
  'a single-use setup code cannot be reused'
);
select is(
  (select uses from public.device_setup_codes where id = '00000000-0000-4000-8000-000000000601'::uuid),
  1,
  'a rejected second claim cannot increment a single-use code'
);

select set local role postgres;
select lives_ok(
  $$update public.devices
       set active = false
     where identifier = '00000000-0000-4000-8000-000000000701'$$,
  'test can deactivate the claimed device'
);
set local role anon;
select lives_ok(
  $$select * from public.claim_device_setup('123456', '00000000-0000-4000-8000-000000000701'::uuid)$$,
  'a valid claim can reactivate the same device identifier'
);
select ok(
  (select active from public.devices where identifier = '00000000-0000-4000-8000-000000000701'),
  'successful re-claim reactivates the device'
);

select set local role postgres;
select lives_ok(
   $$insert into public.device_setup_codes
      (id, school_id, code_hash, expires_at, max_uses, uses, active)
    values ('00000000-0000-4000-8000-000000000705'::uuid,
            '00000000-0000-4000-8000-000000000002'::uuid,
            '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', timestamp '2099-01-01 00:00:00+00', 2, 0, true)$$,
  'a second-school setup code is available for isolation checks'
);
set local role anon;
select lives_ok(
  $$select * from public.claim_device_setup('123456', '00000000-0000-4000-8000-000000000705'::uuid)$$,
  'a second-school code can claim its own device'
);
select ok(
  not exists (
    select 1 from public.devices
     where identifier = '00000000-0000-4000-8000-000000000705'
       and school_id <> '00000000-0000-4000-8000-000000000002'::uuid
  ),
  'a device is never assigned outside the code school'
);

select set local role postgres;
select lives_ok(
  $$insert into public.device_setup_codes
      (id, school_id, code_hash, expires_at, max_uses, uses, active)
    values ('00000000-0000-4000-8000-000000000706'::uuid,
            '00000000-0000-4000-8000-000000000001'::uuid,
            '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', timestamp '2099-01-01 00:00:00+00', 1, 0, true)$$,
  'a rollback setup code is available'
);
create or replace function pg_temp.fail_device_setup_insert()
returns trigger
language plpgsql
as $$
begin
  raise exception 'device setup rollback fixture failure';
end;
$$;
create trigger device_setup_rollback_fixture
after insert on public.devices
for each row execute function pg_temp.fail_device_setup_insert();
set local role anon;
select throws_ok(
  $$select * from public.claim_device_setup('123456', '00000000-0000-4000-8000-000000000707'::uuid)$$,
  'P0001',
  'failed device creation rejects the claim atomically'
);
select set local role postgres;
select is(
  (select uses from public.device_setup_codes where id = '00000000-0000-4000-8000-000000000706'::uuid),
  0,
  'failed device creation rolls back code consumption'
);
select is(
  (select count(*) from public.devices where identifier = '00000000-0000-4000-8000-000000000707'),
  0::bigint,
  'failed device creation leaves no partial device'
);
drop trigger device_setup_rollback_fixture on public.devices;

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
