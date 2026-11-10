import { NextResponse } from 'next/server';
import {
    DEFAULT_GENERATION_MODEL,
    parseGenerationModelId,
} from '@/lib/generation-models';
import { createClient } from '@/utils/supabase/server';

async function getAdminClient() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_superadmin')
        .eq('id', user.id)
        .single();
    if (profileError) {
        console.error('Could not verify generation model access:', profileError);
        return { response: NextResponse.json({ error: 'Could not verify administrator access.' }, { status: 500 }) };
    }
    if (!profile?.is_superadmin) {
        return { response: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) };
    }

    return { supabase, user };
}

export async function GET() {
    try {
        const access = await getAdminClient();
        if ('response' in access) return access.response;

        const { data, error } = await access.supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'generation_model')
            .maybeSingle();
        if (error) throw new Error(`Could not load active generation model: ${error.message}`);

        const configuredModel: string | null = data?.value ?? null;
        const model = configuredModel === null
            ? DEFAULT_GENERATION_MODEL
            : parseGenerationModelId(configuredModel);
        if (!model) {
            return NextResponse.json(
                {
                    error: `The saved generation model "${configuredModel}" is unavailable. Select ${DEFAULT_GENERATION_MODEL} in Access Control to continue.`,
                    configuredModel,
                },
                { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
            );
        }
        return NextResponse.json({ model }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        console.error('Could not load active generation model:', error);
        return NextResponse.json({ error: 'Could not load active generation model.' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const access = await getAdminClient();
        if ('response' in access) return access.response;

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
        }
        const model = typeof body === 'object' && body !== null && 'model' in body
            ? parseGenerationModelId(body.model)
            : null;
        if (!model) {
            return NextResponse.json({ error: 'Select a supported Gemini model.' }, { status: 400 });
        }

        const { error } = await access.supabase
            .from('app_settings')
            .upsert(
                { key: 'generation_model', value: model, updated_by: access.user.id },
                { onConflict: 'key' },
            );
        if (error) throw new Error(`Could not save active generation model: ${error.message}`);

        return NextResponse.json({ model });
    } catch (error) {
        console.error('Could not save active generation model:', error);
        return NextResponse.json({ error: 'Could not save active generation model.' }, { status: 500 });
    }
}
