/**
 * Universal Kiosk Engine Script
 * Handles state, camera, API polling, atmospheric visuals, and manifestation sequence.
 */

// Global Kiosk State
const state = {
    theme: null,
    data: null,
    slug: 'cny',
    currentScreen: 'welcome',
    selections: {
        theme: 'cny',
        gender: 'female',
        pose: '',
        poseCode: '',
        clothesStyle: '',
        clothesCode: '',
        background: '',
        backgroundCode: '',
        enableLuckyNumber: true
    },
    photoBlob: null,
    jobId: null,
    pollInterval: null
};

// ==========================================================================
// 1. Initialization & Theme Loading
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Resolve slug from URL path, e.g. /uits -> uits
    const match = window.location.pathname.match(/\/([^\/]+)/);
    state.slug = match ? match[1] : 'cny';
    state.selections.theme = state.slug;

    try {
        // Fetch theme configuration and asset catalog
        const [themeRes, dataRes] = await Promise.all([
            fetch(`/api/theme/${state.slug}`),
            fetch(`/api/theme/${state.slug}/data`)
        ]);

        if (!themeRes.ok || !dataRes.ok) {
            throw new Error(`Failed to load theme data: ${themeRes.status}`);
        }

        state.theme = await themeRes.json();
        state.data = await dataRes.json();

        // Apply Look & Feel
        applyThemeStyles(state.theme);
        initAtmosphere(state.theme);

        // Populate Screen Content
        initWelcomeScreen(state.theme);
        renderSelectionGrids(state.data);

        // Bind All Navigation & Button Handlers
        bindEventHandlers();

        console.log(`[Kiosk Engine] Successfully initialized theme: ${state.slug}`);
    } catch (err) {
        console.error('[Kiosk Engine] Initialization error:', err);
    }
});

// ==========================================================================
// 2. Look & Feel: Dynamic CSS Variables & Atmosphere
// ==========================================================================
function applyThemeStyles(theme) {
    const root = document.documentElement;
    const style = theme.style || {};
    const colors = style.colors || {};
    const gradients = style.gradients || {};

    if (colors.background) root.style.setProperty('--theme-bg', colors.background);
    if (colors.text) root.style.setProperty('--theme-text', colors.text);
    if (colors.primary) root.style.setProperty('--theme-primary', colors.primary);
    if (colors.accent) root.style.setProperty('--theme-accent', colors.accent);
    if (colors.accentGlow) root.style.setProperty('--theme-accent-glow', colors.accentGlow);
    if (colors.surface) root.style.setProperty('--theme-surface', colors.surface);
    if (colors.surfaceBorder) root.style.setProperty('--theme-surface-border', colors.surfaceBorder);

    if (gradients.radialBackground) root.style.setProperty('--gradient-radial', gradients.radialBackground);
    if (gradients.primaryButton) root.style.setProperty('--gradient-primary', gradients.primaryButton);

    if (style.fontFamily) root.style.setProperty('--font-family', style.fontFamily);

    // Google Font Loader
    if (style.googleFontUrl) {
        const fontLink = document.getElementById('theme-font-link');
        if (fontLink) fontLink.href = style.googleFontUrl;
    }
}

async function initAtmosphere(theme) {
    const decoContainer = document.getElementById('persistent-decorations');
    if (!decoContainer) return;

    // Check if theme has custom decorations.html slot
    try {
        const customDecoRes = await fetch(`/static/themes/${state.slug}/decorations.html`);
        if (customDecoRes.ok) {
            const html = await customDecoRes.text();
            decoContainer.innerHTML = html;
            return;
        }
    } catch (e) {
        // Fall back to built-in atmosphere
    }

    // Built-in floating particle atmosphere
    const bgConfig = theme.background || {};
    const icons = bgConfig.floatingIcons || ['✨', '✦', '⭐', '✧'];

    decoContainer.innerHTML = '';
    for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        p.className = 'floating-particle';
        p.textContent = icons[i % icons.length];
        p.style.top = `${10 + Math.random() * 80}%`;
        p.style.left = `${5 + Math.random() * 90}%`;
        p.style.animationDelay = `${Math.random() * 5}s`;
        p.style.fontSize = `${1.2 + Math.random() * 1.4}rem`;
        decoContainer.appendChild(p);
    }

    // Rolling Film Strip on Welcome Screen
    if (theme.features?.filmStrip || bgConfig.filmStrip) {
        initFilmStrip();
    }
}

async function initFilmStrip() {
    const container = document.getElementById('film-strip-container');
    const trackLeft = document.getElementById('film-track-left');
    const trackRight = document.getElementById('film-track-right');
    if (!container || !trackLeft || !trackRight) return;

    try {
        const res = await fetch(`/api/theme/${state.slug}/samples`);
        if (!res.ok) return;
        const images = await res.json();
        if (!images || images.length === 0) return;

        container.classList.add('active');
        const makeItems = (imgs) => imgs.map(src => `
            <div class="film-item"><img src="${src}" alt="Sample" loading="lazy"></div>
        `).join('');

        // Duplicate to create seamless infinite loop
        trackLeft.innerHTML = makeItems(images) + makeItems(images);
        trackRight.innerHTML = makeItems(images.slice().reverse()) + makeItems(images.slice().reverse());
    } catch (err) {
        console.warn('Film strip samples not available:', err);
    }
}

function initWelcomeScreen(theme) {
    document.title = `${theme.title || 'Photobooth'} ✨`;
    const badge = document.getElementById('theme-badge');
    const titleMain = document.getElementById('theme-title-main');
    const titleSub = document.getElementById('theme-title-sub');
    const subtitle = document.getElementById('theme-subtitle');
    const ctaText = document.getElementById('theme-cta-text');

    if (badge) badge.textContent = `${theme.icon || '✨'} ${theme.badge || 'Virtual Try-On'}`;
    if (titleMain) titleMain.textContent = theme.title || 'Virtual Try-On';
    if (titleSub) titleSub.textContent = theme.subtitle || 'Photo Studio';
    if (subtitle) subtitle.textContent = theme.description || 'Step into our AI portrait studio.';
    if (ctaText && theme.cta) ctaText.textContent = theme.cta;
}

// ==========================================================================
// 3. Navigation & Screen Routing
// ==========================================================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`${screenId}-screen`);
    if (target) {
        target.classList.add('active');
        state.currentScreen = screenId;
        window.scrollTo(0, 0);
    }
}

function bindEventHandlers() {
    // Welcome -> Options
    document.getElementById('start-btn')?.addEventListener('click', () => {
        showScreen('options');
    });

    // Gender Selection
    document.querySelectorAll('.gender-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const gender = btn.dataset.gender;
            state.selections.gender = gender;

            document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            // Filter clothes by selected gender automatically
            filterClothes(gender);

            // Flow check: if luckyNumber enabled, go to settings, else straight to pose
            if (state.theme?.features?.luckyNumber) {
                showScreen('settings');
            } else {
                showScreen('pose');
            }
        });
    });

    document.getElementById('back-to-welcome-btn')?.addEventListener('click', () => showScreen('welcome'));

    // Settings (Lucky Number) -> Pose
    document.getElementById('back-to-gender-btn')?.addEventListener('click', () => showScreen('options'));
    document.getElementById('continue-to-pose-btn')?.addEventListener('click', () => {
        const toggle = document.getElementById('lucky-number-toggle');
        state.selections.enableLuckyNumber = toggle ? toggle.checked : true;
        showScreen('pose');
    });

    // Pose Screen
    document.getElementById('pose-back-btn')?.addEventListener('click', () => {
        if (state.theme?.features?.luckyNumber) {
            showScreen('settings');
        } else {
            showScreen('options');
        }
    });
    document.getElementById('pose-next-btn')?.addEventListener('click', () => {
        if (!state.selections.pose) {
            alert('Please select a pose to continue!');
            return;
        }
        showScreen('clothes');
    });

    // Clothes Screen
    document.getElementById('clothes-back-btn')?.addEventListener('click', () => showScreen('pose'));
    document.getElementById('clothes-next-btn')?.addEventListener('click', () => {
        if (!state.selections.clothesStyle) {
            alert('Please select an outfit to continue!');
            return;
        }
        showScreen('background');
    });

    // Clothes Gender Filter Tabs
    document.querySelectorAll('#clothes-filter-tabs .filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#clothes-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            filterClothes(tab.dataset.filter);
        });
    });

    // Background Screen
    document.getElementById('bg-back-btn')?.addEventListener('click', () => showScreen('clothes'));
    document.getElementById('bg-next-btn')?.addEventListener('click', () => {
        if (!state.selections.background) {
            alert('Please select a background to continue!');
            return;
        }
        startCamera();
        showScreen('camera');
    });

    // Camera Screen
    document.getElementById('camera-back-btn')?.addEventListener('click', () => {
        stopCamera();
        showScreen('background');
    });
    document.getElementById('snap-btn')?.addEventListener('click', triggerCountdown);

    // Result Screen Actions
    document.getElementById('view-result-btn')?.addEventListener('click', revealResult);
    document.getElementById('print-btn')?.addEventListener('click', handlePrint);
    document.getElementById('download-btn')?.addEventListener('click', handleDownload);
    document.getElementById('home-btn')?.addEventListener('click', resetKiosk);

    // Modal Expand
    document.getElementById('result-image')?.addEventListener('click', (e) => {
        const modal = document.getElementById('image-modal');
        const modalImg = document.getElementById('modal-img');
        if (modal && modalImg) {
            modalImg.src = e.target.src;
            modal.classList.add('open');
        }
    });
    document.getElementById('image-modal')?.addEventListener('click', (e) => {
        e.currentTarget.classList.remove('open');
    });
}

// ==========================================================================
// 4. Selection Grids Rendering
// ==========================================================================
function renderSelectionGrids(data) {
    if (!data) return;

    // 1. Poses
    const poseGrid = document.getElementById('pose-grid');
    if (poseGrid && data.poses) {
        poseGrid.innerHTML = data.poses.map((p, idx) => `
            <div class="selection-card ${idx === 0 ? 'selected' : ''}" 
                 data-code="${p.code}" data-prompt="${escapeAttr(p.prompt)}">
                <div class="card-image-wrap">
                    <img src="${p.image}" alt="${p.title}" loading="lazy">
                </div>
                <div class="card-info">
                    <div class="card-code">${p.code}</div>
                    <div class="card-title">${p.title}</div>
                    <div class="card-desc">${p.description || ''}</div>
                </div>
            </div>
        `).join('');

        // Select first by default
        if (data.poses[0]) {
            state.selections.pose = data.poses[0].prompt;
            state.selections.poseCode = data.poses[0].code;
        }

        poseGrid.querySelectorAll('.selection-card').forEach(card => {
            card.addEventListener('click', () => {
                poseGrid.querySelectorAll('.selection-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                state.selections.pose = card.dataset.prompt;
                state.selections.poseCode = card.dataset.code;
            });
        });
    }

    // 2. Clothes
    renderClothesGrid(data.clothes || []);

    // 3. Backgrounds
    const bgGrid = document.getElementById('background-grid');
    if (bgGrid && data.backgrounds) {
        bgGrid.innerHTML = data.backgrounds.map((b, idx) => `
            <div class="selection-card ${idx === 0 ? 'selected' : ''}" 
                 data-code="${b.code}" data-prompt="${escapeAttr(b.prompt)}">
                <div class="card-image-wrap">
                    <img src="${b.image}" alt="${b.title}" loading="lazy">
                </div>
                <div class="card-info">
                    <div class="card-code">${b.code}</div>
                    <div class="card-title">${b.title}</div>
                    <div class="card-desc">${b.description || ''}</div>
                </div>
            </div>
        `).join('');

        if (data.backgrounds[0]) {
            state.selections.background = data.backgrounds[0].prompt;
            state.selections.backgroundCode = data.backgrounds[0].code;
        }

        bgGrid.querySelectorAll('.selection-card').forEach(card => {
            card.addEventListener('click', () => {
                bgGrid.querySelectorAll('.selection-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                state.selections.background = card.dataset.prompt;
                state.selections.backgroundCode = card.dataset.code;
            });
        });
    }
}

function renderClothesGrid(clothesList) {
    const grid = document.getElementById('clothes-grid');
    if (!grid) return;

    grid.innerHTML = clothesList.map((c, idx) => `
        <div class="selection-card ${idx === 0 ? 'selected' : ''}" 
             data-code="${c.code}" data-category="${c.category || 'unisex'}" data-prompt="${escapeAttr(c.prompt)}">
            <div class="card-image-wrap">
                <img src="${c.image}" alt="${c.title}" loading="lazy">
            </div>
            <div class="card-info">
                <div class="card-code">${c.code}</div>
                <div class="card-title">${c.title}</div>
                <div class="card-desc">${c.description || ''}</div>
            </div>
        </div>
    `).join('');

    if (clothesList[0]) {
        state.selections.clothesStyle = clothesList[0].prompt;
        state.selections.clothesCode = clothesList[0].code;
    }

    grid.querySelectorAll('.selection-card').forEach(card => {
        card.addEventListener('click', () => {
            grid.querySelectorAll('.selection-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            state.selections.clothesStyle = card.dataset.prompt;
            state.selections.clothesCode = card.dataset.code;
        });
    });
}

function filterClothes(category) {
    const cards = document.querySelectorAll('#clothes-grid .selection-card');
    let firstVisible = null;

    cards.forEach(card => {
        const cat = card.dataset.category?.toLowerCase();
        if (category === 'all' || cat === 'unisex' || cat === category.toLowerCase()) {
            card.style.display = 'flex';
            if (!firstVisible) firstVisible = card;
        } else {
            card.style.display = 'none';
        }
    });

    // Auto-select first visible
    if (firstVisible) {
        cards.forEach(c => c.classList.remove('selected'));
        firstVisible.classList.add('selected');
        state.selections.clothesStyle = firstVisible.dataset.prompt;
        state.selections.clothesCode = firstVisible.dataset.code;
    }
}

// ==========================================================================
// 5. Camera Management & Countdown
// ==========================================================================
let videoStream = null;

async function startCamera() {
    const video = document.getElementById('camera-video');
    if (!video) return;

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
            audio: false
        });
        video.srcObject = videoStream;
        await video.play();
    } catch (err) {
        console.error('Camera access error:', err);
        alert('Camera could not be accessed. Please check permissions.');
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
    }
}

function triggerCountdown() {
    const snapBtn = document.getElementById('snap-btn');
    const countdownEl = document.getElementById('countdown-display');
    if (snapBtn) snapBtn.disabled = true;

    let count = 3;
    if (countdownEl) {
        countdownEl.style.display = 'block';
        countdownEl.textContent = count;
    }

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            if (countdownEl) countdownEl.textContent = count;
        } else {
            clearInterval(timer);
            if (countdownEl) countdownEl.style.display = 'none';
            capturePhoto();
            if (snapBtn) snapBtn.disabled = false;
        }
    }, 1000);
}

function capturePhoto() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('photo-canvas');
    const flash = document.getElementById('camera-flash');
    if (!video || !canvas) return;

    // Flash visual
    if (flash) {
        flash.classList.remove('flash-animation');
        void flash.offsetWidth;
        flash.classList.add('flash-animation');
    }

    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    stopCamera();

    canvas.toBlob(blob => {
        state.photoBlob = blob;
        startProcessing();
    }, 'image/jpeg', 0.95);
}

// ==========================================================================
// 6. Processing & Manifestation Sequence
// ==========================================================================
async function startProcessing() {
    showScreen('result');

    const loadingView = document.getElementById('loading-view');
    const resultImg = document.getElementById('result-image');
    const revealBtn = document.getElementById('view-result-btn');
    const actions = document.getElementById('result-actions');

    if (loadingView) loadingView.style.display = 'flex';
    if (resultImg) resultImg.style.display = 'none';
    if (revealBtn) revealBtn.style.display = 'none';
    if (actions) actions.style.display = 'none';

    // Start animated manifestation sequence
    playManifestationSequence();

    // Submit to backend
    const formData = new FormData();
    formData.append('theme', state.slug);
    formData.append('image', state.photoBlob, 'capture.jpg');
    formData.append('gender', state.selections.gender);
    formData.append('pose', state.selections.pose);
    formData.append('pose_code', state.selections.poseCode);
    formData.append('clothes_style', state.selections.clothesStyle);
    formData.append('clothes_code', state.selections.clothesCode);
    formData.append('background', state.selections.background);
    formData.append('background_code', state.selections.backgroundCode);
    formData.append('enable_lucky_number', state.selections.enableLuckyNumber ? 'true' : 'false');

    try {
        const res = await fetch('/api/process', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Failed to queue processing');
        const data = await res.json();
        state.jobId = data.job_id;

        // Poll for completion
        pollJobStatus(state.jobId);
    } catch (err) {
        console.error('Processing submit error:', err);
        alert('Could not start processing. Please try again.');
        showScreen('camera');
        startCamera();
    }
}

function playManifestationSequence() {
    const overlay = document.getElementById('analytics-overlay');
    if (!overlay) return;
    overlay.innerHTML = '';

    const exp = state.theme?.waitingExperience || {};
    const titleEl = document.getElementById('manifest-title');
    const subtitleEl = document.getElementById('manifest-subtitle');

    if (titleEl && exp.title) titleEl.textContent = exp.title;
    if (subtitleEl && exp.subtitle) subtitleEl.textContent = exp.subtitle;

    const sequence = exp.sequence || [
        { text: "Analyzing your portrait...", delay: 500 },
        { text: "Synthesizing custom lighting...", delay: 3500 },
        { text: "Crafting festive textures...", delay: 7000 },
        { text: "Adding the finishing glow...", delay: 11000 }
    ];

    sequence.forEach(step => {
        setTimeout(() => {
            const item = document.createElement('div');
            item.className = 'analytics-item';
            item.textContent = step.text;
            if (step.color) item.style.color = step.color;
            if (step.size) item.style.fontSize = step.size;
            overlay.appendChild(item);
        }, step.delay);
    });
}

function pollJobStatus(jobId) {
    if (state.pollInterval) clearInterval(state.pollInterval);

    state.pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/status/${jobId}`);
            if (!res.ok) return;
            const data = await res.json();

            if (data.status === 'completed') {
                clearInterval(state.pollInterval);
                state.pollInterval = null;

                const resultImg = document.getElementById('result-image');
                const revealBtn = document.getElementById('view-result-btn');

                if (resultImg && data.image) {
                    resultImg.src = data.image;
                }
                if (revealBtn) {
                    revealBtn.style.display = 'inline-flex';
                }

                // Trigger remote transfer to DGX receiver in background
                fetch(`/api/transfer/${jobId}`, { method: 'POST' }).catch(() => {});
            } else if (data.status === 'failed') {
                clearInterval(state.pollInterval);
                state.pollInterval = null;
                alert(`Processing failed: ${data.error || 'Unknown error'}`);
                showScreen('camera');
                startCamera();
            }
        } catch (e) {
            console.warn('Status poll error:', e);
        }
    }, 2000);
}

function revealResult() {
    const loadingView = document.getElementById('loading-view');
    const resultImg = document.getElementById('result-image');
    const revealBtn = document.getElementById('view-result-btn');
    const actions = document.getElementById('result-actions');

    if (loadingView) loadingView.style.display = 'none';
    if (revealBtn) revealBtn.style.display = 'none';
    if (resultImg) resultImg.style.display = 'block';
    if (actions) actions.style.display = 'flex';
}

// ==========================================================================
// 7. Print, Download & Reset
// ==========================================================================
async function handlePrint() {
    if (!state.jobId) return;
    try {
        const btn = document.getElementById('print-btn');
        if (btn) btn.textContent = 'Printing...';
        await fetch(`/api/print/${state.jobId}`);
        setTimeout(() => { if (btn) btn.textContent = '🖨️ Print Photo'; }, 3000);
    } catch (e) {
        console.error('Print error:', e);
    }
}

function handleDownload() {
    if (!state.jobId) return;
    window.location.href = `/api/download/${state.jobId}`;
}

function resetKiosk() {
    if (state.pollInterval) clearInterval(state.pollInterval);
    state.jobId = null;
    state.photoBlob = null;
    showScreen('welcome');
}

function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;');
}
