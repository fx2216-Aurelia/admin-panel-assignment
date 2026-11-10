alter table public.prompt_chain_steps
    add column if not exists name text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where contype = 'f'
          and conrelid = 'public.prompt_chain_steps'::regclass
          and confrelid = 'public.prompt_chains'::regclass
    ) then
        alter table public.prompt_chain_steps
            add constraint prompt_chain_steps_prompt_chain_id_fkey
            foreign key (prompt_chain_id)
            references public.prompt_chains (id)
            on delete cascade;
    end if;
end
$$;

create table if not exists public.llm_logs (
    id uuid primary key default gen_random_uuid(),
    execution_id uuid not null,
    chain_id uuid not null references public.prompt_chains (id),
    step_id uuid not null references public.prompt_chain_steps (id),
    user_id uuid not null references auth.users (id) on delete cascade,
    model text not null,
    status text not null check (status in ('succeeded', 'failed', 'skipped')),
    input_text text not null,
    output_text text,
    error_message text,
    duration_ms integer,
    created_at timestamptz not null default now()
);

create index if not exists llm_logs_step_created_idx
    on public.llm_logs (step_id, created_at desc);
create index if not exists llm_logs_execution_created_idx
    on public.llm_logs (execution_id, created_at);

grant select on public.prompt_chains, public.prompt_chain_steps to authenticated;
drop policy if exists prompt_chains_read_authenticated on public.prompt_chains;
create policy prompt_chains_read_authenticated
    on public.prompt_chains
    for select
    to authenticated
    using (true);

drop policy if exists prompt_chain_steps_read_authenticated on public.prompt_chain_steps;
create policy prompt_chain_steps_read_authenticated
    on public.prompt_chain_steps
    for select
    to authenticated
    using (true);

alter table public.llm_logs enable row level security;
revoke all on public.llm_logs from anon, authenticated;
grant select, insert on public.llm_logs to authenticated;

drop policy if exists llm_logs_select_superadmin on public.llm_logs;
create policy llm_logs_select_superadmin
    on public.llm_logs
    for select
    to authenticated
    using ((select public.is_current_user_superadmin()));

drop policy if exists llm_logs_insert_own on public.llm_logs;
create policy llm_logs_insert_own
    on public.llm_logs
    for insert
    to authenticated
    with check (user_id = (select auth.uid()));

insert into public.prompt_chains (name, description)
select
    'Personalized Cognitive Reframing Assistant',
    'Analyze the user''s stress, draft a compassionate Stoic reframe, and apply the selected tone.'
where not exists (
    select 1
    from public.prompt_chains
    where name = 'Personalized Cognitive Reframing Assistant'
);

with target_chain as (
    select id
    from public.prompt_chains
    where name = 'Personalized Cognitive Reframing Assistant'
    limit 1
),
seed_steps (step_number, name, system_instruction, prompt_template) as (
    values
        (
            1,
            'Analyze Input',
            'Identify the user''s stress level (1-10) and primary emotion.',
            'Analyze this vent input and context. Identify the stated stress level, primary emotion, and concrete trigger. Return a concise internal analysis. Input: {{input}}'
        ),
        (
            2,
            'Draft Response',
            'Generate a compassionate, stoic-inspired cognitive reframe.',
            'Using the original input and the analysis from the previous step, draft a compassionate, practical Stoic-inspired reframe. Original input: {{input}} Previous step: {{previous_output}}'
        ),
        (
            3,
            'Apply Constraints',
            'Ensure the response is gentle, concise, and adheres to the selected tone.',
            'Review the original input and previous pipeline results. Apply the required output format and tone constraints. Original input: {{input}} Previous results: {{previous_outputs}}'
        )
)
insert into public.prompt_chain_steps (
    prompt_chain_id,
    step_number,
    name,
    system_instruction,
    prompt_template,
    temperature,
    max_tokens,
    model_id
)
select
    target_chain.id,
    seed_steps.step_number,
    seed_steps.name,
    seed_steps.system_instruction,
    seed_steps.prompt_template,
    0.7,
    1000,
    null
from target_chain
cross join seed_steps
where not exists (
    select 1
    from public.prompt_chain_steps existing
    where existing.prompt_chain_id = target_chain.id
      and existing.step_number = seed_steps.step_number
);
