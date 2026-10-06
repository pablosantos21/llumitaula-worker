begin;

select plan(74);

set local role postgres;

create or replace function pg_temp.count_rows(query text)
returns bigint
language plpgsql
as $$
declare
  result bigint;
begin
  execute query into result;
  return coalesce(result, 0::bigint);
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
  return coalesce(result, 0::bigint);
exception when undefined_table or undefined_column then
  return -1;
when SQLSTATE '42P17' then
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

set local role authenticated;

-- Deterministic fixtures used by the seed.
-- School A: ...0001 (Colegio Demo), School B: ...0002.
-- Monitor A (Ana Serra, monitors.id ...021, auth user ...0121) belongs to
-- school A. Admin A is ...0113, Admin B is ...0115, and a padre from
-- school A is ...0101.

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
    'role', 'authenticated'
  )::text,
  true
);
select ok(
  (select count(*) = 15
   from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in (
       'users', 'schools', 'classes', 'children', 'devices',
       'meal_types', 'meal_records',
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

set local role service_role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'service_role'
  )::text,
  true
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-0000-0000-000000000627'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000113'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  null,
  'service_role cannot write meal records through the API'
);

-- ── Monitor surface: whole-school read access, cross-tenant isolation ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
    'role', 'authenticated'
  )::text,
  true
);
select results_eq(
  $$select id from public.classes order by id$$,
  $$values
    ('00000000-0000-4000-8000-000000000011'::uuid),
    ('00000000-0000-4000-8000-000000000012'::uuid)$$,
  'monitor A sees all classes in school A'
);
select is(
  (select count(*) from public.classes
   where id = '00000000-0000-4000-8000-000000000021'::uuid),
  0::bigint,
  'monitor A cannot see cross-tenant classes'
);
select is(
  (select count(*) from public.children),
  24::bigint,
  'monitor A sees all children in school A'
);
select is(
  pg_temp.count_rows($query$
    select 1 from public.meal_types
     where school_id = '00000000-0000-4000-8000-000000000001'::uuid
  $query$),
  1::bigint,
  'monitor A can read meal types from their school'
);
select throws_ok(
  $$insert into public.meal_types (id, school_id, name)
    values ('00000000-0000-4000-8000-000000000699'::uuid,
            '00000000-0000-4000-8000-000000000001'::uuid,
            'Monitor write must fail')$$,
  '42501',
  null,
  'monitor A meal types access is read-only'
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
  'monitor A cannot see B children, schools, devices, meal types, or meal records'
);

set local role postgres;
select set_config('request.jwt.claims', '{}', true);
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

select lives_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-0000-0000-000000000626'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000113'::uuid,
       current_date - 1, now(), 'bien')$$,
  'postgres seed context may insert without auth.uid'
);

-- ── Incidents: recorded by admins directly or by monitors via the RPC ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select lives_ok(
  $$insert into public.incidents (id, child_id, monitor_id, description, date)
    values ('00000000-0000-4000-8000-000000000503'::uuid,
            '00000000-0000-4000-8000-000000000201'::uuid,
            '00000000-0000-4000-8000-000000000021'::uuid,
            'Admin incident', current_date)$$,
  'admin A can create an incident in school A'
);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$insert into public.incidents (id, child_id, monitor_id, description, date)
    values ('00000000-0000-4000-8000-000000000504'::uuid,
            '00000000-0000-4000-8000-000000000201'::uuid,
            '00000000-0000-4000-8000-000000000021'::uuid,
            'Monitor incident', current_date)$$,
  '42501',
  null,
  'monitor A cannot create incidents directly; only through record_meal_incident'
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

select lives_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'bien'::public.meal_status,
    'RPC meal note', current_date, now(),
    '00000000-0000-4000-8000-000000000021'::uuid,
    'RPC combined incident'
  )$$,
  'monitor can record meal and incident atomically via record_meal_incident'
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
  'monitor RPC accepts a browser-local date within one day of server date'
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
  null,
  'RPC rejects a date beyond the local date envelope'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000101',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'mal'::public.meal_status,
    'padre must fail', current_date, now(),
    '00000000-0000-4000-8000-000000000021'::uuid,
    'Padre RPC incident'
  )$$,
  '42501',
  null,
  'a padre cannot record incidents through the RPC'
);
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'mal'::public.meal_status,
    'anon must fail', current_date, now(),
    '00000000-0000-4000-8000-000000000021'::uuid,
    'Anon RPC incident'
  )$$,
  '42501',
  null,
  'an unauthenticated caller cannot invoke record_meal_incident'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
    'role', 'authenticated'
  )::text,
  true
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
  null,
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

-- ── Meal records: monitor writes, admin writes, authorship and dates ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
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
       '00000000-0000-4000-8000-000000000121'::uuid,
       'bien')$sql$)$$,
  '23514',
  null,
  'monitor A cannot insert a meal record for school B'
);
select lives_ok(
  $$select pg_temp.execute_test($sql$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, status)
    values
      ('00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000121'::uuid,
       'bien')$sql$)$$,
  'monitor A can insert a meal record for a child in their school'
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
  null,
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
  null,
  'a meal record date cannot be changed after creation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
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
       '00000000-0000-4000-8000-000000000121'::uuid,
       now() + interval '1 hour',
       'bien')$$,
  '23514',
  null,
  'monitor A cannot insert a future meal record'
);
set local role service_role;
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000616'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000121'::uuid,
       current_date,
       now() + interval '1 hour',
       'bien')$$,
  '23514',
  null,
  'meal record timestamp cannot be in the future'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
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
       '00000000-0000-4000-8000-000000000121'::uuid,
       (now() at time zone 'UTC')::date + 1,
       now(),
       'bien')$$,
  'monitor A can insert a valid browser-local date ahead of UTC date'
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000618'::uuid,
       '00000000-0000-4000-8000-000000000201'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000121'::uuid,
       (now() at time zone 'UTC')::date + 2,
       now(),
       'bien')$$,
  '23514',
  null,
  'monitor A cannot insert a date outside the local date envelope'
);
select throws_ok(
  $$update public.meal_records
       set recorded_at = now() + interval '1 hour'
     where id = '00000000-0000-4000-8000-000000000611'::uuid$$,
  '23514',
  null,
  'monitor A cannot update a meal record to the future'
);

select set_config('request.jwt.claims', '{}', true);
select is(
  pg_temp.privileged_count_rows($query$
    select count(*)
    from public.meal_records mr
   where (mr.id = '00000000-0000-4000-8000-000000000623'::uuid
          and mr.recorded_by = '00000000-0000-4000-8000-000000000113'::uuid
          and mr.recorded_at < now() - interval '24 hours')
      or (mr.id = '00000000-0000-4000-8000-000000000624'::uuid
          and mr.recorded_by = '00000000-0000-4000-8000-000000000113'::uuid
          and exists (
            select 1
            from public.children c
            join public.classes cl on cl.id = c.class_id
            where c.id = mr.child_id
              and cl.school_id = '00000000-0000-4000-8000-000000000001'::uuid
          ))
  $query$),
  2::bigint,
  'seed meal records exist with expected authorship and age'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$update public.meal_records
       set notes = 'other user update'
     where id = '00000000-0000-4000-8000-000000000624'::uuid$$,
  '42501',
  null,
  'monitor A cannot update a meal record authored by another user'
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
  'monitor A cannot delete a meal record from school B'
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
   with attempted as (
     update public.meal_records
        set notes = 'admin review of old record'
      where id = '00000000-0000-4000-8000-000000000623'::uuid
      returning id
   ) select count(*) from attempted
  $query$),
  1::bigint,
  'admin A can update an old meal record'
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000631'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000121'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  null,
  'admin cannot insert a meal record for another author'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
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
       '00000000-0000-4000-8000-000000000113'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  null,
  'monitor cannot insert a meal record for another author'
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
  $$update public.meal_records
       set recorded_by = '00000000-0000-4000-8000-000000000121'::uuid
     where id = '00000000-0000-4000-8000-000000000625'::uuid$$,
  '42501',
  null,
  'admin cannot change the author of a meal record'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$update public.meal_records
       set recorded_by = '00000000-0000-4000-8000-000000000121'::uuid
     where id = '00000000-0000-4000-8000-000000000622'::uuid$$,
  '42501',
  null,
  'monitor cannot change the author of a meal record'
);
select lives_ok(
  $$update public.meal_records
       set status = 'mal', notes = 'monitor may edit content'
     where id = '00000000-0000-4000-8000-000000000611'::uuid$$,
  'monitor can edit status and notes of their own record'
);
select is(
  (select recorded_by from public.meal_records
    where id = '00000000-0000-4000-8000-000000000611'::uuid),
  '00000000-0000-4000-8000-000000000121'::uuid,
  'monitor content update preserves the original author'
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
       '00000000-0000-4000-8000-000000000113'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  null,
  'service_role cannot spoof the insert author'
);
select throws_ok(
  $$insert into public.meal_records
      (id, child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status)
    values
      ('00000000-0000-4000-8000-000000000634'::uuid,
       '00000000-0000-4000-8000-000000000204'::uuid,
       '00000000-0000-4000-8000-000000000611'::uuid,
       '00000000-0000-4000-8000-000000000121'::uuid,
       current_date - 1, now(), 'bien')$$,
  '42501',
  null,
  'service_role cannot insert a meal record for another author'
);
select throws_ok(
  $$update public.meal_records
       set recorded_by = '00000000-0000-4000-8000-000000000121'::uuid
     where id = '00000000-0000-4000-8000-000000000625'::uuid$$,
  '42501',
  null,
  'service_role cannot change an existing author'
);
set local role authenticated;

-- ── Admin-only management within the tenant ──
set local role authenticated;
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
select throws_ok(
  $$select pg_temp.execute_test($sql$insert into public.devices (id, school_id, name, identifier)
    values
      ('00000000-0000-4000-8000-000000000695'::uuid,
       '00000000-0000-4000-8000-000000000002'::uuid,
       'B device', 'device-b-test')$sql$)$$,
  '42501',
  null,
  'admin A cannot create a device in school B'
);

-- ── Role elevation guards survive the purge ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
    'role', 'authenticated'
  )::text,
  true
);
select throws_ok(
  $$update public.users
       set role = 'admin'
     where id = '00000000-0000-4000-8000-000000000121'::uuid$$,
  '42501',
  null,
  'monitor cannot elevate their own role'
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
  $$update public.users
       set role = 'admin'
     where id = '00000000-0000-4000-8000-000000000121'::uuid$$,
  '42501',
  null,
  'admin cannot elevate a monitor to admin'
);
select throws_ok(
  $$update public.users
       set role = 'padre'
     where id = '00000000-0000-4000-8000-000000000113'::uuid$$,
  '42501',
  null,
  'admin cannot change their own role'
);

-- ── Menus: admin management stays tenant-scoped after the purge ──
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
  '23514',
  null,
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
  null,
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

-- ── Allergens: cross-tenant isolation for admin and monitor ──
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
  '23514',
  null,
  'admin A cannot associate allergen 499 from B with a school A child'
);
select is(
  pg_temp.count_rows($query$
    update public.allergens
       set name = 'shared allergen blocked'
     where id = '00000000-0000-4000-8000-000000000499'::uuid
     returning id
  $query$),
  0::bigint,
  'admin cannot update a B-only allergen from another school'
);
select is(
  pg_temp.count_rows($query$
    delete from public.allergens
     where id = '00000000-0000-4000-8000-000000000499'::uuid
     returning id
  $query$),
  0::bigint,
  'admin cannot delete a B-only allergen from another school'
);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
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
  'monitor A cannot read the B-only shared-test allergen'
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
  '23514',
  null,
  'admin A cannot update an A association to allergen 499 from B'
);

-- ── Profile and fixture integrity ──
select throws_ok(
  $$insert into public.users (id, school_id, full_name, role)
    values
      ('00000000-0000-4000-8000-000000000199'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       'Orphan profile', 'monitor')$$,
  '23503',
  null,
  'a profile without a matching auth user is rejected by the FK'
);

set local role postgres;
update public.users
   set active = true
 where id = '00000000-0000-4000-8000-000000000101'::uuid;

select ok(
  pg_temp.privileged_count_rows($query$
    select count(*)
      from (
        select u.id
          from public.users u
          join (values
            ('00000000-0000-4000-8000-000000000113'::uuid, 'admin'),
            ('00000000-0000-4000-8000-000000000121'::uuid, 'monitor'),
            ('00000000-0000-4000-8000-000000000101'::uuid, 'padre')
          ) expected(id, role) on expected.id = u.id
         where u.role::text = expected.role
           and u.school_id = '00000000-0000-4000-8000-000000000001'::uuid
           and u.active
        union all
        select au.id
          from auth.users au
          where (au.id, au.email) in (
            ('00000000-0000-4000-8000-000000000113'::uuid, 'admin.a@local.test'),
            ('00000000-0000-4000-8000-000000000121'::uuid, 'monitor.101@llumitaula.local'),
            ('00000000-0000-4000-8000-000000000101'::uuid, 'parent.1@local.test')
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
  null,
  'direct child_allergens insert rejects a child without a class'
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
  null,
  'direct child class change rejects an allergy tenant mismatch'
);

set local role postgres;
insert into public.parents_children (parent_id, child_id)
values ('00000000-0000-4000-8000-000000000113'::uuid,
        '00000000-0000-4000-8000-000000000201'::uuid)
on conflict (parent_id, child_id) do nothing;
select lives_ok(
  $$delete from auth.users
     where id = '00000000-0000-4000-8000-000000000113'::uuid$$,
  'deleting Auth user with profile relations does not raise a foreign-key error'
);
select is(
  (select count(*)
     from (
       select 1 from auth.users
        where id = '00000000-0000-4000-8000-000000000113'::uuid
       union all
       select 1 from public.users
        where id = '00000000-0000-4000-8000-000000000113'::uuid
       union all
       select 1 from public.parents_children
        where parent_id = '00000000-0000-4000-8000-000000000113'::uuid
       union all
       select 1 from public.meal_records
        where recorded_by = '00000000-0000-4000-8000-000000000113'::uuid
     ) remaining),
  0::bigint,
  'deleting Auth user cascades profile and dependent relations'
);

select * from finish();
rollback;
