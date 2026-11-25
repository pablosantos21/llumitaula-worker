begin;

select plan(25);

set local role postgres;

-- ── 1. No plaintext PIN/code exposure & active monitor filtering ──
update public.users
   set active = false
 where id = '00000000-0000-4000-8000-000000000125'::uuid;

set local role anon;
select ok(
  not exists (
    select 1
      from jsonb_array_elements((public.get_device_monitors('device-a'))->'monitors') m
     where m ? 'code'
  ),
  'get_device_monitors never exposes monitors.code'
);

select ok(
  not exists (
    select 1
      from jsonb_array_elements((public.get_device_monitors('device-a'))->'monitors') m
     where (m->>'id') = '00000000-0000-4000-8000-000000000025'
  ),
  'get_device_monitors excludes inactive monitors'
);

do $$
declare
  i integer;
begin
  for i in 1..60 loop
    perform public.get_device_monitors('rl-monitors-device');
  end loop;
end
$$;
select is(
  (select (public.get_device_monitors('rl-monitors-device'))->>'error'),
  'RATE_LIMITED',
  'get_device_monitors enforces per-device rate limiting'
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
  $$select code from public.monitors$$,
  '42501',
  null,
  'authenticated monitor cannot read monitors.code column'
);

-- ── 2. Strict multi-tenant isolation for admin & anti-impersonation ──
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000113',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  (select count(*) from public.children
    where id = '00000000-0000-4000-8000-000000000225'::uuid),
  0::bigint,
  'admin A cannot read School B children'
);
select throws_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000225'::uuid,
    '00000000-0000-4000-8000-000000000612'::uuid,
    'nada'::public.meal_status,
    'admin cross tenant', current_date, null,
    '00000000-0000-4000-8000-000000000021'::uuid,
    'Cross tenant admin incident'
  )$$,
  '42501',
  null,
  'admin A cannot record_meal_incident for School B'
);
select lives_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'casi_todo'::public.meal_status,
    'admin same tenant', current_date, null,
    '00000000-0000-4000-8000-000000000021'::uuid,
    'Same tenant admin incident'
  )$$,
  'admin A can record_meal_incident in School A with server-side recorded_at'
);
select throws_ok(
  $$select code from public.monitors$$,
  '42501',
  null,
  'authenticated admin cannot read monitors.code column'
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
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'nada'::public.meal_status,
    'impersonation attempt', current_date, null,
    '00000000-0000-4000-8000-000000000022'::uuid,
    'Impersonated monitor incident'
  )$$,
  '42501',
  null,
  'monitor A cannot impersonate monitor B in record_meal_incident'
);
select lives_ok(
  $$select * from public.record_meal_incident(
    '00000000-0000-4000-8000-000000000202'::uuid,
    '00000000-0000-4000-8000-000000000611'::uuid,
    'casi_todo'::public.meal_status,
    'derived monitor id', current_date, null,
    null,
    'Monitor derived incident'
  )$$,
  'monitor A can record_meal_incident with NULL monitor_id derived from auth.uid()'
);
select is(
  (select monitor_id from public.incidents
    where description = 'Monitor derived incident'
    limit 1),
  '00000000-0000-4000-8000-000000000021'::uuid,
  'derived monitor_id matches authenticated monitor profile'
);

-- ── 3. custom_access_token_hook preserves role and sets user_role & school_id ──
set local role postgres;
select ok(
  (select proconfig @> array['search_path=pg_catalog, public, pg_temp']
     from pg_proc
    where oid = 'public.custom_access_token_hook(jsonb)'::regprocedure),
  'custom_access_token_hook pins safe search_path'
);
select ok(
  has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'),
  'custom_access_token_hook is executable by supabase_auth_admin only'
);
select ok(
  (select (res->'claims'->>'role') = 'authenticated'
      and (res->'claims'->>'user_role') = 'monitor'
      and (res->'claims'->>'school_id') = '00000000-0000-4000-8000-000000000001'
      and (res->'claims'->>'active') = 'true'
     from (
       select public.custom_access_token_hook(
         jsonb_build_object(
           'user_id', '00000000-0000-4000-8000-000000000121',
           'claims', jsonb_build_object('role', 'authenticated')
         )
       ) as res
     ) t),
  'custom_access_token_hook writes {user_role} and {school_id} without overwriting {role}'
);

-- ── 4. create_monitor: NULL bypass fixed, tenant isolation, school_id NOT NULL, 6-digit PIN ──
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select public.create_monitor('No', 'Jwt', '012345', '00000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501',
  null,
  'create_monitor rejects service_role call without admin JWT (no NULL bypass)'
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
  $$select public.create_monitor('Cross', 'Tenant', '012345', '00000000-0000-4000-8000-000000000002'::uuid)$$,
  '42501',
  null,
  'admin A cannot create a monitor in School B'
);
select throws_ok(
  $$select public.create_monitor('Bad', 'Pin', '123', '00000000-0000-4000-8000-000000000001'::uuid)$$,
  '22023',
  null,
  'create_monitor rejects PINs that are not 6 numeric digits'
);
select is(
  (select (public.create_monitor('Lucia', 'Nadal', '012345', '00000000-0000-4000-8000-000000000001'::uuid))->>'ok'),
  'true',
  'admin A can create a monitor with a leading-zero 6-digit PIN'
);
set local role postgres;
select ok(
  exists (
    select 1
      from public.monitors m
      join public.users u on u.id = m.user_id
      join auth.users au on au.id = m.user_id
     where m.first_name = 'Lucia'
       and m.last_name = 'Nadal'
       and m.code is null
       and u.school_id = '00000000-0000-4000-8000-000000000001'::uuid
       and extensions.crypt('012345', au.encrypted_password) = au.encrypted_password
  ),
  'created monitor stores school_id, keeps monitors.code NULL, and hashes leading-zero PIN'
);

-- ── 5. Server-side monitor PIN attempt tracking and lockout ──
set local role anon;
select is(
  (select (public.verify_monitor_pin('device-a', '00000000-0000-4000-8000-000000000021'::uuid, '000101'))->>'allowed'),
  'true',
  'verify_monitor_pin accepts valid seeded 6-digit PIN'
);
do $$
begin
  for i in 1..4 loop
    perform public.verify_monitor_pin('device-a', '00000000-0000-4000-8000-000000000021'::uuid, '999999');
  end loop;
end
$$;
select is(
  (select (public.verify_monitor_pin('device-a', '00000000-0000-4000-8000-000000000021'::uuid, '999999'))->>'locked'),
  'true',
  'verify_monitor_pin locks after 5 failed attempts'
);
select is(
  (select (public.verify_monitor_pin('device-a', '00000000-0000-4000-8000-000000000021'::uuid, '000101'))->>'allowed'),
  'false',
  'verify_monitor_pin rejects even the valid PIN while locked'
);
set local role postgres;
update public.monitor_pin_attempts
   set locked_until = now() - interval '1 second'
 where device_identifier = 'device-a'
   and monitor_id = '00000000-0000-4000-8000-000000000021'::uuid;
set local role anon;
select ok(
  (select (res->>'locked') = 'false' and (res->>'remaining_attempts')::int = 4
     from (
       select public.verify_monitor_pin('device-a', '00000000-0000-4000-8000-000000000021'::uuid, '999999') as res
     ) t),
  'expired PIN lockout resets attempt counter instead of re-locking immediately'
);

-- ── 6. Collaborative same-day monitor updates on meal_records ──
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000121',
    'role', 'authenticated'
  )::text,
  true
);
insert into public.meal_records (id, child_id, meal_type_id, recorded_by, recorded_date, status, first_course, second_course, dessert, notes)
values (
  '00000000-0000-4000-8000-000000000699'::uuid,
  '00000000-0000-4000-8000-000000000205'::uuid,
  '00000000-0000-4000-8000-000000000611'::uuid,
  '00000000-0000-4000-8000-000000000121'::uuid,
  current_date,
  'todo',
  'todo',
  'todo',
  'todo',
  'initial by monitor 101'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-000000000122',
    'role', 'authenticated'
  )::text,
  true
);
select lives_ok(
  $$update public.meal_records
       set status = 'casi_todo', notes = 'updated by monitor 102'
     where id = '00000000-0000-4000-8000-000000000699'::uuid$$,
  'same-school second monitor can update a same-day meal record'
);
select is(
  (select recorded_by from public.meal_records
    where id = '00000000-0000-4000-8000-000000000699'::uuid),
  '00000000-0000-4000-8000-000000000121'::uuid,
  'same-day collaborative update preserves original recorded_by author'
);

select * from finish();
rollback;
