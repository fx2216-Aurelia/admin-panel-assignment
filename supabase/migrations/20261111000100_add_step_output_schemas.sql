-- Add structured output schema support to prompt chain steps
-- Enables validation of intermediate step outputs

alter table public.prompt_chain_steps
    add column if not exists output_schema jsonb;

-- Define schema for Step 1: Analyze Input
-- Expected output: emotional analysis with stress level, emotions, triggers, and distortions
with target_chain as (
    select id from public.prompt_chains
    where name = 'Personalized Cognitive Reframing Assistant'
    limit 1
)
update public.prompt_chain_steps
set output_schema = jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
        'stress_level', jsonb_build_object(
            'type', 'integer',
            'description', 'Stress level on a scale of 1-10',
            'minimum', 1,
            'maximum', 10
        ),
        'primary_emotion', jsonb_build_object(
            'type', 'string',
            'description', 'The primary emotion expressed by the user'
        ),
        'emotional_triggers', jsonb_build_object(
            'type', 'array',
            'items', jsonb_build_object('type', 'string'),
            'description', 'List of identified emotional triggers'
        ),
        'core_distortions', jsonb_build_object(
            'type', 'array',
            'items', jsonb_build_object('type', 'string'),
            'description', 'Cognitive distortions identified in the users thinking'
        ),
        'analysis', jsonb_build_object(
            'type', 'string',
            'description', 'Detailed analysis of the emotional state'
        )
    ),
    'required', jsonb_build_array(
        'stress_level', 'primary_emotion', 'emotional_triggers',
        'core_distortions', 'analysis'
    )
)
where step_number = 1
  and prompt_chain_id = (
      select id from target_chain
  );

-- Define schema for Step 2: Draft Reframing
-- Expected output: stoic cognitive reframing with supporting quote
with target_chain as (
    select id from public.prompt_chains
    where name = 'Personalized Cognitive Reframing Assistant'
    limit 1
)
update public.prompt_chain_steps
set output_schema = jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
        'stoic_reframing', jsonb_build_object(
            'type', 'string',
            'description', 'A compassionate, stoic-inspired cognitive reframe of the situation'
        ),
        'quote', jsonb_build_object(
            'type', 'object',
            'description', 'A supporting stoic or wisdom quote',
            'properties', jsonb_build_object(
                'text', jsonb_build_object(
                    'type', 'string',
                    'description', 'The quote text'
                ),
                'source', jsonb_build_object(
                    'type', 'string',
                    'description', 'The source/author of the quote'
                )
            ),
            'required', jsonb_build_array('text', 'source')
        ),
        'key_insight', jsonb_build_object(
            'type', 'string',
            'description', 'A key insight connecting the reframe to actionable steps'
        )
    ),
    'required', jsonb_build_array('stoic_reframing', 'quote', 'key_insight')
)
where step_number = 2
  and prompt_chain_id = (
      select id from target_chain
  );

-- Create index on output_schema for efficient lookups
create index if not exists prompt_chain_steps_output_schema_idx
    on public.prompt_chain_steps
    using gin (output_schema);
