export const state = {
    currentJobId: null,
    cameraStream: null,
    lastPhotoBlob: null,
    selections: {
        gender: null,
        pose: null,
        poseCode: null,
        clothesStyle: null,
        clothesCode: null,
        background: null,
        backgroundCode: null,
        enableLuckyNumber: true  // Default to enabled
    }
};

export function resetState() {
    state.currentJobId = null;
    state.lastPhotoBlob = null;
    state.selections = {
        gender: null,
        pose: null,
        poseCode: null,
        clothesStyle: null,
        clothesCode: null,
        background: null,
        backgroundCode: null,
        enableLuckyNumber: true
    };

    // Reset buttons
    const animateBtn = document.getElementById('animate-btn');
    if (animateBtn) {
        animateBtn.innerHTML = '<span class="btn-text">Animate!</span><span class="btn-icon">🎬</span>';
        animateBtn.disabled = false;
        console.log("Animate button reset");
    }

    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
        printBtn.innerHTML = '<span class="btn-text">Print</span><span class="btn-icon">🖨️</span>';
        printBtn.disabled = false;
        console.log("Print button reset");
    }
}

export function setCameraStream(stream) {
    state.cameraStream = stream;
}

export function setLastPhotoBlob(blob) {
    state.lastPhotoBlob = blob;
}

export function setCurrentJobId(id) {
    state.currentJobId = id;
}

// Global Watermark Injection (Applies to all themes automatically)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Inject responsive CSS
        const style = document.createElement('style');
        style.textContent = `
            .global-collaborator-watermark {
                position: fixed; 
                bottom: 30px; 
                right: 30px; 
                z-index: 1000; 
                display: flex; 
                align-items: center; 
                gap: 15px; 
                background: rgba(0, 0, 0, 0.4); 
                padding: 10px 20px; 
                border-radius: 50px; 
                border: 1px solid rgba(255, 255, 255, 0.2); 
                backdrop-filter: blur(10px); 
                -webkit-backdrop-filter: blur(10px); 
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                pointer-events: none; /* Allows clicking through */
                color: #ffffff;
                font-family: 'Inter', sans-serif;
            }
            .watermark-text {
                font-size: 1rem;
                line-height: 1.3;
                text-align: right;
                opacity: 0.85;
                max-width: 300px; /* Limits width so it wraps naturally if needed */
            }
            .watermark-logos {
                display: flex;
                align-items: center;
                gap: 15px;
            }
            .watermark-logos img {
                height: 60px; 
                width: auto; 
                object-fit: contain; 
                opacity: 0.9; 
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
            }
            .watermark-separator {
                width: 1px; 
                height: 25px; 
                background: rgba(255, 255, 255, 0.3);
            }

            /* Responsive rules for Tablets and Portrait Mode */
            @media (max-width: 1024px) {
                .global-collaborator-watermark {
                    flex-direction: column;
                    align-items: flex-end;
                    border-radius: 20px;
                    padding: 12px 20px;
                    gap: 10px;
                }
                .watermark-text {
                    font-size: 0.75rem;
                }
            }

            /* Rules for Mobile/Smaller Screens */
            @media (max-width: 768px) {
                .global-collaborator-watermark {
                    bottom: 20px;
                    right: 20px;
                }
                .watermark-logos img {
                    height: 28px;
                }
                .watermark-separator {
                    height: 20px;
                }
            }
        `;
        document.head.appendChild(style);

        // Inject HTML
        const watermark = document.createElement('div');
        watermark.className = 'global-collaborator-watermark';

        watermark.innerHTML = `
            <div class="watermark-text">
                Developed by Staff and Students in <strong>ITE CC - Higher Nitec in AI Applications</strong>
            </div>
            <div class="watermark-logos">
                <img src="/static/shared/images/logos/ai-cc.png" alt="AI Applications" onerror="this.style.display='none'">
                <div class="watermark-separator"></div>
                <img src="/static/shared/images/logos/seit.avif" alt="SEIT" onerror="this.style.display='none'">
                <div class="watermark-separator"></div>
                <img src="/static/shared/images/logos/ite-cc.avif" alt="ITE College Central" onerror="this.style.display='none'">
            </div>
        `;

        document.body.appendChild(watermark);
    });
}
