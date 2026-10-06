begin;

select plan(46);

-- Deterministic fixtures used by the phase 2 seed.
-- School A: ...0001 (Colegio Demo), School B: ...0002 (Colegio Arcoiris).
-- All transactions below are rolled back at the end of this file,
-- so fixtures are never persisted.

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
  to_regclass('public.device_setup_global_attempts') is not null,
  'global setup attempts rate-limit table still exists'
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
  (select position('search_path=extensions, public'
                   in array_to_string(p.proconfig, ',')) > 0
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_device'),
  'claim_device pins its search_path to extensions, public'
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

-- ── Functional claim behavior (as anon, over the JSON API surface) ──
-- Deterministic device fixtures:
--   ...604 Colegio Arcoiris (B), code "bbbbbb", pre-bound to "dev-b2"
--   ...605 Colegio Demo (A), code "cccccc", expired
--   ...606 Colegio Demo (A), code "dddddd", inactive
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
   now() + interval '1 year', false, false, now());

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
  (select (public.claim_device('nnnnnn', 'never-claimed'))->>'error'),
  'CODE_NOT_FOUND',
  'an unknown config code is rejected'
);
select is(
  (select (public.claim_device('abcdef', 'demo-device-1'))->>'success'),
  'true',
  'a device may be re-claimed by the same identifier (re-linking allowed)'
);
select is(
  (select pg_temp.privileged_count_rows(
     $$select count(*) from public.device_claims
        where device_identifier = 'demo-device-1'$$)),
  2::bigint,
  're-claiming writes a second audit row'
);

-- ── Revoked / expired / inactive states ──
set local role postgres;
update public.devices set revoked = true where id = '00000000-0000-4000-8000-000000000603'::uuid;
set local role anon;
select is(
  (select (public.claim_device('abcdef', 'demo-device-1'))->>'error'),
  'DEVICE_REVOKED',
  'claiming a revoked device is rejected'
);
select is(
  (select (public.get_device_monitors('demo-device-1'))->>'error'),
  'DEVICE_REVOKED',
  'monitors are not served for a revoked device'
);
set local role postgres;
update public.devices set revoked = false where id = '00000000-0000-4000-8000-000000000603'::uuid;
set local role anon;
select is(
  (select (public.claim_device('abcdef', 'demo-device-1'))->>'success'),
  'true',
  'a device un-revoked by the school may be claimed again'
);
select is(
  (select (public.claim_device('cccccc', 'expired-device'))->>'error'),
  'CODE_EXPIRED',
  'claiming an expired config code is rejected'
);
select is(
  (select (public.claim_device('dddddd', 'inactive-device'))->>'error'),
  'DEVICE_INACTIVE',
  'claiming an inactive device is rejected'
);

-- ── Cross-school isolation ──
select is(
  (select (public.claim_device('bbbbbb', 'dev-b2'))->>'success'),
  'true',
  'a school B device claims with its own code'
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
-- A bound identifier may not be stolen to bind a different device. Device
-- ...607 holds the identifier "taken-ident"; device ...608 is unbound with
-- code "ffffff". Claiming ...608 with "taken-ident" must be a clean rejection.
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
  (select (public.claim_device('ffffff', 'taken-ident'))->>'success'),
  'false',
  'claiming a code with an identifier bound to another device is rejected'
);
select is(
  (select (public.claim_device('ffffff', 'taken-ident'))->>'error'),
  'IDENTIFIER_IN_USE',
  'an identifier collision returns IDENTIFIER_IN_USE'
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
select is(
  (select (public.claim_device('ffffff', 'fresh-ident'))->>'success'),
  'true',
  're-claiming the same device with its own identifier still succeeds'
);

-- ── Rate limits ──
-- Per-identifier: 5 attempts per 15-minute window. Four fresh failures count
-- up; the fifth is rejected before any code lookup.
set local role postgres;
update public.device_setup_attempts
   set window_started_at = now() - interval '16 minutes',
       attempt_count = 0
 where device_identifier = 'rl-ident';
set local role anon;
do $$
begin
  for i in 1..4 loop
    perform public.claim_device('rotated', 'rl-ident');
  end loop;
end
$$;
select is(
  (select (public.claim_device('rotated', 'rl-ident'))->>'error'),
  'RATE_LIMITED',
  'per-device rate limit: the fifth attempt is rejected'
);
select is(
  (select pg_temp.privileged_count_rows(
     $$select attempt_count from public.device_setup_attempts
        where device_identifier = 'rl-ident'$$)),
  5::bigint,
  'the per-device rate-limit counter persists at its maximum'
);

-- Global: 30 attempts per 15-minute window across all identifiers.
set local role postgres;
update public.device_setup_global_attempts
   set window_started_at = now() - interval '16 minutes',
       attempt_count = 0
 where id;
set local role anon;
do $$
declare
  i integer;
begin
  for i in 1..30 loop
    perform public.claim_device('rotated', 'gx' || lpad(i::text, 8, '0'));
  end loop;
end
$$;
select is(
  (select (public.claim_device('rotated', 'gx00000031'))->>'error'),
  'GLOBAL_RATE_LIMITED',
  'the global setup rate limit rejects attempt 31'
);
set local role postgres;
select is(
  (select attempt_count from public.device_setup_global_attempts where id),
  30,
  'the global rate-limit counter persists at its maximum'
);

-- ── Atomicity: a bind failure rolls back the claim entirely ──
set local role postgres;
update public.device_setup_global_attempts
   set window_started_at = now() - interval '16 minutes',
       attempt_count = 0
 where id;
update public.device_setup_attempts
   set window_started_at = now() - interval '16 minutes',
       attempt_count = 0
 where device_identifier = 'atom-roll';
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
  $$select public.claim_device('abcdef', 'atom-roll')$$,
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
    where id = '00000000-0000-4000-8000-000000000603'::uuid),
  'demo-device-1',
  'a failed claim leaves the device binding unchanged'
);

rollback;