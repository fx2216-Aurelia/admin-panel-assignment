'use server';

import { createClient } from '@/lib/server';

type VoteType = 'hug';
type VoteError = {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
};

function formatVoteError(error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
}): VoteError {
    return {
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.details ? { details: error.details } : {}),
        ...(error.hint ? { hint: error.hint } : {}),
    };
}

export async function castVote(generationId: string, voteType: VoteType) {
    if (voteType !== 'hug') {
        return { success: false as const, error: { message: 'Please use the coffee offer form.' } };
    }
    const supabase = await createClient();

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
        return {
            success: false as const,
            error: { message: authError?.message ?? 'Please sign in to vote' },
        };
    }

    const { data: existingVote, error: fetchError } = await supabase
        .from('votes')
        .select('generation_id')
        .eq('generation_id', generationId)
        .eq('user_id', user.id)
        .eq('vote_type', voteType)
        .maybeSingle();

    if (fetchError) {
        return { success: false as const, error: formatVoteError(fetchError) };
    }

    if (existingVote) {
        const { error: deleteError } = await supabase
            .from('votes')
            .delete()
            .eq('generation_id', generationId)
            .eq('user_id', user.id)
            .eq('vote_type', voteType);

        if (deleteError) return { success: false as const, error: formatVoteError(deleteError) };
        return { success: true, action: 'removed' as const };
    }

    const { error: insertError } = await supabase
        .from('votes')
        .insert({
            generation_id: generationId,
            user_id: user.id,
            vote_type: voteType,
        });

    if (insertError) return { success: false as const, error: formatVoteError(insertError) };
    return { success: true, action: 'added' as const };
}

export async function cancelCoffeeOffer(generationId: string, commentId: string) {
    const supabase = await createClient();
    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
        return { success: false as const, error: { message: authError?.message ?? 'Please sign in first.' } };
    }

    const { data: comment, error: commentFetchError } = await supabase
        .from('feed_comments')
        .select('id, generation_id, content, author_name, user_id')
        .eq('id', commentId)
        .eq('generation_id', generationId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (commentFetchError) {
        return { success: false as const, error: formatVoteError(commentFetchError) };
    }
    if (!comment || !comment.content.startsWith('☕ Bought you a coffee!')) {
        return {
            success: false as const,
            error: { message: 'Your coffee offer could not be found or is no longer available.' },
        };
    }

    const { data: removedVotes, error: voteDeleteError } = await supabase
        .from('votes')
        .delete()
        .eq('generation_id', generationId)
        .eq('user_id', user.id)
        .eq('vote_type', 'coffee')
        .select('generation_id');

    if (voteDeleteError) {
        return { success: false as const, error: formatVoteError(voteDeleteError) };
    }

    const { data: removedComments, error: commentDeleteError } = await supabase
        .from('feed_comments')
        .delete()
        .eq('id', commentId)
        .eq('generation_id', generationId)
        .eq('user_id', user.id)
        .select('id');

    if (commentDeleteError || !removedComments?.length) {
        if (removedVotes.length > 0) {
            const { error: rollbackError } = await supabase
                .from('votes')
                .insert({
                    generation_id: generationId,
                    user_id: user.id,
                    vote_type: 'coffee',
                });
            if (rollbackError) {
                console.error('Could not roll back coffee vote after comment deletion failed:', rollbackError);
            }
        }
        return {
            success: false as const,
            error: commentDeleteError
                ? formatVoteError(commentDeleteError)
                : { message: 'Coffee offer changed before it could be cancelled. Please try again.' },
        };
    }

    return { success: true as const };
}

export async function postFeedComment(generationId: string, content: string) {
    const supabase = await createClient();
    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
        return {
            success: false as const,
            error: { message: authError?.message ?? 'Please sign in to post a comment.' },
        };
    }

    const normalizedContent = content.trim();
    if (!normalizedContent || normalizedContent.length > 500) {
        return { success: false as const, error: { message: 'Comments must be between 1 and 500 characters.' } };
    }

    const { data, error } = await supabase
        .from('feed_comments')
        .insert({
            generation_id: generationId,
            content: normalizedContent,
            author_name: 'Anonymous Morningsider',
            user_id: user.id,
        })
        .select('id, generation_id, content, created_at, author_name, user_id')
        .single();

    if (error) return { success: false as const, error: formatVoteError(error) };
    return { success: true as const, comment: data };
}