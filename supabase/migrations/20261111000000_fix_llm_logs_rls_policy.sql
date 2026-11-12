-- Fix RLS policy to allow admins to read LLM logs
-- Current policy only allows superadmins; this expands to all admins

drop policy if exists llm_logs_select_superadmin on public.llm_logs;

create policy llm_logs_select_admin
    on public.llm_logs
    for select
    to authenticated
    using (
        (select public.is_current_user_superadmin()) 
        OR 
        (select public.is_current_user_admin())
    );
