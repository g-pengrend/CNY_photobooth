# CNY Photobooth - User Journey & System Process

## 1. Welcome Screen
- **User Action**: The user approaches the booth and sees the "Welcome Screen" with dynamic CNY decorations (lanterns, banners, floating elements).
- **System**: Displays a "Start" button (`#start-btn`).
- **Options**: 
  - There is a hidden/subtle "Settings" gear icon for configuring the remote Linux receiver URL.

## 2. Gender Selection
- **User Action**: User clicks "Start" and is taken to the Gender Selection screen.
- **Choices**: Male or Female.
- **System**: Stores the selection (`selectedGender`).

## 3. Settings (Lucky Number)
- **User Action**: User is asked if they want a "Lucky Scientific Analysis" (Lucky Number).
- **Choices**: Yes or No.
- **System**: Stores the preference (`enableLuckyNumber`). 
  - If "Yes", the system will later run facial analysis to generate a unique 4-digit number.
  - If "No", a random number/blessing might still be used as fallback depending on backend logic, but the prompt emphasizes the lack of "scientific" analysis.

## 4. Pose Selection
- **User Action**: User selects a pose from a grid of options (e.g., "The Warm Welcome", "The Eye-Smile", "The Wink & Peace").
- **System**: 
  - Loads options dynamically from `data.js`.
  - Stores the selected pose code (e.g., `P01`) and description.

## 5. Outfit Selection
- **User Action**: User selects an outfit/style.
- **Choices**: 
  - **Male**: Magua, Tangzhuang, Daopa, etc.
  - **Female**: Qipao, Ruqun, Ao-Qun, etc.
  - **Unisex**: Celestial Traveler, etc.
- **System**: Stores the selected clothes code (e.g., `C01`) and prompt description.

## 6. Background Selection
- **User Action**: User selects a background theme (e.g., "The Dragon's Peak", "The Floating Lantern Sea").
- **System**: Stores the selected background code (e.g., `B01`) and prompt description.

## 7. Camera Capture
- **User Action**: 
  - User sees a live camera feed with a "Face Guide" overlay.
  - User positions themselves within the frame.
  - User clicks "Capture Photo" OR "Upload a photo".
- **System**: 
  - **Capture**: Crops the middle 1/3 of the video feed (to match the vertical aspect ratio) and creates a generic JPEG blob.
  - **Upload**: Accepts an image file from the device storage.

## 8. Photo Preview
- **User Action**: User reviews the captured/uploaded photo.
- **Options**:
  - **"Retake"**: Returns to Camera screen.
  - **"Looks Good!"**: Confirms and proceeds to processing.

## 9. Processing (The Magic)
- **User Action**: User sees a "Creating Magic..." loading screen with valid/fake analytics visuals.
- **System (Frontend)**:
  - Uploads the photo and all selections (gender, pose, clothes, background, lucky number preference) to `/api/process`.
  - Polls `/api/status/<job_id>` every 2 seconds.
- **System (Backend)**:
  - **Job Queue**: Creates a job with a unique UUID.
  - **Face Analysis**: If enabled, runs `face_analysis.py` to generate a "Lucky Number" based on facial landmarks.
  - **ComfyUI Integration**: 
    - Loads the `ZIT_FaceSwapAPI_1(CNY).json` workflow.
    - Encodes the input image to Base64.
    - Updates KSampler seed (randomized).
    - Injects the prompt text (combining User's Style + Pose + Background + Gender).
    - Sends the workflow to the local ComfyUI instance via WebSocket.
  - **Generation**: Waits for ComfyUI to return the generated image.
  - **Storage**: Saves the result to `outputs/`.

## 10. Result Reveal
- **User Action**: 
  - Once processing is complete, a "Reveal Result" button appears.
  - User clicks it to see the final generated image (Face Swapped + Styled).

## 11. Post-Generation Options
- **Print**: 
  - **User Action**: Clicks "Print".
  - **System**: Sends a request to `/api/print/<job_id>`. The server attempts to print the file using the default system printer (Windows `os.startfile(..., "print")`).
- **Animate (Transfer)**:
  - **User Action**: Clicks "Animate!".
  - **System**: Sends a request to `/api/transfer/<job_id>`. The server uploads the original and generated images to a configured Linux machine for 3D/video generation.
- **Regenerate**:
  - **User Action**: Clicks "Regenerate".
  - **System**: Re-runs the entire process with the *same* photo and settings but a new random seed.
- **Start Over**:
  - **User Action**: Clicks "Start Over".
  - **System**: Resets all state and returns to the Welcome Screen.

## 12. Animation Processing (Linux Receiver)
- **Context**: This happens on a separate machine (Linux) acting as a render node and gallery display.
- **System**:
  - **Reception**: Receives the original and generated images from the main booth.
  - **Job Creation**: Creates a new job entry.
  - **Prompt Injection**: 
    - Analyzes the filename to find the style code (e.g., `C01`).
    - Injects specific "Lighting" and "Style Description" prompts into the `FLF_workflowAPI.json` ComfyUI workflow.
  - **Queueing**: Sends the workflow to the local ComfyUI instance to generate a video/animation.

## 13. Gallery Display (Receiver UI)
- **User Action**: 
  - The crowd or user looks at a large screen/TV running the Receiver Gallery (`http://localhost:5001`).
  - Cards appear in the grid: 
    - **Pending**: Shows the generated photo with a spinner.
    - **Completed**: Updates automatically when the video is ready.
- **User Interaction**:
  - **Modal**: Plays the generated video (autoplay/loop) and shows the target photo.
  - User taps/clicks their card to open a **Modal View**.

## 14. Mobile Download (QR Code)
- **User Action**: 
  - Inside the Gallery Modal, the user clicks **"Download to Mobile"**.
- **System**:
  - Generates a **QR Code**.
  - The QR code points to a public URL (via Cloudflare Tunnel) for the specific job (e.g., `https://<public-url>/mobile/view/<job_id>`).
- **User Interaction**:
  - User scans the QR code with their phone.
  - Opens `mobile_view.html` on their device.
  - **Download**: User can view and download both the generated Photo and Video directly to their phone.
