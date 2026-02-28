5. Observations & Performance Analysis
5.1 The "Warm-Up" Phenomenon: Finding the Efficient Path
Initial generations are always slower because backend libraries (like cuDNN) must run internal benchmarks the first time they encounter a routine. The GPU essentially tests various algorithms to "find the most efficient mathematical path" for the specific hardware configuration.
Once this path is found, the GPU caches this execution graph in memory. This "warmed up" state is critical for speed; subsequent generations skip the benchmarking phase, resulting in the fast ~15s image outputs observed in isolation.
5.2 VRAM Bottlenecks & Context Switching
A significant bottleneck was observed when running the image and video workflows on a single 24GB RTX 4090. The total generation time spiked to 120s–240s.
Analysis of the logs revealed that the 24GB VRAM was insufficient to host both high-fidelity models simultaneously. To compensate, the system was performing constant context switching—unloading image models to make room for video models, and vice versa. This constant swapping destroyed the cuDNN optimized execution graphs, forcing the models into a "cold start" for every request. Decoupling the workflows across two machines solved this by allowing models to stay resident in VRAM.
5.3 Diffusion Model Workflow Deep Dive
1. Overview
Rather than treating ComfyUI as a "black box" that magically generates images, this document explores the underlying conceptual mechanics of the text-to-image pipeline used in ZIT_FaceSwapAPI_1(CNY).json. This deep dive explains how the foundational AI components interact to produce the final output.
2. The Core Triad: Models
Every diffusion workflow relies on three primary models loaded at the very beginning:
Model Weights (z_image_turbo_bf16): The "artist." This file contains the learned visual knowledge of the world. It is responsible for the actual denoising process—turning pure static into a cohesive image using the specialized S3-DiT architecture described below.
Diffusion Transformer (DiT) Architecture: Unlike older models that use a U-Net, Z-Image-Turbo uses a Transformer-based backbone. Instead of convolutional blocks and skip connections, it treats image patches like "words" in a sentence, allowing the model to learn much more complex relationships across the entire image simultaneously. (https://arxiv.org/abs/2212.09748)
Unified Conditioning via Scalable Single-Stream Diffusion (S3-DiT): Unlike traditional models that use separate cross-attention layers to "inject" text prompts into a U-Net, Z-Image-Turbo employs a Single-Stream Structural Diffusion Transformer (S3-DiT). This architecture processes text embeddings and image latent tokens within a unified self-attention stream. By treating text and pixels as a single sequence, the model ensures that every pixel is generated with a holistic understanding of the user's intent from the very first layer, leading to superior prompt adherence and text rendering. (https://arxiv.org/abs/2511.22699)
Efficiency via Decoupled Distribution Matching Distillation (Decoupled-DMD): Standard diffusion models typically require 30–50 (like stable diffusion 1.5) or 20-30 (like stable diffusion 3.0) iterative steps to "carve" an image from Gaussian noise. Z-Image-Turbo utilizes Decoupled-DMD. In this framework, the model is trained as a "Student" that learns to map the complex, multi-step denoising trajectory of a high-performance "Teacher" model into a significantly shorter path. This distillation process allows Z-Image-Turbo to produce high-fidelity, photorealistic images in just 8 steps, providing a massive leap in generation speed without the traditional loss of detail. (https://arxiv.org/abs/2511.22677)
CLIP (CLIPLoader / qwen_3_4b): Z-Image-Turbo utilizes Qwen-3-4B to bridge the gap between human language and visual concepts. While older models used a separate "injection" method, Z-Image-Turbo represents a fundamental shift in how the model "listens" to the prompt.
From "Injection" to "Conversation" (Self-Attention vs. Cross-Attention): In traditional U-Net models (like SDXL), text and images live in separate silos. The model uses Cross-Attention to "inject" text data into the image at specific intervals. In contrast, Z-Image-Turbo's S3-DiT architecture treats text and pixels as part of the same "sentence." By concatenating the text embeddings and image patches into a single sequence, the model uses Self-Attention to let text and pixels "talk" to each other directly in every layer.
Global Context Alignment: Because it deviates from the rigid Cross-Attention layers, the model doesn't just look for "keywords" to slap onto the image. Instead, it gains a holistic understanding. In a Cross-Attention setup, the model might struggle to link a "red" adjective specifically to a "hat" if there are many objects. In a Single-Stream setup, the "red" token and the "hat" tokens are mathematically adjacent in the same attention stream, leading to near-perfect prompt adherence.
LLM-Powered Nuance: By using Qwen-3-4B (a Large Language Model) rather than a basic CLIP encoder, the "translator" understands complex grammar, negation (e.g., "no cars on the road"), and spatial relationships (e.g., "the cat is under the table") far better than previous generations.
VAE (VAELoader): The "compressor/decompressor". The VAE acts as the bridge between the world of human-readable pixels and the mathematical latent space where the AI "thinks."
Latent Space vs. Pixel Space: Processing high-resolution pixels directly is computationally prohibitive. The VAE Encoder compresses a 3-channel RGB image into a more efficient "Latent" representation, typically reducing the spatial dimensions by a factor of 8 (e.g., 1024x1024 pixels becomes 128x128 latents).
Decoupled Architecture: The Diffusion Transformer (S3-DiT) operates exclusively within this compressed latent space. By removing 98% of the redundant pixel data, the model can focus its "attention" on the core structural and semantic features of the image. Once the 8 steps of denoising are complete, the VAE Decoder translates the final latent matrix back into the high-resolution, 3-channel RGB image we see on the screen.
3. Model Enhancements: LoRA and Fine-Tuning
Beyond the base models, the pipeline is often enhanced by specialized training techniques:
LoRA (Low-Rank Adaptation): Instead of the massive undertaking of retraining the entire 6-billion-parameter S3-DiT model, LoRA freezes the original pre-trained weights and injects small, trainable "rank-decomposition" matrices into the model's self-attention and linear layers. (https://arxiv.org/html/2106.09685v2)
Rank Decomposition: It represents the weight update (ΔW) as the product of two low-rank matrices (B×A). For a weight matrix of size d×k, LoRA uses matrices of size d×r and r×k, where the rank r is significantly smaller than the original dimensions (often r=16 or r=32). This dramatically reduces the number of trainable parameters.
Inference & Merging: During training, only these small matrices are updated. During inference, the output is calculated by adding the LoRA path to the frozen path (h=W0​x+BAx). Because these updates are linear, they can be mathematically merged back into the base model. This allows for targeted learning—such as a specific person's face, a CNY (Chinese New Year) art style, or specific architectural motifs—with minimal file size and zero additional latency.
4. Setting the Stage: Conditioning & Latent Space
Before the denoising process begins, the pipeline establishes the mathematical boundaries for the generation:
Positive Conditioning (CLIPTextEncode): This node processes the dynamic text prompt (character, pose, clothing). Using the Qwen-3-4B encoder, it creates a "guiding vector" that lives in the same attention stream as the image patches. This ensures the model has a clear target for what the noise should eventually become.
Negative Conditioning (ConditioningZeroOut): Rather than using a complex negative text prompt, we utilize a "Zero Out" node to provide a neutral baseline.
The Logic Modern distilled architectures like Z-Image-Turbo are trained to be highly efficient. Traditional negative prompts can introduce "mathematical interference" that degrades image fidelity or causes color oversaturation (the "fried" look). By zeroing out the negative conditioning, we allow the Decoupled-DMD algorithm to focus all its energy on the positive trajectory, resulting in cleaner gradients and better prompt adherence.
The Blank Canvas (EmptyLatentImage): This defines the target resolution (e.g., 1088×1632) and initializes the Latent Space with pure Gaussian noise. Because Z-Image-Turbo uses a Transformer-based backbone, it is more sensitive to aspect ratios than older U-Net models. Using dimensions that are multiples of 16 ensures that the image patches (tokens) align perfectly with the model's internal attention grid.
5. The Drawing Process: Sampling
This stage is the execution phase, where the mathematical constraints are transformed into a visual representation.
Model Sampling (ModelSamplingDiscreetFlow with Shift): To optimize Z-Image-Turbo for high-speed generation, we apply a "Shift" to the noise schedule.
The Math of Time: In a 9-step generation, every step is precious. A shift value of 3.0 adjusts the "Signal-to-Noise Ratio" (SNR) curve. It forces the model to prioritize broad composition (shapes and silhouettes) in the first 2–3 steps, and fine textures (skin, fabric, hair) in the final steps. Without this shift, a low-step count might result in "blurry" or "muddy" details.
The KSampler: This is the core engine that orchestrates the denoising. Because Z-Image-Turbo is a distilled model (DMD), I want a SDE (Stochastic) or a simple ODE (Deterministic) sampler. Complex samplers like DPM++ often "over-correct" distilled models and cause artifacts.
Inputs: It synthesizes the random latent noise, the S3-DiT model, and the Qwen-3-4B conditioning vectors.
The Iteration: Over 9 steps, the KSampler uses the Euler algorithm to predict and subtract noise. Because Z-Image-Turbo is a distilled model, it follows a "straight-line" trajectory (learned from the Teacher model), making the simple, fast Euler sampler more effective than complex multi-step samplers.
Seed & Reproducibility: The seed provides the initial coordinates for the noise. Using the same seed with the same prompt will yield the same image, allowing for granular adjustments to the prompt or LoRA weights while keeping the composition stable.
6. The Final Reveal: Decoding
Once the KSampler finishes its final step, the result is a semantically complete representation of the image, but it currently exists only in Latent Space (a 4 or 16-channel mathematical matrix).
VAEDecode: This node takes the latent result and the loaded VAE model to perform the final reconstruction. The VAE Decoder reverses the initial compression process. It "up-samples" the 128×128 latent grid back to the original (1088×1632) resolution. During this pass, the VAE fills in the high-frequency details—such as the texture of the skin, the glint in the eyes, and the fine strands of hair, that were mathematically represented in the latent tensors.
At this point, the base text-to-image generation is complete. The result is a high-quality, high-fidelity studio portrait, structurally optimized and ready for the next specialized phase: Face Swapping.
5.4 Performance Learning: The "Faceswap Tax" and Model Benchmarking
A critical learning was the discovery of the "Faceswap Tax." The ~4 second "tax" attributed to ReActor (Node 57) is justified by detection, alignment, ArcFace extraction, and CodeFormer passes.
Model Benchmarking Results (RTX 4090)
| Model Version | Est. Time (4090) | Native Support? | Analysis |
| SD 1.5 | ~10–15s | ❌ No | Requires "Hires Fix" to reach target resolution. Too slow. |
| SDXL (Base) | ~12–18s | ✅ Yes | Inconsistent style adherence. Too slow (~30 steps). |
| Flux.1 (Schnell) | ~4–6s | ✅ Yes | Very fast. Drawback: Fails with Chinese characters. |
| Z-Image (Turbo) | ~6–8s | ✅ Yes | Selected. Best balance. Superior bilingual rendering. |
The Solution: "Buying Time" with UX
Since the backend could not physically go faster without sacrificing quality, we engineered Psychological Time Dilation through the frontend UX (Ref: Section 3.1).
5.5 Engineering the "Zero-Variance" Output (Dynamic Prompt Deep Dive) and keeping the Deterministic Output
Through over 100+ iterations, we observed that Latent Determinism (fixed seeds) is the only way to ensure commercial reliability. Random seeds often produced "chaotic" motion or structural shifts, while fixed seeds allowed us to engineer a "guaranteed" magical morph.
To achieve Semantic Sensitivity, the system relies on surgical string replacements in comfy_processor.py. By enforcing a rigid "linguistic logic" via the T5-XXL encoder, the system prevents "concept bleeding" and ensures the final result is a perfect high-fidelity synthesis of user choices.
Overview
A core feature of the AI VTON is the high degree of customization offered to users (Gender, Pose, Clothes, Background, and Lucky Number). This document details how these discrete UI selections are dynamically compiled into a single, cohesive prompt for the Text-to-Image model.
The Base Template (The Blueprint)
The ComfyUI workflow relies on a base JSON file (ZIT_FaceSwapAPI_1(CNY).json). Within this file, Node 45 handles the CLIPTextEncode (Prompt) logic.
Between lines 91 and 95, the "text" input contains the following base template:
"Extreme Close up shot of a \"gender\" charismatic K-pop idol with \"pose\" for a concept photo, dressed in \"clothes_style\". The setting is \"background\". The image features a modern graphic design overlay: a translucent frosted-glass border at the top and bottom of the frame. Integrated into these borders is stylized typography including the Chinese characters \"新年快乐\" and the English text \"Happy Lunar New Year\". \"lucky_num\". High-key cinematic lighting, idol posing, vibrant CNY color palette, words are vibrant bright colors encased in a border contrasting the background, 8k resolution."
Variable Injection Mechanics
Notice the specific string placeholders wrapped in escaped quotes (e.g., \"gender\"). These act as variables that the Python backend comfy_processor.py replaces before sending the workflow to generation.
gender: Replaced by static strings like "Male" or "Female" based on Step 2.
pose: Replaced by specific descriptors from data.js (e.g., "Holding a fan gracefully").
clothes_style: Replaced by detailed garment descriptions (e.g., "a multi-layered Ruqun in moonlight silver").
background: Replaced by environmental scenes (e.g., "a bustling temple fair at night with red lanterns").
lucky_num: Replaced dynamically by either the facial analysis output ("Lucky Number: 8392") or a random blessing ("祝你马到成功").
Python Implementation Flow
The dynamic alteration happens in the backend right after the user clicks "Start Processing":
Load Workflow: comfy_processor.py loads the raw ZIT_FaceSwapAPI_1(CNY).json into memory as a dictionary.
String Replacement: The backend maps the user's selected codes (e.g., Pose P01) to the corresponding long-form text. It then executes a series of string .replace() operations on the node 45 text input.
Seed Randomization: It updates the KSampler seed in node 44 to ensure unique noise patterns for each generation.
Base64 Image Loading: It injects the user's base64 encoded photo into node 65 (Load Image Base64) for the FaceSwap logic in node 57.
Execution: The mutated JSON object is sent via HTTP POST to the ComfyUI API /prompt endpoint.
Result
This dynamic templating approach guarantees that the model has a very rigid, "studio-quality" stylistic foundation while allowing near-infinite combinations based on user interactions. It ensures that the Text Adherence and Lighting constraints remain intact regardless of what the user chooses to wear or where they stand.
5.6 ReActor FaceSwap Deep Dive
1. Overview
Once the core Diffusion pipeline generates the base "studio portrait," the system must integrate the user's identity. This is handled by the ReActor FaceSwap node (based on the InsightFace framework), which performs a high-fidelity identity transfer in post-processing.
2. The Mechanics of ReActor
ReActor bypasses the "randomness" of diffusion-based face generation. Instead of asking the AI to imagine the user, it uses a Swap-and-Refine approach, surgically mapping the user's facial structure onto the generated mannequin.
2.1 The Two Inputs
Input Image (The Target/Canvas): The high-resolution output from the VAEDecode node.
Source Image (The Identity): The user's selfie or facial image, is injected via easy loadImageBase64 node. This provides the "blueprint" for the swap.
3. Under the Hood: The Swap Process
ReActor orchestrates three distinct computer vision phases:
Detection and Alignment:
The node first localizes faces using YOLOv5l or retinaface It identifies 5-68 key facial landmarks (eyes, nose, mouth) to create a "warping mask." This ensures that even if the source selfie and the target image have different head tilts, the features will align correctly.
Identity Embedding (The "Inswapper" Model):
ReActor utilizes the inswapper_128.onnx model (based on the InsightFace architecture).
How it works: It extracts an Identity Embedding—a 512-dimensional vector that represents the user's unique facial topography.
The Swap: Using a method called Addition and Normalization, it replaces the target's identity features with the source's features while preserving the target's lighting, shadows, and expressions. (https://arxiv.org/abs/1801.07698) (Deng, J., et al. "ArcFace: Additive Angular Margin Loss for Deep Face Recognition." (CVPR 2019))
Face Restoration (Blind Face Restoration):
Raw swaps often suffer from "resolution mismatch"—the swapped face may look slightly softer than the 4K AI-generated background.
CodeFormer: ReActor applies a secondary AI model (codeformer-v0.1.0.pth). Unlike standard upscalers, CodeFormer is a Transformer-based prediction model. It "predicts" what the missing high-resolution details (eyelashes, skin pores) should look like based on a codebook of human facial features. (https://arxiv.org/abs/2206.11253) (Zhou, S., et al. "Towards Robust Blind Face Restoration with Codebook Lookup Transformer." (NeurIPS 2022))
The Blend: A codeformer_weight of 0.5 is used to balance the mathematical reconstruction with the original lighting of the scene, preventing a "plastic" or "uncanny valley" look.
4. The Result
The final composite is a seamless integration of the user's identity into the stylized environment. The image is finally dispatched via the ETN_SendImageWebSocket to the Flask backend for real-time display.
5.7 Animation Processing (A 2 Machine Workflow)
1. Overview
The animation phase transitions the project from static latent space to Temporal Latent Space. This process is offloaded to a dedicated Linux render node equipped with a high-performance GPU to handle the heavy computational demands of the Wan2.1/2.2 14B video foundation model.
2. Technical Infrastructure & Pipeline
The animation is governed by a Flask-based middleware that bridges the primary application and the ComfyUI backend.
Receiver Architecture: linux_receiver.py (Flask) operates as a listener on port 5001, facilitating a distributed rendering network.
The "First-Last Frame" (FLF) Logic: The workflow utilizes the WanFirstLastFrameToVideo node (Node 67). This node acts as the temporal anchor, ensuring the generated video provides a seamless "morph" between the user's original photo (Source) and the AI-generated CNY portrait (Target).
Prompt Synthesis (UMT5-XXL): Node 38 loads the umt5_xxl CLIP model. The receiver dynamically injects style-specific keywords into Node 6, replacing style_type and lighting variables to ensure the VFX (e.g., Bioluminescence, Chromatic Aberration) align with the specific CNY aesthetic selected by the user.
3. The Dual-Expert Sampling Strategy
A key technical highlight of this workflow is the specialized "handoff" between two distinct Diffusion experts to maximize fidelity within a low step count.
Phase 1: High-Noise Expert (Node 57)
Model: wan2.2_i2v_high_noise_14B_fp8
Function: Responsible for the global motion and physical consistency of the "magical morph."
Schedule: Operates on a ModelSamplingSD3 shift of 5, prioritizing structural stability over 4 steps.
Phase 2: Low-Noise Expert (Node 58)
Model: wan2.2_i2v_low_noise_14B_fp8
Function: Takes the "leftover noise" from Node 57 and performs high-frequency refinement. It sharpens facial features, clothing textures, and lighting effects to ensure the video matches the 8k quality of the static portrait.
Schedule: Operates on a ModelSamplingSD3 shift of 5, prioritizing structural stability over 4 steps.
Final Decoding
Model: wan_2.1_vae (Node 39)
Function: Translates the 81-frame latent sequence into a high-definition RGB video stream at 16 FPS.
4. Development & Implementation Journey
Asynchronous Job Orchestration
Challenge: The video generation takes significant time, and ComfyUI operates asynchronously.
Solution: Developed a thread-safe JOBS dictionary and a background Status Checker Thread. This thread polls the ComfyUI /history API, monitoring for the presence of the unique video_prefix (injected into Node 61) to signal job completion and trigger the final WebSocket transmission.
Technical Safeguards
API-First Validation: The script includes a validation layer to ensure the workflow is in "API Format." This prevents runtime failures caused by the lack of fixed node IDs found in standard Web-saved JSONs.
Deterministic Seed Management: Unlike the image generation phase, the FLF animation uses fixed seeds. This ensures temporal consistency across the 81 frames, preventing "flicker" or sudden structural shifts during the transition.
Automated Resizing: To optimize VRAM usage on the 14B model, Nodes 97 and 98 automatically scale incoming Base64 data to 368x608, ensuring the aspect ratio remains consistent with the f8 latent grid. (This resolution takes 50s-60s to generate a 5s video.)
5.8 FLF Video Generation Deep Dive: The Architecture of the "Magical Morph"
Moving from static imagery to fluid animation requires the transition to Temporal Latent Denoising. The technical mechanics of the FLF pipeline rely on a Video Diffusion Transformer (DiT) backbone utilizing Flow Matching (Lipman et al., 2023).
1. Overview
Moving from static imagery to fluid animation requires transitioning from 2D spatial denoising to Temporal Latent Denoising. This document explores the technical mechanics of the First-and-Last-Frame (FLF) animation pipeline used in FLF_workflowAPI.json. This deep dive explains how the Wan2.1/2.2 architecture, distilled LoRAs, and dual-expert samplers interact to create a seamless "magical morph."
2. The Core Foundation: Video Models & Encoding
The animation pipeline relies on a massive scale of parameters and a specialized language model to interpret complex visual effects (VFX).
Model Weights (Wan2.2 14B I2V): A state-of-the-art open-source video generation model from Alibaba's Wan-AI team. A key innovation in version 2.2 is the Mixture-of-Experts (MoE) architecture, which significantly improves efficiency and quality. (Read the paper)
Backbone Architecture (DiT): Wan utilizes a Diffusion Transformer (DiT) backbone utilizing Flow Matching. It processes video by "patchifying" the 3D spatio-temporal volume into "cubes" or tokens. This allows the model to learn complex relationships across the entire video simultaneously, resulting in superior physical consistency compared to older frame-by-frame U-Net architectures.
Expert Specialization: The workflow utilizes two distinct weight sets: high_noise (Node 37) and low_noise (Node 56). This MoE approach ensures that structural motion is calculated by a "high-noise expert," while high-frequency details (like facial clarity) are refined by a "low-noise expert."
CLIP/Text Encoding (umt5_xxl) / The "Instructions": Instead of standard CLIP, Wan utilizes the UMT5-XXL (Universal Multilingual Transformer) encoder (Node 38).
Linguistic Logic: Based on Raffel et al. (2020), this T5-based encoder understands complex prompt grammar. In our workflow (Node 6), it correctly associates "Bioluminescence" with the "Light Streams" surrounding the body, ensuring that the "Chromatic Aberration" doesn't bleed into the subject's face. (Read the paper)
3D-Causal VAE (VAELoader) / The "Temporal Bridge": Node 39 loads wan_2.1_vae. Unlike image VAEs, this 3D-Causal VAE compresses video both spatially and temporally into latent patches. It ensures that if a background pixel is "static" in Frame 1, it remains mathematically consistent through Frame 81, preventing the "jitter" common in early AI videos.
3. Temporal Anchoring: WanFirstLastFrameToVideo
Node 67 represents the logic of Latent Interpolation. Rather than hallucinating motion from a single image, this node creates a deterministic bridge.
Boundary Constraints: It takes the Start Image (Source Photo) and End Image (Generated Portrait) and calculates the Flow Matching trajectory between them. This forces the AI to "morph" between two known points in latent space, ensuring the user's face at the end of the video matches the generation exactly.
Fixed Token Resolution: By locking the pipeline to 368x608 (Nodes 97 & 98), we ensure that the patch-based attention grid remains constant. This is critical for Transformers; a change in resolution during the morph would shift the internal token coordinates, causing the subject's face to warp or "melt."
4. Acceleration: LightX2V 4-Step LoRAs (ADD)
To achieve high-quality video in a fraction of the time, the pipeline integrates specialized Adversarial Diffusion Distillation (ADD) layers (Nodes 92 & 105). (Read the paper)
ADD is a hybrid training objective that combines the strengths of Score Distillation and Adversarial Training to compress the iterative denoising process into a few "super-steps."
Adversarial Loss (The Discriminator): ADD utilizes a GAN-style discriminator that forces the "Student" model weights (the LoRA) to generate high-frequency details that are indistinguishable from real video, even in just 4 steps. This prevents the "blurriness" typically found in standard low-step generations.
Score Distillation Loss (The Teacher): A frozen "Teacher" model (a high-performance 50-step Wan model) provides a training signal that guides the Student's trajectory. The Student learns to predict the "clean" image at the end of the diffusion path directly from a noisy input, effectively skipping 90% of the iterative steps.
Rank Decomposition: LoRAs inject small, trainable matrices into the Transformer's attention blocks. These matrices are trained with the ADD objective, allowing the model to "leap" from raw noise to a structured morph without the traditional loss of detail.
High vs. Low Noise LoRAs: We apply a High-Noise LoRA to stabilize the global motion and a Low-Noise LoRA to sharpen the final pixel clarity. This specialized application ensures that the ADD process preserves facial identity while maintaining the fluid dynamics of the magical light streams.
5. The Sampling Strategy: Dual-Expert Handoff
This is the execution phase where the image is actually constructed across 81 frames.
Phase 1: High-Noise Denoising (Node 57)
Settings: Steps 0–2, Euler Sampler, Shift = 5.0.
The Logic of Shift: Using ModelSamplingSD3, we apply a "Shift" to the Logit-Normal noise schedule. In Flow Matching models, the sampling time is mapped from t=0 (pure noise) to t=1 (clean image).
Non-Linear Time Wrapping: A shift of 5.0 non-linearly stretches the early time steps. It forces the sampler to spend more of its limited "budget" (Steps 0-2) in the high-noise region where global structural layout and 3D motion vectors are decided.
Prioritizing Physics: By staying in the "High Noise" phase longer, the model focuses on the structural integrity and 3D physics of the "magical morph." This ensures the underlying geometry of the light streams is locked in before the model attempts to resolve fine textures, preventing the subject's features from drifting during the transformation.
Phase 2: Low-Noise Refinement (Node 58)
Settings: Steps 2–10000, Euler Sampler.
The Handoff: This sampler takes the "leftover noise" from the first pass and applies the Low-Noise Expert model. It focuses entirely on fine-tuning textures and the "Bloom & Glow" effects, ensuring the final reveal is sharp and photorealistic.
6. The Final Reveal: Decoding
Once the KSamplers finish, the result is an 81-frame latent volume—a 3D mathematical block of data.
VAEDecode (Node 8): This node translates the latent volume back into the RGB pixel space.
Temporal Consistency: Because it is a causal decoder, it ensures that lighting transitions (like the light streams) are smooth across the temporal axis.
Final Output: The result is a high-definition video at 16 FPS (Node 60), resulting in a 5-second cinematic morph that bridges the gap between the real world and the AI-stylized CNY environment.
