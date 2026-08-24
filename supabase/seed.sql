-- Deterministic local development data. All credentials in this file are for
-- local tests only; no production or service_role secret belongs here.

-- The same bcrypt password is used for every local account: password
-- (development only). Auth rows must exist before public.users because the
-- phase 2 migration adds a foreign key from public.users.id to auth.users.id.

-- Validate every reserved UUID and natural key before any fixture is written.
-- Existing rows with the exact fixture values are safe to keep on reruns;
-- anything else aborts instead of being hidden by ON CONFLICT DO NOTHING.
do $$
begin
  if exists (
    select 1 from auth.users au
    join (values
      ('00000000-0000-4000-8000-000000000101'::uuid, 'parent.1@local.test', 'Parent One'),
      ('00000000-0000-4000-8000-000000000102'::uuid, 'parent.2@local.test', 'Parent Two'),
      ('00000000-0000-4000-8000-000000000103'::uuid, 'parent.3@local.test', 'Parent Three'),
      ('00000000-0000-4000-8000-000000000104'::uuid, 'parent.4@local.test', 'Parent Four'),
      ('00000000-0000-4000-8000-000000000111'::uuid, 'worker.a@local.test', 'Worker A'),
      ('00000000-0000-4000-8000-000000000112'::uuid, 'supervisor.a@local.test', 'Supervisor A'),
      ('00000000-0000-4000-8000-000000000113'::uuid, 'admin.a@local.test', 'Admin A'),
      ('00000000-0000-4000-8000-000000000114'::uuid, 'worker.b@local.test', 'Worker B'),
      ('00000000-0000-4000-8000-000000000115'::uuid, 'admin.b@local.test', 'Admin B'),
      ('00000000-0000-4000-8000-000000000116'::uuid, 'worker.a2@local.test', 'Worker A Two')
    ) expected(id, email, full_name) on expected.id = au.id
    where (au.instance_id, au.email, au.role, au.aud, au.aal, au.email_confirmed_at,
           au.raw_app_meta_data, au.raw_user_meta_data, au.created_at,
           au.updated_at, au.confirmed_at) is distinct from
          ('00000000-0000-0000-0000-000000000000'::uuid, expected.email,
           'authenticated', 'authenticated', 'aal1',
           timestamp '2026-01-01 00:00:00+00',
           jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
           jsonb_build_object('full_name', expected.full_name),
           timestamp '2026-01-01 00:00:00+00',
           timestamp '2026-01-01 00:00:00+00',
           timestamp '2026-01-01 00:00:00+00')
       or au.encrypted_password is null
       or crypt('password', au.encrypted_password) is distinct from au.encrypted_password
  ) then
    raise exception 'seed collision in auth.users';
  end if;

  if exists (
    select 1 from auth.users au
    join (values
      ('parent.1@local.test', '00000000-0000-4000-8000-000000000101'::uuid),
      ('parent.2@local.test', '00000000-0000-4000-8000-000000000102'::uuid),
      ('parent.3@local.test', '00000000-0000-4000-8000-000000000103'::uuid),
      ('parent.4@local.test', '00000000-0000-4000-8000-000000000104'::uuid),
      ('worker.a@local.test', '00000000-0000-4000-8000-000000000111'::uuid),
      ('supervisor.a@local.test', '00000000-0000-4000-8000-000000000112'::uuid),
      ('admin.a@local.test', '00000000-0000-4000-8000-000000000113'::uuid),
      ('worker.b@local.test', '00000000-0000-4000-8000-000000000114'::uuid),
      ('admin.b@local.test', '00000000-0000-4000-8000-000000000115'::uuid),
      ('worker.a2@local.test', '00000000-0000-4000-8000-000000000116'::uuid)
    ) expected(email, id) on expected.email = au.email
    where au.id is distinct from expected.id
  ) then
    raise exception 'seed natural key collision in auth.users';
  end if;

  if exists (
    select 1 from public.schools s
    join (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'Colegio Demo'),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'School B')
    ) expected(id, name) on expected.id = s.id
    where s.name is distinct from expected.name
  ) or exists (
    select 1 from public.schools s
    join (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'Colegio Demo'),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'School B')
    ) expected(id, name) on expected.name = s.name
    where s.id is distinct from expected.id
  ) then
    raise exception 'seed collision in public.schools';
  end if;

  if exists (
    select 1 from public.users u
    join (values
      ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Parent One', 'padre'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Parent Two', 'padre'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Parent Three', 'padre'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Parent Four', 'padre'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000111'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Worker A', 'worker'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000112'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Supervisor A', 'supervisor'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000113'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Admin A', 'admin'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000114'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, 'Worker B', 'worker'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000115'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, 'Admin B', 'admin'::public.user_role, true, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000116'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Worker A Two', 'worker'::public.user_role, true, timestamp '2026-01-01 00:00:00+00')
    ) expected(id, school_id, full_name, role, active, created_at) on expected.id = u.id
    where (u.school_id, u.full_name, u.role, u.active, u.created_at) is distinct from
          (expected.school_id, expected.full_name, expected.role, expected.active, expected.created_at)
  ) then
    raise exception 'seed collision in public.users';
  end if;

  if exists (
    select 1 from public.classes c
    join (values
      ('00000000-0000-4000-8000-000000000011'::uuid, 'Clase Sol', '00000000-0000-4000-8000-000000000001'::uuid),
      ('00000000-0000-4000-8000-000000000012'::uuid, 'Clase Luna', '00000000-0000-4000-8000-000000000001'::uuid),
      ('00000000-0000-4000-8000-000000000021'::uuid, 'Clase B', '00000000-0000-4000-8000-000000000002'::uuid)
    ) expected(id, name, school_id) on expected.id = c.id
    where (c.name, c.school_id) is distinct from (expected.name, expected.school_id)
  ) or exists (
    select 1 from public.classes c
    join (values
      ('Clase Sol', '00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000011'::uuid),
      ('Clase Luna', '00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000012'::uuid),
      ('Clase B', '00000000-0000-4000-8000-000000000002'::uuid, '00000000-0000-4000-8000-000000000021'::uuid)
    ) expected(name, school_id, id) on expected.name = c.name and expected.school_id = c.school_id
    where c.id is distinct from expected.id
  ) then
    raise exception 'seed collision in public.classes';
  end if;

  if exists (
    select 1 from public.monitors m
    join (values
      ('00000000-0000-4000-8000-000000000021'::uuid, 'Ana', 'Serra', 101::smallint, '00000000-0000-4000-8000-000000000001'::uuid, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000022'::uuid, 'Bruno', 'Vidal', 102::smallint, '00000000-0000-4000-8000-000000000001'::uuid, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000023'::uuid, 'Carla', 'Moya', 103::smallint, '00000000-0000-4000-8000-000000000001'::uuid, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000024'::uuid, 'Diego', 'Roca', 104::smallint, '00000000-0000-4000-8000-000000000001'::uuid, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000025'::uuid, 'Elena', 'Costa', 105::smallint, '00000000-0000-4000-8000-000000000001'::uuid, timestamp '2026-01-01 00:00:00+00')
    ) expected(id, first_name, last_name, code, school_id, created_at) on expected.id = m.id
    where (m.first_name, m.last_name, m.code, m.school_id, m.created_at) is distinct from
          (expected.first_name, expected.last_name, expected.code, expected.school_id, expected.created_at)
  ) or exists (
    select 1 from public.monitors m
    join (values
      (101::smallint, '00000000-0000-4000-8000-000000000021'::uuid),
      (102::smallint, '00000000-0000-4000-8000-000000000022'::uuid),
      (103::smallint, '00000000-0000-4000-8000-000000000023'::uuid),
      (104::smallint, '00000000-0000-4000-8000-000000000024'::uuid),
      (105::smallint, '00000000-0000-4000-8000-000000000025'::uuid)
    ) expected(code, id) on expected.code = m.code
    where m.id is distinct from expected.id
  ) then
    raise exception 'seed collision in public.monitors';
  end if;

  if exists (
    select 1 from public.monitors_schools ms
    join (values
      ('00000000-0000-4000-8000-000000000021'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
      ('00000000-0000-4000-8000-000000000022'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
      ('00000000-0000-4000-8000-000000000023'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
      ('00000000-0000-4000-8000-000000000024'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
      ('00000000-0000-4000-8000-000000000025'::uuid, '00000000-0000-4000-8000-000000000001'::uuid)
    ) expected(monitor_id, school_id) on expected.monitor_id = ms.monitor_id
    where ms.school_id is distinct from expected.school_id
  ) then
    raise exception 'seed collision in public.monitors_schools';
  end if;

  if exists (
    select 1 from public.children c
    join (values
      ('00000000-0000-4000-8000-000000000201'::uuid, 'Alba', 'Martin', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000202'::uuid, 'Adrian', 'Perez', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000203'::uuid, 'Berta', 'Lopez', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000204'::uuid, 'Bruno', 'Gomez', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000205'::uuid, 'Celia', 'Navarro', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000206'::uuid, 'Dario', 'Soler', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000207'::uuid, 'Elsa', 'Ribas', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000208'::uuid, 'Eric', 'Ferrer', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000209'::uuid, 'Fatima', 'Pastor', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000210'::uuid, 'Gael', 'Cano', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000211'::uuid, 'Ines', 'Mora', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000212'::uuid, 'Joel', 'Rey', '00000000-0000-4000-8000-000000000011'::uuid),
      ('00000000-0000-4000-8000-000000000213'::uuid, 'Aina', 'Martin', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000214'::uuid, 'Alex', 'Perez', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000215'::uuid, 'Clara', 'Lopez', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000216'::uuid, 'Diana', 'Gomez', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000217'::uuid, 'Emma', 'Navarro', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000218'::uuid, 'Ferran', 'Soler', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000219'::uuid, 'Gala', 'Ribas', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000220'::uuid, 'Hugo', 'Ferrer', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000221'::uuid, 'Iris', 'Pastor', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000222'::uuid, 'Jan', 'Cano', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000223'::uuid, 'Laia', 'Mora', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000224'::uuid, 'Marc', 'Rey', '00000000-0000-4000-8000-000000000012'::uuid),
      ('00000000-0000-4000-8000-000000000225'::uuid, 'Berta B', 'School B', '00000000-0000-4000-8000-000000000021'::uuid),
      ('00000000-0000-4000-8000-000000000226'::uuid, 'Null', 'Class', null::uuid)
    ) expected(id, first_name, last_name, class_id) on expected.id = c.id
    where (c.first_name, c.last_name, c.class_id) is distinct from
          (expected.first_name, expected.last_name, expected.class_id)
  ) then
    raise exception 'seed collision in public.children';
  end if;

  if exists (
    select 1 from public.children
    where id between '00000000-0000-4000-8000-000000000201' and '00000000-0000-4000-8000-000000000226'
      and created_at is distinct from timestamp '2026-01-01 00:00:00+00'
  ) then
    raise exception 'seed timestamp collision in public.children';
  end if;

  if exists (
    select 1 from public.parents_children pc
    where pc.parent_id in (
      '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000104'
    )
    and not exists (
      select 1 from (values
      ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000201'::uuid),
      ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000202'::uuid),
      ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000203'::uuid),
      ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000204'::uuid),
      ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000205'::uuid),
      ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000206'::uuid),
      ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000207'::uuid),
      ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000208'::uuid),
      ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000209'::uuid),
      ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000210'::uuid),
      ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000211'::uuid),
      ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000212'::uuid),
      ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000213'::uuid),
      ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000214'::uuid),
      ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000215'::uuid),
      ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000216'::uuid),
      ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000217'::uuid),
      ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000218'::uuid),
      ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000219'::uuid),
      ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000220'::uuid),
      ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000221'::uuid),
      ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000222'::uuid),
      ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000223'::uuid),
      ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000224'::uuid)
      ) expected(parent_id, child_id)
      where expected.parent_id = pc.parent_id and expected.child_id = pc.child_id
    )
  ) then
    raise exception 'seed collision in public.parents_children';
  end if;

  if exists (
    select 1 from public.menus m
    join (values
      ('00000000-0000-4000-8000-000000000301'::uuid, 'Pan con tomate', 'Tortilla', 'Fruta', null::text, 'Plátano', 'Desayuno'),
      ('00000000-0000-4000-8000-000000000302'::uuid, 'Lentejas', 'Pollo al horno', 'Arroz', 'Ensalada', 'Yogur', 'Comida'),
      ('00000000-0000-4000-8000-000000000303'::uuid, 'Leche', 'Bocadillo de queso', null::text, null::text, 'Manzana', 'Merienda')
    ) expected(id, first_course, second_course, side, salad, dessert, type) on expected.id = m.id
    where (m.first_course, m.second_course, m.side, m.salad, m.dessert, m.type) is distinct from
          (expected.first_course, expected.second_course, expected.side, expected.salad, expected.dessert, expected.type)
  ) then
    raise exception 'seed collision in public.menus';
  end if;

  if exists (
    select 1 from public.menus_schools ms
    join (values
      ('00000000-0000-4000-8000-000000000301'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, '2026-09-01'::date),
      ('00000000-0000-4000-8000-000000000302'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, '2026-09-01'::date),
      ('00000000-0000-4000-8000-000000000303'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, '2026-09-01'::date)
    ) expected(menu_id, school_id, date)
      on expected.menu_id = ms.menu_id and expected.school_id = ms.school_id
    where ms.date is distinct from expected.date
  ) then
    raise exception 'seed collision in public.menus_schools';
  end if;

  if exists (
    select 1 from public.allergens a
    join (values
      ('00000000-0000-4000-8000-000000000401'::uuid, 'Gluten'),
      ('00000000-0000-4000-8000-000000000402'::uuid, 'Lactosa'),
      ('00000000-0000-4000-8000-000000000403'::uuid, 'Frutos secos'),
      ('00000000-0000-4000-8000-000000000404'::uuid, 'Huevo'),
      ('00000000-0000-4000-8000-000000000498'::uuid, 'B-only test allergen'),
      ('00000000-0000-4000-8000-000000000499'::uuid, 'Shared test allergen')
    ) expected(id, name) on expected.id = a.id
    where a.name is distinct from expected.name
  ) or exists (
    select 1 from public.allergens a
    join (values
      ('Gluten', '00000000-0000-4000-8000-000000000401'::uuid),
      ('Lactosa', '00000000-0000-4000-8000-000000000402'::uuid),
      ('Frutos secos', '00000000-0000-4000-8000-000000000403'::uuid),
      ('Huevo', '00000000-0000-4000-8000-000000000404'::uuid),
      ('B-only test allergen', '00000000-0000-4000-8000-000000000498'::uuid),
      ('Shared test allergen', '00000000-0000-4000-8000-000000000499'::uuid)
    ) expected(name, id) on expected.name = a.name
    where a.id is distinct from expected.id
  ) then
    raise exception 'seed collision in public.allergens';
  end if;

  if exists (
    select 1 from public.child_allergens ca
    where ca.child_id in (
      '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000203',
      '00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000215',
      '00000000-0000-4000-8000-000000000220', '00000000-0000-4000-8000-000000000225'
    )
    and not exists (
      select 1 from (values
      ('00000000-0000-4000-8000-000000000203'::uuid, '00000000-0000-4000-8000-000000000401'::uuid),
      ('00000000-0000-4000-8000-000000000207'::uuid, '00000000-0000-4000-8000-000000000402'::uuid),
      ('00000000-0000-4000-8000-000000000215'::uuid, '00000000-0000-4000-8000-000000000403'::uuid),
      ('00000000-0000-4000-8000-000000000220'::uuid, '00000000-0000-4000-8000-000000000404'::uuid),
       ('00000000-0000-4000-8000-000000000225'::uuid, '00000000-0000-4000-8000-000000000499'::uuid),
      ('00000000-0000-4000-8000-000000000225'::uuid, '00000000-0000-4000-8000-000000000498'::uuid)
      ) expected(child_id, allergen_id)
      where expected.child_id = ca.child_id and expected.allergen_id = ca.allergen_id
    )
  ) then
    raise exception 'seed collision in public.child_allergens';
  end if;

  if exists (
    select 1 from public.incidents i
    join (values
      ('00000000-0000-4000-8000-000000000501'::uuid, '00000000-0000-4000-8000-000000000205'::uuid, 'Pequeno golpe durante el juego', '00000000-0000-4000-8000-000000000021'::uuid, '2026-09-01'::date, false, false),
      ('00000000-0000-4000-8000-000000000502'::uuid, '00000000-0000-4000-8000-000000000218'::uuid, 'Necesita revisar la merienda', '00000000-0000-4000-8000-000000000024'::uuid, '2026-09-01'::date, true, true)
    ) expected(id, child_id, description, monitor_id, date, reviewed, requires_family_signature) on expected.id = i.id
    where (i.child_id, i.description, i.monitor_id, i.date, i.reviewed, i.requires_family_signature) is distinct from
          (expected.child_id, expected.description, expected.monitor_id, expected.date, expected.reviewed, expected.requires_family_signature)
  ) then
    raise exception 'seed collision in public.incidents';
  end if;

  if exists (
    select 1 from public.devices d
    join (values
      ('00000000-0000-4000-8000-000000000601'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Device A', 'device-a', true),
      ('00000000-0000-4000-8000-000000000602'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, 'Device B', 'device-b', true)
    ) expected(id, school_id, name, identifier, active) on expected.id = d.id
    where (d.school_id, d.name, d.identifier, d.active) is distinct from
          (expected.school_id, expected.name, expected.identifier, expected.active)
  ) or exists (
    select 1 from public.devices d
    join (values ('device-a', '00000000-0000-4000-8000-000000000601'::uuid), ('device-b', '00000000-0000-4000-8000-000000000602'::uuid)) expected(identifier, id)
      on expected.identifier = d.identifier
    where d.id is distinct from expected.id
  ) then
    raise exception 'seed collision in public.devices';
  end if;

  if exists (
    select 1 from public.worker_classrooms wc
    join (values
      ('00000000-0000-4000-8000-000000000111'::uuid, '00000000-0000-4000-8000-000000000011'::uuid, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000116'::uuid, '00000000-0000-4000-8000-000000000012'::uuid, timestamp '2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000114'::uuid, '00000000-0000-4000-8000-000000000021'::uuid, timestamp '2026-01-01 00:00:00+00')
    ) expected(worker_id, class_id, created_at)
      on expected.worker_id = wc.worker_id and expected.class_id = wc.class_id
    where wc.created_at is distinct from expected.created_at
  ) then
    raise exception 'seed collision in public.worker_classrooms';
  end if;

  if exists (
    select 1 from public.meal_types mt
    join (values
      ('00000000-0000-4000-8000-000000000611'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'Comida A', true, 1),
      ('00000000-0000-4000-8000-000000000612'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, 'Comida B', true, 1)
    ) expected(id, school_id, name, active, sort_order) on expected.id = mt.id
    where (mt.school_id, mt.name, mt.active, mt.sort_order) is distinct from
          (expected.school_id, expected.name, expected.active, expected.sort_order)
  ) or exists (
    select 1 from public.meal_types mt
    join (values ('00000000-0000-4000-8000-000000000001'::uuid, 'Comida A', '00000000-0000-4000-8000-000000000611'::uuid), ('00000000-0000-4000-8000-000000000002'::uuid, 'Comida B', '00000000-0000-4000-8000-000000000612'::uuid)) expected(school_id, name, id)
      on expected.school_id = mt.school_id and expected.name = mt.name
    where mt.id is distinct from expected.id
  ) then
    raise exception 'seed collision in public.meal_types';
  end if;

  if exists (
    select 1 from public.meal_records mr
    join (values
      ('00000000-0000-4000-8000-000000000621'::uuid, '00000000-0000-4000-8000-000000000225'::uuid, '00000000-0000-4000-8000-000000000612'::uuid, '00000000-0000-4000-8000-000000000114'::uuid, timestamp '2026-09-01 10:00:00+00', 'bien'::public.meal_status, 'School B record'),
      ('00000000-0000-4000-8000-000000000622'::uuid, '00000000-0000-4000-8000-000000000201'::uuid, '00000000-0000-4000-8000-000000000611'::uuid, '00000000-0000-4000-8000-000000000112'::uuid, timestamp '2026-09-01 10:00:00+00', 'regular'::public.meal_status, 'Supervisor review'),
      ('00000000-0000-4000-8000-000000000623'::uuid, '00000000-0000-4000-8000-000000000202'::uuid, '00000000-0000-4000-8000-000000000611'::uuid, '00000000-0000-4000-8000-000000000111'::uuid, timestamp '2026-01-01 10:00:00+00', 'mal'::public.meal_status, 'Old worker record'),
      ('00000000-0000-4000-8000-000000000624'::uuid, '00000000-0000-4000-8000-000000000203'::uuid, '00000000-0000-4000-8000-000000000611'::uuid, '00000000-0000-4000-8000-000000000116'::uuid, timestamp '2026-09-01 10:00:00+00', 'bien'::public.meal_status, 'Other worker record')
    ) expected(id, child_id, meal_type_id, recorded_by, recorded_at, status, notes) on expected.id = mr.id
    where (mr.child_id, mr.meal_type_id, mr.recorded_by, mr.recorded_at, mr.status, mr.notes) is distinct from
          (expected.child_id, expected.meal_type_id, expected.recorded_by, expected.recorded_at, expected.status, expected.notes)
  ) then
    raise exception 'seed collision in public.meal_records';
  end if;
end
$$;

do $$
begin
  if exists (select 1 from public.incidents where id in ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000502') and created_at is distinct from timestamp '2026-01-01 00:00:00+00')
     or exists (select 1 from public.devices where id in ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000602') and created_at is distinct from timestamp '2026-01-01 00:00:00+00')
     or exists (select 1 from public.meal_types where id in ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000612') and created_at is distinct from timestamp '2026-01-01 00:00:00+00')
     then
    raise exception 'seed timestamp collision in public fixtures';
  end if;
end
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aal,
  created_at, updated_at, confirmed_at
)
select account.id, '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', account.email,
       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
       timestamp '2026-01-01 00:00:00+00',
       jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
       jsonb_build_object('full_name', account.full_name), 'aal1',
       timestamp '2026-01-01 00:00:00+00', timestamp '2026-01-01 00:00:00+00',
       timestamp '2026-01-01 00:00:00+00'
  from (values
    ('00000000-0000-4000-8000-000000000101'::uuid, 'parent.1@local.test', 'Parent One'),
    ('00000000-0000-4000-8000-000000000102'::uuid, 'parent.2@local.test', 'Parent Two'),
    ('00000000-0000-4000-8000-000000000103'::uuid, 'parent.3@local.test', 'Parent Three'),
    ('00000000-0000-4000-8000-000000000104'::uuid, 'parent.4@local.test', 'Parent Four'),
    ('00000000-0000-4000-8000-000000000111'::uuid, 'worker.a@local.test', 'Worker A'),
    ('00000000-0000-4000-8000-000000000112'::uuid, 'supervisor.a@local.test', 'Supervisor A'),
    ('00000000-0000-4000-8000-000000000113'::uuid, 'admin.a@local.test', 'Admin A'),
    ('00000000-0000-4000-8000-000000000114'::uuid, 'worker.b@local.test', 'Worker B'),
    ('00000000-0000-4000-8000-000000000115'::uuid, 'admin.b@local.test', 'Admin B'),
    ('00000000-0000-4000-8000-000000000116'::uuid, 'worker.a2@local.test', 'Worker A Two')
  ) as account(id, email, full_name)
on conflict (id) do nothing;

insert into public.schools (id, name) values
  ('00000000-0000-4000-8000-000000000001', 'Colegio Demo'),
  ('00000000-0000-4000-8000-000000000002', 'School B')
on conflict (id) do nothing;

insert into public.users (id, school_id, full_name, role, active, created_at) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Parent One', 'padre', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Parent Two', 'padre', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Parent Three', 'padre', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Parent Four', 'padre', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000001', 'Worker A', 'worker', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000001', 'Supervisor A', 'supervisor', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000001', 'Admin A', 'admin', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000002', 'Worker B', 'worker', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-000000000002', 'Admin B', 'admin', true, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000116', '00000000-0000-4000-8000-000000000001', 'Worker A Two', 'worker', true, timestamp '2026-01-01 00:00:00+00')
on conflict (id) do nothing;

insert into public.classes (id, name, school_id) values
  ('00000000-0000-4000-8000-000000000011', 'Clase Sol', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000012', 'Clase Luna', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000021', 'Clase B', '00000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.monitors (id, first_name, last_name, code, school_id, created_at) values
  ('00000000-0000-4000-8000-000000000021', 'Ana', 'Serra', 101, '00000000-0000-4000-8000-000000000001', timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000022', 'Bruno', 'Vidal', 102, '00000000-0000-4000-8000-000000000001', timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000023', 'Carla', 'Moya', 103, '00000000-0000-4000-8000-000000000001', timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000024', 'Diego', 'Roca', 104, '00000000-0000-4000-8000-000000000001', timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000025', 'Elena', 'Costa', 105, '00000000-0000-4000-8000-000000000001', timestamp '2026-01-01 00:00:00+00')
on conflict (id) do nothing;

insert into public.monitors_schools (monitor_id, school_id)
select id, '00000000-0000-4000-8000-000000000001' from public.monitors
where id between '00000000-0000-4000-8000-000000000021' and '00000000-0000-4000-8000-000000000025'
on conflict (school_id, monitor_id) do nothing;

do $$
begin
  if exists (
    select 1
      from (values
        ('00000000-0000-4000-8000-000000000021'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
        ('00000000-0000-4000-8000-000000000022'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
        ('00000000-0000-4000-8000-000000000023'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
        ('00000000-0000-4000-8000-000000000024'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
        ('00000000-0000-4000-8000-000000000025'::uuid, '00000000-0000-4000-8000-000000000001'::uuid)
      ) expected(monitor_id, school_id)
      left join public.monitors_schools ms
        on ms.monitor_id = expected.monitor_id
       and ms.school_id = expected.school_id
     where ms.monitor_id is null
  ) or exists (
    select 1
      from public.monitors_schools ms
      join (values
        ('00000000-0000-4000-8000-000000000021'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
        ('00000000-0000-4000-8000-000000000022'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
        ('00000000-0000-4000-8000-000000000023'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
        ('00000000-0000-4000-8000-000000000024'::uuid, '00000000-0000-4000-8000-000000000001'::uuid),
        ('00000000-0000-4000-8000-000000000025'::uuid, '00000000-0000-4000-8000-000000000001'::uuid)
      ) expected(monitor_id, school_id) on expected.monitor_id = ms.monitor_id
     where ms.school_id is distinct from expected.school_id
  ) then
    raise exception 'seed monitor school links are incomplete or cross-tenant';
  end if;
end
$$;

insert into public.children (id, first_name, last_name, class_id, created_at)
select child.id, child.first_name, child.last_name, child.class_id,
       timestamp '2026-01-01 00:00:00+00'
from (values
  ('00000000-0000-4000-8000-000000000201', 'Alba', 'Martin', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000202', 'Adrian', 'Perez', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000203', 'Berta', 'Lopez', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000204', 'Bruno', 'Gomez', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000205', 'Celia', 'Navarro', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000206', 'Dario', 'Soler', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000207', 'Elsa', 'Ribas', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000208', 'Eric', 'Ferrer', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000209', 'Fatima', 'Pastor', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000210', 'Gael', 'Cano', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000211', 'Ines', 'Mora', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000212', 'Joel', 'Rey', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000213', 'Aina', 'Martin', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000214', 'Alex', 'Perez', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000215', 'Clara', 'Lopez', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000216', 'Diana', 'Gomez', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000217', 'Emma', 'Navarro', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000218', 'Ferran', 'Soler', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000219', 'Gala', 'Ribas', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000220', 'Hugo', 'Ferrer', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000221', 'Iris', 'Pastor', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000222', 'Jan', 'Cano', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000223', 'Laia', 'Mora', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000224', 'Marc', 'Rey', '00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000225', 'Berta B', 'School B', '00000000-0000-4000-8000-000000000021'),
  ('00000000-0000-4000-8000-000000000226', 'Null', 'Class', null)
) child(id, first_name, last_name, class_id)
on conflict (id) do nothing;

insert into public.parents_children (parent_id, child_id)
select links.parent_id, links.child_id
from (values
  ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000201'::uuid),
  ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000202'::uuid),
  ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000203'::uuid),
  ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000204'::uuid),
  ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000205'::uuid),
  ('00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000206'::uuid),
  ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000207'::uuid),
  ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000208'::uuid),
  ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000209'::uuid),
  ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000210'::uuid),
  ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000211'::uuid),
  ('00000000-0000-4000-8000-000000000102'::uuid, '00000000-0000-4000-8000-000000000212'::uuid),
  ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000213'::uuid),
  ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000214'::uuid),
  ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000215'::uuid),
  ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000216'::uuid),
  ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000217'::uuid),
  ('00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000218'::uuid),
  ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000219'::uuid),
  ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000220'::uuid),
  ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000221'::uuid),
  ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000222'::uuid),
  ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000223'::uuid),
  ('00000000-0000-4000-8000-000000000104'::uuid, '00000000-0000-4000-8000-000000000224'::uuid)
) as links(parent_id, child_id)
on conflict (parent_id, child_id) do nothing;

insert into public.menus (id, first_course, second_course, side, salad, dessert, type) values
  ('00000000-0000-4000-8000-000000000301', 'Pan con tomate', 'Tortilla', 'Fruta', null, 'Plátano', 'Desayuno'),
  ('00000000-0000-4000-8000-000000000302', 'Lentejas', 'Pollo al horno', 'Arroz', 'Ensalada', 'Yogur', 'Comida'),
  ('00000000-0000-4000-8000-000000000303', 'Leche', 'Bocadillo de queso', null, null, 'Manzana', 'Merienda')
on conflict (id) do nothing;

insert into public.menus_schools (menu_id, school_id, date) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', '2026-09-01'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', '2026-09-01'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', '2026-09-01')
on conflict (menu_id, school_id) do nothing;

insert into public.allergens (id, name) values
  ('00000000-0000-4000-8000-000000000401', 'Gluten'),
  ('00000000-0000-4000-8000-000000000402', 'Lactosa'),
  ('00000000-0000-4000-8000-000000000403', 'Frutos secos'),
  ('00000000-0000-4000-8000-000000000404', 'Huevo'),
  ('00000000-0000-4000-8000-000000000498', 'B-only test allergen'),
  ('00000000-0000-4000-8000-000000000499', 'Shared test allergen')
on conflict (id) do nothing;

insert into public.child_allergens (child_id, allergen_id) values
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000401'),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000402'),
  ('00000000-0000-4000-8000-000000000215', '00000000-0000-4000-8000-000000000403'),
  ('00000000-0000-4000-8000-000000000220', '00000000-0000-4000-8000-000000000404'),
  ('00000000-0000-4000-8000-000000000225', '00000000-0000-4000-8000-000000000499'),
  ('00000000-0000-4000-8000-000000000225', '00000000-0000-4000-8000-000000000498')
on conflict (child_id, allergen_id) do nothing;

do $$
begin
  if exists (
    select 1
      from (values
        ('00000000-0000-4000-8000-000000000101'::uuid, array['00000000-0000-4000-8000-000000000201'::uuid, '00000000-0000-4000-8000-000000000202'::uuid, '00000000-0000-4000-8000-000000000203'::uuid, '00000000-0000-4000-8000-000000000204'::uuid, '00000000-0000-4000-8000-000000000205'::uuid, '00000000-0000-4000-8000-000000000206'::uuid]),
        ('00000000-0000-4000-8000-000000000102'::uuid, array['00000000-0000-4000-8000-000000000207'::uuid, '00000000-0000-4000-8000-000000000208'::uuid, '00000000-0000-4000-8000-000000000209'::uuid, '00000000-0000-4000-8000-000000000210'::uuid, '00000000-0000-4000-8000-000000000211'::uuid, '00000000-0000-4000-8000-000000000212'::uuid]),
        ('00000000-0000-4000-8000-000000000103'::uuid, array['00000000-0000-4000-8000-000000000213'::uuid, '00000000-0000-4000-8000-000000000214'::uuid, '00000000-0000-4000-8000-000000000215'::uuid, '00000000-0000-4000-8000-000000000216'::uuid, '00000000-0000-4000-8000-000000000217'::uuid, '00000000-0000-4000-8000-000000000218'::uuid]),
        ('00000000-0000-4000-8000-000000000104'::uuid, array['00000000-0000-4000-8000-000000000219'::uuid, '00000000-0000-4000-8000-000000000220'::uuid, '00000000-0000-4000-8000-000000000221'::uuid, '00000000-0000-4000-8000-000000000222'::uuid, '00000000-0000-4000-8000-000000000223'::uuid, '00000000-0000-4000-8000-000000000224'::uuid])
      ) expected(parent_id, child_ids)
      left join lateral (
        select array_agg(pc.child_id order by pc.child_id) as child_ids
          from public.parents_children pc
         where pc.parent_id = expected.parent_id
      ) actual on true
     where actual.child_ids is distinct from expected.child_ids
  ) then
    raise exception 'seed collision in public.parents_children';
  end if;

  if exists (
    select 1
      from (values
        ('00000000-0000-4000-8000-000000000203'::uuid, array['00000000-0000-4000-8000-000000000401'::uuid]),
        ('00000000-0000-4000-8000-000000000207'::uuid, array['00000000-0000-4000-8000-000000000402'::uuid]),
        ('00000000-0000-4000-8000-000000000215'::uuid, array['00000000-0000-4000-8000-000000000403'::uuid]),
        ('00000000-0000-4000-8000-000000000220'::uuid, array['00000000-0000-4000-8000-000000000404'::uuid]),
        ('00000000-0000-4000-8000-000000000225'::uuid, array['00000000-0000-4000-8000-000000000498'::uuid, '00000000-0000-4000-8000-000000000499'::uuid])
      ) expected(child_id, allergen_ids)
      left join lateral (
        select array_agg(ca.allergen_id order by ca.allergen_id) as allergen_ids
          from public.child_allergens ca
         where ca.child_id = expected.child_id
      ) actual on true
     where actual.allergen_ids is distinct from expected.allergen_ids
  ) then
    raise exception 'seed collision in public.child_allergens';
  end if;
end
$$;

insert into public.incidents (id, child_id, description, monitor_id, date, reviewed, requires_family_signature, created_at) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000205', 'Pequeno golpe durante el juego', '00000000-0000-4000-8000-000000000021', '2026-09-01', false, false, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000218', 'Necesita revisar la merienda', '00000000-0000-4000-8000-000000000024', '2026-09-01', true, true, timestamp '2026-01-01 00:00:00+00')
on conflict (id) do nothing;

insert into public.devices (id, school_id, name, identifier, created_at) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001', 'Device A', 'device-a', timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000002', 'Device B', 'device-b', timestamp '2026-01-01 00:00:00+00')
on conflict (id) do nothing;

insert into public.worker_classrooms (worker_id, class_id, created_at) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000011', timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000116', '00000000-0000-4000-8000-000000000012', timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000021', timestamp '2026-01-01 00:00:00+00')
on conflict (worker_id, class_id) do nothing;

insert into public.meal_types (id, school_id, name, sort_order, created_at) values
  ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000001', 'Comida A', 1, timestamp '2026-01-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000002', 'Comida B', 1, timestamp '2026-01-01 00:00:00+00')
on conflict (id) do nothing;

insert into public.meal_records (id, child_id, meal_type_id, recorded_by, recorded_at, status, notes) values
  ('00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000225', '00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000114', timestamp '2026-09-01 10:00:00+00', 'bien', 'School B record'),
  ('00000000-0000-4000-8000-000000000622', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000112', timestamp '2026-09-01 10:00:00+00', 'regular', 'Supervisor review'),
  ('00000000-0000-4000-8000-000000000623', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000111', timestamp '2026-01-01 10:00:00+00', 'mal', 'Old worker record'),
  ('00000000-0000-4000-8000-000000000624', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000116', timestamp '2026-09-01 10:00:00+00', 'bien', 'Other worker record')
on conflict (id) do nothing;
