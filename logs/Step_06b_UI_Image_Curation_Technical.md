# Step 06b: UI Image Curation (Prompt Engineering) - Technical Journey

## 1. Overview
The high-quality selection images for Gender, Pose, Outfit, and Background were not generic stock photos but engineered assets created through an iterative AI generation process. This ensures a consistent "Studio" aesthetic across the entire application.

## 2. The Iterative Process

### Phase 1: Template Engineering
To achieve consistency, we moved away from ad-hoc prompting to a structured template system.
- **Goal**: Create a reliable "product shot" look that can be easily masked (transparent background) and integrated into the UI cards.
- **Template Structure**:
  `[Studio Prefix]` + `[Variable Detail]` + `[Technical Suffix]`

### Phase 2: Prompt Refinement (The "Studio" Standard)
A finalized prompt format was established (Ref: `logs/prompt_for_studio_pics.txt`):

**1. The Prefix (Setting the Stage):**
> "A professional studio product shot of a standalone {gender} outfit, featuring..."
*   *Purpose*: Defines the subject as an inanimate object or mannequin-style display, avoiding complex human faces that might distract from the clothing or pose choice.

**2. The Variable Detail (The iterative part):**
> "Xianxia style female immortal, a multi-layered Ruqun... translucent floor-length outer robe... wide 'water sleeves'..."
*   *Process*: We iterated on this section for each specific option (e.g., modifying "Ruqun" to "Qipao" or "Tangzhuang").
*   *Trial & Error*: Adjusted adjectives like "moonlight silver", "iridescent", and "ethereal" until the generated texture matched the intended CNY theme.

**3. The Suffix (The Technical Constraint):**
> "The outfit is displayed to maintain a 3D shape, centered composition, high-quality fabric textures, cinematic lighting, isolated on a solid black background for easy transparency masking."
*   *Constraint*: "Isolated on a solid black background" was critical for the UI team to easily remove the background and place the item into the CSS cards.
*   *Constraint*: "Maintain a 3D shape" ensures the clothes look filled out (as if worn) rather than flat.

### Phase 3: Generation & Curation
1.  **Feed into Workflow**: The engineered prompt is fed into the Text-to-Image (T2I) workflow.
2.  **Batch Generation**: Generated batches of 4-8 images per prompt.
3.  **Curation**: Selected the best image that:
    - Had the cleanest silhouette (for masking).
    - Matched the lighting of the other UI elements.
    - Clearly communicated the "vibe" of the selection (e.g., "Cool" vs "Elegant").
4.  **UI Integration**: The final curated image is processed (background removed if necessary) and saved to `static/images/`.
