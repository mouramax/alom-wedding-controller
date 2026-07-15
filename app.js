/* ============================================================
   Mahbub & Zarin — Wedding Day Controller — app.js
   Vanilla JS · Spotify Authorization Code + PKCE · local MP3 cues
   ------------------------------------------------------------
   SETUP (do these 4 things before the event):
     1. Create a Spotify app at https://developer.spotify.com
        → Dashboard → Create app. Under "Settings", add Redirect URIs:
            http://127.0.0.1:8000/alom-wedding-controller/   (local)
            https://<you>.github.io/<repo>/alom-wedding-controller/  (prod)
        Copy the Client ID into CONFIG.CLIENT_ID below.
     2. (Dev Mode) add the operator's Spotify account under "User Management".
     3. Paste your 14 Spotify playlist URIs into PLAYLISTS below (one per stage).
     4. Drop the 9 MP3 files into the ./audio/ folder (names must match STAGES).
   ============================================================ */

'use strict';

/* ======================= CONFIG ======================= */
const CONFIG = {
  CLIENT_ID: '67089320701242d7aa0ea8b48250390b', // Provided by Alom
  SCOPES: 'user-modify-playback-state user-read-playback-state',
};

// Redirect URI auto-detects from the current URL (works locally + on GitHub Pages).
// Normalized to a clean directory URL (strip index.html, ensure trailing slash).
function redirectUri() {
  let p = location.pathname.replace(/\/index\.html$/i, '/');
  if (!p.endsWith('/')) p += '/';
  return location.origin + p;
}

// Playlist URIs — fill these in. Find a URI via Spotify "Share → URI" or copy from the URL.
// One playlist per stage. Stages 13 & 14 both use "End time" music — paste the
// same URI into both slots if the client keeps a single End-time playlist.
const PLAYLISTS = {
  guest_arrival:   'spotify:playlist:__FILL_ME__',
  gate_time:       'spotify:playlist:__FILL_ME__',
  groom_arrival:   'spotify:playlist:__FILL_ME__',
  before_bride:    'spotify:playlist:__FILL_ME__',
  bridal_entry:    'spotify:playlist:__FILL_ME__',
  nikkah:          'spotify:playlist:__FILL_ME__',
  qobul:           'spotify:playlist:__FILL_ME__',
  gunta_removing:  'spotify:playlist:__FILL_ME__',
  dinner:          'spotify:playlist:__FILL_ME__',
  cake:            'spotify:playlist:__FILL_ME__',
  cake_again:      'spotify:playlist:__FILL_ME__',
  upbeat:          'spotify:playlist:__FILL_ME__',
  ruksati_end:     'spotify:playlist:__FILL_ME__',
  final_departure: 'spotify:playlist:__FILL_ME__',
};

/* ---------- The 14 stages (data-driven, chronological) ----------
   Music-first: every stage is a music transition into its own playlist.
   Stages with voice files play the announcement first, then reveal a
   "Start music" action; stages with files:[] switch playlists directly. */
const STAGES = [
  { id:'welcome',   step:1,  phase:'Arrival',      label:'Guest Arrival',       sub:'Seating & welcome',                 files:['01_guest_welcome.mp3'],     playlist:'guest_arrival',   music:'Guest arrival music',   manual:false },
  { id:'gate',      step:2,  phase:'Arrival',      label:'Gate Time',           sub:'Gate moment songs',                 files:[],                           playlist:'gate_time',       music:'Gate time music',       manual:false },
  { id:'groom',     step:3,  phase:'Processional', label:'Groom Arrival',       sub:'Groom processional',                files:['02_groom_entrance.mp3'],    playlist:'groom_arrival',   music:'Groom arrival music',   manual:true  },
  { id:'prebride',  step:4,  phase:'Processional', label:'Before Bride Arrives',sub:'Build-up before the bride',         files:[],                           playlist:'before_bride',    music:'Pre-bridal music',      manual:false },
  { id:'bride',     step:5,  phase:'Processional', label:'Bridal Entry',        sub:'Bride processional',                files:['03_bride_entrance.mp3'],    playlist:'bridal_entry',    music:'Bridal entry music',    manual:true  },
  { id:'nikkah',    step:6,  phase:'Ceremony',     label:'Nikkah',              sub:'Quran recitation → English Nikkah', files:['04a_quran_ar_rum_30_21_verified.mp3','04b_nikkah_english_announcement.mp3'], playlist:'nikkah', music:'Nikkah music', manual:false },
  { id:'qobul',     step:7,  phase:'Ceremony',     label:'Qobul Time',          sub:'“I do” & marriage register',        files:['05_qubool_and_signing.mp3'],playlist:'qobul',           music:'Qobul time music',      manual:true  },
  { id:'gunta',     step:8,  phase:'Ceremony',     label:'Gunta Removing',      sub:'Gunta removing moment',             files:[],                           playlist:'gunta_removing',  music:'Gunta removing music',  manual:false },
  { id:'food',      step:9,  phase:'Reception',    label:'Dinner & Photos',     sub:'Dinner is served',                  files:['06_food_service.mp3'],      playlist:'dinner',          music:'Dinner & photos music', manual:false },
  { id:'cake',      step:10, phase:'Reception',    label:'Cake Celebration',    sub:'Cake-cutting moment',               files:['07_cake_cutting.mp3'],      playlist:'cake',            music:'Cake celebration music',manual:false },
  { id:'cake2',     step:11, phase:'Reception',    label:'Cake Songs Again',    sub:'Cake songs, one more round',        files:[],                           playlist:'cake_again',      music:'Cake songs (again)',    manual:false },
  { id:'upbeat',    step:12, phase:'Reception',    label:'Upbeat Songs',        sub:'Dance-floor energy',                files:[],                           playlist:'upbeat',          music:'Upbeat music',          manual:false },
  { id:'ruksati',   step:13, phase:'Departure',    label:'Ruksati Preparation', sub:'Send-off preparation',              files:['08_ruksati_preparation.mp3'],playlist:'ruksati_end',    music:'End time music',        manual:true  },
  { id:'departure', step:14, phase:'Departure',    label:'Final Departure',     sub:'Final send-off',                    files:[],                           playlist:'final_departure', music:'End time music',        manual:false },
];
const PHASE_ORDER = ['Arrival','Processional','Ceremony','Reception','Departure'];

/* ======================= STATE ======================= */
const state = {
  playingLock: null,    // id of cue currently playing, or null
  completed: new Set(), // completed cue ids
};

// Spotify "now playing" snapshot (kept fresh by a 5s poll while connected)
const np = {
  isPlaying: false,
  volume: null, // last known device volume_percent, for fades
};

let els = {};
let pendingConfirm = null;

/* ======================= TOKEN VAULT =======================
   access_token in memory; refresh_token + expires_at in localStorage
   (survives reload so the DJ never gets logged out); PKCE
   verifier + state in sessionStorage (single-tab handshake only). */
const STORE = {
  refresh:  'alom_wc:rt',
  expires:  'alom_wc:exp',
  verifier: 'alom_wc:pkce_v',
  pkceState:'alom_wc:pkce_s',
};
let _accessToken = null;
let _refreshTimer = null;
let _refreshInFlight = null;

class AuthError extends Error {}

const vault = {
  get refreshToken() { return localStorage.getItem(STORE.refresh); },
  get expiresAt()    { return Number(localStorage.getItem(STORE.expires)) || 0; },
  setTokens({ access_token, refresh_token, expires_in }) {
    _accessToken = access_token;
    const exp = Date.now() + expires_in * 1000;
    localStorage.setItem(STORE.expires, String(exp));
    if (refresh_token) localStorage.setItem(STORE.refresh, refresh_token);
    scheduleRefresh(exp);
  },
  clear() {
    _accessToken = null;
    localStorage.removeItem(STORE.refresh);
    localStorage.removeItem(STORE.expires);
    clearTimeout(_refreshTimer);
  },
};
const isExpiringSoon = () => vault.expiresAt - Date.now() < 90_000;

/* ======================= PKCE CRYPTO ======================= */
function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(str) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
}
function randomVerifier() {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

/* ======================= AUTH FLOW ======================= */
async function beginLogin() {
  if (!window.crypto || !crypto.subtle) {
    setStatus('error', 'Secure context required');
    showToast('Open the app via https:// or http://localhost — browser crypto is blocked here.', 'error');
    return;
  }
  if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID') {
    showToast('Set your Spotify CLIENT_ID at the top of app.js first.', 'error');
    return;
  }
  const verifier = randomVerifier();
  const challenge = b64url(await sha256(verifier));
  const csrf = randomVerifier().slice(0, 16);
  sessionStorage.setItem(STORE.verifier, verifier);
  sessionStorage.setItem(STORE.pkceState, csrf);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state: csrf,
  });
  setStatus('connecting', 'Connecting to Spotify…');
  location.assign('https://accounts.spotify.com/authorize?' + params);
}

async function exchangeCode(code) {
  const verifier = sessionStorage.getItem(STORE.verifier);
  sessionStorage.removeItem(STORE.verifier);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: CONFIG.CLIENT_ID,
    code_verifier: verifier || '',
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'EXCHANGE_FAILED');
  vault.setTokens(data);
}

async function handleRedirectBack() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const error = params.get('error');
  cleanUrl();
  if (error) {
    setStatus('error', 'Spotify sign-in cancelled');
    showToast('Spotify sign-in was cancelled.', 'warning');
    restoreSession();
    return;
  }
  if (!code) { restoreSession(); return; }
  const expected = sessionStorage.getItem(STORE.pkceState);
  sessionStorage.removeItem(STORE.pkceState);
  if (!expected || expected !== returnedState) {
    setStatus('error', 'Auth state mismatch');
    showToast('Security check failed (state mismatch). Try connecting again.', 'error');
    restoreSession();
    return;
  }
  setStatus('connecting', 'Authorizing…');
  try {
    await exchangeCode(code);
    setStatus('connected', 'Spotify connected');
    showToast('Spotify connected.', 'success');
  } catch (e) {
    setStatus('error', 'Spotify sign-in failed');
    showToast('Sign-in failed: ' + (e.message || 'unknown error'), 'error');
    restoreSession();
  }
}

/* ---------- Seamless background refresh (4 layers) ---------- */
function scheduleRefresh(expiresAt) {
  clearTimeout(_refreshTimer);
  const ms = expiresAt - Date.now() - 60_000; // 60s safety margin
  if (ms > 0 && ms < 2_000_000_000) {
    _refreshTimer = setTimeout(() => { refreshAccessToken().catch(() => {}); }, ms);
  }
}

function refreshAccessToken() {
  if (_refreshInFlight) return _refreshInFlight;
  const rt = vault.refreshToken;
  if (!rt) {
    setStatus('error', 'Spotify session ended — reconnect');
    return Promise.reject(new AuthError('NO_REFRESH'));
  }
  _refreshInFlight = (async () => {
    try {
      const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: CONFIG.CLIENT_ID });
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = await res.json();
      if (!res.ok) throw new AuthError(data.error || 'REFRESH_FAILED');
      // Refresh-token continuity: keep the new one if Spotify rotates it.
      vault.setTokens({ access_token: data.access_token, refresh_token: data.refresh_token || rt, expires_in: data.expires_in });
      setStatus('connected', 'Spotify connected');
      return _accessToken;
    } catch (e) {
      vault.clear();
      setStatus('error', 'Spotify session ended — reconnect');
      throw e;
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

/** Returns a valid access token, refreshing silently if needed (layers 2). */
async function getValidToken() {
  if (_accessToken && !isExpiringSoon()) return _accessToken;
  if (vault.refreshToken) { await refreshAccessToken(); return _accessToken; }
  throw new AuthError('NO_SESSION');
}

function restoreSession() {
  if (vault.refreshToken) {
    setStatus('connecting', 'Reconnecting to Spotify…');
    refreshAccessToken()
      .then(() => setStatus('connected', 'Spotify connected'))
      .catch(() => { /* status already set to error */ });
  } else {
    setStatus('disconnected', 'Spotify not connected');
  }
}

function logoutSpotify() {
  vault.clear();
  setStatus('disconnected', 'Spotify not connected');
  showToast('Disconnected from Spotify.', 'info');
}

/* ======================= SPOTIFY API ======================= */
async function spotifyFetch(path, opts = {}) {
  const token = await getValidToken();
  const headers = { Authorization: 'Bearer ' + token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) };
  const run = (t) => fetch('https://api.spotify.com' + path, { ...opts, headers: { ...headers, Authorization: 'Bearer ' + t } });
  let res = await run(token);
  if (res.status === 401) {                 // layer 3: reactive refresh + retry
    _accessToken = null;
    await refreshAccessToken();
    res = await run(_accessToken);
  }
  return res;
}

async function pausePlayback() {
  if (!_accessToken && !vault.refreshToken) return; // nothing to pause
  try {
    const res = await spotifyFetch('/v1/me/player/pause', { method: 'PUT' });
    // 204 ok; 403 = no active device / not Premium (non-fatal)
    if (res.status === 403) { /* ignore */ }
    np.isPlaying = false;
  } catch (e) { /* network/auth — non-fatal, voice still plays */ }
}

/* ---------- Volume fades (professional in-room sound) ----------
   Fades Spotify down before a voice cue and back up when music
   resumes. Volume control 403s on some devices (casting targets,
   some speakers) — every step degrades to the plain hard pause. */
async function setSpotifyVolume(pct) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  const res = await spotifyFetch('/v1/me/player/volume?volume_percent=' + v, { method: 'PUT' });
  if (!res.ok && res.status !== 204) throw new Error('VOLUME_' + res.status);
}

async function fadeOutAndPause() {
  if (!_accessToken && !vault.refreshToken) return; // nothing to fade
  const from = np.volume;
  let faded = false;
  try {
    if (np.isPlaying && typeof from === 'number' && from > 0) {
      for (const f of [0.6, 0.3, 0.1, 0]) {
        await setSpotifyVolume(from * f);
        if (f > 0) await timeout(160);
      }
      faded = true;
    }
  } catch (e) { /* device without volume control — hard pause below */ }
  await pausePlayback();
  // Device is now silent; restore its volume so a manual resume isn't muted.
  if (faded) { try { await setSpotifyVolume(from); } catch (e) {} }
}

async function getActiveDeviceId() {
  try {
    const player = await spotifyFetch('/v1/me/player').then(r => r.ok ? r.json() : null);
    if (player && player.device && player.device.is_active) return player.device;
  } catch (e) { /* fall through */ }
  try {
    const devs = await spotifyFetch('/v1/me/player/devices').then(r => r.ok ? r.json() : null);
    const pick = (devs && devs.devices && devs.devices.find(d => !d.is_restricted)) || (devs && devs.devices && devs.devices[0]);
    return pick || null;
  } catch (e) { return null; }
}

async function playPlaylist(contextUri) {
  let device = await getActiveDeviceId();
  if (!device) throw new Error('NO_DEVICE');
  if (!device.is_active) {
    await spotifyFetch('/v1/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [device.id], play: false }) });
  }
  // Fade in from silence when we know the device volume (else just play).
  const target = (typeof np.volume === 'number' && np.volume > 0) ? np.volume : null;
  let dimmed = false;
  if (target !== null) { try { await setSpotifyVolume(0); dimmed = true; } catch (e) {} }
  const q = device.id ? ('?device_id=' + encodeURIComponent(device.id)) : '';
  const res = await spotifyFetch('/v1/me/player/play' + q, { method: 'PUT', body: JSON.stringify({ context_uri: contextUri }) });
  if (!res.ok && res.status !== 204) {
    if (dimmed) { try { await setSpotifyVolume(target); } catch (e) {} }
    throw new Error('PLAY_FAILED_' + res.status);
  }
  np.isPlaying = true;
  if (dimmed) {
    (async () => {
      try {
        for (const f of [0.25, 0.55, 0.8, 1]) { await timeout(200); await setSpotifyVolume(target * f); }
      } catch (e) { try { await setSpotifyVolume(target); } catch (e2) {} }
    })();
  }
  setTimeout(pollNowPlaying, 1200);
}

/* ======================= NOW PLAYING ======================= */
let _npTimer = null;

function startNowPlayingPoll() {
  if (_npTimer) return;
  pollNowPlaying();
  _npTimer = setInterval(pollNowPlaying, 5000);
}
function stopNowPlayingPoll() {
  clearInterval(_npTimer);
  _npTimer = null;
}

async function pollNowPlaying() {
  // Skip while backgrounded or while a voice cue plays (saves rate limit).
  if (document.hidden || state.playingLock) return;
  if (!_accessToken && !vault.refreshToken) return;
  try {
    const res = await spotifyFetch('/v1/me/player');
    if (res.status === 204) { np.isPlaying = false; renderNowPlaying(null); return; }
    if (!res.ok) return;
    const data = await res.json();
    np.isPlaying = !!data.is_playing;
    if (data.device && typeof data.device.volume_percent === 'number') np.volume = data.device.volume_percent;
    renderNowPlaying(data);
  } catch (e) { /* transient — keep the last render */ }
}

function renderNowPlaying(data) {
  if (!els.npTrack) return;
  const item = data && data.item;
  if (!item) {
    els.npTrack.textContent = 'Nothing playing';
    els.npSub.textContent = 'Start a playlist from a finished cue.';
    els.npArt.hidden = true;
    els.npToggle.hidden = true;
    return;
  }
  els.npTrack.textContent = item.name;
  const artists = (item.artists || []).map(a => a.name).join(', ');
  const dev = data.device && data.device.name ? '  ·  ' + data.device.name : '';
  els.npSub.textContent = artists + dev;
  const imgs = (item.album && item.album.images) || [];
  const art = imgs[imgs.length - 1]; // smallest
  if (art && art.url) { els.npArt.src = art.url; els.npArt.hidden = false; }
  else { els.npArt.hidden = true; }
  els.npToggle.hidden = false;
  els.npToggle.innerHTML = np.isPlaying ? ICONS.pause : ICONS.play;
  els.npToggle.setAttribute('aria-label', np.isPlaying ? 'Pause Spotify' : 'Resume Spotify');
}

/* ======================= AUDIO ======================= */
let currentSession = null;

function stopAudio() {
  const audio = els.voice;
  if (currentSession) {
    currentSession.aborted = true;
    if (currentSession.cleanup) currentSession.cleanup(); // detach old listeners
    currentSession = null;
  }
  try { audio.pause(); } catch (e) {}
  try { audio.currentTime = 0; } catch (e) {}
  audio.removeAttribute('src');
  try { audio.load(); } catch (e) {}
}

function playFiles(files, onEndAll, onTick) {
  stopAudio();
  const audio = els.voice;
  const session = { aborted: false, done: false };
  currentSession = session;
  let idx = 0;

  const detach = () => {
    audio.removeEventListener('ended', onEnded);
    audio.removeEventListener('error', onError);
    audio.removeEventListener('timeupdate', onTime);
    audio.removeEventListener('loadedmetadata', onTime);
  };
  const finish = (err) => {
    if (session.done) return;
    session.done = true;
    detach();
    if (currentSession === session) currentSession = null;
    onEndAll && onEndAll(err);
  };
  const onEnded = () => {
    if (session.aborted) return;
    idx++;
    if (idx < files.length) {
      audio.src = files[idx];
      audio.play().catch(() => finish(new Error('AUDIO_BLOCKED')));
    } else {
      finish(null);
    }
  };
  const onError = () => { if (!session.aborted) finish(new Error('AUDIO_ERROR')); };
  const onTime = () => {
    if (session.aborted || session.done || !onTick) return;
    onTick(audio.currentTime || 0, audio.duration || 0, idx + 1, files.length);
  };
  session.cleanup = detach;

  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);
  audio.addEventListener('timeupdate', onTime);
  audio.addEventListener('loadedmetadata', onTime);
  audio.src = files[0];
  audio.play().catch(() => finish(new Error('AUDIO_BLOCKED')));
}

/* ======================= ICONS ======================= */
const ICONS = {
  play:  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg>',
  alert: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2zm0-7h-2v6h2z" fill="currentColor"/></svg>',
  lock:  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0z" fill="currentColor"/></svg>',
  mic:   '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z" fill="currentColor"/></svg>',
  note:  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" fill="currentColor"/></svg>',
};
function statusMarkup(stateName) {
  if (stateName === 'playing') return '<span class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span></span>';
  if (stateName === 'done')    return ICONS.check;
  if (stateName === 'error')   return ICONS.alert;
  return ICONS.play;
}

/* ======================= UI: RENDER ======================= */
function renderTimeline() {
  els.timeline.replaceChildren();
  cueIndex = 0;
  const byPhase = {};
  for (const a of STAGES) (byPhase[a.phase] = byPhase[a.phase] || []).push(a);

  for (const phase of PHASE_ORDER) {
    const cues = byPhase[phase];
    if (!cues || !cues.length) continue;
    const section = document.createElement('section');
    section.className = 'phase';
    section.innerHTML =
      '<header class="phase__head">' +
        '<span class="phase__name"></span>' +
        '<span class="phase__rule"></span>' +
      '</header>' +
      '<div class="phase__grid"></div>';
    section.querySelector('.phase__name').textContent = phase;
    const grid = section.querySelector('.phase__grid');
    for (const a of cues) grid.append(buildCue(a, cueIndex++));
    els.timeline.append(section);
  }
  markCurrent();
}
let cueIndex = 0;

function buildCue(a, i) {
  const art = document.createElement('article');
  art.className = 'cue';
  art.dataset.id = a.id;
  art.dataset.state = 'idle';
  art.style.setProperty('--i', String(i || 0)); // staggered entrance

  const hasVoice = a.files.length > 0;
  // Both badges live in one inline meta row (no absolute positioning) so
  // manual and non-manual cards keep identical padding and alignment.
  const typeBadge = hasVoice
    ? '<span class="cue__type" data-type="voice">' + ICONS.mic + '<span>Voice + Music</span></span>'
    : '<span class="cue__type" data-type="music">' + ICONS.note + '<span>Music only</span></span>';
  const manualBadge = a.manual
    ? '<span class="cue__manual">' + ICONS.lock + '<span>Confirm</span></span>'
    : '';

  art.innerHTML =
    '<button class="cue__btn" type="button" aria-label="' +
      (hasVoice ? 'Play announcement, then music: ' : 'Start music: ') + a.label + '">' +
      '<span class="cue__step">' + String(a.step).padStart(2, '0') + '</span>' +
      '<span class="cue__body">' +
        '<span class="cue__label"></span>' +
        '<span class="cue__meta">' + typeBadge + manualBadge + '</span>' +
        '<span class="cue__sub"></span>' +
        '<span class="cue__timer" aria-hidden="true"></span>' +
      '</span>' +
      '<span class="cue__status">' + statusMarkup('idle') + '</span>' +
      '<span class="cue__progress" aria-hidden="true"><span class="cue__progress-bar"></span></span>' +
    '</button>' +
    '<div class="cue__next" data-open="false">' +
      '<div class="cue__next-inner"><div class="cue__next-bar">' +
        '<span class="cue__next-label"></span>' +
        '<button class="btn btn--primary cue__next-btn" type="button"></button>' +
      '</div></div>' +
    '</div>';

  art.querySelector('.cue__label').textContent = a.label;
  art.querySelector('.cue__sub').textContent = a.sub + (a.files.length > 1 ? '  ·  ' + a.files.length + ' parts' : '');
  art.querySelector('.cue__btn').addEventListener('click', () => triggerStage(a));
  return art;
}

function cueCard(id) { return els.timeline.querySelector('.cue[data-id="' + CSS.escape(id) + '"]'); }

function setCueState(id, stateName) {
  const card = cueCard(id);
  if (!card) return;
  card.dataset.state = stateName;
  const status = card.querySelector('.cue__status');
  if (status) status.innerHTML = statusMarkup(stateName);
  if (stateName !== 'playing') clearCueProgress(card);
}

/* ---------- live announcement progress ---------- */
function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function updateCueProgress(id, current, duration, part, parts) {
  const card = cueCard(id);
  if (!card) return;
  const bar = card.querySelector('.cue__progress-bar');
  const timer = card.querySelector('.cue__timer');
  if (bar && duration > 0) bar.style.width = Math.min(100, (current / duration) * 100) + '%';
  if (timer) {
    timer.textContent = (parts > 1 ? 'Part ' + part + ' of ' + parts + '  ·  ' : '') +
      fmtTime(current) + ' / ' + (duration > 0 ? fmtTime(duration) : '–:––');
  }
}

function clearCueProgress(card) {
  const bar = card.querySelector('.cue__progress-bar');
  const timer = card.querySelector('.cue__timer');
  if (bar) bar.style.width = '0%';
  if (timer) timer.textContent = '';
}

function markCurrent() {
  const all = els.timeline.querySelectorAll('.cue');
  all.forEach(c => c.classList.toggle('cue--current', false));
  for (const c of all) {
    if (c.dataset.state === 'idle' && !state.completed.has(c.dataset.id)) { c.classList.add('cue--current'); break; }
  }
}

function setProgress(completed) {
  const total = STAGES.length;
  els.progressText.textContent = completed + ' of ' + total + ' complete';
  els.progressBar.style.width = ((completed / total) * 100) + '%';
  if (els.progress) els.progress.setAttribute('aria-valuenow', String(completed));
}

function setHint(text) { if (els.hint) els.hint.textContent = text; }

/* ---------- NEXT ACTION reveal (voice stages: tap to start the music) ---------- */
function showNextAction(entry) {
  const card = cueCard(entry.id);
  if (!card) return;
  const wrap = card.querySelector('.cue__next');
  const label = card.querySelector('.cue__next-label');
  const btn = card.querySelector('.cue__next-btn');
  label.textContent = 'Music cue ready:';
  btn.textContent = 'Start ' + entry.music;
  // Close the reveal only when playback actually starts — on failure
  // (unconfigured URI, no device) the DJ keeps the button and can retry.
  btn.onclick = () => { startStagePlaylist(entry).then(ok => { if (ok) closeNext(entry.id); }); };
  wrap.dataset.open = 'true';
  setHint('"' + entry.label + '" finished. Tap to start the music.');
}

function closeNext(id) {
  const card = cueCard(id);
  if (card) card.querySelector('.cue__next').dataset.open = 'false';
}

/* ---------- Start a stage's playlist (shared by both stage kinds) ----------
   Music-only stages call this directly on tap; voice stages call it from
   the "Start music" reveal after the announcement finishes. */
function startStagePlaylist(entry) {
  const uri = PLAYLISTS[entry.playlist];
  if (!uri || uri.indexOf('__FILL') !== -1) {
    showToast('"' + entry.label + '" music isn\'t configured yet — add its URI to PLAYLISTS in app.js.', 'warning');
    return Promise.resolve(false);
  }
  showToast('Starting ' + entry.music + '…', 'info');
  return playPlaylist(uri)
    .then(() => {
      showToast(entry.music + ' — playing.', 'success');
      // Music-only stages complete when their playlist starts;
      // voice stages were already completed when the announcement ended.
      if (entry.files.length === 0) markStageDone(entry);
      return true;
    })
    .catch(err => {
      showToast(
        err.message === 'NO_DEVICE' ? 'No active Spotify device. Open Spotify on the venue device, press play once, then retry.'
        : 'Couldn\'t start playback (' + err.message + ').', 'error');
      return false;
    });
}

function markStageDone(entry) {
  setCueState(entry.id, 'done');
  if (state.completed.has(entry.id)) return; // replay — already counted
  state.completed.add(entry.id);
  setProgress(state.completed.size);
  markCurrent();
  if (state.completed.size === STAGES.length) celebrate();
}

/* ---------- STATUS PILL ---------- */
function setStatus(stateName, text) {
  const btn = els.connectBtn;
  btn.dataset.state = stateName;
  els.statusText.textContent = text;
  btn.setAttribute('aria-label', 'Spotify status: ' + text + '. ' +
    (stateName === 'disconnected' || stateName === 'error' ? 'Click to connect.' : ''));
  const connected = stateName === 'connected';
  if (els.nowPlaying) els.nowPlaying.dataset.visible = connected ? 'true' : 'false';
  if (connected) startNowPlayingPoll(); else stopNowPlayingPoll();
}

/* ---------- TOASTS ---------- */
function showToast(message, type = 'info', ttl = 4200) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.dataset.type = type;
  t.innerHTML = '<span class="toast__dot" aria-hidden="true"></span><span class="toast__msg"></span>';
  t.querySelector('.toast__msg').textContent = message;
  els.toasts.append(t);
  // enter
  requestAnimationFrame(() => { t.dataset.state = 'show'; });
  const leave = () => {
    t.dataset.state = 'leave';
    setTimeout(() => t.remove(), 240);
  };
  setTimeout(leave, ttl);
  t.addEventListener('click', leave);
}

/* ======================= PLAY SEQUENCE ======================= */
function triggerStage(entry) {
  if (state.playingLock) {
    showToast('An announcement is playing. Wait for it to finish, or hit STOP ALL.', 'warning');
    return;
  }
  if (entry.manual) {
    openConfirm(entry);
  } else {
    fireStage(entry);
  }
}

/* Voice stages run the announcement sequence; music-only stages bypass
   the local audio player entirely and switch playlists immediately. */
function fireStage(entry) {
  if (entry.files.length === 0) {
    startStagePlaylist(entry);
  } else {
    runSequence(entry);
  }
}

async function runSequence(entry) {
  if (state.playingLock) return;
  state.playingLock = entry.id;
  setCueState(entry.id, 'playing');
  setHint('Playing: ' + entry.label + (entry.files.length > 1 ? ' (' + entry.files.length + ' parts)' : '') + '…');

  // Briefly await the Spotify fade-out (no music bleed), but never block the voice on network failure.
  await Promise.race([fadeOutAndPause(), timeout(1200)]);

  // If STOP (or a superseding action) cleared our lock during the fade window, abort.
  if (state.playingLock !== entry.id) { setCueState(entry.id, 'idle'); return; }

  playFiles(entry.files.map(f => 'audio/' + f), (err) => {
    state.playingLock = null;
    if (err) {
      const msg = err.message === 'AUDIO_ERROR' ? 'Audio file missing or unreadable for "' + entry.label + '". Check ./audio/.'
                : err.message === 'AUDIO_BLOCKED' ? 'Browser blocked autoplay. Tap the cue again.'
                : 'Couldn\'t play "' + entry.label + '".';
      setCueState(entry.id, 'error');
      showToast(msg, 'error');
    } else {
      markStageDone(entry);
      showNextAction(entry);
    }
  }, (current, duration, part, parts) => updateCueProgress(entry.id, current, duration, part, parts));
}

/* Peak-end: the whole day ran — one warm, conclusive moment. */
function celebrate() {
  const head = document.querySelector('.timeline-head');
  if (head) head.classList.add('timeline-head--fin');
  const title = document.getElementById('progress-label');
  if (title) title.textContent = 'Every cue played — congratulations, Mahbub & Zarin ✦';
  setHint('A flawless run. STOP ALL and every stage stay available if you need a replay.');
  showToast('All ' + STAGES.length + ' stages complete. Congratulations!', 'success', 6500);
}

function timeout(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------- CONFIRMATION MODAL ---------- */
function openConfirm(entry) {
  pendingConfirm = entry;
  els.confirmDesc.textContent = '"' + entry.label + '" — ' + entry.sub +
    '. This is a live, one-take moment. Confirm only when the event manager is ready.';
  try { els.confirmDialog.showModal(); } catch (e) { fireStage(entry); }
}
function closeConfirm() {
  pendingConfirm = null;
  if (els.confirmDialog.open) els.confirmDialog.close();
}

/* ======================= EMERGENCY STOP ======================= */
function stopEverything() {
  stopAudio();
  pausePlayback(); // best-effort, fire-and-forget — hard pause, never a fade
  np.isPlaying = false;
  setTimeout(pollNowPlaying, 900);
  state.playingLock = null;
  els.timeline.querySelectorAll('.cue[data-state="playing"]').forEach(c => setCueState(c.dataset.id, 'idle'));
  setHint('Stopped. All cues are ready — tap one to (re)play.');
  showToast('All audio stopped.', 'info');
}

/* ======================= WIRING / INIT ======================= */
function cacheEls() {
  els = {
    connectBtn:   document.getElementById('connect-btn'),
    statusText:   document.getElementById('status-text'),
    stopBtn:      document.getElementById('stop-btn'),
    timeline:     document.getElementById('timeline'),
    progressText: document.getElementById('progress-text'),
    progressBar:  document.getElementById('progress-bar'),
    progress:     document.getElementById('progress-text') ? document.querySelector('.progress') : null,
    hint:         document.getElementById('hint'),
    confirmDialog:document.getElementById('confirm-dialog'),
    confirmDesc:  document.getElementById('confirm-desc'),
    confirmGo:    document.getElementById('confirm-go'),
    confirmCancel:document.getElementById('confirm-cancel'),
    toasts:       document.getElementById('toasts'),
    voice:        document.getElementById('voice'),
    nowPlaying:   document.getElementById('now-playing'),
    npArt:        document.getElementById('np-art'),
    npTrack:      document.getElementById('np-track'),
    npSub:        document.getElementById('np-sub'),
    npToggle:     document.getElementById('np-toggle'),
  };
}

function wireGlobal() {
  els.stopBtn.addEventListener('click', stopEverything);

  els.connectBtn.addEventListener('click', () => {
    const s = els.connectBtn.dataset.state;
    if (s === 'connected') {
      getActiveDeviceId().then(d => {
        showToast(d ? 'Active device: ' + d.name : 'No active Spotify device right now.', d ? 'info' : 'warning');
      }).catch(() => showToast('Spotify connected.', 'info'));
    } else if (s === 'connecting') {
      /* ignore */
    } else {
      beginLogin();
    }
  });

  els.confirmGo.addEventListener('click', () => { const e = pendingConfirm; closeConfirm(); if (e) fireStage(e); });
  els.confirmCancel.addEventListener('click', closeConfirm);
  els.confirmDialog.addEventListener('cancel', closeConfirm); // ESC

  // Now Playing play/pause toggle (optimistic; the poll corrects drift)
  els.npToggle.addEventListener('click', async () => {
    try {
      if (np.isPlaying) {
        await spotifyFetch('/v1/me/player/pause', { method: 'PUT' });
        np.isPlaying = false;
      } else {
        await spotifyFetch('/v1/me/player/play', { method: 'PUT' });
        np.isPlaying = true;
      }
      els.npToggle.innerHTML = np.isPlaying ? ICONS.pause : ICONS.play;
      els.npToggle.setAttribute('aria-label', np.isPlaying ? 'Pause Spotify' : 'Resume Spotify');
      setTimeout(pollNowPlaying, 900);
    } catch (e) {
      showToast('Spotify didn\'t respond — try again.', 'warning');
    }
  });

  // Layer 4: re-check token freshness when the tab returns (all-day backgrounding).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (_accessToken && isExpiringSoon()) refreshAccessToken().catch(() => {});
    pollNowPlaying();
  });

  // Keyboard: Space/Enter already work on <button>. Add a global panic key (Shift+Esc → STOP).
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'Escape') { e.preventDefault(); stopEverything(); }
  });
}

function cleanUrl() {
  history.replaceState({}, '', location.pathname);
}

function init() {
  cacheEls();
  wireGlobal();
  renderTimeline();
  setProgress(0);
  setHint('Tap a stage to run it — voice stages fade the music out and announce first; music-only stages switch playlists right away.');

  const params = new URLSearchParams(location.search);
  if (params.get('code') || params.get('error')) {
    handleRedirectBack();
  } else {
    restoreSession();
  }
}

document.addEventListener('DOMContentLoaded', init);
