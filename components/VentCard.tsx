'use client';

import { useState } from 'react';
import PolaroidExport from '@/components/PolaroidExport';
import { LionSticker, type StickerPosition } from '@/components/LionSticker';

export interface VentJournalActions {
    meditation: string;
    walk: string;
    nearby_anchor: string;
}

interface VentCardProps {
    id: string;
    author: string;
    location: string;
    dateLabel: string;
    prompt: string;
    analysis: string;
    stressLevel?: number | null;
    stoicQuote?: string | null;
    image: string;
    imageAlt: string;
    imagePreloaded?: boolean;
    userImage?: string | null;
    stickerPosition?: StickerPosition;
    copingSteps?: string[];
    actions?: VentJournalActions;
    downloading: boolean;
    onDownload: () => void;
    onStickerPointerDown?: (event: React.PointerEvent<SVGSVGElement>) => void;
    onStickerPointerMove?: (event: React.PointerEvent<SVGSVGElement>) => void;
    onStickerPointerUp?: (event: React.PointerEvent<SVGSVGElement>) => void;
}

function getRenderedImageSrc(src: string): string {
    if (src.startsWith('data:image/')) return src;
    try {
        const url = new URL(src);
        if (url.hostname === 'image.pollinations.ai' || url.hostname === 'images.unsplash.com') {
            return `/api/proxy-image?url=${encodeURIComponent(url.href)}`;
        }
    } catch {
        return src;
    }
    return src;
}

function PostImage({
    src,
    preloaded = false,
    alt,
}: {
    src: string;
    preloaded?: boolean;
    alt: string;
}) {
    const [loaded, setLoaded] = useState(preloaded);
    const [unavailable, setUnavailable] = useState(false);
    const hasImageUrl = Boolean(src.trim());

    return (
        <div className="relative mx-auto aspect-[3/4] w-full overflow-hidden rounded-xl bg-stone-100 shadow-inner">
            {hasImageUrl && !loaded && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-[#E8F4EC] via-[#FBF5E7] to-[#E8F4EC]" />
            )}
            {hasImageUrl && !unavailable ? (
                <img
                    src={getRenderedImageSrc(src)}
                    alt={alt || 'Stoic reflection illustration'}
                    crossOrigin="anonymous"
                    onLoad={() => setLoaded(true)}
                    onError={() => {
                        setUnavailable(true);
                        setLoaded(false);
                    }}
                    loading="lazy"
                    className={`absolute inset-0 h-full w-full rounded-xl object-cover transition-opacity duration-500 ${
                        loaded ? 'opacity-100' : 'opacity-0'
                    }`}
                />
            ) : (
                <div
                    className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E8F4EC] via-[#FBF5E7] to-[#E7EEF7] px-6 text-center text-sm text-[#496B57]"
                    role="img"
                    aria-label={alt}
                >
                    {hasImageUrl ? 'Illustration temporarily unavailable' : 'Illustration is being prepared'}
                </div>
            )}
        </div>
    );
}

export default function VentCard({
    id,
    author,
    location,
    dateLabel,
    prompt,
    analysis,
    stressLevel,
    stoicQuote,
    image,
    imageAlt,
    imagePreloaded,
    userImage,
    stickerPosition,
    copingSteps = [],
    actions,
    downloading,
    onDownload,
    onStickerPointerDown,
    onStickerPointerMove,
    onStickerPointerUp,
}: VentCardProps) {
    const quoteSourceMatch = stoicQuote?.match(/^(.*)\s+—\s+(Meditations[\s\S]*)$/);
    const quoteText = quoteSourceMatch?.[1] ?? stoicQuote;
    const quoteSource = quoteSourceMatch?.[2] ?? 'Marcus Aurelius · Meditations';

    return (
        <>
            <div
                id={id}
                className="rounded-xl border border-[#E8E1D8] bg-[#FDFAF6] p-4 text-stone-800 shadow-[0_12px_30px_rgba(41,37,36,0.10)] sm:p-5"
            >
                <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#E8E1D8] pb-3 font-serif text-xs text-stone-600">
                    <div className="min-w-0">
                        <p data-polaroid-name className="truncate font-semibold text-stone-900">
                            {author}
                        </p>
                        <p data-polaroid-location className="mt-1 truncate">📍 {location}</p>
                    </div>
                    <time className="shrink-0 text-right">{dateLabel}</time>
                </div>
                <div className="grid items-start gap-4 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] md:gap-6">
                    <div className="mx-auto w-full max-w-sm">
                        <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-stone-300/70 bg-stone-100 shadow-inner">
                            {userImage ? (
                                <img
                                    src={userImage}
                                    alt={imageAlt}
                                    data-fit="cover"
                                    className="absolute inset-0 h-full w-full rounded-xl object-cover"
                                />
                            ) : (
                                <PostImage src={image} preloaded={imagePreloaded} alt={imageAlt} />
                            )}
                            {userImage && stickerPosition && (
                                <LionSticker
                                    position={stickerPosition}
                                    onPointerDown={onStickerPointerDown}
                                    onPointerMove={onStickerPointerMove}
                                    onPointerUp={onStickerPointerUp}
                                />
                            )}
                        </div>
                    </div>
                    <div className="min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span data-polaroid-name className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                                {author}
                            </span>
                            <span data-polaroid-location className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-900">
                                📍 {location}
                            </span>
                            {stressLevel != null && (
                                <span data-polaroid-stress className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                                    🔥 Stress: {stressLevel}/10
                                </span>
                            )}
                        </div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">A student’s vent</p>
                        <p className="mb-3 text-sm leading-relaxed text-stone-600">
                            {prompt.length > 180 ? `${prompt.slice(0, 180).trimEnd()}…` : prompt}
                        </p>
                        <p data-polaroid-advice className="whitespace-pre-wrap font-serif text-base leading-relaxed text-stone-900 sm:text-lg">
                            {analysis}
                        </p>
                        {stoicQuote && (
                            <blockquote className="mt-4 border-l-2 border-amber-700/50 pl-3">
                                <p data-polaroid-quote className="font-serif text-sm italic leading-relaxed text-stone-800">
                                    “{quoteText}”
                                </p>
                                <cite data-polaroid-source className="mt-2 block text-xs font-semibold not-italic uppercase tracking-[0.12em] text-amber-800">
                                    {quoteSource}
                                </cite>
                            </blockquote>
                        )}
                        {copingSteps.length > 0 ? (
                            <div className="mt-4 rounded-xl border border-[#E0EBE3] bg-[#F8FBF9] p-3">
                                <h3 className="text-xs font-bold uppercase tracking-wide text-[#365B48]">
                                    🌱 1-Minute Grounding Action
                                </h3>
                                <ol className="mt-2 space-y-1.5">
                                    {copingSteps.map((step, index) => (
                                        <li key={`${index}-${step}`} className="flex gap-2 text-sm leading-relaxed text-stone-700">
                                            <span className="shrink-0 font-semibold text-[#5F937B]">Step {index + 1}:</span>
                                            <span>{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        ) : actions ? (
                            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                <div className="rounded-xl bg-stone-50 p-3">
                                    <h3 className="mb-1 text-xs font-semibold text-stone-800">◉ 1-minute reset</h3>
                                    <p className="text-sm text-stone-600">{actions.meditation}</p>
                                </div>
                                <div className="rounded-xl bg-stone-50 p-3">
                                    <h3 className="mb-1 text-xs font-semibold text-stone-800">↗ 3-minute walk</h3>
                                    <p className="text-sm text-stone-600">{actions.walk}</p>
                                </div>
                                <div className="rounded-xl bg-stone-50 p-3">
                                    <h3 className="mb-1 text-xs font-semibold text-stone-800">✧ Nearby anchor</h3>
                                    <p className="text-sm text-stone-600">{actions.nearby_anchor}</p>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            <PolaroidExport
                id={id}
                author={author}
                location={location}
                dateLabel={dateLabel}
                prompt={prompt}
                analysis={analysis}
                stressLevel={stressLevel}
                stoicQuote={stoicQuote}
                image={image}
                imageAlt={imageAlt}
                userImage={userImage}
                stickerPosition={stickerPosition}
                copingSteps={copingSteps}
                actions={actions}
            />
            <button
                type="button"
                onClick={onDownload}
                disabled={downloading}
                className="mt-3 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
            >
                {downloading ? 'Preparing image...' : '📸 Download Polaroid (PNG)'}
            </button>
        </>
    );
}
