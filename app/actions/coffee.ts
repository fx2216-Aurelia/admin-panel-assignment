'use server';

import { createClient } from '@/lib/server';
import { validateCoffeeContact } from '@/lib/coffee';

export async function sendCoffeeOffer(generationId: string, platform: unknown, account: unknown) {
    const contact = validateCoffeeContact(platform, account);
    if (contact.error) return { success: false as const, error: contact.error };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationId)) {
        return { success: false as const, error: 'This post is not ready. Please refresh and try again.' };
    }
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false as const, error: 'Please sign in to offer a coffee.' };

    const { data, error } = await supabase.rpc('send_coffee_offer', {
        p_generation_id: generationId,
        p_platform: contact.platform,
        p_account: contact.account,
    });
    if (error) {
        console.error('Could not send coffee offer:', error);
        return { success: false as const, error: 'Your coffee offer could not be saved. Please try again.' };
    }
    if (!data?.comment) return { success: false as const, error: 'No saved coffee offer was returned. Please try again.' };
    return { success: true as const, comment: data.comment as {
        id: string;
        generation_id: string;
        content: string;
        created_at: string;
        author_name: string;
    }, alreadySent: Boolean(data.already_sent), coffeeCount: Number(data.coffee_count) };
}
