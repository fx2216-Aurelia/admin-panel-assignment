'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Provider {
    id: string;
    name: string;
    base_url: string;
}

interface Model {
    id: string;
    provider_id: string;
    model_name: string;
    model_identifier: string;
    supports_temperature: boolean;
}

export default function LLMManager() {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [models, setModels] = useState<Model[]>([]);
    const [name, setName] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [providerId, setProviderId] = useState('');
    const [modelName, setModelName] = useState('');
    const [modelIdentifier, setModelIdentifier] = useState('');
    const [supportsTemperature, setSupportsTemperature] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        const [providerResult, modelResult] = await Promise.all([
            supabase.from('llm_providers').select('*').order('name'),
            supabase.from('llm_models').select('*').order('model_name'),
        ]);
        if (providerResult.error || modelResult.error) {
            const error = providerResult.error ?? modelResult.error;
            setErrorMessage(`Could not load LLM configuration: ${error?.message ?? 'Unknown Supabase error'}`);
        } else {
            const nextProviders = (providerResult.data ?? []) as Provider[];
            setProviders(nextProviders);
            setModels((modelResult.data ?? []) as Model[]);
            setProviderId((current) => current || nextProviders[0]?.id || '');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    const addProvider = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        const { error } = await supabase.from('llm_providers').insert({ name: name.trim(), base_url: baseUrl.trim() });
        if (error) setErrorMessage(`Could not add provider: ${error.message}`);
        else {
            setName('');
            setBaseUrl('');
            setNotice('Provider added.');
            await load();
        }
        setBusy(false);
    };

    const addModel = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        const { error } = await supabase.from('llm_models').insert({
            provider_id: providerId,
            model_name: modelName.trim(),
            model_identifier: modelIdentifier.trim(),
            supports_temperature: supportsTemperature,
        });
        if (error) setErrorMessage(`Could not add model: ${error.message}`);
        else {
            setModelName('');
            setModelIdentifier('');
            setSupportsTemperature(false);
            setNotice('Model added.');
            await load();
        }
        setBusy(false);
    };

    const deleteProvider = async (provider: Provider) => {
        if (!window.confirm(`Delete provider "${provider.name}"?`)) return;
        setBusy(true);
        setErrorMessage(null);
        const { error } = await supabase.from('llm_providers').delete().eq('id', provider.id);
        if (error) setErrorMessage(`Could not delete provider: ${error.message}`);
        else {
            setNotice('Provider deleted.');
            await load();
        }
        setBusy(false);
    };

    const deleteModel = async (model: Model) => {
        setBusy(true);
        setErrorMessage(null);
        const { error } = await supabase.from('llm_models').delete().eq('id', model.id);
        if (error) setErrorMessage(`Could not delete model: ${error.message}`);
        else {
            setNotice('Model deleted.');
            await load();
        }
        setBusy(false);
    };

    return (
        <section>
            <Heading title="LLM Providers & Models" description="Configure model providers, endpoints, and supported capabilities." />
            <Feedback error={errorMessage} notice={notice} />
            {loading ? <Loading /> : (
                <div className="grid gap-6 xl:grid-cols-2">
                    <article className={panelClass}>
                        <h3 className="mb-4 font-semibold text-slate-800">Providers</h3>
                        <form onSubmit={(event) => void addProvider(event)} className="mb-5 grid gap-3 sm:grid-cols-2">
                            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Provider name" required className={inputClass} />
                            <input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" required className={inputClass} />
                            <button type="submit" disabled={busy} className={`${buttonClass} sm:col-span-2`}>Add provider</button>
                        </form>
                        <ul className="divide-y divide-[#e9eee9]">
                            {providers.map((provider) => (
                                <li key={provider.id} className="flex items-start justify-between gap-3 border-b border-[#e9eee9] py-3 transition-colors hover:bg-[#fafbfa]">
                                    <div><p className="font-medium text-slate-800">{provider.name}</p><p className="mt-1 break-all text-xs text-slate-400">{provider.base_url}</p></div>
                                    <button type="button" disabled={busy} onClick={() => void deleteProvider(provider)} className={dangerButtonClass}>Delete</button>
                                </li>
                            ))}
                            {providers.length === 0 && <li className="py-3 text-sm text-slate-400">No providers configured.</li>}
                        </ul>
                    </article>

                    <article className={panelClass}>
                        <h3 className="mb-4 font-semibold text-slate-800">Models</h3>
                        <form onSubmit={(event) => void addModel(event)} className="mb-5 grid gap-3">
                            <select value={providerId} onChange={(event) => setProviderId(event.target.value)} required disabled={providers.length === 0} className={inputClass}>
                                <option value="">Select provider</option>
                                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                            </select>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="Model name" required className={inputClass} />
                                <input value={modelIdentifier} onChange={(event) => setModelIdentifier(event.target.value)} placeholder="Model identifier" required className={inputClass} />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                <input type="checkbox" checked={supportsTemperature} onChange={(event) => setSupportsTemperature(event.target.checked)} className="size-4 accent-[#5b8a70]" />
                                Supports temperature
                            </label>
                            <button type="submit" disabled={busy || providers.length === 0} className={buttonClass}>Add model</button>
                        </form>
                        <ul className="divide-y divide-[#e9eee9]">
                            {models.map((model) => (
                                <li key={model.id} className="flex items-start justify-between gap-3 border-b border-[#e9eee9] py-3 transition-colors hover:bg-[#fafbfa]">
                                    <div><p className="font-medium text-slate-800">{model.model_name} <span className="font-normal text-slate-500">({model.model_identifier})</span></p><p className="mt-1 text-xs text-slate-500">{providers.find((provider) => provider.id === model.provider_id)?.name ?? 'Unknown provider'} · Temperature {model.supports_temperature ? 'supported' : 'not supported'}</p></div>
                                    <button type="button" disabled={busy} onClick={() => void deleteModel(model)} className={dangerButtonClass}>Delete</button>
                                </li>
                            ))}
                            {models.length === 0 && <li className="py-3 text-sm text-slate-400">No models configured.</li>}
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
const dangerButtonClass = 'rounded-lg border border-transparent bg-[#fdf0f0] px-3 py-1.5 text-xs font-semibold text-[#b45353] hover:bg-[#fae2e2] disabled:opacity-50';
function Heading({ title, description }: { title: string; description: string }) {
    return <div className="mb-5"><h2 className="font-serif text-2xl font-semibold text-slate-800">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>;
}
function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
    return <>{error && <p role="alert" className="mb-4 rounded-lg border border-[#f2d8dc] bg-[#fbf0f1] px-4 py-3 text-sm text-[#9f4f59]">{error}</p>}{notice && <p role="status" className="mb-4 rounded-lg border border-[#e8ede9] bg-[#f4f7f4] px-4 py-3 text-sm text-[#385e49]">{notice}</p>}</>;
}
function Loading() {
    return <p className="rounded-xl border border-[#d7ded6] bg-white p-6 text-sm text-slate-500 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]">Loading LLM configuration…</p>;
}
