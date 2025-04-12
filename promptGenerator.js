/**
 * promptGenerator.js
 * 圧縮された画像解析データからClaude用の最適化されたプロンプトを生成する
 */

/**
 * 圧縮された解析データからClaudeプロンプトを生成する
 * @param {Object} compressedData - 圧縮された解析データ
 * @returns {string} Claude用のプロンプト
 */
function generatePromptFromCompressedData(compressedData) {
  if (!compressedData) {
    return "画像解析データが利用できません。画像を再アップロードしてください。";
  }

  // デザイン全体の概要
  const overviewSection = generateOverviewSection(compressedData);

  // 色彩情報のセクション
  const colorSection = generateColorSection(compressedData.colors);

  // レイアウト構造のセクション
  const layoutSection = generateLayoutSection(compressedData.layout);

  // テキスト要素のセクション
  const textSection = generateTextSection(compressedData.text);

  // UI要素のセクション
  const elementsSection = generateElementsSection(compressedData.elements);

  // デザイン意図の推論
  const intentSection = inferDesignIntent(compressedData);

  // Claudeへの指示事項
  const instructionSection = `
### Instructions:

Generate clean, semantic HTML and SCSS code that accurately reproduces this design.
Follow these guidelines:
1. Use semantic HTML5 elements where appropriate (header, nav, main, section, article, footer)
2. Implement BEM naming convention for CSS classes
3. Create responsive design with mobile-first approach
4. Ensure accessibility (WCAG compliance)
5. Optimize for performance with clean, minimal CSS
6. Use CSS variables for the color palette
7. Create a component-based structure that could be easily maintained
`;

  // 最終プロンプトの組み立て
  return `
# UI Design Analysis and Code Generation Task

${overviewSection}

## Color Palette
${colorSection}

## Layout Structure
${layoutSection}

## Text Content
${textSection}

## UI Elements
${elementsSection}

## Design Intent
${intentSection}

${instructionSection}

Please generate the HTML and SCSS code that accurately reproduces this design.
Provide the code in two separate code blocks labeled "HTML" and "SCSS".
  `;
}

/**
 * デザイン全体の概要を生成
 * @param {Object} compressedData - 圧縮された解析データ
 * @returns {string} デザイン概要の文字列
 */
function generateOverviewSection(compressedData) {
  const layout = compressedData.layout || {};
  const layoutType = layout.layoutType || 'unknown';
  const layoutSummary = layout.summary || {};
  const width = layoutSummary.width || 'unknown';
  const height = layoutSummary.height || 'unknown';
  const sectionCount = layoutSummary.sectionCount || 0;
  const gridPattern = layoutSummary.gridPattern || {};

  let description = `
This design appears to be a ${getLayoutTypeDescription(layoutType)} layout with dimensions of ${width}x${height}px.
The design is organized into ${sectionCount} main sections.`;

  if (gridPattern && gridPattern.type) {
    description += `
The layout follows a ${gridPattern.type} grid pattern with ${gridPattern.columns} columns and ${gridPattern.rows} rows.`;
  }

  const elementCount = compressedData.elements?.count || 0;
  if (elementCount > 0) {
    description += `
The design contains approximately ${elementCount} UI elements.`;
  }

  return description;
}

/**
 * レイアウトタイプの詳細説明を取得
 * @param {string} layoutType - レイアウトタイプ
 * @returns {string} レイアウトタイプの説明
 */
function getLayoutTypeDescription(layoutType) {
  const descriptions = {
    'grid': 'grid-based',
    'horizontal_scroll': 'horizontally scrollable',
    'vertical_scroll': 'vertically scrollable',
    'single_view': 'single-view',
    'header_content_footer': 'traditional header-content-footer',
    'columns': 'multi-column',
    'list': 'list-based'
  };

  return descriptions[layoutType] || layoutType;
}

/**
 * 色彩情報のセクションを生成
 * @param {Array} colors - 色情報の配列
 * @returns {string} 色彩情報の文字列
 */
function generateColorSection(colors = []) {
  if (!colors || colors.length === 0) {
    return "No color information is available.";
  }

  const colorDescriptions = colors.map(color => {
    const role = color.role ? `${color.role} (${translateColorRole(color.role)})` : 'general use';
    const percentage = Math.round(color.ratio * 100);
    return `- ${color.hex} (${color.rgb}): ${role}, ${percentage}% of design`;
  }).join('\n');

  return `
The design uses the following color palette:

${colorDescriptions}

These colors should be defined as SCSS variables for consistency throughout the code.`;
}

/**
 * 色の役割の日本語訳を取得
 * @param {string} role - 色の役割
 * @returns {string} 日本語訳
 */
function translateColorRole(role) {
  const translations = {
    'background': '背景色',
    'text': 'テキスト色',
    'accent': 'アクセント色',
    'primary': 'プライマリ色',
    'secondary': 'セカンダリ色'
  };

  return translations[role] || role;
}

/**
 * レイアウト構造のセクションを生成
 * @param {Object} layout - レイアウト情報
 * @returns {string} レイアウト構造の文字列
 */
function generateLayoutSection(layout = {}) {
  if (!layout || !layout.summary) {
    return "No layout information is available.";
  }

  const summary = layout.summary;
  const sectionSummaries = summary.sectionSummaries || [];

  let sectionDescriptions = '';
  if (sectionSummaries.length > 0) {
    sectionDescriptions = sectionSummaries.map(section => {
      const typeDescription = getFormattedSectionType(section.type);
      return `- ${typeDescription} (${section.position} position, height: ${section.height}px)${section.color ? `, color: ${section.color}` : ''}`;
    }).join('\n');
  }

  const gridPattern = summary.gridPattern || {};
  let gridDescription = '';

  if (gridPattern.type) {
    gridDescription = `
The layout is arranged in a ${gridPattern.type} pattern with ${gridPattern.columns} columns and ${gridPattern.rows} rows.
You should implement this using ${getRecommendedCSSMethod(gridPattern)}.`;
  }

  return `
The design has an overall width of ${summary.width}px and height of ${summary.height}px.
${gridDescription}

The layout consists of the following sections:
${sectionDescriptions || 'No distinct sections detected.'}`;
}

/**
 * セクションタイプの説明を整形
 * @param {string} sectionType - セクションタイプ
 * @returns {string} フォーマットされたセクションタイプの説明
 */
function getFormattedSectionType(sectionType) {
  // セクションタイプごとの説明
  const typeDescriptions = {
    'hero': 'Hero section',
    'header': 'Header section',
    'footer': 'Footer section',
    'nav': 'Navigation section',
    'card-grid': 'Card grid section',
    'features': 'Features section',
    'about': 'About section',
    'contact': 'Contact form section',
    'testimonials': 'Testimonials section',
    'pricing': 'Pricing section',
    'gallery': 'Gallery section',
    'cta': 'Call-to-action section',
    'faq': 'FAQ section',
    'content': 'Content section'
  };

  return typeDescriptions[sectionType] || `${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)} section`;
}

/**
 * グリッドパターンに基づいて推奨CSSメソッドを取得
 * @param {Object} gridPattern - グリッドパターン情報
 * @returns {string} 推奨CSSメソッド
 */
function getRecommendedCSSMethod(gridPattern) {
  const type = gridPattern.type;
  const columns = gridPattern.columns;

  if (type === 'grid' && columns > 1) {
    return 'CSS Grid';
  } else if (type === 'horizontal' || type === 'columns') {
    return 'Flexbox';
  } else if (type === 'header_content_footer') {
    return 'a combination of CSS Grid for the overall layout';
  } else {
    return 'appropriate CSS layout techniques';
  }
}

/**
 * テキスト要素のセクションを生成
 * @param {Object} text - テキスト情報
 * @returns {string} テキスト要素の文字列
 */
function generateTextSection(text = {}) {
  if (!text || !text.textBlocks || text.textBlocks.length === 0) {
    return "No text content is available.";
  }

  // テキストブロックを役割ごとにグループ化
  const groupedBlocks = {};
  text.textBlocks.forEach(block => {
    const role = block.role || 'unknown';
    if (!groupedBlocks[role]) {
      groupedBlocks[role] = [];
    }
    groupedBlocks[role].push(block);
  });

  // グループごとに最大3つまでのテキストブロックを例として表示
  let textContent = '';
  for (const [role, blocks] of Object.entries(groupedBlocks)) {
    const examples = blocks.slice(0, 3).map(block => `"${truncateText(block.text, 50)}"`).join(', ');
    textContent += `- ${role.charAt(0).toUpperCase() + role.slice(1)}: ${examples} ${blocks.length > 3 ? `and ${blocks.length - 3} more` : ''}\n`;
  }

  return `
The design contains the following text elements:

${textContent}

Ensure proper text hierarchy and typography in your implementation.`;
}

/**
 * テキストを指定された長さで切り詰める
 * @param {string} text - 元のテキスト
 * @param {number} maxLength - 最大長
 * @returns {string} 切り詰められたテキスト
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * UI要素のセクションを生成
 * @param {Object} elements - UI要素情報
 * @returns {string} UI要素の文字列
 */
function generateElementsSection(elements = {}) {
  if (!elements || !elements.summary) {
    return "No UI element information is available.";
  }

  const summary = elements.summary;
  const elementTypes = Object.entries(summary)
    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
    .join(', ');

  let mainElementsDesc = '';
  if (elements.mainElements && elements.mainElements.length > 0) {
    mainElementsDesc = elements.mainElements.map(element => {
      const position = element.position || {};
      return `- ${element.type}: positioned at x:${position.x || 0}, y:${position.y || 0}, size ${position.width || 0}x${position.height || 0}px`;
    }).join('\n');
  }

  return `
The design contains ${elements.count || 0} UI elements, including ${elementTypes}.

Key elements:
${mainElementsDesc || 'No specific key elements were identified.'}`;
}

/**
 * デザインの意図を推論する
 * @param {Object} compressedData - 圧縮された解析データ
 * @returns {string} デザイン意図の推論文
 */
function inferDesignIntent(compressedData) {
  // 色彩
  const colors = compressedData.colors || [];
  const hasLightBackground = colors.length > 0 && isLightColor(colors[0].rgb);

  // レイアウト
  const layout = compressedData.layout || {};
  const layoutType = layout.layoutType || '';

  // セクション情報を取得
  const sections = compressedData.sections || {};
  const sectionItems = sections.items || [];

  // セクションタイプをカウント
  const sectionTypes = {};
  sectionItems.forEach(section => {
    const type = section.type || 'unknown';
    sectionTypes[type] = (sectionTypes[type] || 0) + 1;
  });

  // 特定のセクションの存在を確認
  const hasHero = sectionTypes['hero'] > 0;
  const hasFeatures = sectionTypes['features'] > 0;
  const hasTestimonials = sectionTypes['testimonials'] > 0;
  const hasPricing = sectionTypes['pricing'] > 0;
  const hasContact = sectionTypes['contact'] > 0;
  const hasCta = sectionTypes['cta'] > 0;

  // 要素
  const elements = compressedData.elements || {};
  const elementSummary = elements.summary || {};
  const hasButtons = elementSummary['button'] > 0;
  const hasInputs = elementSummary['text_input'] > 0;
  const hasCards = elementSummary['card'] > 0;

  // デザイン目的の推論
  let purpose = '';
  if (hasContact || hasInputs) {
    purpose = 'user input collection';
  } else if (hasCta || (hasButtons && !hasInputs)) {
    purpose = 'call-to-action';
  } else if (hasPricing || hasFeatures) {
    purpose = 'product or service presentation';
  } else if (hasTestimonials) {
    purpose = 'building trust and credibility';
  } else if (hasCards) {
    purpose = 'content discovery';
  } else {
    purpose = 'information presentation';
  }

  // デザインスタイルの推論
  let style = '';
  if (hasLightBackground) {
    style = 'clean, minimalist';
  } else {
    style = 'bold, contrasting';
  }

  // ウェブサイトタイプの推論
  let websiteType = inferWebsiteType(sectionTypes, elementSummary);

  return `
Based on the analysis, this design appears to be for a ${websiteType} website focused on ${purpose} with a ${style} aesthetic.
The layout is designed to guide the user's attention ${getAttentionFlow(layoutType)} through the content.
${hasHero ? 'The hero section at the top establishes the main value proposition.' : ''}
${hasFeatures ? 'The features section highlights key benefits or services.' : ''}
${hasTestimonials ? 'Testimonials are used to build credibility and trust.' : ''}
${hasCta ? 'Call-to-action elements encourage user engagement and conversion.' : ''}
${hasContact ? 'The contact section facilitates direct communication with users.' : ''}

When implementing this design, focus on maintaining the visual hierarchy and ensuring that the ${purpose} aspects are emphasized.`;
}

/**
 * レイアウトタイプに基づいた注目誘導フローを取得
 * @param {string} layoutType - レイアウトタイプ
 * @returns {string} 注目誘導フローの説明
 */
function getAttentionFlow(layoutType) {
  switch (layoutType) {
    case 'vertical_scroll':
      return 'from top to bottom';
    case 'horizontal_scroll':
      return 'from left to right';
    case 'grid':
      return 'across different grid areas';
    case 'header_content_footer':
      return 'from the header through the main content to the footer';
    default:
      return 'naturally';
  }
}

/**
 * 色が明るいかどうかを判定
 * @param {string} rgbString - RGB文字列（例: 'rgb(255,255,255)'）
 * @returns {boolean} 明るい色の場合true
 */
function isLightColor(rgbString) {
  if (!rgbString || typeof rgbString !== 'string') {
    return true;
  }

  // RGB文字列から値を抽出
  const match = rgbString.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!match) {
    return true;
  }

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);

  // 輝度の計算（YIQ方式）
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

  // 輝度が128以上なら明るい色と判定
  return yiq >= 128;
}

/**
 * ウェブサイトのタイプを推論
 * @param {Object} sectionTypes - セクションタイプのカウント
 * @param {Object} elementSummary - 要素タイプのカウント
 * @returns {string} 推論されたウェブサイトタイプ
 */
function inferWebsiteType(sectionTypes, elementSummary) {
  // eコマースサイトの特徴
  if (sectionTypes['pricing'] > 0 || elementSummary['product_card'] > 0) {
    return 'e-commerce';
  }

  // ポートフォリオサイトの特徴
  if (sectionTypes['gallery'] > 0 || sectionTypes['portfolio'] > 0) {
    return 'portfolio';
  }

  // LPの特徴
  if (sectionTypes['hero'] > 0 && sectionTypes['cta'] > 0 && Object.keys(sectionTypes).length < 5) {
    return 'landing page';
  }

  // コーポレートサイトの特徴
  if (sectionTypes['about'] > 0 || sectionTypes['team'] > 0) {
    return 'corporate';
  }

  // ブログの特徴
  if (elementSummary['article'] > 0 || sectionTypes['blog'] > 0) {
    return 'blog';
  }

  // SaaSの特徴
  if (sectionTypes['features'] > 0 && sectionTypes['pricing'] > 0) {
    return 'SaaS';
  }

  // デフォルト
  return 'business';
}

// モジュールをエクスポート
module.exports = {
  generatePromptFromCompressedData,
  generateOverviewSection,
  generateColorSection,
  generateLayoutSection,
  generateTextSection,
  generateElementsSection,
  inferDesignIntent
};
