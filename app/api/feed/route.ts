import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const offset = Number(params.get('offset') ?? '0');
    const tab = params.get('tab') ?? 'explore';
    const sort = params.get('sort') ?? 'latest';
    const commentedIds = (params.get('commented') || '').split(',').filter(Boolean);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000 || !['explore', 'mine', 'interacted'].includes(tab) || !['latest', 'highest-stress'].includes(sort) || commentedIds.length > 200 || commentedIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        return NextResponse.json({ error: 'Invalid feed page.' }, { status: 400, headers });
    }
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Sign in to view the feed.' }, { status: 401, headers });
        const { data, error } = await supabase.rpc('photo_lion_feed', { page_offset: offset, page_size: 11, feed_tab: tab, feed_sort: sort, commented_ids: commentedIds });
        if (error) return NextResponse.json({ error: 'Feed pagination is unavailable. The owner must verify the local feed migration and database configuration.' }, { status: 503, headers });
        const posts = Array.isArray(data) ? data : [];
        return NextResponse.json({ posts: posts.slice(0, 10), nextOffset: posts.length > 10 ? offset + 10 : null }, { headers });
    } catch {
        return NextResponse.json({ error: 'Feed configuration is unavailable.' }, { status: 503, headers });
    }
}
