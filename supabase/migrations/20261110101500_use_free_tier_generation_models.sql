update public.app_settings
set value = case
        when value in (
            'gemini-2.0-flash',
            'models/gemini-2.0-flash'
        ) then 'gemini-2.0-flash'
        else 'gemini-2.5-flash'
    end,
    updated_at = now()
where key = 'generation_model'
  and value not in ('gemini-2.5-flash', 'gemini-2.0-flash');

insert into public.app_settings (key, value)
values ('generation_model', 'gemini-2.5-flash')
on conflict (key) do nothing;
