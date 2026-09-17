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
    const bgConfig = theme.background || {};

    if (decoContainer) {
        // Check if theme has custom decorations.html slot
        let hasCustomDeco = false;
        try {
            const customDecoRes = await fetch(`/static/themes/${state.slug}/decorations.html`);
            if (customDecoRes.ok) {
                const html = await customDecoRes.text();
                decoContainer.innerHTML = html;
                hasCustomDeco = true;
            }
        } catch (e) {
            // Fall back to built-in atmosphere
        }

        if (!hasCustomDeco) {
            // Built-in floating particle atmosphere
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
        }
    }

    // Rolling Film Strip on Welcome Screen (always evaluated)
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
        let images = [];
        try {
            const res = await fetch(`/api/theme/${state.slug}/samples`);
            if (res.ok) {
                images = await res.json();
            }
        } catch (fetchErr) {
            console.warn('[Kiosk Engine] Theme samples fetch failed:', fetchErr);
        }

        // Fallback 1: Extract clothes images from loaded theme data
        if (!images || images.length === 0) {
            if (state.data && Array.isArray(state.data.clothes)) {
                images = state.data.clothes.map(c => c.image).filter(Boolean);
            }
        }

        // Fallback 2: Universal master sample portraits
        if (!images || images.length === 0) {
            images = [
                '/static/themes/uits/images/samples/generated_image_15.png',
                '/static/themes/uits/images/samples/generated_image_16.png',
                '/static/themes/uits/images/samples/generated_image_17.png',
                '/static/themes/uits/images/samples/generated_image_18.png',
                '/static/themes/uits/images/samples/generated_image_19.png',
                '/static/themes/uits/images/samples/generated_image_39.png',
                '/static/themes/uits/images/samples/generated_image_58.png',
                '/static/themes/uits/images/samples/generated_image_59.png'
            ];
        }

        container.classList.add('active');
        const makeItems = (imgs) => imgs.map(src => `
            <div class="film-item"><img src="${src}" alt="Sample" loading="lazy" onerror="this.parentElement.style.display='none'"></div>
        `).join('');

        // Ensure at least 8 items for a continuous, seamless track roll
        let trackImgs = images.slice();
        while (trackImgs.length < 8) {
            trackImgs = trackImgs.concat(images);
        }

        // Duplicate to create seamless infinite loop (A + A)
        trackLeft.innerHTML = makeItems(trackImgs) + makeItems(trackImgs);
        trackRight.innerHTML = makeItems(trackImgs.slice().reverse()) + makeItems(trackImgs.slice().reverse());
    } catch (err) {
        console.warn('[Kiosk Engine] Film strip init failed:', err);
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

            // Immediate transition matching previous themes (280ms delay for feedback)
            setTimeout(() => {
                if (state.theme?.features?.luckyNumber) {
                    showScreen('settings');
                } else {
                    showScreen('pose');
                }
            }, 280);
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

    // Clothes Screen
    document.getElementById('clothes-back-btn')?.addEventListener('click', () => showScreen('pose'));

    // Clothes Gender Filter Tabs
    document.querySelectorAll('#clothes-filter-tabs .filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            filterClothes(tab.dataset.filter);
        });
    });

    // Background Screen
    document.getElementById('bg-back-btn')?.addEventListener('click', () => showScreen('clothes'));

    // Camera Screen Controls
    document.getElementById('camera-back-btn')?.addEventListener('click', () => {
        stopCamera();
        showScreen('background');
    });

    // Camera Capture (Both top and bottom capture buttons)
    ['capture-btn', 'capture-btn-top'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', triggerCountdown);
        }
    });

    // Upload Photo Handler (always accessible, even when camera is not detected)
    const uploadTriggerBtn = document.getElementById('upload-trigger-btn');
    const photoUploadInput = document.getElementById('photo-upload');
    if (uploadTriggerBtn && photoUploadInput) {
        uploadTriggerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            photoUploadInput.click();
        });

        photoUploadInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                const blob = new Blob([file], { type: file.type });
                state.photoBlob = blob;
                stopCamera();
                displayPreview(blob);
                photoUploadInput.value = '';
            }
        });
    }

    // Preview Screen Actions
    document.getElementById('retake-photo-btn')?.addEventListener('click', () => {
        showScreen('camera');
        startCamera();
    });

    document.getElementById('confirm-photo-btn')?.addEventListener('click', () => {
        if (state.photoBlob) {
            startProcessing();
        } else {
            alert('Please take or upload a photo first!');
        }
    });

    // Result Screen Actions matching original photobooth templates
    document.getElementById('transfer-print-btn')?.addEventListener('click', handlePrintOnly);
    document.getElementById('animate-btn')?.addEventListener('click', handlePrintAndAnimate);
    document.getElementById('regenerate-btn')?.addEventListener('click', handleRegenerate);
    document.getElementById('start-over-btn')?.addEventListener('click', resetKiosk);

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

                // Immediate transition to next screen (280ms)
                setTimeout(() => {
                    showScreen('clothes');
                }, 280);
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

                // Start camera and immediately transition (280ms)
                startCamera();
                setTimeout(() => {
                    showScreen('camera');
                }, 280);
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

            // Immediate transition to next screen (280ms)
            setTimeout(() => {
                showScreen('background');
            }, 280);
        });
    });

    // Synchronize clothes filter with selected gender immediately upon rendering
    if (state.selections.gender) {
        filterClothes(state.selections.gender);
    }
}

function filterClothes(category) {
    if (!category) category = 'all';

    // Synchronize the filter tab buttons visually
    document.querySelectorAll('#clothes-filter-tabs .filter-tab').forEach(tab => {
        if (tab.dataset.filter.toLowerCase() === category.toLowerCase()) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    const cards = document.querySelectorAll('#clothes-grid .selection-card');
    let firstVisible = null;

    cards.forEach(card => {
        const cat = (card.dataset.category || 'unisex').toLowerCase();
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
    const video = document.getElementById('camera-feed');
    const errorEl = document.getElementById('camera-error-message');
    const errorText = document.getElementById('camera-error-text');
    const captureBtns = document.querySelectorAll('.btn-capture');

    // Reset UI state: hide error, restore capture buttons
    if (errorEl) errorEl.style.display = 'none';
    captureBtns.forEach(btn => {
        btn.style.display = '';
        btn.disabled = false;
    });

    stopCamera();

    if (!video) return;

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera access requires HTTPS or localhost');
        }

        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: false
        });

        video.srcObject = videoStream;
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        console.log('Camera initialized successfully');
    } catch (err) {
        console.warn('Camera access error / not detected:', err);
        // Show camera error overlay in the camera frame
        if (errorEl) {
            errorEl.style.display = 'flex';
            if (errorText) {
                errorText.textContent = (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')
                    ? 'No camera detected. Please connect a camera or upload a photo below.'
                    : 'Camera not detected. You can upload a photo below.';
            }
        }
        // Hide capture buttons when camera is missing, but upload button is always available!
        captureBtns.forEach(btn => btn.style.display = 'none');
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
    }
    const video = document.getElementById('camera-feed');
    if (video) video.srcObject = null;
}

function triggerCountdown() {
    const captureBtns = document.querySelectorAll('.btn-capture');
    const countdownEl = document.getElementById('countdown-display');
    captureBtns.forEach(b => b.disabled = true);

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
            captureBtns.forEach(b => b.disabled = false);
        }
    }, 1000);
}

function capturePhoto() {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('camera-canvas') || document.createElement('canvas');
    const flash = document.getElementById('camera-flash');
    if (!video) return;

    // Flash visual
    if (flash) {
        flash.classList.remove('flash-animation');
        void flash.offsetWidth;
        flash.classList.add('flash-animation');
    }

    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;
    const frameAspectRatio = 3 / 4;
    const videoAspectRatio = videoWidth / videoHeight;

    let cropWidth, cropHeight, cropX, cropY;
    if (videoAspectRatio > frameAspectRatio) {
        cropHeight = videoHeight;
        cropWidth = cropHeight * frameAspectRatio;
        cropX = (videoWidth - cropWidth) / 2;
        cropY = 0;
    } else {
        cropWidth = videoWidth;
        cropHeight = cropWidth / frameAspectRatio;
        cropX = 0;
        cropY = (videoHeight - cropHeight) / 2;
    }

    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    stopCamera();

    canvas.toBlob(blob => {
        state.photoBlob = blob;
        displayPreview(blob);
    }, 'image/jpeg', 0.95);
}

function displayPreview(blob) {
    const previewImg = document.getElementById('preview-image');
    if (previewImg) {
        previewImg.src = URL.createObjectURL(blob);
    }
    showScreen('preview');
}

// ==========================================================================
// 6. Processing & Manifestation Sequence
// ==========================================================================
async function startProcessing() {
    showScreen('result');

    const loadingView = document.getElementById('loading-view');
    const resultImg = document.getElementById('result-image');
    const actions = document.getElementById('result-actions');

    if (loadingView) loadingView.style.display = 'flex';
    if (resultImg) resultImg.style.display = 'none';
    if (actions) actions.style.display = 'none';

    // Reset transfer action buttons
    resetTransferButtons();

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

            // Update loading message from backend if available
            if (data.message) {
                const subTitleEl = document.getElementById('manifest-subtitle');
                if (subTitleEl) subTitleEl.textContent = data.message;
            }

            if (data.status === 'completed') {
                clearInterval(state.pollInterval);
                state.pollInterval = null;

                const loadingView = document.getElementById('loading-view');
                const resultImg = document.getElementById('result-image');
                const actions = document.getElementById('result-actions');

                // Instantly display completed portrait (no reveal button needed)
                if (loadingView) loadingView.style.display = 'none';
                if (resultImg && data.image) {
                    resultImg.src = data.image;
                    resultImg.style.display = 'block';
                }
                if (actions) {
                    actions.style.display = 'flex';
                }

                resetTransferButtons();
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

function resetTransferButtons() {
    const animBtn = document.getElementById('animate-btn');
    if (animBtn) {
        animBtn.innerHTML = '<span class="btn-icon">🎬</span><span class="btn-text">Print & Animate</span>';
        animBtn.disabled = false;
        animBtn.style.opacity = '';
        animBtn.style.cursor = '';
    }
    const printBtn = document.getElementById('transfer-print-btn');
    if (printBtn) {
        printBtn.innerHTML = '<span class="btn-icon">🖨️</span><span class="btn-text">Print Only</span>';
        printBtn.disabled = false;
        printBtn.style.opacity = '';
        printBtn.style.cursor = '';
    }
}

// ==========================================================================
// 7. Photobooth Transfer (Port 5001 Receiver), Regenerate & Reset
// ==========================================================================
async function handlePrintOnly() {
    if (!state.jobId) return;
    const btn = document.getElementById('transfer-print-btn');
    if (!btn) return;
    const origHtml = btn.innerHTML;

    try {
        btn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Sending...</span>';
        btn.disabled = true;

        const res = await fetch(`/api/transfer_print_only/${state.jobId}`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            btn.innerHTML = '<span class="btn-icon">🖨️</span><span class="btn-text">View photobooth to print</span>';
        } else {
            throw new Error(data.error || 'Transfer failed');
        }
    } catch (err) {
        console.error('Print-only transfer error:', err);
        alert('Failed to send for printing: ' + err.message);
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

async function handlePrintAndAnimate() {
    if (!state.jobId) return;
    const btn = document.getElementById('animate-btn');
    if (!btn) return;
    const origHtml = btn.innerHTML;

    try {
        btn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Sending...</span>';
        btn.disabled = true;

        const res = await fetch(`/api/transfer/${state.jobId}`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            btn.innerHTML = '<span class="btn-icon">🚀</span><span class="btn-text">View Animation in Photobooth</span>';
        } else {
            throw new Error(data.error || 'Transfer failed');
        }
    } catch (err) {
        console.error('Print & animate transfer error:', err);
        alert('Failed to send for animation: ' + err.message);
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

function handleRegenerate() {
    if (state.photoBlob) {
        startProcessing();
    }
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
