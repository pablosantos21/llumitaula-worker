-- Phase 2, Task 2: identity extensions and tenant-safe meal entities.

alter type public.user_role add value if not exists 'worker';
alter type public.user_role add value if not exists 'supervisor';

alter table public.users
  add column school_id uuid,
  add column full_name text,
  add column active boolean not null default true;

-- Existing profiles can only be migrated automatically when their tenant is
-- unambiguous. Refuse to guess when the database cannot provide that guarantee.
do $$
declare
  school_count bigint;
begin
  select count(*) into school_count from public.schools;

  if exists (select 1 from public.users where school_id is null) then
    if school_count <> 1 then
      raise exception
        'cannot migrate users.school_id safely: expected exactly one school, found %',
        school_count;
    end if;

    update public.users
       set school_id = (select id from public.schools limit 1)
     where school_id is null;
  end if;

  if exists (
    select 1
      from public.users u
     where u.school_id is null
        or not exists (
          select 1 from public.schools s where s.id = u.school_id
        )
  ) then
    raise exception 'cannot migrate users.school_id: one or more profiles have no valid school';
  end if;
end
$$;

alter table public.users
  alter column school_id set not null;

alter table public.users
  add constraint users_school_id_fkey
  foreign key (school_id) references public.schools(id);

-- Report orphaned profiles before PostgreSQL attempts to add the Auth FK.
do $$
declare
  orphan_count bigint;
begin
  select count(*)
    into orphan_count
    from public.users u
   where not exists (select 1 from auth.users au where au.id = u.id);

  if orphan_count > 0 then
    raise exception
      'cannot add users_auth_user_fkey: % profile(s) have no matching auth.users row',
      orphan_count;
  end if;
end
$$;

alter table public.users
  add constraint users_auth_user_fkey
  foreign key (id) references auth.users(id) on delete cascade;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null,
  identifier text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table public.worker_classrooms (
  worker_id uuid not null references public.users(id),
  class_id uuid not null references public.classes(id),
  created_at timestamptz not null default now(),
  primary key (worker_id, class_id)
);

create table public.meal_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.meal_records (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id),
  meal_type_id uuid not null references public.meal_types(id),
  recorded_by uuid not null references public.users(id),
  recorded_at timestamptz not null default now(),
  status public.meal_status not null,
  notes text
);

create index devices_school_id_idx on public.devices (school_id);
create index worker_classrooms_class_id_idx on public.worker_classrooms (class_id);
create index worker_classrooms_worker_id_idx on public.worker_classrooms (worker_id);
create index meal_types_school_id_idx on public.meal_types (school_id);
create index meal_records_child_id_idx on public.meal_records (child_id);
create index meal_records_meal_type_id_idx on public.meal_records (meal_type_id);
create index meal_records_recorded_by_idx on public.meal_records (recorded_by);
create index meal_records_recorded_at_idx on public.meal_records (recorded_at);

-- These checks run for direct SQL writes as well as API writes. They deliberately
-- do not rely on RLS, which is added by Task 3.
create or replace function public.enforce_same_school_relations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  worker_school uuid;
  worker_role public.user_role;
  class_school uuid;
  child_school uuid;
  meal_type_school uuid;
  recorder_school uuid;
begin
  if tg_table_name = 'worker_classrooms' then
    select u.school_id, u.role
      into worker_school, worker_role
      from public.users u
     where u.id = new.worker_id;

    select c.school_id
      into class_school
      from public.classes c
     where c.id = new.class_id;

    if worker_role is distinct from 'worker'::public.user_role then
      raise exception 'worker_classrooms.worker_id must reference a worker'
        using errcode = '23514';
    end if;

    if worker_school is distinct from class_school then
      raise exception 'worker_classrooms cannot relate different schools'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'meal_records' then
    select cl.school_id
      into child_school
      from public.children c
      join public.classes cl on cl.id = c.class_id
     where c.id = new.child_id;

    select mt.school_id
      into meal_type_school
      from public.meal_types mt
     where mt.id = new.meal_type_id;

    select u.school_id
      into recorder_school
      from public.users u
     where u.id = new.recorded_by;

    if child_school is distinct from meal_type_school
       or child_school is distinct from recorder_school then
      raise exception 'meal_records cannot relate different schools'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

create trigger worker_classrooms_same_school
before insert or update on public.worker_classrooms
for each row execute function public.enforce_same_school_relations();

create trigger meal_records_same_school
before insert or update on public.meal_records
for each row execute function public.enforce_same_school_relations();
