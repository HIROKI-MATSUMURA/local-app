/**
 * プロンプト構築モジュール
 * 解析データからAIプロンプトを構築する機能を提供
 */

/**
 * HTMLとCSSのプロンプトを構築
 * @param {Object} analysisResult - 解析結果
 * @returns {Object} 構築されたプロンプト
 */
function buildImplementationPrompt(analysisResult) {
  try {
    if (!analysisResult) {
      return {
        html: '',
        css: '',
        structure: ''
      };
    }

    // 基本的なページ情報
    const pageContext = analysisResult.pageContext || {};

    // レイアウト情報
    const layoutInfo = analysisResult.layout || {};

    // カラー情報
    const colorInfo = analysisResult.colors || {};
    const hasPalette = colorInfo.palette && colorInfo.palette.length > 0;

    // コンポーネント情報
    const componentsInfo = analysisResult.components || {};

    // テキスト情報
    const textInfo = analysisResult.text || {};

    // 構造プロンプトの構築
    const structurePrompt = buildStructurePrompt(analysisResult);

    // HTMLプロンプトの構築
    const htmlPrompt = buildHTMLPrompt(analysisResult, structurePrompt);

    // CSSプロンプトの構築
    const cssPrompt = buildCSSPrompt(analysisResult);

    return {
      html: htmlPrompt,
      css: cssPrompt,
      structure: structurePrompt
    };
  } catch (error) {
    console.error('プロンプト構築中にエラーが発生しました:', error);
    return {
      html: '',
      css: '',
      structure: ''
    };
  }
}

/**
 * 構造プロンプトを構築
 * @param {Object} analysisResult - 解析結果
 * @returns {string} 構造プロンプト
 */
function buildStructurePrompt(analysisResult) {
  const pageContext = analysisResult.pageContext || {};
  const layoutInfo = analysisResult.layout || {};
  const components = analysisResult.components || {};

  // ページタイプの説明
  let prompt = `# Page Structure\n\n`;

  if (pageContext.summary) {
    prompt += `${pageContext.summary}\n\n`;
  } else {
    prompt += `This page is a ${pageContext.pageType || 'general'} web page.\n\n`;
  }

  // レイアウト構造の説明
  prompt += `## Layout\n\n`;

  if (layoutInfo.layoutType) {
    prompt += `The overall layout type is "${getLayoutTypeName(layoutInfo.layoutType)}".`;

    if (layoutInfo.gridSystem) {
      prompt += ` It uses a ${layoutInfo.gridSystem.columns || 12}-column grid system.`;
    }

    prompt += `\n\n`;
  }

  // セクションの説明
  if (layoutInfo.sections && layoutInfo.sections.length > 0) {
    prompt += `## Section Structure\n\n`;
    prompt += `The page consists of the following sections:\n\n`;

    layoutInfo.sections.forEach((section, index) => {
      prompt += `${index + 1}. ${getSectionTypeName(section.type)} Section\n`;
    });

    prompt += `\n`;
  }

  // 主要コンポーネントの説明
  if (components.components && components.components.length > 0) {
    prompt += `## Main UI Elements\n\n`;

    components.components.forEach(component => {
      prompt += `- ${getComponentTypeName(component.type)}`;

      if (component.count) {
        prompt += ` (${component.count})`;
      }

      if (component.confidence) {
        const confidenceText = component.confidence > 0.7 ? 'high confidence' : 'medium confidence';
        prompt += ` [${confidenceText}]`;
      }

      prompt += `\n`;
    });

    prompt += `\n`;
  }

  // レスポンシブ対応の説明
  const responsive = analysisResult.responsive || {};
  if (responsive.hasBothLayouts) {
    prompt += `## Responsive Design\n\n`;
    prompt += `This design includes both PC and mobile layouts.`;

    if (responsive.responsiveStrategy) {
      prompt += ` The responsive strategy is "${getResponsiveStrategyName(responsive.responsiveStrategy)}".`;
    }

    prompt += `\n\n`;
  }

  return prompt;
}

/**
 * HTMLプロンプトを構築
 * @param {Object} analysisResult - 解析結果
 * @param {string} structurePrompt - 構造プロンプト
 * @returns {string} HTMLプロンプト
 */
function buildHTMLPrompt(analysisResult, structurePrompt) {
  const pageContext = analysisResult.pageContext || {};
  const components = analysisResult.components || {};
  const textInfo = analysisResult.text || {};

  // ベースとなる構造情報を含める
  let prompt = `# HTML Implementation Instructions\n\n`;
  prompt += structurePrompt;

  // テキストコンテンツの指示
  if (textInfo.mainHeadings && textInfo.mainHeadings.length > 0) {
    prompt += `## Text Content\n\n`;

    if (textInfo.mainHeadings.length > 0) {
      prompt += `### Main Headings\n\n`;
      textInfo.mainHeadings.slice(0, 3).forEach(heading => {
        prompt += `- ${heading.text}\n`;
      });
      prompt += `\n`;
    }

    if (textInfo.subHeadings && textInfo.subHeadings.length > 0) {
      prompt += `### Sub Headings\n\n`;
      textInfo.subHeadings.slice(0, 5).forEach(heading => {
        prompt += `- ${heading.text}\n`;
      });
      prompt += `\n`;
    }
  }

  // 特定のコンポーネントに関する指示
  prompt += `## Component Implementation\n\n`;

  // ヒーローセクション
  if (components.hasHero) {
    prompt += `### Hero Section\n\n`;
    prompt += `Implement a hero section with a large banner image and title.`;

    if (components.hasHero.hasHeading) {
      prompt += ` Display text overlaid on the image.`;
    }

    prompt += `\n\n`;
  }

  // ナビゲーション
  if (components.hasNavbar) {
    prompt += `### Navigation Bar\n\n`;
    prompt += `Implement a navigation bar with ${components.hasNavbar.itemCount || 4} items.`;

    if (pageContext.pageType) {
      prompt += ` Since this is a ${pageContext.pageType} site, set appropriate navigation items.`;
    }

    prompt += `\n\n`;
  }

  // カード
  if (components.hasCards && components.hasCards.length > 0) {
    prompt += `### Card Components\n\n`;
    prompt += `Implement a card group containing ${components.hasCards.length} cards. Each card should include an image and text.`;
    prompt += `\n\n`;
  }

  // コンタクトフォーム
  if (components.hasContactForm) {
    prompt += `### Contact Form\n\n`;
    prompt += `Implement a contact form with name, email, and message fields.`;

    if (components.hasContactForm.hasButton) {
      prompt += ` Include a submit button.`;
    }

    prompt += `\n\n`;
  }

  // フッター
  if (components.hasFooter) {
    prompt += `### Footer\n\n`;
    prompt += `Implement a footer with site information, links, and copyright notice.`;
    prompt += `\n\n`;
  }

  // 実装上の注意点
  prompt += `## Implementation Notes\n\n`;
  prompt += `- Use semantic HTML (appropriate HTML5 tags)\n`;
  prompt += `- Implement with accessibility in mind\n`;
  prompt += `- Include viewport meta tag for mobile compatibility\n`;
  prompt += `- Follow BEM or a simple naming convention for class names\n`;

  return prompt;
}

/**
 * CSSプロンプトを構築
 * @param {Object} analysisResult - 解析結果
 * @returns {string} CSSプロンプト
 */
function buildCSSPrompt(analysisResult) {
  const colors = analysisResult.colors || {};
  const layoutInfo = analysisResult.layout || {};
  const responsive = analysisResult.responsive || {};

  let prompt = `# CSS Implementation Instructions\n\n`;

  // カラーパレット
  prompt += `## Color Palette\n\n`;

  if (colors.primary || colors.secondary || colors.accent) {
    prompt += `Use the following color palette:\n\n`;

    if (colors.primary) {
      prompt += `- Primary Color: ${colors.primary.hex}\n`;
    }

    if (colors.secondary) {
      prompt += `- Secondary Color: ${colors.secondary.hex}\n`;
    }

    if (colors.accent) {
      prompt += `- Accent Color: ${colors.accent.hex}\n`;
    }

    if (colors.background) {
      prompt += `- Background Color: ${colors.background.hex}\n`;
    }

    if (colors.text) {
      prompt += `- Text Color: ${colors.text.hex}\n`;
    }

    prompt += `\n`;
  } else if (colors.palette && colors.palette.length > 0) {
    prompt += `Use the following color palette:\n\n`;

    colors.palette.forEach((color, index) => {
      prompt += `- Color ${index + 1}: ${color.hex} (${color.role || 'general'})\n`;
    });

    prompt += `\n`;
  } else {
    prompt += `Select an appropriate color palette.\n\n`;
  }

  // レイアウト指示
  prompt += `## Layout\n\n`;

  if (layoutInfo.layoutType) {
    prompt += `The overall layout type is "${getLayoutTypeName(layoutInfo.layoutType)}".`;

    if (layoutInfo.gridSystem) {
      const columns = layoutInfo.gridSystem.columns || 12;
      prompt += ` Implement a ${columns}-column grid system.`;

      if (layoutInfo.gridSystem.gutter) {
        prompt += ` Set gutter width to ${layoutInfo.gridSystem.gutter}px.`;
      }
    }

    prompt += `\n\n`;
  }

  // レスポンシブ指示
  prompt += `## Responsive Design\n\n`;

  if (responsive.hasBothLayouts) {
    prompt += `Implement responsive design for both PC and mobile.`;

    if (responsive.responsiveStrategy) {
      prompt += ` Use "${getResponsiveStrategyName(responsive.responsiveStrategy)}" strategy.`;
    }

    if (responsive.columnChanges && responsive.columnChanges.length > 0) {
      prompt += ` On smaller screens, change layout to single column.`;
    }

    prompt += `\n\n`;
  } else {
    prompt += `Implement responsive design using the following breakpoints:\n\n`;
    prompt += `- Mobile: 576px and below\n`;
    prompt += `- Tablet: 768px and below\n`;
    prompt += `- Desktop: 992px and above\n\n`;
  }

  // スタイル指示
  prompt += `## Style Instructions\n\n`;

  // 影やボーダーなど
  if (layoutInfo.structureType === 'card_based') {
    prompt += `- Apply light shadow (box-shadow) to cards\n`;
  }

  // ボタンスタイル
  prompt += `- Apply appropriate hover effects to buttons\n`;

  // コントラスト
  if (colors.contrastRatios && colors.contrastRatios.backgroundText) {
    const contrast = parseFloat(colors.contrastRatios.backgroundText);
    if (contrast < 4.5) {
      prompt += `- Adjust contrast between background and text colors to improve readability\n`;
    }
  }

  prompt += `- Use relative units (rem) for font sizes\n`;
  prompt += `- Maintain consistent spacing and vertical rhythm\n`;

  // CSS手法
  prompt += `\n## CSS Implementation Techniques\n\n`;
  prompt += `- Code CSS in a simple and maintainable way\n`;
  prompt += `- Use variables (custom properties) to manage colors and sizes\n`;
  prompt += `- Avoid deep selectors\n`;
  prompt += `- Use media queries for responsive design\n`;

  return prompt;
}

/**
 * レイアウトタイプの英語名を取得
 * @param {string} layoutType - レイアウトタイプ
 * @returns {string} 英語名
 */
function getLayoutTypeName(layoutType) {
  const names = {
    'grid': 'Grid Layout',
    'cards': 'Card-based Layout',
    'gallery': 'Gallery Layout',
    'sidebar': 'Sidebar Layout',
    'single': 'Single Column',
    'standard': 'Standard Layout',
    'unknown': 'Unknown'
  };

  return names[layoutType] || 'Standard Layout';
}

/**
 * セクションタイプの英語名を取得
 * @param {string} sectionType - セクションタイプ
 * @returns {string} 英語名
 */
function getSectionTypeName(sectionType) {
  const names = {
    'header': 'Header',
    'hero': 'Hero',
    'footer': 'Footer',
    'contact': 'Contact',
    'feature': 'Feature',
    'about': 'About',
    'blog': 'Blog',
    'gallery': 'Gallery',
    'content': 'Content'
  };

  return names[sectionType] || 'Content';
}

/**
 * コンポーネントタイプの英語名を取得
 * @param {string} componentType - コンポーネントタイプ
 * @returns {string} 英語名
 */
function getComponentTypeName(componentType) {
  const names = {
    'hero': 'Hero Section',
    'navbar': 'Navigation Bar',
    'footer': 'Footer',
    'card_group': 'Card Group',
    'card': 'Card',
    'feature_list': 'Feature List',
    'contact_form': 'Contact Form',
    'button': 'Button',
    'image': 'Image'
  };

  return names[componentType] || componentType;
}

/**
 * レスポンシブ戦略の英語名を取得
 * @param {string} strategy - レスポンシブ戦略
 * @returns {string} 英語名
 */
function getResponsiveStrategyName(strategy) {
  const names = {
    'column_to_stack': 'Column to Stack Conversion',
    'full_stack': 'Full Stack Layout',
    'responsive_hiding': 'Element Display/Hide Toggle',
    'grid_to_fluid': 'Grid to Fluid Layout Conversion',
    'fluid': 'Fluid Layout'
  };

  return names[strategy] || 'Standard Responsive Approach';
}

/**
 * AIへのプロンプトを構築
 * @param {Object} analysisResult - 解析結果
 * @param {string} targetFormat - 対象フォーマット（html, css, structure）
 * @returns {string} AIプロンプト
 */
function buildAIPrompt(analysisResult, targetFormat = 'all') {
  try {
    const prompts = buildImplementationPrompt(analysisResult);

    if (targetFormat === 'all') {
      return `${prompts.structure}\n\n${prompts.html}\n\n${prompts.css}`;
    }

    switch (targetFormat) {
      case 'html':
        return prompts.html;
      case 'css':
        return prompts.css;
      case 'structure':
        return prompts.structure;
      default:
        return `${prompts.structure}\n\n${prompts.html}\n\n${prompts.css}`;
    }
  } catch (error) {
    console.error('AIプロンプト構築中にエラーが発生しました:', error);
    return '';
  }
}

/**
 * レスポンシブ設定からプロンプト用のセクションを構築する
 * @param {Object|string} responsiveSettings - レスポンシブ設定
 * @returns {string} レスポンシブ設定のプロンプトセクション
 */
function buildResponsiveSettingsSection(responsiveSettings) {
  if (!responsiveSettings) {
    return '';
  }

  try {
    let responsiveSettingsContent = '';

    // レスポンシブモードの取得
    const respMode = responsiveSettings.responsiveMode || 'sp';
    responsiveSettingsContent += `- Responsive Mode: ${respMode === 'sp' ? 'Mobile-first' : 'Desktop-first'}\n`;

    // ブレークポイント情報の取得
    if (responsiveSettings.breakpoints && Array.isArray(responsiveSettings.breakpoints)) {
      const activeBreakpoints = responsiveSettings.breakpoints
        .filter(bp => bp.active)
        .sort((a, b) => a.value - b.value);

      if (activeBreakpoints.length > 0) {
        responsiveSettingsContent += '- Breakpoints:\n';
        activeBreakpoints.forEach(bp => {
          responsiveSettingsContent += `  * ${bp.name}: ${bp.value}px\n`;
        });
      }
    }

    // メディアクエリの使用例を追加
    responsiveSettingsContent += `
- Media Query Usage:
\`\`\`scss
// ${respMode === 'sp' ? 'Mobile-first approach' : 'Desktop-first approach'}
.selector {
  ${respMode === 'sp' ? '// Base style for mobile' : '// Base style for desktop'}

  @include mq(md) {
    ${respMode === 'sp' ? '// Style for desktop' : '// Style for mobile'}
  }
}
\`\`\``;

    return `### Responsive Settings:
${responsiveSettingsContent}

`;
  } catch (error) {
    // エラーが発生した場合は単純に文字列として扱う
    console.error('レスポンシブ設定の処理中にエラーが発生しました:', error);
    return `### Responsive Settings:
\`\`\`
${typeof responsiveSettings === 'string'
        ? responsiveSettings
        : JSON.stringify(responsiveSettings, null, 2)}
\`\`\`

`;
  }
}

/**
 * コアプロンプト部分を構築する関数
 * @param {string} responsiveMode - レスポンシブモード
 * @param {Array} aiBreakpoints - AIブレークポイント
 * @returns {string} コアプロンプト
 */
function buildCorePrompt(responsiveMode, aiBreakpoints) {
  return `
# HTML/SCSS Code Generation from Design Comp

## Basic Information
- Output Type: ${responsiveMode === "both" ? "Responsive Design (PC/SP)" : `${responsiveMode === "pc" ? "PC (Desktop)" : "SP (Mobile)"}`}
${aiBreakpoints && aiBreakpoints.length > 0 ? `- Breakpoints: ${aiBreakpoints.map(bp => `${bp.width}px`).join(', ')}` : ''}
`;
}

/**
 * ガイドラインセクションを構築する関数
 * @param {string} responsiveMode - レスポンシブモード
 * @returns {string} ガイドラインセクション
 */
function buildGuidelinesSection(responsiveMode) {
  if (responsiveMode === "both") {
    return buildResponsiveGuidelinesSection();
  }

  return `
## Design Guidelines

### Design Approach
Implement this design with a focus on clean, modern aesthetics.

### Style System
- Use a consistent typography system with clear hierarchy
- Maintain proper spacing between elements
- Ensure interactive elements have appropriate hover states
- Use high-quality images and icons

### Technical Implementation
- Write clean, semantic HTML5
- Use BEM methodology for class names
- Structure your SCSS with reusable components
- Ensure proper organization of your styles
`;
}

/**
 * レスポンシブデザインガイドラインセクションを構築する関数
 * @returns {string} レスポンシブガイドラインセクション
 */
function buildResponsiveGuidelinesSection() {
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
}

/**
 * 最終指示セクションを構築する関数
 * @returns {string} 最終指示セクション
 */
function buildFinalInstructionsSection() {
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
}

/**
 * セマンティックタグを生成する関数
 * @param {Object} data - 解析データ
 * @returns {string} セマンティックタグのリスト
 */
function generateSemanticTags(data) {
  if (!data) {
    console.warn('Semantic tag generation: No data available');
    return '<header>\n  <h1>Title</h1>\n</header>\n<main>\n  <section>\n    <h2>Section</h2>\n  </section>\n</main>';
  }

  try {
    const safeGetProperty = (obj, path, defaultValue = null) => {
      if (!obj) return defaultValue;
      return path.split('.').reduce((prev, curr) =>
        prev && prev[curr] !== undefined ? prev[curr] : defaultValue, obj);
    };

    // レイアウト情報の取得
    const layout = safeGetProperty(data, 'layout', {});
    const layoutType = safeGetProperty(layout, 'type', 'standard');

    // セクション情報の取得
    const sections = safeGetProperty(data, 'sections', []);
    // テキスト情報の取得
    const textData = safeGetProperty(data, 'text', {});
    const textBlocks = safeGetProperty(textData, 'blocks', []);
    const textHierarchy = safeGetProperty(textData, 'hierarchy', []);

    // 要素情報の取得
    const elements = safeGetProperty(data, 'elements.elements', []);

    let htmlStructure = '';

    // ヘッダー部分を生成
    htmlStructure += '<header class="header">\n';
    htmlStructure += '  <div class="header__inner">\n';
    htmlStructure += '    <h1 class="header__logo">Logo</h1>\n';

    // ナビゲーションがあれば追加
    const hasNav = elements.some(el => el.type === 'navigation' || el.type === 'nav');
    if (hasNav) {
      htmlStructure += '    <nav class="header__nav">\n';
      htmlStructure += '      <ul class="nav-list">\n';
      htmlStructure += '        <li class="nav-list__item"><a href="#">Link 1</a></li>\n';
      htmlStructure += '        <li class="nav-list__item"><a href="#">Link 2</a></li>\n';
      htmlStructure += '      </ul>\n';
      htmlStructure += '    </nav>\n';
    }

    htmlStructure += '  </div>\n';
    htmlStructure += '</header>\n\n';

    // メイン部分を生成
    htmlStructure += '<main class="main">\n';

    // セクションがあれば追加
    if (Array.isArray(sections) && sections.length > 0) {
      sections.forEach((section, index) => {
        const sectionType = safeGetProperty(section, 'type', 'content');
        const sectionClass = sectionType === 'hero' ? 'mv' : sectionType.replace('-', '_');

        htmlStructure += `  <section class="${sectionClass}">\n`;
        htmlStructure += `    <div class="${sectionClass}__inner">\n`;

        // セクションのヘッダー
        const headingLevel = index === 0 ? 'h2' : 'h2';
        htmlStructure += `      <${headingLevel} class="${sectionClass}__title">Section Title</${headingLevel}>\n`;

        // セクションの内容
        if (sectionType === 'card-grid' || sectionType === 'features') {
          htmlStructure += `      <div class="${sectionClass}__items">\n`;
          for (let i = 0; i < 3; i++) {
            htmlStructure += `        <div class="${sectionClass}__item">\n`;
            htmlStructure += `          <h3 class="${sectionClass}__item-title">Item Title</h3>\n`;
            htmlStructure += `          <p class="${sectionClass}__item-text">Sample text content</p>\n`;
            htmlStructure += '        </div>\n';
          }
          htmlStructure += '      </div>\n';
        } else {
          htmlStructure += `      <div class="${sectionClass}__content">\n`;
          htmlStructure += '        <p>Content text goes here</p>\n';
          htmlStructure += '      </div>\n';
        }

        htmlStructure += '    </div>\n';
        htmlStructure += '  </section>\n\n';
      });
    } else {
      // セクションがない場合のデフォルト
      htmlStructure += '  <section class="section">\n';
      htmlStructure += '    <div class="section__inner">\n';
      htmlStructure += '      <h2 class="section__title">Section Title</h2>\n';
      htmlStructure += '      <div class="section__content">\n';
      htmlStructure += '        <p>Text content goes here</p>\n';
      htmlStructure += '      </div>\n';
      htmlStructure += '    </div>\n';
      htmlStructure += '  </section>\n\n';
    }

    htmlStructure += '</main>\n\n';

    // フッター部分を生成
    htmlStructure += '<footer class="footer">\n';
    htmlStructure += '  <div class="footer__inner">\n';
    htmlStructure += '    <p class="footer__copyright">© 2023 Company Name</p>\n';
    htmlStructure += '  </div>\n';
    htmlStructure += '</footer>';

    return htmlStructure;
  } catch (error) {
    console.error('Semantic tag generation error:', error);
    return '<header>\n  <h1>Error</h1>\n</header>\n<main>\n  <section>\n    <h2>An error occurred while processing data</h2>\n  </section>\n</main>';
  }
}

// モジュールのエクスポート
export {
  buildImplementationPrompt,
  buildStructurePrompt,
  buildHTMLPrompt,
  buildCSSPrompt,
  buildAIPrompt,
  buildResponsiveSettingsSection,
  buildCorePrompt,
  buildGuidelinesSection,
  buildResponsiveGuidelinesSection,
  buildFinalInstructionsSection,
  generateSemanticTags
};
