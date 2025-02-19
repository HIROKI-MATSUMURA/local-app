import { extractTextFromImage, extractColorsFromImage } from "./imageAnalyzer";

const generatePrompt = async ({ responsiveMode, aiBreakpoints, pcImageBase64, spImageBase64 }) => {
  // 画像から動的に色を取得
  const pcColors = pcImageBase64 ? await extractColorsFromImage(pcImageBase64) : [];
  const spColors = spImageBase64 ? await extractColorsFromImage(spImageBase64) : [];

  // ローカルストレージからカスタム変数を取得
  let storedVariables = localStorage.getItem("customVariables");
  let customVariables = storedVariables ? JSON.parse(storedVariables) : {};
  let customColors = customVariables.customColors || [];
  let fontSettings = customVariables.fonts || [];

  let predefinedColors = customColors.map((color, index) => `$custom-color-${index + 1}: ${color};`).join("\n");
  let predefinedFonts = fontSettings.map(font => `${font.name}: ${font.url}`).join("\n");

  // ローカルストレージから ResetCSS を取得
  let resetCSS = localStorage.getItem("resetCSS") || "";

  // 画像からテキストを抽出
  const pcText = pcImageBase64 ? (await extractTextFromImage(pcImageBase64)).slice(0, 500) : "";
  const spText = spImageBase64 ? (await extractTextFromImage(spImageBase64)).slice(0, 500) : "";

  return [
    "You are a professional front-end developer specializing in SCSS and HTML.",
    "",
    "## Guidelines:",
    "- Use **FLOCSS methodology** for SCSS.",
    "- Follow the **Mobile First** or **Desktop First** approach as specified.",
    "- Write **semantic and accessible** HTML.",
    "- Avoid unnecessary inline styles.",
    "",
    "## 制約条件:",
    "- 添付画像のレイアウトを忠実に参照し、コードを生成する。",
    "- コードの解説は不要。",
    `- **レスポンシブモード**: ${responsiveMode === "pc-first" ? "PCファースト" : "SPファースト"} でコーディングする。`,
    "",
    "## コーディング規則:",
    "### HTMLとCSS共通:",
    "- 出力するコードは**絶対にFLOCSS記法のみ**。",
    "- クラス名は**ハイフンケース**で出力する。",
    "- **ハードコーディングを避け、再利用可能なフレキシブルなコードを生成する**。",
    "- コードは**W3C規格**に準拠する。",
    "",
    "### HTML:",
    "- `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` タグは**不要**。",
    "- `h` タグは**使用しない**。",
    "- `section`, `article` タグは**使用しない**。",
    "- `alt` の値は**日本語で50文字以内**にする。",
    "- `img` タグには **`loading=\"lazy\"`** を付与する。",
    "- `time` タグには **`datetime` 属性** を付与する。",
    "",
    "### CSS:",
    "- `font-size` の単位は **ルート 16px 基準で `rem` に変換**。",
    "- **要素間の余白:**",
    "  - 縦方向の余白: `margin-top` を使用する。",
    "  - 横方向の余白: `margin-left` を使用する。",
    "- 要素単体の余白には `padding` を使用する。",
    "",
    "### **リセットCSSを参照すること:**",
    "以下の ResetCSS の内容を考慮し、**重複しないようにコードを生成すること**。",
    "```scss",
    resetCSS || "No ResetCSS found",
    "```",
    "",
    "## Provided Variables (These are reference values. You must NOT include them in the generated code.):",
    "### Colors:",
    predefinedColors || "No predefined colors",
    "",
    "### Fonts:",
    predefinedFonts || "No predefined fonts",
    "",
    "### Breakpoints:",
    aiBreakpoints.map(bp => `- ${bp.name}: (min-width: ${bp.value}px)`).join("\n"),
    "",
    "- **SCSS mixin for breakpoints** (Reference Only - DO NOT include in output SCSS):",
    "```scss",
    "@mixin mq($mediaquery: md) {",
    "  @media #{map.get($mediaquerys, $mediaquery)} {",
    "    @content;",
    "  }",
    "}",
    "```",
    "",
    "**These reference values must NOT appear in the SCSS output.**",
    "Use them for reference when applying styles, but do NOT output `$mediaquerys`, `$colors`, or `@mixin` in the final SCSS.",
    "",
    "---",
    "",
    "## Extracted Data:",
    "- **PC Image Colors**:",
    pcColors.length > 0 ? pcColors.map(color => `- ${color}`).join("\n") : "No colors detected",
    "- **SP Image Colors**:",
    spColors.length > 0 ? spColors.map(color => `- ${color}`).join("\n") : "No colors detected",
    "",
    "- **Extracted Text (PC Image):**",
    pcText ? `"${pcText}"` : "No text detected",
    "- **Extracted Text (SP Image):**",
    spText ? `"${spText}"` : "No text detected",
    "",
    "**If a detected color is similar to a predefined variable, use the variable instead of the raw color code.**",
    "**Use the extracted text to determine appropriate styles and class names.**",
    "",
    "---",
    "",
    "## Output Requirements:",
    "1. **HTML Structure**:",
    "   - Use **semantic elements** (`div`, `nav`, `ul`, `li`, etc.).",
    "",
    "2. **SCSS Styling**:",
    "   - Use only **predefined colors** when applicable。",
    "   - **DO NOT output color variables definition (`$colors`) in the SCSS.**",
    "   - Apply **FLOCSS rules** (`.l-` for layout, `.c-` for components).",
    "   - **Breakpoints must be applied using `@mixin mq()` as shown below:**",
    "```scss",
    ".c-button {",
    "  color: red;",
    "  @include mq(md) {",
    "    color: blue;",
    "  }",
    "}",
    "```",
    "",
    "3. **Format**:",
    "   - HTML must be enclosed within `<html>...</html>`。",
    "   - SCSS must be enclosed within `<style>...</style>`。",
    "   - **DO NOT include extra comments or explanations in the output.**"
  ].join("\n");
};

export { generatePrompt };
