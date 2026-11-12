import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PromptStepLog {
    id: string;
    execution_id: string;
    status: 'succeeded' | 'failed' | 'skipped';
    configured_model: string;
    model: string;
    input_text: string;
    output_text: string | null;
    error_message: string | null;
    duration_ms: number | null;
    created_at: string;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ stepId: string }> }
) {
    try {
        const supabase = await createClient();
        const { stepId } = await params;

        // Get authenticated user
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Check if user is admin by checking their role
        // Query as the authenticated user first to verify they have access
        const { data: adminCheck, error: adminCheckError } = await supabase
            .from('app_settings')
            .select('key')
            .limit(1);

        // If they can't access admin tables at all, they're not an admin
        if (adminCheckError?.code === 'PGRST116') {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            );
        }

        // Now query the logs using the authenticated session
        // The RLS policy we created allows authenticated admins to read
        const { data: logs, error: logsError, count } = await supabase
            .from('llm_logs')
            .select(
                'id, execution_id, status, configured_model, model, input_text, output_text, error_message, duration_ms, created_at',
                { count: 'exact' }
            )
            .eq('step_id', stepId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (logsError) {
            console.error('Logs query error:', logsError);
            return NextResponse.json(
                { error: `Failed to retrieve logs: ${logsError.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json(
            {
                logs: (logs ?? []) as PromptStepLog[],
                total: count ?? 0,
                stepId,
            },
            { status: 200 }
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error in step logs endpoint:', errorMessage);
        return NextResponse.json(
            { error: `Internal server error: ${errorMessage}` },
            { status: 500 }
        );
    }
}

