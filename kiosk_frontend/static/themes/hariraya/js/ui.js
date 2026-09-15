import { poses, clothes, backgrounds } from './data.js';

const screens = {
    welcome: document.getElementById('welcome-screen'),
    options: document.getElementById('options-screen'),
    pose: document.getElementById('pose-screen'),
    clothes: document.getElementById('clothes-screen'),
    background: document.getElementById('background-screen'),
    camera: document.getElementById('camera-screen'),
    preview: document.getElementById('preview-screen'),
    result: document.getElementById('result-screen')
};

const states = {
    loading: document.getElementById('loading-state'),
    success: document.getElementById('success-state'),
    error: document.getElementById('error-state')
};

export async function renderSelections() {
    let activePoses = poses;
    let activeClothes = clothes;
    let activeBackgrounds = backgrounds;

    try {
        const themeSlug = window.location.pathname.split('/').filter(Boolean)[0] || 'hariraya';
        const res = await fetch(`/api/theme/${themeSlug}/data`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.poses) && data.poses.length > 0) activePoses = data.poses;
            if (Array.isArray(data.clothes) && data.clothes.length > 0) activeClothes = data.clothes;
            if (Array.isArray(data.backgrounds) && data.backgrounds.length > 0) activeBackgrounds = data.backgrounds;
        }
    } catch (e) {
        console.warn("Using bundled fallback theme data:", e);
    }

    renderGrid('pose-grid', activePoses, (item) => `
        <button class="selection-card" data-pose="${escapeHtml(item.prompt || item.prompt_modifier || '')}" data-code="${item.code}">
            <div class="card-content-wrapper">
                <div class="card-thumbnail" onclick="event.stopPropagation(); expandImage('${item.image}')">
                    <img src="${item.image}" alt="${escapeHtml(item.title || item.name || '')}" onerror="this.style.display='none'">
                    <div class="expand-icon">🔍</div>
                </div>
                <div class="card-text">
                    <div class="card-title">${escapeHtml(item.title || item.name || '')}</div>
                    <div class="card-description">${escapeHtml(item.description || item.mapping_desc || '')}</div>
                </div>
            </div>
        </button>
    `);

    renderGrid('clothes-grid', activeClothes, (item) => `
        <button class="selection-card" data-clothes="${escapeHtml(item.prompt || item.prompt_modifier || '')}" data-code="${item.code}" data-category="${item.category}">
            <span class="category-badge ${item.category}">${capitalize(item.category)}</span>
            <div class="card-content-wrapper">
                <div class="card-thumbnail" onclick="event.stopPropagation(); expandImage('${item.image}')">
                    <img src="${item.image}" alt="${escapeHtml(item.title || item.name || '')}" onerror="this.style.display='none'">
                    <div class="expand-icon">🔍</div>
                </div>
                <div class="card-text">
                    <div class="card-title">${escapeHtml(item.title || item.name || '')}</div>
                    <div class="card-description">${escapeHtml(item.description || item.mapping_desc || '')}</div>
                </div>
            </div>
        </button>
    `);

    renderGrid('background-grid', activeBackgrounds, (item) => `
        <button class="selection-card" data-background="${escapeHtml(item.prompt || item.prompt_modifier || '')}" data-code="${item.code}">
            <div class="card-content-wrapper">
                <div class="card-thumbnail" onclick="event.stopPropagation(); expandImage('${item.image}')">
                    <img src="${item.image}" alt="${escapeHtml(item.title || item.name || '')}" onerror="this.style.display='none'">
                    <div class="expand-icon">🔍</div>
                </div>
                <div class="card-text">
                    <div class="card-title">${escapeHtml(item.title || item.name || '')}</div>
                    <div class="card-description">${escapeHtml(item.description || item.mapping_desc || '')}</div>
                </div>
            </div>
        </button>
    `);
}

function renderGrid(gridClass, items, templateFn) {
    const container = document.querySelector(`.${gridClass}`);
    if (!container) return;
    container.innerHTML = items.map(templateFn).join('');
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.remove('active');
    });
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    } else {
        console.error(`Screen not found: ${screenName}`);
    }
}

export function showResultState(stateName) {
    Object.values(states).forEach(state => {
        if (state) state.style.display = 'none';
    });
    if (states[stateName]) {
        states[stateName].style.display = 'block';
    }
}

export function updateLoadingMessage(message) {
    const el = document.getElementById('loading-message');
    if (el) el.textContent = message;
}

export function updateErrorMessage(message) {
    const el = document.getElementById('error-message');
    if (el) el.textContent = message;
}

export function displaySuccessImage(url) {
    const resultImage = document.getElementById('result-image');
    if (resultImage) {
        resultImage.src = url;
    }
    showResultState('success');
}

export function displayPreviewImage(blob) {
    const previewImage = document.getElementById('preview-image');
    if (previewImage) {
        previewImage.src = URL.createObjectURL(blob);
    }
}

export function displayError(message) {
    updateErrorMessage(message);
    showResultState('error');
}

// Processing Visuals
export function prepareProcessingVisuals(photoBlob) {
    const container = document.getElementById('processing-visuals');
    const img = document.getElementById('processing-source-image');
    const overlay = document.getElementById('analytics-overlay');
    const btn = document.getElementById('view-result-btn');
    const spinner = document.querySelector('.spinner-container');

    if (container) container.style.display = 'flex';
    if (spinner) spinner.style.display = 'block';

    if (img) {
        img.src = URL.createObjectURL(photoBlob);
        img.classList.remove('dematerialize');
        // Trigger reflow
        void img.offsetWidth;
        img.classList.add('dematerialize'); // Basic fade out
    }

    if (overlay) {
        overlay.innerHTML = '';
        overlay.classList.remove('visible');
    }
    
    if (btn) btn.style.display = 'none';

    // Show simple, festive loading text instead of analytics
    setTimeout(() => {
        if (overlay) {
            overlay.classList.add('visible');
            overlay.innerHTML = ''; // Start clean
            
            const blessings = [
                { text: "Selamat Hari Raya!", size: "1.4rem", color: "#eedd82", delay: 500 },
                { text: "Maaf Zahir dan Batin", size: "1.1rem", delay: 2500 },
                { text: "Weaving your festive songket...", size: "1.0rem", opacity: 0.8, delay: 5000 },
                { text: "Preparing traditional Kuih Raya...", size: "1.0rem", opacity: 0.8, delay: 8000 },
                { text: "Lighting the oil lamps...", size: "1.0rem", opacity: 0.8, delay: 11000 },
                { text: "Getting ready to celebrate!", size: "1.0rem", opacity: 0.8, delay: 13500 }
            ];

            blessings.forEach(b => {
                setTimeout(() => {
                    const item = document.createElement('div');
                    item.className = 'analytics-item';
                    item.style.fontSize = b.size;
                    if (b.color) item.style.color = b.color;
                    if (b.opacity) item.style.opacity = b.opacity; // Note: class animation will override this unless we are careful
                    item.textContent = b.text;
                    overlay.appendChild(item);
                }, b.delay);
            });
        }
    }, 1000);
}

export function updateAnalytics(analyticsData) {
    // For Hari Raya, we don't render face maps or measurements.
    // The static blessings in prepareProcessingVisuals are enough.
    return;
}

export function showRevealButton(onClick) {
    const btn = document.getElementById('view-result-btn');
    const spinner = document.querySelector('.spinner-container');
    if (spinner) spinner.style.display = 'none';

    if (btn) {
        btn.style.display = 'inline-flex';
        // Remove old listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.onclick = onClick;
    }
    updateLoadingMessage("Calculations Complete! Ready to manifest.");
}

// Modal Logic
window.expandImage = function (imageUrl) {
    let modal = document.getElementById('image-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-modal';
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <img class="modal-image" src="" alt="Expanded View">
            </div>
        `;
        document.body.appendChild(modal);

        // Close events
        modal.querySelector('.close-modal').onclick = () => {
            modal.style.display = 'none';
        };
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    const modalImg = modal.querySelector('.modal-image');
    modalImg.src = imageUrl;
    modal.style.display = 'flex';
};
