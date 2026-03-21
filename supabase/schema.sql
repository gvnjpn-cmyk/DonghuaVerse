-- =============================================
-- Anichin Web — Supabase Schema
-- Jalankan di Supabase SQL Editor
-- =============================================

-- SERIES
create table if not exists series (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text,
  thumb         text,
  status        text,         -- Ongoing / Completed / Upcoming
  type          text,         -- Donghua / Movie / OVA
  rating        text,
  genres        text[],
  synopsis      text,
  studio        text,
  network       text,
  season        text,
  country       text,
  duration      text,
  url           text,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);

-- EPISODES
create table if not exists episodes (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid references series(id) on delete cascade,
  series_slug   text not null,
  ep_num        text,
  title         text,
  url           text unique not null,
  release_date  text,
  created_at    timestamptz default now()
);

-- SERVERS (stream embed)
create table if not exists servers (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid references episodes(id) on delete cascade,
  episode_url   text,
  type          text,         -- OK.ru / Dailymotion / Drive / etc
  embed_url     text,
  created_at    timestamptz default now()
);

-- DOWNLOADS
create table if not exists downloads (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid references episodes(id) on delete cascade,
  episode_url   text,
  quality       text,         -- 360p / 480p / 720p / 1080p / 4K
  host          text,         -- Mirrored / Terabox / etc
  url           text,
  created_at    timestamptz default now()
);

-- SCHEDULE (jadwal tayang)
create table if not exists schedule (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid references series(id) on delete cascade,
  series_slug   text,
  title         text,
  thumb         text,
  day           text,         -- Senin, Selasa, Rabu, ...
  status        text,
  created_at    timestamptz default now()
);

-- COMMENTS
create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  episode_url   text not null,
  name          text not null,
  body          text not null,
  created_at    timestamptz default now()
);

-- ── Indexes ──────────────────────────────────────────
create index if not exists idx_episodes_series_slug on episodes(series_slug);
create index if not exists idx_episodes_created on episodes(created_at desc);
create index if not exists idx_servers_episode_id on servers(episode_id);
create index if not exists idx_downloads_episode_id on downloads(episode_id);
create index if not exists idx_schedule_day on schedule(day);
create index if not exists idx_comments_episode_url on comments(episode_url);

-- ── RLS: Comments bisa diinsert siapa saja ───────────
alter table comments enable row level security;
create policy "Anyone can read comments"  on comments for select using (true);
create policy "Anyone can post comments"  on comments for insert with check (true);

-- RLS lain: read-only untuk publik
alter table series    enable row level security;
alter table episodes  enable row level security;
alter table servers   enable row level security;
alter table downloads enable row level security;
alter table schedule  enable row level security;

create policy "Public read series"    on series    for select using (true);
create policy "Public read episodes"  on episodes  for select using (true);
create policy "Public read servers"   on servers   for select using (true);
create policy "Public read downloads" on downloads for select using (true);
create policy "Public read schedule"  on schedule  for select using (true);
