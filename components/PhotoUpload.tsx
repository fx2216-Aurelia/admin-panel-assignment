'use client';

import { useRef, useState } from 'react';

export type PreparedPhoto = { dataUrl: string; consent: boolean };

export async function preparePhoto(file: File): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a still JPEG, PNG or WebP photo.');
    if (file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error('Choose a photo smaller than 10 MB.');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
        if (bitmap.width < 100 || bitmap.height < 100 || bitmap.width * bitmap.height > 36_000_000) throw new Error('Use a photo at least 100 × 100 pixels and no more than 36 megapixels.');
        const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser cannot prepare this photo. Try another browser.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        if (dataUrl.length > 1_400_000) dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        if (dataUrl.length > 1_400_000) throw new Error('This photo is still too large. Try a smaller photo.');
        return dataUrl;
    } finally {
        bitmap.close();
    }
}

export default function PhotoUpload({ disabled, onChange, onBusyChange }: { disabled: boolean; onChange: (photo: PreparedPhoto | null) => void; onBusyChange: (busy: boolean) => void }) {
    const [photo, setPhoto] = useState<string | null>(null);
    const [consent, setConsent] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const selection = useRef(0);

    const clear = () => {
        selection.current += 1;
        setPhoto(null);
        setConsent(false);
        setError(null);
        setPreparing(false);
        onBusyChange(false);
        onChange(null);
        if (input.current) input.current.value = '';
    };

    return (
        <fieldset disabled={disabled} className="mt-5 rounded-xl border border-[#DCE8DF] bg-[#F8FBF9] p-4 dark:border-stone-700 dark:bg-stone-950">
            <legend className="px-1 text-sm font-semibold">Your photo + a little lion (optional)</legend>
            <label htmlFor="reflection-photo" className="block text-sm">Use your own moment instead of an AI illustration</label>
            <input ref={input} id="reflection-photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" aria-describedby="photo-help photo-error" onChange={async (event) => {
                const file = event.target.files?.[0];
                clear();
                if (!file) return;
                const current = selection.current;
                setPreparing(true);
                onBusyChange(true);
                try {
                    const dataUrl = await preparePhoto(file);
                    if (current !== selection.current) return;
                    setPhoto(dataUrl);
                    onChange({ dataUrl, consent: false });
                } catch (cause) {
                    if (current !== selection.current) return;
                    setError(cause instanceof Error ? cause.message : 'This photo could not be opened.');
                } finally {
                    if (current === selection.current) {
                        setPreparing(false);
                        onBusyChange(false);
                    }
                }
            }} />
            <p id="photo-help" className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">JPEG, PNG or WebP · up to 10 MB. We resize your photo and remove embedded metadata. The blue-shirt lion is positioned using the actual photo, not your journal keywords. No upload until you submit.</p>
            {preparing && <p role="status" className="mt-2 text-sm">Preparing photo…</p>}
            {error && <p id="photo-error" role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
            {photo && <>
                <img src={photo} alt="Your selected photo, before adding the lion" className="mt-3 max-h-56 w-full rounded-lg object-contain" />
                <button type="button" onClick={clear} className="mt-2 text-sm underline">Remove photo</button>
                <label className="mt-3 flex items-start gap-2 text-sm leading-relaxed">
                    <input type="checkbox" checked={consent} className="mt-1" onChange={(event) => {
                        setConsent(event.target.checked);
                        onChange({ dataUrl: photo, consent: event.target.checked });
                    }} />
                    <span>I agree to send this photo to Google Gemini for scene analysis and publish the photo with its lion in the community feed with my reflection. Anyone who can view the feed may see or download it. I have permission from people pictured; there is no sensitive information I want to keep private.</span>
                </label>
                <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">Only the resized, composited photo is saved. This is not a private photo album. To keep a photo private, remove it and submit without a photo.</p>
            </>}
        </fieldset>
    );
}
