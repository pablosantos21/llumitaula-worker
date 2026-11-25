begin;

select plan(46);

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

set local role postgres;

-- ── Schema & security surface ──
select ok(
  to_regclass('public.device_claims') is not null,
  'device claims audit table exists'
);
select ok(
  exists (
    select 1
      from pg_class
     where oid = to_regclass('public.device_claims')
       and relrowsecurity
  ),
  'device claims audit table has RLS enabled'
);
select has_column('public', 'device_claims', 'device_id', 'device claims reference the claimed device');
select has_column('public', 'device_claims', 'device_identifier', 'device claims record the bound identifier');
select has_column('public', 'device_claims', 'claimed_at', 'device claims audit the claim time');
select has_column('public', 'devices', 'config_code_hash', 'devices store only a config code hash');
select has_column('public', 'devices', 'config_code_expires_at', 'devices config codes expire');
select has_column('public', 'devices', 'revoked', 'devices can be revoked');
select is(
  (select is_nullable = 'YES'
     from information_schema.columns
    where table_schema = 'public' and table_name = 'devices'
      and column_name = 'identifier'),
  true,
  'devices identifier is nullable before claim'
);
select ok(
  to_regclass('public.device_setup_codes') is null,
  'the per-school device_setup_codes table is removed'
);
select ok(
  to_regclass('public.device_setup_attempts') is not null,
  'device setup attempts rate-limit table still exists'
);
select is(
  (select data_type = 'text'
     from information_schema.columns
    where table_schema = 'public' and table_name = 'device_setup_attempts'
      and column_name = 'device_identifier'),
  true,
  'device setup attempts key off a text device identifier'
);
select ok(
  to_regclass('public.device_setup_code_attempts') is not null,
  'per-code-hash rate-limit table exists'
);
select ok(
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'claim_device'
       and p.prosecdef
  ),
  'claim_device is defined SECURITY DEFINER'
);
select ok(
  (select position('search_path=pg_catalog, public, extensions, pg_temp'
                   in array_to_string(p.proconfig, ',')) > 0
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_device'),
  'claim_device pins its search_path to pg_catalog, public, extensions, pg_temp'
);
select ok(
  (select position('search_path=pg_catalog, public, extensions, pg_temp'
                   in array_to_string(p.proconfig, ',')) > 0
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_device_monitors'),
  'get_device_monitors pins its search_path to pg_catalog, public, extensions, pg_temp'
);
select ok(
  has_function_privilege('anon', 'public.claim_device(text, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.claim_device(text, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.claim_device(text, text)', 'EXECUTE'),
  'claim_device is callable by anon and authenticated only'
);
select ok(
  has_function_privilege('anon', 'public.get_device_monitors(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_device_monitors(text)', 'EXECUTE'),
  'get_device_monitors is callable by anon and authenticated'
);
set local role anon;
select is(
  (select pg_temp.count_rows(
     'select count(*) from public.device_claims')),
  0::bigint,
  'anon cannot see device claims rows through RLS'
);
select throws_ok(
  $$insert into public.device_claims (device_id, device_identifier, claimed_at)
    values ('00000000-0000-4000-8000-000000000603'::uuid, 'direct-insert', now())$$,
  '42501',
  null,
  'anon cannot write device claims directly'
);
set local role postgres;

insert into public.devices (
  id, school_id, name, identifier, config_code_hash,
  config_code_expires_at, revoked, active, created_at
) values
  ('00000000-0000-4000-8000-000000000604'::uuid,
   '00000000-0000-4000-8000-000000000002'::uuid,
   'Pantalla pasillo norte', 'dev-b2',
   encode(digest('bbbbbb', 'sha256'), 'hex'),
   now() + interval '1 year', false, true, now()),
  ('00000000-0000-4000-8000-000000000605'::uuid,
   '00000000-0000-4000-8000-000000000001'::uuid,
   'Pantalla con codigo caducado', null,
   encode(digest('cccccc', 'sha256'), 'hex'),
   '2020-01-01'::timestamptz, false, true, now()),
  ('00000000-0000-4000-8000-000000000606'::uuid,
   '00000000-0000-4000-8000-000000000001'::uuid,
   'Pantalla inactiva', null,
   encode(digest('dddddd', 'sha256'), 'hex'),
   now() + interval '1 year', false, false, now()),
  ('00000000-0000-4000-8000-000000000609'::uuid,
   '00000000-0000-4000-8000-000000000001'::uuid,
   'Pantalla sin caducidad', null,
   encode(digest('eeeeee', 'sha256'), 'hex'),
   null, false, true, now()),
  ('00000000-0000-4000-8000-000000000610'::uuid,
   '00000000-0000-4000-8000-000000000001'::uuid,
   'Pantalla revocada', null,
   encode(digest('gggggg', 'sha256'), 'hex'),
   now() + interval '1 year', true, true, now());

set local role anon;
select is(
  (select (public.claim_device('abcdef', 'demo-device-1'))->>'success'),
  'true',
  'claiming the seeded config code binds the device'
);
select is(
  (select (public.get_device_monitors('demo-device-1'))->>'success'),
  'true',
  'get_device_monitors resolves a claimed device'
);
select is(
  (select (public.claim_device('abcdef', 'hijacker-device'))->>'error'),
  'CLAIM_FAILED',
  'consumed config code cannot be reused to hijack the bound device'
);
select is(
  (select (public.claim_device('abcdef', 'demo-device-1'))->>'error'),
  'CLAIM_FAILED',
  'consumed config code is invalidated after first use'
);
select is(
  (select pg_temp.privileged_count_rows(
     $$select count(*) from public.device_claims
        where device_identifier = 'demo-device-1'$$)),
  1::bigint,
  'single-use claim writes exactly one audit row'
);

-- ── Non-enumerable uniform errors across all invalid states ──
select is(
  (select (public.claim_device('nnnnnn', 'never-claimed'))->>'error'),
  'CLAIM_FAILED',
  'an unknown config code returns uniform CLAIM_FAILED'
);
select is(
  (select (public.claim_device('gggggg', 'revoked-attempt'))->>'error'),
  'CLAIM_FAILED',
  'claiming a revoked device returns uniform CLAIM_FAILED'
);
select is(
  (select (public.claim_device('cccccc', 'expired-device'))->>'error'),
  'CLAIM_FAILED',
  'claiming an expired config code returns uniform CLAIM_FAILED'
);
select is(
  (select (public.claim_device('dddddd', 'inactive-device'))->>'error'),
  'CLAIM_FAILED',
  'claiming an inactive device returns uniform CLAIM_FAILED'
);
select is(
  (select (public.claim_device('eeeeee', 'no-expiry-device'))->>'error'),
  'CLAIM_FAILED',
  'claiming a config code without expiration returns uniform CLAIM_FAILED'
);
select is(
  (select (public.claim_device('bbbbbb', 'hijack-dev-b2'))->>'error'),
  'CLAIM_FAILED',
  'claiming a device already bound to another identifier is rejected'
);

-- ── Revoked state reflected by get_device_monitors ──
set local role postgres;
update public.devices set revoked = true where id = '00000000-0000-4000-8000-000000000603'::uuid;
set local role anon;
select is(
  (select (public.get_device_monitors('demo-device-1'))->>'error'),
  'DEVICE_REVOKED',
  'monitors are not served for a revoked device'
);
set local role postgres;
update public.devices set revoked = false where id = '00000000-0000-4000-8000-000000000603'::uuid;
set local role anon;

-- ── Cross-school isolation ──
select is(
  (select (public.claim_device('bbbbbb', 'dev-b2'))->>'success'),
  'true',
  'a school B device claims with its own code and matching identifier'
);
select ok(
  (select (public.get_device_monitors('dev-b2'))->>'school_id')
    = '00000000-0000-4000-8000-000000000002'
  and (select count(*) = 0
         from jsonb_array_elements(
                (public.get_device_monitors('dev-b2'))->'monitors') m
        where (m->>'school_id') <> '00000000-0000-4000-8000-000000000002'),
  'a device only resolves monitors for its own school'
);
select is(
  (select (public.get_device_monitors('ghost-device'))->>'error'),
  'DEVICE_NOT_FOUND',
  'monitors are not served for an unclaimed device'
);

-- ── Identifier collision ──
set local role postgres;
insert into public.devices (
  id, school_id, name, identifier, config_code_hash,
  config_code_expires_at, revoked, active, created_at
) values
  ('00000000-0000-4000-8000-000000000607'::uuid,
   '00000000-0000-4000-8000-000000000001'::uuid,
   'Pantalla ya vinculada', 'taken-ident', null,
   null, false, true, now()),
  ('00000000-0000-4000-8000-000000000608'::uuid,
   '00000000-0000-4000-8000-000000000001'::uuid,
   'Pantalla libre', null,
   encode(digest('ffffff', 'sha256'), 'hex'),
   now() + interval '1 year', false, true, now());
set local role anon;
select is(
  (select (public.claim_device('ffffff', 'taken-ident'))->>'error'),
  'CLAIM_FAILED',
  'claiming a code with an identifier bound to another device returns uniform CLAIM_FAILED'
);
select lives_ok(
  $$select public.claim_device('ffffff', 'taken-ident')$$,
  'an identifier collision does not raise'
);
set local role postgres;
select is(
  (select identifier from public.devices
    where id = '00000000-0000-4000-8000-000000000607'::uuid),
  'taken-ident',
  'a rejected collision leaves the existing binding unchanged'
);
select is(
  (select pg_temp.privileged_count_rows(
     $$select count(*) from public.device_claims
        where device_id = '00000000-0000-4000-8000-000000000608'::uuid$$)),
  0::bigint,
  'a rejected collision writes no audit row'
);
set local role anon;
select is(
  (select (public.claim_device('ffffff', 'fresh-ident'))->>'success'),
  'true',
  'the colliding code still claims with a free identifier'
);

-- ── Rate limits (per-identifier + per-code-hash, no global DoS) ──
set local role postgres;
update public.device_setup_attempts
   set window_started_at = now() - interval '16 minutes',
       attempt_count = 0
 where device_identifier = 'rl-ident';
set local role anon;
do $$
begin
  for i in 1..4 loop
    perform public.claim_device('rotat1', 'rl-ident');
  end loop;
end
$$;
select is(
  (select (public.claim_device('rotat1', 'rl-ident'))->>'error'),
  'RATE_LIMITED',
  'per-device rate limit: the fifth attempt is rejected'
);

set local role postgres;
insert into public.devices (
  id, school_id, name, identifier, config_code_hash,
  config_code_expires_at, revoked, active, created_at
) values
  ('00000000-0000-4000-8000-000000000611'::uuid,
   '00000000-0000-4000-8000-000000000001'::uuid,
   'Pantalla legitima post-flood', null,
   encode(digest('legit1', 'sha256'), 'hex'),
   now() + interval '1 year', false, true, now());
set local role anon;
do $$
declare
  i integer;
begin
  for i in 1..35 loop
    perform public.claim_device('fld' || lpad(i::text, 3, '0'), 'gx' || lpad(i::text, 8, '0'));
  end loop;
end
$$;
select is(
  (select (public.claim_device('legit1', 'legit-ipad-after-flood'))->>'success'),
  'true',
  'attacker identifier flood does not cause global DoS for legitimate devices'
);

do $$
declare
  i integer;
begin
  for i in 1..10 loop
    perform public.claim_device('brute1', 'br' || lpad(i::text, 8, '0'));
  end loop;
end
$$;
select is(
  (select (public.claim_device('brute1', 'br00000011'))->>'error'),
  'RATE_LIMITED',
  'per-code-hash rate limit blocks brute-force across rotated identifiers'
);

-- ── Atomicity: a bind failure rolls back the claim entirely ──
set local role postgres;
insert into public.devices (
  id, school_id, name, identifier, config_code_hash,
  config_code_expires_at, revoked, active, created_at
) values
  ('00000000-0000-4000-8000-000000000612'::uuid,
   '00000000-0000-4000-8000-000000000001'::uuid,
   'Pantalla atomicidad', null,
   encode(digest('atom01', 'sha256'), 'hex'),
   now() + interval '1 year', false, true, now());
create function pg_temp.forbid_device_update()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'boom' using errcode = 'P0001';
end;
$fn$;
create trigger forbid_device_update
after update on public.devices
for each row execute function pg_temp.forbid_device_update();

set local role anon;
select throws_ok(
  $$select public.claim_device('atom01', 'atom-roll')$$,
  'P0001',
  null,
  'a failing device update aborts the claim'
);
set local role postgres;
drop trigger forbid_device_update on public.devices;
drop function pg_temp.forbid_device_update();
select is(
  (select pg_temp.privileged_count_rows(
     $$select count(*) from public.device_claims
        where device_identifier = 'atom-roll'$$)),
  0::bigint,
  'a failed claim leaves no audit row behind'
);
select is(
  (select identifier from public.devices
    where id = '00000000-0000-4000-8000-000000000612'::uuid),
  null,
  'a failed claim leaves the device binding unchanged'
);

select * from finish();
rollback;
