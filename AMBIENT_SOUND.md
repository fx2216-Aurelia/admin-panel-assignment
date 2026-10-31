# Relaxing background sound

The homepage has a small floating pill in the bottom-right corner: a speaker toggle, then Rain and Piano.

- Click Rain or Piano to play it; click the active one (or the speaker) to turn sound off. Clicking the other sound switches directly.
- A volume slider appears only while sound is playing.
- Sound never starts on page load. The chosen sound and volume are saved locally; playback is not restored.
- Leaving the homepage stops audio and closes the audio context.

## Audio

Both soundscapes are synthesized with the Web Audio API; no audio files or dependencies. Rain is band-limited pink noise. Piano is sparse, randomly chosen notes from a C major pentatonic scale with a soft echo — piano-like, not a recorded piano.

`AmbientPlayer` (`lib/ambientAudio.ts`) keeps one AudioContext for the control's lifetime. Switching stops the current track's sources and starts the new one; stopping fades out, stops every source and suspends the context, so nothing keeps playing in the background.

## Files

- `components/AmbientSoundControl.tsx`: the pill UI, preferences and cleanup.
- `lib/ambientAudio.ts`: `AmbientPlayer` and the two tracks.
- `app/page.tsx`: renders the control.

## Verification

- `npx tsc --noEmit` and `npx eslint` on the two files pass.
- Mocked-AudioContext checks pass: start, stop (all sources stopped, context suspended), switching (single context, previous voices stopped), stop while starting, quick off/on, and dispose.
- Not verified in a real browser here (no Chromium in the container): listening quality and the rendered look still need a manual check on the preview.
