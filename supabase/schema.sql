-- ════════════════════════════════════════════════════════════
-- rappi-lead-tracker-inbound — Supabase Schema
-- Correr en: Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════

-- Extensiones
create extension if not exists "uuid-ossp";

-- ─── Enums ───────────────────────────────────────────────────────────────────

create type user_role      as enum ('HUNTER', 'LIDER', 'ADMIN');
create type country        as enum ('CO', 'MX', 'AR', 'PE', 'CL', 'EC');
create type lead_source    as enum ('SDR', 'SOB');
create type funnel_stage   as enum (
  'SIN_CONTACTO', 'CONTACTO_FALLIDO', 'CONTACTO_EFECTIVO',
  'OK_R2S', 'ESPERANDO_DOCUMENTOS', 'OB', 'PROPUESTA_ENVIADA', 'VENTA',
  'BLOQUEADO_NO_INTERESA', 'BLOQUEADO_IMPOSIBLE_CONTACTO',
  'BLOQUEADO_FUERA_COBERTURA', 'BLOQUEADO_NO_RESTAURANTE',
  'BLOQUEADO_RESTAURANTE_CERRADO', 'BLOQUEADO_YA_EN_RAPPI'
);
create type contact_result as enum ('EFECTIVO', 'FALLIDO', 'OCUPADO');
create type contact_method as enum ('LLAMADA', 'WHATSAPP', 'CORREO');
create type alert_type     as enum (
  'NO_CONTACT_24H', 'SAME_STAGE_48H', 'LEAD_ASIGNADO',
  'SIN_CONTACTO_48H', 'BAJA_CONVERSION'
);

-- ─── Profiles ─────────────────────────────────────────────────────────────────
-- Extiende auth.users de Supabase.
-- "team" indica si el agente trabaja en SDR o SOB.

create table profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  email        text unique not null,
  full_name    text not null,
  role         user_role   not null default 'HUNTER',
  country      country     not null,
  leader_id    uuid references profiles(id),
  team         lead_source not null default 'SDR',
  daily_target int         not null default 4,
  is_active    boolean     not null default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─── Leads ───────────────────────────────────────────────────────────────────
-- "source" = SDR | SOB.
-- ops_zone y tyc son opcionales (solo SOB los tiene generalmente).
-- Máx 3 intentos de contacto explícitos (ver contact_attempts).

create table leads (
  id                       uuid default uuid_generate_v4() primary key,
  lead_id_external         text unique not null,
  name                     text not null,
  country                  country      not null,
  source                   lead_source  not null default 'SDR',
  ops_zone                 text,
  entry_method             text,
  phone1                   text,
  phone2                   text,
  informacion_lead         text,
  tyc                      timestamptz,
  observaciones            text,
  external_store_id        text,
  assigned_to_id           uuid references profiles(id),
  assigned_at              timestamptz  not null default now(),
  current_stage            funnel_stage not null default 'SIN_CONTACTO',
  stage_changed_at         timestamptz  not null default now(),
  fecha_estado             timestamptz,
  week_assigned            timestamptz  not null default date_trunc('week', now()),
  semana_lead              timestamptz,
  tiene_intento_contacto   boolean default false,
  tiene_contacto_efectivo  boolean default false,
  bloqueado                boolean default false,
  negociacion_exitosa      boolean default false,
  ultima_fecha_contacto    timestamptz,
  is_deleted               boolean      not null default false,
  created_at               timestamptz  default now(),
  updated_at               timestamptz  default now()
);

-- ─── Contact attempts (máx 3) ────────────────────────────────────────────────

create table contact_attempts (
  id              uuid default uuid_generate_v4() primary key,
  lead_id         uuid references leads(id) not null,
  attempt_number  int  not null check (attempt_number between 1 and 3),
  result          contact_result not null,
  contact_method  contact_method not null default 'LLAMADA',
  contacted_at    timestamptz    not null,
  notes           text,
  created_by_id   uuid references profiles(id) not null,
  created_at      timestamptz default now(),
  unique (lead_id, attempt_number)
);

-- ─── Stage history ───────────────────────────────────────────────────────────

create table stage_history (
  id            uuid default uuid_generate_v4() primary key,
  lead_id       uuid references leads(id) not null,
  from_stage    funnel_stage,
  to_stage      funnel_stage not null,
  changed_at    timestamptz  default now(),
  changed_by_id uuid references profiles(id) not null
);

-- ─── Alerts ──────────────────────────────────────────────────────────────────

create table alerts (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references profiles(id) not null,
  lead_id      uuid references leads(id)    not null,
  type         alert_type not null,
  message      text       not null,
  is_read      boolean    not null default false,
  triggered_at timestamptz default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index on leads(assigned_to_id);
create index on leads(current_stage);
create index on leads(stage_changed_at);
create index on leads(country);
create index on leads(source);
create index on leads(is_deleted);
create index on leads(week_assigned);
create index on leads(assigned_at);
create index on contact_attempts(lead_id);
create index on stage_history(lead_id);
create index on alerts(user_id, is_read);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger update_leads_updated_at
  before update on leads
  for each row execute function update_updated_at();
