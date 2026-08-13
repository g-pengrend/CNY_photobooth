# 🔧 Theme Builder — Final Implementation Plan
## Two-Part Roadmap: Refactor First, Build Second

---

## Part 1: Codebase Refactoring

> [!IMPORTANT]
> All of Part 1 must be completed before Part 2. These changes are the foundation that makes the Admin UI viable. Each task is independent and can be done in any order within the part.

---

### Task 1.1 — Consolidate `app.js` into a Shared Module

**Problem:** CNY and UITS `app.js` are ~98% identical. Every new theme duplicates ~450 lines.

**Solution:** Move all shared logic to `static/shared/js/theme_app.js`. Each theme's `app.js` becomes a thin wrapper (~5–30 lines) that only defines what's unique.

**New File:** `static/shared/js/theme_app.js`

```javascript
// static/shared/js/theme_app.js
import { state, resetState, setLastPhotoBlob, setCurrentJobId } from './state.js';
import { initCamera, stopCamera, capturePhoto } from './camera.js';
import { uploadAndProcess, checkStatus } from './api.js';

// Theme UI functions are passed in as a dependency (avoids import path issues)
let _ui = null;

function pollStatus(jobId) {
    const pollInterval = setInterval(async () => {
        try {
            const status = await checkStatus(jobId);
            _ui.updateLoadingMessage(status.message || 'Processing...');
            if (status.analytics) _ui.updateAnalytics(status.analytics);

            if (status.status === 'completed') {
                clearInterval(pollInterval);
                _ui.displaySuccessImage(status.image);
            } else if (status.status === 'failed') {
                clearInterval(pollInterval);
                _ui.displayError(status.error || 'Processing failed');
            }
        } catch (error) {
            clearInterval(pollInterval);
            _ui.displayError('Failed to check processing status');
        }
    }, 2000);
}

/**
 * Main entry point for all themes.
 * @param {object} ui - The theme's ui.js exports (renderSelections, showScreen, etc.)
 * @param {object} options - Theme-specific options
 * @param {Function} options.onInit - Called after shared init (for theme-specific setup like film strip)
 * @param {object} options.features - Feature flags from theme_config.js
 */
export function initThemeApp(ui, { onInit, features = {} } = {}) {
    _ui = ui;
    
    document.addEventListener('DOMContentLoaded', () => {
        ui.renderSelections();
        _registerAllHandlers(features);
        ui.showScreen('welcome');
        if (typeof onInit === 'function') onInit();
    });
}

function _registerAllHandlers(features) {
    // --- Navigation ---
    document.getElementById('start-btn')?.addEventListener('click', () => {
        ui.showScreen('options');
    });
    
    // ... (all ~20 shared handlers) ...

    // Gender → decides next screen based on feature flags
    document.querySelectorAll('.gender-option[data-gender]').forEach(button => {
        button.addEventListener('click', () => {
            state.selections.gender = button.dataset.gender;
            document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('selected'));
            button.classList.add('selected');
            updateClothesFilter();
            
            // Feature flag: skip lucky number screen if disabled
            const nextScreen = features.luckyNumber ? 'settings' : 'pose';
            _ui.showScreen(nextScreen);
        });
    });
    
    // Back button from pose screen accounts for lucky number feature
    document.getElementById('back-to-gender-btn')?.addEventListener('click', () => {
        const prevScreen = features.luckyNumber ? 'settings' : 'options';
        _ui.showScreen(prevScreen);
    });

    // ... rest of handlers ...
}
```

**Each Theme's Minimal `app.js`:**

```javascript
// static/themes/cny/js/app.js  — ~3 lines
import * as ui from './ui.js';
import { initThemeApp } from '/static/shared/js/theme_app.js';
import { themeConfig } from './theme_config.js';
initThemeApp(ui, { features: themeConfig.features });
```

```javascript
// static/themes/uits/js/app.js  — ~20 lines
import * as ui from './ui.js';
import { initThemeApp } from '/static/shared/js/theme_app.js';
import { themeConfig } from './theme_config.js';

async function initRollingFilm() {
    // ... UITS-specific film strip logic (~40 lines) ...
    // Uses themeConfig.slug to build the API URL generically:
    const response = await fetch(`/api/${themeConfig.slug}/samples`);
    // ...
}

initThemeApp(ui, { onInit: initRollingFilm, features: themeConfig.features });
```

---

### Task 1.2 — Refactor `ui.js`: Decouple Data Import

**Problem:** `ui.js` does `import { poses, clothes, backgrounds } from './data.js'` — this couples the shared rendering logic to a per-theme import path, preventing true sharing.

**Solution:** `renderSelections()` accepts data as arguments instead of importing it. `ui.js` stays per-theme for now but becomes a thin delegation layer to shared renderers.

**New File:** `static/shared/js/theme_ui.js` — contains all rendering logic that's currently duplicated across `ui.js` files.

```javascript
// static/shared/js/theme_ui.js
export function renderSelections(poses, clothes, backgrounds) {
    _renderGrid('pose-grid',       poses,       _poseTemplate);
    _renderGrid('clothes-grid',    clothes,     _clothesTemplate);
    _renderGrid('background-grid', backgrounds, _bgTemplate);
}

function _poseTemplate(item) { return `
    <button class="selection-card" data-pose="${escapeHtml(item.prompt)}" data-code="${item.code}">
        ...
    </button>
`; }

// ... all other exports: showScreen, showResultState, updateLoadingMessage,
//     displaySuccessImage, displayPreviewImage, displayError,
//     prepareProcessingVisuals, updateAnalytics, showRevealButton, expandImage ...
```

**Each Theme's `ui.js` becomes:**

```javascript
// static/themes/cny/js/ui.js  — ~5 lines
import { poses, clothes, backgrounds } from './data.js';
export * from '/static/shared/js/theme_ui.js';

// Override renderSelections to inject this theme's data automatically
import { renderSelections as _render } from '/static/shared/js/theme_ui.js';
export function renderSelections() {
    _render(poses, clothes, backgrounds);
}
```

> [!NOTE]
> `ui.js` is kept per-theme (it's tiny) and serves as the data-binding layer. The actual rendering HTML templates live in `theme_ui.js` and are shared. This avoids dynamic import path gymnastics.

---

### Task 1.3 — Introduce `theme_config.js` Per Theme

This is the new **feature flag and identity file** for each theme. It drives both the runtime UI and the Admin scaffolding engine.

**New File:** `static/themes/{slug}/js/theme_config.js`

```javascript
// static/themes/cny/js/theme_config.js
export const themeConfig = {
    slug: 'cny',
    title: 'CNY Photo Booth',
    
    // Feature Flags — control which UX steps appear
    features: {
        luckyNumber: true,          // Shows the Lucky Number settings screen
        filmStrip: false,           // Shows rolling film strip on welcome screen
        genderFilter: true,         // Shows gender filter toggle on clothes screen
    },
    
    // Custom steps injected into the flow (see Task 1.4)
    customSteps: []
};
```

```javascript
// static/themes/uits/js/theme_config.js
export const themeConfig = {
    slug: 'uits',
    title: 'UITS 50th Anniversary',
    features: {
        luckyNumber: false,     // UITS doesn't use lucky number
        filmStrip: true,        // UITS uses the rolling film strip
        genderFilter: true,
    },
    customSteps: []
};
```

**How Feature Flags Work in Practice:**

- `luckyNumber: false` → the Settings screen is skipped entirely in the flow. Gender selection goes directly to Pose. The back button from Pose goes directly to Gender. **No HTML changes needed** — `theme_app.js` reads the flag and adjusts `showScreen()` calls.
- `filmStrip: true` → `onInit` hook in `app.js` calls `initRollingFilm()`. No flag needed in the HTML.
- The Settings screen HTML still exists in `index.html` (the template includes it) but is simply never navigated to if the flag is false.

> [!IMPORTANT]
> This means toggling `luckyNumber: true/false` **cannot break the code** — the screen exists in the HTML either way, but the flow logic routes around it when disabled. Turning it on just re-routes the nav.

---

### Task 1.4 — Custom Steps Architecture (Extensible Flow)

> [!NOTE]
> This is the forward-looking architecture for "what if a theme needs a completely new step?" — not needed immediately, but design it now so the Admin UI can build on it.

**Concept:** A `customSteps` array in `theme_config.js` declares additional steps that are injected into the flow at a specific position.

```javascript
// Hypothetical future theme with a "Message Card" step between clothes and background
customSteps: [
    {
        id: 'message-card',
        insertAfter: 'clothes',  // Injected after clothes selection
        screenId: 'message-card-screen',  // DOM ID in index.html
        stateKey: 'messageCard',          // Key added to state.selections
        datasetAttr: 'message',           // data-* attribute on selection cards
    }
]
```

`theme_app.js` reads `customSteps` and dynamically builds the navigation chain at init time — `showNextScreen('clothes')` looks up what comes after 'clothes' from the feature config rather than being hardcoded. This is a **graph-based navigation model** instead of hardcoded `showScreen('background')` calls.

For now: existing steps use this model internally. Custom steps are supported by config but not yet exposed in the Admin UI (Phase 2 can add this).

---

### Task 1.5 — Fix `api.js` Hardcoded Theme Validation

**Problem:** `api.js` line 4 has `const validThemes = ['cny', 'hariraya', 'uits', 'deepavali']` — every new theme must be added here manually.

**Fix:** Remove the whitelist. The theme is just the URL path slug — trust it.

```javascript
// static/shared/js/api.js — replace lines 3-5
const themeMatch = window.location.pathname.match(/\/([^\/]+)/);
const apiTheme = themeMatch ? themeMatch[1] : 'cny';
// No whitelist — the backend validates the theme against existing folders
```

---

### Task 1.6 — Dynamic Routing (Backend)

**`kiosk_frontend/app.py`** — Replace 4 explicit theme routes with one dynamic resolver. The `/api/uits/samples` route becomes generic:

```python
# Before (remove these 4 routes):
# @app.route('/cny'), @app.route('/hariraya'), etc.

# After:
RESERVED_SLUGS = {'api', 'static', 'admin'}

@app.route('/<theme_slug>')
def serve_dynamic_theme(theme_slug):
    if theme_slug in RESERVED_SLUGS:
        return "Not Found", 404
    theme_dir = os.path.join(app.static_folder, 'themes', theme_slug)
    if os.path.isfile(os.path.join(theme_dir, 'index.html')):
        return send_from_directory(theme_dir, 'index.html')
    return "Theme Not Found", 404

# Generic samples endpoint (replaces /api/uits/samples)
@app.route('/api/<theme_slug>/samples')
def list_theme_samples(theme_slug):
    samples_dir = os.path.join(app.static_folder, 'themes', theme_slug, 'images', 'samples')
    if not os.path.exists(samples_dir):
        return jsonify([])
    valid_ext = ('.png', '.jpg', '.jpeg', '.webp')
    images = [f for f in os.listdir(samples_dir) if f.lower().endswith(valid_ext)]
    return jsonify([f"/static/themes/{theme_slug}/images/samples/{img}" for img in images])
```

**`dgx_photobooth/linux_receiver.py`** — Replace hardcoded `if/elif` workflow file selection:

```python
# In trigger_linux_workflow(), replace the if/elif block with:
theme_dir = os.path.join(base_dir, "templates", "themes", theme)
workflow_file = None
if os.path.exists(theme_dir):
    for fname in os.listdir(theme_dir):
        if fname.startswith("FLF_workflow") and fname.endswith(".json"):
            workflow_file = os.path.join(theme_dir, fname)
            break
if not workflow_file:
    print(f"❌ No workflow JSON found for theme '{theme}'")
    return False
```

---

### Task 1.7 — `registry.json` + Dynamic Landing Page

**New File:** `static/themes/registry.json`

```json
[
  {
    "slug": "cny",
    "title": "Chinese New Year",
    "badge": "Lunar Prosperity",
    "icon": "🏮",
    "description": "Transform into an idol in traditional CNY attire with mystical blossoms.",
    "cta": "Start Celebration",
    "accentColor": "#D4AF37",
    "cardBg": "/static/landing/cny_card_bg.png",
    "status": "live",
    "poseCount": 9,
    "outfitCount": 12
  },
  { "slug": "hariraya", ... },
  { "slug": "deepavali", "status": "preview", ... },
  { "slug": "uits", "status": "live", ... }
]
```

**`landing.html`** — Replace all hardcoded `<a href="/cny" class="theme-card">` blocks with a JS fetch that builds cards dynamically from `/api/themes`. The card HTML template is built from registry fields. `status: "preview"` renders the "Coming Soon" badge variant automatically.

**New API endpoint in `app.py`:**

```python
@app.route('/api/themes')
def list_themes():
    registry_path = os.path.join(app.static_folder, 'themes', 'registry.json')
    if os.path.exists(registry_path):
        with open(registry_path, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify([])
```

---

### Part 1 — File Change Summary

| File | Change |
|---|---|
| `static/shared/js/theme_app.js` | **NEW** — shared app logic (~400 lines) |
| `static/shared/js/theme_ui.js` | **NEW** — shared UI renderers (moved from `ui.js`) |
| `static/themes/*/js/app.js` | **SHRINK** — 450 lines → 3–25 lines per theme |
| `static/themes/*/js/ui.js` | **SHRINK** — 265 lines → ~10 lines per theme |
| `static/themes/*/js/theme_config.js` | **NEW** — feature flags per theme |
| `static/shared/js/api.js` | **EDIT** — remove hardcoded theme whitelist |
| `kiosk_frontend/app.py` | **EDIT** — dynamic routing, generic samples API |
| `dgx_photobooth/linux_receiver.py` | **EDIT** — dynamic workflow file discovery |
| `static/themes/registry.json` | **NEW** — landing page source of truth |
| `static/landing.html` | **EDIT** — dynamic card generation from registry |

---

---

## Part 2: Admin UI Builder

> [!NOTE]
> All Part 1 tasks must be complete before starting Part 2. The Admin UI depends on the registry, dynamic routing, and `theme_config.js` architecture.

---

### Overview

A password-protected admin panel served at `/admin` by `kiosk_frontend/app.py`. Single-page 4-step wizard. All output files are written to the same machine (since kiosk and DGX receiver share the filesystem).

---

### Task 2.1 — Admin Routes & Auth

```python
# app.py additions
from functools import wraps
from flask import session

app.secret_key = os.urandom(24)  # or hardcoded for persistence

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin_authenticated'):
            return redirect('/admin/login')
        return f(*args, **kwargs)
    return decorated

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        if request.form.get('password') == ADMIN_PASSWORD:
            session['admin_authenticated'] = True
            return redirect('/admin')
        return send_from_directory(os.path.join(app.static_folder, 'admin'), 'login.html'), 401
    return send_from_directory(os.path.join(app.static_folder, 'admin'), 'login.html')

@app.route('/admin')
@admin_required
def admin_panel():
    return send_from_directory(os.path.join(app.static_folder, 'admin'), 'index.html')
```

---

### Task 2.2 — Asset Discovery API

The wizard needs to know what assets already exist across all themes to present as reuse options.

```python
@app.route('/api/admin/assets')
@admin_required
def get_all_assets():
    """Scan all theme folders and return all discovered assets."""
    themes_dir = os.path.join(app.static_folder, 'themes')
    all_assets = { 'poses': [], 'clothes': [], 'backgrounds': [] }
    
    for slug in os.listdir(themes_dir):
        if slug.startswith('_') or slug == 'registry.json':
            continue
        for asset_type in ['poses', 'clothes', 'backgrounds']:
            img_dir = os.path.join(themes_dir, slug, 'images', asset_type)
            if os.path.exists(img_dir):
                for img in os.listdir(img_dir):
                    if img.lower().endswith(('.png', '.jpg', '.webp')):
                        all_assets[asset_type].append({
                            'fromTheme': slug,
                            'filename': img,
                            'path': f'/static/themes/{slug}/images/{asset_type}/{img}'
                        })
    return jsonify(all_assets)
```

> [!NOTE]
> This API returns discovered image files. The full metadata (title, prompt, etc.) for existing assets comes from parsing each theme's `data.js`. Since `data.js` is a JS module (not JSON), the scaffolding engine should also maintain a parallel `data.json` for each theme that the admin can read server-side. This is generated at publish time.

---

### Task 2.3 — The 4-Step Wizard UI

**Step 1 — Theme Identity**

Fields: Slug, Title, Tagline, Emoji, Badge Text, CTA Button text.

Color pickers: Primary BG, Accent Color, Primary Color.

Font picker: Google Font name (used in the template).

Feature flags (checkboxes):
- `luckyNumber` — "Show Lucky Number step"
- `filmStrip` — "Enable rolling film strip on welcome screen"
- `genderFilter` — "Enable gender filter on clothes"

Live preview panel shows a mini landing card as you type.

---

**Step 2 — Asset Curation**

Three tabs: Poses | Clothes | Backgrounds.

**Left panel:** All existing assets from `/api/admin/assets`, grouped by source theme. Click to "borrow" — copies image to new theme folder, inherits metadata.

**Right panel:** Your curated list for the new theme. Drag to reorder. Assign/edit codes (auto-assigned, editable). Edit title, description, prompt inline.

**"Generate New" button (Clothes only):**
1. Prompt textarea
2. Category: Male / Female / Unisex
3. [Generate Preview] → calls `/api/admin/comfy/preview`
4. Preview image renders (polling ComfyUI)
5. [Approve & Add] saves PNG to `images/clothes/`, enters asset into right panel

```python
@app.route('/api/admin/comfy/preview', methods=['POST'])
@admin_required
def generate_outfit_preview():
    """Queue a standalone studio-shot in ComfyUI and return a job ID."""
    data = request.json
    prompt = data.get('prompt', '')
    # Load the admin standalone-shot workflow JSON
    # Inject the prompt
    # Queue to ComfyUI at 127.0.0.1:8188
    # Return a job ID for polling
    ...
```

A separate `admin_preview_workflow.json` (stored in `static/admin/`) is used — a lightweight single-image output workflow based on the standalone studio shot framing from `theme_generation_guide.md`.

---

**Step 3 — Metadata Generation**

For each clothes item, generate: Title, Description (UI), Mapping Desc (DGX), Lighting.

**Mode A — API (Gemini configured):**
- Auto button calls `/api/admin/generate-metadata`
- Backend calls Gemini API with the prompt template from `theme_generation_guide.md`
- Response auto-fills the 4 fields

**Mode B — Manual (no API key):**

```
┌─────────────────────────────────────────────────────────┐
│ ℹ️ No API key configured. Use this prompt with any       │
│ AI assistant (ChatGPT, Gemini, Claude):                  │
│                                                          │
│ ┌──────────────────────────────────────────────────┐    │
│ │ Given this clothing prompt:                      │    │
│ │ "[prompt auto-inserted here]"                    │    │
│ │                                                  │    │
│ │ Return JSON with these exact keys:               │    │
│ │ {                                                │    │
│ │   "title": "3-5 word premium name",              │    │
│ │   "description": "punchy UI text, max 12 words", │    │
│ │   "mapping_desc": "8-12 word simplified desc",   │    │
│ │   "lighting": "Color1 and Color2"                │    │
│ │ }                                                │    │
│ └──────────────────────────────────────────────────┘    │
│ [📋 Copy Prompt]                                         │
│                                                          │
│ Paste AI response here:                                  │
│ [                                              ]         │
│ [✓ Parse & Apply to Fields]                              │
└─────────────────────────────────────────────────────────┘
```

Poses and Backgrounds only need: Title, Description, Prompt. No mapping metadata needed.

---

**Step 4 — Review & Publish**

Read-only summary of everything to be created. A "Base ComfyUI Workflow" dropdown selects which existing theme's `FLF_workflowAPI.json` to copy as the starting point.

[🚀 Publish Theme] calls `/api/admin/create-theme`.

---

### Task 2.4 — Scaffolding Engine (`/api/admin/create-theme`)

```python
@app.route('/api/admin/create-theme', methods=['POST'])
@admin_required
def create_theme():
    payload = request.json
    slug = payload['slug']
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    kiosk_theme_dir = os.path.join(base_dir, 'static', 'themes', slug)
    dgx_theme_dir = os.path.join(base_dir, '..', 'dgx_photobooth', 'templates', 'themes', slug)
    
    # 1. Create directories
    for subdir in ['images/clothes', 'images/poses', 'images/backgrounds', 'images/samples', 'js']:
        os.makedirs(os.path.join(kiosk_theme_dir, subdir), exist_ok=True)
    os.makedirs(dgx_theme_dir, exist_ok=True)
    
    # 2. Copy any borrowed assets (images already uploaded in Step 2)
    # (Images were saved to temp dir during wizard; move them to final location)
    
    # 3. Write theme_config.js from payload
    write_theme_config(kiosk_theme_dir, payload)
    
    # 4. Write data.js from wizard's structured asset data
    write_data_js(kiosk_theme_dir, payload)
    
    # 5. Write data.json (machine-readable mirror of data.js for admin reads)
    write_data_json(kiosk_theme_dir, payload)
    
    # 6. Scaffold index.html from _template with token substitution
    write_index_html(kiosk_theme_dir, payload)
    
    # 7. Scaffold style.css from _template with color injection
    write_style_css(kiosk_theme_dir, payload)
    
    # 8. Write minimal app.js
    write_app_js(kiosk_theme_dir, payload)
    
    # 9. Write minimal ui.js
    write_ui_js(kiosk_theme_dir, payload)
    
    # 10. Write clothes_mapping.json to dgx_photobooth
    write_clothes_mapping(dgx_theme_dir, payload)
    
    # 11. Copy selected base workflow JSON to dgx_photobooth
    copy_workflow(dgx_theme_dir, payload['baseWorkflow'], slug)
    
    # 12. Append to registry.json
    append_to_registry(kiosk_theme_dir, payload)
    
    return jsonify({'status': 'success', 'url': f'/{slug}', 'slug': slug})
```

**Key function — `write_clothes_mapping`** (generated from single source):
```python
def write_clothes_mapping(dgx_dir, payload):
    mapping = {}
    for item in payload['clothes']:
        mapping[item['code']] = {
            'desc': item['mappingDesc'],
            'lighting': item['lighting']
        }
    with open(os.path.join(dgx_dir, 'clothes_mapping.json'), 'w') as f:
        json.dump(mapping, f, indent=4)
```

---

### Part 2 — File Change Summary

| File | Change |
|---|---|
| `static/admin/index.html` | **NEW** — Admin wizard SPA |
| `static/admin/admin.js` | **NEW** — Wizard state, API calls, step logic |
| `static/admin/admin.css` | **NEW** — Admin UI styles |
| `static/admin/login.html` | **NEW** — Password form |
| `static/admin/admin_preview_workflow.json` | **NEW** — ComfyUI standalone shot workflow |
| `static/themes/_template/index.html` | **NEW** — Token-based HTML template |
| `static/themes/_template/style.css` | **NEW** — Token-based CSS template |
| `kiosk_frontend/app.py` | **EDIT** — Admin routes, asset discovery, scaffolding engine |

---

## Execution Checklist

### Part 1
- [ ] 1.1 Create `theme_app.js`, update all `app.js` files
- [ ] 1.2 Create `theme_ui.js`, update all `ui.js` files  
- [ ] 1.3 Create `theme_config.js` for all existing themes
- [ ] 1.4 Implement graph-based nav in `theme_app.js` (reads feature flags)
- [ ] 1.5 Fix `api.js` theme whitelist
- [ ] 1.6 Dynamic routing in `app.py` + `linux_receiver.py`
- [ ] 1.7 Create `registry.json`, update `landing.html`

### Part 2
- [ ] 2.1 Admin auth routes
- [ ] 2.2 Asset discovery API + `data.json` convention
- [ ] 2.3 Admin wizard UI (4 steps)
- [ ] 2.4 Scaffolding engine endpoint
- [ ] 2.5 ComfyUI preview hook
- [ ] 2.6 Metadata generation (API + manual fallback)
- [ ] 2.7 `_template` folder (index.html + style.css with tokens)
