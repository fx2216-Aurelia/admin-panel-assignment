# Relaxing background sound

The homepage includes a compact sound control below its header, styled to match the existing green palette and dark mode.

- Choose Rain or Soft piano and click Turn on. Sound never starts automatically on page load or reload.
- Turn off stops playback and releases the audio context after a short fade-out.
- Volume and the chosen sound are saved locally when browser storage is available. Playback is deliberately not restored.
- Switching sounds while playing replaces the previous player; leaving the homepage also stops audio.
- Playback failures leave the control off with a visible retry message. No login is required for the control.

## Audio source

Both soundscapes are synthesized locally with the browser's Web Audio API. Rain is filtered stereo noise; Soft piano is a slow, piano-like harmonic melody, not a recorded acoustic piano. No third-party audio requests, new runtime dependencies, licensed music files, or database changes are needed. Browser/OS audio restrictions still apply.

## Files

- `components/AmbientSoundControl.tsx`: accessible switch, sound selection, volume slider, preferences, and cleanup.
- `lib/ambientAudio.ts`: audio generation, fades, volume limits, and resource disposal.
- `app/page.tsx`: imports and renders the control directly below the existing header.

## Verification

- `npx eslint components/AmbientSoundControl.tsx lib/ambientAudio.ts`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: compilation and TypeScript passed; prerendering `/login` failed because this workspace has no Supabase URL/key. Production build remains unverified with the project's real environment.
- Isolated React StrictMode smoke checks passed with mocked AudioContext: default silence, both modes, switching, volume persistence, stopping, rapid toggles, unmount cleanup, playback failure/recovery, and malformed saved preferences.
- Real Chromium playback checks could not run: the container lacks `libglib-2.0.so.0`. Audible quality, real-browser autoplay behavior, and full-page visual appearance have not been verified.

## Manual acceptance

Run the website using its existing Supabase configuration. On desktop and mobile: confirm silence on first load; start each sound; adjust volume to zero and back; switch while playing; toggle off; refresh; navigate away; and verify no lingering audio or console errors. Check keyboard access, narrow-screen wrapping, dark mode, and actual sound comfort at a low volume.

This change does not deploy the website or alter the remote GitHub repository.
