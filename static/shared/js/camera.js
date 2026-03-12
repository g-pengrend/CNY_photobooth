import { state, setCameraStream } from './state.js';

export async function initCamera(retryCount = 0) {
    const maxRetries = 3;

    try {
        // Reset UI state
        const errorEl = document.getElementById('camera-error-message');
        const captureBtn = document.getElementById('capture-btn');
        if (errorEl) errorEl.style.display = 'none';
        if (captureBtn) captureBtn.style.display = '';

        // First, ensure any existing streams are stopped
        stopCamera();

        // Small delay to allow camera to be released
        await new Promise(resolve => setTimeout(resolve, 200));

        // Check if browser supports mediaDevices
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            // Check for older implementations or insecure context
            if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
                throw new Error('Camera requires HTTPS. Please access via https:// or localhost.');
            }
            throw new Error('Browser does not support camera access or context is insecure.');
        }

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        };

        console.log('Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setCameraStream(stream);

        const videoElement = document.getElementById('camera-feed');
        if (videoElement) {
            videoElement.srcObject = stream;

            // Wait for video to be ready
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    videoElement.play();
                    resolve();
                };
            });
        }

        console.log('Camera initialized successfully');
        console.log('Active camera:', stream.getVideoTracks()[0].label);

    } catch (error) {
        console.error('Error accessing camera:', error);

        // Retry logic for common issues (only for specific errors, not for missing API)
        if (retryCount < maxRetries && error.name !== 'TypeError' && !error.message.includes('HTTPS')) {
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
        } else if (error.message.includes('HTTPS')) {
            errorMessage = error.message; // Use the specific HTTPS error
        } else {
            errorMessage += `Error: ${error.message}`;
        }

        // Display error in the camera frame instead of redirecting
        const errorEl = document.getElementById('camera-error-message');
        const errorText = document.getElementById('camera-error-text');
        const captureBtn = document.getElementById('capture-btn');

        if (errorEl) {
            errorEl.style.display = 'flex';
            if (errorText) errorText.textContent = errorMessage;
        }

        if (captureBtn) captureBtn.style.display = 'none';
    }
}

export function stopCamera() {
    if (state.cameraStream) {
        console.log('Stopping camera...');
        state.cameraStream.getTracks().forEach(track => {
            track.stop();
            console.log(`Stopped track: ${track.label}`);
        });

        // Clear video element
        const videoElement = document.getElementById('camera-feed');
        if (videoElement) {
            videoElement.srcObject = null;
        }

        setCameraStream(null);
    }
}

export function capturePhoto() {
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('camera-canvas');

    if (!video || !canvas) return null;

    const context = canvas.getContext('2d');

    // Get video dimensions
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // The camera frame is displayed with a 3:4 aspect ratio (width:height)
    // We need to capture what's visible in that frame
    const frameAspectRatio = 3 / 4; // width / height
    const videoAspectRatio = videoWidth / videoHeight;

    let cropWidth, cropHeight, cropX, cropY;

    if (videoAspectRatio > frameAspectRatio) {
        // Video is wider than frame - crop sides
        cropHeight = videoHeight;
        cropWidth = cropHeight * frameAspectRatio;
        cropX = (videoWidth - cropWidth) / 2;
        cropY = 0;
    } else {
        // Video is taller than frame - crop top/bottom
        cropWidth = videoWidth;
        cropHeight = cropWidth / frameAspectRatio;
        cropX = 0;
        cropY = (videoHeight - cropHeight) / 2;
    }

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
