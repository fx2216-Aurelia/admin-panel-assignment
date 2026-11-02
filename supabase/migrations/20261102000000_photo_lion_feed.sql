begin;

create function public.photo_lion_feed(page_offset integer default 0, page_size integer default 10, feed_tab text default 'explore', feed_sort text default 'latest', commented_ids uuid[] default '{}')
returns setof jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    generation record;
    content jsonb;
    summary jsonb;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if page_offset < 0 or page_offset > 10000 or page_size < 1 or page_size > 11 or feed_tab not in ('explore', 'mine', 'interacted') or feed_sort not in ('latest', 'highest-stress') or coalesce(cardinality(commented_ids), 0) > 200 then
        raise exception 'Invalid pagination';
    end if;
    for generation in
        select g.* from public.generations g
        where feed_tab = 'explore'
            or (feed_tab = 'mine' and g.user_id = auth.uid())
            or (feed_tab = 'interacted' and (
                exists (select 1 from public.votes v where v.generation_id = g.id and v.user_id = auth.uid())
                or g.id = any(commented_ids)
            ))
        order by
            case when feed_sort = 'highest-stress' then coalesce(g.coffee_count, 0) * 1.5 + coalesce(g.hug_count, 0) - greatest(0, extract(epoch from (now() - g.created_at)) / 3600) * 0.8 end desc,
            g.created_at desc, g.id desc
        limit page_size offset page_offset
    loop
        begin
            content := generation.output_text::jsonb;
        exception when others then
            content := jsonb_build_object('analysis', 'This reflection could not be loaded.');
        end;
        summary := jsonb_build_object(
            'analysis', content->'analysis',
            'coping_modality', content->'coping_modality',
            'coping_action', content->'coping_action',
            'actions', content->'actions',
            'scene_theme', content->'scene_theme',
            'location', content->'location',
            'author_name', content->'author_name',
            'image_source', content->'image_source',
            'photo_notice', content->'photo_notice'
        );
        return next jsonb_build_object(
            'id', generation.id, 'user_id', generation.user_id,
            'prompt', generation.prompt, 'stress_level', generation.stress_level,
            'tone_type', generation.tone_type, 'stoic_quote', generation.stoic_quote,
            'created_at', generation.created_at, 'hug_count', generation.hug_count,
            'coffee_count', generation.coffee_count, 'output_text', summary::text,
            'image_url', '/api/generations/' || generation.id::text || '/image'
        );
    end loop;
end;
$$;

revoke all on function public.photo_lion_feed(integer, integer, text, text, uuid[]) from public, anon;
grant execute on function public.photo_lion_feed(integer, integer, text, text, uuid[]) to authenticated;

commit;
