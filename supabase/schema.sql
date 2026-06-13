-- HaDaZi Supabase 建表脚本
-- 使用方法：Supabase 后台 -> SQL Editor -> New query -> 粘贴全部内容 -> Run

create table if not exists public.profiles (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id text primary key,
  user_id text,
  person_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.friends (
  user_id text not null,
  person_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, person_id)
);

create table if not exists public.messages (
  id text primary key,
  user_id text not null,
  person_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_created_at on public.posts (created_at desc);
create index if not exists idx_friends_user_id on public.friends (user_id);
create index if not exists idx_messages_user_person_time on public.messages (user_id, person_id, created_at);

-- 当前项目用后端 service_role key 访问数据库，不让浏览器直接访问表。
-- 因此这里保持 RLS 关闭，后续接正式登录后再开启 RLS 并补充策略。
alter table public.profiles disable row level security;
alter table public.people disable row level security;
alter table public.posts disable row level security;
alter table public.friends disable row level security;
alter table public.messages disable row level security;
