/**
 * Automated Test Suite: 4-Layer Dynamic Theme Builder Engine
 * Verifies Prompt Compilation, Architectural Polymorphism, Physics Motion,
 * Layered Lighting, and Touch Interaction Safety across Disparate Prompts.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DOM elements and state for admin.js runtime
const documentMock = {
    elements: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById(id) {
        if (!this.elements[id]) {
            this.elements[id] = {
                value: '',
                checked: false,
                style: {},
                innerHTML: '',
                textContent: '',
                addEventListener: () => {},
                classList: { add: () => {}, remove: () => {}, toggle: () => {} }
            };
        }
        return this.elements[id];
    }
};

const sandbox = {
    window: {},
    document: documentMock,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    showToast: () => {},
    studio: { themes: [], activeTheme: null }
};
sandbox.window = sandbox;

// Load admin.js
const adminJsPath = path.join(__dirname, '..', 'kiosk_frontend', 'static', 'admin', 'admin.js');
const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
vm.createContext(sandbox);
vm.runInContext(adminJsContent, sandbox);

const { buildThemePrompt, parseMultiBlockGenAiResponse } = sandbox.window;

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        process.exitCode = 1;
    } else {
        console.log(`✅ PASSED: ${message}`);
        passedTests++;
    }
}

console.log('================================================================');
console.log('RUNNING THEME BUILDER 4-LAYER COMPOSITIONAL ARCHITECTURE TESTS');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: Prompt Compilation & Architectural Contracts
// -----------------------------------------------------------------------------
console.log('--- TEST SUITE 1: Prompt Compilation Across Disparate Concepts ---');

const disparatePrompts = [
    {
        concept: "Cyberpunk Neo-Tokyo",
        levers: { density: "Balanced", motion: "Glitch & Pulse", lighting: "Neon Glow", archetype: "Cyber / Arcade / Sci-Fi" }
    },
    {
        concept: "1920s Great Gatsby Roaring Gala",
        levers: { density: "Balanced", motion: "Gentle Drift", lighting: "Specular Gold", archetype: "Royal Gala / Luxury" }
    },
    {
        concept: "Enchanted Fairy Forest",
        levers: { density: "Immersive Maximalist", motion: "Gentle Drift", lighting: "Neon Glow", archetype: "Whimsical / Fantasy" }
    },
    {
        concept: "80s Retro Arcade",
        levers: { density: "Immersive Maximalist", motion: "High Energy", lighting: "CRT Retro", archetype: "Retro Pop / Vaporwave" }
    }
];

const compiledPrompts = [];

disparatePrompts.forEach(({ concept, levers }) => {
    const prompt = buildThemePrompt(concept, levers);
    compiledPrompts.push({ concept, prompt, levers });

    assert(typeof prompt === 'string' && prompt.length > 500, `Generated valid prompt for "${concept}"`);
    assert(prompt.includes(concept), `Prompt contains concept: "${concept}"`);
    assert(prompt.includes(`Aesthetic Density: ${levers.density}`), `Prompt includes Aesthetic Density lever: ${levers.density}`);
    assert(prompt.includes(`Motion Energy: ${levers.motion}`), `Prompt includes Motion Energy lever: ${levers.motion}`);
    assert(prompt.includes(`Lighting Treatment: ${levers.lighting}`), `Prompt includes Lighting Treatment lever: ${levers.lighting}`);
    assert(prompt.includes(`Suggested Architectural Archetype: ${levers.archetype}`), `Prompt includes Archetype: ${levers.archetype}`);

    // Architectural freedom contracts
    assert(prompt.includes("BAN ON MONOLITHIC SKELETONS"), `Enforces Ban on Monolithic Skeletons`);
    assert(prompt.includes("BESPOKE HTML MARKUP (BLOCK 2)"), `Enforces Bespoke HTML Markup Layer`);
    assert(prompt.includes("BESPOKE PHYSICS & MOTION (BLOCK 3)"), `Enforces Bespoke Physics Layer`);
    assert(prompt.includes("COLOR & TYPOGRAPHY SYSTEM (BLOCK 1)"), `Enforces Google Font and Typography System Layer`);
    assert(prompt.includes('pointer-events: none'), `Enforces touch safety pointer-events rule`);
    assert(prompt.includes('Keep the center 70% clear for user interactions'), `Enforces 70% touch-safe interaction clear zone`);

    // Verify rigid boilerplate is NOT forced in prompt
    assert(!prompt.includes('.thematic-top-arch'), `No forced .thematic-top-arch boilerplate in prompt`);
    assert(!prompt.includes('.thematic-side-banner'), `No forced .thematic-side-banner boilerplate in prompt`);
    assert(!prompt.includes('@keyframes bannerBreathe'), `No forced @keyframes bannerBreathe boilerplate in prompt`);
    assert(!prompt.includes('@keyframes ornamentSway'), `No forced @keyframes ornamentSway boilerplate in prompt`);
});

// -----------------------------------------------------------------------------
// TEST SUITE 2: Verification of Structural Polymorphism (Layer 1) & Divergence
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 2: Structural Polymorphism (DOM Class Divergence) ---');

const simulatedOutputs = {
    cyberpunk: `<design_thinking>
Layout Archetype: Cyber/Arcade HUD. Corner HUD brackets and a high-score data ticker along the bottom.
Physics Model: Erratic 60Hz electrical flicker for neon signs, linear horizontal translate for data ticker.
Lighting Strategy: Multi-stop cyan/magenta glow drop shadows over CRT phosphor scanlines.
</design_thinking>

### BLOCK 1: theme_identity.json
\`\`\`json
{
  "slug": "cyberpunk_neo_tokyo",
  "title": "Cyberpunk Neo-Tokyo",
  "subtitle": "High-Voltage Future Kiosk",
  "badge": "Cyber Syndicate",
  "icon": "🕹️",
  "cta": "Jack In",
  "description": "Step into the neon underworld and manifest a high-voltage cybernetic portrait.",
  "style": {
    "fontFamily": "'Orbitron', sans-serif",
    "googleFontUrl": "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap",
    "colors": {
      "background": "#05050d",
      "text": "#ffffff",
      "primary": "#0e1021",
      "accent": "#06b6d4",
      "accentGlow": "rgba(6, 182, 212, 0.4)",
      "surface": "rgba(6, 182, 212, 0.06)",
      "surfaceBorder": "rgba(6, 182, 212, 0.3)"
    }
  },
  "waitingExperience": {
    "title": "Compiling Neural Mesh...",
    "subtitle": "Routing cyber optics",
    "sequence": [
      { "text": "Initializing bio-scanners...", "delay": 500, "color": "#06b6d4" },
      { "text": "Synthesizing chrome fibers...", "delay": 3500, "color": "#ec4899" }
    ],
    "completionMessage": "System Online!"
  }
}
\`\`\`

### BLOCK 2: decorations.html
\`\`\`html
<div class="persistent-decorations">
  <div class="cyber-hud-bracket hud-top-left"></div>
  <div class="cyber-hud-bracket hud-top-right"></div>
  <div class="cyber-hud-data-rail">
    <span class="ticker-content">★ SYSTEM READY ★ HI-SCORE: 999990 ★ NEURAL VTON ACTIVE ★</span>
  </div>
  <div class="crt-scanline-mesh"></div>
</div>
\`\`\`

### BLOCK 3: style.css
\`\`\`css
:root {
  --cyber-cyan: #06b6d4;
  --cyber-magenta: #ec4899;
}
.persistent-decorations {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
.cyber-hud-bracket {
  position: absolute;
  width: 60px;
  height: 60px;
  border: 2px solid var(--cyber-cyan);
}
.hud-top-left { top: 20px; left: 20px; border-right: none; border-bottom: none; }
.hud-top-right { top: 20px; right: 20px; border-left: none; border-bottom: none; }
.cyber-hud-data-rail {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 38px;
  background: rgba(5, 5, 13, 0.85);
  overflow: hidden;
  white-space: nowrap;
}
.ticker-content {
  display: inline-block;
  animation: cyberRailScroll 18s linear infinite;
}
@keyframes cyberRailScroll {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
@keyframes cyberNeonPulse {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 10px var(--cyber-cyan)); }
  50% { opacity: 0.85; filter: drop-shadow(0 0 4px var(--cyber-cyan)); }
}
\`\`\``,

    gatsby: `<design_thinking>
Layout Archetype: Royal Gala / Luxury. Slender filigree borders, gilded pediments, suspended crystal chandeliers.
Physics Model: Pendulum crystal prism sway with cubic-bezier ease, gentle buoyant sparkle ascension.
Lighting Strategy: Specular gold metallic gradients and warm candlelight aura.
</design_thinking>

### BLOCK 1: theme_identity.json
\`\`\`json
{
  "slug": "great_gatsby_gala",
  "title": "1920s Great Gatsby Roaring Gala",
  "subtitle": "Art-Deco High Society Soirée",
  "badge": "Gilded Soirée",
  "icon": "🍸",
  "cta": "Enter the Ballroom",
  "description": "Step into the glamour of the 1920s with shimmering gold attire and crystal elegance.",
  "style": {
    "fontFamily": "'Playfair Display', serif",
    "googleFontUrl": "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
    "colors": {
      "background": "#0b0c10",
      "text": "#ffffff",
      "primary": "#171923",
      "accent": "#d4af37",
      "accentGlow": "rgba(212, 175, 55, 0.35)",
      "surface": "rgba(255, 255, 255, 0.04)",
      "surfaceBorder": "rgba(212, 175, 55, 0.25)"
    }
  },
  "waitingExperience": {
    "title": "Preparing Your Grand Entrance...",
    "subtitle": "Polishing jewels and gold brocade",
    "sequence": [
      { "text": "Pouring champagne...", "delay": 500, "color": "#d4af37" },
      { "text": "Draping art-deco pearls...", "delay": 3500, "color": "#ffffff" }
    ],
    "completionMessage": "Magnifique!"
  }
}
\`\`\`

### BLOCK 2: decorations.html
\`\`\`html
<div class="persistent-decorations">
  <div class="gatsby-pediment-crest">✧ L'ÉTOILE D'OR ✧</div>
  <div class="gatsby-crystal-chandelier chandelier-left">❖ ✦ ❖</div>
  <div class="gatsby-crystal-chandelier chandelier-right">❖ ✦ ❖</div>
  <div class="gatsby-geometric-filigree"></div>
  <div class="champagne-effervescence e-1">✨</div>
</div>
\`\`\`

### BLOCK 3: style.css
\`\`\`css
:root {
  --gatsby-gold: #d4af37;
}
.persistent-decorations {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
.gatsby-pediment-crest {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--gatsby-gold);
  letter-spacing: 4px;
}
.gatsby-crystal-chandelier {
  position: absolute;
  top: 0;
  font-size: 1.8rem;
  transform-origin: top center;
  animation: crystalChandelierSway 5s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
}
.chandelier-left { left: 40px; }
.chandelier-right { right: 40px; }
@keyframes crystalChandelierSway {
  0% { transform: rotate(-3.5deg); }
  100% { transform: rotate(3.5deg); }
}
@keyframes champagneBubbleRise {
  0% { transform: translateY(105vh) scale(0.7); opacity: 0; }
  50% { opacity: 0.9; }
  100% { transform: translateY(-5vh) scale(1.1); opacity: 0; }
}
\`\`\``,

    fantasy: `<design_thinking>
Layout Archetype: Whimsical / Fantasy. Organic botanical vine borders, celestial aurora canopy, floating fairy runes.
Physics Model: Undulating sinusoidal wave keyframes for auroras, buoyant micro-drift for botanical spores.
Lighting Strategy: Bioluminescent emerald and starlight violet glow with frosted glass textures.
</design_thinking>

### BLOCK 1: theme_identity.json
\`\`\`json
{
  "slug": "enchanted_fairy_forest",
  "title": "Enchanted Fairy Forest",
  "subtitle": "Ethereal Whispers of the Wild",
  "badge": "Sylph Whispers",
  "icon": "🌿",
  "cta": "Awaken the Realm",
  "description": "Enter an ancient enchanted grove of bioluminescent flora and magical fae attire.",
  "style": {
    "fontFamily": "'Cinzel', serif",
    "googleFontUrl": "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap",
    "colors": {
      "background": "#040b08",
      "text": "#ffffff",
      "primary": "#0a1912",
      "accent": "#10b981",
      "accentGlow": "rgba(16, 185, 129, 0.35)",
      "surface": "rgba(16, 185, 129, 0.05)",
      "surfaceBorder": "rgba(16, 185, 129, 0.2)"
    }
  },
  "waitingExperience": {
    "title": "Weaving Forest Magics...",
    "subtitle": "Whispering with ancient spirits",
    "sequence": [
      { "text": "Gathering starlight dew...", "delay": 500, "color": "#10b981" },
      { "text": "Spinning gossamer fae wings...", "delay": 3500, "color": "#a7f3d0" }
    ],
    "completionMessage": "The Magic Awakens!"
  }
}
\`\`\`

### BLOCK 2: decorations.html
\`\`\`html
<div class="persistent-decorations">
  <div class="aurora-celestial-canopy"></div>
  <div class="botanical-ivy-border ivy-left"></div>
  <div class="botanical-ivy-border ivy-right"></div>
  <div class="glowing-fae-spore spore-1">✧</div>
  <div class="glowing-fae-spore spore-2">✦</div>
</div>
\`\`\`

### BLOCK 3: style.css
\`\`\`css
:root {
  --fae-green: #10b981;
  --fae-violet: #8b5cf6;
}
.persistent-decorations {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
.aurora-celestial-canopy {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 90px;
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.15), transparent);
  animation: auroraHarmonicUndulate 7s ease-in-out infinite alternate;
}
.botanical-ivy-border {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 32px;
}
.ivy-left { left: 0; }
.ivy-right { right: 0; }
@keyframes auroraHarmonicUndulate {
  0% { transform: scaleY(1); opacity: 0.6; }
  100% { transform: scaleY(1.2); opacity: 0.9; }
}
@keyframes faeSporeBuoyancy {
  0% { transform: translateY(0) rotate(0deg); opacity: 0.3; }
  50% { opacity: 0.9; }
  100% { transform: translateY(-30px) rotate(180deg); opacity: 0.3; }
}
\`\`\``,

    arcade: `<design_thinking>
Layout Archetype: Retro Pop / Arcade. Neon coin slot badge at top-right, isometric grid floor along bottom.
Physics Model: 120BPM marquee ticker scrolling, stuttering neon tube flicker.
Lighting Strategy: CRT scanline vignetting, phosphor bloom, neon tube drop shadows.
</design_thinking>

### BLOCK 1: theme_identity.json
\`\`\`json
{
  "slug": "80s_retro_arcade",
  "title": "80s Retro Arcade",
  "subtitle": "16-Bit Nostalgia Kiosk",
  "badge": "Level 99 Player",
  "icon": "🕹️",
  "cta": "Push 1P Button",
  "description": "Relive the 80s arcade golden age with pixelated synthwave aesthetics.",
  "style": {
    "fontFamily": "'Press Start 2P', monospace",
    "googleFontUrl": "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap",
    "colors": {
      "background": "#080010",
      "text": "#ffffff",
      "primary": "#1a0826",
      "accent": "#f43f5e",
      "accentGlow": "rgba(244, 63, 94, 0.4)",
      "surface": "rgba(244, 63, 94, 0.08)",
      "surfaceBorder": "rgba(244, 63, 94, 0.3)"
    }
  },
  "waitingExperience": {
    "title": "Loading Stage 1...",
    "subtitle": "Warming up cathode ray tubes",
    "sequence": [
      { "text": "Inserting virtual coin...", "delay": 500, "color": "#f43f5e" },
      { "text": "Rasterizing 16-bit sprites...", "delay": 3500, "color": "#38bdf8" }
    ],
    "completionMessage": "Stage Clear!"
  }
}
\`\`\`

### BLOCK 2: decorations.html
\`\`\`html
<div class="persistent-decorations">
  <div class="arcade-coin-slot">INSERT COIN [25¢]</div>
  <div class="arcade-bottom-marquee">
    <div class="pixel-ticker">★ 1P READY ★ HIGH SCORE 99990 ★ BONUS STAGE UNLOCKED ★</div>
  </div>
  <div class="crt-scanline-vignette"></div>
</div>
\`\`\`

### BLOCK 3: style.css
\`\`\`css
:root {
  --neon-pink: #f43f5e;
}
.persistent-decorations {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
.arcade-coin-slot {
  position: absolute;
  top: 18px;
  right: 24px;
  animation: neonCoinSlotFlicker 1.8s steps(2) infinite;
}
.arcade-bottom-marquee {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 36px;
  background: #000;
  overflow: hidden;
}
.pixel-ticker {
  display: inline-block;
  animation: pixelMarqueeScroll 14s linear infinite;
}
@keyframes neonCoinSlotFlicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes pixelMarqueeScroll {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
\`\`\``
};

// Parse each theme using our multi-block parser
const parsedThemes = {};
for (const [key, raw] of Object.entries(simulatedOutputs)) {
    const res = parseMultiBlockGenAiResponse(raw);
    assert(res !== null, `Parsed response successfully for "${key}"`);
    assert(Boolean(res.designThinking), `Extracted <design_thinking> for "${key}"`);
    assert(Boolean(res.json) && res.config !== null, `Extracted valid Block 1 JSON for "${key}"`);
    assert(Boolean(res.html), `Extracted Block 2 HTML for "${key}"`);
    assert(Boolean(res.css), `Extracted Block 3 CSS for "${key}"`);
    parsedThemes[key] = res;
}

// Extract DOM classes for each theme (excluding standard .persistent-decorations)
function extractClasses(html) {
    const classMatches = [...html.matchAll(/class=["']([^"']+)["']/g)];
    const classes = new Set();
    classMatches.forEach(m => {
        m[1].split(/\s+/).forEach(cls => {
            if (cls && cls !== 'persistent-decorations') classes.add(cls);
        });
    });
    return classes;
}

const themeClasses = {};
for (const [key, parsed] of Object.entries(parsedThemes)) {
    themeClasses[key] = extractClasses(parsed.html);
    assert(!themeClasses[key].has('thematic-top-arch'), `"${key}" contains NO forced .thematic-top-arch boilerplate`);
    assert(!themeClasses[key].has('thematic-side-banner'), `"${key}" contains NO forced .thematic-side-banner boilerplate`);
    assert(!themeClasses[key].has('custom-ornament'), `"${key}" contains NO forced .custom-ornament boilerplate`);
    assert(!themeClasses[key].has('custom-particle'), `"${key}" contains NO forced .custom-particle boilerplate`);
}

// Verify that across all 4 disparate themes, decorative DOM classes share ZERO identical classes
const themeKeys = Object.keys(themeClasses);
for (let i = 0; i < themeKeys.length; i++) {
    for (let j = i + 1; j < themeKeys.length; j++) {
        const k1 = themeKeys[i];
        const k2 = themeKeys[j];
        const shared = [...themeClasses[k1]].filter(c => themeClasses[k2].has(c));
        assert(shared.length === 0, `DOM class divergence: "${k1}" and "${k2}" share NO identical decorative classes (shared: ${shared.join(', ') || 'none'})`);
    }
}

// -----------------------------------------------------------------------------
// TEST SUITE 3: Parameterized Motion & Keyframe Animations (Layer 2)
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 3: Parameterized Motion & Bespoke Keyframes ---');

function extractKeyframes(css) {
    const kfMatches = [...css.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)];
    return new Set(kfMatches.map(m => m[1]));
}

const themeKeyframes = {};
for (const [key, parsed] of Object.entries(parsedThemes)) {
    themeKeyframes[key] = extractKeyframes(parsed.css);
    assert(themeKeyframes[key].size > 0, `"${key}" defines bespoke keyframe animations (${[...themeKeyframes[key]].join(', ')})`);
    assert(!themeKeyframes[key].has('bannerBreathe'), `"${key}" contains NO forced @keyframes bannerBreathe`);
    assert(!themeKeyframes[key].has('ornamentSway'), `"${key}" contains NO forced @keyframes ornamentSway`);
}

// Verify all keyframe animation names are distinct across themes
for (let i = 0; i < themeKeys.length; i++) {
    for (let j = i + 1; j < themeKeys.length; j++) {
        const k1 = themeKeys[i];
        const k2 = themeKeys[j];
        const sharedKf = [...themeKeyframes[k1]].filter(k => themeKeyframes[k2].has(k));
        assert(sharedKf.length === 0, `Keyframe physics divergence: "${k1}" and "${k2}" share NO identical animation names (shared: ${sharedKf.join(', ') || 'none'})`);
    }
}

// -----------------------------------------------------------------------------
// TEST SUITE 4: Touch Safety & Interaction Zone Preservation
// -----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 4: Touch Safety & Interaction Zone Preservation ---');

for (const [key, parsed] of Object.entries(parsedThemes)) {
    const css = parsed.css;
    const hasPointerNone = css.includes('pointer-events: none');
    assert(hasPointerNone, `"${key}" style.css enforces pointer-events: none on ambient decorations`);

    const hasFixedInset = css.includes('position: fixed') && css.includes('inset: 0');
    assert(hasFixedInset, `"${key}" style.css fixes .persistent-decorations to inset: 0`);

    const hasSafeZIndex = css.includes('z-index: 1');
    assert(hasSafeZIndex, `"${key}" style.css assigns low z-index: 1 to ensure touchscreen buttons are prioritized`);
}

console.log('\n================================================================');
console.log(`SUMMARY: ${passedTests} OF ${totalTests} TESTS PASSED CLEANLY!`);
console.log('================================================================');

if (passedTests === totalTests) {
    process.exit(0);
} else {
    process.exit(1);
}
