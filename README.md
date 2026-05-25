# Final Build — OT Note Builder

Preset-first OT clinical documentation tool for SNF daily treatment notes. Built around the Golden Formula and the five-question diagnostic from `ot-documentation-style` skill.

Target: COTA writing 10–16 notes per session. Throughput goal: 60–90 seconds per note. Output: text on clipboard for EMR paste.

## Architecture

```
final-build-ot-note/
├── netlify.toml         # Build config + security headers
├── README.md
├── .gitignore
└── public/              # Static site root (Netlify publish dir)
    ├── index.html       # UI shell
    ├── styles.css       # Extracted styles
    ├── engine.js        # Pure note assembly (no DOM)
    ├── state.js         # State shape, localStorage, normalization
    ├── app.js           # DOM glue, fetch init, event wiring
    ├── presets.json     # Preset library (48 entries: 42 Bathing, 6 Dressing)
    ├── catalogs.json    # Deficits, progresses, body parts, vitals, reasoning
    └── taxonomy.json    # EMR intervention vocabulary by ADL
```

### Module load order

`engine.js` → `state.js` → `app.js`. `app.js` fetches JSON files on `DOMContentLoaded` and wires the UI once data is loaded.

### Data flow

- **Presets** (`presets.json`) — the high-volume documentation patterns. Each preset has source taxonomy (category / intervention type / specific focus) and `wizard_params` matching the state shape.
- **Catalogs** (`catalogs.json`) — vocabularies (deficits, goals, progress phrases, body parts, vitals, subjective quotes, reasoning phrases).
- **Taxonomy** (`taxonomy.json`) — EMR intervention vocabulary per ADL. Used when authoring new presets to match clinician's EMR language.

### State shape

See `state.js`. Persisted to `localStorage` under `final_build_ot_note_state_v8`. Custom user presets under `final_build_ot_note_user_presets`.

**No PHI is ever stored, transmitted, or logged.** localStorage holds session state and user-saved intervention patterns only.

## Development

### Run locally

The app uses `fetch()` to load data files, which doesn't work on `file://` URLs. Serve via any static server:

```bash
cd public
python3 -m http.server 8000
# Visit http://localhost:8000
```

Or with Node:

```bash
npx serve public
```

### Make changes

- **Voice / template changes:** edit `engine.js` only.
- **Add presets:** edit `presets.json` only.
- **Add a new ADL's intervention vocabulary:** edit `taxonomy.json`.
- **Style:** edit `styles.css`.
- **UI behavior:** edit `app.js`.

No build step. Reload the page to see changes.

### Test the engine in isolation

```bash
node -e "
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('public/engine.js', 'utf8'));
const state = {
  cpt: '97535', activity_parent: 'Dressing', activity_child: 'sock donning',
  goal: 'self-care independence', deficit: 'Decreased hip flexion',
  assists: [{level:'min physical assist', site:'trunk', purpose:'midline stability'}],
  cues: [], progress: 'Completed task with min cues',
  subjective:'', painRating:'', painLocation:'', hr:'', o2:'', bp:'',
  reasoningSelected:[], output_style:'activity_led'
};
console.log(window.OT_ENGINE.assembleNote(state));
"
```

## Deployment

### First-time setup

1. Create a private GitHub repo named `final-build-ot-note`.
2. From this folder: `git init && git add . && git commit -m "Initial split from v0.7 monolith"`
3. Add remote: `git remote add origin git@github.com:USER/final-build-ot-note.git`
4. Push: `git branch -M main && git push -u origin main`
5. In Netlify dashboard → Add new site → Import from Git → select the repo.
6. Netlify will detect `netlify.toml` and deploy. No build command needed.

### Ongoing workflow

- Feature branch per change: `git checkout -b v0.9-toileting-presets`
- Push branch: `git push origin v0.9-toileting-presets` → Netlify auto-builds a preview URL
- Test on the preview URL
- Open PR → review own changes → merge to `main`
- `main` deploy is now live at the production URL

### HIPAA note

Netlify is not HIPAA-compliant. This tool stays compliant by **not collecting PHI** — no patient names, no MRNs, no identifiable session data ever leaves the browser. Maintain this design.

## Version history

- **v0.8 (Final Build)** — Multi-file split from v0.7 monolith. No functional changes; refactor only.
- **v0.7** — EMR taxonomy embedded; 6 Dressing presets added; multi-ADL flow validated.
- **v0.6** — Assist data model expanded with site/action/percent; deficit-framing rewrite; purposeJoin helper.
- **v0.5** — SKILL.md compliance pass: assist levels spelled out, "Patient" capitalized everywhere.
- **v0.4** — Preset-first prototype with 42 Bathing presets.

## See also

- `/mnt/skills/user/ot-documentation-style/SKILL.md` — content/voice canonical
- `/mnt/skills/user/clinical-note-builder-ui/SKILL.md` — UI architecture canonical
