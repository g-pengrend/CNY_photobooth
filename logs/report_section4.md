4. Implementation Notes
The development progressed through several modular phases, transitioning from a monolithic prototype to a distributed, production-ready system.
The Welcome Screen serves as the attract mode for the photobooth. It features a visually striking "SEIT 4D Vision Studio" title, dynamic Chinese New Year (CNY) decorations, and a start interaction.
Initial Setup & Theming
Requirement: "Sleek and modern, with a Chinese New Year theme colours" (Ref: Part1).
Implementation: Created the basic structure with red/gold gradient backgrounds and glassmorphism effects.
The Gender Selection screen allows the user to choose their target gender for the face swap customization. This selection influences the ComfyUI workflow prompt.
The 4D number generator screen presents a "Scientific Analysis" of their face to generate a lucky 4-digit number. It distinguishes the experience by adding a customized, "AI-generated" fortune element.
Initial Proof of Concept:
Goal: Verify if the text-to-image model could handle dynamic variable inputs from Python inserted into the CLIP Text Encode node.
Method: Implemented a simple random number generator (0000-9999) in comfy_processor.py.
Verification: Confirmed that the lucky_num placeholder in the workflow JSON could be successfully replaced by the Python script and rendered in the final image.
Workflow Injection: The resulting string replaces the lucky_num placeholder in the ComfyUI workflow JSON.
4.1 Core Backend & Dynamic Workflow Mutation
API Export & Processor Scripting: ComfyUI workflows were exported as API-compatible JSON files. The Python backend (comfy_processor.py) establishes a WebSocket connection with the ComfyUI server to track progress asynchronously.
Dynamic Workflow Mutation (The Blueprint): The core of the generative logic resides in a "Blueprint" prompt (Node 45). Instead of static strings, the workflow JSON utilizes specific placeholders wrapped in escaped quotes (e.g., \"gender\", \"lucky_num\"). As detailed in Section 5.5, the processor performs surgical string replacements to inject user-selected variables before execution.
4.2 Detailed Frontend & Feature Development (Steps 1–8)
Scientific Analysis (Step 3b): The face_analysis.py module uses OpenCV to detect the face and analyze Sobel gradients and pixel symmetry to generate a 4-digit "Lucky Number."
Facial Analysis Deep Dive
1. Overview
This feature generates a "Lucky Number" based on the user's unique facial features, adding a layer of personalization and "scientific magic" to the experience.
2. Technical Implementation Details
Module: face_analysis.py.
Libraries: OpenCV (cv2), NumPy (numpy).
Algorithm: Detailed facial landmark and gradient analysis.
3. Development Journey (From Logs)
Source Code Integration (Ref: Part4)
Origin: The user provided a research script face_mapping_test/test_face.py containing the core logic.
Extraction: The logic was extracted and refactored into a clean, importable module face_analysis.py.
Algorithms & Logic
The generate_lucky_number_from_face(image_path) function performs the following steps:
Face Detection: Uses OpenCV's Haar Cascade classifier (haarcascade_frontalface_default.xml) to locate the face in the image. Returns "0000" if no face is verified.
Region of Interest (ROI): Crops the image to just the face area.
Feature Extraction:
Gradients: Calculates Sobel gradients (edges) in X and Y directions to measure facial texture/complexity.
Symmetry: Compares the left and right halves of the face (flipping one half) to calculate a symmetry score based on pixel differences.
Proportions: Analyzes the bounding box aspect ratio.
Number Generation (The "Magic"):
Digit 1 (Complexity): Based on average gradient magnitude (texture).
Digit 2 (Symmetry): Based on the raw symmetry difference score.
Digit 3 (Energy): Based on the high-frequency content (standard deviation of gradients).
Digit 4 (Harmony): A checksum-like derivation from the previous metrics to ensure variance.
Formatting: The final 4 digits are concatenated into a string (e.g., "8392").
Hook: comfy_processor.py imports face_analysis.
Execution: When process_image is called with enable_lucky_number=True, it passes the image path to the analysis function.
Output: The returned string is injected into the ComfyUI prompt.
Selection Screens (Pose, Outfit & Background)
[Pose Selection, Outfit selection and background selection follows the same workflow below]
1. Overview
Users select a pose from a grid of options. This selection guides the AI on how to structure the subject in the final generation.
2. Technical Implementation Details
Data Source: static/js/data.js exports the poses array containing codes (e.g., P01), titles, and descriptions.
Rendering: ui.js dynamically generates HTML cards based on this data.
Styling: style.css manages the grid layout (.pose-grid) and card appearance (.selection-card).
3. Development Journey (From Logs)
Initial Static Implementation (Ref: Part1)
Hardcoding: Originally, buttons and options were hardcoded directly in index.html.
Limitation: Hard to maintain or update options.
Refactoring to Dynamic Data (Ref: Part3)
Action: Extracted hardcoded HTML into data.js.
Logic: Created a renderSelections() function in ui.js that loops through the data arrays and builds the DOM elements.
Benefit: Adding a new pose is now as simple as adding an object to the array in data.js.
Enhancing Visuals (Ref: Part4)
Thumbnails: Added images for each pose to help users visualize the option.
Interaction: Implemented "click to expand" behavior for thumbnails.
UI Image Curation
The high-quality selection images for Gender, Pose, Outfit, and Background were not generic stock photos but engineered assets created through an iterative AI generation process. This ensures a consistent "Studio" aesthetic across the entire application.
Phase 1: Template Engineering
To achieve consistency, we moved away from ad-hoc prompting to a structured template system.
Goal: Create a reliable "product shot" look that can be easily masked (transparent background) and integrated into the UI cards.
Template Structure: [Studio Prefix] + [Variable Detail] + [Technical Suffix]
Phase 2: Prompt Refinement (The "Studio" Standard)
A finalized prompt format was established (Ref: logs/prompt_for_studio_pics.txt):
1. The Prefix (Setting the Stage):
"A professional studio product shot of a standalone {gender} outfit, featuring..."
Purpose: Defines the subject as an inanimate object or mannequin-style display, avoiding complex human faces that might distract from the clothing or pose choice.
2. The Variable Detail (The iterative part):
"Xianxia style female immortal, a multi-layered Ruqun... translucent floor-length outer robe... wide 'water sleeves'..."
Process: We iterated on this section for each specific option (e.g., modifying "Ruqun" to "Qipao" or "Tangzhuang").
Trial & Error: Adjusted adjectives like "moonlight silver", "iridescent", and "ethereal" until the generated texture matched the intended CNY theme.
3. The Suffix (The Technical Constraint):
"The outfit is displayed to maintain a 3D shape, centered composition, high-quality fabric textures, cinematic lighting, isolated on a solid black background for easy transparency masking."
Constraint: "Isolated on a solid black background" was critical for the UI team to easily remove the background and place the item into the CSS cards.
Constraint: "Maintain a 3D shape" ensures the clothes look filled out (as if worn) rather than flat.
Phase 3: Generation & Curation
Feed into Workflow: The engineered prompt is fed into the Text-to-Image (T2I) workflow.
Batch Generation: Generated batches of 4-8 images per prompt.
Curation: Selected the best image that:
Had the cleanest silhouette (for masking).
Matched the lighting of the other UI elements.
Clearly communicated the "vibe" of the selection (e.g., "Cool" vs "Elegant").
UI Integration: The final curated image is processed (background removed if necessary) and saved to static/images/.
Smart Cropping (Step 7): The camera feed is mathematically cropped in app.js to extract only the area inside the 3:4 portrait guide frame, ensuring optimal face-swapping alignment.
4.3 The Diffusion Engine Deep Dive (Step 09d)
To achieve high-fidelity generation in a retail-speed window, the system utilizes the specialized Z-Image-Turbo pipeline. This model represents a departure from traditional U-Net architectures, utilizing a Diffusion Transformer (DiT) backbone.
S3-DiT: Single-Stream Structural Diffusion Transformer: Unlike older models that "inject" text into image layers, Z-Image-Turbo employs S3-DiT. It treats image latent patches and text embeddings as a single sequence within a unified self-attention stream, ensuring superior attribute binding and text rendering.
Decoupled-DMD Efficiency: Standard models require 30–50 steps to denoise an image. Z-Image-Turbo utilizes Decoupled Distribution Matching Distillation to map a complex trajectory into a high-speed 8-step path, providing a massive leap in generation speed without loss of detail.
VAE Latent Compression: The VAE Encoder reduces spatial dimensions by a factor of 8 (e.g., 1024x1024 becomes 128x128 latents), allowing the Transformer to focus exclusively on core structural and semantic features.
(A comprehensive deep dive of the full text-to-image pipeline is provided in Section 5.3.)
4.4 Identity Grounding & High-Fidelity Swapping (Step 09e)
The final stage of the image pipeline involves integrating the user's unique identity into the generated "mannequin" image via the ReActor node.
Identity Embedding: The system extracts a 512-dimensional vector using ArcFace (Deng, J., et al., 2019). This mathematical "thumbprint" is surgically mapped onto the target image while preserving original lighting and expression.
Face Restoration: CodeFormer is applied (Zhou, S., et al., 2022) with a 0.5 blend weight. Unlike standard upscalers, it uses a codebook lookup transformer to "predict" missing high-resolution details like skin pores.
(A comprehensive deep dive of the ReActor FaceSwap mechanics is provided in Section 5.6.)
4.5 Result Presentation & Post-Generation Logic (Steps 10–11)
Once the generation is complete, the system manages the "reveal" and subsequent user choices.
Layout Optimization (Step 10): To prevent content clipping on various screen sizes, max-height constraints were moved from container divs directly to the img tags, utilizing object-fit: contain to ensure the 3:4 portrait remains fully visible.
Regenerate Logic: The system reuses the same input photo and prompt variables but injects a new randomized 64-bit integer into the KSampler seed node. This provides the user with a fresh composition while maintaining their custom settings.
Animate & Transfer: The "Animate" button triggers remote_transfer.py, which performs an HTTP POST of the original and generated images to the Linux receiver node.
4.6 Distributed Video Processing (Steps 12–14)
FLF Animation: Offloaded to the Linux Receiver via linux_receiver.py. It utilizes Wan 2.2 14B (Wan-AI Team, 2025) with a WanFirstLastFrameToVideo node to morph the real photo into the stylized portrait over 81 frames.
Architecture: The pipeline transitions from 2D spatial denoising to Temporal Latent Denoising, utilizing specialized Mixture-of-Experts (MoE) weights and ADD acceleration (Detailed in Section 5.8: FLF Video Generation Deep Dive).
Gallery & QR Download: The Receiver UI displays a real-time gallery using diff-based polling. Mobile downloads are enabled via a Cloudflare Tunnel, with the receiver parsing tunnel.log to generate public QR codes.
