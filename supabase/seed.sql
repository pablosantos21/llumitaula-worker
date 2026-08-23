-- Deterministic development data for the local Supabase database.
-- This file never creates auth.users or stores passwords. It does not remove or
-- update data outside this dataset.

-- A fixed UUID may already exist in a database restored from another source.
-- Abort before inserting in that case, rather than attaching demo relationships
-- to or overwriting an unrelated row. Matching demo rows make reruns safe.
do $$
begin
  if exists (
    select 1 from public.users
    where id = '00000000-0000-4000-8000-000000000101'
      and role is distinct from 'padre'::public.user_role
  ) or exists (
    select 1 from public.users
    where id = '00000000-0000-4000-8000-000000000102'
      and role is distinct from 'padre'::public.user_role
  ) or exists (
    select 1 from public.users
    where id = '00000000-0000-4000-8000-000000000103'
      and role is distinct from 'padre'::public.user_role
  ) or exists (
    select 1 from public.users
    where id = '00000000-0000-4000-8000-000000000104'
      and role is distinct from 'padre'::public.user_role
  ) then
    raise exception 'seed UUID collision in public.users';
  end if;

  if exists (
    select 1 from public.schools
    where id = '00000000-0000-4000-8000-000000000001'
      and name is distinct from 'Colegio Demo'
  ) then
    raise exception 'seed UUID collision in public.schools';
  end if;

  if exists (
    select 1
    from public.schools
    where name = 'Colegio Demo'
      and id is distinct from '00000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'seed natural key collision in public.schools';
  end if;

  if exists (
    select 1 from public.classes
    where id = '00000000-0000-4000-8000-000000000011'
      and (name, school_id) is distinct from ('Clase Sol', '00000000-0000-4000-8000-000000000001'::uuid)
  ) or exists (
    select 1 from public.classes
    where id = '00000000-0000-4000-8000-000000000012'
      and (name, school_id) is distinct from ('Clase Luna', '00000000-0000-4000-8000-000000000001'::uuid)
  ) then
    raise exception 'seed UUID collision in public.classes';
  end if;

  if exists (
    select 1
    from (
      values
        ('Clase Sol', '00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000011'::uuid),
        ('Clase Luna', '00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000012'::uuid)
    ) as demo(name, school_id, expected_id)
    join public.classes on classes.name = demo.name and classes.school_id = demo.school_id
    where classes.id is distinct from demo.expected_id
  ) then
    raise exception 'seed natural key collision in public.classes';
  end if;

  if exists (
    select 1 from public.monitors
    where id = '00000000-0000-4000-8000-000000000021'
      and (first_name, last_name, code) is distinct from ('Ana', 'Serra', 101::smallint)
  ) or exists (
    select 1 from public.monitors
    where id = '00000000-0000-4000-8000-000000000022'
      and (first_name, last_name, code) is distinct from ('Bruno', 'Vidal', 102::smallint)
  ) or exists (
    select 1 from public.monitors
    where id = '00000000-0000-4000-8000-000000000023'
      and (first_name, last_name, code) is distinct from ('Carla', 'Moya', 103::smallint)
  ) or exists (
    select 1 from public.monitors
    where id = '00000000-0000-4000-8000-000000000024'
      and (first_name, last_name, code) is distinct from ('Diego', 'Roca', 104::smallint)
  ) or exists (
    select 1 from public.monitors
    where id = '00000000-0000-4000-8000-000000000025'
      and (first_name, last_name, code) is distinct from ('Elena', 'Costa', 105::smallint)
  ) then
    raise exception 'seed UUID collision in public.monitors';
  end if;

  if exists (
    select 1
    from (
      values
        (101::smallint, '00000000-0000-4000-8000-000000000021'::uuid),
        (102::smallint, '00000000-0000-4000-8000-000000000022'::uuid),
        (103::smallint, '00000000-0000-4000-8000-000000000023'::uuid),
        (104::smallint, '00000000-0000-4000-8000-000000000024'::uuid),
        (105::smallint, '00000000-0000-4000-8000-000000000025'::uuid)
    ) as demo(code, expected_id)
    join public.monitors on monitors.code = demo.code
    where monitors.id is distinct from demo.expected_id
  ) then
    raise exception 'seed natural key collision in public.monitors';
  end if;

  if exists (
    select 1 from public.children
    where id between '00000000-0000-4000-8000-000000000201' and '00000000-0000-4000-8000-000000000224'
      and (first_name, last_name, class_id) is distinct from (
        case id
          when '00000000-0000-4000-8000-000000000201'::uuid then 'Alba'
          when '00000000-0000-4000-8000-000000000202'::uuid then 'Adrian'
          when '00000000-0000-4000-8000-000000000203'::uuid then 'Berta'
          when '00000000-0000-4000-8000-000000000204'::uuid then 'Bruno'
          when '00000000-0000-4000-8000-000000000205'::uuid then 'Celia'
          when '00000000-0000-4000-8000-000000000206'::uuid then 'Dario'
          when '00000000-0000-4000-8000-000000000207'::uuid then 'Elsa'
          when '00000000-0000-4000-8000-000000000208'::uuid then 'Eric'
          when '00000000-0000-4000-8000-000000000209'::uuid then 'Fatima'
          when '00000000-0000-4000-8000-000000000210'::uuid then 'Gael'
          when '00000000-0000-4000-8000-000000000211'::uuid then 'Ines'
          when '00000000-0000-4000-8000-000000000212'::uuid then 'Joel'
          when '00000000-0000-4000-8000-000000000213'::uuid then 'Aina'
          when '00000000-0000-4000-8000-000000000214'::uuid then 'Alex'
          when '00000000-0000-4000-8000-000000000215'::uuid then 'Clara'
          when '00000000-0000-4000-8000-000000000216'::uuid then 'Diana'
          when '00000000-0000-4000-8000-000000000217'::uuid then 'Emma'
          when '00000000-0000-4000-8000-000000000218'::uuid then 'Ferran'
          when '00000000-0000-4000-8000-000000000219'::uuid then 'Gala'
          when '00000000-0000-4000-8000-000000000220'::uuid then 'Hugo'
          when '00000000-0000-4000-8000-000000000221'::uuid then 'Iris'
          when '00000000-0000-4000-8000-000000000222'::uuid then 'Jan'
          when '00000000-0000-4000-8000-000000000223'::uuid then 'Laia'
          when '00000000-0000-4000-8000-000000000224'::uuid then 'Marc'
        end,
        case when id < '00000000-0000-4000-8000-000000000213'::uuid
          then '00000000-0000-4000-8000-000000000011'::uuid
          else '00000000-0000-4000-8000-000000000012'::uuid end
      )
  ) then
    raise exception 'seed UUID collision in public.children';
  end if;

  if exists (
    select 1 from public.menus
    where id = '00000000-0000-4000-8000-000000000301'
      and (first_course, second_course, side, salad, dessert, type) is distinct from ('Pan con tomate', 'Tortilla', 'Fruta', null, 'Plátano', 'Desayuno')
  ) or exists (
    select 1 from public.menus
    where id = '00000000-0000-4000-8000-000000000302'
      and (first_course, second_course, side, salad, dessert, type) is distinct from ('Lentejas', 'Pollo al horno', 'Arroz', 'Ensalada', 'Yogur', 'Comida')
  ) or exists (
    select 1 from public.menus
    where id = '00000000-0000-4000-8000-000000000303'
      and (first_course, second_course, side, salad, dessert, type) is distinct from ('Leche', 'Bocadillo de queso', null, null, 'Manzana', 'Merienda')
  ) then
    raise exception 'seed UUID collision in public.menus';
  end if;

  if exists (
    select 1 from public.allergens
    where id = '00000000-0000-4000-8000-000000000401' and name is distinct from 'Gluten'
  ) or exists (
    select 1 from public.allergens
    where id = '00000000-0000-4000-8000-000000000402' and name is distinct from 'Lactosa'
  ) or exists (
    select 1 from public.allergens
    where id = '00000000-0000-4000-8000-000000000403' and name is distinct from 'Frutos secos'
  ) or exists (
    select 1 from public.allergens
    where id = '00000000-0000-4000-8000-000000000404' and name is distinct from 'Huevo'
  ) then
    raise exception 'seed UUID collision in public.allergens';
  end if;

  if exists (
    select 1
    from (
      values
        ('Gluten', '00000000-0000-4000-8000-000000000401'::uuid),
        ('Lactosa', '00000000-0000-4000-8000-000000000402'::uuid),
        ('Frutos secos', '00000000-0000-4000-8000-000000000403'::uuid),
        ('Huevo', '00000000-0000-4000-8000-000000000404'::uuid)
    ) as demo(name, expected_id)
    join public.allergens on allergens.name = demo.name
    where allergens.id is distinct from demo.expected_id
  ) then
    raise exception 'seed natural key collision in public.allergens';
  end if;

  if exists (
    select 1 from public.incidents
    where id = '00000000-0000-4000-8000-000000000501'
      and (child_id, description, monitor_id, date, reviewed, requires_family_signature) is distinct from ('00000000-0000-4000-8000-000000000205'::uuid, 'Pequeno golpe durante el juego', '00000000-0000-4000-8000-000000000021'::uuid, '2026-09-01'::date, false, false)
  ) or exists (
    select 1 from public.incidents
    where id = '00000000-0000-4000-8000-000000000502'
      and (child_id, description, monitor_id, date, reviewed, requires_family_signature) is distinct from ('00000000-0000-4000-8000-000000000218'::uuid, 'Necesita revisar la merienda', '00000000-0000-4000-8000-000000000024'::uuid, '2026-09-01'::date, true, true)
  ) then
    raise exception 'seed UUID collision in public.incidents';
  end if;
end
$$;

-- Demo users are public profile rows only. They intentionally have no matching
-- auth.users rows; local authentication can be added separately when needed.
insert into public.users (id, role)
values
  ('00000000-0000-4000-8000-000000000101', 'padre'),
  ('00000000-0000-4000-8000-000000000102', 'padre'),
  ('00000000-0000-4000-8000-000000000103', 'padre'),
  ('00000000-0000-4000-8000-000000000104', 'padre')
on conflict (id) do nothing;

insert into public.schools (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Colegio Demo')
on conflict (id) do nothing;

insert into public.classes (id, name, school_id)
values
  ('00000000-0000-4000-8000-000000000011', 'Clase Sol', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000012', 'Clase Luna', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.monitors (id, first_name, last_name, code)
values
  ('00000000-0000-4000-8000-000000000021', 'Ana', 'Serra', 101),
  ('00000000-0000-4000-8000-000000000022', 'Bruno', 'Vidal', 102),
  ('00000000-0000-4000-8000-000000000023', 'Carla', 'Moya', 103),
  ('00000000-0000-4000-8000-000000000024', 'Diego', 'Roca', 104),
  ('00000000-0000-4000-8000-000000000025', 'Elena', 'Costa', 105)
on conflict (id) do nothing;

insert into public.monitors_schools (monitor_id, school_id)
values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000001')
on conflict (school_id, monitor_id) do nothing;

insert into public.children (id, first_name, last_name, class_id)
values
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
  ('00000000-0000-4000-8000-000000000224', 'Marc', 'Rey', '00000000-0000-4000-8000-000000000012')
on conflict (id) do nothing;

-- The explicit links keep this seed independent of generated values and make
-- each parent responsible for six children.
insert into public.parents_children (parent_id, child_id)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000203'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000204'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000205'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000206'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000207'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000208'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000209'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000210'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000211'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000212'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000213'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000214'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000215'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000216'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000217'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000218'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000219'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000220'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000221'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000222'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000223'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000224')
on conflict (parent_id, child_id) do nothing;

insert into public.menus (id, first_course, second_course, side, salad, dessert, type)
values
  ('00000000-0000-4000-8000-000000000301', 'Pan con tomate', 'Tortilla', 'Fruta', null, 'Plátano', 'Desayuno'),
  ('00000000-0000-4000-8000-000000000302', 'Lentejas', 'Pollo al horno', 'Arroz', 'Ensalada', 'Yogur', 'Comida'),
  ('00000000-0000-4000-8000-000000000303', 'Leche', 'Bocadillo de queso', null, null, 'Manzana', 'Merienda')
on conflict (id) do nothing;

insert into public.menus_schools (menu_id, school_id, date)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', '2026-09-01'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', '2026-09-01'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', '2026-09-01')
on conflict (menu_id, school_id) do nothing;

insert into public.allergens (id, name)
values
  ('00000000-0000-4000-8000-000000000401', 'Gluten'),
  ('00000000-0000-4000-8000-000000000402', 'Lactosa'),
  ('00000000-0000-4000-8000-000000000403', 'Frutos secos'),
  ('00000000-0000-4000-8000-000000000404', 'Huevo')
on conflict (name) do nothing;

insert into public.child_allergens (child_id, allergen_id)
select links.child_id, allergens.id
from (
  values
    ('00000000-0000-4000-8000-000000000203'::uuid, 'Gluten'),
    ('00000000-0000-4000-8000-000000000207'::uuid, 'Lactosa'),
    ('00000000-0000-4000-8000-000000000215'::uuid, 'Frutos secos'),
    ('00000000-0000-4000-8000-000000000220'::uuid, 'Huevo')
) as links(child_id, allergen_name)
join public.allergens on allergens.name = links.allergen_name
on conflict (child_id, allergen_id) do nothing;

insert into public.incidents (id, child_id, description, monitor_id, date, reviewed, requires_family_signature)
values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000205', 'Pequeno golpe durante el juego', '00000000-0000-4000-8000-000000000021', '2026-09-01', false, false),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000218', 'Necesita revisar la merienda', '00000000-0000-4000-8000-000000000024', '2026-09-01', true, true)
on conflict (id) do nothing;

-- Useful read-only checks after `supabase db reset`:
-- select count(*) from public.schools where id = '00000000-0000-4000-8000-000000000001'; -- 1
-- select count(*) from public.classes where school_id = '00000000-0000-4000-8000-000000000001'; -- 2
-- select count(*) from public.children where id between '00000000-0000-4000-8000-000000000201' and '00000000-0000-4000-8000-000000000224'; -- 24
-- select type, count(*) from public.menus where id between '00000000-0000-4000-8000-000000000301' and '00000000-0000-4000-8000-000000000303' group by type order by type; -- 1 per category
