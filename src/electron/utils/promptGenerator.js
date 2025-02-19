import { extractColors, extractTextFromImage } from "./imageAnalyzer.js";

export const generatePrompt = async ({ responsiveMode, aiBreakpoints, pcImageBase64, spImageBase64 }) => {
  const activeBreakpoints = (aiBreakpoints || []).filter((bp) => bp.aiActive);
  const breakpointDescriptions = activeBreakpoints
    .map((bp) => `${bp.name}: ${bp.value}px`)
    .join(", ");

  const storedColors = JSON.parse(localStorage.getItem("colorVariables")) || {};
  const colorDescriptions = Object.entries(storedColors)
    .map(([name, color]) => `${name}: ${color}`)
    .join(", ");

  // **画像から色とテキストを抽出**
  const pcColors = pcImageBase64 ? await extractColors(pcImageBase64) : [];
  const spColors = spImageBase64 ? await extractColors(spImageBase64) : [];
  const pcText = pcImageBase64 ? (await extractTextFromImage(pcImageBase64)).slice(0, 500) : "";
  const spText = spImageBase64 ? (await extractTextFromImage(spImageBase64)).slice(0, 500) : "";

  return `
You are a professional front-end developer specializing in semantic HTML, FLOCSS-based SCSS, and responsive web design. Your task is to generate optimized and structured HTML and SCSS based on the provided image and settings.

## 📌 Requirements:
- Strictly follow the **FLOCSS methodology** for CSS.
- Use **Mobile First** or **Desktop First** based on the specified responsive mode.
- Utilize **semantic and accessible HTML elements**.
- Avoid inline styles and redundant classes.
- Ensure **scalable and maintainable SCSS architecture**.
- 🚨 **DO NOT output the following elements in the SCSS code:**
  - **DO NOT include `$colors` map declaration.**
  - **DO NOT include `$mediaquerys` map declaration.**
  - **DO NOT include `@mixin mq(...)` in the SCSS output.**
  - **Use `map.get($colors, color - name)` but assume `$colors` is already defined elsewhere.**
  - **Use `@include mq(lg) {... } ` but assume `mq()` is already defined elsewhere.**

## 🔍 Given Data:
- **Responsive Mode**: ${responsiveMode === "sp" ? "Mobile First" : "Desktop First"}
- **Breakpoints**: ${breakpointDescriptions || "No breakpoints specified"}
- **Predefined Colors**: ${colorDescriptions || "None"}
- **Extracted Colors from PC Image**: ${pcColors.join(", ") || "Not detected"}
- **Extracted Colors from SP Image**: ${spColors.join(", ") || "Not detected"}
- **Extracted Text from PC Image**: ${pcText || "No text found"}
- **Extracted Text from SP Image**: ${spText || "No text found"}

## 📐 Layout Considerations:
Analyze the provided images and infer the following structural elements:
1. **Header/Navbar**: If present, use \`<header>\` and \`nav\` elements appropriately.
2. **Main Content Sections**: Identify sections such as hero area, feature list, blog entries, etc.
3. **Footer**: If found, use \`<footer>\` with appropriate semantic elements.
4. **Typography**: Maintain consistency based on extracted text size and weight.
5. **Colors**: Prioritize predefined variables, but if necessary, extract colors from images.

## 🚀 Output Format:
- **HTML** must be enclosed within \`<html>...</html>\`
- **SCSS** must be enclosed within \`<style>...</style>\`
- Avoid unnecessary comments or explanations.
  `;
};
