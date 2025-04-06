import { extractTextFromImage, extractColorsFromImage, analyzeImageSections, detectMainSections, detectCardElements, detectFeatureElements } from "./imageAnalyzer";

// 共通のエラーハンドリング関数
const handleAnalysisError = (operation, error, defaultValue) => {
  console.error(`${operation}エラー:`, error);
  return defaultValue;
};

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

// CSS変数からHEX値を抽出する関数
const extractHexValuesFromVariables = (cssVars) => {
  const hexValues = [];
  const varRegex = /\$([\w-]+):\s*([^;]+);/g;
  let match;

  while ((match = varRegex.exec(cssVars)) !== null) {
    const [_, varName, varValue] = match;
    const value = varValue.trim();

    // HEX値のみを抽出
    if (value.startsWith('#')) {
      hexValues.push(value);
    }
  }

  return hexValues;
};

// 画像解析を実行して結果を取得する関数
const analyzeImage = async (imageBase64, imageType) => {
  if (!imageBase64) return { colors: [], text: '', sections: [], elements: { elements: [] } };

  const colors = await extractColorsFromImage(imageBase64)
    .catch(error => handleAnalysisError(`${imageType}画像の色抽出`, error, []));

  console.log(`${imageType}画像から色を抽出しました:`, colors.length, "色");

  const text = await extractTextFromImage(imageBase64)
    .catch(error => handleAnalysisError(`${imageType}画像のテキスト抽出`, error, ''));

  console.log(`${imageType}画像からテキストを抽出しました`);

  const sections = await analyzeImageSections(imageBase64)
    .catch(error => handleAnalysisError(`${imageType}画像のセクション分析`, error, []));

  console.log(`${imageType}画像のセクション分析が完了しました:`, sections.length, "セクション");

  const elements = await detectFeatureElements(imageBase64)
    .catch(error => handleAnalysisError(`${imageType}画像の要素検出`, error, { elements: [] }));

  console.log(`${imageType}画像の要素検出が完了しました:`, elements ? elements.elements?.length || 0 : 0, "要素");

  return { colors, text, sections, elements };
};

// コアプロンプト部分を構築する関数
const buildCorePrompt = (responsiveMode, aiBreakpoints) => {
  return `
# HTML/SCSS Code Generation from Design Comp

## Basic Information
- Output Type: ${responsiveMode === "both" ? "Responsive Design (PC/SP)" : `${responsiveMode === "pc" ? "PC (Desktop)" : "SP (Mobile)"}`}
${aiBreakpoints && aiBreakpoints.length > 0 ? `- Breakpoints: ${aiBreakpoints.map(bp => `${bp.width}px`).join(', ')}` : ''}
`;
};

// 解析結果部分を構築する関数
const buildAnalysisSection = (pcAnalysis, spAnalysis) => {
  let section = `
## Image Analysis Results
`;

  // テキスト情報
  if (pcAnalysis.text || spAnalysis.text) {
    section += `
### Detected Text:
${pcAnalysis.text ? `#### PC Image Text:
\`\`\`
${pcAnalysis.text}
\`\`\`` : ""}
${spAnalysis.text ? `#### SP Image Text:
\`\`\`
${spAnalysis.text}
\`\`\`` : ""}

`;
  }

  // 色情報
  if (pcAnalysis.colors.length > 0 || spAnalysis.colors.length > 0) {
    section += `
### Detected Colors:
${pcAnalysis.colors.length > 0 ? `- PC Image Main Colors: ${pcAnalysis.colors.join(", ")}` : ""}
${spAnalysis.colors.length > 0 ? `- SP Image Main Colors: ${spAnalysis.colors.join(", ")}` : ""}

`;
  }

  // セクション情報
  if (pcAnalysis.sections.length > 0 || spAnalysis.sections.length > 0) {
    section += `
### Detected Section Structure:
${pcAnalysis.sections.length > 0 ? `- PC Image: ${JSON.stringify(pcAnalysis.sections.map(section => ({
      position: `section ${section.section} from top`,
      dominantColor: section.dominantColor
    })))}` : ""}
${spAnalysis.sections.length > 0 ? `- SP Image: ${JSON.stringify(spAnalysis.sections.map(section => ({
      position: `section ${section.section} from top`,
      dominantColor: section.dominantColor
    })))}` : ""}

`;
  }

  // 要素情報
  if ((pcAnalysis.elements && pcAnalysis.elements.elements && pcAnalysis.elements.elements.length > 0) ||
    (spAnalysis.elements && spAnalysis.elements.elements && spAnalysis.elements.elements.length > 0)) {
    section += `
### Detected Main Elements:
${pcAnalysis.elements && pcAnalysis.elements.elements && pcAnalysis.elements.elements.length > 0 ? `- PC Image: ${JSON.stringify(pcAnalysis.elements.elements)}` : ""}
${spAnalysis.elements && spAnalysis.elements.elements && spAnalysis.elements.elements.length > 0 ? `- SP Image: ${JSON.stringify(spAnalysis.elements.elements)}` : ""}

`;
  }

  return section;
};

// 設定セクションを構築する関数
const buildSettingsSection = (settings, pcColors, spColors) => {
  if (!settings.resetCSS && !settings.cssVariables && !settings.responsiveSettings) {
    return '';
  }

  let section = `
## Project Settings
`;

  if (settings.resetCSS) {
    section += `### Reset CSS:
\`\`\`css
${settings.resetCSS}
\`\`\`

`;
  }

  if (settings.cssVariables) {
    section += `
### Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like $primary-color, etc.)
- Here is a recommended color palette based on the design:
`;

    // 変数からHEX値を抽出
    const hexValues = extractHexValuesFromVariables(settings.cssVariables);

    // 抽出した色を追加
    if (hexValues.length > 0) {
      section += `  ${hexValues.join(', ')}
`;
    }

    // PC画像とSP画像から抽出した色も追加
    if (pcColors.length > 0 || spColors.length > 0) {
      section += `- Additional colors from the image:
  ${[...pcColors, ...spColors].filter((c, i, a) => a.indexOf(c) === i).join(', ')}
`;
    }

    section += `- Feel free to use variations of these colors where needed

`;
  } else {
    // cssVariablesがない場合
    section += `### CSS Variables:
\`\`\`css
${settings.cssVariables}
\`\`\`

`;
  }

  if (settings.responsiveSettings) {
    section += `### Responsive Settings:
\`\`\`css
${settings.responsiveSettings}
\`\`\`

`;
  }

  return section;
};

// ガイドラインセクションを構築する関数
const buildGuidelinesSection = (responsiveMode) => {
  return `
## Coding Guidelines

You are a professional front-end developer specializing in SCSS and HTML.

### Core Requirements:
- **❗❗MOST CRITICAL: FAITHFULLY REPRODUCE THE DESIGN COMP❗❗** - match exact layout, spacing, sizing, and visual details
- **Compare your output with the provided image before submitting** - make adjustments to match design details precisely
- **ONLY code elements visible in the image** - no assumed or extra elements
- **Be faithful to the design** - accurate colors, spacing, and layout
- Use **FLOCSS methodology** instead of BEM
- **❗ALWAYS USE CSS GRID LAYOUT❗** - **NEVER** use Flexbox unless absolutely impossible with Grid
- Do not create container elements (don't fix width of outer elements)
- **No SCSS nesting** - write flat SCSS structure
- **Maintain aspect ratios for all images** - use modern CSS techniques like aspect-ratio property
- **Avoid fixed width values** - use percentages, max-width, or relative units
- **Use height properties minimally** - only when absolutely necessary for the design

### HTML Guidelines:
- Create semantic, accessible HTML
- Add class names to each block
- Child elements should use element notation
- Use proper naming conventions for FLOCSS
- **START HEADING TAGS FROM h2** - do not use h1 tags in components
- **USE <a> TAGS DIRECTLY WITH COMPONENT CLASSES** - apply component classes like c-button directly to <a> tags, do not create unnecessary div wrappers
- **CORRECT BUTTON EXAMPLE**: \`<div class="p-hoge__button"><a href="#" class="c-button">View more →</a></div>\`
- **WRONG BUTTON EXAMPLE**: \`<div class="p-hoge__button"><div class="c-button"><a href="#" class="c-button__link">View more →</a></div></div>\`
- **DO NOT use <header> or <main> tags** - use div with appropriate classes instead
- Analyze the design and assign **specific, descriptive class names** that reflect design features
- **Accessibility considerations**:
  - Use appropriate ARIA attributes for interactive elements
  - Ensure sufficient color contrast (minimum 4.5:1 for normal text)
  - **Add Japanese alt text to all images**:
    - Use descriptive Japanese text (e.g., alt="株式会社〇〇のロゴ" instead of alt="企業ロゴ")
    - Use empty alt attribute for decorative images (alt="")
    - Keep descriptions concise (5-15 Japanese characters)
    - Ensure alt text conveys the image's purpose
  - Ensure keyboard navigation works for interactive elements

### FLOCSS Component Structure Guidelines:
- **Project (p-)**: Page/layout specific components
  - Example: \`.p-hero\`, \`.p-footer\`, \`.p-news-section\`
  - Use for large distinctive sections of the page

- **Layout (l-)**: Structure and grid components
  - Example: \`.l-container\`, \`.l-grid\`, \`.l-row\`
  - Used for layout structures that organize content

- **Component (c-)**: Reusable UI elements
  - Example: \`.c-button\`, \`.c-card\`, \`.c-form\`
  - Independent, reusable elements that can appear in multiple contexts

- **Utility (u-)**: Single-purpose utility classes
  - Example: \`.u-text-center\`, \`.u-margin-top\`
  - Typically modify one specific property

### SCSS Guidelines:
- Follow the ${responsiveMode === "both" ? "responsive approach" : `${responsiveMode === "pc" ? "Desktop-first" : "Mobile-first"} approach`}
- **❗❗CRITICAL: MEDIA QUERIES MUST BE PLACED INSIDE SELECTORS - AND THEY ARE THE *ONLY* NESTING ALLOWED❗❗** - like this:
\`\`\`scss
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: center;

  @include mq(md) {
    grid-template-columns: 1fr;
  }
}
\`\`\`

- **❌ NEVER USE SCSS NESTING WITH & SYMBOL** - Here's what NOT to do:
\`\`\`scss
// THIS IS WRONG - NEVER DO THIS
.p-hoge {
  background-color: #e9f5f9;

  &__title {  // WRONG - DON'T USE &__
    font-size: 2rem;
  }

  &__content {  // WRONG - DON'T USE &__
    display: grid;
  }
}
\`\`\`

- **✅ CORRECT WAY - USE FLAT SELECTORS** - Always write like this:
\`\`\`scss
// THIS IS CORRECT - ALWAYS DO THIS
.p-hoge {
  background-color: #e9f5f9;
}

.p-hoge__title {  // CORRECT - FLAT SELECTOR
  font-size: 2rem;
}

.p-hoge__content {  // CORRECT - FLAT SELECTOR
  display: grid;
}
\`\`\`

- **❌ NEVER WRITE MEDIA QUERIES THIS WAY** (WRONG! DON'T DO THIS!):
\`\`\`scss
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: center;
}

@include mq(md) {
  .p-hoge__content {
    grid-template-columns: 1fr;
  }
}
\`\`\`

### Performance Optimization Guidelines:
- Use modern CSS properties (will-change, contain, etc.) for performance-critical animations
- Avoid unnecessary DOM nesting to reduce rendering complexity
- Use CSS Grid efficiently to minimize layout shifts during loading
- Consider lazy-loading for images below the fold using loading="lazy" attribute
- Prefer system fonts or optimized web fonts to reduce layout shifts

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
// SCSS code here (flat structure, except for media queries which should be nested)
\`\`\`

Analyze the image structure and layout in detail to create accurate HTML and SCSS that precisely reflect ONLY what is visible in the image.
`;
};

// レスポンシブデザインガイドラインセクションを構築する関数
const buildResponsiveGuidelinesSection = () => {
  return `
## Responsive Design Implementation Guidelines

### For Output Type: SP (Mobile)
Use a Mobile-first approach. Base styles should be for mobile devices, and use @include mq(md) media queries for larger screens.

Example:
\`\`\`scss
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr; // Single column for SP
  gap: 1rem;

  @include mq(md) {
    grid-template-columns: 1fr 1fr; // Multiple columns for PC according to design
    gap: 2rem;
  }
}
\`\`\`

### For Output Type: PC (Desktop)
Use a Desktop-first approach. Base styles should be for desktop devices, and use @include mq(md) media queries for smaller screens.

Example:
\`\`\`scss
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr 1fr; // Multiple columns for PC according to design
  gap: 2rem;

  @include mq(md) {
    grid-template-columns: 1fr; // Single column for SP
    gap: 1rem;
  }
}
\`\`\`

In both cases, ensure that mobile displays have a single-column layout, while desktop displays follow the multi-column structure as shown in the design comp. The media query function @include mq(md) should be used consistently for both approaches.
`;
};

// 最終指示セクションを構築する関数
const buildFinalInstructionsSection = () => {
  return `
## FINAL CRUCIAL INSTRUCTIONS - SCSS STRUCTURE
- **❌❌❌ NEVER UNDER ANY CIRCUMSTANCES OUTPUT NESTED SCSS USING & OPERATOR ❌❌❌**
- **ANY CODE WITH &__element or &:hover NOTATION IS STRICTLY PROHIBITED**
- **I WILL REJECT ANY CODE THAT USES SCSS NESTING WITH & SYMBOL**
- **YOU MUST ALWAYS WRITE FLAT SELECTORS** such as .p-hero__title or .c-card__title (not .p-hero { &__title } or .c-card { &__title })
- **ONLY MEDIA QUERIES @include mq() ARE ALLOWED TO BE NESTED INSIDE SELECTORS**
- **USE APPROPRIATE PREFIX FOR EACH ELEMENT TYPE**:
  - p- for page/project specific components like heroes, headers, footers, main sections
  - l- for layout components like containers, grids, wrappers
  - c- for common reusable UI components like buttons, cards, forms, navigation menus
  - u- for utility classes
- **DO NOT USE MULTIPLE DIFFERENT PREFIXES ON THE SAME ELEMENT** - Choose exactly one prefix type per element
- **INCORRECT: \`<a class="c-button p-hoge__button">View more</a>\`**
- **CORRECT: \`<a class="c-button">View more</a>\`** based on context
- **CHECK YOUR OUTPUT BEFORE SUBMITTING:** if you see any & symbols in your SCSS, rewrite it all with flat selectors
- **THIS IS A ZERO TOLERANCE REQUIREMENT:** nested SCSS code will be rejected automatically
`;
};

// プロンプト生成の主要関数
const generatePrompt = async ({ responsiveMode, aiBreakpoints, pcImageBase64, spImageBase64 }) => {
  try {
    console.log("プロンプト生成処理を開始");

    // 画像解析を実行
    console.log("画像解析を実行中...");
    const pcAnalysis = await analyzeImage(pcImageBase64, "PC");
    const spAnalysis = await analyzeImage(spImageBase64, "SP");

    // ローカルストレージから設定を取得
    const settings = getSettingsFromLocalStorage();

    console.log("プロンプトの構築を開始");

    // プロンプトの各セクションを構築
    let prompt = buildCorePrompt(responsiveMode, aiBreakpoints);
    prompt += buildAnalysisSection(pcAnalysis, spAnalysis);
    prompt += buildSettingsSection(settings, pcAnalysis.colors, spAnalysis.colors);
    prompt += buildGuidelinesSection(responsiveMode);
    prompt += buildResponsiveGuidelinesSection();
    prompt += buildFinalInstructionsSection();

    console.log("プロンプト生成が完了しました");
    return prompt;
  } catch (error) {
    console.error('プロンプト生成中にエラーが発生しました:', error);

    // エラーが発生しても最低限のプロンプトを返す
    return `
# HTML/SCSS Code Generation from Design Comp

Analyze the uploaded image and generate HTML and SCSS code.
Accurately reproduce the layout, elements, text, and colors in the image.

## Important Instructions
- **❗❗MOST CRITICAL: FAITHFULLY REPRODUCE THE DESIGN COMP❗❗** - match exact layout, spacing, sizing, and visual details
- **Compare your output with the provided image before submitting** - make adjustments to match design details precisely
- ONLY code elements visible in the image - no assumed or extra elements
- Be faithful to the design - accurate colors, spacing, and layout
- Use FLOCSS methodology instead of BEM
- **❗ALWAYS USE CSS GRID LAYOUT❗** - **NEVER** use Flexbox unless absolutely impossible
- No SCSS nesting - write flat SCSS structure
- **❗❗ALWAYS PUT MEDIA QUERIES INSIDE SELECTORS - AND THEY ARE THE *ONLY* NESTING ALLOWED❗❗**

## ❌ FORBIDDEN: SCSS Nesting - Critical Warning
- **❌❌❌ ABSOLUTELY NO NESTING IN SCSS USING & SYMBOL! ❌❌❌**
- **❌ NEVER use &__element notation**
- **❌ NEVER use &:hover or other nested pseudo-selectors**
- **✅ ONLY MEDIA QUERIES MAY BE NESTED** inside selectors like this:
\`\`\`scss
// CORRECT - FLAT STRUCTURE WITH MEDIA QUERIES INSIDE
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr;

  @include mq(md) {
    grid-template-columns: 1fr 1fr;
  }
}
\`\`\`

## ❌ NEVER DO THIS:
\`\`\`scss
// WRONG - NEVER USE THIS NESTED STRUCTURE
.p-hoge {
  background-color: #e9f5f9;

  &__title {  // WRONG
    font-size: 2rem;
  }
}
\`\`\`

## ✅ ALWAYS DO THIS:
\`\`\`scss
// CORRECT - ALWAYS USE THIS FLAT STRUCTURE
.p-hoge {
  background-color: #e9f5f9;
}

.p-hoge__title {  // CORRECT
  font-size: 2rem;
}
\`\`\`

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
// SCSS code here (flat structure, except for media queries which should be nested)
\`\`\`
`;
  }
};

export { generatePrompt };
