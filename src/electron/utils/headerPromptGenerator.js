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

// 共通のプロンプト指示を生成する関数
const getCommonPromptInstructions = (responsiveMode, aiBreakpoints) => {
  return `
### Output Format Guidelines:
- Provide ONLY the HTML and CSS without any explanation
- Format your response with Markdown code blocks:
  \`\`\`html
  <!-- Your HTML code here -->
  \`\`\`

  \`\`\`css
  /* Your CSS code here */
  \`\`\`
- Do not include any explanations before or after the code blocks
- Respond with ONLY these two code blocks

## Responsive Guidelines:
${responsiveMode === "sp" ?
      `- Use mobile-first approach (min-width media queries)
- Base CSS should be for mobile devices
- Use media queries to enhance layout for larger screens` :
      `- Use desktop-first approach (max-width media queries)
- Base CSS should be for desktop devices
- Use media queries to adjust layout for smaller screens`}

## Breakpoints:
${aiBreakpoints && aiBreakpoints.length > 0 ?
      `Use ONLY these breakpoints in your media queries:
${aiBreakpoints
        .filter(bp => bp.aiActive)
        .map(bp => `- ${bp.name}: ${bp.value}px`)
        .join('\n')}

Media query syntax example:
\`\`\`css
@media (${responsiveMode === "sp" ? "min" : "max"}-width: ${aiBreakpoints.find(bp => bp.aiActive)?.value || 768}px) {
  /* styles here */
}
\`\`\`` :
      `- Use standard breakpoints if needed:
  - Mobile: 375px
  - Tablet: 768px
  - Desktop: 1024px and above`}

## CSS Specific Requirements:
- Use modern CSS features (flexbox, grid, etc.)
- Do not use unnecessary vendor prefixes
- Keep the CSS clean and well-organized
- No pre-processors or external dependencies
- Optimize for performance and readability
- No CSS reset or normalize code

## Best Practices to Follow:
- Ensure all interactive elements are accessible
- Use semantic HTML elements appropriately
- Implement proper hover/focus states for interactive elements
- Ensure sufficient color contrast for text readability
- Size text appropriately for readability on all devices
- Utilize CSS variables for consistent theming
`;
};

// ヘッダー生成用のプロンプトを生成する関数
export const generateHeaderPrompt = async ({
  responsiveMode,
  aiBreakpoints,
  pcImageBase64,
  spImageBase64,
  pcImageText,
  pcColors
}) => {
  try {
    console.log("ヘッダープロンプト生成処理を開始");
    console.log("モード: ヘッダー生成");

    // 基本的な画像解析を実行
    console.log("基本的な画像解析を実行中...");

    // 画像から色を取得（エラーハンドリング付き）
    let pcColorsList = pcColors || [];
    let spColorsList = [];
    let pcTextData = pcImageText || '';
    let spTextData = '';
    let pcSections = [];
    let spSections = [];
    let pcElements = [];
    let spElements = [];

    // より詳細な画像分析を実行
    if (pcImageBase64 && !pcColors) {
      try {
        pcColorsList = await extractColorsFromImage(pcImageBase64);
        console.log("PC画像から色を抽出しました:", pcColorsList.length, "色");
      } catch (error) {
        console.error("PC画像の色抽出エラー:", error);
      }

      try {
        if (!pcImageText) {
          pcTextData = await extractTextFromImage(pcImageBase64);
          console.log("PC画像からテキストを抽出しました");
        }
      } catch (error) {
        console.error("PC画像のテキスト抽出エラー:", error);
        pcTextData = '';
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
        spColorsList = await extractColorsFromImage(spImageBase64);
        console.log("SP画像から色を抽出しました:", spColorsList.length, "色");
      } catch (error) {
        console.error("SP画像の色抽出エラー:", error);
      }

      try {
        spTextData = await extractTextFromImage(spImageBase64);
        console.log("SP画像からテキストを抽出しました");
      } catch (error) {
        console.error("SP画像のテキスト抽出エラー:", error);
        spTextData = '';
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

    // ヘッダー用プロンプトを構築
    let prompt = `
# Header Component Generation from Design Comp

## Basic Information
- Component Type: Header/Navigation
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
    if (pcTextData || spTextData) {
      prompt += `
### Detected Text:
${pcTextData ? `#### PC Image Text:
\`\`\`
${pcTextData}
\`\`\`` : ""}
${spTextData ? `#### SP Image Text:
\`\`\`
${spTextData}
\`\`\`` : ""}

`;
    }

    // 色情報を追加
    if (pcColorsList.length > 0 || spColorsList.length > 0) {
      prompt += `
### Detected Colors:
${pcColorsList.length > 0 ? `- PC Image Main Colors: ${pcColorsList.join(", ")}` : ""}
${spColorsList.length > 0 ? `- SP Image Main Colors: ${spColorsList.join(", ")}` : ""}

`;
    }

    // 設定情報があれば追加
    if (settings.cssVariables || settings.resetCSS || settings.responsiveSettings) {
      prompt += `
## Project Settings
`;

      if (settings.cssVariables) {
        prompt += `
### CSS Variables:
\`\`\`css
${settings.cssVariables}
\`\`\`
`;
      }

      if (settings.resetCSS) {
        prompt += `
### Reset CSS:
\`\`\`css
${settings.resetCSS}
\`\`\`
`;
      }

      if (settings.responsiveSettings) {
        prompt += `
### Responsive Settings:
\`\`\`css
${settings.responsiveSettings}
\`\`\`
`;
      }
    }

    // ヘッダー固有の指示を追加
    prompt += `
## Header Component Requirements:

### Core Requirements:
- Create a modern, professional header component based on the uploaded image
- Implement a responsive design that works well on all devices
- Include navigation menu with clean transitions
- Ensure the header is sticky/fixed at the top of the viewport
- Add appropriate hover effects for interactive elements
- Include a mobile hamburger menu for small screens
- Ensure accessibility with proper ARIA attributes

### CSS Variables Requirements:
${settings.cssVariables
        ? (() => {
          // cssVariablesから変数名を抽出
          const varRegex = /\$([\w-]+):\s*([^;]+);/g;
          let matches;
          let varList = '';
          let varNames = [];

          // 全ての変数を抽出
          while ((matches = varRegex.exec(settings.cssVariables)) !== null) {
            const [_, varName, varValue] = matches;
            varList += `- $${varName}: ${varValue.trim()}\n`;
            varNames.push(varName);
          }

          const varNamesStr = varNames.map(name => `$${name}`).join(', ');

          return `IMPORTANT: Use ONLY the CSS variables defined in your project settings.
Specifically, use ONLY these variables:
${varList}
For colors not covered by these variables, use direct HEX values instead.
DO NOT create custom variables.`;
        })()
        : `IMPORTANT: Use direct HEX values for all colors.
DO NOT create custom variables like $accent-color or $secondary-color.`}

### HTML Guidelines:
  - Create semantic, accessible HTML for the header
    - Add class names using FLOCSS methodology
  - Use the following structure:
\`\`\`html
  <div class="p-header">
    <div class="p-header__inner">
      <h1 class="p-header__logo">
        <!-- Logo content -->
      </h1>
      <nav class="p-header__nav">
        <!-- Navigation links -->
      </nav>
      <div class="p-header__buttons">
        <!-- CTA buttons or other interactive elements -->
      </div>
    </div>
  </div>
  \`\`\`
- Add appropriate attributes for accessibility

### SCSS Guidelines:
- Follow the ${responsiveMode === "both" ? "responsive approach" : `${responsiveMode === "sp" ? "Mobile-first" : "Desktop-first"} approach`}
- **❌ ABSOLUTELY NO NESTING IN SCSS! ❌** - This is the most critical requirement
- All styles must be written with flat selectors
- Media queries (@include mq()) are the only allowed nesting
- Use color variables from project settings when possible
- Implement smooth transitions for hover states
- Create mobile-friendly navigation with a hamburger menu

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

- ${settings.cssVariables ?
        (() => {
          // cssVariablesから変数名を抽出
          const varRegex = /\$([\w-]+):\s*([^;]+);/g;
          let matches;
          let varNames = [];

          // 全ての変数を抽出
          while ((matches = varRegex.exec(settings.cssVariables)) !== null) {
            const [_, varName] = matches;
            varNames.push(varName);
          }

          const varNamesStr = varNames.map(name => `$${name}`).join(', ');

          return `**Use ONLY the CSS variables defined in the project settings**
- **SPECIFICALLY, use ONLY ${varNamesStr}**
- **DO NOT USE any other variables not defined in the project settings**`;
        })() :
        `**DO NOT use any CSS variables - none are defined in this project**
- **Use direct HEX values for all colors**`}
- Ensure compatibility with the provided Reset CSS
- **For images**: use aspect-ratio property to maintain proportions (e.g., \`aspect-ratio: 16 / 9;\`)
- **For width**: use percentages or relative units (e.g., \`width: 100%;\`, \`max-width: 100%;\`)
- **For height**: use auto where possible or aspect-ratio to control dimensions
- **ALWAYS USE rem UNITS INSTEAD OF px** - Convert all pixel values to rem (root font-size: 16px)
  - Formula: rem = px / 16
  - Examples: 16px = 1rem, 24px = 1.5rem, 32px = 2rem, 8px = 0.5rem
  - The ONLY exceptions are media queries and 1px borders
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

    // エラー時のバックアッププロンプト
    if (!prompt || prompt.trim() === '') {
      console.warn("生成されたプロンプトが空です。緊急用のプロンプトを使用します。");
      prompt = getEmergencyPrompt();
    }

    console.log("ヘッダープロンプト生成完了");
    return prompt;
  } catch (error) {
    console.error("プロンプト生成エラー:", error);
    return getEmergencyPrompt();
  }
};

// エラー時のバックアッププロンプト
const getEmergencyPrompt = () => {
  // ローカルストレージから設定を取得
  const settings = getSettingsFromLocalStorage();

  return `
# Header Component Generation

## Requirements
- Create a modern, professional header component
- Implement responsive design (mobile-first approach)
- Include logo, navigation menu, and CTA button
- Add a hamburger menu for mobile views
- Ensure accessibility with proper semantic HTML and ARIA attributes
- DO NOT use nested SCSS with & operator
- Write all selectors separately in flat structure

## CSS Variables Requirements
${settings.cssVariables ? (() => {
      // cssVariablesから変数名を抽出
      const varRegex = /\$([\w-]+):\s*([^;]+);/g;
      let matches;
      let varList = '';
      let varNames = [];

      // 全ての変数を抽出
      while ((matches = varRegex.exec(settings.cssVariables)) !== null) {
        const [_, varName, varValue] = matches;
        varList += `- $${varName}: ${varValue.trim()}\n`;
        varNames.push(varName);
      }

      const varNamesStr = varNames.map(name => `$${name}`).join(', ');

      return `IMPORTANT: Use ONLY the CSS variables defined in your project settings.
Specifically, use ONLY these variables:
${varList}
For colors not covered by these variables, use direct HEX values instead.
DO NOT create custom variables.`;
    })() : `IMPORTANT: Use direct HEX values for all colors.
DO NOT create custom variables like $accent-color or $secondary-color.`}

## Output Format
- Provide HTML and CSS code only
- Use modern CSS features like flexbox and CSS variables
- Format with markdown code blocks

Please generate a clean, responsive header component based on these requirements.
`;
};

export default generateHeaderPrompt;
