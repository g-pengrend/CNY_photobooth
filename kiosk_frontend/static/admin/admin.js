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
    pickerTargetIndex: null,
    assetGenConfigs: {},
    currentGenType: 'backdrop',
    lastGenResult: null
};

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initEventListeners();
    await loadThemes();
    await loadMasterAssets();
    await loadAssetGenConfigs();
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
                    <span class="asset-card-code">${c.code || 'O' + (idx+1)} (${c.category || 'unisex'})</span>
                    <button class="admin-btn admin-btn-secondary" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;" onclick="openMasterAssetPicker('clothes', ${idx})" title="Replace from Master Library">🔄 Change</button>
                </div>
                <div class="asset-card-title">${c.title || c.name || 'Untitled Outfit'}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${c.prompt_modifier || ''}">
                    ${c.prompt_modifier || c.lighting || 'Custom festive styling'}
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
                    <span class="asset-card-code">${p.code || 'P' + (idx+1)}</span>
                    <button class="admin-btn admin-btn-secondary" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;" onclick="openMasterAssetPicker('poses', ${idx})" title="Replace from Master Library">🔄 Change</button>
                </div>
                <div class="asset-card-title">${p.title || p.name || 'Untitled Pose'}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">${p.prompt_modifier || 'Pose modifier'}</div>
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
                    <span class="asset-card-code">${b.code || 'B' + (idx+1)}</span>
                    <button class="admin-btn admin-btn-secondary" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;" onclick="openMasterAssetPicker('backgrounds', ${idx})" title="Replace from Master Library">🔄 Change</button>
                </div>
                <div class="asset-card-title">${b.title || b.name || 'Untitled Background'}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">${b.prompt_modifier || 'Atmospheric setting'}</div>
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

// --- Master Asset Picker Modal Controls ---
window.openMasterAssetPicker = function(category = 'clothes', replaceIndex = null) {
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

window.closeMasterAssetPicker = function() {
    const modal = document.getElementById('asset-library-modal');
    if (modal) modal.classList.remove('open');
    studio.pickerTargetIndex = null;
};

window.setPickerCategory = function(cat) {
    studio.pickerCategory = cat;
    document.querySelectorAll('.modal-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    filterPickerAssets();
};

window.filterPickerAssets = function() {
    const grid = document.getElementById('modal-asset-grid');
    const countEl = document.getElementById('modal-asset-count');
    if (!grid) return;

    const cat = studio.pickerCategory || 'clothes';
    const themeFilter = document.getElementById('modal-theme-filter')?.value || 'all';
    const searchFilter = (document.getElementById('modal-search-input')?.value || '').toLowerCase().trim();

    const allItems = studio.masterAssets[cat] || [];
    const filtered = allItems.filter(item => {
        if (themeFilter !== 'all' && item.source_theme?.toLowerCase() !== themeFilter.toLowerCase()) {
            return false;
        }
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

    grid.innerHTML = filtered.map((item, idx) => {
        const title = item.title || item.name || 'Untitled Asset';
        const code = item.code || '';
        const theme = item.source_theme || 'shared';
        const prompt = item.prompt_modifier || item.mapping_desc || item.lighting || '';
        const isSelected = (studio.activeData[cat] || []).some(existing => existing.image === item.image);

        return `
            <div class="modal-asset-card ${isSelected ? 'selected' : ''}" onclick="selectMasterAsset('${cat}', ${JSON.stringify(item).replace(/"/g, '&quot;')})">
                <img class="modal-asset-thumb" src="${item.image}" alt="${title}" onerror="this.src='/static/landing/cny_card_bg.png'">
                <div class="modal-asset-info">
                    <div class="modal-asset-header">
                        <span class="modal-asset-theme-tag">${theme.toUpperCase()}</span>
                        ${code ? `<span class="modal-asset-code">${code}</span>` : ''}
                    </div>
                    <div class="modal-asset-name">${title}</div>
                    ${prompt ? `<div class="modal-asset-prompt">${prompt}</div>` : ''}
                    <div class="modal-asset-action">
                        <button type="button" class="modal-add-btn">
                            ${studio.pickerTargetIndex !== null ? '🔄 Replace With This' : (isSelected ? '✓ Added to Theme' : '➕ Add to Theme')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

window.selectMasterAsset = function(category, item) {
    studio.activeData = studio.activeData || { clothes: [], poses: [], backgrounds: [] };
    studio.activeData[category] = studio.activeData[category] || [];

    const cloned = {
        id: `${studio.activeTheme?.slug || 'theme'}_${Date.now().toString().slice(-4)}`,
        code: item.code || `${category[0].toUpperCase()}${studio.activeData[category].length + 1}`,
        title: item.title || item.name || 'New Asset',
        image: item.image,
        prompt_modifier: item.prompt_modifier || item.mapping_desc || '',
        category: item.category || item.gender || 'unisex',
        lighting: item.lighting || 'Warm cinematic lighting'
    };

    if (studio.pickerTargetIndex !== null && studio.pickerTargetIndex >= 0) {
        studio.activeData[category][studio.pickerTargetIndex] = cloned;
        showToast(`Replaced item with "${cloned.title}"!`, 'success');
        closeMasterAssetPicker();
    } else {
        studio.activeData[category].push(cloned);
        showToast(`Added "${cloned.title}" to ${category}!`, 'success');
    }

    renderAssetsList();
    filterPickerAssets();
};

// --- Blank Item Creators ---
window.addBlankOutfit = function() {
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

window.addBlankPose = function() {
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

window.addBlankBackground = function() {
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
window.openImportThemeModal = function() {
    const modal = document.getElementById('theme-import-modal');
    if (modal) modal.classList.add('open');
};

window.closeImportThemeModal = function() {
    const modal = document.getElementById('theme-import-modal');
    if (modal) modal.classList.remove('open');
};

window.confirmImportTheme = async function() {
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

window.selectGeneratorType = function(type) {
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

window.updateGeneratorPreview = function() {
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

window.loadGeneratorExamplePrompt = function() {
    const type = studio.currentGenType || 'backdrop';
    const cfg = studio.assetGenConfigs[type];
    const middleInput = document.getElementById('gen-middle-prompt');
    if (cfg && middleInput) {
        middleInput.value = cfg.default_middle || '';
        showToast('Loaded example prompt description!', 'success');
    }
};

window.clearGeneratorPrompt = function() {
    const middleInput = document.getElementById('gen-middle-prompt');
    if (middleInput) middleInput.value = '';
};

window.triggerAssetGeneration = async function() {
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
            if (type === 'backdrop') suggestedTitle = 'Cinematic Backdrop ' + Math.floor(Math.random()*900 + 100);
            else if (type === 'clothes') suggestedTitle = (gender === 'female' ? 'Women ' : 'Men ') + 'Celebration Attire ' + Math.floor(Math.random()*900 + 100);
            else suggestedTitle = 'Hero Chibi Pose ' + Math.floor(Math.random()*900 + 100);
            nameInput.value = suggestedTitle;
            updateFilenamePreview();
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

window.updateFilenamePreview = function() {
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

window.regenerateAsset = function() {
    const seedInput = document.getElementById('gen-seed-input');
    if (seedInput) seedInput.value = ''; // force new random seed
    triggerAssetGeneration();
};

window.acceptGeneratedAsset = async function() {
    if (!studio.lastGenResult) {
        showToast('No generated asset to accept', 'error');
        return;
    }

    const type = studio.currentGenType || 'backdrop';
    const name = document.getElementById('gen-asset-name')?.value.trim();
    const targetTheme = document.getElementById('gen-target-theme')?.value || 'master';
    const gender = document.getElementById('gen-clothes-gender')?.value || 'unisex';
    const btn = document.getElementById('gen-accept-btn');
    const statusMsg = document.getElementById('gen-status-msg');

    const origText = btn.innerHTML;
    btn.innerHTML = '💾 Saving to Master...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/admin/asset-generator/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                preview_filename: studio.lastGenResult.preview_filename,
                type: type,
                name: name,
                target_theme: targetTheme,
                prompt_desc: studio.lastGenResult.full_prompt,
                gender: gender
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to save asset');
        }

        const data = await res.json();
        showToast(`✅ Saved as "${data.filename}" and added to Master Database!`, 'success');

        if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
            statusMsg.style.border = '1px solid #10b981';
            statusMsg.style.color = '#34d399';
            statusMsg.innerHTML = `
                <strong>Saved Successfully!</strong><br>
                File: <code>${data.filename}</code><br>
                Destination: <code>${data.web_path}</code><br>
                Library: <strong>Master Asset Library (Shared across all themes)</strong>
            `;
        }

        // Refresh master assets so it's instantly pickable everywhere
        await loadMasterAssets();

        // If the saved asset belongs to active theme, reload active data
        if (studio.activeTheme?.slug === targetTheme) {
            const dataRes = await fetch(`/api/theme/${targetTheme}/data`);
            if (dataRes.ok) {
                studio.activeData = await dataRes.json();
                renderAssetsList();
            }
        }

    } catch (err) {
        showToast('Save error: ' + err.message, 'error');
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
};
