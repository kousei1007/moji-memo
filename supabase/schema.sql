-- もじメモ: sync tables. Run once in the Supabase SQL Editor.
-- Every row belongs to one user; row level security keeps each account's data private.
-- Deletions are kept as rows with deleted = true (content emptied) so other devices learn about them.

create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  kana text not null default '',
  updated_at bigint not null,
  deleted boolean not null default false
);

create table if not exists public.memos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid,
  body text not null default '',
  kana text not null default '',
  summary jsonb,
  updated_at bigint not null,
  deleted boolean not null default false
);

create table if not exists public.memo_images (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  memo_id uuid not null,
  data_url text not null default '',
  updated_at bigint not null,
  deleted boolean not null default false
);

-- Added later: page arrangement (text size/colour, placed texts, image positions).
-- Safe to run on an existing database.
alter table public.memos add column if not exists layout jsonb;

create index if not exists projects_user_idx on public.projects (user_id);
create index if not exists memos_user_idx on public.memos (user_id);
create index if not exists memo_images_user_idx on public.memo_images (user_id);

alter table public.projects enable row level security;
alter table public.memos enable row level security;
alter table public.memo_images enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own memos" on public.memos;
create policy "own memos" on public.memos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own memo images" on public.memo_images;
create policy "own memo images" on public.memo_images for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
