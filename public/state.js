/* ============================================================
   state.js — State shape, localStorage I/O, version migration
   Depends on engine.js (loaded first).
   ============================================================ */

const STATE_VERSION = 8;  // bumped with v0.8 split; used for future migrations
const USER_PRESETS_KEY = 'final_build_ot_note_user_presets';
const STATE_KEY = 'final_build_ot_note_state_v8';

function makeInitialState() {
  return {
    cpt: '97535',
    activity_parent: '',
    activity_child: '',
    goal: '',
    deficit: '',
    assists: [],
    cues: [],
    progress: '',
    // Per-session context (never from presets)
    subjective: '',
    painLocation: '',
    painRating: '',
    hr: '',
    o2: '',
    bp: '',
    reasoningSelected: [],
    output_style: 'activity_led'
  };
}

const state = makeInitialState();

// ===== Normalize incoming preset assists to current schema =====
// Adds v0.6 fields (site/action/percent) as empty if missing.
// Normalizes legacy abbreviated levels ("min A") to spelled-out form.
function normalizeAssist(a) {
  const out = { ...a };
  out.level = window.OT_ENGINE.normalizeAssistLevel(out.level);
  if (out.site === undefined) out.site = '';
  if (out.action === undefined) out.action = '';
  if (out.percent === undefined) out.percent = '';
  return out;
}

function applyPreset(p) {
  const wp = p.wizard_params || p;
  state.cpt = wp.cpt || '97535';
  state.activity_parent = wp.activity_parent || '';
  state.activity_child = wp.activity_child || '';
  state.goal = wp.goal || '';
  state.deficit = wp.deficit || '';
  state.assists = JSON.parse(JSON.stringify(wp.assists || [])).map(normalizeAssist);
  state.cues = JSON.parse(JSON.stringify(wp.cues || []));
  state.progress = wp.progress || '';
}

function clearState() {
  Object.assign(state, makeInitialState());
}

// ===== localStorage I/O =====
function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Future-proofing: version-gated migration
    if (parsed._version !== STATE_VERSION) return null;
    delete parsed._version;
    // Re-normalize assists in case schema evolved
    if (parsed.assists) parsed.assists = parsed.assists.map(normalizeAssist);
    Object.assign(state, parsed);
    return state;
  } catch (e) {
    console.warn('loadState failed:', e);
    return null;
  }
}

function saveState() {
  try {
    const payload = { ...state, _version: STATE_VERSION };
    localStorage.setItem(STATE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('saveState failed:', e);
  }
}

// ===== User-saved custom presets =====
function loadUserPresets() {
  try {
    return JSON.parse(localStorage.getItem(USER_PRESETS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveUserPresets(arr) {
  try {
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn('saveUserPresets failed:', e);
  }
}

function addUserPreset(name) {
  const usr = loadUserPresets();
  usr.push({
    name,
    cpt: state.cpt,
    activity_parent: state.activity_parent,
    activity_child: state.activity_child,
    goal: state.goal,
    deficit: state.deficit,
    assists: state.assists,
    cues: state.cues,
    progress: state.progress
  });
  saveUserPresets(usr);
  return usr;
}

// ===== Expose to other modules =====
window.OT_STATE = {
  state,
  applyPreset,
  clearState,
  normalizeAssist,
  loadState,
  saveState,
  loadUserPresets,
  saveUserPresets,
  addUserPreset,
  STATE_VERSION
};
