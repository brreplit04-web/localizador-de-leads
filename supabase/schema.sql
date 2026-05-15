create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null,
  source_id text not null,
  lead_hash text,
  source_url text,
  author text,
  company_name text,
  city text,
  contact_phone text,
  contact_email text,
  website_url text,
  rating numeric(3,2),
  review_count integer,
  title text,
  content text not null default '',
  subreddit text,
  niche text,
  intent text,
  pain_point text,
  offer_angle text,
  contact_hint text,
  opener text,
  notes text not null default '',
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'weak', 'failed', 'skipped')),
  verification_score integer not null default 0 check (verification_score between 0 and 100),
  verified_at timestamptz,
  last_seen_at timestamptz not null default now(),
  urgency integer not null default 1 check (urgency between 1 and 5),
  score integer not null default 0 check (score between 0 and 100),
  status text not null default 'pendente'
    check (status in ('pendente', 'abordado', 'fechado', 'descartado')),
  metadata jsonb not null default '{}'::jsonb,
  unique (source, source_id)
);

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_score_idx on public.leads (score desc);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_urgency_idx on public.leads (urgency desc);
create index if not exists leads_verification_idx on public.leads (verification_status, verified_at desc);
create unique index if not exists leads_hash_unique_idx on public.leads (lead_hash) where lead_hash is not null;

create table if not exists public.miner_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null,
  status text not null default 'running'
    check (status in ('running', 'success', 'error')),
  collected integer not null default 0,
  approved integer not null default 0,
  saved integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists miner_runs_started_at_idx on public.miner_runs (started_at desc);
create index if not exists miner_runs_source_idx on public.miner_runs (source);

create table if not exists public.miner_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists lead_events_lead_id_idx on public.lead_events (lead_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

drop trigger if exists miner_settings_set_updated_at on public.miner_settings;
create trigger miner_settings_set_updated_at
before update on public.miner_settings
for each row
execute function public.set_updated_at();

alter table public.leads enable row level security;
alter table public.miner_runs enable row level security;
alter table public.miner_settings enable row level security;
alter table public.lead_events enable row level security;

revoke insert, update, delete on public.leads from anon;
grant select on public.leads to anon;
grant insert (
  source,
  source_id,
  lead_hash,
  source_url,
  author,
  company_name,
  city,
  contact_phone,
  contact_email,
  website_url,
  rating,
  review_count,
  title,
  content,
  niche,
  intent,
  pain_point,
  offer_angle,
  contact_hint,
  opener,
  notes,
  verification_status,
  verification_score,
  verified_at,
  urgency,
  score,
  status,
  metadata
) on public.leads to anon;
grant update (status, notes, opener, verification_status, verification_score, verified_at) on public.leads to anon;
grant select on public.miner_runs to anon;
grant select, insert, update on public.miner_settings to anon;
grant select, insert on public.lead_events to anon;

drop policy if exists "Dashboard can read leads" on public.leads;
create policy "Dashboard can read leads"
on public.leads for select
to anon
using (true);

drop policy if exists "Dashboard can update lead status" on public.leads;
create policy "Dashboard can update lead status"
on public.leads for update
to anon
using (true)
with check (true);

drop policy if exists "Dashboard can import manual leads" on public.leads;
create policy "Dashboard can import manual leads"
on public.leads for insert
to anon
with check (source = 'manual');

drop policy if exists "Dashboard can read miner runs" on public.miner_runs;
create policy "Dashboard can read miner runs"
on public.miner_runs for select
to anon
using (true);

drop policy if exists "Dashboard can read settings" on public.miner_settings;
create policy "Dashboard can read settings"
on public.miner_settings for select
to anon
using (true);

drop policy if exists "Dashboard can write settings" on public.miner_settings;
create policy "Dashboard can write settings"
on public.miner_settings for insert
to anon
with check (true);

drop policy if exists "Dashboard can update settings" on public.miner_settings;
create policy "Dashboard can update settings"
on public.miner_settings for update
to anon
using (true)
with check (true);

drop policy if exists "Dashboard can read lead events" on public.lead_events;
create policy "Dashboard can read lead events"
on public.lead_events for select
to anon
using (true);

drop policy if exists "Dashboard can write lead events" on public.lead_events;
create policy "Dashboard can write lead events"
on public.lead_events for insert
to anon
with check (true);

insert into public.miner_settings (key, value)
values
  ('reddit_subreddits', '["empreendedorismo","marketingdigital","brdev","programacao","PequenosNegocios"]'::jsonb),
  ('reddit_keywords', '["preciso de um site","quero um site","landing page nao converte","sistema travou","automatizar atendimento","organizar pedidos","perdendo clientes","agenda online","crm simples","whatsapp atendimento","loja virtual"]'::jsonb),
  ('osm_places', '["Ponta Grossa, PR, Brazil"]'::jsonb),
  ('osm_categories', '["barbearia","clinica de estetica","restaurante","academia","pet shop","auto center","odontologia","imobiliaria"]'::jsonb),
  ('maps_queries', '["barbearia sem site em Ponta Grossa PR","clinica de estetica sem site em Ponta Grossa PR","restaurante baixa avaliacao em Ponta Grossa PR"]'::jsonb)
on conflict (key) do nothing;

-- O worker deve usar SUPABASE_SERVICE_ROLE_KEY no GitHub Actions para inserir/upsertar.
-- MVP sem auth: o dashboard anon pode editar status, notes, opener, settings e eventos.
-- Antes de publicar aberto, troque essas policies por regras autenticadas.
