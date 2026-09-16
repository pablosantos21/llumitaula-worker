-- public.users.school_id was removed, but several routines still read it,
-- so every call raised 42703 (undefined column):
--   * record_meal_incident (incident recording broken for everyone)
--   * enforce_same_school_relations branches for users / classes /
--     children / meal_types / parents_children / worker_classrooms
--     (writes broke as soon as related rows existed)
--   * custom_access_token_hook (would break logins if the auth hook is on)
--
-- The tenant model is now relation-based: workers via worker_classrooms,
-- parents via parents_children, monitors via monitors/monitors_schools;
-- admin and supervisor are global (as the SELECT policies already treat
-- them). Rewrite the guards around that model. Single-school invariants
-- (one worker / one parent => one school) are preserved through the
-- relation tables instead of the dropped column.

-- Helper: is this user allowed to operate in this school?
CREATE OR REPLACE FUNCTION private.user_is_valid_in_school(p_user_id uuid, p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select exists (
    select 1
      from public.users u
     where u.id = p_user_id
       and u.active
       and (
         u.role::text in ('admin', 'supervisor')
         or exists (
           select 1
             from public.worker_classrooms wc
             join public.classes c on c.id = wc.class_id
            where wc.worker_id = u.id
              and c.school_id = p_school_id
         )
         or exists (
           select 1
             from public.parents_children pc
             join public.children ch on ch.id = pc.child_id
             left join public.classes c on c.id = ch.class_id
            where pc.parent_id = u.id
              and c.school_id = p_school_id
         )
         or exists (
           select 1
             from public.monitors m
            where m.user_id = u.id
              and m.school_id = p_school_id
         )
         or exists (
           select 1
             from public.monitors_schools ms
             join public.monitors m on m.id = ms.monitor_id
            where m.user_id = u.id
              and ms.school_id = p_school_id
         )
       )
  )
$function$;

GRANT EXECUTE ON FUNCTION private.user_is_valid_in_school(uuid, uuid) TO authenticated;

-- record_meal_incident: admins / supervisors are global; the child, the
-- meal type and the monitor must share one school.
CREATE OR REPLACE FUNCTION public.record_meal_incident(p_child_id uuid, p_meal_type_id uuid, p_status meal_status, p_notes text, p_recorded_date date, p_recorded_at timestamp with time zone, p_monitor_id uuid, p_description text)
RETURNS meal_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  child_school_id uuid;
  meal_type_school_id uuid;
  monitor_school_id uuid;
  saved_meal public.meal_records;
begin
  select u.role::text
    into v_role
    from public.users u
   where u.id = v_user_id
     and u.active;

  if v_user_id is null
     or v_role not in ('admin', 'supervisor') then
    raise exception 'only active administrators and supervisors may record incidents'
      using errcode = '42501';
  end if;

  if p_recorded_date < current_date - 1
     or p_recorded_date > current_date + 1
     or p_recorded_at is null
     or p_recorded_at > now() then
    raise exception 'meal incident date is outside the local date envelope or recorded_at is in the future'
      using errcode = '22023';
  end if;

  select cl.school_id
    into child_school_id
    from public.children ch
    join public.classes cl on cl.id = ch.class_id
   where ch.id = p_child_id;

  select mt.school_id
    into meal_type_school_id
    from public.meal_types mt
   where mt.id = p_meal_type_id;

  select m.school_id
    into monitor_school_id
    from public.monitors m
   where m.id = p_monitor_id;

  if child_school_id is null
     or meal_type_school_id is distinct from child_school_id
     or monitor_school_id is distinct from child_school_id then
    raise exception 'child, meal type and monitor must belong to the same school'
      using errcode = '42501';
  end if;

  insert into public.meal_records (
    child_id, meal_type_id, recorded_by, recorded_date, recorded_at, status, notes
  ) values (
    p_child_id, p_meal_type_id, v_user_id, p_recorded_date,
    p_recorded_at, p_status, p_notes
  )
  on conflict (child_id, meal_type_id, recorded_date) do update
    set recorded_at = excluded.recorded_at,
        status = excluded.status,
        notes = excluded.notes
  returning * into saved_meal;

  insert into public.incidents (child_id, monitor_id, description, date)
  values (p_child_id, p_monitor_id, p_description, p_recorded_date);

  return saved_meal;
end;
$function$;

-- enforce_same_school_relations: same guards, tenant resolved through
-- relations instead of the dropped users.school_id.
CREATE OR REPLACE FUNCTION public.enforce_same_school_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  worker_role public.user_role;
  class_school uuid;
  child_school uuid;
  meal_type_school uuid;
begin
  perform pg_advisory_xact_lock(2147483647, 42042);

  if tg_table_name = 'users' then
    if new.role::text is distinct from 'worker'
       and exists (
         select 1
           from public.worker_classrooms wc
          where wc.worker_id = new.id
       ) then
      raise exception 'worker_classrooms.worker_id must reference a worker'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'classes' then
    if exists (
      select 1
        from public.worker_classrooms wc
       where wc.class_id = new.id
         and exists (
           select 1
             from public.users u
            where u.id = wc.worker_id
              and u.role::text is distinct from 'worker'
         )
    ) or exists (
      select 1
        from public.worker_classrooms wc
       where wc.class_id = new.id
         and exists (
           select 1
             from public.worker_classrooms wc_other
             join public.classes c_other on c_other.id = wc_other.class_id
            where wc_other.worker_id = wc.worker_id
              and wc_other.class_id is distinct from new.id
              and c_other.school_id is distinct from new.school_id
         )
    ) or exists (
      select 1
        from public.children ch
        join public.meal_records mr on mr.child_id = ch.id
        join public.meal_types mt on mt.id = mr.meal_type_id
       where ch.class_id = new.id
         and (mt.school_id is distinct from new.school_id
           or not private.user_is_valid_in_school(mr.recorded_by, new.school_id))
    ) or exists (
      select 1
        from public.children ch
        join public.parents_children pc on pc.child_id = ch.id
       where ch.class_id = new.id
         and exists (
           select 1
             from public.parents_children pc_other
             join public.children ch_other on ch_other.id = pc_other.child_id
             left join public.classes c_other on c_other.id = ch_other.class_id
            where pc_other.parent_id = pc.parent_id
              and pc_other.child_id is distinct from ch.id
              and c_other.school_id is distinct from new.school_id
         )
    ) or exists (
      select 1
        from public.children ch
        join public.incidents i on i.child_id = ch.id
        join public.monitors m on m.id = i.monitor_id
       where ch.class_id = new.id
         and m.school_id is distinct from new.school_id
    ) or exists (
      select 1
        from public.children ch
        join public.child_allergens ca on ca.child_id = ch.id
       where ch.class_id = new.id
         and (
           new.school_id is null
           or exists (
             select 1
               from public.child_allergens ca_other
               join public.children ch_other on ch_other.id = ca_other.child_id
               left join public.classes cl_other on cl_other.id = ch_other.class_id
              where ca_other.allergen_id = ca.allergen_id
                and (cl_other.school_id is null or cl_other.school_id <> new.school_id)
           )
         )
    ) then
      raise exception 'classes.school_id update would invalidate tenant relations'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'children' then
    select c.school_id
      into child_school
      from public.classes c
     where c.id = new.class_id;

    if exists (
      select 1
        from public.meal_records mr
        join public.meal_types mt on mt.id = mr.meal_type_id
        left join public.classes c on c.id = new.class_id
       where mr.child_id = new.id
         and (c.school_id is distinct from mt.school_id
           or not private.user_is_valid_in_school(mr.recorded_by, child_school))
    ) then
      raise exception 'children.class_id update would invalidate meal_records'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from public.parents_children pc
       where pc.child_id = new.id
         and exists (
           select 1
             from public.parents_children pc_other
             join public.children ch_other on ch_other.id = pc_other.child_id
             left join public.classes c_other on c_other.id = ch_other.class_id
            where pc_other.parent_id = pc.parent_id
              and pc_other.child_id is distinct from new.id
              and c_other.school_id is distinct from child_school
         )
    ) then
      raise exception 'children.class_id update would invalidate parents_children'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from public.child_allergens ca
       where ca.child_id = new.id
         and (
           child_school is null
           or exists (
             select 1
               from public.child_allergens ca_other
               join public.children ch_other on ch_other.id = ca_other.child_id
               left join public.classes cl_other on cl_other.id = ch_other.class_id
              where ca_other.allergen_id = ca.allergen_id
                and (cl_other.school_id is null or cl_other.school_id <> child_school)
           )
         )
    ) then
      raise exception 'children.class_id update would invalidate child_allergens'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from public.incidents i
        join public.monitors m on m.id = i.monitor_id
       where i.child_id = new.id
         and m.school_id is distinct from child_school
    ) then
      raise exception 'children.class_id update would invalidate incidents'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'meal_types' then
    if exists (
      select 1
        from public.meal_records mr
        join public.children ch on ch.id = mr.child_id
        join public.classes c on c.id = ch.class_id
       where mr.meal_type_id = new.id
         and (c.school_id is distinct from new.school_id
           or not private.user_is_valid_in_school(mr.recorded_by, new.school_id))
    ) then
      raise exception 'meal_types.school_id update would invalidate meal_records'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'parents_children' then
    select c.school_id
      into child_school
      from public.children ch
      left join public.classes c on c.id = ch.class_id
     where ch.id = new.child_id;

    -- one parent, one school: siblings must share the tenant
    if exists (
      select 1
        from public.parents_children pc_other
        join public.children ch_other on ch_other.id = pc_other.child_id
        left join public.classes c_other on c_other.id = ch_other.class_id
       where pc_other.parent_id = new.parent_id
         and pc_other.child_id is distinct from new.child_id
         and c_other.school_id is distinct from child_school
    ) then
      raise exception 'parents_children cannot relate different schools'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'worker_classrooms' then
    select u.role
      into worker_role
      from public.users u
     where u.id = new.worker_id;

    select c.school_id
      into class_school
      from public.classes c
     where c.id = new.class_id;

    if worker_role::text is distinct from 'worker' then
      raise exception 'worker_classrooms.worker_id must reference a worker'
        using errcode = '23514';
    end if;

    -- one worker, one school: other assignments must share the tenant
    if exists (
      select 1
        from public.worker_classrooms wc_other
        join public.classes c_other on c_other.id = wc_other.class_id
       where wc_other.worker_id = new.worker_id
         and wc_other.class_id is distinct from new.class_id
         and c_other.school_id is distinct from class_school
    ) then
      raise exception 'worker_classrooms cannot relate different schools'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'meal_records' then
    if new.recorded_date < (new.recorded_at at time zone 'UTC')::date - 1
       or new.recorded_date > (new.recorded_at at time zone 'UTC')::date + 1 then
      raise exception 'meal_records.recorded_date is outside the local date envelope'
        using errcode = '23514';
    end if;

    if new.recorded_at > now() then
      raise exception 'meal_records.recorded_at cannot be in the future'
        using errcode = '23514';
    end if;

    if tg_op = 'UPDATE' and old.recorded_date is distinct from new.recorded_date then
      raise exception 'meal_records.recorded_date cannot be changed'
        using errcode = '23514';
    end if;

    select cl.school_id
      into child_school
      from public.children c
      join public.classes cl on cl.id = c.class_id
     where c.id = new.child_id;

    select mt.school_id
      into meal_type_school
      from public.meal_types mt
     where mt.id = new.meal_type_id;

    if child_school is distinct from meal_type_school then
      raise exception 'meal_records cannot relate different schools'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$function$;

-- custom_access_token_hook: users.school_id is gone. Keep the claim shape
-- (role / school_id / active) so existing consumers keep working; the
-- tenant now resolves through the relation tables, not the JWT.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  profile_role public.user_role;
  profile_active boolean;
begin
  select u.role, u.active
    into profile_role, profile_active
    from public.users u
   where u.id = (event->>'user_id')::uuid;

  claims := jsonb_set(claims, '{role}', coalesce(to_jsonb(profile_role), 'null'::jsonb), true);
  claims := jsonb_set(claims, '{school_id}', 'null'::jsonb, true);
  claims := jsonb_set(claims, '{active}', coalesce(to_jsonb(profile_active), 'false'::jsonb), true);
  return jsonb_set(event, '{claims}', claims, true);
end;
$function$;
