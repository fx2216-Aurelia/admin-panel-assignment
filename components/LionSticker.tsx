export interface StickerPosition {
    x: number;
    y: number;
    scale: number;
    rotation: number;
}

export function LionSticker({
    position,
    onPointerDown,
    onPointerMove,
    onPointerUp,
}: {
    position: StickerPosition;
    onPointerDown?: (event: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove?: (event: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp?: (event: React.PointerEvent<SVGSVGElement>) => void;
}) {
    return (
        <svg
            data-polaroid-mascot
            data-x={position.x}
            data-y={position.y}
            data-size={26 * position.scale}
            data-rotation={position.rotation}
            viewBox="0 0 120 120"
            role="img"
            aria-label="Draggable lion mascot sticker"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
            style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${26 * position.scale}%`,
                height: 'auto',
                transform: `translate(-50%, -50%) rotate(${position.rotation}deg)`,
                touchAction: 'none',
            }}
        >
            <ellipse cx="60" cy="111" rx="33" ry="5" fill="#292524" opacity=".18" />
            <circle cx="60" cy="59" r="48" fill="#d88a3d" />
            <circle cx="60" cy="59" r="34" fill="#f3c477" />
            <circle cx="35" cy="33" r="13" fill="#d88a3d" />
            <circle cx="85" cy="33" r="13" fill="#d88a3d" />
            <circle cx="35" cy="33" r="6" fill="#f5c1c8" />
            <circle cx="85" cy="33" r="6" fill="#f5c1c8" />
            <ellipse cx="60" cy="72" rx="23" ry="17" fill="#fff5e6" />
            <ellipse cx="48" cy="56" rx="3.5" ry="5" fill="#29211d" />
            <ellipse cx="72" cy="56" rx="3.5" ry="5" fill="#29211d" />
            <circle cx="47" cy="54" r="1.2" fill="white" />
            <circle cx="71" cy="54" r="1.2" fill="white" />
            <path d="M56 68q4-5 8 0l-4 4Z" fill="#8b5a36" />
            <path d="M60 72v5m0 0q-5 5-9 0m9 0q5 5 9 0" fill="none" stroke="#8b5a36" strokeWidth="2" strokeLinecap="round" />
            <circle cx="42" cy="70" r="4" fill="#ffb6c1" opacity=".7" />
            <circle cx="78" cy="70" r="4" fill="#ffb6c1" opacity=".7" />
            <path d="M23 27q6-10 15-7m44 0q9-3 15 7" fill="none" stroke="#f8dca8" strokeWidth="4" strokeLinecap="round" />
        </svg>
    );
}
