# Step 2: Gender Selection - Technical Journey

## 1. Overview
The Gender Selection screen allows the user to choose their target gender for the face swap customization. This selection influences the ComfyUI workflow prompt.

## 2. Technical Implementation Details
- **Frontend**: Two large card options (Male/Female) in `index.html`.
- **State Management**: `state.js` stores the `selectedGender`.
- **Styles**: `style.css` uses `.gender-option` classes with hover effects and distinct styling.

## 3. Development Journey (From Logs)

### Initial Implementation (Ref: `Part1`)
- **Requirement**: "Start with 1 option of selecting gender... result of male or female".
- **Backend Logic**:
  - Initially, the planner proposed conditional logic in Python (`if "female" in text...`).
  - **Optimization**: Switched to variable replacement. The workflow JSON text now uses a placeholder `"gender"`, which `comfy_processor.py` directly replaces with the selected value.
  - *Code Snippet*:
    ```python
    workflow["45"]["inputs"]["text"] = current_text.replace("gender", gender)
    ```

### Refactoring (Ref: `Part3`)
- **Modularization**: Moved the selection handling logic from a monolithic `app.js` to `ui.js` (rendering/transition) and `state.js` (data storage).
- **Event Delegation**: Updated event listeners to handle dynamic selection cards if needed, though Gender remains a static selection in the HTML structure compared to strictly dynamic lists like Pose/Background.

### UI Polish (Ref: `Part2`)
- **Grid Layout**: Ensured the two cards sit side-by-side using Flexbox/Grid.
- **Responsiveness**: Adjusted sizing for mobile devices to stack or scale down.
