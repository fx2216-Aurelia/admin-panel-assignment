grant usage on schema public to authenticated;
grant usage on schema public to anon;
grant select on table public.generations to anon, authenticated;
alter table public.generations enable row level security;

create or replace function public.is_current_user_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and is_superadmin is true
    );
$$;

revoke all on function public.is_current_user_superadmin() from public, anon;
grant execute on function public.is_current_user_superadmin() to authenticated;

drop policy if exists generations_select_superadmin on public.generations;
create policy generations_select_superadmin
    on public.generations
    for select
    to authenticated
    using ((select public.is_current_user_superadmin()));

drop policy if exists generations_select_public_feed on public.generations;
create policy generations_select_public_feed
    on public.generations
    for select
    to anon, authenticated
    using (true);
