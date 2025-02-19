import { extractColors, extractTextFromImage } from "./imageAnalyzer.js"; // ← 追加

export const generatePrompt = async ({ responsiveMode, aiBreakpoints, pcImageBase64, spImageBase64 }) => {
  const activeBreakpoints = (aiBreakpoints || []).filter((bp) => bp.aiActive);
  const breakpointDescriptions = activeBreakpoints
    .map((bp) => `${bp.name}: ${bp.value}px`)
    .join(", ");

  const storedColors = JSON.parse(localStorage.getItem("colorVariables")) || {};
  const colorDescriptions = Object.entries(storedColors)
    .map(([name, color]) => `${name}: ${color}`)
    .join(", ");

  // **extractColors, extractTextFromImage を正しく使用**
  const pcColors = pcImageBase64 ? await extractColors(pcImageBase64) : [];
  const spColors = spImageBase64 ? await extractColors(spImageBase64) : [];
  const pcText = pcImageBase64 ? (await extractTextFromImage(pcImageBase64)).slice(0, 10) : "";
  const spText = spImageBase64 ? (await extractTextFromImage(spImageBase64)).slice(0, 10) : "";


  return `
You are a professional web coder and a specialist in front-end development. Your expertise is highly recognized worldwide.
Your task is to generate high-quality HTML and SCSS based on the provided images and settings.

## Requirements:
- Follow **FLOCSS methodology** strictly for CSS.
- Ensure **Mobile First** or **Desktop First** approach as specified.
- Use only **semantic and accessible** HTML.
- Avoid unnecessary inline styles.
- Maintain consistent **naming conventions** for SCSS classes.

## Given Data:
- **Responsive Mode**: ${responsiveMode === "sp" ? "Mobile First" : "Desktop First"}
- **Breakpoints**: ${breakpointDescriptions || "None specified"}
- **Defined Colors**: ${colorDescriptions || "No predefined colors"}
- **PC Image Colors**: ${pcColors.join(", ") || "No extracted colors"}
- **SP Image Colors**: ${spColors.join(", ") || "No extracted colors"}
- **PC Image Text**: ${pcText || "No text detected"}
- **SP Image Text**: ${spText || "No text detected"}

## Layout Analysis:
- If the image contains a navbar, ensure a proper **header structure**.
- If the image contains multiple sections, use appropriate **sectioning elements**.
- Use a **flexbox/grid layout** depending on the structure of the elements.

## Instructions:
- Analyze the provided images and generate a corresponding HTML and SCSS structure.
- Use the provided **color variables** if they closely match the image colors.
- If no close match exists, pick an appropriate color from the image.
- Follow this SCSS breakpoint structure:

\`\`\`scss
@mixin mq($mediaquery: md) {
  @media #{map.get($mediaquerys, $mediaquery)} {
    @content;
  }
}

.container {
  width: 100%;
  @include mq(md) {
    width: 80%;
  }
}
\`\`\`

## Output Format:
- **HTML** must be enclosed within \`<html>...</html>\`
- **SCSS** must be enclosed within \`<style>...</style>\`
- No extra comments or explanations.
  `;
};
