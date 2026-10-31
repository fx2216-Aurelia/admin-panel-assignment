'use client';

import { useEffect, useRef, useState } from 'react';
import { createAmbientAudio, type AmbientSound } from '@/lib/ambientAudio';

const PREFERENCES_KEY = 'meditations-ambient-sound';

export default function AmbientSoundControl() {
    const [sound, setSound] = useState<AmbientSound>('rain');
    const [volume, setVolume] = useState(0.3);
    const [playing, setPlaying] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState('');
    const playerRef = useRef<ReturnType<typeof createAmbientAudio> | null>(null);
    const readyRef = useRef(false);

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
            readyRef.current = true;
        });
        return () => {
            active = false;
            playerRef.current?.stop();
            playerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!readyRef.current) return;
        try {
            localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ sound, volume }));
        } catch {}
        playerRef.current?.setVolume(volume);
    }, [sound, volume]);

    const stop = () => {
        playerRef.current?.stop();
        playerRef.current = null;
        setPlaying(false);
        setStarting(false);
    };

    const start = async (nextSound: AmbientSound) => {
        stop();
        setError('');
        setStarting(true);
        let player: ReturnType<typeof createAmbientAudio> | null = null;
        try {
            player = createAmbientAudio(nextSound, volume);
            playerRef.current = player;
            await player.start();
            if (playerRef.current !== player) return;
            setPlaying(true);
        } catch {
            player?.stop();
            if (playerRef.current === player) {
                playerRef.current = null;
                setPlaying(false);
                setStarting(false);
                setError('Sound is unavailable. Please try another browser or try again.');
            }
        } finally {
            if (playerRef.current === player) setStarting(false);
        }
    };

    return (
        <section aria-label="Relaxing background sound" className="mx-auto mb-8 max-w-3xl rounded-2xl border border-[#DCE9E0] bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-stone-800 dark:bg-stone-900/70">
            <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-[#365B48] dark:text-emerald-200">A little calm</span>
                <label className="flex items-center gap-2 text-stone-600 dark:text-stone-300">
                    <span className="sr-only">Background sound</span>
                    <select
                        value={sound}
                        onChange={(event) => {
                            const nextSound = event.target.value as AmbientSound;
                            setSound(nextSound);
                            if (playing || starting) void start(nextSound);
                        }}
                        className="min-h-11 rounded-lg border border-[#C9DCCF] bg-white px-3 dark:border-stone-700 dark:bg-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                    >
                        <option value="rain">Rain</option>
                        <option value="piano">Soft piano</option>
                    </select>
                </label>
                <button
                    type="button"
                    role="switch"
                    aria-checked={playing || starting}
                    aria-label="Background sound"
                    onClick={() => { if (playing || starting) stop(); else void start(sound); }}
                    className="min-h-11 rounded-full bg-[#365B48] px-4 font-semibold text-white transition hover:bg-[#284536] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:bg-emerald-200 dark:text-stone-900 dark:hover:bg-emerald-100"
                >
                    {starting ? 'Starting… · Turn off' : playing ? 'Sound on · Turn off' : 'Sound off · Turn on'}
                </button>
                <label className="flex items-center gap-2 text-stone-600 dark:text-stone-300">
                    <span>Volume</span>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(volume * 100)}
                        onChange={(event) => setVolume(Number(event.target.value) / 100)}
                        className="h-11 w-24 accent-[#365B48] dark:accent-emerald-200"
                    />
                </label>
                <span role="status" className="text-xs text-stone-500 dark:text-stone-400">
                    {error || (playing ? 'Take a breath. Stay a while.' : 'Starts only when you turn it on.')}
                </span>
            </div>
        </section>
    );
}
