-- #40: historial del día con estado visto; la familia lee y confirma lectura.
-- La familia (padre) solo ve avisos de sus hijos dirigidos a familia:
-- requiere firma familiar o sin envío al colegio. La audiencia vive solo en
-- interfaz sobre los dos indicadores existentes; (false, true) se interpreta
-- como colegio para no filtrar avisos solo-colegio a la familia.
-- El gesto único marca family_seen + family_responded_at sin respuesta
-- obligatoria; el visto es informativo, sin bloqueo operativo.

drop policy if exists incidents_select_parent on public.incidents;
create policy incidents_select_parent on public.incidents
  for select to authenticated
  using (
    public.current_user_active()
    and public.current_user_role() = 'padre'
    and private.current_user_can_access_child(child_id)
    and (
      requires_family_signature = true
      or send_notification is distinct from true
    )
  );

drop policy if exists incidents_parent_update on public.incidents;
create policy incidents_parent_update on public.incidents
  for update to authenticated
  using (
    public.current_user_active()
    and public.current_user_role() = 'padre'
    and private.current_user_can_access_child(child_id)
    and (
      requires_family_signature = true
      or send_notification is distinct from true
    )
  )
  with check (
    public.current_user_active()
    and public.current_user_role() = 'padre'
    and private.current_user_can_access_child(child_id)
    and (
      requires_family_signature = true
      or send_notification is distinct from true
    )
  );

-- La familia solo confirma lectura: no toca niñez, autoría, categoría,
-- descripción, audiencia ni cierre del monitor. El visto fija el momento.
create or replace function public.enforce_incident_family_ack()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
begin
  if public.current_user_role() is distinct from 'padre' then
    return new;
  end if;

  if new.child_id is distinct from old.child_id
     or new.monitor_id is distinct from old.monitor_id
     or new.category is distinct from old.category
     or new.description is distinct from old.description
     or new.date is distinct from old.date
     or new.requires_family_signature is distinct from old.requires_family_signature
     or new.send_notification is distinct from old.send_notification
     or new.reviewed is distinct from old.reviewed
     or new.monitor_validated is distinct from old.monitor_validated then
    raise exception 'la familia solo puede marcar el visto'
      using errcode = '42501';
  end if;

  if new.family_seen is distinct from true then
    raise exception 'la familia solo puede marcar el visto'
      using errcode = '42501';
  end if;

  if new.family_responded_at is null then
    raise exception 'el visto registra el momento'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

revoke execute on function public.enforce_incident_family_ack() from public, anon, authenticated, service_role;

drop trigger if exists incidents_family_ack on public.incidents;
create trigger incidents_family_ack
before update of family_seen, family_responded_at, family_response on public.incidents
for each row execute function public.enforce_incident_family_ack();
