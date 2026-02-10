// Screen Management
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

let currentJobId = null;
let cameraStream = null;
let lastPhotoBlob = null; // Store last captured photo for regeneration

// User selections
let selectedGender = 'female'; // Default gender
let selectedPose = '';
let selectedClothesStyle = '';
let selectedBackground = '';

// Navigation Functions
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function showResultState(stateName) {
    Object.values(states).forEach(state => state.style.display = 'none');
    states[stateName].style.display = 'block';
}

// Camera Functions
async function initCamera(retryCount = 0) {
    const maxRetries = 3;

    try {
        // First, ensure any existing streams are stopped
        stopCamera();

        // Small delay to allow camera to be released
        await new Promise(resolve => setTimeout(resolve, 200));

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        };

        console.log('Requesting camera access...');
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoElement = document.getElementById('camera-feed');
        videoElement.srcObject = cameraStream;

        // Wait for video to be ready
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });

        console.log('Camera initialized successfully');
        console.log('Active camera:', cameraStream.getVideoTracks()[0].label);

    } catch (error) {
        console.error('Error accessing camera:', error);

        // Retry logic for common issues
        if (retryCount < maxRetries) {
            console.log(`Retrying camera initialization (${retryCount + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            return initCamera(retryCount + 1);
        }

        // Show user-friendly error messages
        let errorMessage = 'Unable to access camera. ';

        if (error.name === 'NotAllowedError') {
            errorMessage += 'Please grant camera permissions and refresh the page.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No camera detected. Please connect a camera and try again.';
        } else if (error.name === 'NotReadableError') {
            errorMessage += 'Camera is in use by another application. Please close other apps and try again.';
        } else {
            errorMessage += `Error: ${error.message}`;
        }

        alert(errorMessage);
        showScreen('welcome');
    }
}

function stopCamera() {
    if (cameraStream) {
        console.log('Stopping camera...');
        cameraStream.getTracks().forEach(track => {
            track.stop();
            console.log(`Stopped track: ${track.label}`);
        });

        // Clear video element
        const videoElement = document.getElementById('camera-feed');
        if (videoElement) {
            videoElement.srcObject = null;
        }

        cameraStream = null;
    }
}

function capturePhoto() {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('camera-canvas');
    const context = canvas.getContext('2d');

    // Get video dimensions
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // The camera frame is displayed with a 3:4 aspect ratio (width:height)
    // We need to capture what's visible in that frame
    // Capture the middle 1/3 of the camera feed, covering the full vertical space
    const cropWidth = Math.floor(videoWidth / 3);
    const cropHeight = videoHeight;
    const cropX = Math.floor((videoWidth - cropWidth) / 2);
    const cropY = 0;

    // Set canvas to the cropped dimensions
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Draw the cropped portion of the video to canvas
    context.drawImage(
        video,
        cropX, cropY, cropWidth, cropHeight,  // Source rectangle (what to crop from video)
        0, 0, cropWidth, cropHeight            // Destination rectangle (where to draw on canvas)
    );

    // Convert canvas to blob
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/jpeg', 0.95);
    });
}

// API Functions
async function uploadAndProcess(imageBlob) {
    const formData = new FormData();
    formData.append('image', imageBlob, 'photo.jpg');
    formData.append('gender', selectedGender);
    formData.append('pose', selectedPose);
    formData.append('clothes_style', selectedClothesStyle);
    formData.append('background', selectedBackground);

    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.job_id;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
}

async function checkStatus(jobId) {
    try {
        const response = await fetch(`/api/status/${jobId}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error checking status:', error);
        throw error;
    }
}

function pollStatus(jobId) {
    const pollInterval = setInterval(async () => {
        try {
            const status = await checkStatus(jobId);

            // Update loading message
            document.getElementById('loading-message').textContent = status.message || 'Processing...';

            if (status.status === 'completed') {
                clearInterval(pollInterval);
                handleSuccess(status.image);
            } else if (status.status === 'failed') {
                clearInterval(pollInterval);
                handleError(status.error || 'Processing failed');
            }
            // If status is 'queued' or 'processing', continue polling
        } catch (error) {
            clearInterval(pollInterval);
            handleError('Failed to check processing status');
        }
    }, 2000); // Poll every 2 seconds
}

// Result Handlers
function handleSuccess(imageDataUrl) {
    const resultImage = document.getElementById('result-image');
    resultImage.src = imageDataUrl;
    showResultState('success');
}

function handleError(errorMessage) {
    document.getElementById('error-message').textContent = errorMessage;
    showResultState('error');
}

// Event Handlers
document.getElementById('start-btn').addEventListener('click', () => {
    showScreen('options');
});

document.getElementById('back-to-start-btn').addEventListener('click', () => {
    stopCamera();
    showScreen('background');
});

document.getElementById('capture-btn').addEventListener('click', async () => {
    try {
        // Capture photo
        const photoBlob = await capturePhoto();
        lastPhotoBlob = photoBlob; // Store for regeneration

        // Stop camera
        stopCamera();

        // Show preview screen with captured photo
        const previewImage = document.getElementById('preview-image');
        previewImage.src = URL.createObjectURL(photoBlob);
        showScreen('preview');

    } catch (error) {
        console.error('Error capturing photo:', error);
        handleError('Failed to capture photo');
    }
});

// Confirm Photo button - proceed with processing
document.getElementById('confirm-photo-btn').addEventListener('click', async () => {
    if (lastPhotoBlob) {
        try {
            // Show result screen with loading state
            showScreen('result');
            showResultState('loading');

            // Upload and start processing
            currentJobId = await uploadAndProcess(lastPhotoBlob);

            // Start polling for results
            pollStatus(currentJobId);
        } catch (error) {
            console.error('Error uploading photo:', error);
            handleError('Failed to upload photo');
            showScreen('result');
        }
    }
});

// Retake Photo button - go back to camera
document.getElementById('retake-photo-btn').addEventListener('click', async () => {
    showScreen('camera');
    await initCamera();
});

// Print button - prints only the generated image
document.getElementById('print-btn').addEventListener('click', () => {
    const resultImage = document.getElementById('result-image');
    if (resultImage && resultImage.src) {
        // Create a new window with only the image
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print CNY Photo</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    img {
                        max-width: 100%;
                        max-height: 100vh;
                        width: auto;
                        height: auto;
                    }
                    @media print {
                        body {
                            margin: 0;
                        }
                        img {
                            max-width: 100%;
                            height: auto;
                            page-break-inside: avoid;
                        }
                    }
                </style>
            </head>
            <body>
                <img src="${resultImage.src}" alt="CNY Photo" onload="window.print(); window.close();" />
            </body>
            </html>
        `);
        printWindow.document.close();
    }
});

// Regenerate button - reprocess the same photo with current selections
document.getElementById('regenerate-btn').addEventListener('click', async () => {
    if (lastPhotoBlob) {
        // Show result screen with loading state
        showScreen('result');
        showResultState('loading');

        try {
            // Reprocess with the same photo
            currentJobId = await uploadAndProcess(lastPhotoBlob);
            pollStatus(currentJobId);
        } catch (error) {
            console.error('Error regenerating:', error);
            handleError('Failed to regenerate image');
        }
    }
});

// Start Over button - return to welcome screen
document.getElementById('start-over-btn').addEventListener('click', () => {
    // Reset selections
    selectedGender = 'female';
    selectedPose = '';
    selectedClothesStyle = '';
    selectedBackground = '';
    lastPhotoBlob = null;
    currentJobId = null;

    // Return to welcome screen
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

document.querySelectorAll('.gender-option').forEach(button => {
    button.addEventListener('click', async () => {
        // Update selected gender
        selectedGender = button.dataset.gender;

        // Update UI to show selection
        document.querySelectorAll('.gender-option').forEach(btn => {
            btn.classList.remove('selected');
        });
        button.classList.add('selected');

        console.log('Selected gender:', selectedGender);

        // Proceed to pose screen
        showScreen('pose');
    });
});

// Pose Selection Handlers
document.getElementById('back-to-gender-btn').addEventListener('click', () => {
    showScreen('options');
});

document.querySelectorAll('#pose-screen .selection-card').forEach(button => {
    button.addEventListener('click', () => {
        // Update selected pose
        selectedPose = button.dataset.pose;

        // Update UI to show selection
        document.querySelectorAll('#pose-screen .selection-card').forEach(btn => {
            btn.classList.remove('selected');
        });
        button.classList.add('selected');

        console.log('Selected pose:', selectedPose);

        // Proceed to clothes screen
        setTimeout(() => showScreen('clothes'), 300);
    });
});

// Clothes Selection Handlers
document.getElementById('back-to-pose-btn').addEventListener('click', () => {
    showScreen('pose');
});

document.querySelectorAll('#clothes-screen .selection-card').forEach(button => {
    button.addEventListener('click', () => {
        // Update selected clothes style
        selectedClothesStyle = button.dataset.clothes;

        // Update UI to show selection
        document.querySelectorAll('#clothes-screen .selection-card').forEach(btn => {
            btn.classList.remove('selected');
        });
        button.classList.add('selected');

        console.log('Selected clothes:', selectedClothesStyle);

        // Proceed to background screen
        setTimeout(() => showScreen('background'), 300);
    });
});

// Background Selection Handlers
document.getElementById('back-to-clothes-btn').addEventListener('click', () => {
    showScreen('clothes');
});

document.querySelectorAll('#background-screen .selection-card').forEach(button => {
    button.addEventListener('click', async () => {
        // Update selected background
        selectedBackground = button.dataset.background;

        // Update UI to show selection
        document.querySelectorAll('#background-screen .selection-card').forEach(btn => {
            btn.classList.remove('selected');
        });
        button.classList.add('selected');

        console.log('Selected background:', selectedBackground);

        // Proceed to camera screen
        setTimeout(async () => {
            showScreen('camera');
            await initCamera();
        }, 300);
    });
});

// Initialize
showScreen('welcome');
console.log('🎊 CNY Photo Booth initialized');
console.log('📸 Click Start to begin!');
