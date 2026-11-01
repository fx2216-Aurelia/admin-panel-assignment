'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/client';
import type { CoffeeNotification } from '@/lib/coffee';

export default function CoffeeNotifications({ userId, onOpenPost }: {
    userId: string;
    onOpenPost: (generationId: string) => void;
}) {
    const [supabase] = useState(() => createClient());
    const [notifications, setNotifications] = useState<CoffeeNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [readingId, setReadingId] = useState<string | null>(null);
    const readingRef = useRef(false);
    const requestRef = useRef(0);
    const panelRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const refresh = useCallback(async () => {
        const request = ++requestRef.current;
        try {
            const [recent, unread] = await Promise.all([
                supabase.from('coffee_notifications')
                    .select('id, generation_id, content, created_at, read_at')
                    .eq('recipient_id', userId)
                    .order('created_at', { ascending: false }).limit(30),
                supabase.from('coffee_notifications')
                    .select('id', { count: 'exact', head: true })
                    .eq('recipient_id', userId).is('read_at', null),
            ]);
            if (request !== requestRef.current) return;
            if (recent.error || unread.error) throw recent.error ?? unread.error;
            setNotifications(recent.data ?? []);
            setUnreadCount(unread.count ?? 0);
            setError(null);
        } catch {
            if (request === requestRef.current) setError('Notifications could not be loaded. Please try again.');
        } finally {
            if (request === requestRef.current) setLoading(false);
        }
    }, [supabase, userId]);

    useEffect(() => {
        const initialFetch = window.setTimeout(() => void refresh(), 0);
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') void refresh();
        }, 30000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') void refresh();
        };
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            requestRef.current += 1;
            window.clearTimeout(initialFetch);
            window.clearInterval(timer);
            window.removeEventListener('focus', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refresh]);

    useEffect(() => {
        if (!open) return;
        const closeOnOutsideClick = (event: PointerEvent) => {
            if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div ref={panelRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={open}
                aria-controls="coffee-notifications"
                onClick={() => {
                    setOpen(!open);
                    if (!open) void refresh();
                }}
                className="min-h-11 rounded-xl border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-stone-900 dark:text-amber-200"
            >
                🔔 <span className="sr-only">Coffee notifications</span>
                {unreadCount > 0 && <span aria-live="polite"> {unreadCount} unread</span>}
            </button>
            {open && (
                <section id="coffee-notifications" aria-label="Coffee notifications" className="absolute right-0 top-full z-40 mt-2 max-h-96 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-amber-200 bg-white p-4 text-stone-800 shadow-xl dark:border-amber-900 dark:bg-stone-900 dark:text-stone-100">
                    <h2 className="font-semibold">Coffee offers</h2>
                    {error ? (
                        <div className="mt-3 text-sm">
                            <p role="alert">{error}</p>
                            <button type="button" onClick={() => void refresh()} className="mt-2 underline">Retry</button>
                        </div>
                    ) : loading ? (
                        <p className="mt-3 text-sm" role="status">Loading…</p>
                    ) : notifications.length === 0 ? (
                        <p className="mt-3 text-sm text-stone-500">No coffee offers yet.</p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {notifications.map((notification) => (
                                <li key={notification.id}>
                                    <button
                                        type="button"
                                        disabled={readingId !== null}
                                        onClick={async () => {
                                            if (readingRef.current) return;
                                            readingRef.current = true;
                                            setReadingId(notification.id);
                                            try {
                                                if (!notification.read_at) {
                                                    const { error: readError } = await supabase.rpc('mark_coffee_notification_read', { p_notification_id: notification.id });
                                                    if (readError) throw readError;
                                                }
                                                setOpen(false);
                                                onOpenPost(notification.generation_id);
                                                void refresh();
                                            } catch {
                                                setError('This notification could not be opened. Please try again.');
                                            } finally {
                                                readingRef.current = false;
                                                setReadingId(null);
                                            }
                                        }}
                                        className={`w-full break-words rounded-xl p-3 text-left text-sm hover:bg-amber-100 disabled:opacity-60 dark:hover:bg-stone-800 ${notification.read_at ? 'bg-stone-50 dark:bg-stone-950' : 'bg-amber-50 dark:bg-amber-950/40'}`}
                                    >
                                        {!notification.read_at && <span className="mb-1 block text-xs font-semibold text-amber-700 dark:text-amber-300">New coffee offer</span>}
                                        <span className="block">{notification.content}</span>
                                        <time dateTime={notification.created_at} className="mt-1 block text-xs text-stone-500">{new Date(notification.created_at).toLocaleString()}</time>
                                        <span className="mt-1 block text-xs underline">View comment →</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}
