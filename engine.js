/* ============================================================
   engine.js — Pure note assembly logic
   No DOM dependencies. All functions take state as input.
   ============================================================ */

// ===== SKILL.md compliance: assist level vocabulary =====
const ASSIST_LEVEL_NORMALIZE = {
  'min A': 'min physical assist',
  'mod A': 'mod physical assist',
  'max A': 'max physical assist',
  'minA': 'min physical assist',
  'modA': 'mod physical assist',
  'maxA': 'max physical assist'
};

function normalizeAssistLevel(lvl) {
  if (!lvl) return lvl;
  return ASSIST_LEVEL_NORMALIZE[lvl] || lvl;
}

// ===== Preposition picker for purposes =====
// Verb-phrase purposes ("ensure stability", "compensate for X") → "to ensure stability"
// Bare-noun purposes ("stability", "safety") → "for stability"
const PURPOSE_VERB_LEAD = /^(compensate|ensure|maintain|prevent|facilitate|support|provide|promote|complete|perform|address|reduce|minimize|preserve)\b/i;

function purposeJoin(p) {
  if (!p) return '';
  return PURPOSE_VERB_LEAD.test(p) ? `to ${p}` : `for ${p}`;
}

// ===== Cue formatting =====
const NON_PLURAL_KINDS = new Set([
  'encouragement', 'guidance', 'feedback', 'coaching',
  'instruction', 'education', 'rehearsal', 'reinforcement'
]);

function pluralize(kind) {
  if (!kind) return 'cues';
  if (NON_PLURAL_KINDS.has(kind)) return kind;
  if (kind.endsWith('s')) return kind;
  return kind + 's';
}

function formatCue(c) {
  if (c.type === 'environmental') {
    const sub = c.subtype || 'modifications';
    return `environmental ${sub === 'mods' ? 'modifications' : sub}`;
  }
  if (c.type === 'demonstration') {
    if (c.purpose) return `demonstration of ${c.purpose}`;
    if (c.modifier) return `${c.modifier} demonstration`;
    return 'demonstration';
  }
  const lvl = c.level ? `${c.level} ` : '';
  const kind = pluralize(c.kind || 'cue');
  let s = `${lvl}${c.type} ${kind}`;
  if (c.purpose) s += ` for ${c.purpose}`;
  return s;
}

// ===== Assist formatting (v0.6 schema: level/site/action/purpose/percent) =====
function formatAssist(a) {
  const level = normalizeAssistLevel(a.level) || '';
  if (!level) return '';
  let s = level;
  if (a.percent !== undefined && a.percent !== null && a.percent !== '' && !isNaN(+a.percent)) {
    s += ` (${+a.percent}%)`;
  }
  if (a.site) s += ` at ${a.site}`;
  if (a.action) s += ` during ${a.action}`;
  if (a.purpose) s += ` ${purposeJoin(a.purpose)}`;
  return s.trim();
}

// ===== Utility: join list with serial comma =====
function joinList(items) {
  items = items.filter(Boolean);
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : ''; }
function ensurePeriod(s) { return /[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + '.'; }

// ===== Deterministic deficit-trail variation =====
// Same deficit text always pairs with the same trail; variety across the corpus.
const DEFICIT_TRAILS = [
  ', limiting independent task performance',
  ', impacting functional independence',
  ', requiring skilled facilitation for safe completion',
  ', limiting safe task progression'
];

function pickDeficitTrail(seed) {
  let hash = 0;
  for (let i = 0; i < (seed || '').length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return DEFICIT_TRAILS[Math.abs(hash) % DEFICIT_TRAILS.length];
}

// ===== Main note assembly =====
function assembleNote(state) {
  const facList = [
    ...state.cues.map(formatCue),
    ...state.assists.map(formatAssist)
  ].filter(Boolean);
  const facLine = joinList(facList);
  const deficit = (state.deficit || '').trim();
  const deficitLow = lowerFirst(deficit);
  const goal = (state.goal || '').trim();
  const progress = (state.progress || '').trim();
  const ap = state.activity_parent;
  const ac = (state.activity_child || '').trim();

  // When any facilitation carries its own purpose, deficit moves to standalone
  // sentence using gerund construction. Prevents "to X to Y" stacking and
  // dodges subject-verb agreement bugs with compound subjects.
  const facHasPurpose =
    state.assists.some(a => a.purpose) ||
    state.cues.some(c => c.purpose);

  let activityPhrase = '';
  if (ap) {
    const apLower = ap.toLowerCase();
    activityPhrase = ac
      ? `${apLower} task training, focused on ${ac}`
      : `${apLower} task training`;
  }

  const sentences = [];

  if (state.output_style === 'activity_led') {
    if (activityPhrase) sentences.push(`Patient participated in ${activityPhrase}.`);
    if (deficit && facLine) {
      if (facHasPurpose) {
        sentences.push(`Patient required ${facLine}.`);
        sentences.push(`Patient demonstrates ${deficitLow}${pickDeficitTrail(deficit)}.`);
      } else {
        sentences.push(`Patient required ${facLine} to address ${deficitLow}.`);
      }
    } else if (deficit) {
      sentences.push(`${deficit} noted.`);
    } else if (facLine) {
      sentences.push(`Patient required ${facLine}.`);
    }
    if (goal) sentences.push(`Trained in ${goal}.`);
    if (progress) sentences.push(ensurePeriod(progress));
  } else {
    // goal-led
    if (goal && activityPhrase) {
      sentences.push(`To address ${goal}, Patient instructed in ${activityPhrase}.`);
    } else if (activityPhrase) {
      sentences.push(`Patient instructed in ${activityPhrase}.`);
    } else if (goal) {
      sentences.push(`Patient instructed to address ${goal}.`);
    }
    if (deficit) {
      sentences.push(facHasPurpose
        ? `Patient demonstrates ${deficitLow}${pickDeficitTrail(deficit)}.`
        : `${deficit} noted.`);
    }
    if (facLine) sentences.push(`Patient required ${facLine}.`);
    if (progress) sentences.push(ensurePeriod(progress));
  }

  // Context: subjective / pain / vitals / clinical reasoning
  const ctx = [];
  if (state.subjective && state.subjective.trim()) {
    ctx.push(`Patient reports: "${state.subjective.trim()}"`);
  }
  if (state.painRating) {
    ctx.push(`Pain reported ${state.painRating}/10${state.painLocation ? ` at ${state.painLocation}` : ''}`);
  }
  const vitals = [];
  if (state.hr) vitals.push(`HR ${state.hr}`);
  if (state.o2) vitals.push(`O2 sat ${state.o2}%`);
  if (state.bp) vitals.push(`BP ${state.bp}`);
  if (vitals.length) ctx.push(`Vitals: ${vitals.join(', ')}`);
  if (state.reasoningSelected && state.reasoningSelected.length) {
    ctx.push(state.reasoningSelected.join('. '));
  }
  if (ctx.length) sentences.push(ctx.join('. ') + '.');

  return sentences.join(' ');
}

// ===== Browser globals (no module system; load via <script>) =====
window.OT_ENGINE = {
  assembleNote,
  formatCue,
  formatAssist,
  purposeJoin,
  normalizeAssistLevel,
  pickDeficitTrail,
  joinList,
  // exposed for testing
  _internals: { capitalize, lowerFirst, ensurePeriod, pluralize, DEFICIT_TRAILS, ASSIST_LEVEL_NORMALIZE }
};
