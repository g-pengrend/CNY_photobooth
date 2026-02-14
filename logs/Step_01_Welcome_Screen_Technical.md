# Step 1: Welcome Screen - Technical Journey

## 1. Overview
The Welcome Screen serves as the attract mode for the photobooth. It features a visually striking "SEIT 4D Vision Studio" title, dynamic Chinese New Year (CNY) decorations, and a start interaction.

## 2. Technical Implementation Details
- **Frontend Core**: `index.html` defines the `#welcome-screen` structure.
- **Styling**: `style.css` handles complex animations (shimmer, float, glow).
- **Logic**: `app.js` manages the transition to the next screen upon clicking "Start".

## 3. Development Journey (From Logs)

### Initial Setup & Theming
- **Requirement**: "Sleek and modern, with a Chinese New Year theme colours" (Ref: `Part1`).
- **Implementation**: Created the basic structure with red/gold gradient backgrounds and glassmorphism effects.

### Adding Banners (Ref: `Part2`)
- **Vertical Chinese Banners**: Added "恭喜发财" (Left) and "万事如意" (Right).
  - *Tech*: Absolute positioning, float animation (`@keyframes float`).
- **Horizontal English Banners**: Added translations "WISHING YOU PROSPERITY" and "MAY ALL YOUR WISHES COME TRUE".
  - *Iterative Refinement*: Initially sideways vertical, then horizontal overlay, finally curved banners positioned below the lanterns.
  - *Layout Fixes*: Adjusted `top` positions to prevent overlapping with the "福" (Fu) character on lanterns.

### Title Effects & Branding (Ref: `Part4`)
- **Title Update**: Changed from "CNY Photo Booth" to "**SEIT 4D Vision Studio**".
- **Visual Effects**:
  - Implemented a rainbow gradient with shimmer animation.
  - Added a pulsing glow filter to make the title "pop".
  - Added 3D text (shadows) for depth.
- **Subtitle**: Updated to the witty rhyming tagline: *"Capture the Glow, Swap the Show, and get your 4D Numbers to go!..."*

### Floating Elements (Ref: `Part4`)
- **"Huat Ah!" Characters**:
  - **Initial**: Scattered "Huat" text.
  - **Refinement**: Changed to "Huat Ah!", mixed with Chinese "发".
  - **Randomization**: Implemented logic to randomize positions (left/right, top/bottom) and animation timing (delay, duration) to create a natural floating effect.
  - **Decoration**: Integrated with CNY items (red packets, pineapples) in the background layers.

## 4. Key Code Components
- **CSS Animations**: `float`, `shimmer`, `pulse-glow`.
- **HTML Structure**: Container-based layout to handle absolute positioned decorative elements without interfering with the main CTA button.
