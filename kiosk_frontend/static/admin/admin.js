/**
 * Photobooth Theme Studio — Admin Application Logic
 */

// Studio State
const studio = {
    themes: [],
    activeTheme: null,
    activeData: { clothes: [], poses: [], backgrounds: [] },
    activeBindings: null,
    uploadedWorkflow: null,
    activeTab: 'branding',
    masterAssets: { clothes: [], poses: [], backgrounds: [] },
    pickerCategory: 'clothes',
    galleryCategory: 'clothes',
    pickerTargetIndex: null,
    assetGenConfigs: {},
    currentGenType: 'backdrop',
    lastGenResult: null,
    pendingDeleteSlug: null,
    currentView: 'theme-editor' // 'theme-editor' | 'master-library' | 'ai-creator'
};
window.studio = studio;

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initEventListeners();
    await loadThemes(null, true);
    await loadMasterAssets();
    await loadAssetGenConfigs();
    if (typeof window.updateFullSystematicGenAiPrompt === 'function') { window.updateFullSystematicGenAiPrompt(); }
});

async function loadMasterAssets() {
    try {
        const res = await fetch('/api/admin/assets');
        if (res.ok) {
            studio.masterAssets = await res.json();
            console.log("Master assets catalog loaded:", {
                clothes: studio.masterAssets.clothes?.length,
                poses: studio.masterAssets.poses?.length,
                backgrounds: studio.masterAssets.backgrounds?.length
            });
        }
    } catch (e) {
        console.warn('Could not load master assets:', e);
    }
}

// ==========================================================================
// 1. Theme Loading & Sidebar
// ==========================================================================
async function loadThemes(targetSlug = null, autoSelectFirst = false) {
    try {
        const res = await fetch('/api/themes');
        if (!res.ok) throw new Error('Failed to load themes');
        const allThemes = await res.json();

        // 1. Maintain in-memory unsaved drafts if not yet listed in /api/themes
        const unsavedDrafts = (studio.themes || []).filter(t => t.isUnsavedDraft);
        studio.themes = allThemes.filter(t => t.slug !== 'master');
        for (const draft of unsavedDrafts) {
            if (!studio.themes.some(t => t.slug === draft.slug)) {
                studio.themes.unshift(draft);
            }
        }

        renderThemeSidebar();

        const activeSlug = targetSlug || studio.activeTheme?.slug;
        const matchingTheme = activeSlug ? studio.themes.find(t => t.slug === activeSlug) : null;

        if (matchingTheme) {
            if (!matchingTheme.isUnsavedDraft && studio.activeTheme?.slug === activeSlug) {
                studio.activeTheme.isUnsavedDraft = false;
            }
            return;
        }

        if (autoSelectFirst && studio.themes.length > 0) {
            selectTheme(studio.themes[0].slug);
        }
    } catch (err) {
        showToast('Error loading themes: ' + err.message, 'error');
    }
}

function renderThemeSidebar() {
    const listEl = document.getElementById('sidebar-theme-list');
    if (!listEl) return;

    const isThemeView = studio.currentView === 'theme-editor';

    const createCardHtml = `
        <div class="sidebar-create-card" onclick="createNewTheme()" title="Create a new theme">
            <div class="create-card-icon-wrap">➕</div>
            <div>
                <div class="create-card-title">Create New Theme</div>
                <div class="create-card-sub">Basic Form or GenAI Studio</div>
            </div>
        </div>
    `;

    const themeItemsHtml = studio.themes.map(t => {
        const isActive = isThemeView && studio.activeTheme?.slug === t.slug;
        const isDraft = t.status === 'draft';
        const isReserved = ['cny', 'hariraya', 'deepavali', 'uits', 'ndp2026', 'master'].includes(t.slug?.toLowerCase());
        return `<div class="theme-item ${isActive ? 'active' : ''} ${isDraft ? 'theme-item-draft' : ''}" data-slug="${t.slug}">
            <div class="theme-item-info">
                <span class="theme-item-icon">${t.icon || '✨'}</span>
                <div>
                    <div class="theme-item-title">${t.title}</div>
                    <div class="theme-item-slug">/${t.slug}</div>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem;">
                <span class="${isDraft ? 'badge-draft' : 'badge-live'}">${t.status || 'live'}</span>
                ${!isReserved ? `<button class="sidebar-delete-btn" title="Delete theme" onclick="openDeleteThemeModal('${t.slug}','${(t.title||'').replace(/'/g,"\\'")}'); event.stopPropagation();">🗑️</button>` : ''}
            </div>
        </div>`;
    }).join('');

    listEl.innerHTML = createCardHtml + themeItemsHtml;

    listEl.querySelectorAll('.theme-item').forEach(item => {
        item.addEventListener('click', () => selectTheme(item.dataset.slug));
    });
}

async function selectTheme(slug, force = false) {
    if (!force && studio.activeTheme?.slug === slug && studio.activeTheme?.isUnsavedDraft) {
        return;
    }
    try {
        const [themeRes, dataRes] = await Promise.all([
            fetch(`/api/theme/${slug}`),
            fetch(`/api/theme/${slug}/data`)
        ]);

        if (!themeRes.ok) throw new Error('Theme not found');
        studio.activeTheme = await themeRes.json();
        studio.activeTheme.isUnsavedDraft = false;
        studio.activeData = dataRes.ok ? await dataRes.json() : { clothes: [], poses: [], backgrounds: [] };

        // Remove in-memory unsaved draft placeholder if another theme is selected
        studio.themes = studio.themes.filter(t => !(t.isUnsavedDraft && t.slug !== slug));
        const cur = studio.themes.find(t => t.slug === slug);
        if (cur) cur.isUnsavedDraft = false;

        renderThemeSidebar();
        populateFormFields(studio.activeTheme);
        renderAssetsList();
        loadExistingBindings(slug);
        loadExistingAtmosphere(slug);

        document.getElementById('current-theme-heading').textContent = studio.activeTheme.title;
        const sub = document.getElementById('current-theme-subheading');
        if (sub) sub.textContent = `/${studio.activeTheme.slug} · Editing identity, workflow, and wardrobe`;

        switchToThemeEditor();
        switchAssetSubtab('clothes');
    } catch (err) {
        showToast('Failed to select theme: ' + err.message, 'error');
    }
}

async function loadExistingBindings(slug) {
    try {
        let bindings = null;
        try {
            const apiRes = await fetch(`/api/theme/${slug}/bindings`);
            if (apiRes.ok) {
                bindings = await apiRes.json();
            }
        } catch (e) {}

        if (!bindings) {
            try {
                const bRes = await fetch(`/static/themes/${slug}/bindings.json`);
                if (bRes.ok) {
                    bindings = await bRes.json();
                }
            } catch (e) {}
        }

        if (!bindings) {
            bindings = {
                input_image_node: '65',
                prompt_node: '45',
                sampler_node: '44',
                face_swap_node: '57',
                output_node: '60',
                confidence: 'benchmark_default'
            };
        }

        studio.activeBindings = bindings;
        renderBindingsCard(studio.activeBindings);
    } catch (e) {
        console.error('Error loading bindings:', e);
    }
}

function getUniqueNewThemeSlug() {
    const existingSlugs = new Set((studio.themes || []).map(t => (t.slug || '').toLowerCase()));
    if (studio.activeTheme?.slug) {
        existingSlugs.add(studio.activeTheme.slug.toLowerCase());
    }
    let counter = 1;
    while (existingSlugs.has(`new_theme_${counter}`)) {
        counter++;
    }
    return `new_theme_${counter}`;
}

function createNewTheme() {
    // Remove any unpersisted in-memory draft placeholders first
    studio.themes = (studio.themes || []).filter(t => !t.isUnsavedDraft);

    const defaultSlug = getUniqueNewThemeSlug();

    // Add placeholder into sidebar themes list at the top
    const placeholder = {
        slug: defaultSlug,
        title: 'Untitled Theme ✨',
        icon: '🎉',
        status: 'draft',
        isUnsavedDraft: true
    };
    studio.themes.unshift(placeholder);

    studio.activeTheme = {
        slug: defaultSlug,
        title: 'New Event Photobooth',
        subtitle: 'Virtual Try-On Experience',
        badge: 'Special Edition',
        icon: '🎉',
        description: 'Celebrate in style with AI-powered festive portrait try-ons.',
        cta: 'Start Experience',
        status: 'draft',
        isUnsavedDraft: true,
        features: { luckyNumber: false, filmStrip: false, genderFilter: true },
        background: { type: 'particles', floatingIcons: ['✨', '⭐', '🎉', '✦'], filmStrip: false },
        style: {
            fontFamily: "'Outfit', sans-serif",
            googleFontUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap',
            colors: {
                background: '#0a0a12',
                text: '#ffffff',
                primary: '#181926',
                accent: '#6366f1',
                accentGlow: 'rgba(99, 102, 241, 0.25)',
                surface: 'rgba(255, 255, 255, 0.05)',
                surfaceBorder: 'rgba(255, 255, 255, 0.12)'
            },
            gradients: {
                radialBackground: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.2) 0%, transparent 70%)',
                primaryButton: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
            }
        },
        waitingExperience: {
            title: 'Creating Magic...',
            subtitle: 'Processing your portrait',
            sequence: [
                { text: 'Analyzing your portrait...', delay: 500 },
                { text: 'Synthesizing festive textures...', delay: 3500 },
                { text: 'Perfecting lighting and aura...', delay: 7000 },
                { text: 'Getting ready to celebrate!', delay: 11000 }
            ],
            completionMessage: 'Calculations Complete! Ready to manifest.'
        },
        promptTemplate: {
            framing: 'Medium shot, waist up shot of',
            border: '',
            topTitle: '',
            topTitleStyle: '',
            subtitle: '',
            subtitleStyle: '',
            bottomTitle: '',
            bottomTitleStyle: '',
            typoIntegration: '',
            atmosphere: 'Volumetric cinematic lighting, vibrant depth of field, 8k.',
            maleStyle: 'executive leading man in tailored dinner suit',
            femaleStyle: 'charismatic elegant leading lady in evening gown'
        }
    };

    studio.activeData = { clothes: [], poses: [], backgrounds: [] };
    studio.activeBindings = {
        input_image_node: '65',
        prompt_node: '45',
        sampler_node: '44',
        face_swap_node: '57',
        output_node: '60',
        confidence: 'benchmark_default'
    };

    renderThemeSidebar();
    populateFormFields(studio.activeTheme);
    const htmlEl = document.getElementById('adv-decorations-html');
    const cssEl = document.getElementById('adv-custom-css');
    const jsonEl = document.getElementById('adv-identity-json');
    if (htmlEl) htmlEl.value = '';
    if (cssEl) cssEl.value = '';
    if (jsonEl) jsonEl.value = '';
    window._lastAutoAppliedJson = '';
    const autoStatusEl = document.getElementById('json-auto-status');
    if (autoStatusEl) autoStatusEl.style.display = 'none';
    renderAssetsList();
    renderBindingsCard(studio.activeBindings);
    document.getElementById('current-theme-heading').textContent = '✨ New Theme';
    const sub = document.getElementById('current-theme-subheading');
    if (sub) sub.textContent = 'Choose Basic or Advanced Mode below to build this theme, then Publish.';

    switchToThemeEditor();
    if (typeof window.setThemeStudioMode === 'function') {
        window.setThemeStudioMode('basic', false);
    }
    showToast('Created new draft theme. Choose Basic or Advanced Mode to begin!', 'success');
}

// ==========================================================================
// 2. Form Binding & Live Controls
// ==========================================================================
function populateFormFields(theme) {
    if (!theme) return;

    // Identity (Basic and Advanced sync)
    setValue('inp-slug', theme.slug || '');
    setValue('inp-slug-adv', theme.slug || '');
    setValue('inp-title', theme.title || '');
    setValue('inp-title-adv', theme.title || '');
    setValue('inp-subtitle', theme.subtitle || '');
    setValue('inp-subtitle-adv', theme.subtitle || '');
    setValue('inp-badge', theme.badge || '');
    setValue('inp-badge-adv', theme.badge || '');
    setValue('inp-icon', theme.icon || '✨');
    setValue('inp-icon-adv', theme.icon || '✨');
    setValue('inp-cta', theme.cta || 'Start Experience');
    setValue('inp-cta-adv', theme.cta || 'Start Experience');
    setValue('inp-desc', theme.description || '');
    setValue('inp-desc-adv', theme.description || '');

    // Colors
    const colors = theme.style?.colors || {};
    setColor('inp-color-bg', colors.background || '#0c0d14');
    setColor('inp-color-accent', colors.accent || '#d4af37');
    setColor('inp-color-text', colors.text || '#ffffff');
    setColor('inp-color-primary', colors.primary || '#181926');

    // Font
    setValue('inp-font', theme.style?.fontFamily || "'Outfit', sans-serif");
    setValue('inp-google-font', theme.style?.googleFontUrl || '');

    // Features (Basic and Advanced sync)
    setChecked('chk-lucky-number', theme.features?.luckyNumber || false);
    setChecked('chk-lucky-number-adv', theme.features?.luckyNumber || false);
    setChecked('chk-film-strip', theme.features?.filmStrip || false);
    setChecked('chk-film-strip-adv', theme.features?.filmStrip || false);
    setChecked('chk-gender-filter', theme.features?.genderFilter !== false);
    setChecked('chk-gender-filter-adv', theme.features?.genderFilter !== false);

    // Atmosphere
    const bg = theme.background || {};
    setValue('sel-bg-type', bg.type || 'particles');
    setValue('inp-floating-icons', (bg.floatingIcons || ['✨', '✦', '⭐']).join(', '));
    setValue('adv-theme-intent', (theme.title && theme.title !== 'New Event Photobooth' && theme.title !== 'Untitled Theme ✨') ? theme.title : '');

    if (typeof window.setThemeStudioMode === 'function') {
        window.setThemeStudioMode(theme.atmosphereMode === 'advanced' ? 'advanced' : 'basic', false);
    } else if (typeof window.setAtmosphereBuilderMode === 'function') {
        window.setAtmosphereBuilderMode(theme.atmosphereMode === 'advanced' ? 'advanced' : 'basic', false);
    }

    // Waiting Screen Sequence
    renderWaitingSequenceList(theme.waitingExperience?.sequence || []);

    // Prompt Designer
    populatePromptDesigner(theme);

    // Update Full Systematic GenAI Prompt preview
    if (typeof window.updateFullSystematicGenAiPrompt === 'function') {
        window.updateFullSystematicGenAiPrompt();
    }
}

function readFormFields() {
    const theme = studio.activeTheme || {};

    const isAdv = studio.currentThemeMode === 'advanced' || studio.currentAtmosphereMode === 'advanced';

    const rawSlug = (isAdv && getValue('inp-slug-adv').trim()) ? getValue('inp-slug-adv') : getValue('inp-slug');
    const rawTitle = (isAdv && getValue('inp-title-adv').trim()) ? getValue('inp-title-adv') : getValue('inp-title');
    const rawSubtitle = (isAdv && getValue('inp-subtitle-adv').trim()) ? getValue('inp-subtitle-adv') : getValue('inp-subtitle');
    const rawBadge = (isAdv && getValue('inp-badge-adv').trim()) ? getValue('inp-badge-adv') : getValue('inp-badge');
    const rawIcon = (isAdv && getValue('inp-icon-adv').trim()) ? getValue('inp-icon-adv') : getValue('inp-icon');
    const rawCta = (isAdv && getValue('inp-cta-adv').trim()) ? getValue('inp-cta-adv') : getValue('inp-cta');
    const rawDesc = (isAdv && getValue('inp-desc-adv').trim()) ? getValue('inp-desc-adv') : getValue('inp-desc');

    theme.slug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    theme.title = rawTitle.trim();
    theme.subtitle = rawSubtitle.trim();
    theme.badge = rawBadge.trim();
    theme.icon = rawIcon.trim() || '✨';
    theme.cta = rawCta.trim() || 'Start';
    theme.description = rawDesc.trim();
    theme.status = studio.activeTheme?.status || 'draft';

    // Style
    theme.style = theme.style || {};
    theme.style.fontFamily = getValue('inp-font').trim();
    theme.style.googleFontUrl = getValue('inp-google-font').trim();
    theme.style.colors = {
        background: getValue('inp-color-bg'),
        accent: getValue('inp-color-accent'),
        text: getValue('inp-color-text'),
        primary: getValue('inp-color-primary'),
        accentGlow: hexToRgba(getValue('inp-color-accent'), 0.25),
        surface: 'rgba(255, 255, 255, 0.05)',
        surfaceBorder: hexToRgba(getValue('inp-color-accent'), 0.3)
    };
    theme.style.gradients = {
        radialBackground: `radial-gradient(circle at 50% 50%, ${theme.style.colors.accentGlow} 0%, transparent 70%)`,
        primaryButton: `linear-gradient(135deg, ${theme.style.colors.primary} 0%, ${theme.style.colors.accent} 100%)`
    };

    // Features
    const filmVal = isAdv ? getChecked('chk-film-strip-adv') : getChecked('chk-film-strip');
    const luckyVal = isAdv ? getChecked('chk-lucky-number-adv') : getChecked('chk-lucky-number');
    const genderVal = isAdv ? getChecked('chk-gender-filter-adv') : getChecked('chk-gender-filter');

    theme.features = {
        luckyNumber: luckyVal,
        filmStrip: filmVal,
        genderFilter: genderVal
    };

    // Background
    const icons = getValue('inp-floating-icons').split(',').map(s => s.trim()).filter(Boolean);
    theme.background = {
        type: getValue('sel-bg-type'),
        floatingIcons: icons.length > 0 ? icons : ['✨', '✦', '⭐'],
        filmStrip: theme.features.filmStrip
    };
    theme.atmosphereMode = studio.currentThemeMode || studio.currentAtmosphereMode || 'basic';

    // Waiting Sequence
    theme.waitingExperience = theme.waitingExperience || {};
    theme.waitingExperience.title = theme.waitingExperience.title || 'Creating Magic...';
    theme.waitingExperience.subtitle = theme.waitingExperience.subtitle || 'Processing your photo';
    theme.waitingExperience.sequence = collectWaitingSequence();

    // Prompt Designer
    theme.promptTemplate = readPromptDesigner();

    return theme;
}

// ==========================================================================
// 3. Waiting Screen Sequence Editor
// ==========================================================================
function renderWaitingSequenceList(seq) {
    const listEl = document.getElementById('waiting-sequence-list');
    if (!listEl) return;

    listEl.innerHTML = seq.map((step, idx) => `
        <div class="sequence-row" style="display: flex; gap: 0.8rem; align-items: center; margin-bottom: 0.6rem;">
            <span style="font-size: 0.8rem; color: var(--text-dim); width: 20px;">#${idx + 1}</span>
            <input type="text" class="seq-text" value="${escapeAttr(step.text)}" placeholder="Message text" style="flex: 1;">
            <input type="text" class="seq-delay" value="${step.delay || (idx * 3000 + 500)}" placeholder="Delay ms" style="width: 90px;">
            <input type="color" class="seq-color" value="${step.color || '#ffffff'}" title="Text Color" style="width: 32px; height: 32px;">
            <button type="button" class="admin-btn admin-btn-danger" style="padding: 0.3rem 0.6rem;" onclick="this.closest('.sequence-row').remove()">×</button>
        </div>
    `).join('');
}

function addWaitingSequenceRow() {
    const listEl = document.getElementById('waiting-sequence-list');
    if (!listEl) return;
    const count = listEl.querySelectorAll('.sequence-row').length;
    const row = document.createElement('div');
    row.className = 'sequence-row';
    row.style.cssText = 'display: flex; gap: 0.8rem; align-items: center; margin-bottom: 0.6rem;';
    row.innerHTML = `
        <span style="font-size: 0.8rem; color: var(--text-dim); width: 20px;">#${count + 1}</span>
        <input type="text" class="seq-text" value="" placeholder="New manifestation message..." style="flex: 1;">
        <input type="text" class="seq-delay" value="${count * 3000 + 500}" placeholder="Delay ms" style="width: 90px;">
        <input type="color" class="seq-color" value="#ffffff" title="Text Color" style="width: 32px; height: 32px;">
        <button type="button" class="admin-btn admin-btn-danger" style="padding: 0.3rem 0.6rem;" onclick="this.closest('.sequence-row').remove()">×</button>
    `;
    listEl.appendChild(row);
}

function collectWaitingSequence() {
    const rows = document.querySelectorAll('#waiting-sequence-list .sequence-row');
    const seq = [];
    rows.forEach(r => {
        const text = r.querySelector('.seq-text')?.value.trim();
        const delay = parseInt(r.querySelector('.seq-delay')?.value || '1000', 10);
        const color = r.querySelector('.seq-color')?.value || '#ffffff';
        if (text) {
            seq.push({ text, delay, color });
        }
    });
    return seq;
}

function autoGenerateWaitingPhrases() {
    const title = getValue('inp-title') || 'Celebration';
    const sub = getValue('inp-subtitle') || 'Festive';
    const phrases = [
        { text: `Welcome to ${title}!`, delay: 500, color: '#d4af37' },
        { text: `Manifesting your ${sub} look...`, delay: 2500, color: '#ffffff' },
        { text: `Styling custom fabric & intricate embroidery...`, delay: 5500, color: '#ffffff' },
        { text: `Harmonizing ambient cinematic lighting...`, delay: 8500, color: '#ffffff' },
        { text: `Ready to shine at ${title}!`, delay: 12000, color: '#d4af37' }
    ];
    renderWaitingSequenceList(phrases);
    showToast('Auto-generated 5 atmospheric waiting phrases!', 'success');
}

// ==========================================================================
// 4. ComfyUI Workflow Introspection & Upload
// ==========================================================================
function initWorkflowDropzone() {
    const dropzone = document.getElementById('workflow-dropzone');
    const fileInput = document.getElementById('workflow-file-input');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleWorkflowFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleWorkflowFile(e.target.files[0]);
        }
    });
}

async function handleWorkflowFile(file) {
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        studio.uploadedWorkflow = json;

        // Send to introspection API
        const res = await fetch('/api/admin/workflow/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflow: json })
        });

        if (!res.ok) throw new Error('Failed to inspect workflow');
        const data = await res.json();
        studio.activeBindings = data.bindings;

        renderBindingsCard(studio.activeBindings);
        showToast(`Workflow inspected: ${data.bindings.confidence.toUpperCase()} confidence!`, 'success');
    } catch (err) {
        showToast('Invalid ComfyUI workflow JSON: ' + err.message, 'error');
    }
}

function renderBindingsCard(bindings) {
    const card = document.getElementById('workflow-inspection-card');
    if (!card) return;

    if (!bindings || typeof bindings !== 'object') {
        bindings = {
            input_image_node: '65',
            prompt_node: '45',
            sampler_node: '44',
            face_swap_node: '57',
            output_node: '60',
            confidence: 'benchmark_default'
        };
        studio.activeBindings = bindings;
    }

    card.style.display = 'block';

    const nodeDefs = [
        { key: 'input_image_node', label: 'Input Image Node (Base64)', defaultVal: '65', desc: 'LoadImageBase64 / Base64 photo feeder' },
        { key: 'prompt_node', label: 'Positive Prompt Node (CLIP)', defaultVal: '45', desc: 'CLIP Text Encode for thematic prompt injection' },
        { key: 'sampler_node', label: 'Sampler Node (Seed)', defaultVal: '44', desc: 'KSampler managing seed & latent noise' },
        { key: 'face_swap_node', label: 'Face Swap Node (ReActor)', defaultVal: '57', desc: 'ReActorFaceSwap / FaceID model processor' },
        { key: 'output_node', label: 'Output Node (WebSocket / Save)', defaultVal: '60', desc: 'ETN_SendImageWebSocket or SaveImage' }
    ];

    const isConfidenceHigh = bindings.confidence === 'high' || bindings.confidence === 'benchmark_default';
    const confidenceBadge = isConfidenceHigh
        ? '<span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700;">✓ HIGH CONFIDENCE</span>'
        : '<span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700;">⚠️ PARTIAL BINDING</span>';

    let rowsHtml = '';
    for (const def of nodeDefs) {
        const val = bindings[def.key];
        const isBound = val && String(val).trim() !== '' && String(val).toLowerCase() !== 'none';
        const statusBadge = isBound
            ? `<span class="binding-tag" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">✓ Node #${val}</span>`
            : `<span class="binding-tag" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">⚠️ Unbound</span>`;

        rowsHtml += `
            <div class="binding-row" style="display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 0.75rem;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="binding-label" style="font-weight: 600; color: #f1f5f9; font-size: 0.88rem;">${def.label}</span>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.15rem;">${def.desc}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <span style="font-size: 0.78rem; color: #94a3b8;">Node #</span>
                    <input type="text" class="admin-input" id="binding-inp-${def.key}" value="${val || ''}" placeholder="${def.defaultVal}" oninput="updateBindingNode('${def.key}', this.value)" style="width: 72px; text-align: center; font-family: monospace; font-weight: 700; font-size: 0.85rem; padding: 0.25rem 0.4rem; background: #070913; border: 1px solid rgba(99, 102, 241, 0.3);">
                </div>
            </div>
        `;
    }

    const detectedTokens = bindings.detected_tokens && bindings.detected_tokens.length
        ? bindings.detected_tokens.join(', ')
        : 'None detected (default placeholders: "gender", "gender_style", "pose", "clothes_style", "background")';

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.55rem;">
                <h4 style="font-size: 0.98rem; font-weight: 700; margin: 0; color: #fff;">
                    🔍 ComfyUI Parameter Bindings
                </h4>
                ${confidenceBadge}
            </div>
            <button type="button" class="admin-btn admin-btn-accent" onclick="autoBindStandardComfyNodes()" style="font-size: 0.78rem; font-weight: 700; padding: 0.35rem 0.85rem;" title="Fill unbound nodes with benchmark photobooth defaults (65, 45, 44, 57, 60)">
                ⚡ Auto-Bind Standard Nodes
            </button>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0 0 0.85rem 0;">
            Node IDs used by the backend to inject photo base64, dynamic prompt formulas, seed, and face-swapping into your ComfyUI workflow.
        </p>
        <div style="background: rgba(4, 5, 10, 0.6); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: var(--radius-sm); padding: 0.5rem 0.85rem; margin-bottom: 0.75rem;">
            ${rowsHtml}
        </div>
        <div style="font-size: 0.76rem; color: #94a3b8; display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-weight: 600; color: #cbd5e1;">Detected Tokens:</span>
            <span style="color: var(--accent); font-family: monospace;">${detectedTokens}</span>
        </div>
    `;
}

window.updateBindingNode = function(key, val) {
    const s = (window.studio || studio);
    if (!s.activeBindings) {
        s.activeBindings = {
            input_image_node: '65',
            prompt_node: '45',
            sampler_node: '44',
            face_swap_node: '57',
            output_node: '60',
            confidence: 'benchmark_default'
        };
    }
    s.activeBindings[key] = (val || '').trim();
    studio.activeBindings = s.activeBindings;
};

window.autoBindStandardComfyNodes = function() {
    const s = (window.studio || studio);
    if (!s.activeBindings) s.activeBindings = {};
    s.activeBindings.input_image_node = '65';
    s.activeBindings.prompt_node = '45';
    s.activeBindings.sampler_node = '44';
    s.activeBindings.face_swap_node = '57';
    s.activeBindings.output_node = '60';
    s.activeBindings.confidence = 'high';
    studio.activeBindings = s.activeBindings;
    renderBindingsCard(s.activeBindings);
    showToast('⚡ Auto-bound standard ComfyUI photobooth nodes (65, 45, 44, 57, 60)!', 'success');
};

// ==========================================================================
// Prompt Formula Designer & Live Assembly
// ==========================================================================
const PROMPT_THEME_PRESETS = {
    uits: {
        framing: 'Medium shot, waist up shot of',
        maleStyle: 'executive leading man',
        femaleStyle: 'charismatic k-pop idol',
        borderStyle: 'The image features a modern graphic overlay with a translucent frosted-glass border forming a frame.',
        topTitle: 'Union of ITE Training Staff',
        topTitleStyle: 'rendered in an exquisite gold-leaf, fluid hand-drawn script',
        subtitle: '1976 – 2026',
        subtitleStyle: 'elegantly etched in a smaller, minimalist gold serif font directly below it',
        bottomTitle: '50th Anniversary',
        bottomTitleStyle: 'displayed in bold, luminous calligraphy',
        typoStyle: 'All typography is softly backlit with a warm amber glow and seamlessly integrated into the sweeping, neo-classical architecture of the borders.',
        atmosphere: 'Volumetric lighting, liquid gold accents, glassmorphism, sharp fashion photography style, sophisticated depth of field.',
        includeLuckyNum: false
    },
    cny: {
        framing: 'Extreme Close up shot of',
        maleStyle: 'asian, fit and charismatic',
        femaleStyle: 'charismatic k-pop idol',
        borderStyle: 'The image features a modern graphic design overlay: a translucent frosted-glass border at the top and bottom of the frame.',
        topTitle: '新年快乐',
        topTitleStyle: 'Integrated into these borders is stylized typography including the Chinese characters',
        subtitle: 'Happy Lunar New Year',
        subtitleStyle: 'and the English text',
        bottomTitle: '',
        bottomTitleStyle: '',
        typoStyle: 'words are vibrant bright colors encased in a border contrasting the background, 8k resolution.',
        atmosphere: 'High-key cinematic lighting, idol posing, vibrant CNY color palette.',
        includeLuckyNum: true
    },
    ndp2026: {
        framing: 'Medium shot, waist up shot of',
        maleStyle: 'asian, fit and charismatic',
        femaleStyle: 'charismatic k-pop idol',
        borderStyle: 'Overlayed smoothly on top of the scene, the photo is framed by a playful, translucent graphic border featuring bold crimson red and crisp white festive banners, translucent star fireworks, and a sleek glassmorphic overlay.',
        topTitle: 'NDP 2026',
        topTitleStyle: 'Prominently at the top in large, bold 3D red-and-gold lettering integrated onto the frame is the main header',
        subtitle: '',
        subtitleStyle: '',
        bottomTitle: 'Majulah Singapura! Go Beyond!',
        bottomTitleStyle: 'displayed in playful, bright red and white translucent typography with festive sparkles',
        typoStyle: 'At the bottom of the frame, overlayed on the scene, the energetic slogan "Majulah Singapura! Go Beyond!" is displayed in playful, bright red and white translucent typography with festive sparkles.',
        atmosphere: 'High quality fashion photography, sharp focus, vibrant Singapore National Day red and white color theme.',
        includeLuckyNum: false
    },
    hariraya: {
        framing: 'Extreme Close up shot of',
        maleStyle: 'charismatic malay idol',
        femaleStyle: 'charismatic malay idol',
        borderStyle: 'jawi_raya, The image features a modern graphic design overlay: a translucent frosted-glass border at the top and bottom of the frame.',
        topTitle: 'سلامت هاري راي',
        topTitleStyle: 'Integrated into the top of the borders is stylized typography including the jawi characters',
        subtitle: '',
        subtitleStyle: '',
        bottomTitle: 'Selamat Hari Raya',
        bottomTitleStyle: 'Centered at the bottom, the prompt includes the curved stylized text',
        typoStyle: 'Upper body shot, High-key cinematic lighting, vibrant malay festive color palette, 8k resolution, typography contrast background.',
        atmosphere: '',
        includeLuckyNum: false
    }
};

let rawPromptMode = false;

function assembleModularPrompt(tpl) {
    const framing = (tpl.framing || 'Medium shot, waist up shot of').trim();
    let prompt = `${framing} a "gender" "gender_style" with "pose" for a concept photo, dressed in "clothes_style". The setting is "background".`;

    if (tpl.borderStyle && tpl.borderStyle.trim()) {
        prompt += ` ${tpl.borderStyle.trim()}`;
    }

    const titleParts = [];
    if (tpl.topTitle && tpl.topTitle.trim()) {
        const topStyle = (tpl.topTitleStyle || 'rendered in stylish typography').trim();
        if (topStyle.toLowerCase().startsWith('integrated') || topStyle.toLowerCase().startsWith('prominently')) {
            titleParts.push(`${topStyle} "${tpl.topTitle.trim()}"`);
        } else {
            titleParts.push(`At the top-center apex, the title "${tpl.topTitle.trim()}" is ${topStyle}`);
        }
    }
    if (tpl.subtitle && tpl.subtitle.trim()) {
        const subStyle = (tpl.subtitleStyle || 'elegantly etched directly below it').trim();
        if (subStyle.toLowerCase().startsWith('and the english') || subStyle.toLowerCase().startsWith('in english')) {
            titleParts.push(`${subStyle} "${tpl.subtitle.trim()}"`);
        } else {
            titleParts.push(`followed by the years "${tpl.subtitle.trim()}" ${subStyle}`);
        }
    }
    if (tpl.bottomTitle && tpl.bottomTitle.trim()) {
        const botStyle = (tpl.bottomTitleStyle || 'displayed in bold calligraphy').trim();
        if (botStyle.toLowerCase().startsWith('centered') || botStyle.toLowerCase().startsWith('at the bottom')) {
            titleParts.push(`${botStyle} "${tpl.bottomTitle.trim()}"`);
        } else {
            titleParts.push(`At the bottom-center, overlayed above the image, anchored within the ornate border, the title "${tpl.bottomTitle.trim()}" is ${botStyle}.`);
        }
    }

    if (titleParts.length > 0) {
        let titlesSentence = '';
        if (titleParts.length === 3) {
            titlesSentence = `${titleParts[0]}, ${titleParts[1]}. ${titleParts[2]}`;
        } else if (titleParts.length === 2 && tpl.topTitle && tpl.subtitle) {
            titlesSentence = `${titleParts[0]} ${titleParts[1]}.`;
        } else {
            titlesSentence = titleParts.join('. ');
            if (!titlesSentence.endsWith('.')) titlesSentence += '.';
        }
        prompt += ` ${titlesSentence}`;
    }

    if (tpl.includeLuckyNum) {
        prompt += ' "lucky_num".';
    }

    if (tpl.typoStyle && tpl.typoStyle.trim()) {
        prompt += ` ${tpl.typoStyle.trim()}`;
    }

    if (tpl.atmosphere && tpl.atmosphere.trim()) {
        prompt += ` ${tpl.atmosphere.trim()}`;
    }

    return prompt.replace(/\s+/g, ' ').trim();
}

function renderPromptLivePreview(rawText) {
    const previewEl = document.getElementById('prompt-live-preview');
    if (!previewEl) return;

    if (!rawText) {
        previewEl.innerHTML = '<span style="color:var(--text-dim);">(Empty prompt)</span>';
        return;
    }

    // Escape HTML first
    let html = rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Highlight tokens with colored pills: handles "gender", \"gender\", {gender}, "{gender}"
    html = html.replace(/(&quot;|\\&quot;|"|\\")\{?gender\}?(&quot;|\\&quot;|"|\\")/g, '<span class="token-pill pill-gold">\\"gender\\"</span>');
    html = html.replace(/(&quot;|\\&quot;|"|\\")\{?gender_style\}?(&quot;|\\&quot;|"|\\")/g, '<span class="token-pill pill-blue">\\"gender_style\\"</span>');
    html = html.replace(/(&quot;|\\&quot;|"|\\")\{?pose\}?(&quot;|\\&quot;|"|\\")/g, '<span class="token-pill pill-green">\\"pose\\"</span>');
    html = html.replace(/(&quot;|\\&quot;|"|\\")\{?clothes_style\}?(&quot;|\\&quot;|"|\\")/g, '<span class="token-pill pill-purple">\\"clothes_style\\"</span>');
    html = html.replace(/(&quot;|\\&quot;|"|\\")\{?background\}?(&quot;|\\&quot;|"|\\")/g, '<span class="token-pill pill-cyan">\\"background\\"</span>');
    html = html.replace(/(&quot;|\\&quot;|"|\\")\{?lucky_num\}?(&quot;|\\&quot;|"|\\")/g, '<span class="token-pill pill-amber">\\"lucky_num\\"</span>');

    previewEl.innerHTML = html;
}

function updatePromptLivePreview() {
    if (rawPromptMode) {
        const rawText = document.getElementById('raw-prompt-textarea')?.value || '';
        renderPromptLivePreview(rawText);
    } else {
        const tpl = readPromptDesigner();
        renderPromptLivePreview(tpl.rawPrompt);
        const rawTextarea = document.getElementById('raw-prompt-textarea');
        if (rawTextarea) rawTextarea.value = tpl.rawPrompt;
    }
}

function populatePromptDesigner(theme) {
    let tpl = theme.promptTemplate;
    if (!tpl) {
        const slug = theme.slug || 'uits';
        tpl = PROMPT_THEME_PRESETS[slug] ? { ...PROMPT_THEME_PRESETS[slug] } : { ...PROMPT_THEME_PRESETS.uits };
    }

    setValue('prompt-inp-framing', tpl.framing || 'Medium shot, waist up shot of');
    setValue('prompt-inp-male-style', tpl.maleStyle || 'executive leading man');
    setValue('prompt-inp-female-style', tpl.femaleStyle || 'charismatic k-pop idol');
    setValue('prompt-inp-border', tpl.borderStyle !== undefined ? tpl.borderStyle : 'The image features a modern graphic overlay with a translucent frosted-glass border forming a frame.');
    setValue('prompt-inp-top-title', tpl.topTitle || '');
    setValue('prompt-inp-top-title-style', tpl.topTitleStyle || '');
    setValue('prompt-inp-subtitle', tpl.subtitle || '');
    setValue('prompt-inp-subtitle-style', tpl.subtitleStyle || '');
    setValue('prompt-inp-bottom-title', tpl.bottomTitle || '');
    setValue('prompt-inp-bottom-title-style', tpl.bottomTitleStyle || '');
    setValue('prompt-inp-typo-style', tpl.typoStyle !== undefined ? tpl.typoStyle : '');
    setValue('prompt-inp-atmosphere', tpl.atmosphere !== undefined ? tpl.atmosphere : '');

    const assembled = tpl.rawPrompt || assembleModularPrompt(tpl);
    setValue('raw-prompt-textarea', assembled);
    renderPromptLivePreview(assembled);

    // Synchronize ComfyUI GenAI Frame Studio titles with current theme
    if (typeof window.syncComfyTitlesFromActiveTheme === 'function') {
        window.syncComfyTitlesFromActiveTheme(false);
    }
}

function readPromptDesigner() {
    const rawTextarea = document.getElementById('raw-prompt-textarea');
    if (rawPromptMode && rawTextarea) {
        return {
            framing: getValue('prompt-inp-framing'),
            maleStyle: getValue('prompt-inp-male-style'),
            femaleStyle: getValue('prompt-inp-female-style'),
            borderStyle: getValue('prompt-inp-border'),
            topTitle: getValue('prompt-inp-top-title'),
            topTitleStyle: getValue('prompt-inp-top-title-style'),
            subtitle: getValue('prompt-inp-subtitle'),
            subtitleStyle: getValue('prompt-inp-subtitle-style'),
            bottomTitle: getValue('prompt-inp-bottom-title'),
            bottomTitleStyle: getValue('prompt-inp-bottom-title-style'),
            typoStyle: getValue('prompt-inp-typo-style'),
            atmosphere: getValue('prompt-inp-atmosphere'),
            includeLuckyNum: getChecked('chk-lucky-number'),
            rawPrompt: rawTextarea.value.trim()
        };
    }

    const tpl = {
        framing: getValue('prompt-inp-framing'),
        maleStyle: getValue('prompt-inp-male-style'),
        femaleStyle: getValue('prompt-inp-female-style'),
        borderStyle: getValue('prompt-inp-border'),
        topTitle: getValue('prompt-inp-top-title'),
        topTitleStyle: getValue('prompt-inp-top-title-style'),
        subtitle: getValue('prompt-inp-subtitle'),
        subtitleStyle: getValue('prompt-inp-subtitle-style'),
        bottomTitle: getValue('prompt-inp-bottom-title'),
        bottomTitleStyle: getValue('prompt-inp-bottom-title-style'),
        typoStyle: getValue('prompt-inp-typo-style'),
        atmosphere: getValue('prompt-inp-atmosphere'),
        includeLuckyNum: getChecked('chk-lucky-number')
    };
    tpl.rawPrompt = assembleModularPrompt(tpl);
    return tpl;
}

window.setPromptField = function (field, value) {
    if (field === 'framing') setValue('prompt-inp-framing', value);
    else if (field === 'border') setValue('prompt-inp-border', value);
    else if (field === 'typoStyle') setValue('prompt-inp-typo-style', value);
    else if (field === 'atmosphere') setValue('prompt-inp-atmosphere', value);
    updatePromptLivePreview();
};

window.setGenderStyles = function (male, female) {
    setValue('prompt-inp-male-style', male);
    setValue('prompt-inp-female-style', female);
    updatePromptLivePreview();
};

window.toggleRawPromptMode = function () {
    rawPromptMode = !rawPromptMode;
    const modularView = document.getElementById('modular-prompt-view');
    const rawView = document.getElementById('raw-prompt-view');
    const btn = document.getElementById('toggle-raw-prompt-btn');

    if (rawPromptMode) {
        const tpl = readPromptDesigner();
        setValue('raw-prompt-textarea', tpl.rawPrompt);
        if (modularView) modularView.style.display = 'none';
        if (rawView) rawView.style.display = 'block';
        if (btn) btn.textContent = '🧩 Modular Designer Mode';
        showToast('Switched to Raw Formula Edit Mode', 'info');
    } else {
        if (modularView) modularView.style.display = 'block';
        if (rawView) rawView.style.display = 'none';
        if (btn) btn.textContent = '📝 Edit Raw Formula';
        showToast('Switched to Visual Modular Designer', 'info');
    }
    updatePromptLivePreview();
};

window.loadThemePromptPreset = function (presetKey) {
    const preset = PROMPT_THEME_PRESETS[presetKey];
    if (!preset) return;
    setValue('prompt-inp-framing', preset.framing || '');
    setValue('prompt-inp-male-style', preset.maleStyle || '');
    setValue('prompt-inp-female-style', preset.femaleStyle || '');
    setValue('prompt-inp-border', preset.borderStyle || '');
    setValue('prompt-inp-top-title', preset.topTitle || '');
    setValue('prompt-inp-top-title-style', preset.topTitleStyle || '');
    setValue('prompt-inp-subtitle', preset.subtitle || '');
    setValue('prompt-inp-subtitle-style', preset.subtitleStyle || '');
    setValue('prompt-inp-bottom-title', preset.bottomTitle || '');
    setValue('prompt-inp-bottom-title-style', preset.bottomTitleStyle || '');
    setValue('prompt-inp-typo-style', preset.typoStyle || '');
    setValue('prompt-inp-atmosphere', preset.atmosphere || '');

    const assembled = assembleModularPrompt(preset);
    setValue('raw-prompt-textarea', assembled);
    renderPromptLivePreview(assembled);
    showToast(`Loaded ${presetKey.toUpperCase()} prompt formula preset!`, 'success');
};

window.copyAssembledPrompt = function () {
    const previewEl = document.getElementById('prompt-live-preview');
    const text = previewEl?.innerText || document.getElementById('raw-prompt-textarea')?.value || '';
    if (text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('📋 Copied full prompt to clipboard!', 'success');
        });
    }
};


// ==========================================================================
// ComfyUI GenAI Frame & Typography Studio Engine (CLIP Node 45 Architect)
// ==========================================================================

window.buildComfyFramePrompt = function (concept, options = {}) {
    const rawConcept = typeof concept === 'string' ? concept.trim() : '';
    const themeConcept = rawConcept || getValue('comfy-genai-concept') || 'Ornate liquid gold filigree frame with sweeping architectural curves and floating amber champagne sparkles';

    const activeTitle = (studio.activeTheme && studio.activeTheme.slug !== 'uits' && studio.activeTheme.title && studio.activeTheme.title !== 'Union of ITE Training Staff') ? studio.activeTheme.title : '';
    const activeSubtitle = (studio.activeTheme && studio.activeTheme.slug !== 'uits' && studio.activeTheme.subtitle && studio.activeTheme.subtitle !== '1976 – 2026') ? studio.activeTheme.subtitle : '';
    const activeBadge = (studio.activeTheme && studio.activeTheme.slug !== 'uits' && studio.activeTheme.badge && studio.activeTheme.badge !== '50th Anniversary') ? studio.activeTheme.badge : '';

    const topTitle = (options.topTitle !== undefined ? options.topTitle : (getValue('prompt-inp-top-title') || getValue('comfy-genai-top-title') || activeTitle)).trim();
    const subtitle = (options.subtitle !== undefined ? options.subtitle : (getValue('prompt-inp-subtitle') || getValue('comfy-genai-subtitle') || activeSubtitle)).trim();
    const bottomTitle = (options.bottomTitle !== undefined ? options.bottomTitle : (getValue('prompt-inp-bottom-title') || getValue('comfy-genai-bottom-title') || activeBadge)).trim();

    const frameStyle = options.frameStyle || getValue('comfy-lever-frame-style') || 'Auto (Infer from Concept)';
    const typoStyle = options.typoStyle || getValue('comfy-lever-typo-style') || 'Auto (Infer from Concept)';
    const atmosphere = options.atmosphere || getValue('comfy-lever-atmosphere') || 'Auto (Infer from Concept)';

    const topTitleGuidance = topTitle 
        ? `Suggest an evocative Top Apex Title fitting "${themeConcept}" (user seed: "${topTitle}")` 
        : `Suggest a compelling, bespoke Top Apex Title that perfectly fits "${themeConcept}"`;
    const subtitleGuidance = subtitle 
        ? `Suggest a complementary Subtitle or Event Year fitting "${themeConcept}" (user seed: "${subtitle}")` 
        : `Suggest a complementary Subtitle or Event Year matching "${themeConcept}"`;
    const bottomTitleGuidance = bottomTitle 
        ? `Suggest an impactful Bottom Badge or Crest Title fitting "${themeConcept}" (user seed: "${bottomTitle}")` 
        : `Suggest an impactful Bottom Badge or Crest Title that anchors the lower frame for "${themeConcept}"`;

    return `You are an expert AI Art Director and Prompt Engineer specializing in photobooth composition and diffusion image generation (Stable Diffusion SDXL, ComfyUI CLIP Node 45, Flux).

The user is designing a photobooth frame and custom words with the following specifications:
• FRAME STYLE & VISUAL EFFECT: "${themeConcept}"
• TOP APEX TITLE: ${topTitleGuidance}
• TOP SUBTITLE / YEARS: ${subtitleGuidance}
• BOTTOM BADGE TITLE: ${bottomTitleGuidance}
• FRAME ARCHETYPE: "${frameStyle}"
• TYPOGRAPHY VIBE: "${typoStyle}"
• ATMOSPHERE & FINISHERS: "${atmosphere}"

### YOUR TASK
Based on the visual concept "${themeConcept}", invent bespoke, cohesive prompt specifications for the Graphic Border Frame, suggested Theme Titles & Typography styling, Lighting Integration, and Atmosphere.

Specific Requirements:
1. **Graphic Border Frame**: Describe an ornate, natural border overlay (materials, contours, transparency/glassmorphism, corner accents) that frames the photobooth guest without obscuring the central face or body.
2. **Suggest Bespoke Titles & Subtitles**:
   - **Top Apex Title**: Suggest a grand, evocative apex title tailored to "${themeConcept}" (e.g. for a gala: prestigious golden jubilee/gala title; for cyberpunk: high-tech night title; for festive holidays: festive greetings).
   - **Subtitle / Years**: Suggest a fitting subtitle, edition, or year that complements the apex title.
   - **Bottom Badge Title**: Suggest an impactful bottom crest, badge, or celebration motto that anchors the lower border.
3. **Typography Styling**: Describe how each suggested title is physically rendered and illuminated in the 3D scene (materials, typeface archetype, liquid gold leaf, neon backlight, luminous calligraphy, etc.).
4. **Atmosphere & Finishers**: Specify volumetric lighting, color palette, glassmorphism, depth of field, and 8k photorealistic finish.

Format your response clearly into the EXACT BLOCKS below so the user can easily copy and paste each part into the system blocks, followed by the JSON block for 1-click auto-import:

### [FRAME_STYLE]
(Detailed graphic design & border overlay prompt. Describe the frame borders, architectural contours, transparency/glassmorphism, materials, and corner accents framing the subject naturally.)

### [TOP_TITLE]
(Suggest and output a compelling Top Apex Title tailored to "${themeConcept}"${topTitle ? `, e.g. "${topTitle}" or an elevated variant` : ''})

### [TOP_TITLE_STYLE]
(Style description for your suggested top title, e.g. "rendered in an exquisite gold-leaf, fluid hand-drawn script" or "displayed in razor-sharp neon cyan typography".)

### [SUBTITLE]
(Suggest and output a complementary Subtitle / Year that pairs with the apex title${subtitle ? `, e.g. "${subtitle}"` : ''})

### [SUBTITLE_STYLE]
(Style description for your suggested subtitle/years, e.g. "elegantly etched in a smaller, minimalist gold serif font directly below it".)

### [BOTTOM_TITLE]
(Suggest and output an impactful Bottom Badge / Crest title that anchors the frame${bottomTitle ? `, e.g. "${bottomTitle}"` : ''})

### [BOTTOM_TITLE_STYLE]
(Style description for your suggested bottom badge, e.g. "displayed in bold, luminous calligraphy anchored within the lower crest".)

### [ATMOSPHERE]
(Volumetric lighting, lens characteristics, color palette, glassmorphism, depth of field, 8k resolution, photorealistic finish.)

\`\`\`json
{
  "frame_style": "Detailed graphic design & border overlay prompt. Describe frame borders and contours.",
  "border": "Detailed graphic design & border overlay prompt. Describe frame borders and contours.",
  "top_title": "${topTitle || 'Your suggested Top Apex Title'}",
  "topTitle": "${topTitle || 'Your suggested Top Apex Title'}",
  "top_title_style": "rendered in bespoke typography matching concept",
  "topTitleStyle": "rendered in bespoke typography matching concept",
  "subtitle": "${subtitle || 'Your suggested Subtitle / Year'}",
  "subtitle_style": "elegantly etched in complementary typography",
  "subtitleStyle": "elegantly etched in complementary typography",
  "bottom_title": "${bottomTitle || 'Your suggested Bottom Badge'}",
  "bottomTitle": "${bottomTitle || 'Your suggested Bottom Badge'}",
  "bottom_title_style": "displayed in luminous calligraphy anchored within the lower crest",
  "bottomTitleStyle": "displayed in luminous calligraphy anchored within the lower crest",
  "typoIntegration": "All typography is softly backlit with warm glow and seamlessly integrated into the frame borders.",
  "atmosphere": "Volumetric lighting, lens characteristics, color palette, glassmorphism, depth of field, 8k resolution, photorealistic finish.",
  "maleStyle": "executive leading man in tailored dinner suit",
  "femaleStyle": "charismatic elegant leading lady in evening gown"
}
\`\`\`

Strict Requirement: Output clean, valid JSON inside the code block with your suggested titles so the photobooth system can auto-import all fields in 1-click.`;
};

window.updateComfyFrameGenAiPrompt = function () {
    const concept = getValue('comfy-genai-concept');
    const topTitle = getValue('comfy-genai-top-title');
    const subtitle = getValue('comfy-genai-subtitle');
    const bottomTitle = getValue('comfy-genai-bottom-title');
    const frameStyle = getValue('comfy-lever-frame-style');
    const typoStyle = getValue('comfy-lever-typo-style');
    const atmosphere = getValue('comfy-lever-atmosphere');

    const promptText = window.buildComfyFramePrompt(concept, {
        topTitle: topTitle,
        subtitle: subtitle,
        bottomTitle: bottomTitle,
        frameStyle: frameStyle,
        typoStyle: typoStyle,
        atmosphere: atmosphere
    });

    const box = document.getElementById('comfy-genai-prompt-full');
    if (box) {
        box.value = promptText;
    }
};

window.onComfyTitleFieldInput = function (field) {
    if (field === 'topTitle') {
        const val = getValue('comfy-genai-top-title');
        setValue('prompt-inp-top-title', val);
    } else if (field === 'subtitle') {
        const val = getValue('comfy-genai-subtitle');
        setValue('prompt-inp-subtitle', val);
    } else if (field === 'bottomTitle') {
        const val = getValue('comfy-genai-bottom-title');
        setValue('prompt-inp-bottom-title', val);
    }
    window.updateComfyFrameGenAiPrompt();
    if (typeof updatePromptLivePreview === 'function') {
        updatePromptLivePreview();
    }
};

window.syncComfyTitlesFromActiveTheme = function (isUserClick = false) {
    const theme = (window.studio && window.studio.activeTheme) || studio.activeTheme || {};
    const tpl = theme.promptTemplate || {};

    const activeTitle = (theme.slug !== 'uits' && theme.title !== 'Union of ITE Training Staff') ? (theme.title || '') : '';
    const activeSubtitle = (theme.slug !== 'uits' && theme.subtitle !== '1976 – 2026') ? (theme.subtitle || '') : '';
    const activeBadge = (theme.slug !== 'uits' && theme.badge !== '50th Anniversary') ? (theme.badge || '') : '';

    const title = tpl.topTitle || activeTitle || (isUserClick ? (theme.title || 'New Event Photobooth') : '');
    const subtitle = tpl.subtitle || activeSubtitle || (isUserClick ? (theme.subtitle || 'Special Edition') : '');
    const bottomTitle = tpl.bottomTitle || activeBadge || (isUserClick ? (theme.badge || 'VIP Pass') : '');

    setValue('comfy-genai-top-title', title);
    setValue('comfy-genai-subtitle', subtitle);
    setValue('comfy-genai-bottom-title', bottomTitle);

    // Keep modular designer inputs in sync
    if (title) setValue('prompt-inp-top-title', title);
    if (subtitle) setValue('prompt-inp-subtitle', subtitle);
    if (bottomTitle) setValue('prompt-inp-bottom-title', bottomTitle);

    const conceptInp = document.getElementById('comfy-genai-concept');
    if (conceptInp && (isUserClick || !conceptInp.value.trim())) {
        const desc = theme.description || getValue('inp-desc') || '';
        conceptInp.value = desc ? `${theme.title || title} - ${desc}` : (theme.title || title || '');
    }

    window.updateComfyFrameGenAiPrompt();
    if (typeof updatePromptLivePreview === 'function') {
        updatePromptLivePreview();
    }

    if (isUserClick) {
        showToast(`Matched titles & vibe from active theme: "${theme.title || title || 'Theme'}"`, 'info');
    }
};

window.copyComfyFrameGenAiPrompt = async function () {
    const box = document.getElementById('comfy-genai-prompt-full');
    const text = box ? box.value : '';
    if (!text) {
        window.updateComfyFrameGenAiPrompt();
    }
    const finalText = (document.getElementById('comfy-genai-prompt-full') || {}).value || '';
    if (!finalText) {
        showToast('Please type a frame concept first!', 'warning');
        return;
    }

    const copied = await window.copyTextToClipboard(finalText, '📋 GenAI Frame & Typography Prompt copied to clipboard!');
    if (copied) {
        const btn = document.getElementById('btn-copy-comfy-frame-prompt');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        }
    }
};

window.selectAllComfyFramePromptText = function () {
    const box = document.getElementById('comfy-genai-prompt-full');
    if (box) {
        box.focus();
        box.select();
        box.setSelectionRange(0, 99999);
        window.copyTextToClipboard(box.value, '📋 Entire prompt selected & copied to clipboard!');
    }
};

window.setComfyConceptPreset = function (concept, topTitle, subtitle, bottomTitle, frameArchetype, typoVibe, atmosphere) {
    setValue('comfy-genai-concept', concept || '');
    if (topTitle !== undefined) {
        setValue('comfy-genai-top-title', topTitle);
        setValue('prompt-inp-top-title', topTitle);
    }
    if (subtitle !== undefined) {
        setValue('comfy-genai-subtitle', subtitle);
        setValue('prompt-inp-subtitle', subtitle);
    }
    if (bottomTitle !== undefined) {
        setValue('comfy-genai-bottom-title', bottomTitle);
        setValue('prompt-inp-bottom-title', bottomTitle);
    }
    if (frameArchetype !== undefined) setValue('comfy-lever-frame-style', frameArchetype);
    if (typoVibe !== undefined) setValue('comfy-lever-typo-style', typoVibe);
    if (atmosphere !== undefined) setValue('comfy-lever-atmosphere', atmosphere);

    window.updateComfyFrameGenAiPrompt();
    if (typeof updatePromptLivePreview === 'function') {
        updatePromptLivePreview();
    }
    showToast(`Loaded preset concept: ${concept ? concept.substring(0, 40) + '...' : ''}`, 'info');
};

window.syncConceptFromActiveTheme = function () {
    window.syncComfyTitlesFromActiveTheme(true);
};

window.openComfyFramePasteModal = function () {
    const modal = document.getElementById('comfy-frame-paste-modal');
    const input = document.getElementById('inp-comfy-ai-paste');
    if (modal) {
        modal.style.display = 'flex';
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 80);
        }
    }
};

window.closeComfyFramePasteModal = function () {
    const modal = document.getElementById('comfy-frame-paste-modal');
    if (modal) modal.style.display = 'none';
};

window.parseComfyFrameAiResponse = function (rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    let text = rawText.trim();
    if (!text) return null;

    // 1. Extract <design_thinking> if present
    let designThinking = '';
    const dtMatch = text.match(/<design_thinking>([\s\S]*?)<\/design_thinking>/i);
    if (dtMatch) {
        designThinking = dtMatch[1].trim();
        text = text.replace(/<design_thinking>[\s\S]*?<\/design_thinking>/i, '').trim();
    }

    // Helper to sanitize JSON string
    function cleanJsonString(str) {
        return str
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/,\s*([\]}])/g, '$1')
            .trim();
    }

    let parsedJson = null;

    // Try extracting JSON from code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
        const candidate = cleanJsonString(fenceMatch[1]);
        try {
            parsedJson = JSON.parse(candidate);
        } catch (e) {
            const innerMatch = candidate.match(/\{[\s\S]*\}/);
            if (innerMatch) {
                try {
                    parsedJson = JSON.parse(cleanJsonString(innerMatch[0]));
                } catch (e2) {}
            }
        }
    }

    // Try extracting raw JSON object without fences
    if (!parsedJson) {
        const rawJsonMatch = text.match(/\{[\s\S]*\}/);
        if (rawJsonMatch) {
            try {
                parsedJson = JSON.parse(cleanJsonString(rawJsonMatch[0]));
            } catch (e) {}
        }
    }

    const result = {
        designThinking: designThinking,
        border: '',
        topTitle: '',
        topTitleStyle: '',
        subtitle: '',
        subtitleStyle: '',
        bottomTitle: '',
        bottomTitleStyle: '',
        typoStyle: '',
        atmosphere: '',
        maleStyle: '',
        femaleStyle: '',
        framing: ''
    };

    if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
        result.border = parsedJson.frame_style || parsedJson.border || parsedJson.borderStyle || parsedJson.graphicBorder || parsedJson.frame || parsedJson.frameStyle || parsedJson.frame_border || '';
        result.topTitle = parsedJson.top_title || parsedJson.topTitle || parsedJson.topApexTitle || parsedJson.apexTitle || parsedJson.mainTitle || parsedJson.title || '';
        result.topTitleStyle = parsedJson.top_title_style || parsedJson.topTitleStyle || parsedJson.topApexTitleStyle || parsedJson.apexTitleStyle || parsedJson.topStyle || '';
        result.subtitle = parsedJson.subtitle || parsedJson.sub_title || parsedJson.subTitle || parsedJson.years || parsedJson.date || '';
        result.subtitleStyle = parsedJson.subtitle_style || parsedJson.subtitleStyle || parsedJson.subTitleStyle || parsedJson.yearsStyle || '';
        result.bottomTitle = parsedJson.bottom_title || parsedJson.bottomTitle || parsedJson.bottomBadgeTitle || parsedJson.badgeTitle || parsedJson.bottomBadge || parsedJson.badge || '';
        result.bottomTitleStyle = parsedJson.bottom_title_style || parsedJson.bottomTitleStyle || parsedJson.bottomBadgeStyle || parsedJson.badgeStyle || '';
        result.typoStyle = parsedJson.typoStyle || parsedJson.typoIntegration || parsedJson.typographyStyle || parsedJson.typographyIntegration || parsedJson.typo_integration || parsedJson.typography || '';
        result.atmosphere = parsedJson.atmosphere || parsedJson.atmosphereLighting || parsedJson.finishers || parsedJson.atmosphere_and_lighting || parsedJson.lighting || '';
        result.maleStyle = parsedJson.maleStyle || parsedJson.malePersona || parsedJson.male_style || '';
        result.femaleStyle = parsedJson.femaleStyle || parsedJson.femalePersona || parsedJson.female_style || '';
        result.framing = parsedJson.framing || parsedJson.cameraFraming || parsedJson.camera_framing || '';
    } else {
        const extractBlock = (name) => {
            const escaped = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const pattern = '(?:###\\s*(?:\\[|\\*\\*)?|\\b\\[|\\*\\*\\s*\\[?)' + escaped + '(?:\\]|\\*\\*)?[:\\s]*\\n*([\\s\\S]*?)(?=(?:\\n\\s*###|\\n\\s*\\[[A-Z_]{3,}\\]|\\n\\s*\\*\\*[A-Z_\\s]{3,}\\*\\*|```|$))';
            try {
                const re = new RegExp(pattern, 'i');
                const m = text.match(re);
                return m ? m[1].trim() : '';
            } catch (e) {
                return '';
            }
        };

        const extractField = (patterns) => {
            for (const p of patterns) {
                const escaped = p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const pattern = '(?:^|\\n)\\s*(?:\\*\\*|[-*•]\\s*)?' + escaped + '[:\\-=]\\s*([^\\n\\r]+)';
                try {
                    const re = new RegExp(pattern, 'i');
                    const m = text.match(re);
                    if (m && m[1]) return m[1].replace(/^["']|["']$/g, '').trim();
                } catch (e) {}
            }
            return '';
        };

        result.border = extractBlock('FRAME_STYLE') || extractBlock('Frame Style') || extractBlock('BORDER') || extractBlock('Border Style') || extractBlock('FRAME') || extractBlock('GRAPHIC_BORDER') || extractField(['border style', 'graphic border', 'frame style', 'border', 'frame']);
        result.topTitle = extractBlock('TOP_TITLE') || extractBlock('Top Title') || extractBlock('TOP_APEX_TITLE') || extractBlock('Top Apex Title') || extractBlock('APEX_TITLE') || extractBlock('MAIN_TITLE') || extractField(['top title', 'top apex title', 'apex title', 'main title', 'title']);
        result.topTitleStyle = extractBlock('TOP_TITLE_STYLE') || extractBlock('Top Title Style') || extractBlock('TOP_APEX_TITLE_STYLE') || extractBlock('Top Apex Title Style') || extractBlock('APEX_TITLE_STYLE') || extractField(['top title style', 'top apex title style', 'apex title style', 'top style']);
        result.subtitle = extractBlock('SUBTITLE') || extractBlock('Subtitle') || extractBlock('YEARS') || extractBlock('Years') || extractBlock('SUB_TITLE') || extractField(['subtitle', 'sub title', 'years', 'date']);
        result.subtitleStyle = extractBlock('SUBTITLE_STYLE') || extractBlock('Subtitle Style') || extractBlock('YEARS_STYLE') || extractBlock('Years Style') || extractField(['subtitle style', 'sub title style', 'years style']);
        result.bottomTitle = extractBlock('BOTTOM_TITLE') || extractBlock('Bottom Title') || extractBlock('BOTTOM_BADGE_TITLE') || extractBlock('Bottom Badge Title') || extractBlock('BOTTOM_BADGE') || extractBlock('Bottom Badge') || extractBlock('BADGE_TITLE') || extractField(['bottom title', 'bottom badge title', 'bottom badge', 'badge title', 'badge']);
        result.bottomTitleStyle = extractBlock('BOTTOM_TITLE_STYLE') || extractBlock('Bottom Title Style') || extractBlock('BOTTOM_BADGE_STYLE') || extractBlock('Bottom Badge Style') || extractBlock('BADGE_STYLE') || extractField(['bottom title style', 'bottom badge style', 'badge style']);
        result.typoStyle = extractBlock('TYPO_STYLE') || extractBlock('Typo Style') || extractBlock('TYPOGRAPHY') || extractBlock('Typography') || extractBlock('TYPO_INTEGRATION') || extractBlock('Typography Integration') || extractField(['typo style', 'typography style', 'typography integration', 'typo integration', 'typography']);
        result.atmosphere = extractBlock('ATMOSPHERE') || extractBlock('Atmosphere') || extractBlock('ATMOSPHERE & FINISHERS') || extractBlock('LIGHTING') || extractBlock('Lighting') || extractBlock('FINISHERS') || extractField(['atmosphere', 'atmosphere lighting', 'aesthetic finishers', 'finishers', 'lighting']);
        result.maleStyle = extractBlock('MALE_STYLE') || extractBlock('Male Style') || extractField(['male style', 'male persona', 'male']);
        result.femaleStyle = extractBlock('FEMALE_STYLE') || extractBlock('Female Style') || extractField(['female style', 'female persona', 'female']);
        result.framing = extractBlock('FRAMING') || extractBlock('Framing') || extractField(['framing', 'camera framing', 'shot']);
    }

    // BULLETPROOF FALLBACK:
    // If border is still empty and user pasted unstructured text or a narrative prompt:
    if (!result.border) {
        let cleaned = text
            .replace(/^(?:Here (?:is|are)|Sure|Certainly|Below (?:is|are)|Here's|Okay|I have generated)[^\r\n]*[\r\n]+/i, '')
            .replace(/```[\s\S]*?```/g, '')
            .trim();
        if (cleaned) {
            result.border = cleaned;
        }
    }

    return result;
};

window.applyComfyFrameAiPaste = function (rawInputText) {
    const inputEl = document.getElementById('inp-comfy-ai-paste');
    const text = rawInputText !== undefined ? rawInputText : (inputEl ? inputEl.value : '');
    if (!text || !text.trim()) {
        showToast('Please paste the AI output first!', 'warning');
        return false;
    }

    const parsed = window.parseComfyFrameAiResponse(text);
    if (!parsed) {
        showToast('Could not extract frame or typography fields from the provided text.', 'error');
        return false;
    }

    let appliedCount = 0;
    const highlightElements = [];

    const applyField = (id, val) => {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
            setValue(id, String(val).trim());
            appliedCount++;
            const el = document.getElementById(id);
            if (el) highlightElements.push(el);
        }
    };

    applyField('prompt-inp-border', parsed.border);
    applyField('prompt-inp-top-title', parsed.topTitle);
    applyField('prompt-inp-top-title-style', parsed.topTitleStyle);
    applyField('prompt-inp-subtitle', parsed.subtitle);
    applyField('prompt-inp-subtitle-style', parsed.subtitleStyle);
    applyField('prompt-inp-bottom-title', parsed.bottomTitle);
    applyField('prompt-inp-bottom-title-style', parsed.bottomTitleStyle);
    applyField('prompt-inp-typo-style', parsed.typoStyle);
    applyField('prompt-inp-atmosphere', parsed.atmosphere);
    applyField('prompt-inp-framing', parsed.framing);
    applyField('prompt-inp-male-style', parsed.maleStyle);
    applyField('prompt-inp-female-style', parsed.femaleStyle);

    if (parsed.topTitle) setValue('comfy-genai-top-title', parsed.topTitle);
    if (parsed.subtitle) setValue('comfy-genai-subtitle', parsed.subtitle);
    if (parsed.bottomTitle) setValue('comfy-genai-bottom-title', parsed.bottomTitle);

    window.updateComfyFrameGenAiPrompt();

    if (appliedCount === 0) {
        setValue('prompt-inp-border', text.trim());
        appliedCount = 1;
        const el = document.getElementById('prompt-inp-border');
        if (el) highlightElements.push(el);
    }

    // Refresh live prompt tokens and assembled formula
    if (typeof updatePromptLivePreview === 'function') {
        updatePromptLivePreview();
    }

    // Pulse highlight all updated inputs
    highlightElements.forEach(el => {
        el.style.transition = 'box-shadow 0.4s ease, border-color 0.4s ease';
        el.style.borderColor = '#10b981';
        el.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.45)';
        setTimeout(() => {
            el.style.borderColor = '';
            el.style.boxShadow = '';
        }, 1600);
    });

    showToast(appliedCount > 1 
        ? `✅ Successfully imported ${appliedCount} design blocks!` 
        : '✨ Applied frame & border style from AI text!', 'success');

    window.closeComfyFramePasteModal();
    return true;
};

function initPromptDesignerListeners() {
    const inputIds = [
        'prompt-inp-framing', 'prompt-inp-male-style', 'prompt-inp-female-style',
        'prompt-inp-border', 'prompt-inp-top-title', 'prompt-inp-top-title-style',
        'prompt-inp-subtitle', 'prompt-inp-subtitle-style', 'prompt-inp-bottom-title',
        'prompt-inp-bottom-title-style', 'prompt-inp-typo-style', 'prompt-inp-atmosphere'
    ];
    inputIds.forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            if (id === 'prompt-inp-top-title') setValue('comfy-genai-top-title', getValue('prompt-inp-top-title'));
            if (id === 'prompt-inp-subtitle') setValue('comfy-genai-subtitle', getValue('prompt-inp-subtitle'));
            if (id === 'prompt-inp-bottom-title') setValue('comfy-genai-bottom-title', getValue('prompt-inp-bottom-title'));
            if (typeof window.updateComfyFrameGenAiPrompt === 'function') {
                window.updateComfyFrameGenAiPrompt();
            }
            updatePromptLivePreview();
        });
    });

    ['comfy-genai-top-title', 'comfy-genai-subtitle', 'comfy-genai-bottom-title', 'comfy-genai-concept'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            if (typeof window.updateComfyFrameGenAiPrompt === 'function') {
                window.updateComfyFrameGenAiPrompt();
            }
        });
    });

    document.getElementById('raw-prompt-textarea')?.addEventListener('input', updatePromptLivePreview);
    document.getElementById('chk-lucky-number')?.addEventListener('change', updatePromptLivePreview);
    const borderInp = document.getElementById('prompt-inp-border');
    if (borderInp) {
        borderInp.addEventListener('paste', (e) => {
            const pasted = (e.clipboardData || window.clipboardData)?.getData('text');
            if (pasted && (pasted.includes('topTitle') || pasted.includes('topApexTitle') || pasted.includes('"border":') || (pasted.includes('Border:') && pasted.includes('Title:')))) {
                setTimeout(() => {
                    if (confirm('It looks like you pasted a multi-field GenAI response! Would you like to automatically populate all Frame and Typography fields?')) {
                        window.applyComfyFrameAiPaste(pasted);
                    }
                }, 60);
            }
        });
    }
    // Initialize ComfyUI GenAI Prompt Template Preview
    if (typeof window.updateComfyFrameGenAiPrompt === 'function') {
        window.updateComfyFrameGenAiPrompt();
    }

}

// ==========================================================================
// 5. Asset Manager & Master Database Picker
// ==========================================================================
function renderAssetsList() {
    renderClothesList();
    renderPosesList();
    renderBackgroundsList();
}

function renderClothesList() {
    const grid = document.getElementById('studio-clothes-grid');
    if (!grid) return;
    const items = studio.activeData?.clothes || [];

    if (items.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
                <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">👘</div>
                <p>No outfits added yet. Click <strong>"Pick from Master Wardrobe"</strong> above to browse existing outfits!</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = items.map((c, idx) => `
        <div class="asset-studio-card">
            <img class="asset-thumb" src="${c.image}" alt="${c.title}" onerror="this.src='/static/landing/cny_card_bg.png'">
            <div class="asset-card-details">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="asset-card-code">${c.code || 'O' + (idx + 1)} (${c.category || 'unisex'})</span>
                    <button class="admin-btn admin-btn-secondary" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;" onclick="openMasterAssetPicker('clothes', ${idx})" title="Replace from Master Library">🔄 Change</button>
                </div>
                <div class="asset-card-title">${c.title || c.name || 'Untitled Outfit'}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${c.description || c.prompt_modifier || ''}">
                    ${c.description || c.mapping_desc || c.prompt_modifier || c.lighting || 'Custom festive styling'}
                </div>
            </div>
            <button class="admin-btn admin-btn-danger" style="position: absolute; top: 6px; right: 6px; padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="removeOutfit(${idx})">×</button>
        </div>
    `).join('');
}

function renderPosesList() {
    const grid = document.getElementById('studio-poses-grid');
    if (!grid) return;
    const items = studio.activeData?.poses || [];

    if (items.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
                <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🕺</div>
                <p>No poses added yet. Click <strong>"Pick from Master Poses"</strong> above to browse existing poses!</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = items.map((p, idx) => `
        <div class="asset-studio-card">
            <img class="asset-thumb" src="${p.image}" alt="${p.title}" onerror="this.src='/static/landing/cny_card_bg.png'">
            <div class="asset-card-details">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="asset-card-code">${p.code || 'P' + (idx + 1)}</span>
                    <button class="admin-btn admin-btn-secondary" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;" onclick="openMasterAssetPicker('poses', ${idx})" title="Replace from Master Library">🔄 Change</button>
                </div>
                <div class="asset-card-title">${p.title || p.name || 'Untitled Pose'}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${p.description || p.prompt_modifier || ''}">${p.description || p.prompt_modifier || 'Pose modifier'}</div>
            </div>
            <button class="admin-btn admin-btn-danger" style="position: absolute; top: 6px; right: 6px; padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="removePose(${idx})">×</button>
        </div>
    `).join('');
}

function renderBackgroundsList() {
    const grid = document.getElementById('studio-bg-grid');
    if (!grid) return;
    const items = studio.activeData?.backgrounds || [];

    if (items.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
                <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🏞️</div>
                <p>No backgrounds added yet. Click <strong>"Pick from Master Backgrounds"</strong> above to browse existing backgrounds!</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = items.map((b, idx) => `
        <div class="asset-studio-card">
            <img class="asset-thumb" src="${b.image}" alt="${b.title}" onerror="this.src='/static/landing/cny_card_bg.png'">
            <div class="asset-card-details">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="asset-card-code">${b.code || 'B' + (idx + 1)}</span>
                    <button class="admin-btn admin-btn-secondary" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;" onclick="openMasterAssetPicker('backgrounds', ${idx})" title="Replace from Master Library">🔄 Change</button>
                </div>
                <div class="asset-card-title">${b.title || b.name || 'Untitled Background'}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${b.description || b.prompt_modifier || ''}">${b.description || b.prompt_modifier || 'Atmospheric setting'}</div>
            </div>
            <button class="admin-btn admin-btn-danger" style="position: absolute; top: 6px; right: 6px; padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="removeBackground(${idx})">×</button>
        </div>
    `).join('');
}

window.removeOutfit = function (idx) {
    studio.activeData.clothes.splice(idx, 1);
    renderClothesList();
};

window.removePose = function (idx) {
    studio.activeData.poses.splice(idx, 1);
    renderPosesList();
};

window.removeBackground = function (idx) {
    studio.activeData.backgrounds.splice(idx, 1);
    renderBackgroundsList();
};

// --- Master Asset Picker Modal Controls ---
window.openMasterAssetPicker = function (category = 'clothes', replaceIndex = null) {
    studio.pickerCategory = category;
    studio.pickerTargetIndex = replaceIndex;
    const modal = document.getElementById('asset-library-modal');
    if (!modal) return;

    document.querySelectorAll('.modal-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === category);
    });

    modal.classList.add('open');
    filterPickerAssets();
};

window.closeMasterAssetPicker = function () {
    const modal = document.getElementById('asset-library-modal');
    if (modal) modal.classList.remove('open');
    studio.pickerTargetIndex = null;
};

window.setPickerCategory = function (cat) {
    studio.pickerCategory = cat;
    document.querySelectorAll('.modal-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    filterPickerAssets();
};

window.filterPickerAssets = function () {
    const grid = document.getElementById('modal-asset-grid');
    const countEl = document.getElementById('modal-asset-count');
    if (!grid) return;

    const cat = studio.pickerCategory || 'clothes';
    const searchFilter = (document.getElementById('modal-search-input')?.value || '').toLowerCase().trim();

    const allItems = studio.masterAssets[cat] || [];
    const filtered = allItems.filter(item => {
        if (searchFilter) {
            const name = (item.title || item.name || '').toLowerCase();
            const code = (item.code || '').toLowerCase();
            const prompt = (item.prompt_modifier || item.mapping_desc || '').toLowerCase();
            if (!name.includes(searchFilter) && !code.includes(searchFilter) && !prompt.includes(searchFilter)) {
                return false;
            }
        }
        return true;
    });

    if (countEl) {
        countEl.textContent = `Showing ${filtered.length} of ${allItems.length} assets in library`;
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
                <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔍</div>
                <div>No matching assets found in master database</div>
            </div>
        `;
        return;
    }

    const isBg = cat === 'backgrounds';
    grid.innerHTML = filtered.map((item) => {
        const title = item.title || item.name || 'Untitled Asset';
        const code = item.code || '';
        const theme = item.source_theme || 'shared';
        const desc = item.description || item.mapping_desc || '';
        const isSelected = (studio.activeData?.[cat] || []).some(existing => 
            (existing.image && item.image && existing.image === item.image) || 
            (existing.id && item.id && existing.id === item.id) ||
            (existing.code && item.code && existing.code === item.code)
        );
        const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

        return `<div class="modal-asset-card ${isSelected ? 'selected' : ''} ${isBg ? 'category-backgrounds' : ''}" onclick="selectMasterAsset('${cat}', ${itemJson})">
            <div class="modal-asset-thumb-wrap">
                <img class="modal-asset-thumb" src="${item.image}" alt="${title}" onerror="this.src='/static/landing/cny_card_bg.png'">
                <button class="modal-asset-zoom-btn" title="Inspect" onclick="event.stopPropagation(); openAssetLightbox('${cat}', ${itemJson})">🔍</button>
            </div>
            <div class="modal-asset-info">
                <div class="modal-asset-header">
                    <span class="modal-asset-theme-tag">${theme.toUpperCase()}</span>
                    ${code ? `<span class="modal-asset-code">${code}</span>` : ''}
                </div>
                <div class="modal-asset-name">${title}</div>
                ${desc ? `<div class="modal-asset-desc">${desc}</div>` : ''}
                <div class="modal-asset-action">
                    <button type="button" class="modal-add-btn">
                        ${studio.pickerTargetIndex !== null ? '🔄 Replace With This' : (isSelected ? '✓ Added (Click to remove)' : '➕ Add to Theme')}
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
};

window.selectMasterAsset = function (category, item) {
    studio.activeData = studio.activeData || { clothes: [], poses: [], backgrounds: [] };
    studio.activeData[category] = studio.activeData[category] || [];

    const existingIndex = studio.activeData[category].findIndex(existing => 
        (existing.id && item.id && existing.id === item.id) ||
        (existing.image && item.image && existing.image === item.image) ||
        (existing.code && item.code && existing.code === item.code)
    );

    const assetDesc = item.description || item.mapping_desc || item.prompt_modifier || '';

    if (studio.pickerTargetIndex !== null && studio.pickerTargetIndex >= 0) {
        const cloned = {
            id: item.id || `${studio.activeTheme?.slug || 'theme'}_${Date.now().toString().slice(-4)}`,
            code: studio.activeData[category][studio.pickerTargetIndex]?.code || item.code || `${category[0].toUpperCase()}${studio.pickerTargetIndex + 1}`,
            title: item.title || item.name || 'New Asset',
            description: assetDesc,
            image: item.image,
            prompt: item.prompt || item.prompt_modifier || '',
            prompt_modifier: item.prompt_modifier || item.prompt || '',
            category: item.category || item.gender || 'unisex',
            lighting: item.lighting || 'Warm cinematic lighting'
        };
        studio.activeData[category][studio.pickerTargetIndex] = cloned;
        showToast(`Replaced slot with "${cloned.title}"!`, 'success');
        closeMasterAssetPicker();
    } else if (existingIndex >= 0) {
        // Toggle remove so duplicate copies are never created
        studio.activeData[category].splice(existingIndex, 1);
        showToast(`Removed "${item.title || item.name}" from ${category}.`, 'info');
    } else {
        const prefix = category === 'clothes' ? 'C' : (category === 'poses' ? 'P' : 'B');
        const codesInUse = new Set(studio.activeData[category].map(x => x.code).filter(Boolean));
        let assignedCode = item.code;
        if (!assignedCode || codesInUse.has(assignedCode)) {
            let maxNum = 0;
            codesInUse.forEach(c => {
                if (c.startsWith(prefix)) {
                    const parsed = parseInt(c.slice(prefix.length), 10);
                    if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
                }
            });
            const nextCodeNum = maxNum + 1;
            assignedCode = prefix === 'C' ? `${prefix}${nextCodeNum.toString().padStart(2, '0')}` : `${prefix}${nextCodeNum}`;
        }

        const cloned = {
            id: item.id || `${studio.activeTheme?.slug || 'theme'}_${Date.now().toString().slice(-4)}`,
            code: assignedCode,
            title: item.title || item.name || 'New Asset',
            description: assetDesc,
            image: item.image,
            prompt: item.prompt || item.prompt_modifier || '',
            prompt_modifier: item.prompt_modifier || item.prompt || '',
            category: item.category || item.gender || 'unisex',
            lighting: item.lighting || 'Warm cinematic lighting'
        };
        studio.activeData[category].push(cloned);
        showToast(`Added "${cloned.title}" (${assignedCode}) to ${category}!`, 'success');
    }

    renderAssetsList();
    filterPickerAssets();
};

// --- Blank Item Creators ---
window.addBlankOutfit = function () {
    studio.activeData.clothes = studio.activeData.clothes || [];
    const num = studio.activeData.clothes.length + 1;
    studio.activeData.clothes.push({
        id: `outfit_${Date.now().toString().slice(-4)}`,
        code: `O${num}`,
        title: `Custom Outfit ${num}`,
        image: '/static/landing/cny_card_bg.png',
        category: 'unisex',
        prompt_modifier: 'wearing traditional festive attire',
        lighting: 'Warm cinematic lighting'
    });
    renderClothesList();
    showToast('Added blank outfit. Click "🔄 Change" to pick photo!', 'success');
};

window.addBlankPose = function () {
    studio.activeData.poses = studio.activeData.poses || [];
    const num = studio.activeData.poses.length + 1;
    studio.activeData.poses.push({
        id: `pose_${Date.now().toString().slice(-4)}`,
        code: `P${num}`,
        title: `Custom Pose ${num}`,
        image: '/static/landing/cny_card_bg.png',
        prompt_modifier: 'standing with confidence'
    });
    renderPosesList();
    showToast('Added blank pose. Click "🔄 Change" to pick photo!', 'success');
};

window.addBlankBackground = function () {
    studio.activeData.backgrounds = studio.activeData.backgrounds || [];
    const num = studio.activeData.backgrounds.length + 1;
    studio.activeData.backgrounds.push({
        id: `bg_${Date.now().toString().slice(-4)}`,
        code: `B${num}`,
        title: `Custom Background ${num}`,
        image: '/static/landing/cny_card_bg.png',
        prompt_modifier: 'luxurious festive celebration hall'
    });
    renderBackgroundsList();
    showToast('Added blank background. Click "🔄 Change" to pick photo!', 'success');
};

// --- Entire Theme Importer ---
window.openImportThemeModal = function () {
    const modal = document.getElementById('theme-import-modal');
    if (modal) modal.classList.add('open');
};

window.closeImportThemeModal = function () {
    const modal = document.getElementById('theme-import-modal');
    if (modal) modal.classList.remove('open');
};

window.confirmImportTheme = async function () {
    const sourceTheme = document.getElementById('import-source-theme')?.value || 'uits';
    const overwrite = document.getElementById('import-overwrite-chk')?.checked;

    try {
        const res = await fetch(`/api/theme/${sourceTheme}/data`);
        if (!res.ok) throw new Error('Could not load theme assets');
        const data = await res.json();

        if (overwrite) {
            studio.activeData = {
                clothes: data.clothes ? [...data.clothes] : [],
                poses: data.poses ? [...data.poses] : [],
                backgrounds: data.backgrounds ? [...data.backgrounds] : []
            };
        } else {
            studio.activeData = studio.activeData || { clothes: [], poses: [], backgrounds: [] };
            studio.activeData.clothes = [...(studio.activeData.clothes || []), ...(data.clothes || [])];
            studio.activeData.poses = [...(studio.activeData.poses || []), ...(data.poses || [])];
            studio.activeData.backgrounds = [...(studio.activeData.backgrounds || []), ...(data.backgrounds || [])];
        }

        renderAssetsList();
        closeImportThemeModal();
        showToast(`Successfully imported assets from ${sourceTheme.toUpperCase()}!`, 'success');
    } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
    }
};

// ==========================================================================
// 6. Save & Publish
// ==========================================================================
async function saveAndPublishTheme() {
    const theme = readFormFields();
    theme.status = 'live';
    theme.isUnsavedDraft = false;
    if (!theme.slug || !theme.title) {
        showToast('Please specify a Theme Slug and Title!', 'error');
        return;
    }
    const prevSlug = studio.activeTheme?.slug;

    const payload = {
        theme: theme,
        data: studio.activeData,
        bindings: studio.activeBindings,
        workflow: studio.uploadedWorkflow,
        decorations_html: document.getElementById('adv-decorations-html')?.value || '',
        custom_css: document.getElementById('adv-custom-css')?.value || ''
    };

    try {
        const btn = document.getElementById('save-publish-btn');
        if (btn) btn.textContent = 'Publishing...';

        const res = await fetch('/api/admin/theme/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to save theme');
        }

        showToast(`🎉 Theme "${theme.title}" successfully published!`, 'success');
        if (btn) btn.textContent = '🚀 Save & Publish Live';

        // Mark activeTheme clean
        if (studio.activeTheme) {
            studio.activeTheme = { ...studio.activeTheme, ...theme, isUnsavedDraft: false };
        }

        // Update studio.themes so draft is marked live and unsaved draft flag cleared
        studio.themes = (studio.themes || []).map(t => {
            if (t.slug === theme.slug || (prevSlug && t.slug === prevSlug)) {
                return { ...t, ...theme, isUnsavedDraft: false };
            }
            return t;
        }).filter(t => !t.isUnsavedDraft || t.slug !== prevSlug);

        // Refresh sidebar and force reload the newly saved theme
        await loadThemes(theme.slug, false);
        await selectTheme(theme.slug, true);
    } catch (err) {
        showToast('Save error: ' + err.message, 'error');
        const btn = document.getElementById('save-publish-btn');
        if (btn) btn.textContent = '🚀 Save & Publish Live';
    }
}

// ==========================================================================
// 7. Tabs & Helpers
// ==========================================================================
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const target = document.getElementById(`tab-${btn.dataset.tab}`);
            if (target) target.classList.add('active');
        });
    });

    // Sub-tabs for assets
    document.querySelectorAll('.asset-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchAssetSubtab(btn.dataset.subtab);
        });
    });
}

window.switchAssetSubtab = function (subtab) {
    document.querySelectorAll('.asset-subtab-btn').forEach(b => {
        const isMatch = b.dataset.subtab === subtab;
        b.classList.toggle('active', isMatch);
        b.classList.toggle('admin-btn-primary', isMatch);
        b.classList.toggle('admin-btn-secondary', !isMatch);
    });
    document.querySelectorAll('.asset-subtab-panel').forEach(p => {
        p.style.display = (p.id === `subtab-${subtab}`) ? 'block' : 'none';
    });
};

// ==========================================================================
// Workspace View Switcher
// ==========================================================================
window.switchToThemeEditor = function () {

    studio.currentView = 'theme-editor';
    document.getElementById('view-theme-editor').style.display = '';
    document.getElementById('view-master-library').style.display = 'none';
    document.getElementById('view-ai-creator').style.display = 'none';
    // Highlight active sidebar nav
    document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('active'));
    renderThemeSidebar();
}

window.switchToMasterGallery = function () {
    studio.currentView = 'master-library';
    document.getElementById('view-theme-editor').style.display = 'none';
    document.getElementById('view-master-library').style.display = '';
    document.getElementById('view-ai-creator').style.display = 'none';
    document.getElementById('nav-master-gallery')?.classList.add('active');
    document.getElementById('nav-ai-creator')?.classList.remove('active');
    document.querySelectorAll('.theme-item').forEach(i => i.classList.remove('active'));
    filterMasterGallery();
};

window.switchToAICreator = function () {
    studio.currentView = 'ai-creator';
    document.getElementById('view-theme-editor').style.display = 'none';
    document.getElementById('view-master-library').style.display = 'none';
    document.getElementById('view-ai-creator').style.display = '';
    document.getElementById('nav-ai-creator')?.classList.add('active');
    document.getElementById('nav-master-gallery')?.classList.remove('active');
    document.querySelectorAll('.theme-item').forEach(i => i.classList.remove('active'));
};

// ==========================================================================
// Master Gallery View Functions
// ==========================================================================
window.setMasterGalleryCategory = function (cat) {
    studio.galleryCategory = cat;
    document.querySelectorAll('#view-master-library .modal-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    filterMasterGallery();
};

window.setGalleryCardSize = function (size) {
    const grid = document.getElementById('master-gallery-grid');
    if (!grid) return;
    grid.classList.toggle('large-cards', size === 'large');
    document.getElementById('gallery-size-normal')?.classList.toggle('active-size-btn', size === 'normal');
    document.getElementById('gallery-size-large')?.classList.toggle('active-size-btn', size === 'large');
};

window.filterMasterGallery = function () {
    const grid = document.getElementById('master-gallery-grid');
    const countEl = document.getElementById('master-gallery-count');
    if (!grid) return;

    const cat = studio.galleryCategory || 'clothes';
    const searchFilter = (document.getElementById('gallery-search-input')?.value || '').toLowerCase().trim();

    const allItems = studio.masterAssets[cat] || [];
    const filtered = allItems.filter(item => {
        if (searchFilter) {
            const haystack = [
                item.title || '', item.name || '', item.code || '',
                item.description || '', item.mapping_desc || '',
                item.lighting || '', item.prompt_modifier || ''
            ].join(' ').toLowerCase();
            if (!haystack.includes(searchFilter)) return false;
        }
        return true;
    });

    if (countEl) countEl.textContent = `Showing ${filtered.length} of ${allItems.length} assets`;

    const isBg = cat === 'backgrounds';
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);"><div style="font-size:2.2rem;margin-bottom:0.5rem;">📂</div><div>No assets found</div></div>`;
        return;
    }

    grid.innerHTML = filtered.map(item => {
        const title = item.title || item.name || 'Untitled';
        const code = item.code || '';
        const theme = item.source_theme || 'master';
        const desc = item.description || item.mapping_desc || '';
        const lighting = item.lighting || '';
        const prompt = item.prompt_modifier || '';
        const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');
        return `<div class="modal-asset-card ${isBg ? 'category-backgrounds' : ''}" onclick="openAssetLightbox('${cat}', ${itemJson})">
            <div class="modal-asset-thumb-wrap">
                <img class="modal-asset-thumb" src="${item.image}" alt="${title}" onerror="this.src='/static/landing/cny_card_bg.png'">
                <button class="modal-asset-zoom-btn" title="Inspect">🔍</button>
                <button class="gallery-asset-delete-btn" title="Delete from Library" onclick="event.stopPropagation(); openDeleteAssetModal('${cat}', ${itemJson})">🗑️</button>
            </div>
            <div class="modal-asset-info">
                <div class="modal-asset-header">
                    <span class="modal-asset-theme-tag">${theme.toUpperCase()}</span>
                    ${code ? `<span class="modal-asset-code">${code}</span>` : ''}
                </div>
                <div class="modal-asset-name">${title}</div>
                ${desc ? `<div class="modal-asset-desc">${desc}</div>` : ''}
                ${lighting ? `<div class="modal-asset-lighting">${lighting}</div>` : ''}
            </div>
        </div>`;
    }).join('');
};
window.renderMasterAssetGallery = window.filterMasterGallery;

// ==========================================================================
// Asset Lightbox Inspector
// ==========================================================================
window.openAssetLightbox = function (category, item) {
    studio.activeLightboxAsset = { category, item };
    const modal = document.getElementById('asset-lightbox-modal');
    if (!modal) return;

    document.getElementById('lightbox-title').textContent = '🔍 ' + (item.title || item.name || 'Asset Inspector');
    document.getElementById('lightbox-img').src = item.image || '';
    document.getElementById('lightbox-badge').textContent = (item.source_theme || 'master').toUpperCase();
    document.getElementById('lightbox-code').textContent = item.code || '';
    document.getElementById('lightbox-name').textContent = item.title || item.name || '';
    document.getElementById('lightbox-desc').textContent = item.description || item.mapping_desc || '';
    document.getElementById('lightbox-lighting').textContent = item.lighting ? '💡 ' + item.lighting : '';
    document.getElementById('lightbox-prompt').textContent = item.prompt_modifier || item.prompt || '';

    const selectBtn = document.getElementById('lightbox-select-btn');
    if (selectBtn) {
        selectBtn.onclick = () => {
            if (studio.activeTheme) {
                selectMasterAsset(category, item);
                closeAssetLightbox();
                switchToThemeEditor();
                // Switch to the relevant asset subtab
                const subtabMap = { clothes: 'clothes', poses: 'poses', backgrounds: 'backgrounds' };
                switchAssetSubtab(subtabMap[category] || category);
            } else {
                showToast('Select a theme first before adding assets!', 'error');
            }
        };
        selectBtn.textContent = studio.activeTheme ? '➕ Add to Active Theme' : '⚠️ Select a Theme First';
    }

    modal.classList.add('open');
};

window.closeAssetLightbox = function () {
    const modal = document.getElementById('asset-lightbox-modal');
    if (modal) modal.classList.remove('open');
    studio.activeLightboxAsset = null;
};

window.openDeleteActiveLightboxAsset = function () {
    if (studio.activeLightboxAsset) {
        const { category, item } = studio.activeLightboxAsset;
        closeAssetLightbox();
        openDeleteAssetModal(category, item);
    }
};

// ==========================================================================
// Delete Asset Modal
// ==========================================================================
studio.pendingDeleteAsset = null;

window.openDeleteAssetModal = function (category, item) {
    studio.pendingDeleteAsset = { category, item };
    const modal = document.getElementById('delete-asset-modal');
    if (!modal) return;

    document.getElementById('delete-asset-title').textContent = item.title || item.name || 'Untitled Asset';
    document.getElementById('delete-asset-meta').textContent = `${item.code || ''} · ${category.toUpperCase()} · ${item.source_theme || 'master'}`;
    const thumb = document.getElementById('delete-asset-thumb');
    if (thumb) thumb.src = item.image || '';

    modal.classList.add('open');
};

window.closeDeleteAssetModal = function () {
    const modal = document.getElementById('delete-asset-modal');
    if (modal) modal.classList.remove('open');
    studio.pendingDeleteAsset = null;
};

window.confirmDeleteAsset = async function () {
    if (!studio.pendingDeleteAsset) return;
    const { category, item } = studio.pendingDeleteAsset;
    const btn = document.getElementById('btn-confirm-delete-asset');
    if (btn) { btn.textContent = 'Deleting...'; btn.disabled = true; }

    try {
        const res = await fetch('/api/admin/asset/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, id: item.id, image: item.image })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete asset');

        // Remove from current activeData if present in open theme
        if (studio.activeData && studio.activeData[category]) {
            studio.activeData[category] = studio.activeData[category].filter(x => 
                (!item.id || x.id !== item.id) && (!item.image || x.image !== item.image)
            );
        }

        // Refresh master assets fresh from server
        await loadMasterAssets();

        closeDeleteAssetModal();
        filterMasterGallery();
        renderAssetsList();
        if (typeof filterPickerAssets === 'function') filterPickerAssets();

        showToast(`Asset "${item.title || item.name}" deleted from library!`, 'success');
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error deleting asset: ' + err.message, 'error');
    } finally {
        if (btn) { btn.textContent = '🗑️ Delete Permanently'; btn.disabled = false; }
    }
};

// ==========================================================================
// Delete Theme Modal (with Phrase Confirmation & Success Popup)
// ==========================================================================
window.openDeleteThemeModal = function (slug, title) {
    if (!slug) return;
    studio.pendingDeleteSlug = slug;
    studio.pendingDeleteTitle = title || slug;

    // Build clean title and phrase similar to the title
    const rawTitle = title || slug;
    const cleanTitle = rawTitle.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
                               .replace(/[^\w\s-]/g, '')
                               .trim() || slug;
    const targetPhrase = `delete ${cleanTitle.toLowerCase()}`;

    studio.deleteCleanTitle = cleanTitle;
    studio.deleteTargetPhrase = targetPhrase;

    const nameEl = document.getElementById('delete-theme-name');
    if (nameEl) nameEl.textContent = rawTitle;

    const slugEl = document.getElementById('delete-theme-slug');
    if (slugEl) slugEl.textContent = slug;

    const phraseEl = document.getElementById('delete-theme-target-phrase');
    if (phraseEl) phraseEl.textContent = `${targetPhrase} (or "delete")`;

    const input = document.getElementById('inp-delete-theme-confirm');
    if (input) {
        input.value = '';
        input.placeholder = `Type "delete" or "${targetPhrase}" to confirm...`;
        input.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        input.style.boxShadow = 'none';
    }

    const hint = document.getElementById('delete-phrase-hint');
    if (hint) hint.innerHTML = '<span style="color:var(--text-muted);">Tip: Type <strong>delete</strong> or the phrase to confirm</span>';

    const btn = document.getElementById('btn-confirm-delete-theme');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.45';
        btn.style.cursor = 'not-allowed';
        btn.textContent = '🗑️ Permanently Delete';
    }

    const modal = document.getElementById('delete-theme-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('open');
        setTimeout(() => { if (input) input.focus(); }, 150);
    }
};

window.onDeleteThemePhraseInput = function () {
    const input = document.getElementById('inp-delete-theme-confirm');
    const btn = document.getElementById('btn-confirm-delete-theme');
    const hint = document.getElementById('delete-phrase-hint');
    if (!input || !btn) return;

    const val = input.value.trim().toLowerCase();
    const target = (studio.deleteTargetPhrase || '').trim().toLowerCase();
    const cleanTitle = (studio.deleteCleanTitle || '').trim().toLowerCase();
    const rawTitle = (studio.pendingDeleteTitle || '').trim().toLowerCase();
    const slug = (studio.pendingDeleteSlug || '').trim().toLowerCase();

    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const isMatch = Boolean(val) && (
        val === 'delete' ||
        val === target ||
        norm(val) === norm(target) ||
        val === slug ||
        norm(val) === norm(slug) ||
        val === cleanTitle ||
        norm(val) === norm(cleanTitle) ||
        norm(val) === norm(rawTitle)
    );

    if (isMatch) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        input.style.borderColor = '#10b981';
        input.style.boxShadow = '0 0 0 2px rgba(16, 185, 129, 0.25)';
        if (hint) {
            hint.innerHTML = '<span style="color:#10b981;font-weight:600;">✓ Confirmed. You can now delete this theme.</span>';
        }
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.45';
        btn.style.cursor = 'not-allowed';
        input.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        input.style.boxShadow = 'none';
        if (hint) {
            hint.innerHTML = val ? '<span style="color:#f87171;">Type "delete", slug, or confirmation phrase.</span>' : '<span style="color:var(--text-muted);">Tip: Type <strong>delete</strong> or the phrase to confirm</span>';
        }
    }
};

window.openDeleteActiveThemeModal = function () {
    if (!studio.activeTheme?.slug) return;
    window.openDeleteThemeModal(studio.activeTheme.slug, studio.activeTheme.title);
};

window.closeDeleteThemeModal = function () {
    studio.pendingDeleteSlug = null;
    studio.pendingDeleteTitle = null;
    studio.deleteCleanTitle = null;
    studio.deleteTargetPhrase = null;
    const input = document.getElementById('inp-delete-theme-confirm');
    if (input) input.value = '';
    const modal = document.getElementById('delete-theme-modal');
    if (modal) {
        modal.classList.remove('open');
        modal.style.display = 'none';
    }
};

window.closeDeleteSuccessModal = function () {
    const successModal = document.getElementById('delete-success-modal');
    if (successModal) {
        successModal.classList.remove('open');
        successModal.style.display = 'none';
    }
};

window.confirmDeleteTheme = async function () {
    const slug = studio.pendingDeleteSlug;
    const deletedTitle = studio.pendingDeleteTitle || slug;
    if (!slug) return;

    const btn = document.getElementById('btn-confirm-delete-theme');
    if (btn && btn.disabled) return;

    const input = document.getElementById('inp-delete-theme-confirm');
    const val = (input?.value || '').trim().toLowerCase();
    const target = (studio.deleteTargetPhrase || '').trim().toLowerCase();
    const cleanTitle = (studio.deleteCleanTitle || '').trim().toLowerCase();
    const rawTitle = (studio.pendingDeleteTitle || '').trim().toLowerCase();
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const isMatch = Boolean(val) && (
        val === 'delete' ||
        val === target ||
        norm(val) === norm(target) ||
        val === slug ||
        norm(val) === norm(slug) ||
        val === cleanTitle ||
        norm(val) === norm(cleanTitle) ||
        norm(val) === norm(rawTitle)
    );

    if (!isMatch) {
        if (input) {
            input.focus();
            input.style.borderColor = '#ef4444';
        }
        return;
    }

    if (btn) { btn.textContent = '🗑️ Deleting...'; btn.disabled = true; }

    try {
        const isDraftOnly = (studio.themes || []).some(t => t.slug === slug && t.isUnsavedDraft);
        if (!isDraftOnly) {
            let res = await fetch(`/api/theme/${slug}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 404) {
                // Try POST fallback endpoint
                res = await fetch('/api/admin/theme/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug })
                });
            }

            if (!res.ok && res.status !== 404) {
                let errMsg = `Delete failed with status ${res.status}`;
                try {
                    const data = await res.json();
                    errMsg = data.error || errMsg;
                } catch (je) {}
                throw new Error(errMsg);
            }
        }

        // 1. Immediately close the delete prompt modal
        window.closeDeleteThemeModal();

        // 2. Open explicit success popup confirmation dialog
        const successDesc = document.getElementById('delete-success-desc');
        if (successDesc) {
            successDesc.innerHTML = `Theme <strong>"${deletedTitle}"</strong> (<code>/${slug}</code>) has been permanently deleted from the system.`;
        }
        const successModal = document.getElementById('delete-success-modal');
        if (successModal) {
            successModal.style.display = 'flex';
            successModal.classList.add('open');
        }

        showToast(`Theme "${slug}" permanently deleted.`, 'success');

        // 3. Remove from sidebar and reload
        studio.themes = (studio.themes || []).filter(t => t.slug !== slug);
        if (studio.activeTheme?.slug === slug) {
            studio.activeTheme = null;
        }

        await loadThemes();
        if (studio.themes.length > 0) {
            await selectTheme(studio.themes[0].slug, true);
        } else {
            switchToMasterGallery();
        }
    } catch (err) {
        showToast('Delete error: ' + err.message, 'error');
    } finally {
        if (btn) { btn.textContent = '🗑️ Permanently Delete'; btn.disabled = false; }
    }
};

function initEventListeners() {
    document.getElementById('new-theme-btn')?.addEventListener('click', createNewTheme);
    document.getElementById('save-publish-btn')?.addEventListener('click', saveAndPublishTheme);
    document.getElementById('add-waiting-msg-btn')?.addEventListener('click', addWaitingSequenceRow);
    document.getElementById('ai-generate-phrases-btn')?.addEventListener('click', autoGenerateWaitingPhrases);

    // View live link
    document.getElementById('view-live-btn')?.addEventListener('click', () => {
        if (studio.activeTheme?.slug) {
            window.open(`/${studio.activeTheme.slug}`, '_blank');
        }
    });

    initWorkflowDropzone();
    initPromptDesignerListeners();

    // Auto-populate theme identity from GenAI JSON upon paste/input
    const jsonArea = document.getElementById('adv-identity-json');
    if (jsonArea) {
        jsonArea.addEventListener('input', () => window.autoApplyIdentityJsonOnInput(true));
        jsonArea.addEventListener('paste', () => setTimeout(() => window.autoApplyIdentityJsonOnInput(true), 50));
    }
}

// Card size toggle for picker modal
window.setPickerCardSize = function (size) {
    const grid = document.getElementById('modal-asset-grid');
    if (!grid) return;
    grid.classList.toggle('large-cards', size === 'large');
    document.getElementById('size-btn-normal')?.classList.toggle('active-size-btn', size === 'normal');
    document.getElementById('size-btn-large')?.classList.toggle('active-size-btn', size === 'large');
};

function getValue(id) { return document.getElementById(id)?.value || ''; }
function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function setColor(id, hex) { const el = document.getElementById(id); if (el) el.value = hex; }
function getChecked(id) { return document.getElementById(id)?.checked || false; }
function setChecked(id, b) { const el = document.getElementById(id); if (el) el.checked = b; }

function hexToRgba(hex, alpha) {
    hex = (hex || '#d4af37').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const num = parseInt(hex, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================================================
// 8. AI Asset Studio (ComfyUI Generator)
// ==========================================================================
async function loadAssetGenConfigs() {
    try {
        const res = await fetch('/api/admin/asset-generator/config');
        if (res.ok) {
            const data = await res.json();
            studio.assetGenConfigs = data.templates || {};
            updateGeneratorPreview();
        }
    } catch (e) {
        console.warn('Could not load asset generator configs:', e);
    }
}

window.selectGeneratorType = function (type) {
    studio.currentGenType = type;
    document.querySelectorAll('.gen-type-btn').forEach(btn => {
        btn.classList.toggle('admin-btn-primary', btn.dataset.type === type);
        btn.classList.toggle('admin-btn-secondary', btn.dataset.type !== type);
    });

    const genderGroup = document.getElementById('gen-gender-group');
    if (genderGroup) {
        genderGroup.style.display = type === 'clothes' ? 'block' : 'none';
    }

    updateGeneratorPreview();
};

window.updateGeneratorPreview = function () {
    const type = studio.currentGenType || 'backdrop';
    const cfg = studio.assetGenConfigs[type];
    if (!cfg) return;

    const prefixEl = document.getElementById('gen-static-prefix');
    const suffixEl = document.getElementById('gen-static-suffix');
    const middleInput = document.getElementById('gen-middle-prompt');

    if (type === 'clothes') {
        const gender = document.getElementById('gen-clothes-gender')?.value || 'female';
        if (prefixEl) prefixEl.textContent = `A professional studio product shot of a standalone ${gender} outfit, featuring`;
    } else {
        if (prefixEl) prefixEl.textContent = cfg.static_prefix.trim();
    }

    if (suffixEl) suffixEl.textContent = cfg.static_suffix.trim();

    // If middle prompt is empty, set default example
    if (middleInput && !middleInput.value.trim()) {
        middleInput.value = cfg.default_middle || '';
    }
};

window.loadGeneratorExamplePrompt = function () {
    const type = studio.currentGenType || 'backdrop';
    const cfg = studio.assetGenConfigs[type];
    const middleInput = document.getElementById('gen-middle-prompt');
    if (cfg && middleInput) {
        middleInput.value = cfg.default_middle || '';
        showToast('Loaded example prompt description!', 'success');
    }
};

window.clearGeneratorPrompt = function () {
    const middleInput = document.getElementById('gen-middle-prompt');
    if (middleInput) middleInput.value = '';
};

window.triggerAssetGeneration = async function () {
    const type = studio.currentGenType || 'backdrop';
    const middlePrompt = document.getElementById('gen-middle-prompt')?.value.trim();
    const gender = document.getElementById('gen-clothes-gender')?.value || 'female';
    const seed = document.getElementById('gen-seed-input')?.value.trim();
    const btn = document.getElementById('trigger-generate-asset-btn');

    if (!middlePrompt) {
        showToast('Please enter a description for the asset!', 'error');
        return;
    }

    const origText = btn.innerHTML;
    btn.innerHTML = '⏳ Generating with ComfyUI...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/admin/asset-generator/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: type,
                description: middlePrompt,
                gender: gender,
                seed: seed || undefined
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Generation failed');
        }

        const data = await res.json();
        studio.lastGenResult = data;

        // Render result panel
        const panel = document.getElementById('gen-result-panel');
        const img = document.getElementById('gen-result-img');
        const seedBadge = document.getElementById('gen-result-seed-badge');
        const nameInput = document.getElementById('gen-asset-name');
        const themeSelect = document.getElementById('gen-target-theme');
        const statusMsg = document.getElementById('gen-status-msg');

        if (panel) panel.style.display = 'block';
        if (img) img.src = data.preview_url + '?t=' + Date.now();
        if (seedBadge) seedBadge.textContent = `Seed: #${data.seed}`;

        // Auto-generate title suggestion
        if (nameInput) {
            let suggestedTitle = '';
            if (type === 'backdrop') suggestedTitle = 'Cinematic Backdrop ' + Math.floor(Math.random() * 900 + 100);
            else if (type === 'clothes') suggestedTitle = (gender === 'female' ? 'Women ' : 'Men ') + 'Celebration Attire ' + Math.floor(Math.random() * 900 + 100);
            else suggestedTitle = 'Hero Chibi Pose ' + Math.floor(Math.random() * 900 + 100);
            nameInput.value = suggestedTitle;
            updateFilenamePreview();
            autoFillShortDesc(true);
        }

        if (themeSelect) {
            themeSelect.value = 'master';
        }

        if (statusMsg) statusMsg.style.display = 'none';

        showToast('🎉 Asset generated successfully! Review below.', 'success');
        panel.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        showToast('Generation error: ' + err.message, 'error');
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
};

window.updateFilenamePreview = function () {
    const nameInput = document.getElementById('gen-asset-name');
    const previewEl = document.getElementById('gen-filename-preview');
    if (!previewEl) return;
    const val = (nameInput?.value || '').trim();
    if (val) {
        const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        previewEl.textContent = (slug || 'asset') + '.png';
    } else {
        previewEl.textContent = 'autogenerated-from-prompt.png';
    }
};

window.regenerateAsset = function () {
    const seedInput = document.getElementById('gen-seed-input');
    if (seedInput) seedInput.value = ''; // force new random seed
    triggerAssetGeneration();
};

window.acceptGeneratedAsset = async function () {
    if (!studio.lastGenResult) {
        showToast('No generated asset to accept', 'error');
        return;
    }

    const type = studio.currentGenType || 'backdrop';
    const name = document.getElementById('gen-asset-name')?.value.trim();
    const description = document.getElementById('gen-asset-desc')?.value.trim() || '';
    const targetTheme = document.getElementById('gen-target-theme')?.value || 'master';
    const gender = document.getElementById('gen-clothes-gender')?.value || 'unisex';
    const btn = document.getElementById('gen-accept-btn');
    const statusMsg = document.getElementById('gen-status-msg');

    const origText = btn.innerHTML;
    btn.innerHTML = '💾 Saving to Asset Library...';
    btn.disabled = true;

    const cleanPrompt = studio.lastGenResult?.middle_prompt ||
                        document.getElementById('gen-middle-prompt')?.value.trim() ||
                        studio.lastGenResult?.full_prompt || '';

    try {
        const res = await fetch('/api/admin/asset-generator/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                preview_filename: studio.lastGenResult.preview_filename,
                type: type,
                name: name,
                description: description,
                target_theme: targetTheme,
                prompt_desc: cleanPrompt,
                gender: gender
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to save asset');
        }

        const data = await res.json();
        showToast(`✅ Saved as "${data.filename}" and added to Asset Library!`, 'success');

        if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
            statusMsg.style.border = '1px solid #10b981';
            statusMsg.style.color = '#34d399';
            statusMsg.innerHTML = `
                <strong>Saved Successfully!</strong><br>
                File: <code>${data.filename}</code><br>
                Description: <em>${description || '(auto-extracted)'}</em><br>
                Library: <strong>Asset Library (Shared across all themes)</strong>
            `;
        }

        // Refresh master assets so it's instantly pickable
        await loadMasterAssets();

        // Clear the desc field ready for next generation
        const descInput = document.getElementById('gen-asset-desc');
        if (descInput) descInput.value = '';

    } catch (err) {
        showToast('Save error: ' + err.message, 'error');
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
};

// Auto-extract short description from the middle prompt
window.autoFillShortDesc = function (silent = false) {
    const middlePrompt = document.getElementById('gen-middle-prompt')?.value.trim() || '';
    const descInput = document.getElementById('gen-asset-desc');
    if (!descInput || !middlePrompt) return;

    // Clean up the prompt to a punchy description
    let clean = middlePrompt
        .replace(/^(A |An |The )/i, '')
        .split(/[.;\n]/)[0]
        .trim();
    const words = clean.split(/\s+/);
    if (words.length > 12) clean = words.slice(0, 12).join(' ');
    descInput.value = clean;
    if (!silent) showToast('Short description auto-extracted!', 'success');
};

// ==========================================================================
// 8. Advanced Theme Studio & GenAI Systematic Prompt Assistant
// ==========================================================================
const ATMOSPHERE_PRESETS = {
    cny: {
        concept: "Lunar New Year Prosperity & Spring Festival",
        ornaments: "Swaying red silk lanterns with golden tassels at top corners",
        particles: "🧧, 🍍, 🍊, 🧨, 💰",
        phrases: "Huat Ah!, 新年快乐, 万事如意, 发",
        texture: "Subtle traditional Chinese geometric fretwork / lattice pattern overlay",
        json: JSON.stringify({
            slug: "cny_festive_2026",
            title: "Lunar New Year Prosperity",
            subtitle: "Year of the Horse Celebration",
            badge: "Lunar Special",
            icon: "🏮",
            cta: "Begin Celebration",
            description: "Step into an auspicious Lunar New Year portrait transformation with traditional imperial and modern festive aesthetics.",
            style: {
                fontFamily: "'Outfit', sans-serif",
                googleFontUrl: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=Ma+Shan+Zheng&display=swap",
                colors: {
                    background: "#0c0d14",
                    text: "#ffffff",
                    primary: "#181926",
                    accent: "#e11d48",
                    accentGlow: "rgba(225, 29, 72, 0.35)",
                    surface: "rgba(255, 255, 255, 0.05)",
                    surfaceBorder: "rgba(225, 29, 72, 0.3)"
                }
            },
            waitingExperience: {
                title: "Summoning Prosperity...",
                subtitle: "Manifesting your festive Lunar New Year portrait",
                sequence: [
                    { text: "Welcoming prosperity and auspicious energy...", delay: 500, color: "#ffd700" },
                    { text: "Crafting festive silk embroidery and jade textures...", delay: 3500, color: "#ffffff" },
                    { text: "Infusing radiant golden aura and lantern glow...", delay: 7000, color: "#e11d48" },
                    { text: "Harmonizing studio lighting with celestial blessings...", delay: 10500, color: "#ffd700" },
                    { text: "Huat Ah! Manifestation complete! Preparing reveal...", delay: 14000, color: "#ffffff" }
                ],
                completionMessage: "Huat Ah! Ready to celebrate."
            }
        }, null, 2),
        html: `<!-- CNY Dynamic Atmosphere Decorations -->
<!-- Imperial Top Archway -->
<div class="thematic-top-arch">
    <div class="arch-crest">✦ 新年快乐 • GONG XI FA CAI ✦</div>
</div>

<!-- Auspicious Chinese Couplet Banners -->
<div class="thematic-side-banner banner-left">
    <div class="banner-crest">🏮</div>
    <div class="banner-content">
        <span class="banner-char">恭</span>
        <span class="banner-char">喜</span>
        <span class="banner-char">发</span>
        <span class="banner-char">财</span>
    </div>
    <div class="banner-tassel">🧧</div>
</div>
<div class="thematic-side-banner banner-right">
    <div class="banner-crest">🏮</div>
    <div class="banner-content">
        <span class="banner-char">万</span>
        <span class="banner-char">事</span>
        <span class="banner-char">如</span>
        <span class="banner-char">意</span>
    </div>
    <div class="banner-tassel">🧧</div>
</div>

<!-- Corner Swaying Lanterns -->
<div class="custom-ornament ornament-left">🏮</div>
<div class="custom-ornament ornament-right">🏮</div>

<!-- Floating Celebratory Huat Particles -->
<div class="custom-particle p-1"><span>🧧</span><label>Huat Ah!</label></div>
<div class="custom-particle p-2"><span>🍊</span><label>发</label></div>
<div class="custom-particle p-3"><span>💰</span><label>Huat Ah!</label></div>
<div class="custom-particle p-4"><span>🧨</span><label>发</label></div>
<div class="custom-particle p-5"><span>🍍</span><label>Huat Ah!</label></div>`,
        css: `/* CNY Dynamic Atmosphere Styles */
.persistent-decorations { position: fixed; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }

/* Top Imperial Arch */
.thematic-top-arch {
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    width: 72%; max-width: 820px; height: 75px;
    background: radial-gradient(ellipse at top, rgba(225, 29, 72, 0.35) 0%, transparent 75%);
    border-bottom: 2px solid #ffd700; border-radius: 0 0 50% 50%;
    box-shadow: 0 10px 30px rgba(225, 29, 72, 0.3);
    display: flex; justify-content: center; align-items: flex-end; padding-bottom: 10px;
    pointer-events: none; z-index: 10;
}
.arch-crest {
    font-size: 0.85rem; font-weight: 800; letter-spacing: 2px;
    color: #ffd700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
}

/* Vertical Couplet Banners */
.thematic-side-banner {
    position: fixed; top: 50%; transform: translateY(-50%);
    width: 64px; padding: 18px 0; border-radius: 8px;
    background: linear-gradient(180deg, #8b0000 0%, #d32f2f 50%, #8b0000 100%);
    border: 2px solid #ffd700;
    box-shadow: 0 0 22px rgba(255, 215, 0, 0.4), inset 0 0 10px rgba(0, 0, 0, 0.6);
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    z-index: 10; pointer-events: none;
    animation: bannerBreathe 4s ease-in-out infinite alternate;
}
.banner-left { left: 24px; }
.banner-right { right: 24px; }
.banner-crest, .banner-tassel { font-size: 1.2rem; }
.banner-content { display: flex; flex-direction: column; gap: 10px; align-items: center; }
.banner-char {
    font-family: 'Ma Shan Zheng', 'Noto Serif SC', serif;
    font-size: 1.8rem; font-weight: 800; color: #ffd700;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8), 0 0 12px rgba(255, 215, 0, 0.7);
    line-height: 1;
}
@keyframes bannerBreathe {
    0% { transform: translateY(-50%) scale(0.98); box-shadow: 0 0 15px rgba(255, 215, 0, 0.3); }
    100% { transform: translateY(-50%) scale(1.02); box-shadow: 0 0 28px rgba(255, 215, 0, 0.6); }
}
@media (max-width: 900px) { .thematic-side-banner { display: none; } }

/* Corner Swaying Lanterns */
.custom-ornament {
    position: absolute; top: -10px; font-size: 3.5rem;
    filter: drop-shadow(0 8px 16px rgba(255, 60, 60, 0.4));
    transform-origin: top center; animation: cnySwing 3.5s ease-in-out infinite alternate;
    pointer-events: none; z-index: 11;
}
.ornament-left { left: 24px; }
.ornament-right { right: 24px; animation-delay: -1.7s; }
@keyframes cnySwing { 0% { transform: rotate(-8deg); } 100% { transform: rotate(8deg); } }

/* Floating Huat Particles */
.custom-particle {
    position: absolute; display: flex; flex-direction: column; align-items: center;
    bottom: -80px; font-size: 2rem; animation: floatUpward 9s linear infinite; pointer-events: none;
}
.custom-particle label {
    font-size: 0.75rem; font-weight: 800; color: #ffd700;
    text-shadow: 0 0 8px rgba(255, 215, 0, 0.8); margin-top: 4px;
}
.p-1 { left: 10%; animation-delay: 0s; }
.p-2 { left: 30%; animation-delay: 2s; font-size: 2.4rem; }
.p-3 { left: 55%; animation-delay: 4.5s; }
.p-4 { left: 75%; animation-delay: 1.2s; font-size: 1.8rem; }
.p-5 { left: 88%; animation-delay: 6s; }
@keyframes floatUpward {
    0% { transform: translateY(0) rotate(0deg); opacity: 0; }
    15% { opacity: 0.9; }
    85% { opacity: 0.9; }
    100% { transform: translateY(-110vh) rotate(360deg); opacity: 0; }
}`
    },
    hariraya: {
        concept: "Hari Raya Aidilfitri Warmth & Forgiveness",
        ornaments: "Woven emerald green ketupat decorations swaying at top corners with golden crescent",
        particles: "🌙, 🕌, ⭐, ✨",
        phrases: "Selamat Hari Raya, Syawal!, Maaf Zahir & Batin",
        texture: "Islamic arabesque geometric star pattern overlay",
        json: JSON.stringify({
            slug: "hari_raya_syawal",
            title: "Hari Raya Aidilfitri",
            subtitle: "Syawal Festive Celebration",
            badge: "Hari Raya Edition",
            icon: "🌙",
            cta: "Mula Pengalaman",
            description: "Celebrate the warmth of Hari Raya with bespoke traditional Songket and Baju Melayu digital transformations.",
            style: {
                fontFamily: "'Outfit', sans-serif",
                googleFontUrl: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap",
                colors: {
                    background: "#081611",
                    text: "#ffffff",
                    primary: "#064e3b",
                    accent: "#10b981",
                    accentGlow: "rgba(16, 185, 129, 0.35)",
                    surface: "rgba(255, 255, 255, 0.05)",
                    surfaceBorder: "rgba(16, 185, 129, 0.3)"
                }
            },
            waitingExperience: {
                title: "Mencipta Keajaiban...",
                subtitle: "Menyediakan potret Hari Raya anda",
                sequence: [
                    { text: "Menyambut kedatangan Syawal yang mulia...", delay: 500, color: "#34d399" },
                    { text: "Menenun tekstur songket dan kilauan benang emas...", delay: 3500, color: "#ffffff" },
                    { text: "Menyinari pencahayaan pelita dan bulan sabit...", delay: 7000, color: "#10b981" },
                    { text: "Menyempurnakan perincian busana tradisional...", delay: 10500, color: "#34d399" },
                    { text: "Selamat Hari Raya! Potret bersedia untuk ditatap...", delay: 14000, color: "#ffffff" }
                ],
                completionMessage: "Selamat Hari Raya Aidilfitri!"
            }
        }, null, 2),
        html: `<!-- Hari Raya Dynamic Atmosphere -->
<!-- Top Mosque Crescent Archway -->
<div class="thematic-top-arch">
    <div class="arch-crest">🌙 SELAMAT HARI RAYA AIDILFITRI 🌙</div>
</div>

<!-- Songket Emerald Banners -->
<div class="thematic-side-banner banner-left">
    <div class="banner-crest">⭐</div>
    <div class="banner-content">
        <span class="banner-char">S</span>
        <span class="banner-char">Y</span>
        <span class="banner-char">A</span>
        <span class="banner-char">W</span>
        <span class="banner-char">A</span>
        <span class="banner-char">L</span>
    </div>
    <div class="banner-tassel">🌿</div>
</div>
<div class="thematic-side-banner banner-right">
    <div class="banner-crest">⭐</div>
    <div class="banner-content">
        <span class="banner-char">B</span>
        <span class="banner-char">A</span>
        <span class="banner-char">T</span>
        <span class="banner-char">I</span>
        <span class="banner-char">N</span>
    </div>
    <div class="banner-tassel">🌿</div>
</div>

<!-- Corner Swaying Ketupat Ornaments -->
<div class="custom-ornament ornament-left">🌿</div>
<div class="custom-ornament ornament-right">🌿</div>

<!-- Floating Raya Particles -->
<div class="custom-particle p-1"><span>🌙</span><label>Syawal!</label></div>
<div class="custom-particle p-2"><span>🕌</span><label>Raya</label></div>
<div class="custom-particle p-3"><span>⭐</span><label>Maaf</label></div>
<div class="custom-particle p-4"><span>✨</span><label>Zahir & Batin</label></div>`,
        css: `/* Hari Raya Atmosphere Styles */
.persistent-decorations { position: fixed; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }

/* Top Mosque Arch */
.thematic-top-arch {
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    width: 72%; max-width: 820px; height: 80px;
    background: radial-gradient(ellipse at top, rgba(16, 185, 129, 0.3) 0%, transparent 75%);
    border-bottom: 2px solid #34d399; border-radius: 0 0 50% 50%;
    box-shadow: 0 10px 30px rgba(16, 185, 129, 0.25);
    display: flex; justify-content: center; align-items: flex-end; padding-bottom: 10px;
    pointer-events: none; z-index: 10;
}
.arch-crest {
    font-size: 0.85rem; font-weight: 800; letter-spacing: 2px;
    color: #34d399; text-shadow: 0 0 10px rgba(52, 211, 153, 0.8);
}

/* Vertical Songket Banners */
.thematic-side-banner {
    position: fixed; top: 50%; transform: translateY(-50%);
    width: 60px; padding: 18px 0; border-radius: 8px;
    background: linear-gradient(180deg, #064e3b 0%, #047857 50%, #064e3b 100%);
    border: 2px solid #34d399;
    box-shadow: 0 0 20px rgba(52, 211, 153, 0.35), inset 0 0 8px rgba(0, 0, 0, 0.6);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    z-index: 10; pointer-events: none;
    animation: bannerBreathe 4s ease-in-out infinite alternate;
}
.banner-left { left: 24px; }
.banner-right { right: 24px; }
.banner-crest, .banner-tassel { font-size: 1.1rem; }
.banner-content { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.banner-char {
    font-size: 1.3rem; font-weight: 800; color: #34d399;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(52, 211, 153, 0.7);
    line-height: 1;
}
@keyframes bannerBreathe {
    0% { transform: translateY(-50%) scale(0.98); }
    100% { transform: translateY(-50%) scale(1.02); }
}
@media (max-width: 900px) { .thematic-side-banner { display: none; } }

/* Corner Ketupats */
.custom-ornament {
    position: absolute; top: -10px; font-size: 3.5rem;
    filter: drop-shadow(0 8px 16px rgba(16, 185, 129, 0.4));
    transform-origin: top center; animation: rayaSwing 4s ease-in-out infinite alternate;
    pointer-events: none; z-index: 11;
}
.ornament-left { left: 24px; }
.ornament-right { right: 24px; animation-delay: -2s; }
@keyframes rayaSwing { 0% { transform: rotate(-7deg); } 100% { transform: rotate(7deg); } }

/* Floating Particles */
.custom-particle {
    position: absolute; display: flex; flex-direction: column; align-items: center;
    bottom: -80px; font-size: 2rem; animation: floatUpward 10s linear infinite; pointer-events: none;
}
.custom-particle label {
    font-size: 0.75rem; font-weight: 700; color: #34d399;
    text-shadow: 0 0 8px rgba(52, 211, 153, 0.8); margin-top: 4px;
}
.p-1 { left: 15%; animation-delay: 0s; }
.p-2 { left: 40%; animation-delay: 3s; font-size: 2.2rem; }
.p-3 { left: 65%; animation-delay: 1.5s; }
.p-4 { left: 85%; animation-delay: 5s; }
@keyframes floatUpward {
    0% { transform: translateY(0) scale(0.8); opacity: 0; }
    15% { opacity: 0.9; }
    85% { opacity: 0.9; }
    100% { transform: translateY(-110vh) scale(1.1); opacity: 0; }
}`
    },
    cyberpunk: {
        concept: "Cyberpunk Future Gala & Holographic Matrix",
        ornaments: "Futuristic neon cybernetic crests with pulsing edge lighting",
        particles: "⚡, 💠, 🔮, ✦",
        phrases: "SYSTEM READY, 4D VISION, CYBER GALA",
        texture: "Subtle digital scanline and holographic matrix grid",
        json: JSON.stringify({
            slug: "cyberpunk_nexus_2026",
            title: "Cyberpunk Nexus Gala",
            subtitle: "Neon Nexus Interactive",
            badge: "Cyber Gala",
            icon: "💠",
            cta: "Initialize Uplink",
            description: "Immerse yourself into a futuristic high-tech universe with cyberpunk augmented apparel, neon trims, and cybernetic glows.",
            style: {
                fontFamily: "'Outfit', sans-serif",
                googleFontUrl: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap",
                colors: {
                    background: "#050714",
                    text: "#ffffff",
                    primary: "#111827",
                    accent: "#6366f1",
                    accentGlow: "rgba(99, 102, 241, 0.4)",
                    surface: "rgba(255, 255, 255, 0.05)",
                    surfaceBorder: "rgba(99, 102, 241, 0.35)"
                }
            },
            waitingExperience: {
                title: "INITIALIZING MATRIX...",
                subtitle: "Synthesizing neural cybernetic portrait",
                sequence: [
                    { text: "Establishing quantum neural interface...", delay: 500, color: "#818cf8" },
                    { text: "Synthesizing carbon-fiber meshes and luminescent filaments...", delay: 3500, color: "#ffffff" },
                    { text: "Projecting holographic aura and cybernetic accents...", delay: 7000, color: "#6366f1" },
                    { text: "Calibrating neon shaders and raytracing buffers...", delay: 10500, color: "#a5b4fc" },
                    { text: "SYSTEM READY: Cyber portrait manifested...", delay: 14000, color: "#ffffff" }
                ],
                completionMessage: "UPLINK COMPLETE"
            }
        }, null, 2),
        html: `<!-- Cyberpunk Dynamic Atmosphere -->
<!-- Holographic Top Marquee -->
<div class="thematic-top-arch">
    <div class="arch-crest">⚡ CYBERNETIC MATRIX // UPLINK ONLINE ⚡</div>
</div>

<!-- Vertical Cyber HUD Banners -->
<div class="thematic-side-banner banner-left">
    <div class="banner-crest">💠</div>
    <div class="banner-content">
        <span class="banner-char">N</span>
        <span class="banner-char">E</span>
        <span class="banner-char">O</span>
        <span class="banner-char">N</span>
    </div>
    <div class="banner-tassel">⚡</div>
</div>
<div class="thematic-side-banner banner-right">
    <div class="banner-crest">💠</div>
    <div class="banner-content">
        <span class="banner-char">G</span>
        <span class="banner-char">A</span>
        <span class="banner-char">L</span>
        <span class="banner-char">A</span>
    </div>
    <div class="banner-tassel">⚡</div>
</div>

<!-- Corner Pulsing Cyber Ornaments -->
<div class="custom-ornament ornament-left">💠</div>
<div class="custom-ornament ornament-right">💠</div>

<!-- Floating Cyber Particles -->
<div class="custom-particle p-1"><span>⚡</span><label>SYSTEM ONLINE</label></div>
<div class="custom-particle p-2"><span>🔮</span><label>4D VISION</label></div>
<div class="custom-particle p-3"><span>✦</span><label>MANIFEST</label></div>
<div class="custom-particle p-4"><span>⚡</span><label>CYBER STUDIO</label></div>`,
        css: `/* Cyberpunk Atmosphere Styles */
.persistent-decorations { position: fixed; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }

/* Holographic Top Arch */
.thematic-top-arch {
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    width: 75%; max-width: 860px; height: 75px;
    background: radial-gradient(ellipse at top, rgba(99, 102, 241, 0.4) 0%, transparent 75%);
    border-bottom: 2px solid #818cf8; border-radius: 0 0 50% 50%;
    box-shadow: 0 10px 30px rgba(99, 102, 241, 0.35);
    display: flex; justify-content: center; align-items: flex-end; padding-bottom: 10px;
    pointer-events: none; z-index: 10;
}
.arch-crest {
    font-size: 0.8rem; font-family: monospace; font-weight: 800; letter-spacing: 2px;
    color: #a5b4fc; text-shadow: 0 0 10px rgba(99, 102, 241, 0.9);
}

/* Vertical Cyber Banners */
.thematic-side-banner {
    position: fixed; top: 50%; transform: translateY(-50%);
    width: 58px; padding: 16px 0; border-radius: 8px;
    background: rgba(10, 15, 35, 0.85); backdrop-filter: blur(8px);
    border: 2px solid #6366f1;
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.4), inset 0 0 12px rgba(99, 102, 241, 0.2);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    z-index: 10; pointer-events: none;
    animation: cyberPulse 2.5s ease-in-out infinite alternate;
}
.banner-left { left: 24px; }
.banner-right { right: 24px; }
.banner-content { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.banner-char {
    font-family: monospace; font-size: 1.3rem; font-weight: 800; color: #818cf8;
    text-shadow: 0 0 10px #6366f1; line-height: 1;
}
@keyframes cyberPulse { 0% { transform: translateY(-50%) scale(0.98); } 100% { transform: translateY(-50%) scale(1.02); } }
@media (max-width: 900px) { .thematic-side-banner { display: none; } }

/* Corner Cyber Ornaments */
.custom-ornament {
    position: absolute; top: 10px; font-size: 3rem;
    filter: drop-shadow(0 0 16px #6366f1);
    animation: cyberPulse 2s ease-in-out infinite alternate; pointer-events: none; z-index: 11;
}
.ornament-left { left: 24px; }
.ornament-right { right: 24px; animation-delay: -1s; }

/* Floating Particles */
.custom-particle {
    position: absolute; display: flex; flex-direction: column; align-items: center;
    bottom: -80px; font-size: 2rem; animation: floatUpward 7s linear infinite; pointer-events: none;
}
.custom-particle label {
    font-size: 0.7rem; font-family: monospace; font-weight: 800; color: #a5b4fc;
    text-shadow: 0 0 8px #6366f1; letter-spacing: 1px; margin-top: 4px;
}
.p-1 { left: 16%; animation-delay: 0s; }
.p-2 { left: 42%; animation-delay: 2.2s; }
.p-3 { left: 68%; animation-delay: 1.1s; }
.p-4 { left: 88%; animation-delay: 4s; }
@keyframes floatUpward {
    0% { transform: translateY(0); opacity: 0; }
    15% { opacity: 0.9; }
    85% { opacity: 0.9; }
    100% { transform: translateY(-110vh); opacity: 0; }
}`
    },
    gala: {
        concept: "Grand Gala Ballroom & Red Carpet Elegance",
        ornaments: "Swaying crystal chandeliers with golden champagne radiance",
        particles: "✨, 🥂, 🍾, ✦, 👑",
        phrases: "NIGHT OF ELEGANCE, GRAND GALA, LUXURY & CELEBRATION",
        texture: "Subtle stardust and royal velvet gold dust overlay",
        json: JSON.stringify({
            slug: "grand_gala_2026",
            title: "Grand Gala Royale",
            subtitle: "Night of Elegance & Luxury",
            badge: "Gala Edition",
            icon: "✨",
            cta: "Enter Ballroom",
            description: "Step onto the red carpet for an evening of luxury, haute couture, tailored black-tie tuxedos, and shimmering gala gowns.",
            style: {
                fontFamily: "'Outfit', sans-serif",
                googleFontUrl: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=Playfair+Display:ital,wght@0,600;1,600&display=swap",
                colors: {
                    background: "#0a0a0f",
                    text: "#ffffff",
                    primary: "#14141e",
                    accent: "#d4af37",
                    accentGlow: "rgba(212, 175, 55, 0.35)",
                    surface: "rgba(255, 255, 255, 0.05)",
                    surfaceBorder: "rgba(212, 175, 55, 0.3)"
                }
            },
            waitingExperience: {
                title: "PREPARING HAUTE COUTURE...",
                subtitle: "Curating your red carpet portrait",
                sequence: [
                    { text: "Welcoming you to the Grand Ballroom...", delay: 500, color: "#d4af37" },
                    { text: "Tailoring black-tie silk lapels and shimmering gala fabric...", delay: 3500, color: "#ffffff" },
                    { text: "Illuminating crystal chandelier highlights and golden bokeh...", delay: 7000, color: "#d4af37" },
                    { text: "Fine-tuning studio flash and red-carpet radiance...", delay: 10500, color: "#ffffff" },
                    { text: "Haute couture masterpiece complete! Step forward...", delay: 14000, color: "#d4af37" }
                ],
                completionMessage: "Welcome to the Grand Gala!"
            }
        }, null, 2),
        html: `<!-- Grand Gala Dynamic Atmosphere -->
<!-- Gilded Ballroom Top Arch -->
<div class="thematic-top-arch">
    <div class="arch-crest">✦ GRAND GALA • NIGHT OF ELEGANCE ✦</div>
</div>

<!-- Royal Column Vertical Banners -->
<div class="thematic-side-banner banner-left">
    <div class="banner-crest">👑</div>
    <div class="banner-content">
        <span class="banner-char">G</span>
        <span class="banner-char">A</span>
        <span class="banner-char">L</span>
        <span class="banner-char">A</span>
    </div>
    <div class="banner-tassel">❖</div>
</div>
<div class="thematic-side-banner banner-right">
    <div class="banner-crest">👑</div>
    <div class="banner-content">
        <span class="banner-char">L</span>
        <span class="banner-char">U</span>
        <span class="banner-char">X</span>
        <span class="banner-char">E</span>
    </div>
    <div class="banner-tassel">❖</div>
</div>

<!-- Swaying Crystal Pendants -->
<div class="custom-ornament ornament-left">💎</div>
<div class="custom-ornament ornament-right">💎</div>

<!-- Floating Stardust & Champagne Particles -->
<div class="custom-particle p-1"><span>✨</span><label>ELEGANCE</label></div>
<div class="custom-particle p-2"><span>🍾</span><label>CELEBRATE</label></div>
<div class="custom-particle p-3"><span>🥂</span><label>RED CARPET</label></div>
<div class="custom-particle p-4"><span>✦</span><label>ROYALE</label></div>`,
        css: `/* Grand Gala Atmosphere Styles */
.persistent-decorations { position: fixed; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }

/* Gilded Top Arch */
.thematic-top-arch {
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    width: 72%; max-width: 840px; height: 80px;
    background: radial-gradient(ellipse at top, rgba(212, 175, 55, 0.3) 0%, transparent 75%);
    border-bottom: 2px solid #d4af37; border-radius: 0 0 50% 50%;
    box-shadow: 0 10px 30px rgba(212, 175, 55, 0.25);
    display: flex; justify-content: center; align-items: flex-end; padding-bottom: 10px;
    pointer-events: none; z-index: 10;
}
.arch-crest {
    font-size: 0.85rem; font-weight: 800; letter-spacing: 2px;
    color: #d4af37; text-shadow: 0 0 12px rgba(212, 175, 55, 0.7);
}

/* Vertical Column Banners */
.thematic-side-banner {
    position: fixed; top: 50%; transform: translateY(-50%);
    width: 62px; padding: 18px 0; border-radius: 8px;
    background: linear-gradient(180deg, #14141e 0%, #1f1f2e 50%, #14141e 100%);
    border: 2px solid #d4af37;
    box-shadow: 0 0 22px rgba(212, 175, 55, 0.35), inset 0 0 8px rgba(0, 0, 0, 0.7);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    z-index: 10; pointer-events: none;
    animation: bannerBreathe 4s ease-in-out infinite alternate;
}
.banner-left { left: 24px; }
.banner-right { right: 24px; }
.banner-crest, .banner-tassel { font-size: 1.1rem; color: #d4af37; }
.banner-content { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.banner-char {
    font-family: 'Playfair Display', serif;
    font-size: 1.4rem; font-weight: 800; color: #d4af37;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(212, 175, 55, 0.6);
    line-height: 1;
}
@keyframes bannerBreathe {
    0% { transform: translateY(-50%) scale(0.98); }
    100% { transform: translateY(-50%) scale(1.02); }
}
@media (max-width: 900px) { .thematic-side-banner { display: none; } }

/* Corner Swaying Crystals */
.custom-ornament {
    position: absolute; top: -10px; font-size: 3.2rem;
    filter: drop-shadow(0 8px 16px rgba(212, 175, 55, 0.45));
    transform-origin: top center; animation: galaSway 3.6s ease-in-out infinite alternate;
    pointer-events: none; z-index: 11;
}
.ornament-left { left: 24px; }
.ornament-right { right: 24px; animation-delay: -1.8s; }
@keyframes galaSway { 0% { transform: rotate(-6deg); } 100% { transform: rotate(6deg); } }

/* Floating Particles */
.custom-particle {
    position: absolute; display: flex; flex-direction: column; align-items: center;
    bottom: -80px; font-size: 2rem; animation: floatUpward 9s linear infinite; pointer-events: none;
}
.custom-particle label {
    font-size: 0.72rem; font-weight: 800; color: #fde047;
    text-shadow: 0 0 8px rgba(212, 175, 55, 0.8); margin-top: 4px; letter-spacing: 1px;
}
.p-1 { left: 14%; animation-delay: 0s; }
.p-2 { left: 38%; animation-delay: 2.8s; font-size: 2.2rem; }
.p-3 { left: 64%; animation-delay: 1.4s; }
.p-4 { left: 86%; animation-delay: 4.5s; font-size: 2rem; }
@keyframes floatUpward {
    0% { transform: translateY(0); opacity: 0; }
    15% { opacity: 0.9; }
    85% { opacity: 0.9; }
    100% { transform: translateY(-110vh); opacity: 0; }
}`
    }
};

window.applyAtmospherePreset = function (key) {
    if (key === 'custom') {
        const title = document.getElementById('inp-title')?.value || 'Custom Event';
        document.getElementById('adv-var-concept').value = `${title} Celebration`;
        document.getElementById('adv-var-ornaments').value = 'Festive corner ornaments';
        document.getElementById('adv-var-particles').value = '✨, ✦, ⭐, ✧';
        document.getElementById('adv-var-phrases').value = `${title}, Celebrate, Joy`;
        document.getElementById('adv-var-texture').value = 'Subtle radial glowing stardust overlay';
        window.updateFullSystematicGenAiPrompt();
        return;
    }
    const preset = ATMOSPHERE_PRESETS[key];
    if (!preset) return;
    if (document.getElementById('adv-var-concept')) document.getElementById('adv-var-concept').value = preset.concept || '';
    if (document.getElementById('adv-var-ornaments')) document.getElementById('adv-var-ornaments').value = preset.ornaments || '';
    if (document.getElementById('adv-var-particles')) document.getElementById('adv-var-particles').value = preset.particles || '';
    if (document.getElementById('adv-var-phrases')) document.getElementById('adv-var-phrases').value = preset.phrases || '';
    if (document.getElementById('adv-var-texture')) document.getElementById('adv-var-texture').value = preset.texture || '';
    
    window.updateFullSystematicGenAiPrompt();
    showToast(`Loaded ${key.toUpperCase()} preset variables!`, 'info');
};

// Two-way synchronization helpers
window.syncThemeBasicIdentity = function (field, val) {
    if (field === 'slug') {
        const el = document.getElementById('inp-slug-adv');
        if (el && el.value !== val) el.value = val;
        if (studio.activeTheme) {
            studio.activeTheme.slug = val;
            if (studio.activeTheme.isUnsavedDraft) {
                const draft = (studio.themes || []).find(t => t.isUnsavedDraft);
                if (draft) { draft.slug = val; renderThemeSidebar(); }
            }
        }
    } else if (field === 'title') {
        const el = document.getElementById('inp-title-adv');
        if (el && el.value !== val) el.value = val;
        const intentEl = document.getElementById('adv-theme-intent');
        if (intentEl && !intentEl.value && val !== 'New Event Photobooth' && val !== 'Untitled Theme ✨') {
            intentEl.value = val;
        }
        if (studio.activeTheme) {
            studio.activeTheme.title = val;
            if (studio.activeTheme.isUnsavedDraft) {
                const draft = (studio.themes || []).find(t => t.isUnsavedDraft);
                if (draft) { draft.title = val || 'Untitled Theme ✨'; renderThemeSidebar(); }
            }
        }
    } else if (field === 'subtitle') {
        const el = document.getElementById('inp-subtitle-adv');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'badge') {
        const el = document.getElementById('inp-badge-adv');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'cta') {
        const el = document.getElementById('inp-cta-adv');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'icon') {
        const el = document.getElementById('inp-icon-adv');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'description') {
        const el = document.getElementById('inp-desc-adv');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'filmStrip') {
        const el = document.getElementById('chk-film-strip-adv');
        if (el && el.checked !== val) el.checked = val;
    } else if (field === 'luckyNumber') {
        const el = document.getElementById('chk-lucky-number-adv');
        if (el && el.checked !== val) el.checked = val;
    } else if (field === 'genderFilter') {
        const el = document.getElementById('chk-gender-filter-adv');
        if (el && el.checked !== val) el.checked = val;
    }
    window.updateFullSystematicGenAiPrompt();
};

window.syncThemeAdvancedIdentity = function (field, val) {
    if (field === 'slug') {
        const el = document.getElementById('inp-slug');
        if (el && el.value !== val) el.value = val;
        if (studio.activeTheme) {
            studio.activeTheme.slug = val;
            if (studio.activeTheme.isUnsavedDraft) {
                const draft = (studio.themes || []).find(t => t.isUnsavedDraft);
                if (draft) { draft.slug = val; renderThemeSidebar(); }
            }
        }
    } else if (field === 'title') {
        const el = document.getElementById('inp-title');
        if (el && el.value !== val) el.value = val;
        const intentEl = document.getElementById('adv-theme-intent');
        if (intentEl && !intentEl.value && val !== 'New Event Photobooth' && val !== 'Untitled Theme ✨') {
            intentEl.value = val;
        }
        if (studio.activeTheme) {
            studio.activeTheme.title = val;
            if (studio.activeTheme.isUnsavedDraft) {
                const draft = (studio.themes || []).find(t => t.isUnsavedDraft);
                if (draft) { draft.title = val || 'Untitled Theme ✨'; renderThemeSidebar(); }
            }
        }
    } else if (field === 'subtitle') {
        const el = document.getElementById('inp-subtitle');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'badge') {
        const el = document.getElementById('inp-badge');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'cta') {
        const el = document.getElementById('inp-cta');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'icon') {
        const el = document.getElementById('inp-icon');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'description') {
        const el = document.getElementById('inp-desc');
        if (el && el.value !== val) el.value = val;
    } else if (field === 'filmStrip') {
        const el = document.getElementById('chk-film-strip');
        if (el && el.checked !== val) el.checked = val;
    } else if (field === 'luckyNumber') {
        const el = document.getElementById('chk-lucky-number');
        if (el && el.checked !== val) el.checked = val;
    } else if (field === 'genderFilter') {
        const el = document.getElementById('chk-gender-filter');
        if (el && el.checked !== val) el.checked = val;
    }
    window.updateFullSystematicGenAiPrompt();
};

// =========================================================================
// 4-LAYER COMPOSITIONAL THEME BUILDER ARCHITECTURE
// Layer 1: Structural Polymorphism (Dynamic DOM Manifest)
// Layer 2: Parameterized Motion & Physics Engine
// Layer 3: Atmospheric Lighting & Surface Textures
// Layer 4: User-Guided Creative Levers (Input Pipeline)
// =========================================================================

window.buildThemePrompt = function (userInput, creativeLevers = {}) {
    // 1. Natural Language Concept
    const rawConcept = typeof userInput === 'string' ? userInput.trim() : '';
    const conceptText = rawConcept || '{{USER_THEME_DESCRIPTION_OR_PROPOSE}}';

    // 2. Creative Levers (Layer 4)
    const densityVal = creativeLevers.density || '';
    const densityText = densityVal ? densityVal : 'Infer from concept (Default: Balanced)';

    const motionVal = creativeLevers.motion || '';
    const motionText = motionVal ? motionVal : 'Infer from concept (Default: Gentle Drift)';

    const lightingVal = creativeLevers.lighting || '';
    const lightingText = lightingVal ? lightingVal : 'Infer from concept (Default: Immersive Themed Lighting)';

    // Optional archetype and custom objects guidance if provided
    const archetypeVal = creativeLevers.archetype || '';
    const customObjectsVal = creativeLevers.customObjects || '';
    const bgCol = creativeLevers.background || document.getElementById('inp-color-bg')?.value || '#0a0a12';
    const accentCol = creativeLevers.accent || document.getElementById('inp-color-accent')?.value || '#6366f1';
    const primaryCol = creativeLevers.primary || document.getElementById('inp-color-primary')?.value || '#181926';

    let optionalDirectives = '';
    if (archetypeVal) {
        optionalDirectives += `\n• Suggested Architectural Archetype: ${archetypeVal}`;
    }
    if (customObjectsVal) {
        optionalDirectives += `\n• Key Bespoke Atmospheric Elements / Requested Objects: "${customObjectsVal}"`;
    }
    if (creativeLevers.filmStrip !== undefined) {
        optionalDirectives += `\n• Welcome Screen Rolling Film Strip: ${creativeLevers.filmStrip ? 'ENABLED' : 'DISABLED'}`;
    }

    return `You are an elite, award-winning Principal UI/UX Creative Director and Experiential Technologist specializing in luxury interactive touchscreen kiosks and immersive photobooth installations.

Your mission is to dynamically architect an entirely bespoke, structurally original interface configuration based on the user's creative concept.

--- INPUT SPECIFICATIONS ---
• Natural Language Concept: ${conceptText}
• Aesthetic Density: ${densityText}
• Motion Energy: ${motionText}
• Lighting Treatment: ${lightingText}${optionalDirectives}
• Target Screen: Interactive Touchscreen Kiosk (responsive for 9:16 portrait 1080x1920 kiosk as well as 16:9 landscape monitors).
• Interaction Safety: ALL ambient decorations MUST have "pointer-events: none" so they never block touch clicks on kiosk buttons. Keep the center 70% clear for user interactions.

--- ARCHITECTURAL FREEDOM & DIVERGENCE CONTRACT ---
1. BAN ON MONOLITHIC SKELETONS:
   Do NOT default to the exact same top arch tray and vertical scroll dowels. Invent an original structural layout that naturally belongs to this world (e.g., sci-fi HUD frames, gilded pediments, organic hanging flora, neon marquees, corner bracket brackets, or floor-anchored atmospheric pillars).
2. BESPOKE HTML MARKUP (BLOCK 2):
   Construct meaningful, custom semantic HTML tags and class names native to this theme concept (e.g., .arcade-neon-coin, .crystal-architrave, .lantern-flock, .cyber-hud-bracket).
3. BESPOKE PHYSICS & MOTION (BLOCK 3):
   Write custom CSS keyframes matching the object physics (flickering gas tubes, swaying textiles, floating micro-sparks, undulating auroras, or mechanical ticks).
4. COLOR & TYPOGRAPHY SYSTEM (BLOCK 1):
   Import a Google Font that accurately embodies the visual genre (Futuristic, Editorial Serif, Heritage Calligraphy, Geometric Display, or Grotesque).

--- REQUIRED OUTPUT FORMAT ---
Provide a short <design_thinking> architectural rationale (detailing chosen layout archetype, physics model, and lighting strategy), followed by EXACTLY THREE code blocks:

### BLOCK 1: theme_identity.json
\`\`\`json
{
  "slug": "url_safe_slug",
  "title": "Evocative Theme Display Title",
  "subtitle": "Short captivating subtitle or mood",
  "badge": "2-4 word theme-native badge (no generic 'Special/Limited Edition')",
  "icon": "Single representative emoji",
  "cta": "Start button label",
  "description": "2-sentence inspiring experience description.",
  "style": {
    "fontFamily": "'Chosen Font', sans-serif",
    "googleFontUrl": "https://fonts.googleapis.com/css2?family=...",
    "colors": {
      "background": "${bgCol}",
      "text": "#ffffff",
      "primary": "${primaryCol}",
      "accent": "${accentCol}",
      "accentGlow": "rgba(...)",
      "surface": "rgba(...)",
      "surfaceBorder": "rgba(...)"
    }
  },
  "waitingExperience": {
    "title": "Manifesting Atmosphere...",
    "subtitle": "Transforming your photo into a masterpiece",
    "sequence": [
      { "text": "Step 1: ...", "delay": 500, "color": "${accentCol}" },
      { "text": "Step 2: ...", "delay": 3500, "color": "#ffffff" },
      { "text": "Step 3: ...", "delay": 7000, "color": "${accentCol}" },
      { "text": "Step 4: ...", "delay": 10500, "color": "#ffffff" },
      { "text": "Step 5: ...", "delay": 14000, "color": "${accentCol}" }
    ],
    "completionMessage": "Ready!"
  }
}
\`\`\`

### BLOCK 2: decorations.html
\`\`\`html
<div class="persistent-decorations">
  <!-- Dynamic atmospheric layers, framing objects, and bespoke decorative elements created specifically for this concept -->
</div>
\`\`\`

### BLOCK 3: style.css
\`\`\`css
/* Scoped atmosphere variables, custom keyframe physics, and responsive rules */
:root {
  --bg-color: ${bgCol};
  --accent-color: ${accentCol};
  --primary-color: ${primaryCol};
}
.persistent-decorations {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
/* Bespoke layout coordinates, media queries, and fluid animation curves */
\`\`\`

Output ONLY the <design_thinking> block and the three labeled markdown code blocks.`;
};

// Atmosphere Only Prompt (Blocks 2 & 3) following the same 4-layer dynamic rules
window.buildAtmosphereOnlyPrompt = function (userInput, creativeLevers = {}) {
    const rawConcept = typeof userInput === 'string' ? userInput.trim() : '';
    const conceptText = rawConcept || 'Interactive Photobooth Atmosphere';
    const densityText = creativeLevers.density || 'Infer from concept (Default: Balanced)';
    const motionText = creativeLevers.motion || 'Infer from concept (Default: Gentle Drift)';
    const lightingText = creativeLevers.lighting || 'Infer from concept (Default: Immersive Themed Lighting)';
    const archetypeText = creativeLevers.archetype ? `\n• Suggested Architectural Archetype: ${creativeLevers.archetype}` : '';
    const customObjectsText = creativeLevers.customObjects ? `\n• Key Bespoke Atmospheric Elements / Requested Objects: "${creativeLevers.customObjects}"` : '';
    const bgCol = creativeLevers.background || document.getElementById('inp-color-bg')?.value || '#0a0a12';
    const accentCol = creativeLevers.accent || document.getElementById('inp-color-accent')?.value || '#6366f1';
    const primaryCol = creativeLevers.primary || document.getElementById('inp-color-primary')?.value || '#181926';

    return `You are an elite, award-winning Principal UI/UX Creative Director and Experiential Technologist specializing in luxury interactive touchscreen kiosks and immersive photobooth installations.

Your mission is to dynamically architect bespoke HTML atmospheric decorations (BLOCK 2) and physics-driven CSS styling & keyframes (BLOCK 3) for an interactive photobooth theme.

--- INPUT SPECIFICATIONS ---
• Natural Language Concept: ${conceptText}
• Aesthetic Density: ${densityText}
• Motion Energy: ${motionText}
• Lighting Treatment: ${lightingText}${archetypeText}${customObjectsText}
• Target Screen: Interactive Touchscreen Kiosk (responsive for 9:16 portrait 1080x1920 kiosk as well as 16:9 landscape monitors).
• Interaction Safety: ALL ambient decorations MUST have "pointer-events: none" so they never block touch clicks on kiosk buttons. Keep the center 70% clear for user interactions.

--- ARCHITECTURAL FREEDOM CONTRACT ---
1. BAN ON MONOLITHIC SKELETONS:
   Do NOT default to a fixed arch and side banners. Architect bespoke semantic markup native to this concept (e.g., cyber HUD brackets, neon signs, fluted pedestals, crystal cascades, floral borders, or floating runes).
2. BESPOKE PHYSICS & MOTION:
   Write custom CSS keyframes matching the object physics (flickers, marquee ticker, floating slow-drift, or organic pendulums).
3. LAYERED LIGHTING & TEXTURES:
   Apply scanlines, film grain, frosted glassmorphism, or multi-stop glow drop-shadows.

--- REQUIRED OUTPUT FORMAT ---
Provide a short <design_thinking> architectural rationale, followed by EXACTLY TWO code blocks:

### BLOCK 2: decorations.html
\`\`\`html
<div class="persistent-decorations">
  <!-- Dynamic atmospheric layers, framing objects, and bespoke decorative elements created specifically for this concept -->
</div>
\`\`\`

### BLOCK 3: style.css
\`\`\`css
:root {
  --bg-color: ${bgCol};
  --accent-color: ${accentCol};
  --primary-color: ${primaryCol};
}
.persistent-decorations {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
/* Bespoke layout coordinates, media queries, and fluid animation curves */
\`\`\`

Output ONLY the <design_thinking> block and the two labeled markdown code blocks.`;
};

// Generate the complete systematic GenAI prompt template using 4-Layer Dynamic Theme Builder
window.generateFullSystematicPromptText = function () {
    const userIntent = document.getElementById('adv-theme-intent')?.value.trim();
    const titleVal = document.getElementById('inp-title-adv')?.value.trim() 
                  || document.getElementById('inp-title')?.value.trim();
    const isCustomTitle = titleVal && titleVal !== 'New Event Photobooth' && titleVal !== 'Untitled Theme ✨';
    const concept = userIntent || (isCustomTitle ? titleVal : '');

    const density = document.getElementById('lever-density')?.value || '';
    const motion = document.getElementById('lever-motion')?.value || '';
    const lighting = document.getElementById('lever-lighting')?.value || '';
    const archetype = document.getElementById('lever-archetype')?.value || '';
    const customObjects = document.getElementById('adv-custom-objects')?.value.trim() || '';

    const filmStripChecked = Boolean(document.getElementById('chk-film-strip-adv')?.checked 
                                  || document.getElementById('chk-film-strip')?.checked);
    const bgCol = document.getElementById('inp-color-bg')?.value || '#0a0a12';
    const accentCol = document.getElementById('inp-color-accent')?.value || '#6366f1';
    const primaryCol = document.getElementById('inp-color-primary')?.value || '#181926';

    const levers = {
        density,
        motion,
        lighting,
        archetype,
        customObjects,
        filmStrip: filmStripChecked,
        background: bgCol,
        accent: accentCol,
        primary: primaryCol
    };

    return window.buildThemePrompt(concept, levers);
};

// Update live prompt preview box
window.updateFullSystematicGenAiPrompt = function () {
    const box = document.getElementById('adv-systematic-prompt-full');
    if (box) {
        box.value = window.generateFullSystematicPromptText();
    }
};

// Bulletproof clipboard copy helper with multi-tier fallback (works on HTTP, localhost, and all browsers)
window.copyTextToClipboard = async function (text, successMsg = '📋 Copied to clipboard!') {
    if (!text) return false;
    let copied = false;

    // Tier 1: Modern Async Clipboard API (works on HTTPS & localhost)
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
        } catch (err) {
            console.warn('navigator.clipboard.writeText failed, falling back:', err);
        }
    }

    // Tier 2: Dedicated DOM textarea fallback (works everywhere, including non-HTTPS HTTP IPs)
    if (!copied) {
        try {
            const tempEl = document.createElement('textarea');
            tempEl.value = text;
            tempEl.setAttribute('readonly', '');
            tempEl.style.position = 'fixed';
            tempEl.style.top = '0';
            tempEl.style.left = '0';
            tempEl.style.width = '2em';
            tempEl.style.height = '2em';
            tempEl.style.padding = '0';
            tempEl.style.border = 'none';
            tempEl.style.outline = 'none';
            tempEl.style.boxShadow = 'none';
            tempEl.style.background = 'transparent';
            tempEl.style.opacity = '0.01';
            tempEl.style.zIndex = '-1';
            document.body.appendChild(tempEl);
            tempEl.focus();
            tempEl.select();
            tempEl.setSelectionRange(0, tempEl.value.length);
            copied = document.execCommand('copy');
            document.body.removeChild(tempEl);
        } catch (err) {
            console.error('Fallback execCommand copy error:', err);
        }
    }

    // Tier 3: Sync & select visible prompt box so user can also press Ctrl+C if needed
    const promptBox = document.getElementById('adv-systematic-prompt-full');
    if (promptBox) {
        promptBox.value = text;
        try {
            promptBox.focus();
            promptBox.select();
            promptBox.setSelectionRange(0, promptBox.value.length);
        } catch (e) {}
    }

    if (copied) {
        showToast(successMsg, 'success');
        return true;
    } else {
        showToast('📋 Entire prompt selected! Press Ctrl+C / Cmd+C to copy.', 'info');
        return false;
    }
};

window.selectAllPromptText = function () {
    const box = document.getElementById('adv-systematic-prompt-full');
    if (box) {
        box.focus();
        box.select();
        box.setSelectionRange(0, box.value.length);
        window.copyTextToClipboard(box.value, '📋 Entire prompt selected & copied to clipboard!');
    }
};

window.copyCustomObjectGenAiPrompt = async function () {
    const userIntent = document.getElementById('adv-theme-intent')?.value.trim();
    const titleVal = document.getElementById('inp-title-adv')?.value.trim() 
                  || document.getElementById('inp-title')?.value.trim();
    const isCustomTitle = titleVal && titleVal !== 'New Event Photobooth' && titleVal !== 'Untitled Theme ✨';
    const concept = userIntent || (isCustomTitle ? titleVal : '');

    const density = document.getElementById('lever-density')?.value || '';
    const motion = document.getElementById('lever-motion')?.value || '';
    const lighting = document.getElementById('lever-lighting')?.value || '';
    const archetype = document.getElementById('lever-archetype')?.value || '';
    const customObjects = document.getElementById('adv-custom-objects')?.value.trim() || '';

    const levers = {
        density,
        motion,
        lighting,
        archetype,
        customObjects
    };

    const promptText = window.buildAtmosphereOnlyPrompt(concept, levers);
    
    // Display in prompt viewer immediately
    const box = document.getElementById('adv-systematic-prompt-full');
    if (box) {
        box.value = promptText;
    }

    await window.copyTextToClipboard(promptText, '🎨 Atmosphere Only GenAI Prompt copied! Paste into ChatGPT / Claude / Gemini.');
};

window.copyFullSystematicGenAiPrompt = async function () {
    let text = '';
    try {
        text = window.generateFullSystematicPromptText();
    } catch (e) {
        console.error('Error in generateFullSystematicPromptText:', e);
    }
    if (!text) {
        showToast('Please enter a theme concept first.', 'warning');
        return;
    }

    // Immediately reflect in the visible prompt box
    const box = document.getElementById('adv-systematic-prompt-full');
    if (box) {
        box.value = text;
    }

    const btn = document.getElementById('btn-copy-full-prompt');
    const originalHtml = btn ? btn.innerHTML : '';

    const copied = await window.copyTextToClipboard(text, '📋 GenAI Prompt Template copied! Paste into ChatGPT / Claude / Gemini.');

    if (btn && copied) {
        btn.innerHTML = '<span>✅</span> Copied to Clipboard!';
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btn.style.borderColor = '#059669';
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.style.background = '';
            btn.style.borderColor = '';
        }, 2200);
    }
};

function fallbackCopyPromptText(text) {
    window.copyTextToClipboard(text);
}


// Backward-compatible alias
window.copyGenAiAtmospherePrompt = window.copyFullSystematicGenAiPrompt;

window.addCustomObjectChip = function (objectText) {
    const inp = document.getElementById('adv-custom-objects');
    if (!inp) return;
    const current = inp.value.trim();
    if (current) {
        if (!current.toLowerCase().includes(objectText.toLowerCase())) {
            inp.value = current + ', ' + objectText;
        }
    } else {
        inp.value = objectText;
    }
    window.updateFullSystematicGenAiPrompt();
    showToast(`Added: ${objectText}`, 'info');
};

window.syncAtmospherePreset = function (elementKey, isChecked) {
    const advMap = {
        'banners': 'chk-dynamic-banners',
        'arch': 'chk-dynamic-arch',
        'ornaments': 'chk-dynamic-ornaments',
        'particles': 'chk-dynamic-particles'
    };
    if (advMap[elementKey]) {
        const advEl = document.getElementById(advMap[elementKey]);
        if (advEl) advEl.checked = isChecked;
    }
    window.updateFullSystematicGenAiPrompt();
};

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =========================================================================
// STUDIO NATURAL LANGUAGE EXAMPLES & INTERACTIVE GUIDE MODAL
// =========================================================================

window.applyNaturalLanguageExample = function (customObjDesc, themeConcept, exampleKey = null) {
    const objEl = document.getElementById('adv-custom-objects');
    const conceptEl = document.getElementById('adv-theme-intent');
    
    if (objEl) {
        objEl.value = customObjDesc;
        objEl.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
        objEl.style.borderColor = '#ec4899';
        objEl.style.boxShadow = '0 0 16px rgba(236, 72, 153, 0.4)';
        setTimeout(() => {
            objEl.style.borderColor = '';
            objEl.style.boxShadow = '';
        }, 1200);
    }
    
    if (conceptEl && themeConcept) {
        conceptEl.value = themeConcept;
    }

    // Set creative levers corresponding to the example archetype
    const exData = exampleKey ? STUDIO_INSPIRATION_DATA[exampleKey] : null;
    if (exData && exData.levers) {
        if (exData.levers.density) setValue('lever-density', exData.levers.density);
        if (exData.levers.motion) setValue('lever-motion', exData.levers.motion);
        if (exData.levers.lighting) setValue('lever-lighting', exData.levers.lighting);
        if (exData.levers.archetype) setValue('lever-archetype', exData.levers.archetype);
    }
    
    window.updateFullSystematicGenAiPrompt();
    window.closeStudioGuideModal();
    showToast(`✨ Example "${themeConcept || 'Custom'}" applied with 4-Layer Creative Levers!`, 'success');

    // Smooth scroll down to prompt box if on mobile/small screen
    const promptBox = document.getElementById('adv-systematic-prompt-full');
    if (promptBox && window.innerWidth < 1100) {
        promptBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.closeStudioGuideModal = function () {
    const modal = document.getElementById('studio-guide-modal');
    if (modal) modal.style.display = 'none';
};

const STUDIO_INSPIRATION_DATA = {
    cyberpunk: {
        title: '🕹️ Cyberpunk 80s Retro Arcade',
        badge: 'Archetype 1: Cyber / Arcade',
        intent: 'Cyberpunk Neo-Tokyo Retro Arcade',
        desc: "High-octane neon cyber arcade with corner HUD brackets, pulsing 'Insert Coin' marquee ticker along the bottom, scanline CRT overlay, and electrical glitch transitions.",
        levers: {
            density: 'Balanced',
            motion: 'Glitch & Pulse',
            lighting: 'Neon Glow',
            archetype: 'Cyber / Arcade / Sci-Fi'
        },
        tips: [
            { icon: '🎯', label: 'Layer 1: Structural Polymorphism', text: 'Corner HUD brackets + bottom scanning ticker rail. Leaves the center 70% completely clear for interactive pose and wardrobe cards.' },
            { icon: '🌊', label: 'Layer 2: Parameterized Motion', text: 'Electrical glitch pulsing (@keyframes neonGlitch) + smooth 60fps horizontal data ticker marquee (@keyframes hudTicker).' },
            { icon: '🎨', label: 'Layer 3: Atmospheric Lighting', text: 'Multi-layer cyan & hot-pink glow drop-shadows with subtle scanline CRT texture filter.' },
            { icon: '🛡️', label: 'Touch Interaction Safety', text: 'All ambient layers have pointer-events: none so touchscreen kiosk buttons are never blocked.' }
        ],
        codeSnippetHtml: `<!-- Persistent Custom Interface: Block 2 (decorations.html) -->
<div class="persistent-decorations">
  <div class="cyber-hud-bracket hud-top-left"></div>
  <div class="cyber-hud-bracket hud-top-right"></div>
  <div class="cyber-data-rail">
    <span class="ticker-text">★ SYSTEM READY ★ 60FPS SYNTHESIS ★ CHOOSE YOUR LOOK ★</span>
  </div>
  <div class="crt-scanline-overlay"></div>
</div>`,
        codeSnippetCss: `/* Scoped Keyframes & Atmospheric Styling: Block 3 (style.css) */
@keyframes neonGlitch {
  0%, 100% { opacity: 1; text-shadow: 0 0 12px #06b6d4, 0 0 25px #ec4899; }
  50% { opacity: 0.85; text-shadow: 0 0 6px #06b6d4; }
}
@keyframes hudTicker {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}`
    },
    gatsby: {
        title: '🍸 1920s Great Gatsby Roaring Gala',
        badge: 'Archetype 2: Royal Gala / Luxury',
        intent: '1920s Great Gatsby Roaring Gala',
        desc: "Art-deco gilded pediments, slender filigree geometric borders, swaying crystal prism chandeliers at top corners, and champagne bubble sparkle particles.",
        levers: {
            density: 'Balanced',
            motion: 'Gentle Drift',
            lighting: 'Specular Gold',
            archetype: 'Royal Gala / Luxury'
        },
        tips: [
            { icon: '🎯', label: 'Layer 1: Structural Polymorphism', text: 'Slender gold filigree perimeter borders and gilded architrave pediments framing the screen.' },
            { icon: '🌊', label: 'Layer 2: Parameterized Motion', text: 'Slow pendulum sway physics on crystal chandeliers (transform-origin: top center; @keyframes chandelierSway).' },
            { icon: '🎨', label: 'Layer 3: Atmospheric Lighting', text: 'Specular metallic gold linear gradients and champagne bubble sparkle particles drifting upward.' },
            { icon: '🛡️', label: 'Touch Interaction Safety', text: 'Floating champagne sparkles are strictly bounded to outer flanks to preserve touchscreen clarity.' }
        ],
        codeSnippetHtml: `<!-- Persistent Custom Interface: Block 2 (decorations.html) -->
<div class="persistent-decorations">
  <div class="gatsby-pediment-crest">✧ GALA EXTRAORDINAIRE ✧</div>
  <div class="gatsby-chandelier chandelier-left">✦ ❖ ✦</div>
  <div class="gatsby-chandelier chandelier-right">✦ ❖ ✦</div>
  <div class="gatsby-filigree-frame"></div>
  <div class="champagne-sparkle s-1">✨</div>
</div>`,
        codeSnippetCss: `/* Pendulum Sway & Rising Sparkles: Block 3 (style.css) */
@keyframes chandelierSway {
  0% { transform: rotate(-3.5deg); }
  100% { transform: rotate(3.5deg); }
}
@keyframes champagneRise {
  0% { transform: translateY(105vh) scale(0.8); opacity: 0; }
  50% { opacity: 0.8; }
  100% { transform: translateY(-5vh) scale(1.1); opacity: 0; }
}`
    },
    cultural: {
        title: '⛩️ Cultural & Heritage Festival',
        badge: 'Archetype 3: Cultural / Heritage',
        intent: 'Cultural & Heritage Celebration',
        desc: "Multi-tier architectural torii eaves, vertical calligraphy banners flanking outer screen bounds, and softly swaying paper lanterns under warm atmospheric lighting.",
        levers: {
            density: 'Balanced',
            motion: 'Gentle Drift',
            lighting: 'Subtle Matte',
            archetype: 'Cultural / Heritage'
        },
        tips: [
            { icon: '🎯', label: 'Layer 1: Structural Polymorphism', text: 'Multi-tier architectural eaves centered at top + swaying paper lanterns hung on side margins.' },
            { icon: '🌊', label: 'Layer 2: Parameterized Motion', text: 'Breeze physics simulation with cubic-bezier ease for swaying red paper chochin lanterns.' },
            { icon: '🎨', label: 'Layer 3: Atmospheric Lighting', text: 'Warm ambient glow, tactile cherrywood textures, and golden calligraphy subtitles.' },
            { icon: '🛡️', label: 'Touch Interaction Safety', text: 'Side margins automatically hide or collapse on narrow screens via responsive media queries.' }
        ],
        codeSnippetHtml: `<!-- Persistent Custom Interface: Block 2 (decorations.html) -->
<div class="persistent-decorations">
  <div class="heritage-torii-eaves"><span>✦ TRADITION & CELEBRATION ✦</span></div>
  <div class="swaying-lantern lantern-left">🏮</div>
  <div class="swaying-lantern lantern-right">🏮</div>
  <div class="falling-petal petal-1">🌸</div>
</div>`,
        codeSnippetCss: `/* Breeze Physics & Falling Petals: Block 3 (style.css) */
@keyframes lanternBreeze {
  0%, 100% { transform: rotate(-4deg); }
  50% { transform: rotate(4deg); }
}
@keyframes petalDrift {
  0% { transform: translateY(-30px) rotate(0deg); opacity: 0; }
  25% { opacity: 0.8; }
  100% { transform: translateY(105vh) rotate(360deg); opacity: 0; }
}`
    },
    vaporwave: {
        title: '📼 80s Retro Pop / Vaporwave',
        badge: 'Archetype 4: Retro Pop',
        intent: '80s Retro Pop Vaporwave Paradise',
        desc: "Isometric perspective grid floor, glowing neon palm silhouette at bottom-right, holographic cassette badge, and radiant sunset gradient aura.",
        levers: {
            density: 'Immersive Maximalist',
            motion: 'High Energy',
            lighting: 'Neon Glow',
            archetype: 'Retro Pop / Vaporwave'
        },
        tips: [
            { icon: '🎯', label: 'Layer 1: Structural Polymorphism', text: '3D perspective grid floor along bottom 15vh + floating neon palm and cassette badges.' },
            { icon: '🌊', label: 'Layer 2: Parameterized Motion', text: 'Endless horizon grid scroll (@keyframes gridHorizon) with pulsating neon palm glow.' },
            { icon: '🎨', label: 'Layer 3: Atmospheric Lighting', text: 'Sunset gradient backdrop (magenta to electric violet) with chromatic aberration shadows.' },
            { icon: '🛡️', label: 'Touch Interaction Safety', text: 'Floor horizon is anchored strictly below the interactive card zone.' }
        ],
        codeSnippetHtml: `<!-- Persistent Custom Interface: Block 2 (decorations.html) -->
<div class="persistent-decorations">
  <div class="vaporwave-grid-floor"></div>
  <div class="neon-palm-crest">🌴</div>
  <div class="floating-cassette">📼</div>
  <div class="synthwave-sun"></div>
</div>`,
        codeSnippetCss: `/* Grid Horizon Scroll: Block 3 (style.css) */
@keyframes gridHorizon {
  0% { background-position: 0 0; }
  100% { background-position: 0 40px; }
}`
    },
    fantasy: {
        title: '🌿 Enchanted Fairy Forest',
        badge: 'Archetype 5: Whimsical / Fantasy',
        intent: 'Enchanted Fairy Forest',
        desc: "Organic botanical vine borders, undulating celestial aurora ribbons across the top header, and gently drifting glowing fairy spore runes.",
        levers: {
            density: 'Immersive Maximalist',
            motion: 'Gentle Drift',
            lighting: 'Neon Glow',
            archetype: 'Whimsical / Fantasy'
        },
        tips: [
            { icon: '🎯', label: 'Layer 1: Structural Polymorphism', text: 'Organic flora borders hugging screen edges + celestial aurora ribbons flowing across the header.' },
            { icon: '🌊', label: 'Layer 2: Parameterized Motion', text: 'Undulating sinusoidal wave keyframes (@keyframes auroraWave) and buoyant micro-sparks.' },
            { icon: '🎨', label: 'Layer 3: Atmospheric Lighting', text: 'Bioluminescent emerald and ethereal violet radiance with frosted glass textures.' },
            { icon: '🛡️', label: 'Touch Interaction Safety', text: 'Vines and auroras are strictly perimeter-anchored, leaving center 70% clear.' }
        ],
        codeSnippetHtml: `<!-- Persistent Custom Interface: Block 2 (decorations.html) -->
<div class="persistent-decorations">
  <div class="aurora-ribbon-canopy"></div>
  <div class="botanical-vine-border border-left"></div>
  <div class="botanical-vine-border border-right"></div>
  <div class="fairy-spore spore-1">✨</div>
  <div class="fairy-spore spore-2">✦</div>
</div>`,
        codeSnippetCss: `/* Undulating Aurora Wave & Spore Float: Block 3 (style.css) */
@keyframes auroraWave {
  0% { transform: scaleX(1) translateY(0); filter: hue-rotate(0deg); }
  50% { transform: scaleX(1.08) translateY(6px); filter: hue-rotate(45deg); }
  100% { transform: scaleX(1) translateY(0); filter: hue-rotate(0deg); }
}`
    }
};

window.showExampleExplanationModal = function (exampleKey) {
    const data = STUDIO_INSPIRATION_DATA[exampleKey];
    if (!data) return;

    const modal = document.getElementById('studio-guide-modal');
    const titleEl = document.getElementById('studio-guide-modal-title');
    const iconEl = document.getElementById('studio-guide-modal-icon');
    const bodyEl = document.getElementById('studio-guide-modal-body');
    const footerEl = document.getElementById('studio-guide-modal-footer');
    if (!modal || !bodyEl) return;

    if (titleEl) titleEl.innerText = `${data.title} — How It Works`;
    if (iconEl) iconEl.innerText = 'ℹ️';

    let tipsHtml = data.tips.map(t => `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 0.65rem 0.85rem;">
            <div style="font-weight: 700; color: #a5b4fc; font-size: 0.78rem; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem;">
                <span>${t.icon}</span> ${t.label}
            </div>
            <div style="font-size: 0.76rem; color: #cbd5e1; line-height: 1.45;">${t.text}</div>
        </div>
    `).join('');

    bodyEl.innerHTML = `
        <div style="margin-bottom: 1.1rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px; padding: 0.85rem 1rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.3rem;">
                📋 The Natural Language Description Sent to GenAI:
            </div>
            <div style="font-size: 0.88rem; color: #fff; font-weight: 600; font-style: italic;">
                "${data.desc}"
            </div>
        </div>

        <div style="font-size: 0.82rem; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;">
            💡 Why This Design Works Perfectly for Touchscreen Kiosks:
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.6rem; margin-bottom: 1.2rem;">
            ${tipsHtml}
        </div>

        <div style="font-size: 0.82rem; font-weight: 700; color: #fde047; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.45rem;">
            🏗️ What the AI Builds Behind the Scenes (2 Code Blocks):
        </div>

        <div style="margin-bottom: 0.85rem;">
            <div style="font-size: 0.76rem; font-weight: 600; color: #94a3b8; margin-bottom: 0.25rem;">
                1. Semantic HTML Markup for <strong>Block 2 (decorations.html)</strong>:
            </div>
            <pre style="background: #07080f; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 0.75rem; font-family: monospace; font-size: 0.74rem; color: #a5b4fc; overflow-x: auto; margin: 0;">${escapeHtml(data.codeSnippetHtml)}</pre>
        </div>

        <div>
            <div style="font-size: 0.76rem; font-weight: 600; color: #94a3b8; margin-bottom: 0.25rem;">
                2. Keyframe Animations &amp; Coordinates for <strong>Block 3 (style.css)</strong>:
            </div>
            <pre style="background: #07080f; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 0.75rem; font-family: monospace; font-size: 0.74rem; color: #38bdf8; overflow-x: auto; margin: 0;">${escapeHtml(data.codeSnippetCss)}</pre>
        </div>
    `;

    if (footerEl) {
        footerEl.innerHTML = `
            <button type="button" class="admin-btn admin-btn-secondary" onclick="closeStudioGuideModal()">Close</button>
            <button type="button" class="admin-btn admin-btn-accent" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1.2rem; font-weight: 700;" onclick="applyNaturalLanguageExample('${data.desc.replace(/'/g, "\'")}', '${data.intent.replace(/'/g, "\'")}', '${exampleKey}')">
                <span>⚡</span> Apply This Example to Studio
            </button>
        `;
    }

    modal.style.display = 'flex';
};

window.showStudioWalkthroughModal = function () {
    const modal = document.getElementById('studio-guide-modal');
    const titleEl = document.getElementById('studio-guide-modal-title');
    const iconEl = document.getElementById('studio-guide-modal-icon');
    const bodyEl = document.getElementById('studio-guide-modal-body');
    const footerEl = document.getElementById('studio-guide-modal-footer');
    if (!modal || !bodyEl) return;

    if (titleEl) titleEl.innerText = '📖 Photobooth Theme Studio: Walkthrough & Prompting Rules';
    if (iconEl) iconEl.innerText = '🚀';

    bodyEl.innerHTML = `
        <div style="line-height: 1.6; color: #cbd5e1;">
            <p style="margin-bottom: 1rem; font-size: 0.92rem;">
                Theme Studio allows you to build complete, customized, animated photobooth themes in minutes using Generative AI (ChatGPT, Claude, or Gemini) without needing frontend engineering skills.
            </p>

            <!-- 4 Plain-English Prompting Rules -->
            <div style="margin-bottom: 1.4rem;">
                <div style="font-size: 0.82rem; font-weight: 700; color: #67e8f9; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.6rem;">
                    ✍️ 4 Plain-English Prompting Rules (No Coding Needed):
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.65rem;">
                    <div style="background: rgba(0,0,0,0.35); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 6px; padding: 0.7rem 0.85rem;">
                        <div style="font-weight: 700; color: #38bdf8; font-size: 0.78rem; margin-bottom: 0.25rem;">
                            🎯 Rule 1: Anchor to Outer Screen Margins
                        </div>
                        <div style="font-size: 0.74rem; color: #94a3b8; line-height: 1.45;">
                            Keep the center 80% clear for guest photos, pose cards & outfits! Anchor visual items to: <strong>Top Arch</strong>, <strong>Left/Right Margins</strong>, <strong>Corner Suspensions</strong>, or <strong>Bottom Ticker Bar</strong>.
                        </div>
                    </div>
                    <div style="background: rgba(0,0,0,0.35); border: 1px solid rgba(167, 139, 250, 0.25); border-radius: 6px; padding: 0.7rem 0.85rem;">
                        <div style="font-weight: 700; color: #a78bfa; font-size: 0.78rem; margin-bottom: 0.25rem;">
                            🌊 Rule 2: Describe Motion & Physics
                        </div>
                        <div style="font-size: 0.74rem; color: #94a3b8; line-height: 1.45;">
                            Describe how items move: <em>"swaying like a wind chime with pendulum physics"</em>, <em>"slow upward floating embers"</em>, <em>"neon pulsing flicker"</em>, or <em>"scrolling marquee ticker"</em>. AI translates this into 60fps CSS keyframes.
                        </div>
                    </div>
                    <div style="background: rgba(0,0,0,0.35); border: 1px solid rgba(250, 204, 21, 0.25); border-radius: 6px; padding: 0.7rem 0.85rem;">
                        <div style="font-weight: 700; color: #facc15; font-size: 0.78rem; margin-bottom: 0.25rem;">
                            🎨 Rule 3: Textures & Modern Aesthetics
                        </div>
                        <div style="font-size: 0.74rem; color: #94a3b8; line-height: 1.45;">
                            Use sensory keywords: <em>"frosted glass blur"</em>, <em>"hairline gold art-deco"</em>, <em>"embossed woodwork"</em>, <em>"cyberpunk scanlines"</em>, or <em>"glowing drop-shadows"</em>.
                        </div>
                    </div>
                    <div style="background: rgba(0,0,0,0.35); border: 1px solid rgba(74, 222, 128, 0.25); border-radius: 6px; padding: 0.7rem 0.85rem;">
                        <div style="font-weight: 700; color: #4ade80; font-size: 0.78rem; margin-bottom: 0.25rem;">
                            🛡️ Rule 4: Built-in Guest Touch Safety
                        </div>
                        <div style="font-size: 0.74rem; color: #94a3b8; line-height: 1.45;">
                            All generated atmosphere elements automatically use <code>pointer-events: none</code> and <code>z-index: 1</code> so guest taps on kiosk buttons and cards are always responsive.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Try Preset Elements Tip -->
            <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 8px; padding: 0.85rem 1.1rem; margin-bottom: 1.4rem;">
                <div style="font-weight: 700; color: #a5b4fc; font-size: 0.84rem; margin-bottom: 0.3rem; display: flex; align-items: center; gap: 0.4rem;">
                    <span>🎋</span> Tip: Try Preset Atmospheric Screen Elements
                </div>
                <div style="font-size: 0.78rem; color: #cbd5e1; line-height: 1.5;">
                    Under the custom objects box in the main screen, you can expand <strong>"Preset Atmospheric Screen Elements"</strong> to toggle vertical side banners, a top decorative arch, swaying corner ornaments, and floating celebratory particles.
                </div>
            </div>

            <!-- 4 Step Workflow -->
            <div style="font-size: 0.82rem; font-weight: 700; color: #fde047; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.6rem;">
                🚀 Complete 4-Step Studio Workflow:
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 1.2rem;">
                <!-- Step 1 -->
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px; padding: 0.85rem 1rem;">
                    <div style="font-weight: 700; color: #818cf8; font-size: 0.86rem; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span>💡</span> Step 1: Describe Your Vision or Pick an Inspiration
                    </div>
                    <div style="font-size: 0.78rem; color: #94a3b8; line-height: 1.45;">
                        Enter your theme concept or click any of the 4 inspiration examples. Mention any specific visual objects you'd like (e.g. <em>"neon sign"</em>, <em>"swaying lanterns"</em>, <em>"ticker tape"</em>). Or leave it blank and the AI will brainstorm an exciting concept!
                    </div>
                </div>

                <!-- Step 2 -->
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 0.85rem 1rem;">
                    <div style="font-weight: 700; color: #38bdf8; font-size: 0.86rem; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span>📋</span> Step 2: One-Click Copy the GenAI Prompt
                    </div>
                    <div style="font-size: 0.78rem; color: #94a3b8; line-height: 1.45;">
                        Click <strong>"Copy Full Theme Prompt"</strong> (for full themes) or <strong>"Copy Atmosphere Only Prompt"</strong> (just for decorations). Open ChatGPT, Claude, or Gemini in your browser and paste it.
                    </div>
                </div>

                <!-- Step 3 -->
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(250, 204, 21, 0.3); border-radius: 8px; padding: 0.85rem 1rem;">
                    <div style="font-weight: 700; color: #facc15; font-size: 0.86rem; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span>📥</span> Step 3: Paste Response (Smart Auto-Split Enabled)
                    </div>
                    <div style="font-size: 0.78rem; color: #94a3b8; line-height: 1.45;">
                        Paste the AI's response into Step 2 below. You can paste the entire multi-block text into the Block 1 box, and our intelligent parser will automatically distribute the HTML and CSS into Tabs 2 and 3!
                    </div>
                </div>

                <!-- Step 4 -->
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 8px; padding: 0.85rem 1rem;">
                    <div style="font-weight: 700; color: #4ade80; font-size: 0.86rem; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span>👁️</span> Step 4: Temporary Live Preview &amp; Safe Saving
                    </div>
                    <div style="font-size: 0.78rem; color: #94a3b8; line-height: 1.45;">
                        Click <strong>"Compile &amp; Live Preview"</strong> to launch an in-memory simulation. It runs entirely in temporary memory without touching disk or saving to the sidebar. When satisfied, click <strong>"Save Theme"</strong> to persist it permanently!
                    </div>
                </div>
            </div>
        </div>
    `;

    if (footerEl) {
        footerEl.innerHTML = `
            <button type="button" class="admin-btn admin-btn-secondary" onclick="closeStudioGuideModal()">Close Walkthrough</button>
            <button type="button" class="admin-btn admin-btn-accent" onclick="closeStudioGuideModal(); copyFullSystematicGenAiPrompt();" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1.2rem; font-weight: 700;">
                <span>📋</span> Copy Full Theme Prompt Now
            </button>
        `;
    }

    modal.style.display = 'flex';
};

let _autoApplyDebounceTimer = null;
window._lastAutoAppliedJson = '';

// =========================================================================
// MULTI-BLOCK PARSER & UNIFIED ALL-IN-ONE RESPONSE PARSER
// Extracts <design_thinking>, Block 1 JSON, Block 2 HTML, and Block 3 CSS
// =========================================================================

window.parseMultiBlockGenAiResponse = function (rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = rawText.trim();
    if (!text) return null;

    const result = {
        designThinking: '',
        json: '',
        config: null,
        html: '',
        css: ''
    };

    // 1. Extract <design_thinking>...</design_thinking>
    const dtMatch = text.match(/<design_thinking>([\s\S]*?)<\/design_thinking>/i);
    if (dtMatch && dtMatch[1]) {
        result.designThinking = dtMatch[1].trim();
    }

    // 2. Extract Block 1: theme_identity.json
    const b1Match = text.match(/(?:###\s*BLOCK\s*1[^\n]*\n)?```(?:json)?\s*([\s\S]*?)```/i);
    if (b1Match && b1Match[1]) {
        result.json = b1Match[1].trim();
    } else {
        const jsonFences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
        if (jsonFences.length > 0) {
            result.json = jsonFences[0][1].trim();
        } else {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                result.json = text.substring(firstBrace, lastBrace + 1).trim();
            }
        }
    }

    if (result.json) {
        result.config = parseJsonCandidate(result.json);
    }

    // 3. Extract Block 2: decorations.html
    const b2Match = text.match(/(?:###\s*BLOCK\s*2[^\n]*\n)?```(?:html|xml)\s*([\s\S]*?)```/i);
    if (b2Match && b2Match[1]) {
        result.html = b2Match[1].trim();
    } else {
        const htmlFences = [...text.matchAll(/```(?:html|xml)\s*([\s\S]*?)```/gi)];
        if (htmlFences.length > 0) {
            result.html = htmlFences[0][1].trim();
        } else {
            const decoMatch = text.match(/<div class=["']persistent-decorations["']>[\s\S]*?<\/div>/i);
            if (decoMatch) {
                result.html = decoMatch[0].trim();
            }
        }
    }

    // 4. Extract Block 3: style.css
    const b3Match = text.match(/(?:###\s*BLOCK\s*3[^\n]*\n)?```(?:css)\s*([\s\S]*?)```/i);
    if (b3Match && b3Match[1]) {
        result.css = b3Match[1].trim();
    } else {
        const cssFences = [...text.matchAll(/```(?:css)\s*([\s\S]*?)```/gi)];
        if (cssFences.length > 0) {
            result.css = cssFences[0][1].trim();
        }
    }

    return result;
};

function parseJsonCandidate(candidate) {
    if (!candidate) return null;
    let parsed = null;
    try {
        parsed = JSON.parse(candidate);
    } catch (e) {
        try {
            const cleaned = candidate.replace(/,\s*([\]}])/g, '$1');
            parsed = JSON.parse(cleaned);
        } catch (e2) {
            parsed = null;
        }
    }

    if (parsed && typeof parsed === 'object') {
        if (parsed.theme && typeof parsed.theme === 'object' && (parsed.theme.slug || parsed.theme.title)) {
            parsed = parsed.theme;
        } else if (parsed.theme_identity && typeof parsed.theme_identity === 'object') {
            parsed = parsed.theme_identity;
        } else if (parsed.Block1 && typeof parsed.Block1 === 'object') {
            parsed = parsed.Block1;
        } else if (parsed.block1 && typeof parsed.block1 === 'object') {
            parsed = parsed.block1;
        }
    }
    return parsed;
}

window.applyUnifiedAiText = function (rawText) {
    const parsed = window.parseMultiBlockGenAiResponse(rawText);
    if (!parsed) return false;

    let appliedCount = 0;

    // Design Thinking
    if (parsed.designThinking) {
        const dtBox = document.getElementById('adv-design-thinking-box');
        const dtContent = document.getElementById('adv-design-thinking-content');
        if (dtBox && dtContent) {
            dtContent.textContent = parsed.designThinking;
            dtBox.style.display = 'block';
            appliedCount++;
        }
    }

    // Block 1 JSON & Theme Config
    if (parsed.json && parsed.config) {
        const jsonEl = document.getElementById('adv-identity-json');
        if (jsonEl) jsonEl.value = parsed.json;
        window.applyConfigToThemeFields(parsed.config, false);
        appliedCount++;
    }

    // Block 2 HTML
    if (parsed.html) {
        const htmlEl = document.getElementById('adv-decorations-html');
        if (htmlEl) htmlEl.value = parsed.html;
        appliedCount++;
    }

    // Block 3 CSS
    if (parsed.css) {
        const cssEl = document.getElementById('adv-custom-css');
        if (cssEl) cssEl.value = parsed.css;
        appliedCount++;
    }

    return appliedCount > 0;
};

window.openUnifiedPasteModal = function () {
    const modal = document.getElementById('unified-paste-modal');
    const input = document.getElementById('inp-unified-ai-paste');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('open');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 120);
        }
    }
};

window.closeUnifiedPasteModal = function () {
    const modal = document.getElementById('unified-paste-modal');
    if (modal) {
        modal.classList.remove('open');
        modal.style.display = 'none';
    }
};

window.applyUnifiedAiPaste = function () {
    const input = document.getElementById('inp-unified-ai-paste');
    const text = input ? input.value.trim() : '';
    if (!text) {
        showToast('Please paste AI response text first!', 'warning');
        return;
    }
    const success = window.applyUnifiedAiText(text);
    if (success) {
        window.closeUnifiedPasteModal();
        showToast('✨ 4-Layer Dynamic Theme successfully parsed & populated into all tabs!', 'success');
    } else {
        showToast('Could not find recognizable code blocks. Please check formatting.', 'error');
    }
};

// Extract clean JSON from user pasted text (also auto-extracts HTML/CSS if full response pasted into Block 1 box)
function extractJsonFromText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    let text = rawText.trim();
    if (!text) return null;

    // Check if full multi-block response was pasted into Block 1 box
    if (text.includes('BLOCK 2') || text.includes('decorations.html') || text.includes('<design_thinking>') || text.includes('```html') || text.includes('```css')) {
        const parsed = window.parseMultiBlockGenAiResponse(text);
        if (parsed) {
            if (parsed.designThinking) {
                const dtBox = document.getElementById('adv-design-thinking-box');
                const dtContent = document.getElementById('adv-design-thinking-content');
                if (dtBox && dtContent) {
                    dtContent.textContent = parsed.designThinking;
                    dtBox.style.display = 'block';
                }
            }
            if (parsed.html) {
                const htmlEl = document.getElementById('adv-decorations-html');
                if (htmlEl) htmlEl.value = parsed.html;
            }
            if (parsed.css) {
                const cssEl = document.getElementById('adv-custom-css');
                if (cssEl) cssEl.value = parsed.css;
            }
            if (parsed.json) {
                const jsonEl = document.getElementById('adv-identity-json');
                if (jsonEl && jsonEl.value !== parsed.json) jsonEl.value = parsed.json;
            }
            if (parsed.config) return parsed.config;
        }
    }

    return parseJsonCandidate(text);
}

window.applyConfigToThemeFields = function (config, silent = true) {
    if (!config || typeof config !== 'object') return false;

    const t = studio.activeTheme || {};

    // 1. Slug
    const rawSlug = config.slug || config.theme_slug || config.id || '';
    if (rawSlug) {
        const cleanSlug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (cleanSlug) {
            t.slug = cleanSlug;
            setValue('inp-slug', cleanSlug);
            setValue('inp-slug-adv', cleanSlug);
        }
    }

    // 2. Title & Heading
    if (config.title) {
        t.title = config.title;
        setValue('inp-title', config.title);
        setValue('inp-title-adv', config.title);
        const heading = document.getElementById('current-theme-heading');
        if (heading) heading.textContent = (config.icon ? config.icon + ' ' : '✨ ') + config.title;
    }

    // 3. Subtitle, Badge, Icon, CTA, Description
    if (config.subtitle) {
        t.subtitle = config.subtitle;
        setValue('inp-subtitle', config.subtitle);
        setValue('inp-subtitle-adv', config.subtitle);
    }
    if (config.badge) {
        t.badge = config.badge;
        setValue('inp-badge', config.badge);
        setValue('inp-badge-adv', config.badge);
    }
    if (config.icon) {
        t.icon = config.icon;
        setValue('inp-icon', config.icon);
        setValue('inp-icon-adv', config.icon);
    }
    if (config.cta) {
        t.cta = config.cta;
        setValue('inp-cta', config.cta);
        setValue('inp-cta-adv', config.cta);
    }
    if (config.description) {
        t.description = config.description;
        setValue('inp-desc', config.description);
        setValue('inp-desc-adv', config.description);
    }

    // 4. Style: Typography & Colors
    if (config.style) {
        t.style = t.style || {};
        if (config.style.fontFamily) {
            t.style.fontFamily = config.style.fontFamily;
            setValue('inp-font', config.style.fontFamily);
        }
        if (config.style.googleFontUrl) {
            t.style.googleFontUrl = config.style.googleFontUrl;
            setValue('inp-google-font', config.style.googleFontUrl);
        }
        if (config.style.colors) {
            t.style.colors = Object.assign(t.style.colors || {}, config.style.colors);
            if (config.style.colors.background) setColor('inp-color-bg', config.style.colors.background);
            if (config.style.colors.accent) setColor('inp-color-accent', config.style.colors.accent);
            if (config.style.colors.text) setColor('inp-color-text', config.style.colors.text);
            if (config.style.colors.primary) setColor('inp-color-primary', config.style.colors.primary);
        }
    }

    // 5. Waiting Sequence
    const seq = config.waitingExperience?.sequence || config.waitingSequence || config.sequence;
    if (Array.isArray(seq) && seq.length > 0) {
        t.waitingExperience = t.waitingExperience || {};
        if (config.waitingExperience?.title) t.waitingExperience.title = config.waitingExperience.title;
        if (config.waitingExperience?.subtitle) t.waitingExperience.subtitle = config.waitingExperience.subtitle;
        if (config.waitingExperience?.completionMessage) t.waitingExperience.completionMessage = config.waitingExperience.completionMessage;
        t.waitingExperience.sequence = seq;
        renderWaitingSequenceList(seq);
    }

    // 6. Features
    if (config.features) {
        if (typeof config.features.filmStrip === 'boolean') {
            setChecked('chk-film-strip-adv', config.features.filmStrip);
            setChecked('chk-film-strip', config.features.filmStrip);
        }
        if (typeof config.features.luckyNumber === 'boolean') {
            setChecked('chk-lucky-number-adv', config.features.luckyNumber);
            setChecked('chk-lucky-number', config.features.luckyNumber);
        }
        if (typeof config.features.genderFilter === 'boolean') {
            setChecked('chk-gender-filter-adv', config.features.genderFilter);
            setChecked('chk-gender-filter', config.features.genderFilter);
        }
    }

    // 7. Update activeTheme & draft item in sidebar
    studio.activeTheme = t;
    const draftItem = (studio.themes || []).find(th => th.status === 'draft');
    if (draftItem) {
        if (t.slug) draftItem.slug = t.slug;
        if (t.title) draftItem.title = t.title;
        if (t.icon) draftItem.icon = t.icon;
        renderThemeSidebar();
    }

    // 8. Update UI sync badge
    const statusEl = document.getElementById('json-auto-status');
    if (statusEl) {
        statusEl.textContent = `✓ Auto-Synced: "${t.title || t.slug || 'Theme Details'}"`;
        statusEl.style.display = 'inline-flex';
    }

    // 9. Feedback Toast
    const displayLabel = t.title || t.slug || 'Theme Details';
    if (!silent) {
        showToast(`✨ Applied theme details, colors, and waiting sequence for "${displayLabel}"!`, 'success');
    } else {
        clearTimeout(_autoApplyDebounceTimer);
        _autoApplyDebounceTimer = setTimeout(() => {
            showToast(`✓ Auto-populated Theme Details from GenAI JSON: "${displayLabel}"`, 'info');
        }, 350);
    }

    if (typeof window.updateFullSystematicGenAiPrompt === 'function') {
        window.updateFullSystematicGenAiPrompt();
    }

    return true;
};

// Real-time automatic populator triggered upon user input or paste
window.autoApplyIdentityJsonOnInput = function (silent = true) {
    const textarea = document.getElementById('adv-identity-json');
    if (!textarea) return;
    const rawText = textarea.value.trim();
    if (!rawText) {
        const statusEl = document.getElementById('json-auto-status');
        if (statusEl) statusEl.style.display = 'none';
        return;
    }

    if (rawText === window._lastAutoAppliedJson) {
        if (!silent) {
            showToast('✨ Theme details already up to date from this JSON.', 'info');
        }
        return;
    }

    const config = extractJsonFromText(rawText);
    if (!config) {
        if (!silent) {
            showToast('Invalid JSON: Could not extract valid theme JSON. Please check formatting.', 'error');
        }
        return;
    }

    window._lastAutoAppliedJson = rawText;
    window.applyConfigToThemeFields(config, silent);
};

// Manual button trigger
window.applyIdentityJsonConfig = function () {
    window.autoApplyIdentityJsonOnInput(false);
};

window.switchAtmosphereEditorTab = function (tab) {
    const htmlCont = document.getElementById('editor-container-html');
    const cssCont = document.getElementById('editor-container-css');
    const jsonCont = document.getElementById('editor-container-json');
    const htmlBtn = document.getElementById('tab-btn-deco-html');
    const cssBtn = document.getElementById('tab-btn-deco-css');
    const jsonBtn = document.getElementById('tab-btn-deco-json');

    if (htmlCont) htmlCont.style.display = tab === 'html' ? 'block' : 'none';
    if (cssCont) cssCont.style.display = tab === 'css' ? 'block' : 'none';
    if (jsonCont) jsonCont.style.display = tab === 'json' ? 'block' : 'none';

    if (htmlBtn) htmlBtn.className = tab === 'html' ? 'admin-btn admin-btn-primary' : 'admin-btn admin-btn-secondary';
    if (cssBtn) cssBtn.className = tab === 'css' ? 'admin-btn admin-btn-primary' : 'admin-btn admin-btn-secondary';
    if (jsonBtn) jsonBtn.className = tab === 'json' ? 'admin-btn admin-btn-primary' : 'admin-btn admin-btn-secondary';
};

window.loadQuickAtmosphereTemplate = function (presetKey = 'cny') {
    const preset = ATMOSPHERE_PRESETS[presetKey] || ATMOSPHERE_PRESETS.cny;

    const htmlEl = document.getElementById('adv-decorations-html');
    const cssEl = document.getElementById('adv-custom-css');
    const jsonEl = document.getElementById('adv-identity-json');
    if (htmlEl) htmlEl.value = preset.html || '';
    if (cssEl) cssEl.value = preset.css || '';
    if (jsonEl && preset.json) {
        jsonEl.value = preset.json;
        if (typeof window.autoApplyIdentityJsonOnInput === 'function') {
            window.autoApplyIdentityJsonOnInput(true);
        }
    }

    showToast(`Loaded ${presetKey.toUpperCase()} dynamic sample template into editors!`, 'success');
};

window.clearAtmosphereEditors = function () {
    const htmlEl = document.getElementById('adv-decorations-html');
    const cssEl = document.getElementById('adv-custom-css');
    const jsonEl = document.getElementById('adv-identity-json');
    if (htmlEl) htmlEl.value = '';
    if (cssEl) cssEl.value = '';
    if (jsonEl) jsonEl.value = '';
    showToast('Atmosphere editors cleared.', 'info');
};

// 2-Option Mode Switcher: Basic vs Advanced
window.setThemeStudioMode = function (mode, userInitiated = true) {
    studio.currentThemeMode = mode;
    studio.currentAtmosphereMode = mode;

    const basicCard = document.getElementById('mode-card-basic');
    const advCard = document.getElementById('mode-card-advanced');
    const basicContainer = document.getElementById('container-mode-basic');
    const advContainer = document.getElementById('container-mode-advanced');
    const basicStatus = document.getElementById('status-text-basic');
    const advStatus = document.getElementById('status-text-advanced');

    if (mode === 'advanced') {
        if (basicCard) basicCard.classList.remove('active');
        if (advCard) advCard.classList.add('active');
        if (basicContainer) basicContainer.style.display = 'none';
        if (advContainer) advContainer.style.display = 'block';
        if (basicStatus) {
            basicStatus.textContent = 'Switch to Basic';
            basicStatus.style.color = 'var(--text-dim)';
        }
        if (advStatus) {
            advStatus.textContent = '● Active Studio';
            advStatus.style.color = '#34d399';
        }
        // Sync basic fields -> advanced
        const slug = document.getElementById('inp-slug')?.value || '';
        const title = document.getElementById('inp-title')?.value || '';
        const subtitle = document.getElementById('inp-subtitle')?.value || '';
        const badge = document.getElementById('inp-badge')?.value || '';
        const cta = document.getElementById('inp-cta')?.value || '';
        const icon = document.getElementById('inp-icon')?.value || '';
        const desc = document.getElementById('inp-desc')?.value || '';
        const film = document.getElementById('chk-film-strip')?.checked || false;
        const lucky = document.getElementById('chk-lucky-number')?.checked || false;
        const gender = document.getElementById('chk-gender-filter')?.checked !== false;

        if (slug) setValue('inp-slug-adv', slug);
        if (title) setValue('inp-title-adv', title);
        if (subtitle) setValue('inp-subtitle-adv', subtitle);
        if (badge) setValue('inp-badge-adv', badge);
        if (cta) setValue('inp-cta-adv', cta);
        if (icon) setValue('inp-icon-adv', icon);
        if (desc) setValue('inp-desc-adv', desc);
        setChecked('chk-film-strip-adv', film);
        setChecked('chk-lucky-number-adv', lucky);
        setChecked('chk-gender-filter-adv', gender);

        if (title && title !== 'New Event Photobooth' && title !== 'Untitled Theme ✨' && !document.getElementById('adv-theme-intent')?.value) {
            setValue('adv-theme-intent', title);
        }
        window.updateFullSystematicGenAiPrompt();
        if (userInitiated) {
            showToast('🏮 Advanced GenAI Studio activated', 'info');
        }
    } else {
        if (basicCard) basicCard.classList.add('active');
        if (advCard) advCard.classList.remove('active');
        if (basicContainer) basicContainer.style.display = 'block';
        if (advContainer) advContainer.style.display = 'none';
        if (basicStatus) {
            basicStatus.textContent = '● Active Builder';
            basicStatus.style.color = '#34d399';
        }
        if (advStatus) {
            advStatus.textContent = 'Click to build with GenAI';
            advStatus.style.color = 'var(--text-dim)';
        }
        // Sync advanced fields -> basic
        const slug = document.getElementById('inp-slug-adv')?.value || '';
        const title = document.getElementById('inp-title-adv')?.value || '';
        const subtitle = document.getElementById('inp-subtitle-adv')?.value || '';
        const badge = document.getElementById('inp-badge-adv')?.value || '';
        const cta = document.getElementById('inp-cta-adv')?.value || '';
        const icon = document.getElementById('inp-icon-adv')?.value || '';
        const desc = document.getElementById('inp-desc-adv')?.value || '';
        const film = document.getElementById('chk-film-strip-adv')?.checked || false;
        const lucky = document.getElementById('chk-lucky-number-adv')?.checked || false;
        const gender = document.getElementById('chk-gender-filter-adv')?.checked !== false;

        if (slug) setValue('inp-slug', slug);
        if (title) setValue('inp-title', title);
        if (subtitle) setValue('inp-subtitle', subtitle);
        if (badge) setValue('inp-badge', badge);
        if (cta) setValue('inp-cta', cta);
        if (icon) setValue('inp-icon', icon);
        if (desc) setValue('inp-desc', desc);
        setChecked('chk-film-strip', film);
        setChecked('chk-lucky-number', lucky);
        setChecked('chk-gender-filter', gender);

        if (userInitiated) {
            showToast('🌟 Basic Mode active', 'info');
        }
    }
};

window.setAtmosphereBuilderMode = window.setThemeStudioMode;

window.loadExistingAtmosphere = async function (slug) {
    try {
        const res = await fetch(`/api/admin/theme/${slug}/atmosphere`);
        if (res.ok) {
            const data = await res.json();
            const htmlEl = document.getElementById('adv-decorations-html');
            const cssEl = document.getElementById('adv-custom-css');
            if (htmlEl) htmlEl.value = data.decorations_html || '';
            if (cssEl) cssEl.value = data.custom_css || '';

            const hasCustomAtmosphere = (data.decorations_html && data.decorations_html.trim().length > 0) ||
                                       (data.custom_css && data.custom_css.trim().length > 0);
            if (studio.activeTheme?.atmosphereMode === 'advanced' || hasCustomAtmosphere) {
                window.setThemeStudioMode('advanced', false);
            } else {
                window.setThemeStudioMode('basic', false);
            }
        } else {
            window.setThemeStudioMode('basic', false);
        }
    } catch (e) {
        console.warn('[Studio] Failed loading atmosphere:', e);
        window.setThemeStudioMode('basic', false);
    }
};

window.saveAtmosphereDirectly = async function () {
    const theme = readFormFields();
    const slug = theme.slug || studio.activeTheme?.slug;
    if (!slug) {
        showToast('Please select or create a theme first.', 'error');
        return;
    }

    const htmlContent = document.getElementById('adv-decorations-html')?.value || '';
    const cssContent = document.getElementById('adv-custom-css')?.value || '';

    try {
        const res = await fetch(`/api/admin/theme/${slug}/atmosphere`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                decorations_html: htmlContent,
                custom_css: cssContent
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to save atmosphere');
        }

        showToast('💾 Atmosphere files (decorations.html & style.css) saved!', 'success');

        // If preview modal is open, reload the iframe
        const iframe = document.getElementById('atmosphere-preview-iframe');
        if (iframe && iframe.src) {
            iframe.src = `/${slug}?engine=universal&preview=atmosphere&t=${Date.now()}`;
        }
    } catch (err) {
        showToast('Save error: ' + err.message, 'error');
    }
};

window.openAtmospherePreviewModal = async function () {
    // 1. If user pasted JSON in Block 1 editor, ensure it is parsed and applied
    if (typeof window.autoApplyIdentityJsonOnInput === 'function') {
        window.autoApplyIdentityJsonOnInput(true);
    }

    // 2. Read latest inputs from the form / in-memory draft
    const theme = readFormFields();
    let slug = theme.slug || studio.activeTheme?.slug || 'preview_draft';
    slug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'preview_draft';
    theme.slug = slug;
    if (!theme.title) {
        theme.title = 'Untitled Draft ✨';
    }

    // 3. Read custom decorations HTML & custom CSS from editor tabs
    const decorations_html = document.getElementById('adv-decorations-html')?.value || '';
    const custom_css = document.getElementById('adv-custom-css')?.value || '';

    // 4. Build in-memory preview payload (DO NOT SAVE TO DISK OR DATABASE)
    const previewPayload = {
        theme: theme,
        data: studio.activeData || { clothes: [], poses: [], backgrounds: [] },
        decorations_html: decorations_html,
        custom_css: custom_css
    };

    try {
        sessionStorage.setItem('kiosk_live_preview_payload', JSON.stringify(previewPayload));
    } catch (e) {
        console.warn('Could not cache preview payload into sessionStorage:', e);
    }

    // 5. Open Live Preview modal pointing to Universal Engine in-memory preview
    const modal = document.getElementById('atmosphere-preview-modal');
    const iframe = document.getElementById('atmosphere-preview-iframe');
    if (modal && iframe) {
        iframe.src = `/preview_draft?engine=universal&preview=draft&t=${Date.now()}`;
        modal.style.display = 'flex';
        showToast(`👁️ Temporary live preview loaded for "${theme.title}"! (Not saved to disk)`, 'info');
    }
};

window.closeAtmospherePreviewModal = function () {
    const modal = document.getElementById('atmosphere-preview-modal');
    const iframe = document.getElementById('atmosphere-preview-iframe');
    if (modal) modal.style.display = 'none';
    if (iframe) iframe.src = '';

    // Clear temporary in-memory session payload
    try {
        sessionStorage.removeItem('kiosk_live_preview_payload');
    } catch (e) {}

    // Show clear reminder that this preview was not saved to disk
    showToast('ℹ️ Preview closed. Note: This preview was NOT saved. Click "Save Theme" on the left if you are happy with it, or edit your prompt to re-create it.', 'warning', 7000);
};

window.saveActiveTheme = saveAndPublishTheme;
window.saveDraftFromPreviewModal = async function () {
    await saveAndPublishTheme();
    const modal = document.getElementById('atmosphere-preview-modal');
    if (modal) modal.style.display = 'none';
    const iframe = document.getElementById('atmosphere-preview-iframe');
    if (iframe) iframe.src = '';
    try {
        sessionStorage.removeItem('kiosk_live_preview_payload');
    } catch (e) {}
    showToast('💾 Theme successfully saved to database & disk!', 'success');
};

