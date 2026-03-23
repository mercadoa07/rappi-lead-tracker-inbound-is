-- ════════════════════════════════════════════════════════════
-- Row Level Security — rappi-lead-tracker-inbound
-- IMPORTANTE: Usar auth.role() = 'authenticated' en profiles
-- para evitar recursión infinita.
-- ════════════════════════════════════════════════════════════

alter table profiles         enable row level security;
alter table leads            enable row level security;
alter table contact_attempts enable row level security;
alter table stage_history    enable row level security;
alter table alerts           enable row level security;

-- ─── Profiles ────────────────────────────────────────────────────────────────
-- HUNTER: solo se ve a sí mismo.
-- LIDER: se ve a sí mismo + su equipo.
-- ADMIN: ve todos.
-- NOTA: No hacemos subquery a profiles para evitar recursión.
--   Usamos auth.jwt() para leer el rol.

-- Todos los usuarios autenticados pueden leer perfiles (necesario para lookups)
create policy "profiles_select_authenticated"
  on profiles for select
  using (auth.role() = 'authenticated');

-- Solo admin puede insertar perfiles (o via service_role en import)
create policy "profiles_insert_admin"
  on profiles for insert
  with check (
    (select role from profiles where id = auth.uid()) = 'ADMIN'
  );

-- El usuario puede actualizar su propio perfil
create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id);

-- Admin puede actualizar cualquier perfil
create policy "profiles_update_admin"
  on profiles for update
  using (
    (select role from profiles where id = auth.uid()) = 'ADMIN'
  );

-- ─── Leads ───────────────────────────────────────────────────────────────────

-- HUNTER: solo sus leads
create policy "leads_select_hunter"
  on leads for select
  using (
    assigned_to_id = auth.uid()
    and is_deleted = false
  );

-- LIDER: leads de su equipo + sin asignar de su país
create policy "leads_select_lider"
  on leads for select
  using (
    is_deleted = false
    and (
      assigned_to_id in (
        select id from profiles where leader_id = auth.uid()
      )
      or (
        assigned_to_id is null
        and country in (
          select distinct country from profiles where leader_id = auth.uid()
        )
      )
    )
  );

-- ADMIN: todos los leads
create policy "leads_select_admin"
  on leads for select
  using (
    (select role from profiles where id = auth.uid()) = 'ADMIN'
    and is_deleted = false
  );

-- HUNTER: actualiza sus propios leads
create policy "leads_update_hunter"
  on leads for update
  using (assigned_to_id = auth.uid());

-- LIDER: actualiza leads de su equipo
create policy "leads_update_lider"
  on leads for update
  using (
    assigned_to_id in (
      select id from profiles where leader_id = auth.uid()
    )
    or assigned_to_id is null
  );

-- ADMIN: actualiza cualquier lead
create policy "leads_update_admin"
  on leads for update
  using (
    (select role from profiles where id = auth.uid()) = 'ADMIN'
  );

-- Solo ADMIN inserta leads (import masivo usa service_role)
create policy "leads_insert_admin"
  on leads for insert
  with check (
    (select role from profiles where id = auth.uid()) = 'ADMIN'
  );

-- ─── Contact attempts ────────────────────────────────────────────────────────

create policy "ca_select"
  on contact_attempts for select
  using (
    lead_id in (
      select id from leads
      where assigned_to_id = auth.uid()
         or assigned_to_id in (select id from profiles where leader_id = auth.uid())
    )
    or (select role from profiles where id = auth.uid()) = 'ADMIN'
  );

create policy "ca_insert"
  on contact_attempts for insert
  with check (
    lead_id in (
      select id from leads
      where assigned_to_id = auth.uid()
         or assigned_to_id in (select id from profiles where leader_id = auth.uid())
    )
    or (select role from profiles where id = auth.uid()) = 'ADMIN'
  );

-- ─── Stage history ───────────────────────────────────────────────────────────

create policy "sh_select"
  on stage_history for select
  using (
    lead_id in (
      select id from leads
      where assigned_to_id = auth.uid()
         or assigned_to_id in (select id from profiles where leader_id = auth.uid())
    )
    or (select role from profiles where id = auth.uid()) = 'ADMIN'
  );

create policy "sh_insert"
  on stage_history for insert
  with check (
    lead_id in (
      select id from leads
      where assigned_to_id = auth.uid()
         or assigned_to_id in (select id from profiles where leader_id = auth.uid())
    )
    or (select role from profiles where id = auth.uid()) = 'ADMIN'
  );

-- ─── Alerts ──────────────────────────────────────────────────────────────────

create policy "alerts_select"
  on alerts for select
  using (user_id = auth.uid());

create policy "alerts_update"
  on alerts for update
  using (user_id = auth.uid());
