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
    activeTab: 'branding'
};

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initEventListeners();
    await loadThemes();
});

// ==========================================================================
// 1. Theme Loading & Sidebar
// ==========================================================================
async function loadThemes() {
    try {
        const res = await fetch('/api/themes');
        if (!res.ok) throw new Error('Failed to load themes');
        studio.themes = await res.json();

        renderThemeSidebar();
        if (studio.themes.length > 0) {
            selectTheme(studio.themes[0].slug);
        }
    } catch (err) {
        showToast('Error loading themes: ' + err.message, 'error');
    }
}

function renderThemeSidebar() {
    const listEl = document.getElementById('sidebar-theme-list');
    if (!listEl) return;

    listEl.innerHTML = studio.themes.map(t => `
        <div class="theme-item ${studio.activeTheme?.slug === t.slug ? 'active' : ''}" data-slug="${t.slug}">
            <div class="theme-item-info">
                <span class="theme-item-icon">${t.icon || '✨'}</span>
                <div>
                    <div class="theme-item-title">${t.title}</div>
                    <div class="theme-item-slug">/${t.slug}</div>
                </div>
            </div>
            <span class="badge-live">${t.status || 'live'}</span>
        </div>
    `).join('');

    listEl.querySelectorAll('.theme-item').forEach(item => {
        item.addEventListener('click', () => selectTheme(item.dataset.slug));
    });
}

async function selectTheme(slug) {
    try {
        const [themeRes, dataRes] = await Promise.all([
            fetch(`/api/theme/${slug}`),
            fetch(`/api/theme/${slug}/data`)
        ]);

        if (!themeRes.ok) throw new Error('Theme not found');
        studio.activeTheme = await themeRes.json();
        studio.activeData = dataRes.ok ? await dataRes.json() : { clothes: [], poses: [], backgrounds: [] };

        renderThemeSidebar();
        populateFormFields(studio.activeTheme);
        renderAssetsList();
        loadExistingBindings(slug);

        document.getElementById('current-theme-heading').textContent = studio.activeTheme.title;
    } catch (err) {
        showToast('Failed to select theme: ' + err.message, 'error');
    }
}

async function loadExistingBindings(slug) {
    try {
        const res = await fetch(`/api/theme/${slug}`);
        // Fetch bindings if present
        const bRes = await fetch(`/static/themes/${slug}/bindings.json`);
        if (bRes.ok) {
            studio.activeBindings = await bRes.json();
            renderBindingsCard(studio.activeBindings);
        } else {
            document.getElementById('workflow-inspection-card').style.display = 'none';
        }
    } catch (e) {}
}

function createNewTheme() {
    const defaultSlug = 'new_theme_' + Math.floor(Math.random() * 1000);
    studio.activeTheme = {
        slug: defaultSlug,
        title: 'New Event Photobooth',
        subtitle: 'Virtual Try-On Experience',
        badge: 'Special Edition',
        icon: '🎉',
        description: 'Celebrate in style with AI-powered festive portrait try-ons.',
        cta: 'Start Experience',
        status: 'draft',
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
        }
    };

    studio.activeData = { clothes: [], poses: [], backgrounds: [] };
    studio.activeBindings = null;

    populateFormFields(studio.activeTheme);
    renderAssetsList();
    document.getElementById('workflow-inspection-card').style.display = 'none';
    document.getElementById('current-theme-heading').textContent = studio.activeTheme.title;
    showToast('Created new draft theme. Fill details and hit Publish.', 'success');
}

// ==========================================================================
// 2. Form Binding & Live Controls
// ==========================================================================
function populateFormFields(theme) {
    if (!theme) return;

    // Identity
    setValue('inp-slug', theme.slug || '');
    setValue('inp-title', theme.title || '');
    setValue('inp-subtitle', theme.subtitle || '');
    setValue('inp-badge', theme.badge || '');
    setValue('inp-icon', theme.icon || '✨');
    setValue('inp-cta', theme.cta || 'Start Experience');
    setValue('inp-desc', theme.description || '');

    // Colors
    const colors = theme.style?.colors || {};
    setColor('inp-color-bg', colors.background || '#0c0d14');
    setColor('inp-color-accent', colors.accent || '#d4af37');
    setColor('inp-color-text', colors.text || '#ffffff');
    setColor('inp-color-primary', colors.primary || '#181926');

    // Font
    setValue('inp-font', theme.style?.fontFamily || "'Outfit', sans-serif");
    setValue('inp-google-font', theme.style?.googleFontUrl || '');

    // Features
    setChecked('chk-lucky-number', theme.features?.luckyNumber || false);
    setChecked('chk-film-strip', theme.features?.filmStrip || false);
    setChecked('chk-gender-filter', theme.features?.genderFilter !== false);

    // Atmosphere
    const bg = theme.background || {};
    setValue('sel-bg-type', bg.type || 'particles');
    setValue('inp-floating-icons', (bg.floatingIcons || ['✨', '✦', '⭐']).join(', '));

    // Waiting Screen Sequence
    renderWaitingSequenceList(theme.waitingExperience?.sequence || []);
}

function readFormFields() {
    const theme = studio.activeTheme || {};

    theme.slug = getValue('inp-slug').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    theme.title = getValue('inp-title').trim();
    theme.subtitle = getValue('inp-subtitle').trim();
    theme.badge = getValue('inp-badge').trim();
    theme.icon = getValue('inp-icon').trim() || '✨';
    theme.cta = getValue('inp-cta').trim() || 'Start';
    theme.description = getValue('inp-desc').trim();
    theme.status = 'live';

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
    theme.features = {
        luckyNumber: getChecked('chk-lucky-number'),
        filmStrip: getChecked('chk-film-strip'),
        genderFilter: getChecked('chk-gender-filter')
    };

    // Background
    const icons = getValue('inp-floating-icons').split(',').map(s => s.trim()).filter(Boolean);
    theme.background = {
        type: getValue('sel-bg-type'),
        floatingIcons: icons.length > 0 ? icons : ['✨', '✦', '⭐'],
        filmStrip: theme.features.filmStrip
    };

    // Waiting Sequence
    theme.waitingExperience = theme.waitingExperience || {};
    theme.waitingExperience.title = 'Creating Magic...';
    theme.waitingExperience.subtitle = 'Processing your photo';
    theme.waitingExperience.sequence = collectWaitingSequence();

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
    if (!card || !bindings) return;

    card.style.display = 'block';
    card.innerHTML = `
        <h4 style="font-size: 1rem; margin-bottom: 0.8rem; color: var(--text-main);">
            🔍 Auto-Detected ComfyUI Parameter Bindings
        </h4>
        <div class="binding-row">
            <span class="binding-label">Input Image Node (Base64)</span>
            <span class="binding-tag">Node #${bindings.input_image_node || 'None'}</span>
        </div>
        <div class="binding-row">
            <span class="binding-label">Positive Prompt Node (CLIP)</span>
            <span class="binding-tag">Node #${bindings.prompt_node || 'None'}</span>
        </div>
        <div class="binding-row">
            <span class="binding-label">Sampler Node (Seed)</span>
            <span class="binding-tag">Node #${bindings.sampler_node || 'None'}</span>
        </div>
        <div class="binding-row">
            <span class="binding-label">Face Swap Node</span>
            <span class="binding-tag">Node #${bindings.face_swap_node || 'None'}</span>
        </div>
        <div class="binding-row">
            <span class="binding-label">Output Node</span>
            <span class="binding-tag">Node #${bindings.output_node || 'None'}</span>
        </div>
        <div class="binding-row">
            <span class="binding-label">Detected Prompt Placeholders</span>
            <span style="font-size: 0.8rem; color: var(--accent);">${(bindings.detected_tokens || []).join(', ') || 'None'}</span>
        </div>
    `;
}

// ==========================================================================
// 5. Asset Manager
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

    grid.innerHTML = items.map((c, idx) => `
        <div class="asset-studio-card">
            <img class="asset-thumb" src="${c.image}" alt="${c.title}" onerror="this.src='/static/landing/cny_card_bg.png'">
            <div class="asset-card-details">
                <span class="asset-card-code">${c.code} (${c.category || 'unisex'})</span>
                <div class="asset-card-title">${c.title}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">${c.lighting || 'Warm lighting'}</div>
            </div>
            <button class="admin-btn admin-btn-danger" style="position: absolute; top: 6px; right: 6px; padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="removeOutfit(${idx})">×</button>
        </div>
    `).join('');
}

function renderPosesList() {
    const grid = document.getElementById('studio-poses-grid');
    if (!grid) return;
    const items = studio.activeData?.poses || [];

    grid.innerHTML = items.map((p, idx) => `
        <div class="asset-studio-card">
            <img class="asset-thumb" src="${p.image}" alt="${p.title}" onerror="this.src='/static/landing/cny_card_bg.png'">
            <div class="asset-card-details">
                <span class="asset-card-code">${p.code}</span>
                <div class="asset-card-title">${p.title}</div>
            </div>
            <button class="admin-btn admin-btn-danger" style="position: absolute; top: 6px; right: 6px; padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="removePose(${idx})">×</button>
        </div>
    `).join('');
}

function renderBackgroundsList() {
    const grid = document.getElementById('studio-bg-grid');
    if (!grid) return;
    const items = studio.activeData?.backgrounds || [];

    grid.innerHTML = items.map((b, idx) => `
        <div class="asset-studio-card">
            <img class="asset-thumb" src="${b.image}" alt="${b.title}" onerror="this.src='/static/landing/cny_card_bg.png'">
            <div class="asset-card-details">
                <span class="asset-card-code">${b.code}</span>
                <div class="asset-card-title">${b.title}</div>
            </div>
            <button class="admin-btn admin-btn-danger" style="position: absolute; top: 6px; right: 6px; padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="removeBackground(${idx})">×</button>
        </div>
    `).join('');
}

window.removeOutfit = function(idx) {
    studio.activeData.clothes.splice(idx, 1);
    renderClothesList();
};

window.removePose = function(idx) {
    studio.activeData.poses.splice(idx, 1);
    renderPosesList();
};

window.removeBackground = function(idx) {
    studio.activeData.backgrounds.splice(idx, 1);
    renderBackgroundsList();
};

// ==========================================================================
// 6. Save & Publish
// ==========================================================================
async function saveAndPublishTheme() {
    const theme = readFormFields();
    if (!theme.slug || !theme.title) {
        showToast('Please specify a Theme Slug and Title!', 'error');
        return;
    }

    const payload = {
        theme: theme,
        data: studio.activeData,
        bindings: studio.activeBindings,
        workflow: studio.uploadedWorkflow
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

        // Refresh sidebar
        await loadThemes();
        selectTheme(theme.slug);
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
            document.querySelectorAll('.asset-subtab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.asset-subtab-panel').forEach(p => p.style.display = 'none');

            btn.classList.add('active');
            const target = document.getElementById(`subtab-${btn.dataset.subtab}`);
            if (target) target.style.display = 'block';
        });
    });
}

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
}

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
