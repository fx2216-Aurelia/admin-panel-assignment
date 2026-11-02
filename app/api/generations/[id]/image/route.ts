import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new NextResponse(null, { status: 400, headers });
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return new NextResponse(null, { status: 401, headers });
        const { data, error } = await supabase.from('generations').select('output_text').eq('id', id).single();
        if (error || !data) return new NextResponse(null, { status: 404, headers });
        const content = JSON.parse(data.output_text);
        const image = content.image_url;
        if (typeof image !== 'string') return new NextResponse(null, { status: 404, headers });
        const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
        if (match && image.length < 4_000_000) {
            return new NextResponse(new Uint8Array(Buffer.from(match[2], 'base64')), { headers: { ...headers, 'Content-Type': `image/${match[1]}` } });
        }
        if (image.startsWith('data:image/svg+xml,') && content.image_source !== 'user_photo_lion') {
            return new NextResponse(decodeURIComponent(image.slice('data:image/svg+xml,'.length)), { headers: { ...headers, 'Content-Type': 'image/svg+xml', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
        }
        const remote = new URL(image);
        if (remote.protocol !== 'https:' || remote.hostname !== 'image.pollinations.ai' || content.image_source === 'user_photo_lion') return new NextResponse(null, { status: 404, headers });
        const proxy = new URL('/api/proxy-image', request.url);
        proxy.searchParams.set('url', remote.href);
        return NextResponse.redirect(proxy, { status: 307, headers });
    } catch {
        return new NextResponse(null, { status: 503, headers });
    }
}
