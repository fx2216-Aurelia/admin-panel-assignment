'use client';

import { useEffect, useRef, useState } from 'react';
import { AmbientPlayer, type AmbientSound } from '@/lib/ambientAudio';

const PREFERENCES_KEY = 'meditations-ambient-sound';

const SOUNDS: { id: AmbientSound; label: string }[] = [
    { id: 'rain', label: 'Rain' },
    { id: 'piano', label: 'Piano' },
];

function SpeakerIcon({ on }: { on: boolean }) {
    return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            {on ? (
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            ) : (
                <path d="m16 9 5 6M21 9l-5 6" />
            )}
        </svg>
    );
}

export default function AmbientSoundControl() {
    const [sound, setSound] = useState<AmbientSound>('rain');
    const [volume, setVolume] = useState(0.5);
    const [playing, setPlaying] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const playerRef = useRef<AmbientPlayer | null>(null);

    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (!active) return;
            try {
                const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || 'null');
                if (stored?.sound === 'piano' || stored?.sound === 'rain') setSound(stored.sound);
                if (typeof stored?.volume === 'number' && Number.isFinite(stored.volume)) {
                    setVolume(Math.min(1, Math.max(0, stored.volume)));
                }
            } catch {}
        });
        return () => {
            active = false;
            playerRef.current?.dispose();
            playerRef.current = null;
        };
    }, []);

    const savePreferences = (nextSound: AmbientSound, nextVolume: number) => {
        try {
            localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ sound: nextSound, volume: nextVolume }));
        } catch {}
    };

    const play = (nextSound: AmbientSound) => {
        const player = playerRef.current ?? new AmbientPlayer();
        playerRef.current = player;
        setSound(nextSound);
        setPlaying(true);
        setUnavailable(false);
        savePreferences(nextSound, volume);
        player.setVolume(volume);
        player.play(nextSound).catch(() => {
            if (playerRef.current !== player) return;
            setPlaying(false);
            setUnavailable(true);
        });
    };

    const stop = () => {
        playerRef.current?.stop();
        setPlaying(false);
    };

    const changeVolume = (nextVolume: number) => {
        setVolume(nextVolume);
        playerRef.current?.setVolume(nextVolume);
        savePreferences(sound, nextVolume);
    };

    return (
        <div
            role="group"
            aria-label="Background sound"
            className="fixed bottom-5 right-5 z-40 flex items-center gap-0.5 rounded-full border border-stone-200/80 bg-white/80 p-1 text-xs shadow-sm backdrop-blur-md dark:border-stone-700/70 dark:bg-stone-900/80"
        >
            <button
                type="button"
                aria-pressed={playing}
                aria-label={playing ? 'Turn background sound off' : 'Turn background sound on'}
                title={unavailable ? 'Sound is unavailable in this browser' : playing ? 'Turn sound off' : 'Turn sound on'}
                onClick={() => (playing ? stop() : play(sound))}
                className={`grid h-8 w-8 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                    playing
                        ? 'text-[#365B48] dark:text-emerald-200'
                        : 'text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200'
                }`}
            >
                <SpeakerIcon on={playing} />
            </button>
            {SOUNDS.map(({ id, label }) => {
                const active = playing && sound === id;
                return (
                    <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => (active ? stop() : play(id))}
                        className={`h-8 rounded-full px-3 font-medium tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                            active
                                ? 'bg-[#365B48] text-white dark:bg-emerald-200 dark:text-stone-900'
                                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100'
                        }`}
                    >
                        {label}
                    </button>
                );
            })}
            {playing && (
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(volume * 100)}
                    onChange={(event) => changeVolume(Number(event.target.value) / 100)}
                    aria-label="Volume"
                    className="mx-2 h-1 w-16 cursor-pointer accent-[#365B48] dark:accent-emerald-200"
                />
            )}
            <span role="status" className="sr-only">
                {unavailable ? 'Sound is unavailable in this browser.' : playing ? `${sound === 'rain' ? 'Rain' : 'Piano'} is playing.` : 'Sound is off.'}
            </span>
        </div>
    );
}
