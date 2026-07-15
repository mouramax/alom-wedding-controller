# Mahbub & Zarin — Wedding Day Controller

A single-page, **Vanilla JS** (no frameworks, no build tools) operator console for
running Mahbub & Zarin's wedding live. **Music-first**: 14 chronological stage
buttons, each one a transition into its own Spotify playlist — 8 stages also play
a pre-generated voice announcement (local MP3) first. **Ivory & Champagne** light
glassmorphism UI — warm porcelain surfaces, champagne-gold accents, Outfit for the
UI and Cormorant Garamond for the couple's names. Touch-first sizing (built for an
iPad at the venue; works everywhere).

Files: `index.html`, `style.css`, `app.js`, and an `audio/` folder for the 9 MP3s.

## Setup (do these before the event)

1. **Spotify app** — create one at <https://developer.spotify.com> → Dashboard →
   Create app. Under **Settings → Redirect URIs**, add:
   - local:  `http://127.0.0.1:8000/`  (when serving this folder as the web root)
   - prod:   `https://<you>.github.io/<repo>/alom-wedding-controller/`
   Copy the **Client ID** into `CONFIG.CLIENT_ID` at the top of `app.js`.
   (Dev Mode: add the operator's Spotify account under User Management.)
2. **Playlists** — paste your 14 Spotify playlist URIs into the `PLAYLISTS` map
   in `app.js`, one per stage (`guest_arrival`, `gate_time`, `groom_arrival`,
   `before_bride`, `bridal_entry`, `nikkah`, `qobul`, `gunta_removing`, `dinner`,
   `cake`, `cake_again`, `upbeat`, `ruksati_end`, `final_departure`). Stages 13
   and 14 both use "End time" music — paste the same URI into both slots if a
   single End-time playlist is kept.
3. **Audio** — drop the 9 MP3s into `audio/` (see `audio/README.md`).

No client secret is ever needed — the app uses **Authorization Code + PKCE**
(Spotify's current recommended flow for static sites; the deprecated Implicit
Grant flow is avoided).

## Run locally

Because Spotify auth needs `http(s)://` (not `file://`) and the browser crypto
API needs a secure context, serve the folder over HTTP:

```bash
cd alom-wedding-controller
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

Register the exact URL you open as a Redirect URI in the Spotify dashboard.

## How it works

- **14 stage buttons** grouped into phases (Arrival · Processional · Ceremony ·
  Reception · Departure). Each card carries a badge showing what the tap does:
  **Voice + Music** (gold, mic icon — 8 stages) or **Music only** (neutral, note
  icon — 6 stages). High-stakes stages (Groom Arrival, Bridal Entry, Qobul,
  Ruksati) also show a **Confirm** badge and gate behind an "Event manager
  confirmed — play now?" dialog.
- **Voice + Music sequence:** fade Spotify out → play the local MP3 → lock
  double-taps → on end, reveal a **Start music** action that fades the stage's
  playlist in (the DJ controls the exact music moment).
- **Music-only stages** bypass the local audio player entirely — one tap
  crossfades straight into the stage's playlist and marks the stage complete.
- **Smooth music fades** — before a voice plays, Spotify volume steps down to
  silence (~0.7s) and pauses; when a playlist starts, it fades back up from 0.
  Some devices (casting targets, certain speakers) reject volume control — the
  app detects this and falls back to a plain pause/play, silently. **STOP ALL
  always hard-pauses instantly** (no fade — it's an emergency control).
- **Announcement progress** — while a voice plays, its card shows a live gold
  progress bar and an elapsed/total readout (`0:12 / 0:31`); the two-part
  Ceremony cue shows `Part 1 of 2`.
- **Now Playing bar** (bottom, visible when connected) — album art, track,
  artist, playing device, and a play/pause button. Polls Spotify every 5s while
  the tab is visible and no voice cue is playing.
- **STOP ALL** (top-right, or `Shift+Esc`) instantly stops the MP3 and pauses Spotify.
- **Spotify status pill** shows 4 states (disconnected / connecting / connected /
  error) — never color alone.

## Token refresh ("DJ never gets logged out")

Tokens refresh silently in the background via four layers: a proactive timer
(~60s before expiry), a pre-call freshness check, a reactive 401 retry, and a
re-check when the tab regains focus. The refresh token is persisted so a page
reload mid-event restores the session without re-consent. If the session ever
can't be refreshed (e.g. app revoked), the app degrades gracefully — cues and
STOP keep working, and the pill shows "reconnect".

Note: localStorage keys keep the historical `alom_wc:` prefix so an existing
signed-in session survives this redesign.

## Controls

- `Shift + Esc` — Emergency STOP ALL AUDIO.
- `Tab` / `Enter` / `Space` — full keyboard operation; visible focus rings.
- Honors `prefers-reduced-motion` (no animations, static entrance, blobs hidden).
