'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface GenerationLog {
    id: string;
    prompt: string;
    output_text: string;
    created_at: string;
}

const LOG_LIMIT = 100;

export default function LLMLogsViewer() {
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        const { data, error } = await supabase
            .from('generations')
            .select('id, prompt, output_text, created_at')
            .order('created_at', { ascending: false })
            .limit(LOG_LIMIT);
        if (error) {
            setErrorMessage(`Could not load generation audit logs: ${error.message}`);
        } else {
            setLogs((data ?? []) as GenerationLog[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    return (
        <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="font-serif text-2xl font-semibold text-slate-800">LLM Generation Logs</h2>
                    <p className="mt-1 text-sm text-slate-600">Latest {LOG_LIMIT} generation inputs, responses, and timestamps.</p>
                </div>
                <button type="button" onClick={() => void load()} disabled={loading} className={buttonClass}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>
            {errorMessage && <p role="alert" className="mb-4 rounded-lg border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-3 text-sm text-[#9f4f59]">{errorMessage}</p>}
            <div className="overflow-x-auto rounded-2xl border border-[#d7ded6] bg-white shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">
                <table className="w-full min-w-[52rem] text-left text-sm">
                    <thead className="border-b border-[#d4ded4] bg-[#ebf0eb] text-xs font-semibold uppercase tracking-wide text-[#3e5649]">
                        <tr>
                            <th scope="col" className="w-48 px-4 py-3">Timestamp</th>
                            <th scope="col" className="w-1/3 px-4 py-3">Prompt input</th>
                            <th scope="col" className="px-4 py-3">LLM response</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e9eee9]">
                        {loading ? (
                            <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-500">Loading audit logs…</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-500">No generation logs found.</td></tr>
                        ) : logs.map((log) => (
                            <tr key={log.id} className="align-top border-b border-[#e9eee9] transition-colors hover:bg-[#fafbfa]">
                                <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                                    <time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time>
                                </td>
                                <td className="px-4 py-4"><p className="max-h-40 overflow-auto whitespace-pre-wrap text-slate-700">{log.prompt}</p></td>
                                <td className="px-4 py-4"><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-600">{log.output_text}</pre></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

const buttonClass = 'rounded-lg bg-[#e2959c] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#d7828a] disabled:opacity-50';
