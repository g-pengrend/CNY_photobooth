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
        const allThemes = await res.json();
        studio.themes = allThemes.filter(t => t.slug !== 'master');

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

    const isThemeView = studio.currentView === 'theme-editor';

    listEl.innerHTML = studio.themes.map(t => {
        const isActive = isThemeView && studio.activeTheme?.slug === t.slug;
        const isDraft = t.status === 'draft';
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
                ${!isDraft ? `<button class="sidebar-delete-btn" title="Delete theme" onclick="openDeleteThemeModal('${t.slug}','${(t.title||'').replace(/'/g,"\\'")}'); event.stopPropagation();">🗑️</button>` : ''}
            </div>
        </div>`;
    }).join('');

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

        // Remove draft placeholder if a real theme is now selected
        studio.themes = studio.themes.filter(t => !(t.status === 'draft' && t.slug !== slug));

        renderThemeSidebar();
        populateFormFields(studio.activeTheme);
        renderAssetsList();
        loadExistingBindings(slug);

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
        const res = await fetch(`/api/theme/${slug}`);
        // Fetch bindings if present
        const bRes = await fetch(`/static/themes/${slug}/bindings.json`);
        if (bRes.ok) {
            studio.activeBindings = await bRes.json();
            renderBindingsCard(studio.activeBindings);
        } else {
            document.getElementById('workflow-inspection-card').style.display = 'none';
        }
    } catch (e) { }
}

function createNewTheme() {
    const defaultSlug = 'new_theme_' + Math.floor(Date.now() % 10000);

    // Add placeholder into sidebar themes list
    const placeholder = {
        slug: defaultSlug,
        title: 'Untitled Theme ✨',
        icon: '🎉',
        status: 'draft'
    };
    // Remove any existing unsaved draft placeholders first
    studio.themes = studio.themes.filter(t => t.status !== 'draft');
    studio.themes.push(placeholder);

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
        },
        promptTemplate: { ...PROMPT_THEME_PRESETS.uits }
    };

    studio.activeData = { clothes: [], poses: [], backgrounds: [] };
    studio.activeBindings = null;

    renderThemeSidebar();
    populateFormFields(studio.activeTheme);
    renderAssetsList();
    document.getElementById('workflow-inspection-card').style.display = 'none';
    document.getElementById('current-theme-heading').textContent = '✨ New Theme';
    const sub = document.getElementById('current-theme-subheading');
    if (sub) sub.textContent = 'Fill in the details below and publish when ready.';

    switchToThemeEditor();
    showToast('Created new draft theme. Fill in Identity & Style, then Publish!', 'success');
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

    // Prompt Designer
    populatePromptDesigner(theme);
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

function initPromptDesignerListeners() {
    const inputIds = [
        'prompt-inp-framing', 'prompt-inp-male-style', 'prompt-inp-female-style',
        'prompt-inp-border', 'prompt-inp-top-title', 'prompt-inp-top-title-style',
        'prompt-inp-subtitle', 'prompt-inp-subtitle-style', 'prompt-inp-bottom-title',
        'prompt-inp-bottom-title-style', 'prompt-inp-typo-style', 'prompt-inp-atmosphere'
    ];
    inputIds.forEach(id => {
        document.getElementById(id)?.addEventListener('input', updatePromptLivePreview);
    });

    document.getElementById('raw-prompt-textarea')?.addEventListener('input', updatePromptLivePreview);
    document.getElementById('chk-lucky-number')?.addEventListener('change', updatePromptLivePreview);
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
function switchToThemeEditor() {
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
// Delete Theme Modal
// ==========================================================================
window.openDeleteThemeModal = function (slug, title) {
    if (!slug) return;
    studio.pendingDeleteSlug = slug;
    document.getElementById('delete-theme-name').textContent = title || slug;
    document.getElementById('delete-theme-slug').textContent = slug;
    const modal = document.getElementById('delete-theme-modal');
    if (modal) modal.classList.add('open');
};

window.openDeleteActiveThemeModal = function () {
    if (!studio.activeTheme?.slug) return;
    openDeleteThemeModal(studio.activeTheme.slug, studio.activeTheme.title);
};

window.closeDeleteThemeModal = function () {
    studio.pendingDeleteSlug = null;
    const modal = document.getElementById('delete-theme-modal');
    if (modal) modal.classList.remove('open');
};

window.confirmDeleteTheme = async function () {
    const slug = studio.pendingDeleteSlug;
    if (!slug) return;

    const btn = document.getElementById('btn-confirm-delete-theme');
    if (btn) { btn.textContent = '🗑️ Deleting...'; btn.disabled = true; }

    try {
        const res = await fetch(`/api/theme/${slug}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Delete failed');
        }
        showToast(`Theme "${slug}" permanently deleted.`, 'success');
        closeDeleteThemeModal();

        // Remove from sidebar and reload
        studio.themes = studio.themes.filter(t => t.slug !== slug);
        if (studio.activeTheme?.slug === slug) {
            studio.activeTheme = null;
        }

        await loadThemes();
        if (studio.themes.length > 0) {
            selectTheme(studio.themes[0].slug);
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
                prompt_desc: studio.lastGenResult.full_prompt,
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
