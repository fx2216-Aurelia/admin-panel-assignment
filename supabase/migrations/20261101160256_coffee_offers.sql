begin;

create table public.coffee_offers (
    id uuid primary key default gen_random_uuid(),
    generation_id uuid not null references public.generations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    platform text not null check (platform in ('ins', 'facebook', 'wechat')),
    account text not null check (account = btrim(account) and char_length(account) between 1 and 100 and account !~ '[[:cntrl:]]'),
    comment_id uuid not null references public.feed_comments(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (generation_id, user_id)
);

create table public.coffee_notifications (
    id uuid primary key default gen_random_uuid(),
    offer_id uuid not null unique references public.coffee_offers(id) on delete cascade,
    generation_id uuid not null references public.generations(id) on delete cascade,
    recipient_id uuid not null references auth.users(id) on delete cascade,
    content text not null,
    created_at timestamptz not null default now(),
    read_at timestamptz
);

create index coffee_offers_user_idx on public.coffee_offers (user_id);
create index coffee_offers_comment_idx on public.coffee_offers (comment_id);
create index coffee_notifications_generation_idx on public.coffee_notifications (generation_id);
create index coffee_notifications_recipient_created_idx on public.coffee_notifications (recipient_id, created_at desc);
create index coffee_notifications_recipient_unread_idx on public.coffee_notifications (recipient_id) where read_at is null;

alter table public.coffee_offers enable row level security;
alter table public.coffee_notifications enable row level security;
revoke all on public.coffee_offers, public.coffee_notifications from anon, authenticated;
grant select, insert on public.coffee_offers to authenticated;
grant select on public.coffee_notifications to authenticated;
grant update (read_at) on public.coffee_notifications to authenticated;

create policy coffee_offers_read_own on public.coffee_offers for select to authenticated
    using (user_id = (select auth.uid()));
create policy coffee_offers_insert_own on public.coffee_offers for insert to authenticated
    with check (
        user_id = (select auth.uid())
        and exists (
            select 1 from public.generations
            where id = generation_id and user_id <> (select auth.uid())
        )
        and exists (
            select 1 from public.feed_comments
            where id = comment_id and generation_id = coffee_offers.generation_id
              and content = '☕ Coffee on Me — ' || coffee_offers.platform || ': ' || coffee_offers.account
        )
        and exists (
            select 1 from public.votes
            where generation_id = coffee_offers.generation_id
              and user_id = (select auth.uid()) and vote_type = 'coffee'
        )
    );
create policy coffee_notifications_read_own on public.coffee_notifications for select to authenticated
    using (recipient_id = (select auth.uid()));
create policy coffee_notifications_update_own on public.coffee_notifications for update to authenticated
    using (recipient_id = (select auth.uid()))
    with check (recipient_id = (select auth.uid()));

create function public.notify_coffee_author()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.coffee_notifications (offer_id, generation_id, recipient_id, content)
    select new.id, new.generation_id, generation.user_id,
        '☕ Someone offered you a coffee! ' || new.platform || ': ' || new.account
    from public.generations generation
    where generation.id = new.generation_id and generation.user_id <> new.user_id;
    return new;
end;
$$;
revoke all on function public.notify_coffee_author() from public, anon, authenticated;
create trigger coffee_offer_notify_author after insert on public.coffee_offers
    for each row execute function public.notify_coffee_author();

create function public.send_coffee_offer(p_generation_id uuid, p_platform text, p_account text)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    post_author uuid;
    normalized_account text := btrim(p_account);
    existing_offer public.coffee_offers%rowtype;
    saved_comment public.feed_comments%rowtype;
    saved_coffee_count integer;
    new_vote_id uuid;
begin
    if actor_id is null then
        raise exception 'Please sign in to offer a coffee' using errcode = '42501';
    end if;
    if p_platform is null or p_platform not in ('ins', 'facebook', 'wechat')
        or normalized_account is null or char_length(normalized_account) not between 1 and 100
        or normalized_account ~ '[[:cntrl:]]' then
        raise exception 'Invalid social media account' using errcode = '22023';
    end if;
    select user_id into post_author from public.generations where id = p_generation_id;
    if not found then
        raise exception 'Post is unavailable' using errcode = '42501';
    end if;
    if post_author = actor_id then
        raise exception 'You cannot offer yourself a coffee' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || ':' || p_generation_id::text, 0));
    select * into existing_offer from public.coffee_offers where generation_id = p_generation_id and user_id = actor_id;
    if found then
        select * into saved_comment from public.feed_comments where id = existing_offer.comment_id;
        select coffee_count into saved_coffee_count from public.generations where id = p_generation_id;
        return pg_catalog.jsonb_build_object('comment', pg_catalog.to_jsonb(saved_comment), 'already_sent', true, 'coffee_count', saved_coffee_count);
    end if;

    insert into public.feed_comments (generation_id, content, author_name)
    values (p_generation_id, '☕ Coffee on Me — ' || p_platform || ': ' || normalized_account, 'Anonymous Morningsider')
    returning * into saved_comment;
    insert into public.votes (generation_id, user_id, vote_type)
    values (p_generation_id, actor_id, 'coffee') on conflict do nothing
    returning id into new_vote_id;
    if new_vote_id is not null then
        update public.generations set coffee_count = coalesce(coffee_count, 0) + 1
        where id = p_generation_id returning coffee_count into saved_coffee_count;
        if not found then
            raise exception 'Coffee count could not be saved' using errcode = '42501';
        end if;
    end if;
    insert into public.coffee_offers (generation_id, user_id, platform, account, comment_id)
    values (p_generation_id, actor_id, p_platform, normalized_account, saved_comment.id);
    select coffee_count into saved_coffee_count from public.generations where id = p_generation_id;
    return pg_catalog.jsonb_build_object('comment', pg_catalog.to_jsonb(saved_comment), 'already_sent', false, 'coffee_count', saved_coffee_count);
end;
$$;
revoke all on function public.send_coffee_offer(uuid, text, text) from public, anon;
grant execute on function public.send_coffee_offer(uuid, text, text) to authenticated;

create function public.mark_coffee_notification_read(p_notification_id uuid)
returns void
language sql security invoker set search_path = ''
as $$
    update public.coffee_notifications set read_at = coalesce(read_at, now())
    where id = p_notification_id and recipient_id = (select auth.uid());
$$;
revoke all on function public.mark_coffee_notification_read(uuid) from public, anon;
grant execute on function public.mark_coffee_notification_read(uuid) to authenticated;

commit;
