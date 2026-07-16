/* ============================================================
   Mahbub & Zarin — Wedding Day Controller — app.js
   Vanilla JS · speech-only 8-stage soundboard · local MP3 cues
   ------------------------------------------------------------
   This is a bulletproof soundboard: 8 chronological voice
   announcements, each a tap-to-play MP3 (the Nikkah Preparation
   cue plays two files back-to-back). When a cue finishes, the
   app shows the operator a MANUAL instruction to start that
   moment's background music on the venue's own Spotify device —
   the app itself never talks to Spotify.

   SETUP: drop the 9 MP3 files into ./audio/ (names must match
   the STAGES `files` below). That's it — no API keys, no auth.
   ============================================================ */

'use strict';

/* ======================= CONFIG ======================= */
const CONFIG = {
  VERSION: '3.0',  // bump on each deploy — shown in the footer + cache-busts the MP3s
};

/* ---------- The 8 voice stages (data-driven, chronological) ----------
   Each stage is a recorded MP3 announcement. `music` is the manual
   operator cue shown when the announcement finishes (the venue runs
   its own Spotify, so we only remind the DJ what to start). Nikkah
   Preparation has no music — all audio stays off for the Qur'an
   recitation + English announcement. `manual` stages gate behind a
   confirm dialog (live, one-take moments). */
const STAGES = [
  { id:'guest_arrival', step:1, phase:'Arrival',      label:'Guest Arrival',         sub:'Seating & welcome',                   files:['01_guest_welcome.mp3'],                                              music:'Guest arrival music',    manual:false },
  { id:'groom',         step:2, phase:'Processional', label:'Groom Entrance',        sub:'Groom processional',                  files:['02_groom_entrance.mp3'],                                             music:'Groom entrance music',   manual:true  },
  { id:'bride',         step:3, phase:'Processional', label:'Bride Grand Entrance',  sub:'Bride processional',                  files:['03_bride_entrance.mp3'],                                             music:'Bridal entrance music',  manual:true  },
  { id:'nikkah_prep',   step:4, phase:'Ceremony',     label:'Nikkah Preparation',    sub:'Qur\'an recitation → English Nikkah', files:['04a_quran_ar_rum_30_21_verified.mp3','04b_nikkah_english_announcement.mp3'], music:'',                manual:false },
  { id:'qobul',         step:5, phase:'Ceremony',     label:'Qobul & Signing',       sub:'After the final Qobul — signing',     files:['05_qubool_and_signing.mp3'],                                         music:'Qobul & signing music',  manual:true  },
  { id:'cake',          step:6, phase:'Reception',    label:'Cake Celebration',      sub:'Cake-cutting moment',                 files:['07_cake_cutting.mp3'],                                               music:'Cake celebration music', manual:true  },
  { id:'food',          step:7, phase:'Reception',    label:'Food Service',          sub:'Dinner is served',                    files:['06_food_service.mp3'],                                               music:'Dinner music',           manual:false },
  { id:'ruksati',       step:8, phase:'Departure',    label:'Ruksati & End Time',    sub:'Send-off · stop at the doors',        files:['08_ruksati_preparation.mp3'],                                        music:'Ruksati music',          manual:true  },
];
const PHASE_ORDER = ['Arrival','Processional','Ceremony','Reception','Departure'];

/* ======================= STATE ======================= */
const state = {
  playingLock: null,    // id of cue currently playing, or null
  completed: new Set(), // completed cue ids
};

let els = {};
let pendingConfirm = null;

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
  check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg>',
  alert: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2zm0-7h-2v6h2z" fill="currentColor"/></svg>',
  lock:  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0z" fill="currentColor"/></svg>',
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

  // The Confirm badge sits in an inline meta row kept on EVERY card so manual and
  // non-manual cards share identical padding and vertical alignment.
  const manualBadge = a.manual
    ? '<span class="cue__manual">' + ICONS.lock + '<span>Confirm</span></span>'
    : '';

  art.innerHTML =
    '<button class="cue__btn" type="button" aria-label="Play announcement: ' + a.label + '">' +
      '<span class="cue__step">' + String(a.step).padStart(2, '0') + '</span>' +
      '<span class="cue__body">' +
        '<span class="cue__label"></span>' +
        '<span class="cue__meta">' + manualBadge + '</span>' +
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

/* ---------- FINISH reveal (manual cue shown when an announcement ends) ----------
   The venue runs its own Spotify, so when a voice cue finishes we don't start
   anything automatically — we surface a one-line manual instruction to the
   operator and a Dismiss button. (Nikkah Preparation has no music cue.) */
function showNextAction(entry) {
  const card = cueCard(entry.id);
  if (!card) return;
  const wrap = card.querySelector('.cue__next');
  const label = card.querySelector('.cue__next-label');
  const btn = card.querySelector('.cue__next-btn');
  label.textContent = entry.music
    ? 'Audio finished — manually start: ' + entry.music + '.'
    : 'Audio finished.';
  btn.textContent = 'Dismiss';
  btn.onclick = () => closeNext(entry.id);
  wrap.dataset.open = 'true';
  setHint('"' + entry.label + '" finished.' +
    (entry.music ? ' Start the music on the venue device.' : ' Ready for the next cue.'));
}

function closeNext(id) {
  const card = cueCard(id);
  if (card) card.querySelector('.cue__next').dataset.open = 'false';
}

function markStageDone(entry) {
  setCueState(entry.id, 'done');
  if (state.completed.has(entry.id)) return; // replay — already counted
  state.completed.add(entry.id);
  setProgress(state.completed.size);
  markCurrent();
  if (state.completed.size === STAGES.length) celebrate();
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
    playStage(entry);
  }
}

/* Plays the stage's voice files (single or back-to-back), then resolves the cue
   (mark done + reveal the manual music instruction). */
function playStage(entry) {
  if (state.playingLock) return;
  state.playingLock = entry.id;
  setCueState(entry.id, 'playing');
  setHint('Playing: ' + entry.label + (entry.files.length > 1 ? ' (' + entry.files.length + ' parts)' : '') + '…');
  playFiles(entry.files.map(f => 'audio/' + f + '?v=' + CONFIG.VERSION), (err) => {
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

/* ---------- CONFIRMATION MODAL ---------- */
function openConfirm(entry) {
  pendingConfirm = entry;
  els.confirmDesc.textContent = '"' + entry.label + '" — ' + entry.sub +
    '. This is a live, one-take moment. Confirm only when the event manager is ready.';
  try { els.confirmDialog.showModal(); } catch (e) { playStage(entry); }
}
function closeConfirm() {
  pendingConfirm = null;
  if (els.confirmDialog.open) els.confirmDialog.close();
}

/* ======================= EMERGENCY STOP ======================= */
function stopEverything() {
  stopAudio();
  state.playingLock = null;
  els.timeline.querySelectorAll('.cue[data-state="playing"]').forEach(c => setCueState(c.dataset.id, 'idle'));
  setHint('Stopped. All cues are ready — tap one to (re)play.');
  showToast('All audio stopped.', 'info');
}

/* ======================= WIRING / INIT ======================= */
function cacheEls() {
  els = {
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
    appVersion:   document.getElementById('app-version'),
  };
}

function wireGlobal() {
  els.stopBtn.addEventListener('click', stopEverything);

  els.confirmGo.addEventListener('click', () => { const e = pendingConfirm; closeConfirm(); if (e) playStage(e); });
  els.confirmCancel.addEventListener('click', closeConfirm);
  els.confirmDialog.addEventListener('cancel', closeConfirm); // ESC

  // Keyboard: Space/Enter already work on <button>. Add a global panic key (Shift+Esc → STOP).
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'Escape') { e.preventDefault(); stopEverything(); }
  });
}

function init() {
  cacheEls();
  wireGlobal();
  renderTimeline();
  if (els.appVersion) els.appVersion.textContent = CONFIG.VERSION;   // footer version stamp
  setProgress(0);
  setHint('Tap a stage to play its voice announcement.');
}

document.addEventListener('DOMContentLoaded', init);
