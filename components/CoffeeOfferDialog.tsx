'use client';

import { useEffect, useRef, useState } from 'react';
import { validateCoffeeContact, type CoffeePlatform } from '@/lib/coffee';

interface CoffeeOfferDialogProps {
    onClose: () => void;
    onSubmit: (platform: CoffeePlatform, account: string) => Promise<string | null>;
}

export default function CoffeeOfferDialog({ onClose, onSubmit }: CoffeeOfferDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const submittingRef = useRef(false);
    const [platform, setPlatform] = useState<CoffeePlatform>('ins');
    const [account, setAccount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog?.showModal();
        return () => dialog?.close();
    }, []);

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="coffee-dialog-title"
            aria-describedby="coffee-dialog-description"
            onCancel={(event) => {
                event.preventDefault();
                if (!submittingRef.current) onClose();
            }}
            className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-amber-200 bg-white p-6 text-stone-800 shadow-2xl backdrop:bg-stone-950/40 dark:border-amber-900 dark:bg-stone-900 dark:text-stone-100"
        >
            <h2 id="coffee-dialog-title" className="font-serif text-2xl font-semibold">☕ Coffee on Me</h2>
            <p id="coffee-dialog-description" className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                Share how to reach you. Your platform and account will be publicly visible in this post’s comments, and its author will receive an in-app notification.
            </p>
            <form
                className="mt-5 space-y-4"
                onSubmit={async (event) => {
                    event.preventDefault();
                    if (submittingRef.current) return;
                    const contact = validateCoffeeContact(platform, account);
                    if (contact.error) {
                        setError(contact.error);
                        return;
                    }
                    submittingRef.current = true;
                    setSubmitting(true);
                    setError(null);
                    let submissionError: string | null;
                    try {
                        submissionError = await onSubmit(contact.platform!, contact.account!);
                    } catch {
                        submissionError = 'Your coffee offer could not be saved. Please try again.';
                    }
                    submittingRef.current = false;
                    setSubmitting(false);
                    if (submissionError) setError(submissionError);
                    else onClose();
                }}
            >
                <div>
                    <label htmlFor="coffee-platform" className="mb-1 block text-sm font-semibold">Social media</label>
                    <select
                        id="coffee-platform"
                        value={platform}
                        onChange={(event) => setPlatform(event.target.value as CoffeePlatform)}
                        disabled={submitting}
                        autoFocus
                        className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-800"
                    >
                        <option value="ins">Instagram (ins)</option>
                        <option value="facebook">Facebook</option>
                        <option value="wechat">WeChat</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="coffee-account" className="mb-1 block text-sm font-semibold">Your account</label>
                    <input
                        id="coffee-account"
                        value={account}
                        onChange={(event) => setAccount(event.target.value)}
                        required
                        maxLength={100}
                        disabled={submitting}
                        autoComplete="off"
                        placeholder={platform === 'wechat' ? 'Your WeChat ID' : 'Your username or handle'}
                        className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-800"
                    />
                </div>
                {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={onClose} disabled={submitting} className="min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50">Cancel</button>
                    <button type="submit" disabled={submitting || !account.trim()} className="min-h-11 rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white disabled:opacity-50">
                        {submitting ? 'Sending…' : 'Share & offer coffee'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
