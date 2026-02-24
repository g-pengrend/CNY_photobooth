# Step 09c: Dynamic Prompt Generation - Technical Journey

## 1. Overview
A core feature of the SEIT 4D Vision Studio is the high degree of customization offered to users (Gender, Pose, Clothes, Background, and Lucky Number). This document details how these discrete UI selections are dynamically compiled into a single, cohesive prompt for the Text-to-Image model.

## 2. The Base Template (The Blueprint)
The ComfyUI workflow relies on a base JSON file (`ZIT_FaceSwapAPI_1(CNY).json`). Within this file, Node `45` handles the `CLIPTextEncode` (Prompt) logic. 

Between lines 91 and 95, the `"text"` input contains the following base template:
> `"Extreme Close up shot of a \"gender\" charismatic K-pop idol with \"pose\" for a concept photo, dressed in \"clothes_style\". The setting is \"background\". The image features a modern graphic design overlay: a translucent frosted-glass border at the top and bottom of the frame. Integrated into these borders is stylized typography including the Chinese characters \"新年快乐\" and the English text \"Happy Lunar New Year\". \"lucky_num\". High-key cinematic lighting, idol posing, vibrant CNY color palette, words are vibrant bright colors encased in a border contrasting the background, 8k resolution."`

## 3. Variable Injection Mechanics
Notice the specific string placeholders wrapped in escaped quotes (e.g., `\"gender\"`). These act as variables that the Python backend `comfy_processor.py` replaces before sending the workflow to generation.

1.  **`gender`**: Replaced by static strings like `"Male"` or `"Female"` based on Step 2.
2.  **`pose`**: Replaced by specific descriptors from `data.js` (e.g., `"Holding a fan gracefully"`).
3.  **`clothes_style`**: Replaced by detailed garment descriptions (e.g., `"a multi-layered Ruqun in moonlight silver"`).
4.  **`background`**: Replaced by environmental scenes (e.g., `"a bustling temple fair at night with red lanterns"`).
5.  **`lucky_num`**: Replaced dynamically by either the facial analysis output (`"Lucky Number: 8392"`) or a random blessing (`"祝你马到成功"`).

## 4. Python Implementation Flow
The dynamic alteration happens in the backend right after the user clicks "Start Processing":

1.  **Load Workflow**: `comfy_processor.py` loads the raw `ZIT_FaceSwapAPI_1(CNY).json` into memory as a dictionary.
2.  **String Replacement**: The backend maps the user's selected codes (e.g., Pose `P01`) to the corresponding long-form text. It then executes a series of string `.replace()` operations on the node 45 text input.
3.  **Seed Randomization**: It updates the KSampler seed in node `44` to ensure unique noise patterns for each generation.
4.  **Base64 Image Loading**: It injects the user's base64 encoded photo into node `65` (Load Image Base64) for the FaceSwap logic in node `57`.
5.  **Execution:** The mutated JSON object is sent via HTTP POST to the ComfyUI API `/prompt` endpoint.

## 5. Result
This dynamic templating approach guarantees that the model has a very rigid, "studio-quality" stylistic foundation while allowing near-infinite combinations based on user interactions. It ensures that the Text Adherence and Lighting constraints remain intact regardless of what the user chooses to wear or where they stand.
