import { extractTextFromImage, extractColorsFromImage, analyzeImageSections, detectMainSections, detectCardElements, detectFeatureElements } from "./imageAnalyzer";

// ローカルストレージから設定を取得する関数
const getSettingsFromLocalStorage = () => {
  try {
    // ローカルストレージからリセットCSSと変数設定を取得
    const resetCSS = localStorage.getItem('resetCSS') || '';
    const cssVariables = localStorage.getItem('cssVariables') || '';
    const responsiveSettings = localStorage.getItem('responsiveSettings') || '';

    return {
      resetCSS,
      cssVariables,
      responsiveSettings
    };
  } catch (error) {
    console.error('ローカルストレージからの設定取得エラー:', error);
    return {
      resetCSS: '',
      cssVariables: '',
      responsiveSettings: ''
    };
  }
};

const generatePrompt = async ({ responsiveMode, aiBreakpoints, pcImageBase64, spImageBase64 }) => {
  try {
    console.log("プロンプト生成処理を開始");

    // 基本的な画像解析を実行
    console.log("基本的な画像解析を実行中...");

    // 画像から色を取得（エラーハンドリング付き）
    let pcColors = [];
    let spColors = [];
    let pcText = '';
    let spText = '';
    let pcSections = [];
    let spSections = [];
    let pcElements = [];
    let spElements = [];

    // より詳細な画像分析を実行
    if (pcImageBase64) {
      try {
        pcColors = await extractColorsFromImage(pcImageBase64);
        console.log("PC画像から色を抽出しました:", pcColors.length, "色");
      } catch (error) {
        console.error("PC画像の色抽出エラー:", error);
      }

      try {
        pcText = await extractTextFromImage(pcImageBase64);
        console.log("PC画像からテキストを抽出しました");
      } catch (error) {
        console.error("PC画像のテキスト抽出エラー:", error);
        pcText = '';
      }

      try {
        pcSections = await analyzeImageSections(pcImageBase64);
        console.log("PC画像のセクション分析が完了しました:", pcSections.length, "セクション");
      } catch (error) {
        console.error("PC画像のセクション分析エラー:", error);
        pcSections = [];
      }

      try {
        pcElements = await detectFeatureElements(pcImageBase64);
        console.log("PC画像の要素検出が完了しました:", pcElements ? pcElements.elements?.length || 0 : 0, "要素");
      } catch (error) {
        console.error("PC画像の要素検出エラー:", error);
        pcElements = { elements: [] };
      }
    }

    if (spImageBase64) {
      try {
        spColors = await extractColorsFromImage(spImageBase64);
        console.log("SP画像から色を抽出しました:", spColors.length, "色");
      } catch (error) {
        console.error("SP画像の色抽出エラー:", error);
      }

      try {
        spText = await extractTextFromImage(spImageBase64);
        console.log("SP画像からテキストを抽出しました");
      } catch (error) {
        console.error("SP画像のテキスト抽出エラー:", error);
        spText = '';
      }

      try {
        spSections = await analyzeImageSections(spImageBase64);
        console.log("SP画像のセクション分析が完了しました:", spSections.length, "セクション");
      } catch (error) {
        console.error("SP画像のセクション分析エラー:", error);
        spSections = [];
      }

      try {
        spElements = await detectFeatureElements(spImageBase64);
        console.log("SP画像の要素検出が完了しました:", spElements ? spElements.elements?.length || 0 : 0, "要素");
      } catch (error) {
        console.error("SP画像の要素検出エラー:", error);
        spElements = { elements: [] };
      }
    }

    // ローカルストレージから設定を取得
    const settings = getSettingsFromLocalStorage();

    console.log("プロンプトの構築を開始");

    // より構造化されたプロンプトを構築
    let prompt = `
# HTML/SCSS Code Generation from Design Comp

## Basic Information
- Output Type: ${responsiveMode === "both" ? "Responsive Design (PC/SP)" : `${responsiveMode === "pc" ? "PC (Desktop)" : "SP (Mobile)"}`}
- Responsive Mode: ${responsiveMode === "sp" ? "Mobile-first (min-width)" : "Desktop-first (max-width)"}
${aiBreakpoints && aiBreakpoints.length > 0 ?
        `- Allowed Breakpoints: ${aiBreakpoints
          .filter(bp => bp.aiActive)
          .map(bp => `${bp.name} (${bp.value}px)`)
          .join(', ')}`
        : '- No breakpoints specified'}

## Image Analysis Results
`;

    // 抽出されたテキスト情報を追加
    if (pcText || spText) {
      prompt += `
### Detected Text:
${pcText ? `#### PC Image Text:
\`\`\`
${pcText}
\`\`\`` : ""}
${spText ? `#### SP Image Text:
\`\`\`
${spText}
\`\`\`` : ""}

`;
    }

    // 色情報を追加
    if (pcColors.length > 0 || spColors.length > 0) {
      prompt += `
### Detected Colors:
${pcColors.length > 0 ? `- PC Image Main Colors: ${pcColors.join(", ")}` : ""}
${spColors.length > 0 ? `- SP Image Main Colors: ${spColors.join(", ")}` : ""}

`;
    }

    // セクション情報を追加
    if (pcSections.length > 0 || spSections.length > 0) {
      prompt += `
### Detected Section Structure:
${pcSections.length > 0 ? `- PC Image: ${JSON.stringify(pcSections.map(section => ({
        position: `section ${section.section} from top`,
        dominantColor: section.dominantColor
      })))}` : ""}
${spSections.length > 0 ? `- SP Image: ${JSON.stringify(spSections.map(section => ({
        position: `section ${section.section} from top`,
        dominantColor: section.dominantColor
      })))}` : ""}

`;
    }

    // 要素情報を追加（エラーハンドリング付き）
    if ((pcElements && pcElements.elements && pcElements.elements.length > 0) ||
      (spElements && spElements.elements && spElements.elements.length > 0)) {
      prompt += `
### Detected Main Elements:
${pcElements && pcElements.elements && pcElements.elements.length > 0 ? `- PC Image: ${JSON.stringify(pcElements.elements)}` : ""}
${spElements && spElements.elements && spElements.elements.length > 0 ? `- SP Image: ${JSON.stringify(spElements.elements)}` : ""}

`;
    }

    // ローカルストレージから取得した設定を追加
    if (settings.resetCSS || settings.cssVariables || settings.responsiveSettings) {
      prompt += `
## Project Settings
${settings.resetCSS ? `### Reset CSS:
\`\`\`css
${settings.resetCSS}
\`\`\`` : ""}

${settings.cssVariables ? `### CSS Variables:
\`\`\`css
${settings.cssVariables}
\`\`\`` : ""}

${settings.responsiveSettings ? `### Responsive Settings:
\`\`\`css
${settings.responsiveSettings}
\`\`\`` : ""}

`;
    }

    // 最後に具体的な指示を追加
    prompt += `
## Coding Guidelines

You are a professional front-end developer specializing in SCSS and HTML.

### Core Requirements:
- **ONLY code elements visible in the image** - no assumed or extra elements
- **Be faithful to the design** - accurate colors, spacing, and layout
- Use **FLOCSS methodology** instead of BEM
- **ALWAYS USE CSS GRID LAYOUT** instead of Flexbox - Grid should be your first choice for layouts
- Do not create container elements (don't fix width of outer elements)
- **Use color variables from project settings** - Actively use the color variables defined in CSS Variables section
- **Maintain aspect ratios for all images** - use modern CSS techniques like aspect-ratio property
- **Avoid fixed width values** - use percentages, max-width, or relative units
- **Use height properties minimally** - only when absolutely necessary for the design

### HTML Guidelines:
- Create semantic, accessible HTML
- Add class names to each block
- Child elements should use element notation
- Use proper naming conventions for FLOCSS:
  - **p-**: Project-specific components (header, footer, main visual, etc.)
  - **l-**: Layout components (grid, container, wrapper, etc.)
  - **c-**: Common reusable components (button, card, form, etc.)
  - **u-**: Utility classes
- **DO NOT combine different prefixes in the same element** (e.g., DO NOT use \`class="c-button p-section__button"\`)
- **Each element should use only ONE prefix type** - choose the most appropriate one based on its role
- **DO NOT use <header> or <main> tags** - use div with appropriate classes instead
- Analyze the design and assign **specific, descriptive class names** that reflect design features

### SCSS Guidelines:
- Follow the ${responsiveMode === "both" ? "responsive approach" : `${responsiveMode === "sp" ? "Mobile-first" : "Desktop-first"} approach`}
- **❌ ABSOLUTELY NO NESTING IN SCSS! ❌** - This is the most critical requirement
- **⚠️ WARNING: Any nested selectors using the & operator will be rejected**
- **⚠️ WARNING: SCSS with nested selectors will need to be completely rewritten**
- **✅ The ONLY exception: @include mq() media queries** - NOTHING ELSE can be nested

### 📋 CORRECT SCSS STRUCTURE (FOLLOW THIS EXACTLY):

\`\`\`scss
/* ✓ CORRECT: Each selector written separately */
/* Project Component Example */
.p-hero {
  background-color: $primary-color;
  padding: 2rem 0;
}

.p-hero__title {
  font-size: 2rem;
  color: white;
}

/* Layout Component Example */
.l-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

/* Common Component Example */
.c-card {
  background-color: white;
  padding: 1.25rem;
}

.c-card__title {
  font-size: 1.25rem;
  color: $primary-color;
}

.c-card__content {
  font-size: 1rem;
}

/* ✓ CORRECT: Media queries are the ONLY allowed nesting */
.p-features {
  display: grid;
  grid-template-columns: 1fr;

  @include mq(${aiBreakpoints.filter(bp => bp.aiActive)[0]?.name || 'md'}) {
    grid-template-columns: 1fr 1fr;
  }
}

/* ✓ CORRECT: Hover states also written as separate selectors */
.c-button {
  background-color: blue;
  color: white;
}

.c-button:hover {
  background-color: darkblue;
}
\`\`\`

### 📋 INCORRECT SCSS STRUCTURE (NEVER DO THIS):

\`\`\`scss
/* ❌ WRONG - Using nesting with & operator */
.c-card {
  background-color: white;

  &__title {  /* NEVER DO THIS! */
    font-size: 1.25rem;
  }

  &__content {  /* NEVER DO THIS! */
    font-size: 1rem;
  }

  &:hover {  /* NEVER DO THIS! */
    background-color: #f9f9f9;
  }
}
\`\`\`

- **Media query usage (THE ONLY ALLOWED NESTING):**
\`\`\`scss
/* ✓ Base mobile styles */
.c-button {
  display: block;
  width: 100%;
  padding: 12px;
  color: ${responsiveMode === "sp" ? "white" : "blue"};
  background-color: $primary-color;
  text-align: center;

  /* ✓ Only media queries can be nested */
  @include mq(${aiBreakpoints.filter(bp => bp.aiActive)[0]?.name || 'md'}) {
    display: inline-block;
    width: auto;
    padding: 12px 24px;
  }
}
\`\`\`

- **CRITICAL REQUIREMENT - BREAKPOINT USAGE:**
  - **ONLY use these exact breakpoint names: ${aiBreakpoints.filter(bp => bp.aiActive).map(bp => bp.name).join(', ') || 'None available'}**
  - **DO NOT use any other breakpoint names** like sm, xs, xl, etc. unless specified above.
  - **Breakpoint implementation:** ${responsiveMode === "sp"
        ? "Mobile-first approach using min-width queries - base styles for mobile, media queries for larger screens"
        : "Desktop-first approach using max-width queries - base styles for desktop, media queries for smaller screens"}
- **ABSOLUTELY FORBIDDEN: &__element notation in SCSS** - this is WRONG and MUST NEVER be used

- **Use the CSS color variables provided instead of hardcoded hex values** - Match similar colors to the variables provided
- Ensure compatibility with the provided Reset CSS
- **For images**: use aspect-ratio property to maintain proportions (e.g., \`aspect-ratio: 16 / 9;\`)
- **For width**: use percentages or relative units (e.g., \`width: 100%;\`, \`max-width: 100%;\`)
- **For height**: use auto where possible or aspect-ratio to control dimensions
- **ALWAYS USE rem UNITS INSTEAD OF px** - Convert all pixel values to rem (root font-size: 16px)
  - Formula: rem = px / 16
  - Examples: 16px = 1rem, 24px = 1.5rem, 32px = 2rem, 8px = 0.5rem
  - The ONLY exceptions are media queries and 1px borders

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
// SCSS code here (flat structure, with breakpoints inside selectors)
\`\`\`

Analyze the image structure and layout in detail to create accurate HTML and SCSS that precisely reflect ONLY what is visible in the image.
`;

    // AIの出力にネスト構造が含まれないように強い警告を追加
    prompt += `
## FINAL CRUCIAL INSTRUCTIONS - SCSS STRUCTURE
- **NEVER UNDER ANY CIRCUMSTANCES OUTPUT NESTED SCSS USING & OPERATOR**
- **ANY CODE WITH &__element or &:hover NOTATION IS STRICTLY PROHIBITED**
- **YOU MUST ALWAYS WRITE FLAT SELECTORS** such as .p-hero__title or .c-card__title (not .p-hero { &__title } or .c-card { &__title })
- **USE APPROPRIATE PREFIX FOR EACH ELEMENT TYPE**:
  - p- for page/project specific components like heroes, headers, footers, main sections
  - l- for layout components like containers, grids, wrappers
  - c- for common reusable UI components like buttons, cards, forms, navigation menus
  - u- for utility classes
- **DO NOT USE MULTIPLE DIFFERENT PREFIXES ON THE SAME ELEMENT** - Choose exactly one prefix type per element
- **INCORRECT: \`<a class="c-button p-section__button">View more</a>\`**
- **CORRECT: Choose either \`<a class="c-button">View more</a>\`** based on context
- **CHECK YOUR OUTPUT BEFORE SUBMITTING:** if you see any & symbols in your SCSS, rewrite it all with flat selectors
- **THIS IS A ZERO TOLERANCE REQUIREMENT:** nested SCSS code will be rejected automatically

Remember: The ONLY nesting allowed is for @include mq() media queries - nothing else.

I will immediately reject your solution if it contains any nested SCSS using the & operator.
`;

    console.log("プロンプト生成が完了しました");
    return prompt;
  } catch (error) {
    console.error('プロンプト生成中にエラーが発生しました:', error);

    // エラーが発生しても最低限のプロンプトを生成して返す
    return `
# HTML/SCSS Code Generation from Design Comp

Analyze the uploaded image and generate HTML and SCSS code.
Accurately reproduce the layout, elements, text, and colors in the image.

## Important Instructions
- ONLY code elements visible in the image - no assumed or extra elements
- Be faithful to the design - accurate colors, spacing, and layout
- Use FLOCSS methodology instead of BEM:
  - **p-**: Project-specific components (header, footer, main visual, etc.)
  - **l-**: Layout components (grid, container, wrapper, etc.)
  - **c-**: Common reusable components (button, card, form, etc.)
  - **u-**: Utility classes
- **DO NOT combine different prefixes in the same element** (each element should use only ONE prefix type)
- **ALWAYS USE CSS GRID LAYOUT instead of Flexbox - Grid should be your first choice**
- Use flat SCSS structure - DO NOT use nested selectors

## ❌ FORBIDDEN: SCSS Nesting - Critical Warning
- **❌ ABSOLUTELY NO NESTING IN SCSS!**
- **❌ NEVER use &__element notation**
- **❌ NEVER use &:hover or other nested pseudo-selectors**
- All selectors MUST be written independently
- Example of FORBIDDEN code:
\`\`\`scss
/* WRONG! NEVER DO THIS! */
.c-card {
  padding: 20px;

  &__title { /* WRONG */
    font-size: 1.25rem;
  }

  &:hover { /* WRONG */
    background-color: #f9f9f9;
  }
}
\`\`\`

## ✅ CORRECT SCSS Structure
- Write each selector independently:
\`\`\`scss
/* CORRECT */
/* Project Component */
.p-header {
  padding: 1.25rem 0;
}

/* Layout Component */
.l-container {
  max-width: 1200px;
  margin: 0 auto;
}

/* Common Component */
.c-card {
  padding: 1.25rem;
}

.c-card__title {
  font-size: 1.25rem;
}

.c-card:hover {
  background-color: #f9f9f9;
}
\`\`\`

## Media Query Exception
- The ONLY allowed nesting is for media queries:
\`\`\`scss
/* CORRECT - Only media queries can be nested */
.c-element {
  property: value;

  @include mq(md) {
    property: new-value;
  }
}
\`\`\`

## Breakpoint Instructions
- **CRITICAL: ONLY use these exact breakpoints that are set in the responsive settings**
- **For Mobile-first approach (default):**
  - Write base styles for mobile view
  - Use min-width media queries (@include mq()) for tablet/desktop layouts
- **For Desktop-first approach:**
  - Write base styles for desktop view
  - Use max-width media queries (@include mq()) for tablet/mobile layouts
- **NEVER invent or use breakpoint names not specified in settings**

## Other Requirements
- Use existing color variables when available instead of hardcoded hex values
- DO NOT use <header> or <main> tags
- Use specific, descriptive class names reflecting design features
- Maintain aspect ratios for all images using aspect-ratio property
- Avoid fixed width values - use percentages or relative units
- Use height properties minimally - only when absolutely necessary

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
// SCSS code here (flat structure, with breakpoints inside selectors)
\`\`\`
`;
  }
};

export { generatePrompt };
