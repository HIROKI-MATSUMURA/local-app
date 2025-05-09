import { extractTextFromImage, extractColorsFromImage, analyzeImageSections, detectMainSections, detectCardElements, detectFeatureElements } from "./imageAnalyzer";

// 共通のエラーハンドリング関数
const handleAnalysisError = (operation, error, defaultValue) => {
  // エラーメッセージをより明確に表示するが、関数のシグネチャと動作は同じ
  console.error(`${operation}エラー:`, error.message || error);
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
    // ローカルストレージの問題を詳細に記録するが、元の動作は維持
    console.error('ローカルストレージからの設定取得エラー:', error.message || error);
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

  // 各分析処理は同じだが、同時に開始してパフォーマンスを向上
  const colorPromise = extractColorsFromImage(imageBase64)
    .catch(error => handleAnalysisError(`${imageType}画像の色抽出`, error, []));

  const textPromise = extractTextFromImage(imageBase64)
    .catch(error => handleAnalysisError(`${imageType}画像のテキスト抽出`, error, ''));

  const sectionsPromise = analyzeImageSections(imageBase64)
    .catch(error => handleAnalysisError(`${imageType}画像のセクション分析`, error, []));

  const elementsPromise = detectFeatureElements(imageBase64)
    .catch(error => handleAnalysisError(`${imageType}画像の要素検出`, error, { elements: [] }));

  // すべてのPromiseを同時に解決
  const [colors, text, sections, elements] = await Promise.all([
    colorPromise, textPromise, sectionsPromise, elementsPromise
  ]);

  // 元のログを維持
  console.log(`${imageType}画像から色を抽出しました:`, colors.length, "色");
  console.log(`${imageType}画像からテキストを抽出しました`);
  console.log(`${imageType}画像のセクション分析が完了しました:`, sections.length, "セクション");
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

  // 要素情報 - オプショナルチェイニングを使用してnullチェックを改善
  const pcElements = pcAnalysis.elements?.elements || [];
  const spElements = spAnalysis.elements?.elements || [];

  if (pcElements.length > 0 || spElements.length > 0) {
    section += `
### Detected Main Elements:
${pcElements.length > 0 ? `- PC Image: ${JSON.stringify(pcAnalysis.elements.elements)}` : ""}
${spElements.length > 0 ? `- SP Image: ${JSON.stringify(spAnalysis.elements.elements)}` : ""}

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
      // 重複を除去してマージ
      const allColors = [...pcColors, ...spColors];
      const uniqueColors = [...new Set(allColors)]; // Setを使用して重複を効率的に除去

      section += `- Additional colors from the image:
  ${uniqueColors.join(', ')}
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
- **Optimize image implementation**:
  - Always include width and height attributes on img tags to prevent layout shifts
  - Implement proper lazy loading: \`loading="lazy"\` for below-fold images
  - Use appropriate image format based on content type (JPEG for photos, PNG for graphics with transparency, WebP where possible)
  - For background images, use media queries to adjust sizing at different breakpoints

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

### Animation & Transition Guidelines:
- **Keep animations subtle and purposeful**:
  - Use transitions for hover/focus states (always use 0.3s duration)
  - Prefer transform and opacity changes (over width, height, or position)
  - Consider accessibility in your animations
  \`\`\`
  // Example of appropriate animation:
  .c-button {
    transition: transform 0.3s ease, opacity 0.3s ease;
  }

  .c-button:hover {  // CORRECT: Flat selector for hover state
    transform: translateY(-2px);
    opacity: 0.9;
  }
  \`\`\`
- **Performance considerations**:
  - Only animate transform and opacity properties when possible
  - Use will-change only when necessary and remove it after animation
  - Avoid animating large elements or multiple elements simultaneously

### Spacing & Layout Guidelines:
- **Use a consistent spacing system**:
  - Define spacing with variables or a clear system (e.g., 8px increments)
  - **Use margin-top consistently for all vertical spacing**
  - **Never use margin-bottom for spacing**
  - Use gap property with Grid/Flexbox layouts when possible
- **Component spacing hierarchy**:
  - Parent component (p- prefix) should control external spacing (margins)
  - Child elements should control internal spacing (padding)
  - Never rely on margin collapsing for layout
- **Avoid magic numbers**:
  - Don't use arbitrary values like margin-top: 37px
  - Use consistent spacing values throughout the layout
- **Mobile spacing considerations**:
  - Reduce spacing proportionally on mobile views (generally 50-70% of desktop values)
  - Control spacing changes in media queries

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

## COMMON MISTAKES TO AVOID - REAL EXAMPLES

### ❌ SCSS Common Mistakes:
\`\`\`scss
    // ❌ WRONG: Nested selectors
    .p-hoge {
    background: #fff;

  &__title {  // NEVER DO THIS
      font-size: 24px;
    }

  &__content {  // NEVER DO THIS
      margin-top: 16px;
    }
  }

// ❌ WRONG: Nested hover states
.p-hoge__link {
  color: blue;

  &:hover {  // NEVER DO THIS
    color: darkblue;
  }
}

// ❌ WRONG: Improper media query placement
.p-hoge__title {
  font-size: 24px;
}

@include mq(md) {  // NEVER PLACE MEDIA QUERIES OUTSIDE SELECTORS
  .p-hoge__title {
    font-size: 18px;
  }
}

// ❌ WRONG: Mixed prefixes on single element
.c-button.p-hoge__button {  // NEVER MIX PREFIXES
  display: inline-block;
}
\`\`\`

### ✅ SCSS Correct Implementations:
\`\`\`scss
  // ✅ CORRECT: Flat structure
  .p-hoge {
  background: #fff;
}

.p-hoge__title {
  font-size: 24px;

  @include mq(md) {  // CORRECT: Media query inside selector
    font-size: 18px;
  }
}

.p-hoge__content {
  margin-top: 16px;
}

// ✅ CORRECT: Flat hover states
.p-hoge__link {
  color: blue;
}

.p-hoge__link:hover {  // CORRECT: Flat selector for hover
  color: darkblue;
}

// ✅ CORRECT: Button implementation
.p-hoge__button {  // Container for positioning
  margin-top: 24px;
  text-align: center;
}

// Button itself is a separate element with c- prefix
// and inside a container with p- prefix in HTML
\`\`\`
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

## SELF-VALIDATION CHECKLIST
Before submitting your code, verify each of these points:

### HTML Validation:
- [ ] No nested components (divs inside divs unnecessarily)
- [ ] All images have proper alt text in Japanese
- [ ] All images have width and height attributes
- [ ] Heading hierarchy is proper (starts with h2, not h1)
- [ ] No mixing of prefixes on same elements (e.g., no \`class="c-button p-card__button"\`)
- [ ] No unnecessary wrapper elements
- [ ] Button implementation follows the correct pattern
- [ ] All interactive elements are accessible (focus states, proper roles)

### SCSS Validation:
- [ ] ZERO nesting except for media queries
- [ ] NO & symbol anywhere in the code
- [ ] All pseudo-classes (hover, focus, active) are written as flat selectors
- [ ] All media queries are INSIDE selectors
- [ ] Consistent spacing system used
- [ ] Vertical spacing uses margin-top ONLY (never margin-bottom)
- [ ] All selectors use appropriate prefixes (p-, l-, c-, u-)
- [ ] Grid layout is used instead of flexbox where possible
- [ ] No fixed widths used unnecessarily
- [ ] Height properties avoided where possible
- [ ] All transitions are set to 0.3s duration

### Final Quality Check Process:
1. **Compare to original design**:
   - Visually check if your code matches the design comp
   - Check spacing, alignment, and proportions
   - Verify color accuracy

2. **Code structure review**:
   - Scan all SCSS for any & symbols (instant rejection if found)
   - Check that all class names follow FLOCSS naming conventions
   - Verify buttons follow the exact pattern specified

3. **Refactor problematic code**:
   - Replace any instances of mixed prefixes with separate elements
   - Fix any nested SCSS that isn't a media query
   - Ensure all component hierarchies are correct

4. **Specific pattern verification**:
   - Buttons: \`<div class="p-section__button"><a href="#" class="c-button">Text</a></div>\`
   - Cards: Parent with p- prefix, content with appropriate element names
   - Images: Proper attributes and responsive treatment

After going through this checklist, ensure your HTML and SCSS accurately reproduce the design comp image and follow all guidelines. If ANY issues are found, fix them before submitting.
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

    // プロンプトの各セクションを構築（処理は同じだが、効率的に文字列を構築）
    const promptParts = [
      buildCorePrompt(responsiveMode, aiBreakpoints),
      buildAnalysisSection(pcAnalysis, spAnalysis),
      buildSettingsSection(settings, pcAnalysis.colors, spAnalysis.colors),
      buildGuidelinesSection(responsiveMode),
      buildResponsiveGuidelinesSection(),
      buildFinalInstructionsSection()
    ];

    // 最後に一度だけ結合して効率化
    const prompt = promptParts.join('');

    console.log("プロンプト生成が完了しました");
    return prompt;
  } catch (error) {
    console.error('プロンプト生成中にエラーが発生しました:', error.message || error);

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
