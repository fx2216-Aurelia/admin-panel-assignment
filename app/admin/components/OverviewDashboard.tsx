'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    DEFAULT_GENERATION_MODEL,
    GENERATION_MODELS,
    parseGenerationModelId,
    type GenerationModelId,
} from '@/lib/generation-models';

interface ActivityDay {
    label: string;
    reflections: number;
    reactions: number;
    comments: number;
}

type ActivityRange = 'week' | '30d' | 'all';

interface OverviewStats {
    totals: {
        users: number;
        reflections: number;
        reactions: number;
        comments: number;
    };
    activity: ActivityDay[];
    range: ActivityRange;
}

const activityRanges: { value: ActivityRange; label: string }[] = [
    { value: 'week', label: 'This Week' },
    { value: '30d', label: 'Past 30 Days' },
    { value: 'all', label: 'All Time' },
];

interface OverviewMetric {
    label: string;
    key: keyof OverviewStats['totals'];
    icon: 'users' | 'reflections' | 'reactions' | 'comments';
    iconClass: string;
}

const metrics: OverviewMetric[] = [
    { label: 'Users', key: 'users', icon: 'users', iconClass: 'bg-[#fcebed] text-[#b4656f]' },
    { label: 'Total Reflections', key: 'reflections', icon: 'reflections', iconClass: 'bg-[#fff2df] text-[#b97737]' },
    { label: 'Reactions', key: 'reactions', icon: 'reactions', iconClass: 'bg-[#edf4ee] text-[#547c60]' },
    { label: 'Comments', key: 'comments', icon: 'comments', iconClass: 'bg-[#f2effa] text-[#76669a]' },
];

function MetricIcon({ type }: { type: OverviewMetric['icon'] }) {
    const shared = {
        fill: 'none',
        stroke: 'currentColor',
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        strokeWidth: 1.8,
    };

    switch (type) {
        case 'users':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" {...shared}>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19H3.5Z" />
                    <path d="M16 5.3a3 3 0 0 1 0 5.7M17 13.4a4.8 4.8 0 0 1 3.5 4.6v1h-3" />
                </svg>
            );
        case 'reflections':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" {...shared}>
                    <path d="M13.2 2.8c.5 3.1-2.8 4.4-1.6 7.1.5 1.1 1.7 1.5 2.2 2.7.7-1 1.1-2.1.8-3.4 2.3 1.4 3.6 3.4 3.6 5.6a6.2 6.2 0 0 1-12.4 0c0-2.3 1.2-4.1 3-5.8-.1 2 .3 2.8 1.3 3.3-.6-3.6 1.6-5.6 3.1-9.5Z" />
                </svg>
            );
        case 'reactions':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" {...shared}>
                    <circle cx="18" cy="5" r="2.5" />
                    <circle cx="6" cy="12" r="2.5" />
                    <circle cx="18" cy="19" r="2.5" />
                    <path d="m8.2 10.8 7.6-4.5m-7.6 8.9 7.6 4.5" />
                </svg>
            );
        case 'comments':
            return (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" {...shared}>
                    <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.8-3.1A7.5 7.5 0 1 1 20 11.5Z" />
                    <path d="M8.5 11.5h7m-7 3h4" />
                </svg>
            );
    }
}

export default function OverviewDashboard() {
    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [range, setRange] = useState<ActivityRange>('week');
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [activeModel, setActiveModel] = useState<GenerationModelId | null>(null);
    const [modelError, setModelError] = useState<string | null>(null);

    const requestStats = useCallback(async () => {
        const response = await fetch(`/api/admin/overview-stats?range=${range}`, { cache: 'no-store' });
        const result: OverviewStats | { error?: string } = await response.json();
        if (!response.ok) {
            throw new Error('error' in result && result.error
                ? result.error
                : 'Overview statistics could not be loaded.');
        }
        if (!('totals' in result) || !Array.isArray(result.activity)) {
            throw new Error('Overview statistics returned an invalid response.');
        }
        return result;
    }, [range]);

    useEffect(() => {
        let active = true;
        requestStats()
            .then((result) => {
                if (!active) return;
                setStats(result);
                setErrorMessage(null);
                setLoading(false);
            })
            .catch((error: unknown) => {
                if (!active) return;
                console.error('Could not fetch admin overview stats:', error);
                setErrorMessage(error instanceof Error ? error.message : 'Overview statistics could not be loaded.');
                setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [requestStats]);

    useEffect(() => {
        let active = true;
        fetch('/api/admin/generation-model', { cache: 'no-store' })
            .then(async (response) => {
                const result: { model?: unknown; error?: string } = await response.json();
                if (!response.ok) throw new Error(result.error || 'Could not load active generation model.');
                const model = parseGenerationModelId(result.model);
                if (!model) throw new Error('Active generation model response was invalid.');
                if (active) {
                    setActiveModel(model);
                    setModelError(null);
                }
            })
            .catch((error: unknown) => {
                console.error('Could not load active generation model for overview:', error);
                if (active) {
                    setActiveModel(null);
                    setModelError(error instanceof Error ? error.message : 'Could not load active generation model.');
                }
            });
        return () => {
            active = false;
        };
    }, []);

    const loadStats = async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            setStats(await requestStats());
        } catch (error) {
            console.error('Could not fetch admin overview stats:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Overview statistics could not be loaded.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section aria-labelledby="overview-heading" className="space-y-7">
            <header>
                <h2 id="overview-heading" className="font-serif text-2xl font-semibold text-slate-800">
                    Overview
                </h2>
                <p className="mt-1 text-sm text-slate-600">Key stats and activity at a glance.</p>
                <p className="mt-1 text-xs text-slate-500">Counts are read directly from the database.</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    Active generation model
                    {activeModel ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-700">
                            {GENERATION_MODELS.find((model) => model.id === activeModel)?.label ?? DEFAULT_GENERATION_MODEL}
                            {' · '}{activeModel}
                        </span>
                    ) : modelError ? (
                        <span role="status" className="text-xs text-[#9f4f59]">{modelError}</span>
                    ) : (
                        <span className="inline-block h-5 w-36 animate-pulse rounded bg-stone-100" />
                    )}
                </p>
            </header>

            {errorMessage && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-3 text-sm text-[#9f4f59]">
                    <span>{errorMessage}</span>
                    <button
                        type="button"
                        onClick={() => void loadStats()}
                        disabled={loading}
                        className="rounded-lg border border-[#e6bfc4] bg-white px-3 py-1.5 font-semibold text-[#9f4f59] hover:bg-[#fff8f8] disabled:opacity-60"
                    >
                        Retry
                    </button>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                    <article
                        key={metric.label}
                        className="rounded-2xl border border-[#e7e1dc] bg-white p-5 shadow-[0_4px_20px_-8px_rgba(80,60,55,0.12)]"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-medium text-slate-500">{metric.label}</h3>
                                <p className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-800" aria-live="polite">
                                    {loading && !stats
                                        ? <span className="inline-block h-9 w-24 animate-pulse rounded bg-stone-100" />
                                        : (stats?.totals[metric.key] ?? '—').toLocaleString()}
                                </p>
                            </div>
                            <span className={`inline-flex size-10 items-center justify-center rounded-xl ${metric.iconClass}`}>
                                <MetricIcon type={metric.icon} />
                            </span>
                        </div>
                    </article>
                ))}
            </div>

            <section
                aria-labelledby="weekly-activity-heading"
                className="rounded-2xl border border-[#e7e1dc] bg-white p-5 shadow-[0_4px_20px_-8px_rgba(80,60,55,0.12)] sm:p-6"
            >
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 id="weekly-activity-heading" className="font-serif text-xl font-semibold text-slate-800">
                            {range === 'week' ? 'Weekly Activity Summary' : range === '30d' ? 'Past 30 Days Activity' : 'All-Time Activity'}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                            {range === 'week'
                                ? 'Daily reflections, reactions, and comments from Sunday through Saturday.'
                                : range === '30d'
                                    ? 'Daily reflections, reactions, and comments over the past 30 days.'
                                    : 'Monthly reflections, reactions, and comments across all recorded history.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Activity chart time range">
                        {activityRanges.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={range === option.value}
                                onClick={() => {
                                    if (range === option.value) return;
                                    setLoading(true);
                                    setRange(option.value);
                                }}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                    range === option.value
                                        ? 'border-[#c87982] bg-[#fbf0f1] text-[#9f4f59]'
                                        : 'border-[#e7e1dc] bg-white text-slate-600 hover:bg-[#fbf7f3]'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={`h-72 w-full transition-opacity ${loading ? 'opacity-50' : ''}`} role="img" aria-label={`${range === 'week' ? 'Weekly' : range === '30d' ? 'Past 30 days' : 'All-time'} activity bar chart`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats?.activity ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={5}>
                            <CartesianGrid stroke="#eee9e4" strokeDasharray="4 4" vertical={false} />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#78716c', fontSize: 12 }}
                                dy={8}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#a8a29e', fontSize: 11 }}
                                allowDecimals={false}
                            />
                            <Tooltip
                                cursor={{ fill: '#fbf7f3' }}
                                contentStyle={{
                                    border: '1px solid #e7e1dc',
                                    borderRadius: 12,
                                    boxShadow: '0 8px 24px rgba(80,60,55,0.10)',
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />
                            <Bar dataKey="reflections" name="Reflections" fill="#d7828a" radius={[5, 5, 0, 0]} />
                            <Bar dataKey="reactions" name="Reactions" fill="#8caf96" radius={[5, 5, 0, 0]} />
                            <Bar dataKey="comments" name="Comments" fill="#e7b66b" radius={[5, 5, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {!loading && !errorMessage && stats?.activity.every(
                    (activity) => activity.reflections === 0 && activity.reactions === 0 && activity.comments === 0,
                ) && (
                    <p className="mt-3 text-center text-sm text-slate-500">No activity recorded for this time range.</p>
                )}
            </section>
        </section>
    );
}
