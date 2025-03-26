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
${aiBreakpoints && aiBreakpoints.length > 0 ? `- Breakpoints: ${aiBreakpoints.map(bp => `${bp.width}px`).join(', ')}` : ''}

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
- Use **CSS Grid** layout instead of Flexbox where appropriate
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
- **DO NOT use <header> or <main> tags** - use div with appropriate classes instead
- Analyze the design and assign **specific, descriptive class names** that reflect design features

### SCSS Guidelines:
- Follow the ${responsiveMode === "both" ? "responsive approach" : `${responsiveMode === "pc" ? "Desktop-first" : "Mobile-first"} approach`}
- Apply breakpoints using \`@mixin mq()\` like:
\`\`\`scss
.c-button {
  color: red;
  @include mq(md) {
    color: blue;
  }
}
\`\`\`
- Reference the preset CSS variables when appropriate
- Ensure compatibility with the provided Reset CSS
- **For images**: use aspect-ratio property to maintain proportions (e.g., \`aspect-ratio: 16 / 9;\`)
- **For width**: use percentages or relative units (e.g., \`width: 100%;\`, \`max-width: 100%;\`)
- **For height**: use auto where possible or aspect-ratio to control dimensions

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
// SCSS code here (flat structure, no nesting)
\`\`\`

Analyze the image structure and layout in detail to create accurate HTML and SCSS that precisely reflect ONLY what is visible in the image.
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
- Use FLOCSS methodology instead of BEM
- Use CSS Grid layout instead of Flexbox where possible
- No SCSS nesting - write flat SCSS structure
- Apply responsive design using @mixin mq() as needed
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
// SCSS code here (flat structure, no nesting)
\`\`\`
`;
  }
};

export { generatePrompt };
