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

### Gallery Grid (Ref: Code Analysis)
- **Structure**: CSS Grid layout (`.gallery-grid`) to display cards.
- **Modal Interaction**: Clicking a card opens a detailed modal view.
- **Auto-Update**: JavaScript polling ensures that as soon as ComfyUI finishes a video, the gallery updates without requiring a page refresh.

### Video Playback
- **Implementation**: HTML5 `<video>` tag with `autoplay`, `loop`, and `muted` attributes.
- **Optimization**: Videos are only loaded when status is 'completed' to save bandwidth and processing power.
