/**
 * データユーティリティモジュール
 * 解析データの正規化と前処理を行います
 */

/**
 * データを正規化して一貫した形式に変換
 * @param {Object} rawData - Python解析から取得した生データ
 * @returns {Object} 正規化されたデータ
 */
export function normalizeData(rawData) {
  if (!rawData) return null;

  try {
    // 無効なデータをフィルタリングし、欠損値に既定値を設定
    return {
      // テキスト関連
      text: rawData.text || '',
      textBlocks: normalizeTextBlocks(rawData.textBlocks || []),

      // 色彩関連
      colors: normalizeColors(rawData.colors || []),

      // レイアウト関連
      layout: normalizeLayout(rawData.layout || {}),
      sections: normalizeSections(rawData.sections || []),

      // 要素関連
      elements: normalizeElements(getElementsArray(rawData.elements)),

      // その他
      timestamp: rawData.timestamp || new Date().toISOString(),
      success: rawData.success === true
    };
  } catch (error) {
    console.error('データ正規化エラー:', error);
    return {
      text: '',
      textBlocks: [],
      colors: [],
      layout: { layoutType: 'unknown' },
      sections: [],
      elements: [],
      timestamp: new Date().toISOString(),
      success: false
    };
  }
}

/**
 * テキストブロックを正規化
 * @param {Array} blocks - テキストブロック配列
 * @returns {Array} 正規化されたテキストブロック
 */
function normalizeTextBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];

  return blocks
    .filter(block => block && block.text && block.text.trim()) // 無効なブロックを除外
    .map(block => ({
      text: block.text.trim(),
      fontSize: block.fontSize || inferFontSize(block),
      fontWeight: block.fontWeight || 400,
      color: block.color || '#000000',
      position: normalizePosition(block.position),
      role: block.role || inferTextRole(block),
      // ユニークIDを生成
      id: block.id || `text_${Math.random().toString(36).substring(2, 11)}`
    }));
}

/**
 * フォントサイズを推測
 * @param {Object} block - テキストブロック
 * @returns {number} 推測されたフォントサイズ
 */
function inferFontSize(block) {
  if (!block || !block.position) return 16; // デフォルト

  // 位置情報から推測（高さの60%程度がフォントサイズと仮定）
  if (block.position.height) {
    return Math.max(12, Math.min(36, Math.round(block.position.height * 0.6)));
  }

  return 16; // デフォルト値
}

/**
 * テキストの役割を推測
 * @param {Object} block - テキストブロック
 * @returns {string} 推測された役割
 */
function inferTextRole(block) {
  if (!block) return 'body';

  const text = block.text || '';
  const fontSize = block.fontSize || 16;

  // 見出し判定
  if (fontSize >= 24) return 'heading';
  if (fontSize >= 18) return 'subheading';

  // ボタンテキスト判定
  if (text.length < 20 && (
    text.includes('詳細') ||
    text.includes('もっと') ||
    text.includes('お問い合わせ') ||
    text.includes('View') ||
    text.includes('→')
  )) {
    return 'button';
  }

  // リンク判定
  if (text.length < 30 && (
    text.includes('http') ||
    text.includes('.com') ||
    text.includes('.jp')
  )) {
    return 'link';
  }

  // 短いテキスト
  if (text.length < 50) return 'short_text';

  // 長いテキスト
  return 'paragraph';
}

/**
 * 色情報を正規化
 * @param {Array} colors - 色情報配列
 * @returns {Array} 正規化された色情報
 */
function normalizeColors(colors) {
  if (!Array.isArray(colors)) return [];

  return colors
    .filter(color => color && color.hex) // 無効な色を除外
    .map(color => ({
      hex: color.hex.toLowerCase(),
      rgb: color.rgb || hexToRgb(color.hex),
      ratio: color.ratio || 0,
      role: color.role || inferColorRole(color),
      // ユニークIDを生成
      id: color.id || `color_${color.hex.substring(1)}`
    }));
}

/**
 * 色の役割を推測
 * @param {Object} color - 色情報
 * @returns {string} 推測された役割
 */
function inferColorRole(color) {
  if (!color) return 'general';

  const hex = color.hex || '#000000';
  const ratio = color.ratio || 0;

  // 使用頻度が高い色は背景かベース
  if (ratio > 0.3) {
    return isLightColor(hex) ? 'background' : 'text';
  }

  // 鮮やかな色はアクセント
  if (isVividColor(hex)) {
    return 'accent';
  }

  return 'general';
}

/**
 * 明るい色かどうかを判定
 * @param {string} hex - HEX色コード
 * @returns {boolean} 明るい色かどうか
 */
function isLightColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // 輝度計算（YIQ値）
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128;
}

/**
 * 鮮やかな色かどうかを判定
 * @param {string} hex - HEX色コード
 * @returns {boolean} 鮮やかな色かどうか
 */
function isVividColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // 彩度の近似値を計算
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  // 彩度と明度で判定
  return max > 180 && (max - min) > 50;
}

/**
 * HEX色コードをRGB形式に変換
 * @param {string} hex - HEX色コード
 * @returns {string} RGB形式の色コード
 */
function hexToRgb(hex) {
  // 短縮形式（#abc）を展開形式（#aabbcc）に変換
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  if (!result) return `rgb(0,0,0)`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgb(${r},${g},${b})`;
}

/**
 * レイアウト情報を正規化
 * @param {Object} layout - レイアウト情報
 * @returns {Object} 正規化されたレイアウト情報
 */
function normalizeLayout(layout) {
  if (!layout) return { layoutType: 'unknown' };

  return {
    layoutType: layout.layoutType || 'standard',
    confidence: layout.confidence || 1.0,
    width: layout.width || 1200,
    height: layout.height || 800,
    // レイアウト詳細情報
    details: layout.layoutDetails || layout.details || {},
    // 入れ子を避けるため一階層に展開
    ...layout
  };
}

/**
 * セクション情報を正規化
 * @param {Array} sections - セクション配列
 * @returns {Array} 正規化されたセクション配列
 */
function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];

  return sections
    .filter(section => section && section.position) // 無効なセクションを除外
    .map((section, index) => ({
      id: section.id || `section_${index + 1}`,
      section_type: standardizeSectionType(section.section_type || 'content'),
      position: normalizePosition(section.position),
      color: section.color || { hex: '#ffffff' },
      // セクション内の要素を正規化
      elements: section.elements || []
    }));
}

/**
 * セクションタイプを標準化
 * @param {string} type - セクションタイプ
 * @returns {string} 標準化されたタイプ
 */
function standardizeSectionType(type) {
  if (!type) return 'content';

  const typeMap = {
    'header': 'header',
    'head': 'header',
    'navbar': 'header',
    'navigation': 'header',
    'nav': 'header',
    'hero': 'hero',
    'main_visual': 'hero',
    'banner': 'hero',
    'footer': 'footer',
    'foot': 'footer',
    'contact': 'contact',
    'form': 'contact',
    'feature': 'feature',
    'service': 'feature',
    'about': 'about',
    'company': 'about',
    'blog': 'blog',
    'news': 'blog',
    'article': 'blog',
    'gallery': 'gallery',
    'portfolio': 'gallery',
    'works': 'gallery'
  };

  const normalizedType = type.toLowerCase();
  return typeMap[normalizedType] || 'content';
}

/**
 * UI要素を正規化
 * @param {Array} elements - UI要素配列
 * @returns {Array} 正規化された要素配列
 */
function normalizeElements(elements) {
  if (!Array.isArray(elements)) return [];

  return elements
    .filter(element => element && element.position) // 無効な要素を除外
    .map((element, index) => ({
      id: element.id || `element_${index + 1}`,
      type: standardizeElementType(element.type || 'unknown'),
      position: normalizePosition(element.position),
      // 要素タイプに応じた追加情報
      ...inferElementProperties(element)
    }));
}

/**
 * 要素タイプを標準化
 * @param {string} type - 要素タイプ
 * @returns {string} 標準化されたタイプ
 */
function standardizeElementType(type) {
  if (!type) return 'unknown';

  const typeMap = {
    'img': 'image',
    'picture': 'image',
    'image': 'image',
    'button': 'button',
    'btn': 'button',
    'card': 'card',
    'input': 'input',
    'text_input': 'input',
    'textarea': 'textarea',
    'menu': 'navigation',
    'nav': 'navigation',
    'navigation': 'navigation',
    'list': 'list',
    'icon': 'icon',
    'form': 'form'
  };

  const normalizedType = type.toLowerCase();
  return typeMap[normalizedType] || normalizedType;
}

/**
 * 要素タイプに応じた追加プロパティを推測
 * @param {Object} element - 要素情報
 * @returns {Object} 推測されたプロパティ
 */
function inferElementProperties(element) {
  if (!element) return {};

  const type = element.type || 'unknown';
  const position = element.position || {};

  const props = {};

  switch (standardizeElementType(type)) {
    case 'image':
      props.isBackground = position.width > 800 || position.height > 600;
      props.aspectRatio = position.width && position.height ?
        `${position.width}:${position.height}` : '16:9';
      break;
    case 'button':
      props.isRounded = true; // ほとんどのボタンは角丸
      props.isPrimary = true; // 仮定として主要ボタン
      break;
    case 'card':
      props.hasImage = true; // 仮定として画像付きカード
      props.hasTitle = true;
      props.aspectRatio = '4:3'; // 一般的なカード比率
      break;
  }

  return props;
}

/**
 * 位置情報を正規化
 * @param {Object} position - 位置情報
 * @returns {Object} 正規化された位置情報
 */
function normalizePosition(position) {
  if (!position) return { x: 0, y: 0, width: 100, height: 50 };

  return {
    x: Math.round(position.x || 0),
    y: Math.round(position.y || 0),
    width: Math.round(position.width || 100),
    height: Math.round(position.height || 50),
    zIndex: position.zIndex || 0
  };
}

/**
 * elements配列を取得
 * @param {Object|Array} elements - 要素情報
 * @returns {Array} 要素配列
 */
function getElementsArray(elements) {
  if (!elements) return [];

  // 既に配列の場合はそのまま返す
  if (Array.isArray(elements)) {
    return elements;
  }

  // elementsがオブジェクトでelements.elementsが配列の場合
  if (elements.elements && Array.isArray(elements.elements)) {
    return elements.elements;
  }

  // elementsがオブジェクトの場合、それを配列の唯一の要素として返す
  return [elements];
}
