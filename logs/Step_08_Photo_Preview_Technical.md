# Step 8: Photo Preview - Technical Journey

## 1. Overview
The user reviews the captured photo before proceeding. They can choose to "Retake" or confirm "Looks Good!".

## 2. Technical Implementation Details
- **Frontend Logic**: `app.js` handles the display of the captured blob.
- **Styling**: `style.css` ensures the preview image maintains its aspect ratio without distortion.

## 3. Development Journey (From Logs)

### Initial Implementation (Ref: `Part1`)
- **Basic Functionality**: Just a simple `img` tag source update.
- **Button logic**: "Retake" creates a new `stream`, "Looks Good" triggers the API upload.

### Layout Fixes (Ref: `Part2`)
- **Issue**: "Preview photo bottom is still slightly cut off" (Ref: `Part2`).
- **Fix**:
  - Adjusted `.preview-frame` max-height to `50vh` (desktop) and `45vh` (mobile).
  - Changed `object-fit` to `contain` to ensure the entire image is visible within the frame.
  - Added specific bottom margins to the action buttons container (`.preview-actions`) to prevent them from being pushed off-screen.

### Image clipping (Ref: `Part2`)
- **Refinement**: Moved the `max-height` constraint from the container div to the `img` tag itself. This allows the container to shrink-wrap the image naturally, preventing the "top half only" clipping issue reported by the user.
