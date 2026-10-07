-- #38: incidencia con categoría obligatoria en interfaz, nullable en datos.
-- Los registros antiguos quedan NULL y se interpretan como 'otro' en lectura.
-- Valores cerrados en interfaz: salud, comportamiento, comedor, descanso, recogida, otro.

alter table public.incidents
  add column if not exists category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incidents_category_check'
  ) then
    alter table public.incidents
      add constraint incidents_category_check
      check (
        category is null
        or category in ('salud', 'comportamiento', 'comedor', 'descanso', 'recogida', 'otro')
      );
  end if;
end
$$;

comment on column public.incidents.category is
  'Categoria cerrada de la incidencia (salud, comportamiento, comedor, descanso, recogida, otro). NULL = historico, se muestra como otro.';
