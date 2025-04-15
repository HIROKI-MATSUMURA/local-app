/**
 * 画像解析モジュール
 * 画像要素の分析と最適化提案を行います
 */

import { generateAltTextCandidates } from './textAnalyzer.js';

/**
 * 画像要素の分析
 * @param {Array} imageElements - 画像要素の配列
 * @param {Object} context - 解析コンテキスト（テキストブロックなど）
 * @returns {Object} 画像分析結果
 */
function analyzeImages(imageElements, context = {}) {
  try {
    if (!Array.isArray(imageElements) || imageElements.length === 0) {
      return { images: [] };
    }

    console.log(`画像要素 ${imageElements.length} 個の分析を開始`);

    // 画像要素を分析
    const analyzedImages = imageElements.map(image => {
      // 基本プロパティ
      const result = {
        id: image.id || generateImageId(),
        position: image.position || {},
        size: {
          width: image.position?.width || 0,
          height: image.position?.height || 0,
        },
        aspectRatio: calculateAspectRatio(image.position),
        src: image.src || '',
        isBackground: image.isBackground || false,
        role: determineImageRole(image, context)
      };

      // 画像タイプを推測
      result.type = detectImageType(image, context);

      // 最適化提案
      result.optimizations = generateOptimizationSuggestions(image);

      // alt候補を生成（周辺テキストから）
      if (context.textBlocks && Array.isArray(context.textBlocks)) {
        result.altText = generateAltTextCandidates(image, context.textBlocks);
      }

      return result;
    });

    return {
      images: analyzedImages,
      totalCount: analyzedImages.length,
      backgroundImages: analyzedImages.filter(img => img.isBackground).length,
      contentImages: analyzedImages.filter(img => !img.isBackground).length
    };
  } catch (error) {
    console.error('画像解析エラー:', error);
    return { images: [] };
  }
}

/**
 * 画像の役割を判定
 * @param {Object} image - 画像要素
 * @param {Object} context - コンテキスト
 * @returns {string} 画像の役割
 */
function determineImageRole(image, context = {}) {
  // 画像のサイズや位置から役割を推測
  if (image.position) {
    const { width, height, x, y } = image.position;

    // ロゴの可能性
    if ((width < 200 && height < 100) && y < 150) {
      return 'logo';
    }

    // ヒーローイメージの可能性
    if (width > 800 && y < 600) {
      return 'hero';
    }

    // アイコンの可能性
    if (width < 50 && height < 50) {
      return 'icon';
    }
  }

  // デフォルト
  return 'content';
}

/**
 * 画像タイプを検出
 * @param {Object} image - 画像要素
 * @param {Object} context - コンテキスト
 * @returns {string} 画像タイプ
 */
function detectImageType(image, context = {}) {
  // 拡張子からタイプを推測
  if (image.src) {
    const src = image.src.toLowerCase();
    if (src.endsWith('.jpg') || src.endsWith('.jpeg')) {
      return 'jpeg';
    } else if (src.endsWith('.png')) {
      return 'png';
    } else if (src.endsWith('.svg')) {
      return 'svg';
    } else if (src.endsWith('.gif')) {
      return 'gif';
    } else if (src.endsWith('.webp')) {
      return 'webp';
    }
  }

  // サイズからタイプを推測
  if (image.position) {
    const { width, height } = image.position;

    // 小さい画像はアイコンやロゴの可能性が高い
    if (width < 100 && height < 100) {
      return 'icon';
    }
  }

  // デフォルト
  return 'unknown';
}

/**
 * 最適化提案を生成
 * @param {Object} image - 画像要素
 * @returns {Array} 最適化提案リスト
 */
function generateOptimizationSuggestions(image) {
  const suggestions = [];

  // 画像サイズに関する提案
  if (image.position) {
    const { width, height } = image.position;

    // 大きな画像は最適化の余地あり
    if (width > 1000 || height > 1000) {
      suggestions.push({
        type: 'resize',
        description: '画像サイズが大きいため、適切なサイズに縮小することを検討してください。'
      });
    }

    // 縦横比維持の提案
    suggestions.push({
      type: 'aspect-ratio',
      description: `width="${width}" height="${height}" 属性を設定し、CLS対策をしてください。`
    });
  }

  // 遅延読み込みの提案
  suggestions.push({
    type: 'lazy-loading',
    description: 'viewport下部の画像には loading="lazy" 属性を設定してください。'
  });

  return suggestions;
}

/**
 * アスペクト比を計算
 * @param {Object} position - 位置情報
 * @returns {string} アスペクト比
 */
function calculateAspectRatio(position) {
  if (!position || !position.width || !position.height) {
    return 'unknown';
  }

  const { width, height } = position;
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);

  return `${width / divisor}:${height / divisor}`;
}

/**
 * 画像IDを生成
 * @returns {string} ユニークID
 */
function generateImageId() {
  return `img_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// モジュールをエクスポート
export {
  analyzeImages,
  determineImageRole
};
