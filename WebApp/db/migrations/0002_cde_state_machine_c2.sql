-- Sentinel CDE C2 — ISO 19650 state machine, published immutability, hash-chained append-only audit.
-- Applied to Supabase project autqqtwhxqrfjaztablm on 2026-07-16.
-- Verified: valid wip->shared->published->archived flow (audit + intact hash chain); illegal
-- wip->published rejected; editing a published version rejected; audit_log update/delete rejected.

create extension if not exists pgcrypto with schema extensions;

-- Append-only, tamper-evident (hash-chained) audit log.
create or replace function cde_audit_chain() returns trigger language plpgsql as $$
declare last_hash text;
begin
  select hash into last_hash from audit_log order by id desc limit 1;
  new.prev_hash := last_hash;
  new.hash := encode(
    extensions.digest(
      coalesce(last_hash,'') || new.entity_type || coalesce(new.entity_id::text,'') ||
      new.action || coalesce(new.actor,'') || coalesce(new.old_value::text,'') ||
      coalesce(new.new_value::text,'') || coalesce(new.at::text,''),
      'sha256'), 'hex');
  return new;
end $$;
create trigger trg_audit_chain before insert on audit_log
  for each row execute function cde_audit_chain();

create or replace function cde_audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only (no update/delete)';
end $$;
create trigger trg_audit_no_change before update or delete on audit_log
  for each row execute function cde_audit_immutable();

-- Published versions are immutable (state may only move to archived).
create or replace function cde_protect_published() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'published' then raise exception 'published versions are immutable (cannot delete)'; end if;
    return old;
  end if;
  if old.state = 'published' then
    if new.state not in ('published','archived') then
      raise exception 'a published version can only move to archived';
    end if;
    if new.state = 'published'
       and (new.revision, new.suitability, coalesce(new.file_ref,''), coalesce(new.notes,''))
           is distinct from (old.revision, old.suitability, coalesce(old.file_ref,''), coalesce(old.notes,'')) then
      raise exception 'published version fields are immutable';
    end if;
  end if;
  return new;
end $$;
create trigger trg_protect_published before update or delete on container_versions
  for each row execute function cde_protect_published();

-- ISO 19650 state transition — the only sanctioned way to change state.
create or replace function cde_transition(p_version uuid, p_new_state container_state,
                                          p_actor text default null, p_note text default null)
returns container_versions language plpgsql as $$
declare cur container_versions; ok boolean;
begin
  select * into cur from container_versions where id = p_version for update;
  if not found then raise exception 'version % not found', p_version; end if;

  ok := case
    when cur.state = 'wip'       and p_new_state = 'shared'                 then true
    when cur.state = 'shared'    and p_new_state in ('published','wip')     then true  -- publish, or reject to WIP
    when cur.state = 'published' and p_new_state = 'archived'               then true
    else false
  end;
  if not ok then raise exception 'illegal ISO 19650 transition: % -> %', cur.state, p_new_state; end if;

  update container_versions set state = p_new_state where id = p_version;

  insert into audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  select ic.project_id, 'container_version', cur.id,
         'state:' || cur.state::text || '->' || p_new_state::text, p_actor,
         jsonb_build_object('state', cur.state::text),
         jsonb_build_object('state', p_new_state::text, 'note', p_note)
  from information_containers ic where ic.id = cur.container_id;

  select * into cur from container_versions where id = p_version;
  return cur;
end $$;
