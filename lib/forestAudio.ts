export function createForest(context: AudioContext, output: AudioNode): { stop: () => void } {
    const bus = context.createGain();
    const wind = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const rustle = context.createGain();
    const breeze = context.createOscillator();
    const movement = context.createGain();
    const buffer = context.createBuffer(2, context.sampleRate * 12, context.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        let brown = 0;
        for (let index = 0; index < samples.length; index++) {
            const white = Math.random() * 2 - 1;
            brown = (brown + white * 0.025) / 1.025;
            samples[index] = brown * 2.8 + white * 0.045;
        }
        const seam = Math.floor(context.sampleRate * 0.2);
        for (let index = 0; index < seam; index++) {
            const blend = index / (seam - 1);
            const position = samples.length - seam + index;
            samples[position] = samples[position] * (1 - blend) + samples[0] * blend;
        }
    }

    wind.buffer = buffer;
    wind.loop = true;
    highpass.type = 'highpass';
    highpass.frequency.value = 180;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1800;
    rustle.gain.value = 0.7;
    breeze.frequency.value = 0.075;
    movement.gain.value = 0.18;
    bus.connect(output);
    wind.connect(highpass).connect(lowpass).connect(rustle).connect(bus);
    breeze.connect(movement).connect(rustle.gain);
    wind.start();
    breeze.start();

    const voices = new Set<OscillatorNode>();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const birdsong = () => {
        if (stopped) return;
        const count = 2 + Math.floor(Math.random() * 3);
        const pitch = 1800 + Math.random() * 1400;
        const position = Math.random() * 1.4 - 0.7;
        const level = 0.035 + Math.random() * 0.025;
        for (let index = 0; index < count; index++) {
            const when = context.currentTime + 0.05 + index * (0.17 + Math.random() * 0.09);
            const duration = 0.1 + Math.random() * 0.12;
            const bird = context.createOscillator();
            const envelope = context.createGain();
            const pan = context.createStereoPanner();
            bird.type = 'sine';
            bird.frequency.setValueAtTime(pitch * (0.9 + Math.random() * 0.2), when);
            bird.frequency.exponentialRampToValueAtTime(pitch * 1.35, when + duration * 0.4);
            bird.frequency.exponentialRampToValueAtTime(pitch * 0.85, when + duration);
            envelope.gain.setValueAtTime(0, when);
            envelope.gain.linearRampToValueAtTime(level, when + 0.018);
            envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
            pan.pan.value = position;
            bird.connect(envelope).connect(pan).connect(bus);
            bird.onended = () => {
                voices.delete(bird);
                bird.disconnect();
                envelope.disconnect();
                pan.disconnect();
            };
            voices.add(bird);
            bird.start(when);
            bird.stop(when + duration + 0.02);
        }
        timer = setTimeout(birdsong, 5000 + Math.random() * 8000);
    };
    timer = setTimeout(birdsong, 2000 + Math.random() * 2500);

    return {
        stop() {
            if (stopped) return;
            stopped = true;
            clearTimeout(timer);
            bus.disconnect();
            const when = context.currentTime;
            voices.forEach((bird) => { try { bird.stop(when); } catch {} });
            wind.onended = () => {
                [wind, highpass, lowpass, rustle, breeze, movement].forEach((node) => node.disconnect());
            };
            try { wind.stop(when); } catch {}
            try { breeze.stop(when); } catch {}
        },
    };
}
