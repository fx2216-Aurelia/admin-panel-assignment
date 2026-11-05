alter table public.feed_comments
    add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists feed_comments_user_generation_created_idx
    on public.feed_comments (user_id, generation_id, created_at desc);

drop policy if exists feed_comments_read_all on public.feed_comments;
create policy feed_comments_read_all
    on public.feed_comments
    for select
    to anon, authenticated
    using (true);

drop policy if exists feed_comments_insert_own on public.feed_comments;
create policy feed_comments_insert_own
    on public.feed_comments
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists feed_comments_delete_own on public.feed_comments;
create policy feed_comments_delete_own
    on public.feed_comments
    for delete
    to authenticated
    using (auth.uid() = user_id);
