'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface AccessEntry {
    id: string;
    domain?: string;
    email?: string;
}

export default function AccessControlManager() {
    const [domains, setDomains] = useState<AccessEntry[]>([]);
    const [emails, setEmails] = useState<AccessEntry[]>([]);
    const [domain, setDomain] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        const [domainResult, emailResult] = await Promise.all([
            supabase.from('allowed_signup_domains').select('*').order('domain'),
            supabase.from('whitelisted_emails').select('*').order('email'),
        ]);
        if (domainResult.error || emailResult.error) {
            const error = domainResult.error ?? emailResult.error;
            setErrorMessage(`Could not load access rules: ${error?.message ?? 'Unknown Supabase error'}`);
        } else {
            setDomains((domainResult.data ?? []) as AccessEntry[]);
            setEmails((emailResult.data ?? []) as AccessEntry[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    const addEntry = async (event: FormEvent<HTMLFormElement>, type: 'domain' | 'email') => {
        event.preventDefault();
        const value = (type === 'domain' ? domain : email).trim().toLowerCase();
        if (!value) return;
        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        const result = type === 'domain'
            ? await supabase.from('allowed_signup_domains').insert({ domain: value })
            : await supabase.from('whitelisted_emails').insert({ email: value });
        const { error } = result;
        if (error) {
            setErrorMessage(`Could not add ${type}: ${error.message}`);
        } else {
            if (type === 'domain') setDomain('');
            else setEmail('');
            setNotice(`${type === 'domain' ? 'Signup domain' : 'Email'} added.`);
            await load();
        }
        setBusy(false);
    };

    const deleteEntry = async (entry: AccessEntry, type: 'domain' | 'email') => {
        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        const table = type === 'domain' ? 'allowed_signup_domains' : 'whitelisted_emails';
        const { error } = await supabase.from(table).delete().eq('id', entry.id);
        if (error) {
            setErrorMessage(`Could not delete ${type}: ${error.message}`);
        } else {
            setNotice(`${type === 'domain' ? 'Signup domain' : 'Email'} removed.`);
            await load();
        }
        setBusy(false);
    };

    return (
        <section>
            <Heading title="Access Control" description="Control which email domains and individual addresses can sign up." />
            <Feedback error={errorMessage} notice={notice} />
            {loading ? <Loading /> : (
                <div className="grid gap-6 lg:grid-cols-2">
                    <EntryPanel
                        title="Allowed signup domains"
                        placeholder="columbia.edu"
                        inputType="text"
                        value={domain}
                        onChange={setDomain}
                        onSubmit={(event) => void addEntry(event, 'domain')}
                        entries={domains}
                        entryLabel="domain"
                        onDelete={(entry) => void deleteEntry(entry, 'domain')}
                        disabled={busy}
                    />
                    <EntryPanel
                        title="Whitelisted emails"
                        placeholder="student@columbia.edu"
                        inputType="email"
                        value={email}
                        onChange={setEmail}
                        onSubmit={(event) => void addEntry(event, 'email')}
                        entries={emails}
                        entryLabel="email"
                        onDelete={(entry) => void deleteEntry(entry, 'email')}
                        disabled={busy}
                    />
                </div>
            )}
        </section>
    );
}

function EntryPanel(props: {
    title: string;
    placeholder: string;
    inputType: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    entries: AccessEntry[];
    entryLabel: 'domain' | 'email';
    onDelete: (entry: AccessEntry) => void;
    disabled: boolean;
}) {
    return (
        <article className={panelClass}>
            <h3 className="mb-4 font-semibold text-slate-800">{props.title}</h3>
            <form onSubmit={props.onSubmit} className="mb-4 flex gap-2">
                <input
                    type={props.inputType}
                    value={props.value}
                    onChange={(event) => props.onChange(event.target.value)}
                    placeholder={props.placeholder}
                    required
                    className={inputClass}
                />
                <button type="submit" disabled={props.disabled} className={buttonClass}>Add</button>
            </form>
            <ul className="divide-y divide-[#e9eee9]">
                {props.entries.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 border-b border-[#e9eee9] py-3 text-sm text-slate-700 transition-colors hover:bg-[#fafbfa]">
                        <span>{entry[props.entryLabel] ?? '—'}</span>
                        <button type="button" disabled={props.disabled} onClick={() => props.onDelete(entry)} className={dangerButtonClass}>
                            Delete
                        </button>
                    </li>
                ))}
                {props.entries.length === 0 && <li className="py-3 text-sm text-slate-400">No entries configured.</li>}
            </ul>
        </article>
    );
}

const panelClass = 'rounded-2xl border border-[#d7ded6] bg-white p-5 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]';
const inputClass = 'min-w-0 flex-1 rounded-lg border border-[#cfd7cf] bg-[#fcfdfc] px-3 py-2 text-sm text-[#2c3e35] placeholder:text-[#9ea8a0] focus:border-[#6b8f78] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6b8f78]/20';
const buttonClass = 'rounded-lg bg-[#e2959c] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#d7828a] disabled:opacity-50';
const dangerButtonClass = 'rounded-lg border border-transparent bg-[#fdf0f0] px-3 py-1.5 text-xs font-semibold text-[#b45353] hover:bg-[#fae2e2] disabled:opacity-50';

function Heading({ title, description }: { title: string; description: string }) {
    return <div className="mb-5"><h2 className="font-serif text-2xl font-semibold text-slate-800">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>;
}
function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
    return <>{error && <p role="alert" className="mb-4 rounded-lg border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-3 text-sm text-[#9f4f59]">{error}</p>}{notice && <p role="status" className="mb-4 rounded-lg border border-[#e8ede9] bg-[#f4f7f4] px-4 py-3 text-sm text-[#385e49]">{notice}</p>}</>;
}
function Loading() {
    return <p className="rounded-xl border border-[#d7ded6] bg-white p-6 text-sm text-slate-500 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">Loading access rules…</p>;
}
