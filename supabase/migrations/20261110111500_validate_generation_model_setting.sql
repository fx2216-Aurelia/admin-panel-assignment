alter table public.llm_logs
    add column if not exists configured_model text;

update public.llm_logs
set configured_model = model
where configured_model is null;

alter table public.llm_logs
    alter column configured_model set not null;

update public.app_settings
set value = 'gemini-3.6-flash',
    updated_at = now()
where key = 'generation_model'
  and updated_by is null
  and value in (
      'gemini-1.5-flash',
      'models/gemini-1.5-flash',
      'gemini-1.5-pro',
      'models/gemini-1.5-pro',
      'gemini-2.0-flash',
      'models/gemini-2.0-flash',
      'gemini-2.5-flash',
      'models/gemini-2.5-flash',
      'gemini-3.1-pro-preview',
      'models/gemini-3.1-pro-preview',
      'gemini-3.8-flash',
      'models/gemini-3.8-flash',
      'gemini-3.5-flash',
      'models/gemini-3.5-flash'
  );

insert into public.app_settings (key, value)
values ('generation_model', 'gemini-3.6-flash')
on conflict (key) do nothing;
