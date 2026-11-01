export const COFFEE_PLATFORMS = ['ins', 'facebook', 'wechat'] as const;
export type CoffeePlatform = typeof COFFEE_PLATFORMS[number];

export function validateCoffeeContact(platform: unknown, account: unknown) {
    if (!COFFEE_PLATFORMS.includes(platform as CoffeePlatform)) {
        return { error: 'Please select Instagram, Facebook, or WeChat.' };
    }
    if (typeof account !== 'string') return { error: 'Please enter your social media account.' };
    const normalized = account.trim();
    if (!normalized || normalized.length > 100 || /[\u0000-\u001f\u007f]/.test(normalized)) {
        return { error: 'Enter an account between 1 and 100 characters, without line breaks.' };
    }
    return { platform: platform as CoffeePlatform, account: normalized };
}

export interface CoffeeNotification {
    id: string;
    generation_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
}
