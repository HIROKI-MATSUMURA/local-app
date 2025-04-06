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

// 共通のプロンプト指示を生成する関数
const getCommonPromptInstructions = (responsiveMode, aiBreakpoints, settings) => {
  const hasCustomCSS = settings && settings.cssVariables && settings.cssVariables.trim() !== '';
  const hasResponsiveSettings = settings && settings.responsiveSettings && settings.responsiveSettings.trim() !== '';

  return `
### Output Format Guidelines:
- Provide the HTML, CSS, AND JAVASCRIPT without any explanation
- Format your response with Markdown code blocks:
  \`\`\`html
  <!-- Your HTML code here -->
  \`\`\`

  \`\`\`scss
  /* Your SCSS code here */
  \`\`\`

  \`\`\`javascript
  // Your JavaScript code here
  \`\`\`
- Do not include any explanations before or after the code blocks
- Respond with ONLY these three code blocks

## Responsive Guidelines:
${responsiveMode === "sp" ?
      `- Follow the **Mobile-first approach**
- Base styles should be for mobile devices
- Use @include mq(md) media queries to enhance layout for larger screens
- Example:
\`\`\`scss
.p-section__content {
  display: grid;
  grid-template-columns: 1fr; // Mobile layout (default)
  gap: 1rem;

  @include mq(md) {
    grid-template-columns: 1fr 1fr; // Desktop layout
    gap: 2rem;
  }
}
\`\`\`` :
      `- Follow the **Desktop-first approach**
- Base styles should be for desktop devices
- Use @include mq(md) media queries to adjust layout for smaller screens
- Example:
\`\`\`scss
.p-section__content {
  display: grid;
  grid-template-columns: 1fr 1fr; // Desktop layout (default)
  gap: 2rem;

  @include mq(md) {
    grid-template-columns: 1fr; // Mobile layout
    gap: 1rem;
  }
}
\`\`\``}

## Breakpoints:
${aiBreakpoints && aiBreakpoints.length > 0 ?
      `Use ONLY these breakpoints in your media queries:
${aiBreakpoints
        .filter(bp => bp.aiActive)
        .map(bp => `- ${bp.name}: ${bp.value}px`)
        .join('\n')}

**CRITICAL REQUIREMENT - BREAKPOINT USAGE:**
- ONLY use the defined breakpoint names with @include mq() syntax
- NEVER use pixel values directly in media queries
- ALWAYS use the @include mq() format for ALL media queries

Media query syntax example:
\`\`\`scss
.p-header__content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: center;

  @include mq(md) {
    grid-template-columns: 1fr;
  }
}
\`\`\`` :
      `- Use standard breakpoints if needed:
  - Mobile: 375px
  - Tablet: 768px
  - Desktop: 1024px and above`}

## HTML Structure Requirements:
- Use semantic HTML elements (div, nav, ul, li, a)
- **Menu structure must use proper list elements:**
  \`\`\`html
  <!-- CORRECT structure for menus -->
  <ul class="p-header__menu">
    <li class="p-header__menu-item">
      <a href="#" class="p-header__menu-link">Menu Item</a>
    </li>
  </ul>

  <!-- WRONG structure - don't do this -->
  <ul class="p-header__menu">
    <a href="#" class="p-header__menu-link">Menu Item</a>
  </ul>
  \`\`\`

- **Button structure for hamburger:**
  \`\`\`html
  <button class="p-header__drawer-toggle" aria-label="メニューを開く">
    <span class="p-header__drawer-icon"></span>
  </button>
  \`\`\`

## CSS Specific Requirements:
- **❗ALWAYS USE CSS GRID LAYOUT❗** - **NEVER** use Flexbox unless absolutely impossible with Grid
- Use modern CSS features
- Do not use unnecessary vendor prefixes
- Keep the CSS clean and well-organized
- No pre-processors or external dependencies
- Optimize for performance and readability
- No CSS reset or normalize code

## Color Guidelines:
${hasCustomCSS ?
      `- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like $primary-color, etc.)
- Here is a recommended color palette based on the design:
  ${extractHexValuesFromVariables(settings.cssVariables).join(', ')}` :
      `- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like --primary-color, etc.)`}

## JavaScript Requirements:
- Include JavaScript for interactive elements like drawer menu
- Use vanilla JavaScript without any libraries or frameworks
- Implement smooth open/close transitions for the drawer menu
- Ensure the code is cross-browser compatible
- Add proper event handling for touch and click events
- Include proper accessibility features in your JavaScript

## Best Practices to Follow:
- Ensure all interactive elements are accessible
- Use semantic HTML elements appropriately
- Implement proper hover/focus states for interactive elements
- Ensure sufficient color contrast for text readability
- Size text appropriately for readability on all devices

## FINAL CRUCIAL INSTRUCTIONS ❗

1. **HTML Structure**:
   - Use semantic tags (but avoid header/main tags)
   - Follow FLOCSS convention for class names (p-header__element, c-component__element)
   - Avoid unnecessary nesting
   - **START HEADING TAGS FROM h2** - do not use h1 tags in components
   - **CORRECT MENU STRUCTURE**:
     \`\`\`html
     <ul class="p-header__menu">
       <li class="p-header__menu-item">
         <a href="#" class="p-header__menu-link">Link Text</a>
       </li>
     </ul>
     \`\`\`
   - **CORRECT BUTTON EXAMPLE**: \`<div class="p-header__button-wrapper"><a href="#" class="c-button">View more →</a></div>\`
   - **WRONG BUTTON EXAMPLE**: \`<div class="p-header__button-wrapper"><div class="c-button"><a href="#" class="c-button__link">View more →</a></div></div>\`

2. **CSS Structure**:
   - **❌ ABSOLUTELY NO NESTING WITH & OPERATOR**
   - **❌ NO &__element or &:hover NOTATION - ZERO TOLERANCE**
   - **✅ WRITE FLAT SELECTORS**: .p-header__title or .c-button__icon
   - **✅ ONLY NEST MEDIA QUERIES inside selectors**
   - **✅ PRIORITIZE GRID LAYOUT**
   - **DO NOT USE MULTIPLE DIFFERENT PREFIXES ON THE SAME ELEMENT** - Choose exactly one prefix type per element
   - **INCORRECT: \`<a class="c-button p-section__button">View more</a>\`**
   - **CORRECT: \`<a class="c-button">View more</a>\`** based on context
   - ${hasCustomCSS ?
      `**✅ USE HEX COLOR VALUES DIRECTLY** - do not use CSS variables` :
      `**✅ USE HEX COLOR VALUES DIRECTLY** - do not use CSS variables`}
   - **CHECK YOUR OUTPUT BEFORE SUBMITTING:** if you see any & symbols in your SCSS, rewrite it all with flat selectors
   - **THIS IS A ZERO TOLERANCE REQUIREMENT:** nested SCSS code will be rejected automatically

3. **MEDIA QUERY FORMAT (CRITICAL):**
   - **ALWAYS** use @include mq() format for ALL media queries
   - Place media queries INSIDE the selector:
   \`\`\`scss
   /* CORRECT */
   .p-drawer__panel {
     width: 100%;

     @include mq(md) {
       width: 50%;
     }
   }

   /* WRONG - DON'T DO THIS */
   .p-drawer__panel {
     width: 100%;
   }

   @include mq(md) {
     .p-drawer__panel {
       width: 50%;
     }
   }
   \`\`\`
   - **NEVER** use direct px values like @media (max-width: 768px)
   - For ${responsiveMode === "sp" ? 'mobile-first' : 'desktop-first'} approach, ${responsiveMode === "sp" ?
      'start with mobile styles as default, then use @include mq() for larger screens' :
      'start with desktop styles as default, then use @include mq() for smaller screens'}
   - ${responsiveMode === "sp" ?
      `**Mobile-first example:**
   \`\`\`scss
   // Mobile layout (default)
   .p-header__logo {
     width: 100px;
   }

   // Desktop layout (in media query)
   .p-header__logo {
     @include mq(md) {
       width: 180px;
     }
   }
   \`\`\`
   ` :
      `**Desktop-first example:**
   \`\`\`scss
   // Desktop layout (default)
   .p-header__logo {
     width: 180px;
   }

   // Mobile layout (in media query)
   .p-header__logo {
     @include mq(md) {
       width: 100px;
     }
   }
   \`\`\`
   `}

4. **JavaScript**:
   - Use vanilla JavaScript only
   - Ensure accessibility (keyboard operation, ARIA attributes)
   - Ensure cross-browser compatibility
   - **DRAWER MENU FUNCTIONALITY:**
     - Toggle drawer open/close with hamburger button
     - Close drawer with close button or overlay click
     - Add appropriate ARIA attributes
     - Implement smooth transitions
`;
};

/**
 * ヘッダー生成用のプロンプトを生成する関数
 * @param {Object} options - プロンプト生成オプション
 * @returns {string} 生成されたプロンプト
 */
export const generateHeaderPrompt = async (options) => {
  try {
    const {
      responsiveMode,
      aiBreakpoints,
      pcImageBase64,
      spImageBase64,
      drawerImageBase64,
      pcColors,
      spColors,
      drawerColors,
      pcImageText,
      spImageText,
      drawerImageText,
      drawerLayout,
      drawerDirection
    } = options;

    // 画像データの有無を確認
    const hasPcImage = pcImageBase64 && pcImageBase64.trim() !== '';
    const hasSpImage = spImageBase64 && spImageBase64.trim() !== '';
    const hasDrawerImage = drawerImageBase64 && drawerImageBase64.trim() !== '';

    // 画像から追加情報を抽出
    let extractedPcText = '';
    let extractedSpText = '';
    let extractedDrawerText = '';
    let pcSections = [];
    let spSections = [];
    let drawerSections = [];

    // PC画像から情報抽出
    if (hasPcImage && !pcImageText) {
      try {
        extractedPcText = await extractTextFromImage(pcImageBase64);
        console.log("PC画像からテキストを抽出しました");
      } catch (error) {
        console.error("PC画像のテキスト抽出エラー:", error);
      }

      try {
        pcSections = await analyzeImageSections(pcImageBase64);
        console.log("PC画像のセクション分析が完了しました");
      } catch (error) {
        console.error("PC画像のセクション分析エラー:", error);
      }
    }

    // SP画像から情報抽出
    if (hasSpImage && !spImageText) {
      try {
        extractedSpText = await extractTextFromImage(spImageBase64);
        console.log("SP画像からテキストを抽出しました");
      } catch (error) {
        console.error("SP画像のテキスト抽出エラー:", error);
      }

      try {
        spSections = await analyzeImageSections(spImageBase64);
        console.log("SP画像のセクション分析が完了しました");
      } catch (error) {
        console.error("SP画像のセクション分析エラー:", error);
      }
    }

    // ドロワー画像から情報抽出
    if (hasDrawerImage && !drawerImageText) {
      try {
        extractedDrawerText = await extractTextFromImage(drawerImageBase64);
        console.log("ドロワー画像からテキストを抽出しました");
      } catch (error) {
        console.error("ドロワー画像のテキスト抽出エラー:", error);
      }

      try {
        drawerSections = await analyzeImageSections(drawerImageBase64);
        console.log("ドロワー画像のセクション分析が完了しました");
      } catch (error) {
        console.error("ドロワー画像のセクション分析エラー:", error);
      }
    }

    // 画像の説明を追加
    let imageDescriptionPrompt = '';
    if (hasPcImage) {
      imageDescriptionPrompt += '- PCデザインの画像が提供されています\n';
      if (pcSections && pcSections.length > 0) {
        imageDescriptionPrompt += '  - ' + pcSections.length + '個のセクションが検出されました\n';
      }
    }

    if (hasSpImage) {
      imageDescriptionPrompt += '- SPデザインの画像が提供されています\n';
      if (spSections && spSections.length > 0) {
        imageDescriptionPrompt += '  - ' + spSections.length + '個のセクションが検出されました\n';
      }
    }

    if (hasDrawerImage) {
      imageDescriptionPrompt += '- ドロワーメニューの画像が提供されています\n';
      if (drawerSections && drawerSections.length > 0) {
        imageDescriptionPrompt += '  - ' + drawerSections.length + '個のセクションが検出されました\n';
      }
    }

    // カスタムブレークポイントの取得
    const customBreakpoints = aiBreakpoints
      ? aiBreakpoints
        .filter(bp => bp.aiActive)
        .map(bp => `${bp.name}: ${bp.value}px`)
        .join(', ')
      : '';

    // ローカルストレージから設定を取得
    const settings = getSettingsFromLocalStorage();

    // 画像テキストの抽出と前処理
    let textContentPrompt = '';
    if (pcImageText) {
      textContentPrompt += `PC Header Text Content: ${pcImageText}\n\n`;
    } else if (extractedPcText) {
      textContentPrompt += `PC Header Text Content (自動抽出): ${extractedPcText}\n\n`;
    }

    if (spImageText) {
      textContentPrompt += `SP Header Text Content: ${spImageText}\n\n`;
    } else if (extractedSpText) {
      textContentPrompt += `SP Header Text Content (自動抽出): ${extractedSpText}\n\n`;
    }

    if (drawerImageText) {
      textContentPrompt += `Drawer Menu Text Content: ${drawerImageText}\n\n`;
    } else if (extractedDrawerText) {
      textContentPrompt += `Drawer Menu Text Content (自動抽出): ${extractedDrawerText}\n\n`;
    }

    // 色情報の処理
    // 色の自動抽出がない場合のみ手動指定を使用
    let pcExtractedColors = [];
    let spExtractedColors = [];
    let drawerExtractedColors = [];

    // 画像から色を抽出（手動で指定された色がない場合）
    if (hasPcImage && (!pcColors || pcColors.length === 0)) {
      try {
        pcExtractedColors = await extractColorsFromImage(pcImageBase64);
        console.log("PC画像から色を抽出しました:", pcExtractedColors.length, "色");
      } catch (error) {
        console.error("PC画像の色抽出エラー:", error);
      }
    }

    if (hasSpImage && (!spColors || spColors.length === 0)) {
      try {
        spExtractedColors = await extractColorsFromImage(spImageBase64);
        console.log("SP画像から色を抽出しました:", spExtractedColors.length, "色");
      } catch (error) {
        console.error("SP画像の色抽出エラー:", error);
      }
    }

    if (hasDrawerImage && (!drawerColors || drawerColors.length === 0)) {
      try {
        drawerExtractedColors = await extractColorsFromImage(drawerImageBase64);
        console.log("ドロワー画像から色を抽出しました:", drawerExtractedColors.length, "色");
      } catch (error) {
        console.error("ドロワー画像の色抽出エラー:", error);
      }
    }

    // ローカルストレージにCSSの変数設定があればそれを優先する
    let colorGuidelines = '';
    let manualColors = [...pcColors, ...spColors, ...drawerColors].filter(color => color.name && color.value);
    let extractedColors = [...pcExtractedColors, ...spExtractedColors, ...drawerExtractedColors];

    // すべての色を結合（手動色 + 抽出色）
    const allColors = [...manualColors, ...extractedColors.map(color => ({ name: 'extracted', value: color }))];

    if (settings.cssVariables && settings.cssVariables.trim() !== '') {
      colorGuidelines = `
## Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like $primary-color, etc.)
- Here is a recommended color palette based on the design:
`;

      // 変数からHEX値を抽出
      const hexValues = extractHexValuesFromVariables(settings.cssVariables);

      // 抽出した色を追加
      if (hexValues.length > 0) {
        colorGuidelines += `  ${hexValues.join(', ')}
`;
      }

      // 画像から抽出した色も追加
      if (allColors.length > 0) {
        const uniqueColors = [...new Map(allColors.map(color => [color.value, color])).values()];
        colorGuidelines += `- Additional colors from the image:
  ${uniqueColors.map(color => color.value).join(', ')}
`;
      }

      colorGuidelines += `- Feel free to use variations of these colors where needed
`;
    } else if (allColors.length > 0) {
      const uniqueColors = [...new Map(allColors.map(color => [color.value, color])).values()];
      colorGuidelines = `
## Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like --primary-color, etc.)
- Here is a recommended color palette based on the design:
  ${uniqueColors.map(color => color.value).join(', ')}
`;
    }

    // ドロワー設定の情報
    const drawerConfig = `
## Drawer Menu Configuration:
- Drawer Layout: ${drawerLayout === 'both' ? 'Both SP/PC' : 'SP Only'}
- Drawer Direction: ${drawerDirection === 'right' ? 'From Right' :
        drawerDirection === 'left' ? 'From Left' :
          drawerDirection === 'top' ? 'From Top' :
            drawerDirection === 'bottom' ? 'From Bottom' :
              'Fade In'
      }
`;

    // サンプルコードを追加（FLOCSS規則に準拠した正しい実装例）
    const sampleCode = `
## Reference Implementation Example (FLOCSS Compliant)

This is a reference implementation that follows FLOCSS methodology and all requirements. Use this structure as a guide, but adapt it to match the design in the provided images.

### HTML Example:
\`\`\`html
<div class="p-header">
  <div class="p-header__container">
    <h1 class="p-header__logo">
      <a href="/" class="p-header__logo-link">
        <img src="/images/logo.svg" alt="CodeUps" class="p-header__logo-image">
      </a>
    </h1>

    <nav class="p-header__nav">
      <ul class="p-header__menu">
        <li class="p-header__menu-item">
          <a href="#" class="p-header__menu-link">キャンペーン</a>
        </li>
        <li class="p-header__menu-item">
          <a href="#" class="p-header__menu-link">私たちについて</a>
        </li>
        <li class="p-header__menu-item">
          <a href="#" class="p-header__menu-link">ダイビング情報</a>
        </li>
        <li class="p-header__menu-item">
          <a href="#" class="p-header__menu-link">ブログ</a>
        </li>
        <li class="p-header__menu-item">
          <a href="#" class="p-header__menu-link">お客様の声</a>
        </li>
        <li class="p-header__menu-item">
          <a href="#" class="p-header__menu-link">料金一覧</a>
        </li>
        <li class="p-header__menu-item">
          <a href="#" class="p-header__menu-link">よくある質問</a>
        </li>
        <li class="p-header__menu-item">
          <a href="#" class="p-header__menu-link">お問い合わせ</a>
        </li>
      </ul>
    </nav>

    <button class="p-header__drawer-button" aria-label="メニューを開く" aria-expanded="false" aria-controls="drawer-menu">
      <span class="p-header__drawer-line"></span>
      <span class="p-header__drawer-line"></span>
      <span class="p-header__drawer-line"></span>
    </button>
  </div>
</div>

<div class="p-drawer" id="drawer-menu" aria-hidden="true">
  <div class="p-drawer__overlay"></div>
  <div class="p-drawer__content">
    <button class="p-drawer__close" aria-label="メニューを閉じる">
      <span class="p-drawer__close-line"></span>
      <span class="p-drawer__close-line"></span>
    </button>

    <nav class="p-drawer__nav">
      <ul class="p-drawer__menu">
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">キャンペーン</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">私たちについて</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">ダイビング情報</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">ブログ</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">お客様の声</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">料金一覧</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">よくある質問</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">プライバシーポリシー</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">利用規約</a>
        </li>
        <li class="p-drawer__menu-item">
          <a href="#" class="p-drawer__menu-link">お問い合わせ</a>
        </li>
      </ul>
    </nav>
  </div>
</div>
\`\`\`

### SCSS Example:
\`\`\`scss
/* ヘッダー */
.p-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 100;
  background-color: #2E2E2E;
}

.p-header__container {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 15px;
}

.p-header__logo {
  margin: 0;
}

.p-header__logo-link {
  display: block;
}

.p-header__logo-image {
  width: 120px;
  height: auto;
}

.p-header__nav {
  display: none;

  @include mq(md) {
    display: block;
    margin-left: auto;
  }
}

.p-header__menu {
  display: grid;
  grid-template-columns: repeat(8, auto);
  gap: 20px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.p-header__menu-item {
  text-align: center;
}

.p-header__menu-link {
  display: block;
  color: #ffffff;
  text-decoration: none;
  font-size: 14px;
  transition: opacity 0.3s;
}

.p-header__menu-link:hover {
  opacity: 0.7;
}

.p-header__drawer-button {
  display: grid;
  grid-template-rows: repeat(3, 2px);
  gap: 5px;
  width: 25px;
  height: 20px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;

  @include mq(md) {
    display: none;
  }
}

.p-header__drawer-line {
  width: 100%;
  height: 2px;
  background-color: #ffffff;
  transition: transform 0.3s, opacity 0.3s;
}

/* ドロワーメニュー */
.p-drawer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  visibility: hidden;
  z-index: 200;
}

.p-drawer[aria-hidden="false"] {
  visibility: visible;
}

.p-drawer__overlay {
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.3s;
}

.p-drawer[aria-hidden="false"] .p-drawer__overlay {
  opacity: 1;
}

.p-drawer__content {
  position: absolute;
  top: 0;
  right: 0;
  width: 80%;
  max-width: 300px;
  height: 100%;
  background-color: #4169e1;
  padding: 60px 20px 20px;
  transform: translateX(100%);
  transition: transform 0.3s;
  overflow-y: auto;
}

.p-drawer[aria-hidden="false"] .p-drawer__content {
  transform: translateX(0);
}

.p-drawer__close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 25px;
  height: 25px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.p-drawer__close-line {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: #ffffff;
}

.p-drawer__close-line:first-child {
  transform: translateY(-50%) rotate(45deg);
}

.p-drawer__close-line:last-child {
  transform: translateY(-50%) rotate(-45deg);
}

.p-drawer__menu {
  list-style: none;
  margin: 0;
  padding: 0;
}

.p-drawer__menu-item:not(:last-child) {
  margin-bottom: 20px;
}

.p-drawer__menu-link {
  display: block;
  color: #ffffff;
  text-decoration: none;
  font-size: 16px;
  transition: opacity 0.3s;
}

.p-drawer__menu-link:hover {
  opacity: 0.7;
}
\`\`\`

### JavaScript Example:
\`\`\`javascript
document.addEventListener('DOMContentLoaded', () => {
  const drawerButton = document.querySelector('.p-header__drawer-button');
  const drawer = document.querySelector('.p-drawer');
  const drawerClose = document.querySelector('.p-drawer__close');
  const drawerOverlay = document.querySelector('.p-drawer__overlay');
  const body = document.body;

  // ドロワーを開く関数
  const openDrawer = () => {
    drawer.setAttribute('aria-hidden', 'false');
    drawerButton.setAttribute('aria-expanded', 'true');
    body.style.overflow = 'hidden'; // スクロール防止
  };

  // ドロワーを閉じる関数
  const closeDrawer = () => {
    drawer.setAttribute('aria-hidden', 'true');
    drawerButton.setAttribute('aria-expanded', 'false');
    body.style.overflow = ''; // スクロール許可
  };

  // イベントリスナーを設定
  drawerButton.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  // ESCキーでドロワーを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.getAttribute('aria-hidden') === 'false') {
      closeDrawer();
    }
  });
});
\`\`\`
`;

    // 共通のプロンプト指示を取得
    const commonInstructions = getCommonPromptInstructions(responsiveMode, aiBreakpoints, settings);

    // メインプロンプトの構築
    return `
# Modern Header and Drawer Menu Generation

Create HTML, CSS, and JavaScript for a modern website header and drawer menu that matches the provided design.

## Basic Information
- Output Type: ${responsiveMode === "pc" ? "PC (Desktop)" : "SP (Mobile)"} Priority
${aiBreakpoints && aiBreakpoints.length > 0 ? `- Breakpoints: ${aiBreakpoints.filter(bp => bp.aiActive).map(bp => `${bp.name}: ${bp.value}px`).join(', ')}` : ''}
${imageDescriptionPrompt ? `\n## Image Analysis\n${imageDescriptionPrompt}` : ''}

## Design Requirements

1. **Header**:
   - Fixed position at top of page
   - Full width with logo on left, navigation in center/right
   - For mobile: Logo and hamburger menu button only
   - Proper spacing and alignment of elements

2. **Drawer Menu**:
   - Slide-in from ${drawerDirection === 'right' ? 'right' :
        drawerDirection === 'left' ? 'left' :
          drawerDirection === 'top' ? 'top' :
            drawerDirection === 'bottom' ? 'bottom' : 'right'} side
   - Close button (X) in the top-right
   - List of navigation links
   - Backdrop overlay that darkens the background

3. **Interactions**:
   - Drawer opens when hamburger button is clicked
   - Drawer closes when X button or overlay is clicked
   - Smooth transitions for open/close animations
   - Keyboard accessibility for all interactions

## Design Rules (Important)

### Coding Conventions:
- **Follow FLOCSS methodology strictly**
  - Project prefix: "p-" (e.g., p-header, p-drawer)
  - Component prefix: "c-" (e.g., c-button)
  - Layout prefix: "l-" (e.g., l-container)
  - Utility prefix: "u-" (e.g., u-hidden)

${textContentPrompt}
${colorGuidelines}
${drawerConfig}
${sampleCode}

${commonInstructions}
`;
  } catch (error) {
    console.error('ヘッダープロンプト生成中にエラーが発生しました:', error);

    // エラーが発生しても最低限のプロンプトを生成して返す
    return `
# Modern Header and Drawer Menu Generation

Create HTML, CSS, and JavaScript for a modern website header and drawer menu.

## Important Instructions
- ONLY code elements visible in the image - no assumed or extra elements
- Be faithful to the design - accurate colors, spacing, and layout
- Use FLOCSS methodology instead of BEM
- **❗ALWAYS USE CSS GRID LAYOUT❗** - **NEVER** use Flexbox unless absolutely impossible
- No SCSS nesting - write flat SCSS structure
- **❗❗ALWAYS PUT MEDIA QUERIES INSIDE SELECTORS❗❗**
- **START HEADING TAGS FROM h2** - do not use h1 tags in components
- **USE <a> TAGS DIRECTLY WITH COMPONENT CLASSES**
- DO NOT use <header> or <main> tags
- Use specific, descriptive class names reflecting design features

## ❌ FORBIDDEN: SCSS Nesting - Critical Warning
- **❌ ABSOLUTELY NO NESTING IN SCSS!** (EXCEPT for media queries)
- **❌ NEVER use &__element notation**
- **❌ NEVER use &:hover or other nested pseudo-selectors**
- **✅ BUT DO NEST MEDIA QUERIES** inside selectors
- **DO NOT USE MULTIPLE DIFFERENT PREFIXES ON THE SAME ELEMENT** - Choose exactly one prefix type
- **CHECK YOUR OUTPUT BEFORE SUBMITTING:** if you see any & symbols in your SCSS, rewrite it with flat selectors

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
/* SCSS code here */
\`\`\`

\`\`\`javascript
// JavaScript code here
\`\`\`
`;
  }
};

/**
 * ヘッダー構造のみに集中したプロンプトを生成する関数
 * @param {Object} options - プロンプト生成オプション
 * @returns {string} 生成されたプロンプト
 */
export const generateHeaderStructurePrompt = async (options) => {
  try {
    const {
      responsiveMode,
      aiBreakpoints,
      pcImageBase64,
      spImageBase64,
      pcColors,
      spColors,
      pcImageText,
      spImageText
    } = options;

    // 画像データの有無を確認
    const hasPcImage = pcImageBase64 && pcImageBase64.trim() !== '';
    const hasSpImage = spImageBase64 && spImageBase64.trim() !== '';

    // 画像から追加情報を抽出
    let extractedPcText = '';
    let extractedSpText = '';
    let pcSections = [];
    let spSections = [];

    // PC画像から情報抽出
    if (hasPcImage && !pcImageText) {
      try {
        extractedPcText = await extractTextFromImage(pcImageBase64);
        console.log("PC画像からテキストを抽出しました");
      } catch (error) {
        console.error("PC画像のテキスト抽出エラー:", error);
      }

      try {
        pcSections = await analyzeImageSections(pcImageBase64);
        console.log("PC画像のセクション分析が完了しました");
      } catch (error) {
        console.error("PC画像のセクション分析エラー:", error);
      }
    }

    // SP画像から情報抽出
    if (hasSpImage && !spImageText) {
      try {
        extractedSpText = await extractTextFromImage(spImageBase64);
        console.log("SP画像からテキストを抽出しました");
      } catch (error) {
        console.error("SP画像のテキスト抽出エラー:", error);
      }

      try {
        spSections = await analyzeImageSections(spImageBase64);
        console.log("SP画像のセクション分析が完了しました");
      } catch (error) {
        console.error("SP画像のセクション分析エラー:", error);
      }
    }

    // 画像の説明を追加
    let imageDescriptionPrompt = '';
    if (hasPcImage) {
      imageDescriptionPrompt += '- PCデザインの画像が提供されています\n';
      if (pcSections && pcSections.length > 0) {
        imageDescriptionPrompt += '  - ' + pcSections.length + '個のセクションが検出されました\n';
      }
    }

    if (hasSpImage) {
      imageDescriptionPrompt += '- SPデザインの画像が提供されています\n';
      if (spSections && spSections.length > 0) {
        imageDescriptionPrompt += '  - ' + spSections.length + '個のセクションが検出されました\n';
      }
    }

    // カスタムブレークポイントの取得
    const customBreakpoints = aiBreakpoints && aiBreakpoints.length > 0
      ? aiBreakpoints
        .filter(bp => bp.aiActive)
        .map(bp => `${bp.name}: ${bp.value}px`)
        .join(', ')
      : '';

    // ローカルストレージから設定を取得
    const settings = getSettingsFromLocalStorage();

    // 画像テキストの前処理
    let textContentPrompt = '';
    if (pcImageText) {
      textContentPrompt += `PC Header Text Content: ${pcImageText}\n\n`;
    } else if (extractedPcText) {
      textContentPrompt += `PC Header Text Content (自動抽出): ${extractedPcText}\n\n`;
    }

    if (spImageText) {
      textContentPrompt += `SP Header Text Content: ${spImageText}\n\n`;
    } else if (extractedSpText) {
      textContentPrompt += `SP Header Text Content (自動抽出): ${extractedSpText}\n\n`;
    }

    // 色情報の処理
    // 色の自動抽出がない場合のみ手動指定を使用
    let pcExtractedColors = [];
    let spExtractedColors = [];

    // 画像から色を抽出（手動で指定された色がない場合）
    if (hasPcImage && (!pcColors || pcColors.length === 0)) {
      try {
        pcExtractedColors = await extractColorsFromImage(pcImageBase64);
        console.log("PC画像から色を抽出しました:", pcExtractedColors.length, "色");
      } catch (error) {
        console.error("PC画像の色抽出エラー:", error);
      }
    }

    if (hasSpImage && (!spColors || spColors.length === 0)) {
      try {
        spExtractedColors = await extractColorsFromImage(spImageBase64);
        console.log("SP画像から色を抽出しました:", spExtractedColors.length, "色");
      } catch (error) {
        console.error("SP画像の色抽出エラー:", error);
      }
    }

    let colorGuidelines = '';
    let manualColors = [...pcColors, ...spColors].filter(color => color.name && color.value);
    let extractedColors = [...pcExtractedColors, ...spExtractedColors];

    // すべての色を結合（手動色 + 抽出色）
    const allColors = [...manualColors, ...extractedColors.map(color => ({ name: 'extracted', value: color }))];

    if (settings.cssVariables && settings.cssVariables.trim() !== '') {
      colorGuidelines = `
## Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like $primary-color, etc.)
- Here is a recommended color palette based on the design:
`;

      // 変数からHEX値を抽出
      const hexValues = extractHexValuesFromVariables(settings.cssVariables);

      // 抽出した色を追加
      if (hexValues.length > 0) {
        colorGuidelines += `  ${hexValues.join(', ')}
`;
      }

      // 画像から抽出した色も追加
      if (allColors.length > 0) {
        const uniqueColors = [...new Map(allColors.map(color => [color.value, color])).values()];
        colorGuidelines += `- Additional colors from the image:
  ${uniqueColors.map(color => color.value).join(', ')}
`;
      }

      colorGuidelines += `- Feel free to use variations of these colors where needed
`;
    } else if (allColors.length > 0) {
      const uniqueColors = [...new Map(allColors.map(color => [color.value, color])).values()];
      colorGuidelines = `
## Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like --primary-color, etc.)
- Here is a recommended color palette based on the design:
  ${uniqueColors.map(color => color.value).join(', ')}
`;
    }

    // 共通のプロンプト指示を取得
    const commonInstructions = getCommonPromptInstructions(responsiveMode, aiBreakpoints, settings);

    // メインプロンプトの構築
    return `
# Modern Website Header Generation

Create HTML and CSS for a modern website header (without drawer menu).

## Basic Information
- Output Type: ${responsiveMode === "pc" ? "PC (Desktop)" : "SP (Mobile)"} Priority
${aiBreakpoints && aiBreakpoints.length > 0 ? `- Breakpoints: ${aiBreakpoints.filter(bp => bp.aiActive).map(bp => `${bp.name}: ${bp.value}px`).join(', ')}` : ''}
${imageDescriptionPrompt ? `\n## Image Analysis\n${imageDescriptionPrompt}` : ''}

## Design Rules (Important)

### Coding Conventions:
- **Follow FLOCSS methodology strictly**
  - Component prefix: "c-" (e.g., c-button)
  - Project prefix: "p-" (e.g., p-header)
  - Layout prefix: "l-" (e.g., l-container)
  - Utility prefix: "u-" (e.g., u-hidden)

${textContentPrompt}
${colorGuidelines}

${commonInstructions}
`;
  } catch (error) {
    console.error('ヘッダー構造プロンプト生成中にエラーが発生しました:', error);

    // エラーが発生しても最低限のプロンプトを生成して返す
    return `
# Modern Website Header Generation

Create HTML and CSS for a modern website header (without drawer menu).

## Important Instructions
- ONLY code elements visible in the image - no assumed or extra elements
- Be faithful to the design - accurate colors, spacing, and layout
- Use FLOCSS methodology instead of BEM
- **❗ALWAYS USE CSS GRID LAYOUT❗** - **NEVER** use Flexbox unless absolutely impossible
- No SCSS nesting - write flat SCSS structure
- **❗❗ALWAYS PUT MEDIA QUERIES INSIDE SELECTORS❗❗**
- **START HEADING TAGS FROM h2** - do not use h1 tags in components
- **USE <a> TAGS DIRECTLY WITH COMPONENT CLASSES**
- DO NOT use <header> or <main> tags
- Use specific, descriptive class names reflecting design features

## ❌ FORBIDDEN: SCSS Nesting - Critical Warning
- **❌ ABSOLUTELY NO NESTING IN SCSS!** (EXCEPT for media queries)
- **❌ NEVER use &__element notation**
- **❌ NEVER use &:hover or other nested pseudo-selectors**
- **✅ BUT DO NEST MEDIA QUERIES** inside selectors
- **DO NOT USE MULTIPLE DIFFERENT PREFIXES ON THE SAME ELEMENT** - Choose exactly one prefix type
- **CHECK YOUR OUTPUT BEFORE SUBMITTING:** if you see any & symbols in your SCSS, rewrite it with flat selectors

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
/* SCSS code here */
\`\`\`

\`\`\`javascript
// JavaScript code here
\`\`\`
`;
  }
};

/**
 * ドロワーメニューのみに集中したプロンプトを生成する関数
 * @param {Object} options - プロンプト生成オプション
 * @returns {string} 生成されたプロンプト
 */
export const generateDrawerMenuPrompt = async (options) => {
  try {
    const {
      responsiveMode,
      aiBreakpoints,
      drawerImageBase64,
      drawerDirection,
      drawerLayout,
      drawerColors,
      drawerImageText
    } = options;

    // 画像データの有無を確認
    const hasDrawerImage = drawerImageBase64 && drawerImageBase64.trim() !== '';

    // 画像から追加情報を抽出
    let extractedDrawerText = '';
    let drawerSections = [];

    // ドロワー画像から情報抽出
    if (hasDrawerImage && !drawerImageText) {
      try {
        extractedDrawerText = await extractTextFromImage(drawerImageBase64);
        console.log("ドロワー画像からテキストを抽出しました");
      } catch (error) {
        console.error("ドロワー画像のテキスト抽出エラー:", error);
      }

      try {
        drawerSections = await analyzeImageSections(drawerImageBase64);
        console.log("ドロワー画像のセクション分析が完了しました");
      } catch (error) {
        console.error("ドロワー画像のセクション分析エラー:", error);
      }
    }

    // 画像の説明を追加
    let imageDescriptionPrompt = '';
    if (hasDrawerImage) {
      imageDescriptionPrompt += '- ドロワーメニューの画像が提供されています\n';
      if (drawerSections && drawerSections.length > 0) {
        imageDescriptionPrompt += '  - ' + drawerSections.length + '個のセクションが検出されました\n';
      }
    }

    // カスタムブレークポイントの取得
    const customBreakpoints = aiBreakpoints && aiBreakpoints.length > 0
      ? aiBreakpoints
        .filter(bp => bp.aiActive)
        .map(bp => `${bp.name}: ${bp.value}px`)
        .join(', ')
      : '';

    // ローカルストレージから設定を取得
    const settings = getSettingsFromLocalStorage();

    // 画像テキストの前処理
    let textContentPrompt = '';
    if (drawerImageText) {
      textContentPrompt += `Drawer Menu Text Content: ${drawerImageText}\n\n`;
    } else if (extractedDrawerText) {
      textContentPrompt += `Drawer Menu Text Content (自動抽出): ${extractedDrawerText}\n\n`;
    }

    // 色情報の処理
    // 色の自動抽出がない場合のみ手動指定を使用
    let drawerExtractedColors = [];

    // 画像から色を抽出（手動で指定された色がない場合）
    if (hasDrawerImage && (!drawerColors || drawerColors.length === 0)) {
      try {
        drawerExtractedColors = await extractColorsFromImage(drawerImageBase64);
        console.log("ドロワー画像から色を抽出しました:", drawerExtractedColors.length, "色");
      } catch (error) {
        console.error("ドロワー画像の色抽出エラー:", error);
      }
    }

    let colorGuidelines = '';
    let manualColors = [...drawerColors].filter(color => color.name && color.value);
    let extractedColors = [...drawerExtractedColors];

    // すべての色を結合（手動色 + 抽出色）
    const allColors = [...manualColors, ...extractedColors.map(color => ({ name: 'extracted', value: color }))];

    if (settings.cssVariables && settings.cssVariables.trim() !== '') {
      colorGuidelines = `
## Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like $primary-color, etc.)
- Here is a recommended color palette based on the design:
`;

      // 変数からHEX値を抽出
      const hexValues = extractHexValuesFromVariables(settings.cssVariables);

      // 抽出した色を追加
      if (hexValues.length > 0) {
        colorGuidelines += `  ${hexValues.join(', ')}
`;
      }

      // 画像から抽出した色も追加
      if (allColors.length > 0) {
        const uniqueColors = [...new Map(allColors.map(color => [color.value, color])).values()];
        colorGuidelines += `- Additional colors from the image:
  ${uniqueColors.map(color => color.value).join(', ')}
`;
      }

      colorGuidelines += `- Feel free to use variations of these colors where needed
`;
    } else if (allColors.length > 0) {
      const uniqueColors = [...new Map(allColors.map(color => [color.value, color])).values()];
      colorGuidelines = `
## Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like --primary-color, etc.)
- Here is a recommended color palette based on the design:
  ${uniqueColors.map(color => color.value).join(', ')}
`;
    }

    // ドロワー設定の情報
    const drawerConfig = `
## Drawer Menu Configuration:
- Drawer Layout: ${drawerLayout === 'both' ? 'Both SP/PC' : 'SP Only'}
- Drawer Direction: ${drawerDirection === 'right' ? 'From Right' :
        drawerDirection === 'left' ? 'From Left' :
          drawerDirection === 'top' ? 'From Top' :
            drawerDirection === 'bottom' ? 'From Bottom' :
              'Fade In'
      }
`;

    // 共通のプロンプト指示を取得
    const commonInstructions = getCommonPromptInstructions(responsiveMode, aiBreakpoints, settings);

    // メインプロンプトの構築
    return `
# Modern Drawer Menu Generation

Create HTML, CSS, and JavaScript for a modern website drawer menu.

## Basic Information
- Output Type: ${responsiveMode === "pc" ? "PC (Desktop)" : "SP (Mobile)"} Priority
${aiBreakpoints && aiBreakpoints.length > 0 ? `- Breakpoints: ${aiBreakpoints.filter(bp => bp.aiActive).map(bp => `${bp.name}: ${bp.value}px`).join(', ')}` : ''}
${imageDescriptionPrompt ? `\n## Image Analysis\n${imageDescriptionPrompt}` : ''}

## Design Rules (Important)

### Coding Conventions:
- **Follow FLOCSS methodology strictly**
  - Component prefix: "c-" (e.g., c-button)
  - Project prefix: "p-" (e.g., p-drawer)
  - Layout prefix: "l-" (e.g., l-container)
  - Utility prefix: "u-" (e.g., u-hidden)

${textContentPrompt}
${colorGuidelines}
${drawerConfig}

${commonInstructions}
`;
  } catch (error) {
    console.error('ドロワーメニュープロンプト生成中にエラーが発生しました:', error);

    // エラーが発生しても最低限のプロンプトを生成して返す
    return `
# Modern Drawer Menu Generation

Create HTML, CSS, and JavaScript for a modern website drawer menu.

## Important Instructions
- ONLY code elements visible in the image - no assumed or extra elements
- Be faithful to the design - accurate colors, spacing, and layout
- Use FLOCSS methodology instead of BEM
- **❗ALWAYS USE CSS GRID LAYOUT❗** - **NEVER** use Flexbox unless absolutely impossible
- No SCSS nesting - write flat SCSS structure
- **❗❗ALWAYS PUT MEDIA QUERIES INSIDE SELECTORS❗❗**
- **START HEADING TAGS FROM h2** - do not use h1 tags in components
- **USE <a> TAGS DIRECTLY WITH COMPONENT CLASSES**
- DO NOT use <header> or <main> tags
- Use specific, descriptive class names reflecting design features

## ❌ FORBIDDEN: SCSS Nesting - Critical Warning
- **❌ ABSOLUTELY NO NESTING IN SCSS!** (EXCEPT for media queries)
- **❌ NEVER use &__element notation**
- **❌ NEVER use &:hover or other nested pseudo-selectors**
- **✅ BUT DO NEST MEDIA QUERIES** inside selectors
- **DO NOT USE MULTIPLE DIFFERENT PREFIXES ON THE SAME ELEMENT** - Choose exactly one prefix type
- **CHECK YOUR OUTPUT BEFORE SUBMITTING:** if you see any & symbols in your SCSS, rewrite it with flat selectors

## Drawer Menu Functionality
- Create smooth open/close animations
- Implement focus management for accessibility
- Add close button and backdrop click handling
- Ensure keyboard accessibility (ESC to close)

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
/* SCSS code here */
\`\`\`

\`\`\`javascript
// JavaScript code here
\`\`\`
`;
  }
};

/**
 * ヘッダーとドロワーメニューの統合のためのプロンプトを生成する関数
 * @param {Object} options - プロンプト生成オプション
 * @returns {string} 生成されたプロンプト
 */
export const generateIntegrationPrompt = async (options) => {
  try {
    const {
      responsiveMode,
      aiBreakpoints,
      pcImageBase64,
      spImageBase64,
      drawerImageBase64,
      pcColors,
      spColors,
      drawerColors,
      pcImageText,
      spImageText,
      drawerImageText,
      drawerLayout,
      drawerDirection,
      headerHtml,
      headerCss,
      drawerHtml,
      drawerCss,
      drawerJs
    } = options;

    // 画像データの有無を確認
    const hasPcImage = pcImageBase64 && pcImageBase64.trim() !== '';
    const hasSpImage = spImageBase64 && spImageBase64.trim() !== '';
    const hasDrawerImage = drawerImageBase64 && drawerImageBase64.trim() !== '';

    // 画像から追加情報を抽出
    let extractedPcText = '';
    let extractedSpText = '';
    let extractedDrawerText = '';
    let pcSections = [];
    let spSections = [];
    let drawerSections = [];

    // PC画像から情報抽出
    if (hasPcImage && !pcImageText) {
      try {
        extractedPcText = await extractTextFromImage(pcImageBase64);
        console.log("PC画像からテキストを抽出しました");
      } catch (error) {
        console.error("PC画像のテキスト抽出エラー:", error);
      }

      try {
        pcSections = await analyzeImageSections(pcImageBase64);
        console.log("PC画像のセクション分析が完了しました");
      } catch (error) {
        console.error("PC画像のセクション分析エラー:", error);
      }
    }

    // SP画像から情報抽出
    if (hasSpImage && !spImageText) {
      try {
        extractedSpText = await extractTextFromImage(spImageBase64);
        console.log("SP画像からテキストを抽出しました");
      } catch (error) {
        console.error("SP画像のテキスト抽出エラー:", error);
      }

      try {
        spSections = await analyzeImageSections(spImageBase64);
        console.log("SP画像のセクション分析が完了しました");
      } catch (error) {
        console.error("SP画像のセクション分析エラー:", error);
      }
    }

    // ドロワー画像から情報抽出
    if (hasDrawerImage && !drawerImageText) {
      try {
        extractedDrawerText = await extractTextFromImage(drawerImageBase64);
        console.log("ドロワー画像からテキストを抽出しました");
      } catch (error) {
        console.error("ドロワー画像のテキスト抽出エラー:", error);
      }

      try {
        drawerSections = await analyzeImageSections(drawerImageBase64);
        console.log("ドロワー画像のセクション分析が完了しました");
      } catch (error) {
        console.error("ドロワー画像のセクション分析エラー:", error);
      }
    }

    // 画像の説明を追加
    let imageDescriptionPrompt = '';
    if (hasPcImage) {
      imageDescriptionPrompt += '- PCデザインの画像が提供されています\n';
      if (pcSections && pcSections.length > 0) {
        imageDescriptionPrompt += '  - ' + pcSections.length + '個のセクションが検出されました\n';
      }
    }

    if (hasSpImage) {
      imageDescriptionPrompt += '- SPデザインの画像が提供されています\n';
      if (spSections && spSections.length > 0) {
        imageDescriptionPrompt += '  - ' + spSections.length + '個のセクションが検出されました\n';
      }
    }

    if (hasDrawerImage) {
      imageDescriptionPrompt += '- ドロワーメニューの画像が提供されています\n';
      if (drawerSections && drawerSections.length > 0) {
        imageDescriptionPrompt += '  - ' + drawerSections.length + '個のセクションが検出されました\n';
      }
    }

    // カスタムブレークポイントの取得
    const customBreakpoints = aiBreakpoints && aiBreakpoints.length > 0
      ? aiBreakpoints
        .filter(bp => bp.aiActive)
        .map(bp => `${bp.name}: ${bp.value}px`)
        .join(', ')
      : '';

    // ローカルストレージから設定を取得
    const settings = getSettingsFromLocalStorage();

    // テキスト情報を準備
    let textContentPrompt = '';
    if (pcImageText || extractedPcText || spImageText || extractedSpText || drawerImageText || extractedDrawerText) {
      textContentPrompt = '## Text Content Analysis\n';

      if (pcImageText) {
        textContentPrompt += `PC Header Text: ${pcImageText}\n\n`;
      } else if (extractedPcText) {
        textContentPrompt += `PC Header Text (自動抽出): ${extractedPcText}\n\n`;
      }

      if (spImageText) {
        textContentPrompt += `SP Header Text: ${spImageText}\n\n`;
      } else if (extractedSpText) {
        textContentPrompt += `SP Header Text (自動抽出): ${extractedSpText}\n\n`;
      }

      if (drawerImageText) {
        textContentPrompt += `Drawer Menu Text: ${drawerImageText}\n\n`;
      } else if (extractedDrawerText) {
        textContentPrompt += `Drawer Menu Text (自動抽出): ${extractedDrawerText}\n\n`;
      }
    }

    // 色情報の処理
    // 色の自動抽出がない場合のみ手動指定を使用
    let pcExtractedColors = [];
    let spExtractedColors = [];
    let drawerExtractedColors = [];

    // 画像から色を抽出（手動で指定された色がない場合）
    if (hasPcImage && (!pcColors || pcColors.length === 0)) {
      try {
        pcExtractedColors = await extractColorsFromImage(pcImageBase64);
        console.log("PC画像から色を抽出しました:", pcExtractedColors.length, "色");
      } catch (error) {
        console.error("PC画像の色抽出エラー:", error);
      }
    }

    if (hasSpImage && (!spColors || spColors.length === 0)) {
      try {
        spExtractedColors = await extractColorsFromImage(spImageBase64);
        console.log("SP画像から色を抽出しました:", spExtractedColors.length, "色");
      } catch (error) {
        console.error("SP画像の色抽出エラー:", error);
      }
    }

    if (hasDrawerImage && (!drawerColors || drawerColors.length === 0)) {
      try {
        drawerExtractedColors = await extractColorsFromImage(drawerImageBase64);
        console.log("ドロワー画像から色を抽出しました:", drawerExtractedColors.length, "色");
      } catch (error) {
        console.error("ドロワー画像の色抽出エラー:", error);
      }
    }

    let colorGuidelines = '';
    let manualColors = [...pcColors, ...spColors, ...drawerColors].filter(color => color.name && color.value);
    let extractedColors = [...pcExtractedColors, ...spExtractedColors, ...drawerExtractedColors];

    // すべての色を結合（手動色 + 抽出色）
    const allColors = [...manualColors, ...extractedColors.map(color => ({ name: 'extracted', value: color }))];

    if (settings.cssVariables && settings.cssVariables.trim() !== '') {
      colorGuidelines = `
## Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like $primary-color, etc.)
- Here is a recommended color palette based on the design:
`;

      // 変数からHEX値を抽出
      const hexValues = extractHexValuesFromVariables(settings.cssVariables);

      // 抽出した色を追加
      if (hexValues.length > 0) {
        colorGuidelines += `  ${hexValues.join(', ')}
`;
      }

      // 画像から抽出した色も追加
      if (allColors.length > 0) {
        const uniqueColors = [...new Map(allColors.map(color => [color.value, color])).values()];
        colorGuidelines += `- Additional colors from the image:
  ${uniqueColors.map(color => color.value).join(', ')}
`;
      }

      colorGuidelines += `- Feel free to use variations of these colors where needed
`;
    } else if (allColors.length > 0) {
      const uniqueColors = [...new Map(allColors.map(color => [color.value, color])).values()];
      colorGuidelines = `
## Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like --primary-color, etc.)
- Here is a recommended color palette based on the design:
  ${uniqueColors.map(color => color.value).join(', ')}
`;
    }

    // ドロワー設定の情報
    const drawerConfig = `
## Drawer Menu Configuration:
- Drawer Layout: ${drawerLayout === 'both' ? 'Both SP/PC' : 'SP Only'}
- Drawer Direction: ${drawerDirection === 'right' ? 'From Right' :
        drawerDirection === 'left' ? 'From Left' :
          drawerDirection === 'top' ? 'From Top' :
            drawerDirection === 'bottom' ? 'From Bottom' :
              'Fade In'
      }
`;

    // 既存コードの情報
    const existingCode = `
## Existing Header Code:

\`\`\`html
${headerHtml || '<!-- No header HTML provided -->'}
\`\`\`

\`\`\`scss
${headerCss || '/* No header CSS provided */'}
\`\`\`

## Existing Drawer Menu Code:

\`\`\`html
${drawerHtml || '<!-- No drawer HTML provided -->'}
\`\`\`

\`\`\`scss
${drawerCss || '/* No drawer CSS provided */'}
\`\`\`

\`\`\`javascript
${drawerJs || '// No drawer JavaScript provided'}
\`\`\`
`;

    // 共通のプロンプト指示を取得
    const commonInstructions = getCommonPromptInstructions(responsiveMode, aiBreakpoints, settings);

    // メインプロンプトの構築
    return `
# Header and Drawer Menu Integration

Integrate the header and drawer menu components into a unified, functional solution.

## Basic Information
- Output Type: ${responsiveMode === "pc" ? "PC (Desktop)" : "SP (Mobile)"} Priority
${aiBreakpoints && aiBreakpoints.length > 0 ? `- Breakpoints: ${aiBreakpoints.filter(bp => bp.aiActive).map(bp => `${bp.name}: ${bp.value}px`).join(', ')}` : ''}
${imageDescriptionPrompt ? `\n## Image Analysis\n${imageDescriptionPrompt}` : ''}

## Design Rules (Important)

### Coding Conventions:
- **Follow FLOCSS methodology strictly**
  - Component prefix: "c-" (e.g., c-button)
  - Project prefix: "p-" (e.g., p-header, p-drawer)
  - Layout prefix: "l-" (e.g., l-container)
  - Utility prefix: "u-" (e.g., u-hidden)

${textContentPrompt}
${colorGuidelines}
${drawerConfig}
${existingCode}

## Integration Task

Your task is to integrate the header and drawer menu components into a single, cohesive solution:

1. **Review Existing Code**:
   - Analyze the provided header and drawer code
   - Identify elements that need to be connected (e.g., hamburger buttons, navigation)

2. **Resolve Conflicts**:
   - Eliminate any duplicated classes or styles
   - Ensure consistent naming conventions
   - Combine similar styles where appropriate

3. **Unify JavaScript Functionality**:
   - Create a single JavaScript file that handles both header and drawer functionality
   - Ensure proper event handling and accessibility
   - Implement smooth transitions for all interactive elements

4. **Output Complete Solution**:
   - Provide complete HTML, SCSS and JavaScript that combines both components
   - Ensure all functionality works seamlessly
   - Keep code clean, organized, and maintainable

${commonInstructions}
`;
  } catch (error) {
    console.error('統合プロンプト生成中にエラーが発生しました:', error);

    // エラーが発生しても最低限のプロンプトを生成して返す
    return `
# Header and Drawer Menu Integration

Integrate the header and drawer menu components into a unified, functional solution.

## Important Instructions
- Maintain FLOCSS methodology in all code
- Combine and deduplicate classes from header and drawer components
- Ensure proper JavaScript functionality for both components
- **❗ALWAYS USE CSS GRID LAYOUT❗** - **NEVER** use Flexbox unless absolutely impossible
- No SCSS nesting - write flat SCSS structure
- **❗❗ALWAYS PUT MEDIA QUERIES INSIDE SELECTORS❗❗**
- **START HEADING TAGS FROM h2** - do not use h1 tags in components
- **USE <a> TAGS DIRECTLY WITH COMPONENT CLASSES**
- DO NOT use <header> or <main> tags
- Use specific, descriptive class names reflecting design features

## ❌ FORBIDDEN: SCSS Nesting - Critical Warning
- **❌ ABSOLUTELY NO NESTING IN SCSS!** (EXCEPT for media queries)
- **❌ NEVER use &__element notation**
- **❌ NEVER use &:hover or other nested pseudo-selectors**
- **✅ BUT DO NEST MEDIA QUERIES** inside selectors
- **DO NOT USE MULTIPLE DIFFERENT PREFIXES ON THE SAME ELEMENT** - Choose exactly one prefix type
- **CHECK YOUR OUTPUT BEFORE SUBMITTING:** if you see any & symbols in your SCSS, rewrite it with flat selectors

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
/* SCSS code here */
\`\`\`

\`\`\`javascript
// JavaScript code here
\`\`\`
`;
  }
};
