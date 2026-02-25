# Step 13: Gallery Display (Receiver UI) - Technical Journey

## 1. Overview
The Receiver also serves a public-facing gallery on a large screen, showing real-time progress of video generation.

## 2. Technical Implementation Details
- **Template**: `templates/receiver_index.html`.
- **Logic**: Polls `/api/jobs` to update the gallery grid.
- **States**:
  - **Pending**: Shows the static image with a loading spinner.
  - **Completed**: Automatically plays the generated video in a loop.

## 3. Development Journey

### Gallery Grid & Auto-Update
- **Structure**: CSS Grid layout (`.gallery-grid`) handles the visual display of status cards mapping to the jobs dictionary.
- **Diff-based Polling**: The frontend uses `setInterval` to fetch `/api/jobs` every 2 seconds. To prevent the UI from flickering, it performs a stringified JSON comparison and only re-renders the gallery and the open modal when an actual state change is detected.

### Interactive Modal Interface
- **Layout Adjustments**: The detailed view was upgraded to a wide, horizontally scrolling modal layout displaying the Generated Target side-by-side with the Final Video.
- **Dynamic Elements**: 
  - The video container seamlessly swaps between a CSS loading spinner (`.spinner`) and the actual HTML5 `<video>` element once the job hits the 'completed' state.
  - A conditional QR Code button appears inside the modal only when the video successfully finishes.

### Admin Configuration
- **Settings Modal**: Added a hidden 'Settings' icon (gear) in the top-right corner mapped to `/api/settings`. 
- **URL Override**: This allows the photobooth operator to manually inject or override the Cloudflare `trycloudflare.com` URL if the backend `tunnel.log` automated parsing fails.
