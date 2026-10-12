const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Mock DOM elements and state for admin.js runtime
const documentMock = {
    elements: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (tag) => ({
        style: {},
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        setAttribute: () => {},
        remove: () => {}
    }),
    body: {
        appendChild: () => {}
    },
    getElementById(id) {
        if (!this.elements[id]) {
            this.elements[id] = {
                id: id,
                value: '',
                checked: false,
                style: {},
                innerHTML: '',
                textContent: '',
                addEventListener: () => {},
                classList: { add: () => {}, remove: () => {}, toggle: () => {} },
                focus: () => {},
                select: () => {},
                setSelectionRange: () => {}
            };
        }
        return this.elements[id];
    }
};

const windowMock = {
    document: documentMock,
    sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    navigator: {
        clipboard: {
            writeText: async () => true
        }
    },
    location: { reload: () => {} },
    setTimeout: (fn) => setTimeout(fn, 1),
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    RegExp: RegExp,
    confirm: () => true
};

windowMock.window = windowMock;
global.window = windowMock;
global.document = documentMock;

// Load and evaluate admin.js
const adminJsPath = path.resolve(__dirname, '../kiosk_frontend/static/admin/admin.js');
const adminJsCode = fs.readFileSync(adminJsPath, 'utf8');

const context = vm.createContext(windowMock);
vm.runInContext(adminJsCode, context);

console.log('--- TEST SUITE: ComfyUI GenAI Frame & Typography Studio ---');

// Test 1: buildComfyFramePrompt
{
    const prompt = windowMock.buildComfyFramePrompt('UITS 50th Golden Jubilee Gala', {
        frameStyle: 'Neo-Classical Liquid Gold Filigree',
        typoStyle: 'Gold-Leaf Fluid Calligraphy',
        atmosphere: 'Volumetric Liquid Gold Gala'
    });

    assert(prompt.includes('UITS 50th Golden Jubilee Gala'), 'Prompt should include concept');
    assert(prompt.includes('Neo-Classical Liquid Gold Filigree'), 'Prompt should include frame archetype');
    assert(prompt.includes('Gold-Leaf Fluid Calligraphy'), 'Prompt should include typography vibe');
    assert(prompt.includes('Volumetric Liquid Gold Gala'), 'Prompt should include atmosphere');
    assert(prompt.includes('"border":'), 'Prompt should include border field');
    assert(prompt.includes('"topTitle":'), 'Prompt should include topTitle field');
    assert(prompt.includes('"subtitle":'), 'Prompt should include subtitle field');
    assert(prompt.includes('"bottomTitle":'), 'Prompt should include bottomTitle field');
    assert(prompt.includes('"typoIntegration":'), 'Prompt should include typoIntegration field');
    assert(prompt.includes('"atmosphere":'), 'Prompt should include atmosphere field');
    console.log('✅ PASSED: buildComfyFramePrompt produces rich, structured prompt');
}

// Test 2: parseComfyFrameAiResponse with markdown code block
{
    const aiText = `
Here is your frame and typography design:

<design_thinking>
A regal neo-classical aesthetic with liquid gold leaf accents to honor the 50th jubilee milestone.
</design_thinking>

\`\`\`json
{
  "border": "The photo is framed by an ornate gold neo-classical architectural border with sweeping contours.",
  "topTitle": "Union of ITE Training Staff",
  "topTitleStyle": "rendered in an exquisite gold-leaf, fluid hand-drawn script",
  "subtitle": "1976 – 2026",
  "subtitleStyle": "elegantly etched in a smaller minimalist gold serif font",
  "bottomTitle": "50th Anniversary",
  "bottomTitleStyle": "displayed in bold luminous calligraphy",
  "typoIntegration": "All typography is softly backlit with a warm amber glow.",
  "atmosphere": "Volumetric lighting, liquid gold accents, glassmorphism, 8k.",
  "maleStyle": "executive leading man in velvet dinner suit",
  "femaleStyle": "glamorous leading lady in evening gown"
}
\`\`\`
`;

    const parsed = windowMock.parseComfyFrameAiResponse(aiText);
    assert(parsed !== null, 'Should parse output');
    assert.strictEqual(parsed.border, 'The photo is framed by an ornate gold neo-classical architectural border with sweeping contours.');
    assert.strictEqual(parsed.topTitle, 'Union of ITE Training Staff');
    assert.strictEqual(parsed.topTitleStyle, 'rendered in an exquisite gold-leaf, fluid hand-drawn script');
    assert.strictEqual(parsed.subtitle, '1976 – 2026');
    assert.strictEqual(parsed.subtitleStyle, 'elegantly etched in a smaller minimalist gold serif font');
    assert.strictEqual(parsed.bottomTitle, '50th Anniversary');
    assert.strictEqual(parsed.bottomTitleStyle, 'displayed in bold luminous calligraphy');
    assert.strictEqual(parsed.typoStyle, 'All typography is softly backlit with a warm amber glow.');
    assert.strictEqual(parsed.atmosphere, 'Volumetric lighting, liquid gold accents, glassmorphism, 8k.');
    assert.strictEqual(parsed.maleStyle, 'executive leading man in velvet dinner suit');
    assert.strictEqual(parsed.femaleStyle, 'glamorous leading lady in evening gown');
    assert(parsed.designThinking.includes('regal neo-classical'), 'Should extract designThinking');
    console.log('✅ PASSED: parseComfyFrameAiResponse parses JSON code block with design_thinking');
}

// Test 3: parseComfyFrameAiResponse with raw JSON and aliases
{
    const rawJson = JSON.stringify({
        borderStyle: "Translucent frosted-glass cyber border with cyan brackets",
        topApexTitle: "Cyberpunk 2077 Night",
        topApexTitleStyle: "holographic glowing glyphs",
        years: "2077",
        yearsStyle: "digital monospace font",
        bottomBadgeTitle: "Neo Tokyo",
        bottomBadgeStyle: "bold electric blue calligraphy",
        typoStyle: "Backlit with electric neon glow",
        atmosphereLighting: "Cyberpunk neon fog, 8k resolution"
    });

    const parsed = windowMock.parseComfyFrameAiResponse(rawJson);
    assert(parsed !== null, 'Should parse raw JSON');
    assert.strictEqual(parsed.border, 'Translucent frosted-glass cyber border with cyan brackets');
    assert.strictEqual(parsed.topTitle, 'Cyberpunk 2077 Night');
    assert.strictEqual(parsed.topTitleStyle, 'holographic glowing glyphs');
    assert.strictEqual(parsed.subtitle, '2077');
    assert.strictEqual(parsed.bottomTitle, 'Neo Tokyo');
    assert.strictEqual(parsed.typoStyle, 'Backlit with electric neon glow');
    assert.strictEqual(parsed.atmosphere, 'Cyberpunk neon fog, 8k resolution');
    console.log('✅ PASSED: parseComfyFrameAiResponse handles raw JSON with field aliases');
}

// Test 4: parseComfyFrameAiResponse with plain-text key-value format
{
    const plainText = `
Border: The image is framed by crimson festive banners and cherry blossoms.
Top Title: Lunar New Year 2026
Top Title Style: rendered in traditional gold calligraphy
Subtitle: Spring Festival
Subtitle Style: etched in gold sans-serif
Bottom Title: Gong Xi Fa Cai
Bottom Title Style: bold luminous calligraphy
Typography Integration: Backlit with soft festive candle glow
Atmosphere: High-key festive cinematic lighting, vibrant colors, 8k
`;

    const parsed = windowMock.parseComfyFrameAiResponse(plainText);
    assert(parsed !== null, 'Should parse plain text');
    assert(parsed.border.includes('crimson festive banners'), 'Should extract border');
    assert.strictEqual(parsed.topTitle, 'Lunar New Year 2026');
    assert.strictEqual(parsed.subtitle, 'Spring Festival');
    assert.strictEqual(parsed.bottomTitle, 'Gong Xi Fa Cai');
    assert(parsed.typoStyle.includes('festive candle glow'), 'Should extract typography');
    assert(parsed.atmosphere.includes('cinematic lighting'), 'Should extract atmosphere');
    console.log('✅ PASSED: parseComfyFrameAiResponse handles plain-text key-value fallback');
}

// Test 5: applyComfyFrameAiPaste populates DOM elements and updates formula
{
    const sampleAiOutput = `
\`\`\`json
{
  "border": "Bespoke enchanted botanical vine arch with luminous dewdrops.",
  "topTitle": "Secret Garden Gala",
  "topTitleStyle": "rendered in delicate gold script",
  "subtitle": "Autumn 2026",
  "subtitleStyle": "etched in minimalist gold serif",
  "bottomTitle": "Enchanted Evening",
  "bottomTitleStyle": "bold luminous calligraphy",
  "typoIntegration": "Backlit with warm emerald glow.",
  "atmosphere": "Ethereal sunbeams, soft bokeh, 8k."
}
\`\`\`
`;

    const success = windowMock.applyComfyFrameAiPaste(sampleAiOutput);
    assert.strictEqual(success, true, 'applyComfyFrameAiPaste should succeed');

    assert.strictEqual(documentMock.getElementById('prompt-inp-border').value, 'Bespoke enchanted botanical vine arch with luminous dewdrops.');
    assert.strictEqual(documentMock.getElementById('prompt-inp-top-title').value, 'Secret Garden Gala');
    assert.strictEqual(documentMock.getElementById('prompt-inp-top-title-style').value, 'rendered in delicate gold script');
    assert.strictEqual(documentMock.getElementById('prompt-inp-subtitle').value, 'Autumn 2026');
    assert.strictEqual(documentMock.getElementById('prompt-inp-subtitle-style').value, 'etched in minimalist gold serif');
    assert.strictEqual(documentMock.getElementById('prompt-inp-bottom-title').value, 'Enchanted Evening');
    assert.strictEqual(documentMock.getElementById('prompt-inp-bottom-title-style').value, 'bold luminous calligraphy');
    assert.strictEqual(documentMock.getElementById('prompt-inp-typo-style').value, 'Backlit with warm emerald glow.');
    assert.strictEqual(documentMock.getElementById('prompt-inp-atmosphere').value, 'Ethereal sunbeams, soft bokeh, 8k.');

    // Verify live assembled prompt preview was updated
    const livePreview = documentMock.getElementById('prompt-live-preview');
    assert(livePreview.innerHTML.includes('Secret Garden Gala'), 'Live preview should contain new top title');
    assert(livePreview.innerHTML.includes('Enchanted Evening'), 'Live preview should contain new bottom title');

    console.log('✅ PASSED: applyComfyFrameAiPaste auto-populates all DOM fields & refreshes live preview');
}

// Test 6: syncComfyTitlesFromActiveTheme matches current theme and embeds into prompt
{
    windowMock.studio = {
        activeTheme: {
            title: "Cyber City Nights 2077",
            subtitle: "Neo-Tokyo Underground",
            badge: "VIP Pass",
            description: "High-octane cyberpunk neon adventure"
        }
    };

    windowMock.syncComfyTitlesFromActiveTheme(true);

    assert.strictEqual(documentMock.getElementById('comfy-genai-top-title').value, 'Cyber City Nights 2077');
    assert.strictEqual(documentMock.getElementById('comfy-genai-subtitle').value, 'Neo-Tokyo Underground');
    assert.strictEqual(documentMock.getElementById('comfy-genai-bottom-title').value, 'VIP Pass');
    assert(documentMock.getElementById('comfy-genai-concept').value.includes('Cyber City Nights 2077'));

    const compiledPrompt = documentMock.getElementById('comfy-genai-prompt-full').value;
    assert(compiledPrompt.includes('Cyber City Nights 2077'), 'Prompt should include active theme title');
    assert(compiledPrompt.includes('Neo-Tokyo Underground'), 'Prompt should include active theme subtitle');
    assert(compiledPrompt.includes('VIP Pass'), 'Prompt should include active theme bottom badge');

    console.log('✅ PASSED: syncComfyTitlesFromActiveTheme matches active theme & auto-updates prompt');
}

// Test 7: Two-way editing anytime updates prompt dynamically and keeps fields in sync
{
    // User edits top title and subtitle anytime
    documentMock.getElementById('comfy-genai-top-title').value = 'Singapore Night Festival 2026';
    windowMock.onComfyTitleFieldInput('topTitle');

    documentMock.getElementById('comfy-genai-subtitle').value = 'Heritage & Lights Edition';
    windowMock.onComfyTitleFieldInput('subtitle');

    assert.strictEqual(documentMock.getElementById('prompt-inp-top-title').value, 'Singapore Night Festival 2026');
    assert.strictEqual(documentMock.getElementById('prompt-inp-subtitle').value, 'Heritage & Lights Edition');

    const updatedPrompt = documentMock.getElementById('comfy-genai-prompt-full').value;
    assert(updatedPrompt.includes('Singapore Night Festival 2026'), 'Prompt should reflect edited title');
    assert(updatedPrompt.includes('Heritage & Lights Edition'), 'Prompt should reflect edited subtitle');

    console.log('✅ PASSED: Two-way editing anytime updates modular fields and prompt in real-time');
}


// Test 8: Block-based markdown response extraction (### [FRAME_STYLE], etc.)
{
    const blockResponse = `
Here is your photobooth design:

### [FRAME_STYLE]
Ornate neo-classical gilded filigree border with floating amber particles.

### [TOP_TITLE]
Singapore Bicentennial Gala

### [TOP_TITLE_STYLE]
rendered in razor-sharp gold-leaf letterpress

### [SUBTITLE]
1819 – 2019

### [SUBTITLE_STYLE]
elegantly etched in a smaller minimalist gold serif

### [BOTTOM_TITLE]
Honoring the Pioneers

### [BOTTOM_TITLE_STYLE]
displayed in bold luminous typography

### [ATMOSPHERE]
Volumetric liquid gold lighting, soft bokeh, sharp focus, 8k resolution.
`;

    const success = windowMock.applyComfyFrameAiPaste(blockResponse);
    assert.strictEqual(success, true, 'Block-based paste should succeed');

    assert.strictEqual(documentMock.getElementById('prompt-inp-border').value, 'Ornate neo-classical gilded filigree border with floating amber particles.');
    assert.strictEqual(documentMock.getElementById('prompt-inp-top-title').value, 'Singapore Bicentennial Gala');
    assert.strictEqual(documentMock.getElementById('prompt-inp-top-title-style').value, 'rendered in razor-sharp gold-leaf letterpress');
    assert.strictEqual(documentMock.getElementById('prompt-inp-subtitle').value, '1819 – 2019');
    assert.strictEqual(documentMock.getElementById('prompt-inp-subtitle-style').value, 'elegantly etched in a smaller minimalist gold serif');
    assert.strictEqual(documentMock.getElementById('prompt-inp-bottom-title').value, 'Honoring the Pioneers');
    assert.strictEqual(documentMock.getElementById('prompt-inp-bottom-title-style').value, 'displayed in bold luminous typography');
    assert.strictEqual(documentMock.getElementById('prompt-inp-atmosphere').value, 'Volumetric liquid gold lighting, soft bokeh, sharp focus, 8k resolution.');

    // Verify live preview in Step 3 was updated
    const livePreview = documentMock.getElementById('prompt-live-preview');
    assert(livePreview.innerHTML.includes('Singapore Bicentennial Gala'), 'Live preview should contain extracted title');

    console.log('✅ PASSED: Block-based markdown extraction auto-populates relevant blocks & Step 3 preview');
}
console.log('\\n================================================================');
console.log('ALL 8 COMFYUI FRAME & TYPOGRAPHY TESTS PASSED CLEANLY!');
console.log('================================================================');
process.exit(0);
