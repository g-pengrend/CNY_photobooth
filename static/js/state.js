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
