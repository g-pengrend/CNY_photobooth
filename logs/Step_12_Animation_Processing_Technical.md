# Step 12: Animation Processing (Linux Receiver) - Technical Journey

## 1. Overview
This step occurs on a separate Linux machine. It handles the computationally expensive video generation using a specific ComfyUI workflow.

## 2. Technical Implementation Details
- **Receiver App**: `linux_receiver.py` (Flask) listens on port 5001.
- **Workflow**: `FLF_workflowAPI.json` defines the video generation pipeline.
- **Integration**:
  - Receives original and generated images via POST request.
  - Injects images into workflow nodes (Node 106 & 107).
  - Injects specific prompts based on the filename code (e.g., `C01` -> particular lighting/style).
  - Queues the workflow to the local ComfyUI instance.

## 3. Development Journey (From Logs)

### Receiver Setup (Ref: `Part6`)
- **Requirement**: "Send the generated image and the uploaded image to another computer... linux-based arm64".
- **Implementation**: Created `linux_receiver.py` to act as a dedicated render node.

### Workflow Automation (Ref: `Part6`)
- **Node Injection**:
  - Identified specific input nodes in `FLF_workflowAPI.json`.
  - **Error Handling**: Added checks for "API Format". ComfyUI workflows saved in "Web Format" lack the strict ID structure needed for API manipulation. The script now warns if expected nodes (106, 107) are missing.
- **Prompt Logic**:
  - Implemented logic to parse the incoming filename (e.g., `job_123_C01.jpg`).
  - Maps codes (e.g., `C01`) to specific text prompts for lighting and style to ensure the video matches the photo's aesthetic.

### Seed Management (Ref: `Part6`)
- **Decision**: Removed random seed generation for `linux_receiver.py`.
- **Reason**: The video generation workflow (`FLF`) relies on specific seeds to maintain temporal consistency or specific effects, so the script was updated to use the fixed seed from the JSON instead of ensuring randomness like the initial image generation.
