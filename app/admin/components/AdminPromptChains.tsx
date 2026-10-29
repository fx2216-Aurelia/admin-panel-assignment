'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface PromptChain {
    id: string;
    name?: string;
    description?: string | null;
    [key: string]: unknown;
}

interface PromptChainStep {
    id: string;
    prompt_chain_id: string;
    step_number: number;
    system_instruction?: string | null;
    prompt_template?: string | null;
    temperature?: number | null;
    max_tokens?: number | null;
    model_id?: string | null;
    [key: string]: unknown;
}

interface PromptChainMix {
    id: string;
    prompt_chain_id?: string;
    weight?: number;
    routing_weight?: number;
    is_active?: boolean;
    [key: string]: unknown;
}

interface Model {
    id: string;
    model_name: string;
    model_identifier: string;
    provider_id?: string;
}

const DEFAULT_MODELS: Model[] = [
    { id: 'gpt-4o-mini', model_name: 'OpenAI GPT-4o Mini', model_identifier: 'gpt-4o-mini' },
    { id: 'gpt-4o', model_name: 'OpenAI GPT-4o', model_identifier: 'gpt-4o' },
    { id: 'claude-3-5-sonnet', model_name: 'Anthropic Claude 3.5 Sonnet', model_identifier: 'claude-3-5-sonnet-20241022' },
    { id: 'gemini-1.5-flash', model_name: 'Google Gemini 1.5 Flash', model_identifier: 'gemini-1.5-flash' },
];

interface StepDraft {
    systemInstruction: string;
    promptTemplate: string;
    temperature: number;
    maxTokens: number;
    modelId: string;
}

const EMPTY_STEP: StepDraft = {
    systemInstruction: '',
    promptTemplate: '',
    temperature: 0.7,
    maxTokens: 250,
    modelId: 'gpt-4o-mini',
};

const inputClass = 'w-full rounded-lg border border-[#cfd7cf] bg-[#fcfdfc] px-3 py-2 text-sm text-[#2c3e35] placeholder:text-[#9ea8a0] focus:border-[#6b8f78] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6b8f78]/20';
const panelClass = 'rounded-2xl border border-[#d7ded6] bg-white p-5 shadow-[0_4px_20px_-4px_rgba(40,60,50,0.06)]';
const primaryButtonClass = 'inline-flex items-center justify-center rounded-lg bg-[#d9929c] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#ca7f89] disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center rounded-lg bg-[#e4ede6] px-3 py-2 text-sm font-semibold text-[#3d614e] transition hover:bg-[#d6e4da] disabled:cursor-not-allowed disabled:opacity-50';

export default function AdminPromptChains() {
    const [chains, setChains] = useState<PromptChain[]>([]);
    const [steps, setSteps] = useState<PromptChainStep[]>([]);
    const [mixes, setMixes] = useState<PromptChainMix[]>([]);
    const [models, setModels] = useState<Model[]>(DEFAULT_MODELS);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [chainNameInput, setChainNameInput] = useState('');
    const [chainDescription, setChainDescription] = useState('');
    const [initialStep, setInitialStep] = useState<StepDraft>(EMPTY_STEP);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [addStepChainId, setAddStepChainId] = useState<string | null>(null);
    const [newStep, setNewStep] = useState<StepDraft>(EMPTY_STEP);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [chainResult, stepResult, mixResult, modelResult] = await Promise.all([
                supabase.from('prompt_chains').select('*').order('name'),
                supabase.from('prompt_chain_steps').select('*').order('step_number'),
                supabase.from('prompt_chain_mix').select('*').order('id'),
                supabase.from('llm_models').select('id, model_name, model_identifier, provider_id').order('model_name'),
            ]);

            const coreError = chainResult.error ?? stepResult.error ?? mixResult.error;
            if (coreError) {
                console.warn('Load non-fatal warning (tables might be empty or missing):', coreError);
            }

            setChains((chainResult.data ?? []) as PromptChain[]);
            setSteps((stepResult.data ?? []) as PromptChainStep[]);
            setMixes((mixResult.data ?? []) as PromptChainMix[]);

            if (!modelResult.error && modelResult.data && modelResult.data.length > 0) {
                setModels(modelResult.data as Model[]);
            } else {
                setModels(DEFAULT_MODELS);
            }
        } catch (error: any) {
            console.error('Could not load prompt chain configuration:', error);
            setErrorMessage(error?.message || 'Prompt chain configuration could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    const resetCreateForm = () => {
        setChainNameInput('');
        setChainDescription('');
        setInitialStep(EMPTY_STEP);
    };

    const createChain = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const name = chainNameInput.trim();
        if (!name || !initialStep.systemInstruction.trim() || !initialStep.promptTemplate.trim()) {
            setErrorMessage('Enter a chain name, system instruction, and prompt template.');
            return;
        }

        setBusy(true);
        setErrorMessage(null);
        setNotice(null);

        try {
            // 步骤 1: 插入 prompt_chains
            const chainPayload = { name, description: chainDescription.trim() || null };
            console.log('1. 开始插入 prompt_chains:', chainPayload);
            const { data: chain, error: chainError } = await supabase
                .from('prompt_chains')
                .insert(chainPayload)
                .select('id')
                .single();

            if (chainError) {
                const detail = `[插入 prompt_chains 错误] code: ${chainError.code}, message: ${chainError.message}, hint: ${chainError.hint ?? 'none'}`;
                alert(detail);
                throw new Error(detail);
            }
            if (!chain) throw new Error('Prompt chain created but id was not returned.');
            const chainId = chain.id;

            // 步骤 2: 插入 prompt_chain_steps
            const stepPayload = createStepPayload(chainId, 1, initialStep);
            console.log('2. 开始插入 prompt_chain_steps:', stepPayload);
            const { error: stepError } = await supabase.from('prompt_chain_steps').insert(stepPayload);
            if (stepError) {
                const detail = `[插入 prompt_chain_steps 错误] code: ${stepError.code}, message: ${stepError.message}, hint: ${stepError.hint ?? 'none'}`;
                alert(detail);
                throw new Error(detail);
            }

            // 步骤 3: 插入 prompt_chain_mix
            const mixWeightColumn = getWeightColumn(mixes);
            const mixPayload = {
                prompt_chain_id: chainId,
                [mixWeightColumn]: 50,
                is_active: true,
            };
            console.log('3. 开始插入 prompt_chain_mix:', mixPayload);
            const { error: mixError } = await supabase.from('prompt_chain_mix').insert(mixPayload);
            if (mixError) {
                console.warn('prompt_chain_mix 插入受阻（非致命）:', mixError);
            }

            setNotice('Prompt chain created successfully!');
            setCreateOpen(false);
            resetCreateForm();
            setExpandedIds((current) => new Set(current).add(chainId));
            await load();
        } catch (error: any) {
            console.error('完整捕获到的报错详情:', error);
            setErrorMessage(error?.message || 'Prompt chain could not be created.');
        } finally {
            setBusy(false);
        }
    };

    const addStep = async (event: FormEvent<HTMLFormElement>, chainId: string) => {
        event.preventDefault();
        if (!newStep.systemInstruction.trim() || !newStep.promptTemplate.trim()) {
            setErrorMessage('Enter a system instruction and prompt template for the new step.');
            return;
        }
        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        const stepNumber = steps.filter((step) => step.prompt_chain_id === chainId).length + 1;
        try {
            const { error } = await supabase
                .from('prompt_chain_steps')
                .insert(createStepPayload(chainId, stepNumber, newStep));
            if (error) throw error;

            setNotice(`Step ${stepNumber} added.`);
            setAddStepChainId(null);
            setNewStep(EMPTY_STEP);
            await load();
        } catch (error: any) {
            console.error('Could not add prompt chain step:', error);
            setErrorMessage(error?.message || 'The prompt chain step could not be added.');
        } finally {
            setBusy(false);
        }
    };

    const deleteStep = async (step: PromptChainStep) => {
        const chainStepCount = steps.filter((item) => item.prompt_chain_id === step.prompt_chain_id).length;
        if (chainStepCount <= 1) {
            setErrorMessage('Each prompt chain must keep at least one step.');
            return;
        }
        if (!window.confirm(`Delete step ${step.step_number}? This cannot be undone.`)) return;

        setBusy(true);
        setErrorMessage(null);
        setNotice(null);
        try {
            const { data, error } = await supabase
                .from('prompt_chain_steps')
                .delete()
                .eq('id', step.id)
                .select('id')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('The step was not deleted. Check that you still have admin access.');
            const remainingSteps = steps
                .filter((item) => item.prompt_chain_id === step.prompt_chain_id && item.id !== step.id)
                .sort((a, b) => a.step_number - b.step_number);
            for (const [index, remainingStep] of remainingSteps.entries()) {
                const { error: reorderError } = await supabase
                    .from('prompt_chain_steps')
                    .update({ step_number: index + 1 })
                    .eq('id', remainingStep.id);
                if (reorderError) {
                    throw new Error(`Step deleted, but remaining steps could not be renumbered: ${reorderError.message}`);
                }
            }
            setNotice(`Step ${step.step_number} deleted.`);
            await load();
        } catch (error: any) {
            console.error('Could not delete prompt chain step:', error);
            setErrorMessage(error?.message || 'The prompt chain step could not be deleted.');
        } finally {
            setBusy(false);
        }
    };

    const addToMix = async (chainId: string) => {
        setSavingId(chainId);
        setErrorMessage(null);
        setNotice(null);
        try {
            const { error } = await supabase.from('prompt_chain_mix').insert({
                prompt_chain_id: chainId,
                [getWeightColumn(mixes)]: 50,
                is_active: true,
            });
            if (error) throw error;
            setNotice(`${chainName(chainId)} added to routing mix with weight 50.`);
            await load();
        } catch (error: any) {
            console.error('Could not add prompt chain to routing mix:', error);
            setErrorMessage(error?.message || 'Prompt chain could not be added to the routing mix.');
        } finally {
            setSavingId(null);
        }
    };

    const updateMix = async (mix: PromptChainMix, values: { weight: number; is_active: boolean }) => {
        setSavingId(mix.id);
        setErrorMessage(null);
        setNotice(null);
        try {
            const { error } = await supabase
                .from('prompt_chain_mix')
                .update({ [weightColumnFor(mix)]: values.weight, is_active: values.is_active })
                .eq('id', mix.id);
            if (error) throw error;
            setNotice('Prompt chain routing updated.');
            await load();
        } catch (error: any) {
            console.error('Could not update routing configuration:', error);
            setErrorMessage(error?.message || 'Routing configuration could not be updated.');
        } finally {
            setSavingId(null);
        }
    };

    const chainName = (id: string | undefined) => chains.find((chain) => chain.id === id)?.name ?? id ?? 'Unassigned';
    const mixForChain = (chainId: string) => mixes.find((mix) => mix.prompt_chain_id === chainId);

    return (
        <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <Heading title="Prompt Chains" description="Create and organize ordered prompt steps, then tune dynamic routing." />
                <button
                    type="button"
                    onClick={() => {
                        setCreateOpen((open) => !open);
                        setErrorMessage(null);
                        setNotice(null);
                    }}
                    className={primaryButtonClass}
                >
                    {createOpen ? 'Cancel' : '+ New Chain'}
                </button>
            </div>

            {errorMessage && (
                <p role="alert" className="mb-4 rounded-lg border border-[#f3dede] bg-[#fdf4f4] px-4 py-3 text-sm text-[#a84f55]">
                    {errorMessage}
                </p>
            )}
            {notice && (
                <p role="status" className="mb-4 rounded-lg border border-[#c5d4c8] bg-[#e4ede6] px-4 py-3 text-sm text-[#385e49]">
                    {notice}
                </p>
            )}

            {createOpen && (
                <form onSubmit={(event) => void createChain(event)} className={`${panelClass} mb-6`}>
                    <h3 className="mb-4 font-serif text-xl font-semibold text-slate-800">Create a prompt chain</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                            <span className={labelClass}>Chain name</span>
                            <input value={chainNameInput} onChange={(event) => setChainNameInput(event.target.value)} required maxLength={120} className={inputClass} placeholder="e.g. Stress Relief & Comfort" />
                        </label>
                        <label className="block">
                            <span className={labelClass}>Description</span>
                            <textarea value={chainDescription} onChange={(event) => setChainDescription(event.target.value)} rows={2} className={inputClass} placeholder="What this chain is used for" />
                        </label>
                    </div>
                    <div className="mt-5 rounded-xl border border-[#e7ece7] bg-[#fafbfa] p-4">
                        <h4 className="mb-4 text-sm font-semibold text-[#3d614e]">Initial step</h4>
                        <StepFields draft={initialStep} onChange={setInitialStep} models={models} />
                    </div>
                    <div className="mt-5 flex justify-end">
                        <button type="submit" disabled={busy} className={primaryButtonClass}>
                            {busy ? 'Creating…' : 'Create chain'}
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <p className={`${panelClass} text-sm text-slate-500`}>Loading prompt chains…</p>
            ) : (
                <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-2">
                        {chains.map((chain) => {
                            const chainSteps = steps
                                .filter((step) => step.prompt_chain_id === chain.id)
                                .sort((a, b) => a.step_number - b.step_number);
                            const isExpanded = expandedIds.has(chain.id);
                            return (
                                <article key={chain.id} className={panelClass}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="font-semibold text-slate-800">{chain.name ?? `Prompt chain ${chain.id}`}</h3>
                                            {chain.description && <p className="mt-1 text-sm text-slate-600">{chain.description}</p>}
                                        </div>
                                        <button
                                            type="button"
                                            aria-expanded={isExpanded}
                                            onClick={() => setExpandedIds((current) => {
                                                const next = new Set(current);
                                                if (next.has(chain.id)) next.delete(chain.id);
                                                else next.add(chain.id);
                                                return next;
                                            })}
                                            className={secondaryButtonClass}
                                        >
                                            {isExpanded ? 'Collapse' : `View ${chainSteps.length} steps`}
                                        </button>
                                    </div>

                                    {isExpanded && (
                                        <>
                                            <ol className="mt-4 space-y-3 border-l border-[#c5d4c8] pl-4">
                                                {chainSteps.map((step) => (
                                                    <li key={step.id} className="text-sm text-slate-700">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <span className="font-semibold text-[#385e49]">Step {step.step_number}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => void deleteStep(step)}
                                                                disabled={busy || chainSteps.length <= 1}
                                                                title={chainSteps.length <= 1 ? 'A chain must keep at least one step.' : 'Delete this step'}
                                                                className="rounded-md bg-[#f3dede] px-2 py-1 text-xs font-semibold text-[#a84f55] transition hover:bg-[#ebcccc] disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                                                            <StepDetail label="System instruction" value={step.system_instruction} />
                                                            <StepDetail label="Prompt template" value={step.prompt_template} />
                                                            <StepDetail label="Temperature" value={step.temperature} />
                                                            <StepDetail label="Max tokens" value={step.max_tokens} />
                                                            <StepDetail label="Model" value={modelLabel(models, step.model_id)} />
                                                        </dl>
                                                    </li>
                                                ))}
                                                {chainSteps.length === 0 && <li className="text-xs text-slate-500">No steps configured.</li>}
                                            </ol>

                                            {addStepChainId === chain.id ? (
                                                <form onSubmit={(event) => void addStep(event, chain.id)} className="mt-5 rounded-xl border border-[#e7ece7] bg-[#fafbfa] p-4">
                                                    <h4 className="mb-4 text-sm font-semibold text-[#3d614e]">Add step {chainSteps.length + 1}</h4>
                                                    <StepFields draft={newStep} onChange={setNewStep} models={models} />
                                                    <div className="mt-4 flex justify-end gap-2">
                                                        <button type="button" onClick={() => setAddStepChainId(null)} disabled={busy} className="rounded-lg border border-[#c5d4c8] px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Cancel</button>
                                                        <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Adding…' : 'Add step'}</button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setNewStep(EMPTY_STEP);
                                                        setAddStepChainId(chain.id);
                                                        setErrorMessage(null);
                                                        setNotice(null);
                                                    }}
                                                    className={`${secondaryButtonClass} mt-5`}
                                                >
                                                    + Add Step
                                                </button>
                                            )}
                                        </>
                                    )}
                                </article>
                            );
                        })}
                        {chains.length === 0 && <p className={`${panelClass} text-sm text-slate-500`}>No prompt chains configured.</p>}
                    </div>

                    <article className={panelClass}>
                        <h3 className="mb-4 font-semibold text-slate-800">Dynamic routing</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[36rem] text-left text-sm">
                                <thead className="border-b border-[#c5d4c8] bg-[#e4ede6] text-xs font-semibold uppercase tracking-wide text-[#3e5649]">
                                <tr>
                                    <th scope="col" className="px-3 py-2">Prompt chain</th>
                                    <th scope="col" className="px-3 py-2">Weight</th>
                                    <th scope="col" className="px-3 py-2">Active</th>
                                    <th scope="col" className="px-3 py-2">Save</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e9eee9]">
                                {mixes.map((mix) => {
                                    const weight = mix.weight ?? mix.routing_weight ?? 0;
                                    return (
                                        <tr key={mix.id} className="border-b border-[#e9eee9] transition-colors hover:bg-[#fafbfa]">
                                            <td className="px-3 py-3 text-slate-700">{chainName(mix.prompt_chain_id)}</td>
                                            <td className="px-3 py-3">
                                                <input
                                                    aria-label={`Routing weight for ${chainName(mix.prompt_chain_id)}`}
                                                    type="number"
                                                    step="any"
                                                    value={weight}
                                                    onChange={(event) => {
                                                        const parsed = Number(event.target.value);
                                                        setMixes((current) => current.map((entry) => entry.id === mix.id
                                                            ? { ...entry, ...(weightColumnFor(entry) === 'weight' ? { weight: parsed } : { routing_weight: parsed }) }
                                                            : entry));
                                                    }}
                                                    className={inputClass}
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <input
                                                    aria-label={`Active status for ${chainName(mix.prompt_chain_id)}`}
                                                    type="checkbox"
                                                    checked={mix.is_active ?? false}
                                                    onChange={(event) => setMixes((current) => current.map((entry) => entry.id === mix.id ? { ...entry, is_active: event.target.checked } : entry))}
                                                    className="size-4 accent-[#869689]"
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <button
                                                    type="button"
                                                    disabled={savingId === mix.id}
                                                    onClick={() => {
                                                        if (!Number.isFinite(weight)) {
                                                            setErrorMessage('Enter a valid routing weight.');
                                                            return;
                                                        }
                                                        void updateMix(mix, { weight, is_active: mix.is_active ?? false });
                                                    }}
                                                    className={secondaryButtonClass}
                                                >
                                                    {savingId === mix.id ? 'Saving…' : 'Save'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {chains.filter((chain) => !mixForChain(chain.id)).map((chain) => (
                                    <tr key={`missing-${chain.id}`} className="border-b border-[#e9eee9] transition-colors hover:bg-[#fafbfa]">
                                        <td className="px-3 py-3 text-slate-700">{chain.name ?? `Prompt chain ${chain.id}`}</td>
                                        <td colSpan={2} className="px-3 py-3 text-xs text-slate-500">Not included in routing mix</td>
                                        <td className="px-3 py-3">
                                            <button type="button" onClick={() => void addToMix(chain.id)} disabled={savingId === chain.id} className={secondaryButtonClass}>
                                                {savingId === chain.id ? 'Adding…' : 'Add to Mix'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {mixes.length === 0 && chains.length === 0 && (
                                    <tr><td colSpan={4} className="px-3 py-4 text-slate-500">No prompt chains configured.</td></tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    </article>
                </div>
            )}
        </section>
    );
}

function createStepPayload(chainId: string, stepNumber: number, draft: StepDraft) {
    return {
        prompt_chain_id: chainId,
        step_number: stepNumber,
        system_instruction: draft.systemInstruction.trim(),
        prompt_template: draft.promptTemplate.trim(),
        temperature: draft.temperature,
        max_tokens: draft.maxTokens,
        model_id: draft.modelId || null,
    };
}

function getWeightColumn(mixes: PromptChainMix[]): 'weight' | 'routing_weight' {
    if (mixes.some((mix) => 'routing_weight' in mix && !('weight' in mix))) return 'routing_weight';
    return 'weight';
}

function weightColumnFor(mix: PromptChainMix): 'weight' | 'routing_weight' {
    return 'routing_weight' in mix && !('weight' in mix) ? 'routing_weight' : 'weight';
}

function modelLabel(models: Model[], modelId: string | null | undefined): string {
    if (!modelId) return 'Not selected';
    const model = models.find((item) => item.id === modelId || item.model_identifier === modelId);
    return model ? `${model.model_name} (${model.model_identifier})` : modelId;
}

function formatValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function StepFields({ draft, onChange, models }: { draft: StepDraft; onChange: (draft: StepDraft) => void; models: Model[] }) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
                <span className={labelClass}>System instruction</span>
                <textarea
                    value={draft.systemInstruction}
                    onChange={(event) => onChange({ ...draft, systemInstruction: event.target.value })}
                    rows={3}
                    required
                    className={inputClass}
                    placeholder="Describe the assistant's role and guardrails"
                />
            </label>
            <label className="block md:col-span-2">
                <span className={labelClass}>Prompt template</span>
                <textarea
                    value={draft.promptTemplate}
                    onChange={(event) => onChange({ ...draft, promptTemplate: event.target.value })}
                    rows={3}
                    required
                    className={inputClass}
                    placeholder="Write the prompt template; use {{input}} for user content"
                />
            </label>
            <label className="block">
                <span className={labelClass}>Temperature: {draft.temperature.toFixed(1)}</span>
                <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={draft.temperature}
                    onChange={(event) => onChange({ ...draft, temperature: Number(event.target.value) })}
                    className="mt-2 w-full accent-[#869689]"
                />
            </label>
            <label className="block">
                <span className={labelClass}>Max tokens</span>
                <input
                    type="number"
                    min="1"
                    max="32768"
                    value={draft.maxTokens}
                    onChange={(event) => onChange({ ...draft, maxTokens: Number(event.target.value) })}
                    required
                    className={inputClass}
                />
            </label>
            <label className="block md:col-span-2">
                <span className={labelClass}>Model</span>
                <select
                    value={draft.modelId}
                    onChange={(event) => onChange({ ...draft, modelId: event.target.value })}
                    className={inputClass}
                >
                    <option value="">No model selected</option>
                    {models.map((model) => (
                        <option key={model.id} value={model.id}>{model.model_name} · {model.model_identifier}</option>
                    ))}
                </select>
            </label>
        </div>
    );
}

function StepDetail({ label, value }: { label: string; value: unknown }) {
    if (value === null || value === undefined || value === '') return null;
    return (
        <div className="min-w-0">
            <dt className="font-semibold text-slate-500">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-600">{formatValue(value)}</dd>
        </div>
    );
}

function Heading({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <h2 className="font-serif text-2xl font-semibold text-slate-800">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
    );
}

const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';