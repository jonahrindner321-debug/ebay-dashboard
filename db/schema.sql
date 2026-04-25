-- Seller OS database foundation.
-- Designed for Neon Postgres on Vercel.

create extension if not exists pgcrypto;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  name text not null,
  slug text not null unique,
  platform text not null default 'multi',
  owner_share_pct numeric(5,2),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_connections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  platform text not null,
  external_account_id text,
  external_account_name text,
  scopes text[] not null default '{}',
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_account_id),
  unique (store_id, platform)
);

create table if not exists platform_tokens (
  connection_id uuid primary key references platform_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  token_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references platform_connections(id) on delete cascade,
  platform text not null,
  sync_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_synced integer not null default 0,
  error text
);

create index if not exists idx_stores_client_id on stores(client_id);
create index if not exists idx_connections_store_id on platform_connections(store_id);
create index if not exists idx_connections_platform on platform_connections(platform);
