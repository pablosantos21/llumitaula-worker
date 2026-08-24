# Escrituras diarias atómicas y acciones de incidencias

## Objetivo

Hacer que cada combinación de alumno, tipo de comida y día tenga un único
registro de comida, evitando carreras entre clientes y preservando el histórico.
Además, la interfaz no debe ofrecer a un `worker` una acción de incidencias que
la base de datos rechazará.

## Diseño aprobado

`public.meal_records` tendrá `recorded_date date not null default current_date`
y una restricción única sobre `(child_id, meal_type_id, recorded_date)`. El
cliente enviará siempre la fecha local operativa y hará un `upsert` contra esa
clave, sin buscar primero un registro por `recorded_at`. Las consultas diarias
usarán `recorded_date`, mientras `recorded_at` seguirá siendo la marca temporal
de auditoría. Las políticas y el trigger de relaciones mantendrán aislamiento
por colegio, impedirán fechas futuras y no permitirán que una actualización
cambie la fecha histórica de una fila.

Los tipos generados/manuales, el seed y los tests SQL incluirán la nueva columna,
la unicidad y fixtures de varios días. Los tests del cliente verificarán que el
upsert usa la clave diaria y que no se hace una consulta previa susceptible de
carrera.

Las incidencias se autorizarán para `admin` y `supervisor` mediante
`public.incidents`, con aislamiento por colegio y relaciones válidas. Un
`worker` no verá ni podrá activar el modal/acción de incidencia; la base de datos
seguirá siendo la autoridad final para cualquier llamada directa.

## Verificación

Se ejecutarán los tests SQL y de regresión del cliente, `npm run check`,
`npm run lint`, `npm run build` y `npm run format:check`. La implementación se
cerrará con el commit `fix: make daily meal writes atomic`.
