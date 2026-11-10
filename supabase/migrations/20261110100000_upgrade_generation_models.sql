update public.app_settings
set value = case value
    when 'gemini-1.5-flash' then 'gemini-3.8-flash'
    when 'models/gemini-1.5-flash' then 'gemini-3.8-flash'
    when 'gemini-1.5-pro' then 'gemini-3.1-pro-preview'
    when 'models/gemini-1.5-pro' then 'gemini-3.1-pro-preview'
    else regexp_replace(value, '^models/', '')
end,
updated_at = now()
where key = 'generation_model'
  and value in (
      'gemini-1.5-flash',
      'models/gemini-1.5-flash',
      'gemini-1.5-pro',
      'models/gemini-1.5-pro'
  );
