export const GENERATION_MODELS = [
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
] as const;

export type GenerationModelId = (typeof GENERATION_MODELS)[number]['id'];

export const DEFAULT_GENERATION_MODEL: GenerationModelId = 'gemini-3.6-flash';

export function normalizeGeminiModelName(value: string): string {
    return value.trim().replace(/^models\//, '');
}

export function parseGenerationModelId(value: unknown): GenerationModelId | null {
    if (typeof value !== 'string') return null;
    const modelId = normalizeGeminiModelName(value);
    return GENERATION_MODELS.find((model) => model.id === modelId)?.id ?? null;
}
