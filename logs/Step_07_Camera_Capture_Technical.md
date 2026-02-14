# Step 7: Camera Capture - Technical Journey

## 1. Overview
The core interaction where the user captures their photo. The system focuses on guiding the user to position their face correctly and ensuring high-quality capture.

## 2. Technical Implementation Details
- **Camera Access**: `camera.js` uses `navigator.mediaDevices.getUserMedia`.
- **Logic**: `app.js` handles the capture button, countdown (if any), and image processing (cropping).
- **Styling**: `style.css` overlays a guide frame on the video feed.

## 3. Development Journey (From Logs)

### Camera Access & Permissions (Ref: `Part1` & `Part5`)
- **Issue**: "Unable to access camera... undefined (reading 'getUserMedia')".
- **Root Cause**: Browser security restriction. `getUserMedia` requires a Secure Context (HTTPS or localhost).
- **Fix**: 
  - Added error handling in `camera.js` to detect insecure contexts and throw a clear error message.
  - Advised using `ngrok` or configuring HTTPS for remote access.
- **Browser Conflict**: Handled cases where another app (Zoom, Teams) held the camera lock. Added retry logic and `stopCamera()` cleanup to release resources.

### Guide Frame & Portrait Mode (Ref: `Part2`)
- **Constraint**: User wanted a "Portrait" orientation (vertical).
- **Guide Overlay**:
  - **Initial**: Static pixel width.
  - **Update**: Changed to `width: 90%` and `aspect-ratio: 3/4` (Red Border).
  - **Face Guide**: Replaced complex silhouette with a simple **Orange Oval** to indicate face position.
- **Smart Cropping (Ref: `Part6`)**:
  - **Logic**: The raw camera feed is usually 4:3 landscape (e.g., 640x480).
  - **Implementation**: `app.js`'s `capturePhoto()` function calculates the crop coordinates to extract *only* the area inside the guide frame (center 3:4 crop).
  - **Result**: The captured image matches exactly what the user saw in the frame, removing the "letterboxing" or wide-angle view.

### Mobile Responsiveness (Ref: `Part2`)
- **Issue**: "Buttons are now out of the page" on mobile.
- **Fix**:
  - Applied `max-height: 70vh` (desktop) and `60vh` (mobile) to the camera frame.
  - Used Flexbox to ensure the "Capture" button always sticks to the bottom of the viewport.
  - Added `min-height: 100vh` to the container to prevent layout collapse.
