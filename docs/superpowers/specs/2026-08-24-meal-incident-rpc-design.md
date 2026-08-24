# Meal Incident RPC Design

## Goal

Make incident recording atomic and tenant-safe, and make the BusinessApp card state reflect either a non-`bien` meal record or an incident for the child on the current date.

## Design

- Add `public.record_meal_incident(...)` as a `SECURITY DEFINER` PL/pgSQL RPC with a fixed `search_path`.
- Validate `auth.uid()`, active `admin`/`supervisor` role, current-date input, child and meal type in the current school, and monitor in the same school before writing.
- Upsert the daily `meal_records` row and insert the incident in one function transaction. The function returns the upserted meal row.
- Revoke default execution and grant execute only to `authenticated`; direct table RLS remains unchanged.
- Keep ordinary meal saves as the existing client upsert, so workers remain meal-only.
- Load current-day incidents in `BusinessApp`, derive card status from both collections, and reload incidents after successful incident RPC calls.
- Update generated-style database types and add SQL privilege/authorization/atomicity assertions plus Node visual interaction coverage.

## Error Handling

Any validation or write failure raises an RPC error. The client reports one failure and does not update local state until the combined operation succeeds.

## Testing

SQL tests cover function existence, grants, worker rejection, tenant/date/monitor validation, successful combined writes, and rollback. Node tests cover incident loading/state derivation and the combined RPC interaction.
