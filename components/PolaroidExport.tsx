import type { CSSProperties } from 'react';
import { LionSticker, type StickerPosition } from '@/components/LionSticker';
import type { VentJournalActions } from '@/components/VentCard';

interface PolaroidExportProps {
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
    userImage?: string | null;
    stickerPosition?: StickerPosition;
    copingSteps?: string[];
    actions?: VentJournalActions;
}

const iconStyle = {
    display: 'block',
    flex: 'none',
};

function LocationIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" style={iconStyle} fill="none">
            <path d="M16 8.3c0 4.3-6 9.2-6 9.2S4 12.6 4 8.3a6 6 0 1 1 12 0Z" stroke="#527b66" strokeWidth="1.7" />
            <circle cx="10" cy="8" r="2" stroke="#527b66" strokeWidth="1.7" />
        </svg>
    );
}

function StressIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" style={iconStyle} fill="none">
            <path d="M10.5 2.2c.7 3.2-2.6 4-1.6 6.7.5 1.3 1.8 1.7 2.2 2.8 1-1 1.5-2.4 1.2-3.8 2.1 1.4 3.3 3.3 3.3 5.3a5.6 5.6 0 0 1-11.2 0c0-2.5 1.4-4.1 3.2-5.8-.1 2.2.4 2.9 1.4 3.3-.9-3.2 1.3-5.1 1.5-8.5Z" fill="#b45309" />
        </svg>
    );
}

function getExportImageSrc(src: string): string {
    if (src.startsWith('data:image/')) return src;

    try {
        const url = new URL(src);
        const isSupportedRemoteImage =
            url.hostname === 'image.pollinations.ai' ||
            url.hostname === 'images.unsplash.com';
        return isSupportedRemoteImage
            ? `/api/proxy-image?url=${encodeURIComponent(url.href)}`
            : src;
    } catch {
        return src;
    }
}

export default function PolaroidExport({
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
    userImage,
    stickerPosition,
    copingSteps = [],
    actions,
}: PolaroidExportProps) {
    const quoteSourceMatch = stoicQuote?.match(/^(.*)\s+—\s+(Meditations[\s\S]*)$/);
    const quoteText = quoteSourceMatch?.[1] ?? stoicQuote;
    const quoteSource = quoteSourceMatch?.[2] ?? 'Marcus Aurelius · Meditations';
    const exportImage = userImage || image;
    const exportImageSrc = getExportImageSrc(exportImage);
    const cardStyle: CSSProperties = {
        boxSizing: 'border-box',
        width: 1200,
        minHeight: 900,
        padding: 52,
        border: '2px solid #e8e1d8',
        borderRadius: 28,
        background: '#FDFAF6',
        color: '#292524',
        fontFamily: 'Georgia, "Times New Roman", serif',
        boxShadow: '0 18px 48px rgba(41, 37, 36, 0.12)',
    };
    const mutedTextStyle: CSSProperties = {
        color: '#78716c',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 17,
        lineHeight: 1.5,
    };

    return (
        <div
            id={`polaroid-export-${id}`}
            data-polaroid-export
            style={{
                position: 'fixed',
                left: 0,
                top: 0,
                zIndex: 1000,
                pointerEvents: 'none',
                width: 1200,
                transform: 'translateX(calc(-100% - 32px))',
            }}
            aria-hidden="true"
        >
            <div style={cardStyle}>
                <header
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 24,
                        paddingBottom: 22,
                        borderBottom: '1px solid #e8e1d8',
                    }}
                >
                    <div>
                        <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.25 }}>{author}</div>
                        <div style={{ ...mutedTextStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                            <LocationIcon />
                            <span>{location}</span>
                        </div>
                    </div>
                    <time style={{ ...mutedTextStyle, textAlign: 'right' }}>{dateLabel}</time>
                </header>

                <main
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '430px minmax(0, 1fr)',
                        gap: 48,
                        alignItems: 'start',
                        paddingTop: 32,
                    }}
                >
                    <div
                        style={{
                            position: 'relative',
                            width: 430,
                            height: 574,
                            overflow: 'hidden',
                            border: '1px solid #d6cec3',
                            borderRadius: 18,
                            background: '#e7e5e4',
                            boxShadow: 'inset 0 2px 8px rgba(41, 37, 36, 0.12)',
                        }}
                    >
                        <img
                            crossOrigin={exportImage.startsWith('data:image/') ? undefined : 'anonymous'}
                            src={exportImageSrc}
                            alt={imageAlt}
                            style={{
                                display: 'block',
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                            }}
                        />
                        {userImage && stickerPosition && <LionSticker position={stickerPosition} />}
                    </div>

                    <section style={{ minWidth: 0, paddingTop: 8 }}>
                        {stressLevel != null && (
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 9,
                                    padding: '9px 16px',
                                    borderRadius: 999,
                                    background: '#fef3c7',
                                    color: '#78350f',
                                    fontFamily: 'Arial, Helvetica, sans-serif',
                                    fontSize: 16,
                                    fontWeight: 700,
                                }}
                            >
                                <StressIcon />
                                <span>Stress: {stressLevel}/10</span>
                            </div>
                        )}

                        <p style={{ ...mutedTextStyle, margin: '26px 0 8px', fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                            A moment from your day
                        </p>
                        <p style={{ ...mutedTextStyle, margin: '0 0 22px', color: '#57534e' }}>{prompt}</p>

                        {stoicQuote && (
                            <blockquote
                                style={{
                                    margin: '0 0 24px',
                                    padding: '4px 0 4px 20px',
                                    borderLeft: '3px solid #b45309',
                                    fontSize: 25,
                                    fontStyle: 'italic',
                                    lineHeight: 1.5,
                                }}
                            >
                                <p style={{ margin: 0 }}>“{quoteText}”</p>
                                <cite
                                    style={{
                                        display: 'block',
                                        marginTop: 14,
                                        color: '#92400e',
                                        fontFamily: 'Arial, Helvetica, sans-serif',
                                        fontSize: 14,
                                        fontStyle: 'normal',
                                        fontWeight: 700,
                                        letterSpacing: 1.2,
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {quoteSource}
                                </cite>
                            </blockquote>
                        )}

                        <p
                            style={{
                                margin: 0,
                                paddingTop: 22,
                                borderTop: '1px solid #e8e1d8',
                                color: '#44403c',
                                fontSize: 23,
                                lineHeight: 1.65,
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {analysis}
                        </p>

                        {copingSteps.length > 0 && (
                            <div style={{ marginTop: 24, padding: 18, border: '1px solid #dce8df', borderRadius: 16, background: '#f8fbf9' }}>
                                <h2 style={{ margin: 0, color: '#365b48', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 15, letterSpacing: 1, textTransform: 'uppercase' }}>
                                    A gentle next step
                                </h2>
                                <ol style={{ margin: '12px 0 0', paddingLeft: 24, color: '#44403c', fontSize: 17, lineHeight: 1.55 }}>
                                    {copingSteps.map((step) => <li key={step} style={{ marginTop: 6 }}>{step}</li>)}
                                </ol>
                            </div>
                        )}
                        {copingSteps.length === 0 && actions && (
                            <div style={{ marginTop: 24, padding: 18, border: '1px solid #dce8df', borderRadius: 16, background: '#f8fbf9', color: '#44403c', fontSize: 17, lineHeight: 1.55 }}>
                                <p style={{ margin: 0 }}>{actions.meditation}</p>
                                <p style={{ margin: '10px 0 0' }}>{actions.walk}</p>
                                <p style={{ margin: '10px 0 0' }}>{actions.nearby_anchor}</p>
                            </div>
                        )}
                    </section>
                </main>
            </div>
        </div>
    );
}
