# Step 4: Pose Selection - Technical Journey

## 1. Overview
Users select a pose from a grid of options. This selection guides the AI on how to structure the subject in the final generation.

## 2. Technical Implementation Details
- **Data Source**: `static/js/data.js` exports the `poses` array containing codes (e.g., `P01`), titles, and descriptions.
- **Rendering**: `ui.js` dynamically generates HTML cards based on this data.
- **Styling**: `style.css` manages the grid layout (`.pose-grid`) and card appearance (`.selection-card`).

## 3. Development Journey (From Logs)

### Initial Static Implementation (Ref: `Part1`)
- **Hardcoding**: Originally, buttons and options were hardcoded directly in `index.html`.
- **Limitation**: Hard to maintain or update options.

### Refactoring to Dynamic Data (Ref: `Part3`)
- **Action**: Extracted hardcoded HTML into `data.js`.
- **Logic**: Created a `renderSelections()` function in `ui.js` that loops through the data arrays and builds the DOM elements.
- **Benefit**: Adding a new pose is now as simple as adding an object to the array in `data.js`.

### Enhancing Visuals (Ref: `Part4`)
- **Thumbnails**: Added images for each pose to help users visualize the option.
  - *Interaction*: Implemented "click to expand" behavior for thumbnails.
- **Layout Adjustments**:
  - *Grid Layout*: Optimized `.selection-grid` to handle image thumbnails alongside text.
  - *Mobile*: Adjusted column counts for smaller screens.

### Layout Fixes (Ref: `Part2`)
- **Bottom Cutoff**: Users reported the "Back" button was cut off on smaller screens.
- **Fix**: Reduced padding in `.selection-card`, tightened grid gaps (`var(--spacing-sm)`), and decreased font sizes to make the content more compact vertically.
