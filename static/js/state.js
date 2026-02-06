export const state = {
    currentJobId: null,
    cameraStream: null,
    lastPhotoBlob: null,
    selections: {
        gender: null,
        pose: null,
        clothesStyle: null,
        background: null,
        enableLuckyNumber: true  // Default to enabled
    }
};

export function resetState() {
    state.currentJobId = null;
    state.lastPhotoBlob = null;
    state.selections = {
        gender: null,
        pose: null,
        clothesStyle: null,
        background: null,
        enableLuckyNumber: true
    };
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
