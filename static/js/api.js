export async function uploadAndProcess(photoBlob, selections) {
    const formData = new FormData();
    formData.append('image', photoBlob, 'photo.jpg');
    formData.append('gender', selections.gender || 'female');
    formData.append('pose', selections.pose || '');
    formData.append('clothes_style', selections.clothesStyle || '');
    formData.append('background', selections.background || '');
    formData.append('enable_lucky_number', selections.enableLuckyNumber ? 'true' : 'false');

    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        return data.job_id;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
}

export async function checkStatus(jobId) {
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
