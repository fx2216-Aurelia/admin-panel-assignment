export type AmbientSound = 'piano' | 'rain';

export function createAmbientAudio(sound: AmbientSound, volume: number) {
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    const setVolume = (value: number) => {
        if (stopped) return;
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(Math.min(1, Math.max(0, value)) * 0.35, context.currentTime, 0.15);
    };

    const start = async () => {
        await context.resume();
        if (stopped) return;
        if (context.state !== 'running') throw new Error('Audio could not start.');

        if (sound === 'rain') {
            const buffer = context.createBuffer(2, context.sampleRate * 8, context.sampleRate);
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const samples = buffer.getChannelData(channel);
                for (let index = 0; index < samples.length; index++) {
                    samples[index] = Math.random() * 2 - 1;
                }
            }
            const source = context.createBufferSource();
            const filter = context.createBiquadFilter();
            source.buffer = buffer;
            source.loop = true;
            filter.type = 'lowpass';
            filter.frequency.value = 1400;
            filter.Q.value = 0.4;
            source.connect(filter);
            filter.connect(master);
            source.start();
        } else {
            const notes = [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66];
            let noteIndex = 0;
            const playNote = () => {
                if (stopped || context.state !== 'running') return;
                const frequency = notes[noteIndex++ % notes.length];
                const envelope = context.createGain();
                const now = context.currentTime;
                envelope.gain.setValueAtTime(0, now);
                envelope.gain.linearRampToValueAtTime(0.24, now + 0.02);
                envelope.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
                envelope.connect(master);
                [1, 2, 3].forEach((harmonic) => {
                    const oscillator = context.createOscillator();
                    const gain = context.createGain();
                    oscillator.type = 'sine';
                    oscillator.frequency.value = frequency * harmonic;
                    gain.gain.value = 1 / (harmonic * harmonic);
                    oscillator.connect(gain);
                    gain.connect(envelope);
                    oscillator.onended = () => {
                        oscillator.disconnect();
                        gain.disconnect();
                        if (harmonic === 3) envelope.disconnect();
                    };
                    oscillator.start(now);
                    oscillator.stop(now + 3.6);
                });
            };
            playNote();
            timer = setInterval(playNote, 1800);
        }
        setVolume(volume);
    };

    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (timer) clearInterval(timer);
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(0, context.currentTime, 0.025);
        setTimeout(() => { void context.close().catch(() => {}); }, 150);
    };

    return { start, stop, setVolume };
}
