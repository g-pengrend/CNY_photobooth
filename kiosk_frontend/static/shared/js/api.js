export async function uploadAndProcess(photoBlob, selections) {
    const formData = new FormData();
    const themeMatch = window.location.pathname.match(/\/([^\/]+)/);
    const validThemes = ['cny', 'hariraya', 'uits', 'deepavali', 'ndp2026'];
    const apiTheme = (themeMatch && validThemes.includes(themeMatch[1])) ? themeMatch[1] : 'cny';
    
    formData.append('theme', selections.theme || apiTheme);
    formData.append('image', photoBlob, 'photo.jpg');
    formData.append('gender', selections.gender || 'female');
    formData.append('pose', selections.pose || '');
    formData.append('pose_code', selections.poseCode || '');
    formData.append('clothes_style', selections.clothesStyle || '');
    formData.append('clothes_code', selections.clothesCode || '');
    formData.append('background', selections.background || '');
    formData.append('background_code', selections.backgroundCode || '');
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
