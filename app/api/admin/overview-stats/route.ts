import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

type CountTable = 'profiles' | 'generations' | 'votes' | 'feed_comments';
type ActivityRange = 'week' | '30d' | 'all';

interface ActivityDay {
    label: string;
    reflections: number;
    reactions: number;
    comments: number;
}

async function countRows(
    supabase: Awaited<ReturnType<typeof createClient>>,
    table: CountTable,
    start?: string,
    end?: string,
): Promise<number> {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lt('created_at', end);

    const { count, error } = await query;
    if (error) throw new Error(`Could not count ${table}: ${error.message}`);
    return count ?? 0;
}

async function getOldestActivityDate(
    supabase: Awaited<ReturnType<typeof createClient>>,
    table: Exclude<CountTable, 'profiles'>,
): Promise<Date | null> {
    const { data, error } = await supabase
        .from(table)
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`Could not find earliest ${table} activity: ${error.message}`);
    return data?.created_at ? new Date(data.created_at) : null;
}

function utcDayStart(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getActivityBuckets(range: ActivityRange, now: Date) {
    const buckets: { label: string; start: Date; end: Date }[] = [];
    const today = utcDayStart(now);

    if (range === 'week') {
        const weekStart = new Date(today);
        weekStart.setUTCDate(today.getUTCDate() - today.getUTCDay());
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let index = 0; index < 7; index += 1) {
            const start = new Date(weekStart);
            start.setUTCDate(weekStart.getUTCDate() + index);
            const end = new Date(start);
            end.setUTCDate(start.getUTCDate() + 1);
            buckets.push({ label: days[index], start, end });
        }
        return buckets;
    }

    if (range === '30d') {
        const firstDay = new Date(today);
        firstDay.setUTCDate(today.getUTCDate() - 29);
        for (let index = 0; index < 30; index += 1) {
            const start = new Date(firstDay);
            start.setUTCDate(firstDay.getUTCDate() + index);
            const end = new Date(start);
            end.setUTCDate(start.getUTCDate() + 1);
            buckets.push({
                label: start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }),
                start,
                end,
            });
        }
        return buckets;
    }

    return buckets;
}

async function buildActivity(
    supabase: Awaited<ReturnType<typeof createClient>>,
    range: ActivityRange,
    now: Date,
): Promise<ActivityDay[]> {
    const buckets = getActivityBuckets(range, now);
    if (range === 'all') {
        const oldestDates = await Promise.all(
            (['generations', 'votes', 'feed_comments'] as const).map((table) =>
                getOldestActivityDate(supabase, table),
            ),
        );
        const firstActivity = oldestDates
            .filter((date): date is Date => date !== null)
            .reduce<Date | null>((earliest, date) =>
                !earliest || date < earliest ? date : earliest, null);
        const firstMonth = firstActivity
            ? new Date(Date.UTC(firstActivity.getUTCFullYear(), firstActivity.getUTCMonth(), 1))
            : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

        for (const start = firstMonth; start <= currentMonth; start.setUTCMonth(start.getUTCMonth() + 1)) {
            const bucketStart = new Date(start);
            const end = new Date(bucketStart);
            end.setUTCMonth(bucketStart.getUTCMonth() + 1);
            buckets.push({
                label: bucketStart.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: '2-digit' }),
                start: bucketStart,
                end,
            });
        }
    }

    return Promise.all(buckets.map(async ({ label, start, end }) => {
        const [reflections, reactions, comments] = await Promise.all([
            countRows(supabase, 'generations', start.toISOString(), end.toISOString()),
            countRows(supabase, 'votes', start.toISOString(), end.toISOString()),
            countRows(supabase, 'feed_comments', start.toISOString(), end.toISOString()),
        ]);
        return { label, reflections, reactions, comments };
    }));
}

export async function GET(request: Request) {
    try {
        const requestedRange = new URL(request.url).searchParams.get('range') ?? 'week';
        if (requestedRange !== 'week' && requestedRange !== '30d' && requestedRange !== 'all') {
            return NextResponse.json({ error: 'Invalid activity range.' }, { status: 400 });
        }
        const range: ActivityRange = requestedRange;

        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('is_superadmin')
            .eq('id', user.id)
            .single();
        if (profileError) {
            console.error('Could not verify overview stats access:', profileError);
            return NextResponse.json({ error: 'Could not verify administrator access.' }, { status: 500 });
        }
        if (!profile?.is_superadmin) {
            return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
        }

        const [users, reflections, reactions, comments, activity] = await Promise.all([
            countRows(supabase, 'profiles'),
            countRows(supabase, 'generations'),
            countRows(supabase, 'votes'),
            countRows(supabase, 'feed_comments'),
            buildActivity(supabase, range, new Date()),
        ]);

        return NextResponse.json(
            {
                totals: { users, reflections, reactions, comments },
                activity,
                range,
            },
            { headers: { 'Cache-Control': 'private, no-store' } },
        );
    } catch (error) {
        console.error('Could not load admin overview stats:', error);
        return NextResponse.json({ error: 'Could not load overview statistics.' }, { status: 500 });
    }
}
