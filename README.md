# Mahbub & Zarin — Wedding Day Controller

A single-page, **Vanilla JS** (no frameworks, no build tools) operator console for
running Mahbub & Zarin's wedding live. It's a **bulletproof, speech-only soundboard**:
**8 chronological stage buttons**, each a tap-to-play recorded voice announcement (local
MP3). When a cue finishes, the app shows the operator a **manual instruction** to start
that moment's background music on the venue's own Spotify — the controller itself never
talks to Spotify, so there are no API keys, no auth, and nothing to break mid-ceremony.

**Ivory & Champagne** light glassmorphism UI — warm porcelain surfaces, champagne-gold
accents, Outfit for the UI and Cormorant Garamond for the couple's names. Touch-first
sizing (built for an iPad at the venue; works everywhere).

Files: `index.html`, `style.css`, `app.js`, and an `audio/` folder for the 9 MP3s.

> **Why no Spotify integration?** The app was briefly expanded to drive Spotify
> automatically (pause / crossfade / resume playlists across 14 stages). That was
> rolled back this morning to remove API risk on the day: the venue already runs its
> own Spotify independently, so the controller is back to being a pure speech
> soundboard with on-screen cues for the DJ.

## Setup (do this before the event)

1. **Audio** — drop the 9 MP3s into `audio/` (filenames must match the STAGES `files`
   list in `app.js`; see `audio/README.md`). That's the only setup — no accounts, no
   keys, no network dependencies.

## Run locally

Serve the folder over HTTP (so relative paths and the browser audio API behave), then
open it:

```bash
cd alom-wedding-controller
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

## How it works

- **8 stage buttons** grouped into phases (Arrival · Processional · Ceremony ·
  Reception · Departure). Each card is one voice announcement.
- **Tap to play** — a tap plays the MP3 (the Nikkah Preparation cue plays two files
  back-to-back: Qur'an recitation → English announcement). While it plays, the card
  shows a live gold progress bar and an elapsed/total readout (`0:12 / 0:31`); the
  two-part Ceremony cue shows `Part 1 of 2`.
- **Confirm gate** — high-stakes stages (Groom Entrance, Bridal Entry, Qobul & Signing,
  Cake, Ruksati) show a **Confirm** badge and open an "Event manager confirmed — play
  now?" dialog before playing, since these are live, one-take moments.
- **Manual music cue** — when an announcement finishes, the card reveals a one-line
  instruction telling the DJ what music to start on the venue's Spotify (e.g.
  *"Audio finished — manually start: Bridal entrance music."*) plus a **Dismiss**
  button. The app never starts the music itself.
- **One announcement at a time** — tapping a second cue while one is playing is
  blocked with a toast; finish the current one or hit STOP ALL first.
- **Progress** — the header counts completed cues (`3 of 8 complete`) and the gold
  progress bar fills as the day moves forward. The "current" (next-up) cue is
  gold-rimmed. When all 8 have played, a small celebration state appears.

## Controls

- **STOP ALL** (top-right) — instantly halts the current announcement and resets its
  card. It only ever touches the local HTML5 audio player — there is nothing else to
  stop.
- `Shift + Esc` — emergency STOP ALL AUDIO (same as the button).
- `Tab` / `Enter` / `Space` — full keyboard operation; visible focus rings.
- Honors `prefers-reduced-motion` (no animations, static entrance, blobs hidden).

## The 8 cues

1. Guest Arrival — *Guest arrival music*
2. Groom Entrance (Confirm) — *Groom entrance music*
3. Bride Grand Entrance (Confirm) — *Bridal entrance music*
4. Nikkah Preparation — *no music (Qur'an recitation + English announcement)*
5. Qobul & Signing (Confirm) — *Qobul & signing music*
6. Cake Celebration (Confirm) — *Cake celebration music*
7. Food Service — *Dinner music*
8. Ruksati & End Time (Confirm) — *Ruksati music*
