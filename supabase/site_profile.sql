-- 🪪 站主档案：头像、名字、身份、签名、自我介绍、Now、兴趣、链接——在网站上登录后直接编辑。
-- 在 Supabase Dashboard → SQL Editor 里执行一次。依赖 is_gardener()（garden_posts.sql 里定义），先跑那几份。
--
-- 表里只有一行（id = 'main'），data 是整份档案的 JSON；前端缺哪个字段就用代码里的默认值补上。
-- 头像存在 Storage 的 site-assets 公开桶里，档案里只记它的公开地址。

create table if not exists public.site_profile (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_profile enable row level security;

drop policy if exists "site_profile public read" on public.site_profile;
create policy "site_profile public read" on public.site_profile
  for select using (true);

drop policy if exists "site_profile gardener write" on public.site_profile;
create policy "site_profile gardener write" on public.site_profile
  for all to authenticated
  using (public.is_gardener())
  with check (public.is_gardener());

-- ── 头像存储桶：所有人可读，只有站主能传/换/删 ─────────────────────────
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "site-assets public read" on storage.objects;
create policy "site-assets public read" on storage.objects
  for select using (bucket_id = 'site-assets');

drop policy if exists "site-assets gardener insert" on storage.objects;
create policy "site-assets gardener insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets' and public.is_gardener());

drop policy if exists "site-assets gardener update" on storage.objects;
create policy "site-assets gardener update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-assets' and public.is_gardener());

drop policy if exists "site-assets gardener delete" on storage.objects;
create policy "site-assets gardener delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-assets' and public.is_gardener());
