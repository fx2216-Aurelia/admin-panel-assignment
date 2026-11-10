create table if not exists public.app_settings (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select, insert, update on public.app_settings to authenticated;

drop policy if exists app_settings_read_generation_model on public.app_settings;
create policy app_settings_read_generation_model
    on public.app_settings
    for select
    to authenticated
    using (key = 'generation_model');

drop policy if exists app_settings_insert_superadmin on public.app_settings;
create policy app_settings_insert_superadmin
    on public.app_settings
    for insert
    to authenticated
    with check (
        key = 'generation_model'
        and (select public.is_current_user_superadmin())
        and updated_by = (select auth.uid())
    );

drop policy if exists app_settings_update_superadmin on public.app_settings;
create policy app_settings_update_superadmin
    on public.app_settings
    for update
    to authenticated
    using (
        key = 'generation_model'
        and (select public.is_current_user_superadmin())
    )
    with check (
        key = 'generation_model'
        and (select public.is_current_user_superadmin())
        and updated_by = (select auth.uid())
    );

insert into public.app_settings (key, value)
values ('generation_model', 'gemini-2.5-flash')
on conflict (key) do nothing;
