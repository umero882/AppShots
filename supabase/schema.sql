-- AppShots — Supabase schema. Run this in your Coolify Supabase SQL editor.
-- Auth is handled by Supabase Auth; `name` and `plan` live in the user's
-- metadata, so the only table we need is `projects`.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Untitled project',
  state       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);

-- Row Level Security: every user can only see/modify their own projects.
alter table public.projects enable row level security;

drop policy if exists "projects are private to their owner" on public.projects;
create policy "projects are private to their owner"
  on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NOTE: In Supabase → Authentication → Providers/Settings, turn OFF
-- "Confirm email" (or configure SMTP) so sign-up sessions start immediately.
-- Also ensure the app's domain is allowed under Auth → URL Configuration.
