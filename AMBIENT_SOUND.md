# Relaxing background sound

The homepage has a small floating pill in the bottom-right corner: a speaker toggle, then Rain, Piano and forest.

- Click a sound to play it; click the active one (or the speaker) to turn sound off. Clicking another sound switches directly.
- A volume slider appears only while sound is playing.
- Sound never starts on page load. The chosen sound and volume are saved locally; playback is not restored.
- Leaving the homepage stops audio and closes the audio context.

## Audio

All soundscapes are synthesized with the Web Audio API; no audio files or dependencies. Rain is band-limited pink noise. Piano is sparse, randomly chosen notes from a C major pentatonic scale with a soft echo — piano-like, not a recorded piano. forest combines soft, slowly moving wind and leaf rustle with occasional randomized bird calls; it is synthesized ambience, not a field recording.

`AmbientPlayer` (`lib/ambientAudio.ts`) keeps one AudioContext for the control's lifetime. Switching stops the current track's sources and starts the new one; stopping fades out, stops every source and suspends the context, so nothing keeps playing in the background.

## Files

- `components/AmbientSoundControl.tsx`: the pill UI, preferences and cleanup.
- `lib/ambientAudio.ts`: `AmbientPlayer` and the three tracks.
- `app/page.tsx`: renders the control.

## Verification

- Run `npx tsc --noEmit` and `npx eslint lib/ambientAudio.ts components/AmbientSoundControl.tsx`.
- Check start, stop, switching, stop while starting, quick off/on, and dispose; forest must stop its wind, modulation and bird sources and cancel future bird calls.
- Listen in the preview to check wind level and bird-call spacing; verify the three-option pill fits on mobile.
