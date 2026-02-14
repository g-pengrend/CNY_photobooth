# Step 09b: Model Selection & Performance Strategy - Technical Journey

## 1. Overview
The choice of the underlying Text-to-Image (T2I) model was a critical architectural decision. It required balancing **Visual Quality** (fidelity, adhering to CNY themes) against **Generation Speed** (user attention span).

## 2. Constraints & Goals
- **Attention Span**: Research suggested a **6-second** benchmark for interactive installations before users lose interest.
- **Hardware Profile**:
  - *Development*: NVIDIA RTX 4090 (24GB VRAM).
  - *Deployment Consideration*: Accessibility for lower-tier hardware (e.g., RTX 4070 with 12GB VRAM).
- **Resolution**: Target ~2 Megapixels for high-quality prints.

## 3. Model Evaluation Options

We benchmarked several industry-standard models on the RTX 4090:

| Model Version | Est. Time (4090) | Native Support? | Analysis |
| :--- | :--- | :--- | :--- |
| **SD 1.5** | ~10–15s | ❌ No | Requires "Hires Fix" (Upscale) to reach target resolution. Direct generation at high res produces artifacts/twins. Too slow and complex workflow. |
| **SDXL (Base)** | ~12–18s | ✅ Yes | Native high-res. Quality is decent but style adherence was inconsistent. Too slow (~30 steps). |
| **SDXL (Turbo)** | ~3–5s | ✅ Yes | Fast (4-8 steps). However, quality often degrades, and "plastic/smooth" look is hard to tune out. |
| **SD 3.5 Large** | ~35–45s | ✅ Yes | Excellent prompt coherence but extremely heavy VRAM usage and way too slow for a photobooth. |
| **Flux.1 (Dev)** | ~20–25s | ✅ Yes | Best visual quality and text rendering. However, 20-30s wait time is unacceptable for a quick walkthrough. |
| **Flux.1 (Schnell)**| ~4–6s | ✅ Yes | Very fast (4 steps). **Major Drawback:** Struggles with complex Chinese characters often producing artifacts or illegible text. |
| **Z-Image (Turbo)** | **~6–8s** | ✅ Yes | **Selected Candidate.** Native generation at 8 steps. **Superior bilingual text adherence (Chinese/English).** Less artifacts than Flux, specifically optimized for this dual-language use case. |

### 3.1 The "Chinese Text" Hurdle
A unique requirement for the CNY theme was the accurate rendering of complex Traditional/Simplified Chinese characters (e.g., "恭喜发财").
- **Flux.1**: While excellent for English, it failed too often with Chinese text, producing "alien" symbols.
- **Z-Image**: Proved to be specifically optimized for bilingual text, delivering legible Chinese characters with far fewer artifacts.

## 4. The Challenge: The "Faceswap Tax"
While **Z-Image (Turbo)** could generate a base image in ~6-8 seconds, the full pipeline requires more than just T2I:
1.  **Face Analysis (InsightFace)**: ~1s
2.  **IP-Adapter Feature Extraction**: ~1s
3.  **T2I Generation**: ~7s
4.  **Face Detailer / Swap (Roop/Reactor)**: ~4s
5.  **VAE Decode & Save**: ~2s

**Total Round Trip**: **~15 Seconds**.

This exceeded the 6-second "Attention Span" budget.

## 5. The Solution: "Buying Time" with UX
Since the backend could not physically go faster without sacrificing significant quality, we engineered the **Frontend User Experience** to mask the latency.

- **Psychological Time Dilation**: Instead of a static "Loading..." spinner, we broke the wait into engaging visual steps.
- **"Analysis" Phase**: We introduced the "Scientific Analysis" screen (Step 3) earlier in the flow, mentally preparing the user that "work is being done".
- **Dynamic Loading Screen**:
    - *0-2s*: "Uploading securely..."
    - *2-5s*: "Comparing facial landmarks..." (Mock status updates)
    - *5-12s*: "Generating 4D Matrix..."
    - *12-15s*: "Finalizing pixels..."
- **Result**: The perceived wait time drops because the user is reading status messages and watching animations, effectively "buying" us the extra 9 seconds needed for high-quality generation.
