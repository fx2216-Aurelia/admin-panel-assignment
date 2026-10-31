export type AmbientSound = 'piano' | 'rain';

type Track = { stop: () => void };

const MAX_GAIN = 0.5;

function createRain(context: AudioContext, output: AudioNode): Track {
    // Looping pink noise, band-limited so it reads as soft rain rather than hiss.
    const buffer = context.createBuffer(2, context.sampleRate * 6, context.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let index = 0; index < samples.length; index++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.969 * b2 + white * 0.153852;
            b3 = 0.8665 * b3 + white * 0.3104856;
            b4 = 0.55 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.016898;
            samples[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }
    }

    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    highpass.type = 'highpass';
    highpass.frequency.value = 250;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2600;
    gain.gain.value = 0.9;
    source.connect(highpass).connect(lowpass).connect(gain).connect(output);
    source.start();

    return {
        stop() {
            source.onended = () => gain.disconnect();
            try { source.stop(context.currentTime + 0.2); } catch {}
        },
    };
}

function createPiano(context: AudioContext, output: AudioNode): Track {
    // Sparse notes from a C major pentatonic scale with a soft echo.
    const notes = [196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25];
    const bus = context.createGain();
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const tone = context.createBiquadFilter();
    const wet = context.createGain();
    delay.delayTime.value = 0.42;
    feedback.gain.value = 0.32;
    tone.type = 'lowpass';
    tone.frequency.value = 1600;
    wet.gain.value = 0.3;
    bus.connect(output);
    bus.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(wet);
    wet.connect(output);

    const voices = new Set<OscillatorNode>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const strike = (frequency: number, when: number, level: number) => {
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0, when);
        envelope.gain.linearRampToValueAtTime(level, when + 0.015);
        envelope.gain.exponentialRampToValueAtTime(0.0001, when + 4);
        envelope.connect(bus);
        [[1, 1], [2, 0.3], [3, 0.08]].forEach(([harmonic, amount], index) => {
            const oscillator = context.createOscillator();
            const partial = context.createGain();
            oscillator.frequency.value = frequency * harmonic;
            partial.gain.value = amount;
            oscillator.connect(partial).connect(envelope);
            oscillator.onended = () => {
                voices.delete(oscillator);
                partial.disconnect();
                if (index === 0) envelope.disconnect();
            };
            voices.add(oscillator);
            oscillator.start(when);
            oscillator.stop(when + 4.1);
        });
    };

    const play = () => {
        if (stopped) return;
        const when = context.currentTime + 0.05;
        const note = notes[Math.floor(Math.random() * notes.length)];
        strike(note, when, 0.2);
        if (Math.random() < 0.3) strike(note / 2, when + 0.03, 0.1);
        timer = setTimeout(play, 2400 + Math.random() * 2000);
    };
    play();

    return {
        stop() {
            stopped = true;
            clearTimeout(timer);
            const when = context.currentTime + 0.2;
            voices.forEach((oscillator) => { try { oscillator.stop(when); } catch {} });
            setTimeout(() => {
                [bus, delay, feedback, tone, wet].forEach((node) => node.disconnect());
            }, 600);
        },
    };
}

/**
 * One AudioContext for the lifetime of the control. Switching sounds swaps
 * the track; stopping fades out and suspends the context so nothing keeps playing.
 */
export class AmbientPlayer {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private track: Track | null = null;
    private volume = 0.5;
    private generation = 0;

    /** Call from a click handler so the browser allows audio. Resolves false if superseded. */
    async play(sound: AmbientSound): Promise<boolean> {
        const generation = ++this.generation;
        if (!this.context || !this.master) {
            this.context = new AudioContext();
            this.master = this.context.createGain();
            this.master.gain.value = 0;
            this.master.connect(this.context.destination);
        }
        const { context, master } = this;

        this.track?.stop();
        this.track = sound === 'rain' ? createRain(context, master) : createPiano(context, master);
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(0, context.currentTime);
        master.gain.setTargetAtTime(this.volume * MAX_GAIN, context.currentTime, 0.4);

        await context.resume();
        if (generation !== this.generation) return false;
        if (context.state !== 'running') {
            this.stop();
            throw new Error('Audio could not start.');
        }
        return true;
    }

    stop() {
        this.generation++;
        this.track?.stop();
        this.track = null;
        const { context, master } = this;
        if (!context || !master) return;
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(0, context.currentTime, 0.04);
        setTimeout(() => {
            if (!this.track && context.state === 'running') void context.suspend().catch(() => {});
        }, 250);
    }

    setVolume(value: number) {
        this.volume = Math.min(1, Math.max(0, value));
        const { context, master } = this;
        if (!context || !master || !this.track) return;
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(this.volume * MAX_GAIN, context.currentTime, 0.1);
    }

    dispose() {
        this.stop();
        void this.context?.close().catch(() => {});
        this.context = null;
        this.master = null;
    }
}
