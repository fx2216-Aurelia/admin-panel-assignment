'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { DEFAULT_GENERATION_MODEL } from '@/lib/generation-models';

interface GenerationLog {
    id: string;
    prompt: string;
    output_text: string;
    created_at: string;
    stress_level: number | null;
    tone_type: string | null;
}

function getErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const { message } = error as { message?: unknown };
        if (typeof message === 'string' && message.trim()) return message;
    }
    if (error instanceof Error) return error.message;
    return String(error);
}

function getTextModel(outputText: string): string | null {
    try {
        const parsed: unknown = JSON.parse(outputText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
        const metadata = parsed as Record<string, unknown>;
        const candidates = [
            metadata.text_model,
            metadata.textModel,
            metadata.model_used,
            metadata.modelUsed,
            metadata.llm_model,
            metadata.model,
        ];
        return candidates.find(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
        )?.trim() ?? null;
    } catch {
        return null;
    }
}

const LOG_LIMIT = 100;

export default function LLMLogsViewer() {
    const [supabase] = useState(() => createClient());
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const { data, error } = await supabase
                .from('generations')
                .select('id, prompt, output_text, created_at, stress_level, tone_type')
                .order('created_at', { ascending: false })
                .limit(LOG_LIMIT);
            if (error) throw error;
            setLogs((data ?? []) as GenerationLog[]);
        } catch (error) {
            console.error('Could not load generation audit logs:', error);
            setErrorMessage(`Could not load generation audit logs: ${getErrorMessage(error)}`);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    return (
        <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="font-serif text-2xl font-semibold text-slate-800">LLM Generation Logs</h2>
                    <p className="mt-1 text-sm text-slate-600">Latest {LOG_LIMIT} generation inputs, context, responses, and timestamps.</p>
                </div>
                <button type="button" onClick={() => void load()} disabled={loading} className={buttonClass}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>
            {errorMessage && <p role="alert" className="mb-4 rounded-lg border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-3 text-sm text-[#9f4f59]">{errorMessage}</p>}
            <div className="overflow-x-auto rounded-2xl border border-[#d7ded6] bg-white shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">
                <table className="w-full min-w-[82rem] table-fixed text-left text-sm">
                    <thead className="border-b border-[#d4ded4] bg-[#ebf0eb] text-xs font-semibold uppercase tracking-wide text-[#3e5649]">
                        <tr>
                            <th scope="col" className="w-44 px-4 py-3">Timestamp</th>
                            <th scope="col" className="w-[25%] px-4 py-3">Prompt input</th>
                            <th scope="col" className="w-32 px-4 py-3">Stress level</th>
                            <th scope="col" className="w-40 px-4 py-3">Tone</th>
                            <th scope="col" className="w-44 px-4 py-3">Model</th>
                            <th scope="col" className="px-4 py-3">LLM response</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e9eee9]">
                        {loading ? (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading audit logs…</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No generation logs found.</td></tr>
                        ) : logs.map((log) => {
                            const modelUsed = getTextModel(log.output_text) || DEFAULT_GENERATION_MODEL;
                            return (
                            <tr key={log.id} className="align-top border-b border-[#e9eee9] transition-colors hover:bg-[#fafbfa]">
                                <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                                    <time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time>
                                </td>
                                <td className="px-4 py-4"><p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-slate-700">{log.prompt}</p></td>
                                <td className="px-4 py-4">
                                    {typeof log.stress_level === 'number' && Number.isFinite(log.stress_level) ? (
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                            log.stress_level >= 8
                                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                                : log.stress_level >= 4
                                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        }`}>
                                            <span aria-hidden="true">⚡</span>
                                            {log.stress_level}/10
                                        </span>
                                    ) : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-4 py-4">
                                    {log.tone_type === 'gentle' ? (
                                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                                            🌿 Gentle Stoic
                                        </span>
                                    ) : log.tone_type === 'roast' ? (
                                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                                            ☕ NYC Roasters
                                        </span>
                                    ) : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-4 py-4">
                                    <span className="inline-flex max-w-full break-all rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700">
                                        {modelUsed}
                                    </span>
                                </td>
                                <td className="px-4 py-4"><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-600">{log.output_text}</pre></td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

const buttonClass = 'rounded-lg bg-[#e2959c] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#d7828a] disabled:opacity-50';
