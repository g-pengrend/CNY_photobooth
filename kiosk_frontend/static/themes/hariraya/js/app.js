import { state, resetState, setLastPhotoBlob, setCurrentJobId } from '/static/shared/js/state.js';
import {
    showScreen,
    showResultState,
    updateLoadingMessage,
    displayError,
    displaySuccessImage,
    displayPreviewImage,
    renderSelections,
    prepareProcessingVisuals,
    updateAnalytics,
    showRevealButton
} from './ui.js';
import { initCamera, stopCamera, capturePhoto } from '/static/shared/js/camera.js';
import { uploadAndProcess, checkStatus } from '/static/shared/js/api.js';

// Poll Status Logic
function pollStatus(jobId) {
    const pollInterval = setInterval(async () => {
        try {
            const status = await checkStatus(jobId);

            // Update loading message
            updateLoadingMessage(status.message || 'Processing...');

            // Update Analytics
            if (status.analytics) {
                updateAnalytics(status.analytics);
            }

            if (status.status === 'completed') {
                clearInterval(pollInterval);
                displaySuccessImage(status.image);
            } else if (status.status === 'failed') {
                clearInterval(pollInterval);
                displayError(status.error || 'Processing failed');
            }
            // If status is 'queued' or 'processing', continue polling
        } catch (error) {
            clearInterval(pollInterval);
            displayError('Failed to check processing status');
        }
    }, 2000); // Poll every 2 seconds
}

// Event Handlers
document.addEventListener('DOMContentLoaded', () => {

    // Render Dynamic Content
    renderSelections();

    // Core Navigation
    document.getElementById('start-btn').addEventListener('click', () => {
        showScreen('options');
    });

    document.getElementById('back-to-start-btn').addEventListener('click', () => {
        stopCamera();
        showScreen('background');
    });


    // Camera Capture (Both top and bottom buttons)
    ['capture-btn', 'capture-btn-top'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', async () => {
                try {
                    // Capture photo
                    const photoBlob = await capturePhoto();
                    setLastPhotoBlob(photoBlob);

                    // Stop camera
                    stopCamera();

                    // Show preview screen with captured photo
                    displayPreviewImage(photoBlob);
                    showScreen('preview');

                } catch (error) {
                    console.error('Error capturing photo:', error);
                    displayError('Failed to capture photo');
                }
            });
        }
    });

    // Upload Photo Handler
    const uploadTriggerBtn = document.getElementById('upload-trigger-btn');
    const photoUploadInput = document.getElementById('photo-upload');

    if (uploadTriggerBtn && photoUploadInput) {
        uploadTriggerBtn.addEventListener('click', () => {
            photoUploadInput.click();
        });

        photoUploadInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                const blob = new Blob([file], { type: file.type });

                setLastPhotoBlob(blob);
                stopCamera();

                displayPreviewImage(blob);
                showScreen('preview');

                // Reset input
                photoUploadInput.value = '';
            }
        });
    }

    // Confirm Photo button - proceed with processing
    document.getElementById('confirm-photo-btn').addEventListener('click', async () => {
        if (state.lastPhotoBlob) {
            // Reset buttons first
            const animateBtn = document.getElementById('animate-btn');
            if (animateBtn) {
                animateBtn.innerHTML = '<span class="btn-text">Print & Animate</span><span class="btn-icon">🎬</span>';
                animateBtn.disabled = false;
            }
            const printBtn = document.getElementById('print-btn');
            if (printBtn) {
                printBtn.innerHTML = '<span class="btn-text">TBC</span><span class="btn-icon"></span>';
                printBtn.disabled = true;
                printBtn.style.opacity = '0.5';
            }
            const transferPrintBtn = document.getElementById('transfer-print-btn');
            if (transferPrintBtn) {
                transferPrintBtn.innerHTML = '<span class="btn-text">Print Only</span><span class="btn-icon">🖨️</span>';
                transferPrintBtn.disabled = false;
                transferPrintBtn.style.background = '';
                transferPrintBtn.style.color = '';
                transferPrintBtn.style.border = '';
            }

            try {
                // Show result screen with loading state
                showScreen('result');
                showResultState('loading');
                prepareProcessingVisuals(state.lastPhotoBlob);

                // Upload and start processing
                const jobId = await uploadAndProcess(state.lastPhotoBlob, state.selections);
                setCurrentJobId(jobId);

                // Start polling for results
                pollStatus(jobId);
            } catch (error) {
                console.error('Error uploading photo:', error);
                displayError('Failed to upload photo');
                showScreen('result');
            }
        }
    });

    // Retake Photo button - go back to camera
    document.getElementById('retake-photo-btn').addEventListener('click', async () => {
        showScreen('camera');
        await initCamera();
    });

    // Print button - triggers server-side printing (GREYED OUT)
    const printBtnElement = document.getElementById('print-btn');
    if (printBtnElement) {
        printBtnElement.disabled = true;
        printBtnElement.style.opacity = '0.5';
        printBtnElement.style.cursor = 'not-allowed';
        printBtnElement.style.pointerEvents = 'none';
    }

    // Send for Printing (Transfer Only)
    const transferPrintBtn = document.getElementById('transfer-print-btn');
    if (transferPrintBtn) {
        transferPrintBtn.addEventListener('click', async () => {
            if (!state.currentJobId) return;

            const btn = document.getElementById('transfer-print-btn');
            const originalContent = btn.innerHTML;

            try {
                btn.innerHTML = '<span class="btn-text">Sending...</span>';
                btn.disabled = true;

                const response = await fetch(`/api/transfer_print_only/${state.currentJobId}`, { method: 'POST' });
                const result = await response.json();

                if (response.ok) {
                    btn.innerHTML = '<span class="btn-text">View photobooth to print</span>';
                    btn.style.background = 'rgba(255, 255, 255, 0.1)';
                    btn.style.color = '#D4AF37';
                    btn.style.border = '1px solid #D4AF37';
                } else {
                    throw new Error(result.error || 'Transfer failed');
                }
            } catch (error) {
                console.error('Transfer Error:', error);
                alert('Failed to send for printing: ' + error.message);
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        });
    }

    // Regenerate button - reprocess the same photo with current selections
    document.getElementById('regenerate-btn').addEventListener('click', async () => {
        if (state.lastPhotoBlob) {
            // Reset buttons first
            const animateBtn = document.getElementById('animate-btn');
            if (animateBtn) {
                animateBtn.innerHTML = '<span class="btn-text">Print & Animate</span><span class="btn-icon">🎬</span>';
                animateBtn.disabled = false;
            }
            const printBtn = document.getElementById('print-btn');
            if (printBtn) {
                printBtn.innerHTML = '<span class="btn-text">TBC</span><span class="btn-icon"></span>';
                printBtn.disabled = true;
                printBtn.style.opacity = '0.5';
            }
            const transferPrintBtn = document.getElementById('transfer-print-btn');
            if (transferPrintBtn) {
                transferPrintBtn.innerHTML = '<span class="btn-text">Print Only</span><span class="btn-icon">🖨️</span>';
                transferPrintBtn.disabled = false;
                transferPrintBtn.style.background = '';
                transferPrintBtn.style.color = '';
                transferPrintBtn.style.border = '';
            }

            // Show result screen with loading state
            showScreen('result');
            showResultState('loading');
            prepareProcessingVisuals(state.lastPhotoBlob);

            try {
                // Reprocess with the same photo
                const jobId = await uploadAndProcess(state.lastPhotoBlob, state.selections);
                setCurrentJobId(jobId);
                pollStatus(jobId);
            } catch (error) {
                console.error('Error regenerating:', error);
                displayError('Failed to regenerate image');
            }
        }
    });

    // Animate button - trigger transfer to Linux
    document.getElementById('animate-btn').addEventListener('click', async () => {
        if (!state.currentJobId) return;

        const animateBtn = document.getElementById('animate-btn');
        const originalText = animateBtn.innerHTML;

        try {
            animateBtn.innerHTML = '<span class="btn-text">Sending...</span>';
            animateBtn.disabled = true;

            const response = await fetch(`/api/transfer/${state.currentJobId}`, { method: 'POST' });
            const result = await response.json();

            if (response.ok) {
                animateBtn.innerHTML = '<span class="btn-text">Sent! 🚀</span>';
                animateBtn.innerHTML = '<span class="btn-text">View Animation in Photobooth</span>';
            } else {
                throw new Error(result.error || 'Transfer failed');
            }
        } catch (error) {
            console.error('Transfer Error:', error);
            alert('Failed to send to Linux: ' + error.message);
            animateBtn.innerHTML = originalText;
            animateBtn.disabled = false;
        }
    });

    // Start Over button - return to welcome screen
    document.getElementById('start-over-btn').addEventListener('click', () => {
        resetState();
        showScreen('welcome');
    });

    document.getElementById('retry-error-btn').addEventListener('click', async () => {
        showScreen('camera');
        await initCamera();
    });

    // Options Screen Handlers
    document.getElementById('back-to-welcome-btn').addEventListener('click', () => {
        showScreen('welcome');
    });

    // Gender Selection
    document.querySelectorAll('.gender-option[data-gender]').forEach(button => {
        button.addEventListener('click', async () => {
            // Update selected gender
            state.selections.gender = button.dataset.gender;

            // Update UI to show selection
            document.querySelectorAll('.gender-option').forEach(btn => {
                btn.classList.remove('selected');
            });
            button.classList.add('selected');

            console.log('Selected gender:', state.selections.gender);

            // Proceed to pose screen
            showScreen('pose');
        });
    });

    // Pose Selection Handlers (Event Delegation)
    document.getElementById('back-to-gender-btn').addEventListener('click', () => {
        showScreen('options');
    });



    const poseGrid = document.querySelector('.pose-grid');
    if (poseGrid) {
        poseGrid.addEventListener('click', (e) => {
            const button = e.target.closest('.selection-card');
            if (button) {
                state.selections.pose = button.dataset.pose;
                state.selections.poseCode = button.dataset.code;

                // Update UI to show selection
                poseGrid.querySelectorAll('.selection-card').forEach(btn => {
                    btn.classList.remove('selected');
                });
                button.classList.add('selected');

                console.log('Selected pose:', state.selections.pose, 'Code:', state.selections.poseCode);

                // Proceed to clothes screen
                setTimeout(() => showScreen('clothes'), 300);
            }
        });
    }

    // Clothes Selection Handlers (Event Delegation)
    document.getElementById('back-to-pose-btn').addEventListener('click', () => {
        showScreen('pose');
    });

    const clothesGrid = document.querySelector('.clothes-grid');
    if (clothesGrid) {
        clothesGrid.addEventListener('click', (e) => {
            const button = e.target.closest('.selection-card');
            if (button) {
                state.selections.clothesStyle = button.dataset.clothes;
                state.selections.clothesCode = button.dataset.code;

                // Update UI to show selection
                clothesGrid.querySelectorAll('.selection-card').forEach(btn => {
                    btn.classList.remove('selected');
                });
                button.classList.add('selected');

                console.log('Selected clothes:', state.selections.clothesStyle, 'Code:', state.selections.clothesCode);

                // Proceed to background screen
                setTimeout(() => showScreen('background'), 300);
            }
        });
    }

    // Background Selection Handlers (Event Delegation)
    document.getElementById('back-to-clothes-btn').addEventListener('click', () => {
        showScreen('clothes');
    });

    const backgroundGrid = document.querySelector('.background-grid');
    if (backgroundGrid) {
        backgroundGrid.addEventListener('click', (e) => {
            const button = e.target.closest('.selection-card');
            if (button) {
                state.selections.background = button.dataset.background;
                state.selections.backgroundCode = button.dataset.code;

                // Update UI to show selection
                backgroundGrid.querySelectorAll('.selection-card').forEach(btn => {
                    btn.classList.remove('selected');
                });
                button.classList.add('selected');

                console.log('Selected background:', state.selections.background, 'Code:', state.selections.backgroundCode);

                // Proceed to camera screen
                setTimeout(async () => {
                    showScreen('camera');
                    await initCamera();
                }, 300);
            }
        });
    }

    // Initialize
    showScreen('welcome');
    console.log('🎊 Hari Raya Photo Booth initialized');
    console.log('📸 Click Start to begin!');

});
