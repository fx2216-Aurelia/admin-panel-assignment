'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Term {
    id: string;
    term: string;
    definition: string;
}

interface AIExample {
    id: string;
    title: string;
    input_text: string;
    expected_output: string;
}

export default function TermsAndExamples() {
    const [terms, setTerms] = useState<Term[]>([]);
    const [examples, setExamples] = useState<AIExample[]>([]);
    const [term, setTerm] = useState('');
    const [definition, setDefinition] = useState('');
    const [exampleTitle, setExampleTitle] = useState('');
    const [inputText, setInputText] = useState('');
    const [expectedOutput, setExpectedOutput] = useState('');
    const [editingTerm, setEditingTerm] = useState<Term | null>(null);
    const [editingExample, setEditingExample] = useState<AIExample | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        const [termResult, exampleResult] = await Promise.all([
            supabase.from('terms').select('*').order('term'),
            supabase.from('ai_examples').select('*').order('title'),
        ]);
        if (termResult.error || exampleResult.error) {
            const error = termResult.error ?? exampleResult.error;
            setErrorMessage(`Could not load terms and examples: ${error?.message ?? 'Unknown Supabase error'}`);
        } else {
            setTerms((termResult.data ?? []) as Term[]);
            setExamples((exampleResult.data ?? []) as AIExample[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    const saveTerm = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        const query = editingTerm
            ? supabase.from('terms').update({ term: term.trim(), definition: definition.trim() }).eq('id', editingTerm.id)
            : supabase.from('terms').insert({ term: term.trim(), definition: definition.trim() });
        const { error } = await query;
        if (error) setErrorMessage(`Could not save term: ${error.message}`);
        else {
            setTerm('');
            setDefinition('');
            setEditingTerm(null);
            setNotice(editingTerm ? 'Term updated.' : 'Term added.');
            await load();
        }
        setBusy(false);
    };

    const saveExample = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        const values = { title: exampleTitle.trim(), input_text: inputText.trim(), expected_output: expectedOutput.trim() };
        const query = editingExample
            ? supabase.from('ai_examples').update(values).eq('id', editingExample.id)
            : supabase.from('ai_examples').insert(values);
        const { error } = await query;
        if (error) setErrorMessage(`Could not save AI example: ${error.message}`);
        else {
            setExampleTitle('');
            setInputText('');
            setExpectedOutput('');
            setEditingExample(null);
            setNotice(editingExample ? 'AI example updated.' : 'AI example added.');
            await load();
        }
        setBusy(false);
    };

    const deleteRecord = async (table: 'terms' | 'ai_examples', id: string) => {
        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) setErrorMessage(`Could not delete record: ${error.message}`);
        else {
            setNotice(table === 'terms' ? 'Term deleted.' : 'AI example deleted.');
            await load();
        }
        setBusy(false);
    };

    return (
        <section>
            <Heading title="Terms & AI Examples" description="Maintain the shared vocabulary and reference examples used by the assistant." />
            <Feedback error={errorMessage} notice={notice} />
            {loading ? <Loading /> : (
                <div className="grid gap-6 xl:grid-cols-2">
                    <article className={panelClass}>
                        <h3 className="mb-4 font-semibold text-slate-800">{editingTerm ? 'Edit term' : 'Add term'}</h3>
                        <form onSubmit={(event) => void saveTerm(event)} className="mb-5 space-y-3">
                            <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Term" required className={inputClass} />
                            <textarea value={definition} onChange={(event) => setDefinition(event.target.value)} placeholder="Definition" required rows={3} className={inputClass} />
                            <div className="flex gap-2">
                                <button type="submit" disabled={busy} className={buttonClass}>{editingTerm ? 'Update term' : 'Add term'}</button>
                                {editingTerm && <button type="button" onClick={() => { setEditingTerm(null); setTerm(''); setDefinition(''); }} className={secondaryButtonClass}>Cancel</button>}
                            </div>
                        </form>
                        <ul className="divide-y divide-[#e9eee9]">
                            {terms.map((item) => (
                                <li key={item.id} className="flex items-start justify-between gap-3 border-b border-[#e9eee9] py-3 transition-colors hover:bg-[#fafbfa]">
                                    <div><p className="font-medium text-slate-800">{item.term}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.definition}</p></div>
                                    <div className="flex shrink-0 gap-2">
                                        <button type="button" onClick={() => { setEditingTerm(item); setTerm(item.term); setDefinition(item.definition); }} className={secondaryButtonClass}>Edit</button>
                                        <button type="button" disabled={busy} onClick={() => void deleteRecord('terms', item.id)} className={dangerButtonClass}>Delete</button>
                                    </div>
                                </li>
                            ))}
                            {terms.length === 0 && <li className="py-3 text-sm text-slate-400">No terms configured.</li>}
                        </ul>
                    </article>

                    <article className={panelClass}>
                        <h3 className="mb-4 font-semibold text-slate-800">{editingExample ? 'Edit AI example' : 'Add AI example'}</h3>
                        <form onSubmit={(event) => void saveExample(event)} className="mb-5 space-y-3">
                            <input value={exampleTitle} onChange={(event) => setExampleTitle(event.target.value)} placeholder="Title" required className={inputClass} />
                            <textarea value={inputText} onChange={(event) => setInputText(event.target.value)} placeholder="Input text" required rows={3} className={inputClass} />
                            <textarea value={expectedOutput} onChange={(event) => setExpectedOutput(event.target.value)} placeholder="Expected output" required rows={3} className={inputClass} />
                            <div className="flex gap-2">
                                <button type="submit" disabled={busy} className={buttonClass}>{editingExample ? 'Update example' : 'Add example'}</button>
                                {editingExample && <button type="button" onClick={() => { setEditingExample(null); setExampleTitle(''); setInputText(''); setExpectedOutput(''); }} className={secondaryButtonClass}>Cancel</button>}
                            </div>
                        </form>
                        <ul className="divide-y divide-[#e9eee9]">
                            {examples.map((item) => (
                                <li key={item.id} className="border-b border-[#e9eee9] py-3 transition-colors hover:bg-[#fafbfa]">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="font-medium text-slate-800">{item.title}</p>
                                        <div className="flex shrink-0 gap-2">
                                            <button type="button" onClick={() => { setEditingExample(item); setExampleTitle(item.title); setInputText(item.input_text); setExpectedOutput(item.expected_output); }} className={secondaryButtonClass}>Edit</button>
                                            <button type="button" disabled={busy} onClick={() => void deleteRecord('ai_examples', item.id)} className={dangerButtonClass}>Delete</button>
                                        </div>
                                    </div>
                                    <p className="mt-2 line-clamp-3 text-xs text-slate-600"><span className="text-slate-500">Input:</span> {item.input_text}</p>
                                    <p className="mt-1 line-clamp-3 text-xs text-slate-600"><span className="text-slate-500">Expected:</span> {item.expected_output}</p>
                                </li>
                            ))}
                            {examples.length === 0 && <li className="py-3 text-sm text-slate-400">No AI examples configured.</li>}
                        </ul>
                    </article>
                </div>
            )}
        </section>
    );
}

const panelClass = 'rounded-2xl border border-[#d7ded6] bg-white p-5 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]';
const inputClass = 'w-full rounded-lg border border-[#cfd7cf] bg-[#fcfdfc] px-3 py-2 text-sm text-[#2c3e35] placeholder:text-[#9ea8a0] focus:border-[#6b8f78] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6b8f78]/20';
const buttonClass = 'rounded-lg bg-[#e2959c] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#d7828a] disabled:opacity-50';
const secondaryButtonClass = 'rounded-lg bg-[#edf4f0] px-3 py-1.5 text-xs font-semibold text-[#3d614e] hover:bg-[#dfece3]';
const dangerButtonClass = 'rounded-lg border border-transparent bg-[#fdf0f0] px-3 py-1.5 text-xs font-semibold text-[#b45353] hover:bg-[#fae2e2] disabled:opacity-50';
function Heading({ title, description }: { title: string; description: string }) {
    return <div className="mb-5"><h2 className="font-serif text-2xl font-semibold text-slate-800">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>;
}
function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
    return <>{error && <p role="alert" className="mb-4 rounded-lg border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-3 text-sm text-[#9f4f59]">{error}</p>}{notice && <p role="status" className="mb-4 rounded-lg border border-[#e8ede9] bg-[#f4f7f4] px-4 py-3 text-sm text-[#385e49]">{notice}</p>}</>;
}
function Loading() {
    return <p className="rounded-xl border border-[#d7ded6] bg-white p-6 text-sm text-slate-500 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">Loading terms and examples…</p>;
}
