-- probes/0058_probe.sql — the drill for 0058_owns_no_container.sql. Run AFTER the apply.
-- Part 1: catalog check (every row ok = true): the column on task_teams, boolean, not null, false by default.

-- Part 1
select 'task_teams carries owns_no_container, false by default' as what,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'task_teams' and column_name = 'owns_no_container'
            and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false') as ok;
