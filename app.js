/* ============================================================
   app.js — DOM glue, event handlers, init
   Depends on engine.js + state.js (loaded first).
   Loads data files via fetch() on init.
   ============================================================ */

const { state, applyPreset, clearState, normalizeAssist,
        loadUserPresets, saveUserPresets, addUserPreset } = window.OT_STATE;
const { assembleNote, formatCue, formatAssist, normalizeAssistLevel } = window.OT_ENGINE;

// ===== Data containers (populated by fetch in init) =====
let PRESETS = null;
let CATALOGS = null;
let INTERVENTION_TYPES_BY_ACTIVITY = null;
let PRESET_INDEX = null;

// ===== Static vocabularies (small enough to inline) =====
const CUE_LEVELS = ['', 'min', 'mod', 'max', 'occasional', 'frequent', 'constant', 'repeated', 'graded', 'systematic'];
const CUE_TYPES = ['verbal', 'visual', 'tactile', 'manual', 'demonstration', 'environmental'];
const CUE_KINDS = ['cue', 'prompt', 'reminder', 'guidance', 'encouragement', 'feedback', 'aid', 'coaching', 'instruction', 'education', 'rehearsal', 'demonstration', 'reinforcement', 'mods', 'modifications', 'setup'];
const ASSIST_LEVELS = ['', 'I', 'ModI', 'S', 'CGA', 'min physical assist', 'mod physical assist', 'max physical assist', 'depA'];
const SITES = ['', 'BUE', 'BLE', 'UE', 'LE', 'RUE', 'LUE', 'RLE', 'LLE', 'trunk', 'lumbar spine', 'thoracic spine', 'pelvis', 'generalized'];
const ACTION_SUGGESTIONS = [
  'reaching', 'reaching overhead', 'reaching to floor', 'weight shifting', 'trunk rotation',
  'standing', 'sit-to-stand', 'transitioning', 'pivot transfer', 'EOB scoot', 'transferring',
  'scrubbing', 'rinsing', 'back washing', 'hair washing', 'face washing', 'perineal care', 'foot care',
  'donning shirt', 'donning pants', 'doffing shirt', 'doffing pants', 'fastening', 'clothing management',
  'oral care', 'shaving', 'grooming', 'wiping', 'step-in/step-out transitions', 'sit-to-stand transfers',
  'hip flexion for foot reach', 'ambulation on wet floor'
];

// ===== DOM helpers =====
const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// ===== Render the note + summary =====
function rerender() {
  $('output').value = assembleNote(state);
  updateSummaries();
}

function fmtSupport() {
  const parts = [...state.cues.map(formatCue), ...state.assists.map(formatAssist)].filter(Boolean);
  return parts.length ? parts.join(' · ') : '';
}

function fmtContext() {
  const parts = [];
  if (state.subjective.trim()) parts.push(`"${state.subjective.trim().slice(0,30)}${state.subjective.trim().length>30?'…':''}"`);
  if (state.painRating) parts.push(`Pain ${state.painRating}/10${state.painLocation ? ' at ' + state.painLocation : ''}`);
  const v = [];
  if (state.hr) v.push(`HR ${state.hr}`);
  if (state.o2) v.push(`O2 ${state.o2}%`);
  if (state.bp) v.push(`BP ${state.bp}`);
  if (v.length) parts.push(v.join(', '));
  if (state.reasoningSelected.length) parts.push(`+${state.reasoningSelected.length} reasoning`);
  return parts.join(' · ');
}

function updateSummaries() {
  const map = {
    'sv-cpt': state.cpt ? `${state.cpt} — Self-Care / Home Management` : '',
    'sv-activity': state.activity_parent ? state.activity_parent + (state.activity_child ? ` → ${state.activity_child}` : '') : '',
    'sv-goal': state.goal,
    'sv-deficit': state.deficit,
    'sv-support': fmtSupport(),
    'sv-progress': state.progress,
    'sv-context': fmtContext()
  };
  for (const [id, val] of Object.entries(map)) {
    const el = $(id);
    el.textContent = val || '—';
    el.parentElement.classList.toggle('empty', !val);
  }
}

// ===== Populate static dropdowns =====
function populateSelect(sel, items, currentVal = '') {
  while (sel.options.length > 1) sel.remove(1);
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    if (item === currentVal) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ===== Derive activity children from current preset data =====
function getActivityChildren(activity_parent) {
  return [...new Set(
    PRESETS.presets
      .filter(p => p.wizard_params && p.wizard_params.activity_parent === activity_parent)
      .map(p => p.wizard_params.activity_child)
      .filter(Boolean)
  )].sort();
}

function populateActivityChild() {
  const sel = $('m-activity-child');
  const note = $('activity-child-note');
  if (!state.activity_parent) {
    populateSelect(sel, [], '');
    note.textContent = 'Pick a parent first.';
    sel.disabled = true;
    return;
  }
  const children = getActivityChildren(state.activity_parent);
  if (children.length === 0) {
    populateSelect(sel, [], '');
    const ivCount = (INTERVENTION_TYPES_BY_ACTIVITY[state.activity_parent] || []).length;
    note.textContent = ivCount
      ? `No presets for ${state.activity_parent} yet (${ivCount} intervention types in EMR taxonomy). Apply a preset from a different ADL or pick parent only.`
      : `No presets or EMR taxonomy for ${state.activity_parent} yet.`;
    sel.disabled = true;
    return;
  }
  populateSelect(sel, children, state.activity_child);
  note.textContent = `${children.length} preset focus${children.length===1?'':'es'} available.`;
  sel.disabled = false;
}

// ===== Subjective / reasoning chips =====
function buildSubjectiveChips() {
  const c = $('m-subjective-chips');
  c.innerHTML = '';
  CATALOGS.subjective_quotes.forEach(q => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = q;
    if (state.subjective === q) b.classList.add('selected');
    b.addEventListener('click', () => {
      state.subjective = (state.subjective === q) ? '' : q;
      buildSubjectiveChips();
      rerender();
    });
    c.appendChild(b);
  });
}

function buildReasoningChips() {
  const c = $('m-reasoning-chips');
  c.innerHTML = '';
  CATALOGS.reasoning_phrases.forEach(p => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = p.length > 80 ? p.slice(0, 78) + '…' : p;
    b.title = p;
    if (state.reasoningSelected.includes(p)) b.classList.add('selected');
    b.addEventListener('click', () => {
      const i = state.reasoningSelected.indexOf(p);
      if (i >= 0) state.reasoningSelected.splice(i, 1);
      else state.reasoningSelected.push(p);
      buildReasoningChips();
      rerender();
    });
    c.appendChild(b);
  });
}

// ===== Modal infrastructure =====
let activeModal = null;
function openModal(name) {
  closeModal();
  const m = $('modal-' + name);
  if (!m) return;
  m.hidden = false;
  activeModal = m;
  if (name === 'activity') {
    syncActivityButtons();
    populateActivityChild();
  }
  if (name === 'goal') $('m-goal').value = state.goal || '';
  if (name === 'deficit') $('m-deficit-select').value = state.deficit || '';
  if (name === 'progress') $('m-progress').value = state.progress || '';
  if (name === 'cpt') syncCptButtons();
  if (name === 'support') renderSupport();
  if (name === 'context') {
    buildSubjectiveChips();
    buildReasoningChips();
    $('m-pain-location').value = state.painLocation;
    $('m-pain-rating').value = state.painRating;
    $('m-hr').value = state.hr;
    $('m-o2').value = state.o2;
    $('m-bp').value = state.bp;
  }
}

function closeModal() {
  if (activeModal) {
    activeModal.hidden = true;
    activeModal = null;
  }
}

// ===== CPT buttons =====
function syncCptButtons() {
  $$('.cpt-btn').forEach(b => b.classList.toggle('selected', b.dataset.cpt === state.cpt));
}

// ===== Activity buttons =====
function syncActivityButtons() {
  $$('.activity-btn').forEach(b => b.classList.toggle('selected', b.dataset.activity === state.activity_parent));
}

// ===== Support modal (cues + assists) =====
function renderSupport() {
  const cc = $('m-cue-list');
  cc.innerHTML = '';
  state.cues.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'dyn-row';
    row.innerHTML = `
      <select data-i="${i}" data-k="level">
        ${CUE_LEVELS.map(l => `<option value="${l}" ${(c.level||'')===l?'selected':''}>${l||'(no level)'}</option>`).join('')}
      </select>
      <select data-i="${i}" data-k="type">
        ${CUE_TYPES.map(t => `<option value="${t}" ${(c.type||'')===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <select data-i="${i}" data-k="kind">
        ${CUE_KINDS.map(k => `<option value="${k}" ${(c.kind||'')===k?'selected':''}>${k}</option>`).join('')}
      </select>
      <select data-i="${i}" data-k="purpose">
        <option value="">(no purpose)</option>
        ${CATALOGS.cue_purposes.map(p => `<option value="${p.replace(/"/g,'&quot;')}" ${(c.purpose||'')===p?'selected':''}>${p}</option>`).join('')}
      </select>
      <button class="x" data-i="${i}" data-act="rem-cue">×</button>
    `;
    cc.appendChild(row);
  });
  cc.querySelectorAll('select').forEach(el => el.addEventListener('change', e => {
    const i = +e.target.dataset.i;
    state.cues[i][e.target.dataset.k] = e.target.value;
    rerender();
  }));
  cc.querySelectorAll('[data-act="rem-cue"]').forEach(b => b.addEventListener('click', () => {
    state.cues.splice(+b.dataset.i, 1);
    renderSupport();
    rerender();
  }));

  const ac = $('m-assist-list');
  ac.innerHTML = '';
  // Assist purposes: catalog purposes + verb-phrase additions
  const ASSIST_PURPOSES_EXTENDED = CATALOGS.assist_purposes.concat([
    'ensure stability', 'maintain dynamic balance', 'prevent falls', 'ensure safety',
    'compensate for limited mobility', 'compensate for hemiparesis', 'compensate for decreased ROM',
    'support safe completion', 'support weight shifting', 'support transfers',
    'facilitate proper mechanics', 'reduce fall risk', 'preserve energy reserves'
  ]);
  state.assists.forEach((a, i) => {
    const normalizedLevel = normalizeAssistLevel(a.level) || '';
    const site = a.site || '';
    const action = a.action || '';
    const percent = (a.percent === 0 || a.percent) ? String(a.percent) : '';
    const row = document.createElement('div');
    row.className = 'dyn-row assist';
    row.innerHTML = `
      <div class="assist-top">
        <select data-i="${i}" data-k="level">
          ${ASSIST_LEVELS.map(l => `<option value="${l}" ${normalizedLevel===l?'selected':''}>${l||'(none)'}</option>`).join('')}
        </select>
        <input type="number" min="0" max="100" placeholder="%" data-i="${i}" data-k="percent" value="${percent}" title="percent assistance (optional)">
        <select data-i="${i}" data-k="purpose">
          <option value="">(no purpose)</option>
          ${ASSIST_PURPOSES_EXTENDED.map(p => `<option value="${p.replace(/"/g,'&quot;')}" ${(a.purpose||'')===p?'selected':''}>${p}</option>`).join('')}
        </select>
        <button class="x" data-i="${i}" data-act="rem-assist">×</button>
      </div>
      <div class="assist-bot">
        <select data-i="${i}" data-k="site" title="anatomical site">
          ${SITES.map(s => `<option value="${s}" ${site===s?'selected':''}>${s?'at '+s:'(no site)'}</option>`).join('')}
        </select>
        <input list="action-suggest" data-i="${i}" data-k="action" value="${action.replace(/"/g,'&quot;')}" placeholder="during [action]" title="specific action the assist is tied to">
        <span style="font-size:10px; color:var(--muted); align-self:center; padding-left:4px;">level · % · purpose / site · action</span>
      </div>
    `;
    ac.appendChild(row);
  });
  ac.querySelectorAll('select, input').forEach(el => el.addEventListener('input', e => {
    const i = +e.target.dataset.i;
    const k = e.target.dataset.k;
    if (k === 'percent') {
      const v = e.target.value;
      state.assists[i][k] = v === '' ? '' : Math.max(0, Math.min(100, +v));
    } else {
      state.assists[i][k] = e.target.value;
    }
    rerender();
  }));
  ac.querySelectorAll('[data-act="rem-assist"]').forEach(b => b.addEventListener('click', () => {
    state.assists.splice(+b.dataset.i, 1);
    renderSupport();
    rerender();
  }));
}

// ===== Preset picker =====
function indexPresets() {
  const idx = {};
  PRESETS.presets.forEach(p => {
    const c = p.source.category;
    const it = p.source.intervention_type;
    if (!idx[c]) idx[c] = {};
    if (!idx[c][it]) idx[c][it] = [];
    idx[c][it].push(p);
  });
  return idx;
}

function populatePresetCategory() {
  const sel = $('preset-category');
  sel.innerHTML = '<option value="">— pick —</option>';
  Object.keys(PRESET_INDEX).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  if (loadUserPresets().length) {
    const opt = document.createElement('option');
    opt.value = '__USER__';
    opt.textContent = '★ My saved presets';
    sel.appendChild(opt);
  }
}

// ===== Event wiring =====
function wireEvents() {
  // Summary row → modal
  $$('.summary-row').forEach(r => r.addEventListener('click', () => openModal(r.dataset.modal)));
  $$('.modal-backdrop').forEach(b => b.addEventListener('click', e => { if (e.target === b) closeModal(); }));
  $$('.modal-close, .modal-done').forEach(b => b.addEventListener('click', closeModal));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && activeModal) closeModal(); });

  // CPT
  $$('.cpt-btn').forEach(btn => btn.addEventListener('click', () => {
    if (btn.disabled) return;
    state.cpt = btn.dataset.cpt;
    syncCptButtons();
    rerender();
  }));

  // Activity parent
  $$('.activity-btn').forEach(btn => btn.addEventListener('click', () => {
    if (state.activity_parent !== btn.dataset.activity) {
      state.activity_parent = btn.dataset.activity;
      state.activity_child = '';
    }
    syncActivityButtons();
    populateActivityChild();
    rerender();
  }));
  $('m-activity-child').addEventListener('change', e => { state.activity_child = e.target.value; rerender(); });

  // Goal / deficit / progress
  $('m-goal').addEventListener('change', e => { state.goal = e.target.value; rerender(); });
  $('m-deficit-select').addEventListener('change', e => { state.deficit = e.target.value; rerender(); });
  $('m-progress').addEventListener('change', e => { state.progress = e.target.value; rerender(); });

  // Support add buttons
  $('m-add-cue').addEventListener('click', () => {
    state.cues.push({ level: '', type: 'verbal', kind: 'cue', purpose: '' });
    renderSupport();
    rerender();
  });
  $('m-add-assist').addEventListener('click', () => {
    state.assists.push({ level: 'min physical assist', site: '', action: '', purpose: '', percent: '' });
    renderSupport();
    rerender();
  });
  $('m-support-clear').addEventListener('click', () => {
    state.cues = [];
    state.assists = [];
    renderSupport();
    rerender();
  });

  // Context
  $('m-pain-location').addEventListener('change', e => { state.painLocation = e.target.value; rerender(); });
  $('m-pain-rating').addEventListener('change', e => { state.painRating = e.target.value; rerender(); });
  $('m-hr').addEventListener('change', e => { state.hr = e.target.value; rerender(); });
  $('m-o2').addEventListener('change', e => { state.o2 = e.target.value; rerender(); });
  $('m-bp').addEventListener('change', e => { state.bp = e.target.value; rerender(); });
  $('m-context-clear').addEventListener('click', () => {
    state.subjective = '';
    state.painLocation = '';
    state.painRating = '';
    state.hr = '';
    state.o2 = '';
    state.bp = '';
    state.reasoningSelected = [];
    buildSubjectiveChips();
    buildReasoningChips();
    ['m-pain-location','m-pain-rating','m-hr','m-o2','m-bp'].forEach(id => $(id).value = '');
    rerender();
  });

  // Preset picker
  $('preset-category').addEventListener('change', e => {
    const v = e.target.value;
    const intSel = $('preset-intervention');
    const focSel = $('preset-focus');
    intSel.innerHTML = '<option value="">—</option>';
    focSel.innerHTML = '<option value="">—</option>';
    $('apply-preset').disabled = true;
    if (!v) { intSel.disabled = true; focSel.disabled = true; return; }
    if (v === '__USER__') {
      intSel.disabled = false;
      focSel.disabled = true;
      intSel.innerHTML = '<option value="">— pick saved —</option>';
      loadUserPresets().forEach((p, i) => {
        const opt = document.createElement('option');
        opt.value = '__USER__:' + i;
        opt.textContent = p.name || `Preset ${i+1}`;
        intSel.appendChild(opt);
      });
      return;
    }
    intSel.disabled = false;
    Object.keys(PRESET_INDEX[v]).forEach(it => {
      const opt = document.createElement('option');
      opt.value = it;
      opt.textContent = it;
      intSel.appendChild(opt);
    });
  });
  $('preset-intervention').addEventListener('change', e => {
    const cat = $('preset-category').value;
    const focSel = $('preset-focus');
    focSel.innerHTML = '<option value="">—</option>';
    if (cat === '__USER__') {
      $('apply-preset').disabled = !e.target.value;
      focSel.disabled = true;
      return;
    }
    const it = e.target.value;
    if (!it) { focSel.disabled = true; $('apply-preset').disabled = true; return; }
    focSel.disabled = false;
    PRESET_INDEX[cat][it].forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.preset_id;
      opt.textContent = p.source.specific_focus;
      focSel.appendChild(opt);
    });
  });
  $('preset-focus').addEventListener('change', e => { $('apply-preset').disabled = !e.target.value; });
  $('apply-preset').addEventListener('click', () => {
    const cat = $('preset-category').value;
    if (cat === '__USER__') {
      const idxStr = $('preset-intervention').value;
      if (!idxStr.startsWith('__USER__:')) return;
      applyPreset(loadUserPresets()[parseInt(idxStr.split(':')[1], 10)]);
      rerender();
      return;
    }
    const id = $('preset-focus').value;
    const p = PRESETS.presets.find(x => x.preset_id === id);
    if (p) { applyPreset(p); rerender(); }
  });
  $('save-preset').addEventListener('click', () => {
    const name = prompt('Name this preset:', state.activity_child || 'Custom preset');
    if (!name) return;
    addUserPreset(name);
    populatePresetCategory();
    alert(`Saved "${name}".`);
  });

  // Style toggle
  $('style-activity').addEventListener('click', () => {
    state.output_style = 'activity_led';
    $('style-activity').classList.add('active');
    $('style-goal').classList.remove('active');
    rerender();
  });
  $('style-goal').addEventListener('click', () => {
    state.output_style = 'goal_led';
    $('style-goal').classList.add('active');
    $('style-activity').classList.remove('active');
    rerender();
  });

  // Copy
  $('copy-btn').addEventListener('click', copyNote);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      copyNote();
    }
  });

  // Refine toggle
  $('refine-toggle').addEventListener('click', () => {
    const sec = $('refine-section');
    const t = $('refine-toggle');
    const expanded = !sec.hidden;
    sec.hidden = expanded;
    t.setAttribute('aria-expanded', String(!expanded));
  });

  // Clear
  $('clear-btn').addEventListener('click', () => {
    if (!confirm('Clear the current note and all wizard fields?')) return;
    clearState();
    $('preset-category').value = '';
    $('preset-intervention').innerHTML = '<option value="">—</option>';
    $('preset-intervention').disabled = true;
    $('preset-focus').innerHTML = '<option value="">—</option>';
    $('preset-focus').disabled = true;
    $('apply-preset').disabled = true;
    rerender();
  });
}

async function copyNote() {
  const note = $('output').value;
  if (!note) return;
  try {
    await navigator.clipboard.writeText(note);
    const m = $('copied');
    m.style.display = 'inline';
    setTimeout(() => m.style.display = 'none', 1500);
  } catch (e) {
    $('output').select();
    document.execCommand('copy');
  }
}

// ===== Init =====
async function init() {
  try {
    const [presetsResp, catalogsResp, taxonomyResp] = await Promise.all([
      fetch('presets.json'),
      fetch('catalogs.json'),
      fetch('taxonomy.json')
    ]);
    if (!presetsResp.ok) throw new Error(`presets.json: ${presetsResp.status}`);
    if (!catalogsResp.ok) throw new Error(`catalogs.json: ${catalogsResp.status}`);
    if (!taxonomyResp.ok) throw new Error(`taxonomy.json: ${taxonomyResp.status}`);
    PRESETS = await presetsResp.json();
    CATALOGS = await catalogsResp.json();
    INTERVENTION_TYPES_BY_ACTIVITY = await taxonomyResp.json();
    PRESET_INDEX = indexPresets();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:24px;font-family:sans-serif;color:#dc2626;">
      <h2>Failed to load data</h2>
      <p>${e.message}</p>
      <p>If running locally, serve with a web server (not file://). Try: <code>python3 -m http.server</code> in this folder.</p>
    </div>`;
    return;
  }

  // Populate static dropdowns
  populateSelect($('m-goal'), CATALOGS.goals);
  populateSelect($('m-deficit-select'), CATALOGS.deficits);
  populateSelect($('m-progress'), CATALOGS.progresses);
  populateSelect($('m-pain-location'), CATALOGS.body_parts);
  populateSelect($('m-pain-rating'), CATALOGS.pain_ratings);
  populateSelect($('m-hr'), CATALOGS.hr_values);
  populateSelect($('m-o2'), CATALOGS.o2_values);
  populateSelect($('m-bp'), CATALOGS.bp_values);

  // Populate action typeahead datalist
  const dl = $('action-suggest');
  if (dl) {
    dl.innerHTML = ACTION_SUGGESTIONS.map(a => `<option value="${a.replace(/"/g,'&quot;')}">`).join('');
  }

  wireEvents();
  populatePresetCategory();
  rerender();
}

document.addEventListener('DOMContentLoaded', init);
