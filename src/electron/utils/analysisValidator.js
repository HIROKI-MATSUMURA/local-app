/**
 * 解析結果検証・補正ユーティリティ
 * 画像解析結果の品質保証と自動補正を行う
 */

class AnalysisValidator {
  constructor(options = {}) {
    this.config = {
      // 検証閾値
      minColorCount: options.minColorCount || 3,
      maxColorCount: options.maxColorCount || 20,
      minTextBlocks: options.minTextBlocks || 1,
      minLayoutElements: options.minLayoutElements || 2,

      // 信頼度閾値
      colorConfidenceThreshold: options.colorConfidenceThreshold || 0.7,
      layoutConfidenceThreshold: options.layoutConfidenceThreshold || 0.6,
      textConfidenceThreshold: options.textConfidenceThreshold || 0.8,

      // 補正設定
      enableAutoCorrection: options.enableAutoCorrection !== false,
      enableFallbackGeneration: options.enableFallbackGeneration !== false,

      // デバッグ設定
      debug: options.debug || false
    };

    // 検証ルール
    this.validationRules = this.initializeValidationRules();
  }

  /**
   * メイン検証関数
   * @param {Object} analysisResult - 解析結果
   * @param {string} imageType - 画像タイプ
   * @returns {Promise<Object>} 検証・補正結果
   */
  async validateAndCorrect(analysisResult, imageType = 'PC') {
    try {
      this.log(`解析結果検証開始: ${imageType}`);

      const validationReport = {
        isValid: true,
        errors: [],
        warnings: [],
        corrections: [],
        confidenceScore: 0,
        originalResult: analysisResult,
        correctedResult: null
      };

      // 1. 基本構造検証
      const structureValidation = this.validateStructure(analysisResult);
      this.mergeValidationResult(validationReport, structureValidation);

      // 2. 色彩解析検証
      const colorValidation = this.validateColors(analysisResult.colors);
      this.mergeValidationResult(validationReport, colorValidation);

      // 3. レイアウト解析検証
      const layoutValidation = this.validateLayout(analysisResult.layout || analysisResult.elements);
      this.mergeValidationResult(validationReport, layoutValidation);

      // 4. テキスト解析検証
      const textValidation = this.validateText(analysisResult.textBlocks || []);
      this.mergeValidationResult(validationReport, textValidation);

      // 5. 総合信頼度計算
      validationReport.confidenceScore = this.calculateOverallConfidence(validationReport);

      // 6. 自動補正実行
      if (this.config.enableAutoCorrection && validationReport.errors.length > 0) {
        const correctedResult = await this.performAutoCorrection(analysisResult, validationReport);
        validationReport.correctedResult = correctedResult;
        validationReport.corrections.push('自動補正を実行しました');
      }

      // 7. フォールバック生成
      if (validationReport.confidenceScore < 0.5 && this.config.enableFallbackGeneration) {
        const fallbackResult = this.generateFallbackResult(analysisResult, imageType);
        validationReport.correctedResult = fallbackResult;
        validationReport.corrections.push('フォールバック結果を生成しました');
      }

      this.log(`検証完了 - 信頼度: ${validationReport.confidenceScore.toFixed(2)}`);
      return validationReport;

    } catch (error) {
      console.error('解析結果検証エラー:', error);
      return {
        isValid: false,
        errors: [error.message],
        warnings: [],
        corrections: [],
        confidenceScore: 0,
        originalResult: analysisResult,
        correctedResult: null
      };
    }
  }

  /**
   * 基本構造検証
   * @param {Object} result
   * @returns {Object}
   */
  validateStructure(result) {
    const validation = { errors: [], warnings: [], confidence: 1.0 };

    if (!result || typeof result !== 'object') {
      validation.errors.push('解析結果が無効な形式です');
      validation.confidence = 0;
      return validation;
    }

    // 必須プロパティの存在確認
    const requiredProperties = ['colors', 'textBlocks', 'elements'];
    const missingProperties = requiredProperties.filter(prop => !result.hasOwnProperty(prop));

    if (missingProperties.length > 0) {
      validation.warnings.push(`必須プロパティが不足: ${missingProperties.join(', ')}`);
      validation.confidence *= 0.8;
    }

    // データ型検証
    if (result.colors && !Array.isArray(result.colors)) {
      validation.errors.push('colors プロパティが配列ではありません');
      validation.confidence *= 0.5;
    }

    if (result.textBlocks && !Array.isArray(result.textBlocks)) {
      validation.errors.push('textBlocks プロパティが配列ではありません');
      validation.confidence *= 0.5;
    }

    return validation;
  }

  /**
   * 色彩解析検証
   * @param {Array} colors
   * @returns {Object}
   */
  validateColors(colors) {
    const validation = { errors: [], warnings: [], confidence: 1.0 };

    if (!Array.isArray(colors)) {
      validation.errors.push('色彩データが配列ではありません');
      validation.confidence = 0;
      return validation;
    }

    // 色数の妥当性チェック
    if (colors.length < this.config.minColorCount) {
      validation.warnings.push(`検出色数が少なすぎます: ${colors.length}色`);
      validation.confidence *= 0.7;
    }

    if (colors.length > this.config.maxColorCount) {
      validation.warnings.push(`検出色数が多すぎます: ${colors.length}色`);
      validation.confidence *= 0.8;
    }

    // 色データの形式検証
    const invalidColors = colors.filter(color => !this.isValidColorFormat(color));
    if (invalidColors.length > 0) {
      validation.errors.push(`無効な色データが${invalidColors.length}個あります`);
      validation.confidence *= 0.6;
    }

    // 色の多様性チェック
    const uniqueColors = this.getUniqueColors(colors);
    if (uniqueColors.length < colors.length * 0.7) {
      validation.warnings.push('重複する色が多く検出されています');
      validation.confidence *= 0.9;
    }

    return validation;
  }

  /**
   * レイアウト解析検証
   * @param {Object|Array} layout
   * @returns {Object}
   */
  validateLayout(layout) {
    const validation = { errors: [], warnings: [], confidence: 1.0 };

    if (!layout) {
      validation.errors.push('レイアウトデータが存在しません');
      validation.confidence = 0;
      return validation;
    }

    // 要素数チェック
    const elements = Array.isArray(layout) ? layout : (layout.elements || []);
    if (elements.length < this.config.minLayoutElements) {
      validation.warnings.push(`レイアウト要素が少なすぎます: ${elements.length}個`);
      validation.confidence *= 0.7;
    }

    // 要素の位置情報検証
    const elementsWithoutPosition = elements.filter(el => !this.hasValidPosition(el));
    if (elementsWithoutPosition.length > 0) {
      validation.warnings.push(`位置情報のない要素が${elementsWithoutPosition.length}個あります`);
      validation.confidence *= 0.8;
    }

    // 重複要素チェック
    const duplicateElements = this.findDuplicateElements(elements);
    if (duplicateElements.length > 0) {
      validation.warnings.push(`重複する要素が${duplicateElements.length}個検出されました`);
      validation.confidence *= 0.9;
    }

    return validation;
  }

  /**
   * テキスト解析検証
   * @param {Array} textBlocks
   * @returns {Object}
   */
  validateText(textBlocks) {
    const validation = { errors: [], warnings: [], confidence: 1.0 };

    if (!Array.isArray(textBlocks)) {
      validation.errors.push('テキストデータが配列ではありません');
      validation.confidence = 0;
      return validation;
    }

    // テキストブロック数チェック
    if (textBlocks.length < this.config.minTextBlocks) {
      validation.warnings.push(`テキストブロックが少なすぎます: ${textBlocks.length}個`);
      validation.confidence *= 0.8;
    }

    // テキスト内容の妥当性チェック
    const emptyTextBlocks = textBlocks.filter(block => !block.text || block.text.trim() === '');
    if (emptyTextBlocks.length > 0) {
      validation.warnings.push(`空のテキストブロックが${emptyTextBlocks.length}個あります`);
      validation.confidence *= 0.9;
    }

    // フォント情報の検証
    const blocksWithoutFont = textBlocks.filter(block => !block.fontSize && !block.fontFamily);
    if (blocksWithoutFont.length > textBlocks.length * 0.5) {
      validation.warnings.push('フォント情報が不足しているテキストブロックが多数あります');
      validation.confidence *= 0.8;
    }

    return validation;
  }

  /**
   * 自動補正実行
   * @param {Object} originalResult
   * @param {Object} validationReport
   * @returns {Promise<Object>}
   */
  async performAutoCorrection(originalResult, validationReport) {
    const correctedResult = JSON.parse(JSON.stringify(originalResult));

    try {
      // 色彩データの補正
      if (correctedResult.colors) {
        correctedResult.colors = this.correctColors(correctedResult.colors);
      }

      // レイアウトデータの補正
      if (correctedResult.elements || correctedResult.layout) {
        const elements = correctedResult.elements || correctedResult.layout;
        correctedResult.elements = this.correctLayout(elements);
      }

      // テキストデータの補正
      if (correctedResult.textBlocks) {
        correctedResult.textBlocks = this.correctTextBlocks(correctedResult.textBlocks);
      }

      this.log('自動補正が完了しました');
      return correctedResult;

    } catch (error) {
      console.error('自動補正エラー:', error);
      return originalResult;
    }
  }

  /**
   * 色彩データ補正
   * @param {Array} colors
   * @returns {Array}
   */
  correctColors(colors) {
    if (!Array.isArray(colors)) return [];

    // 無効な色データを除去
    let validColors = colors.filter(color => this.isValidColorFormat(color));

    // 重複色を除去
    validColors = this.getUniqueColors(validColors);

    // 色数が少ない場合は基本色を追加
    if (validColors.length < this.config.minColorCount) {
      const defaultColors = [
        { hex: '#FFFFFF', rgb: [255, 255, 255] },
        { hex: '#000000', rgb: [0, 0, 0] },
        { hex: '#333333', rgb: [51, 51, 51] }
      ];

      defaultColors.forEach(defaultColor => {
        if (!validColors.some(c => c.hex === defaultColor.hex)) {
          validColors.push(defaultColor);
        }
      });
    }

    return validColors.slice(0, this.config.maxColorCount);
  }

  /**
   * レイアウトデータ補正
   * @param {Array} elements
   * @returns {Array}
   */
  correctLayout(elements) {
    if (!Array.isArray(elements)) return [];

    return elements
      .filter(el => el && typeof el === 'object')
      .map(el => {
        // 位置情報の補正
        if (!this.hasValidPosition(el)) {
          el.x = el.x || 0;
          el.y = el.y || 0;
          el.width = el.width || 100;
          el.height = el.height || 50;
        }

        // タイプ情報の補正
        if (!el.type) {
          el.type = 'unknown';
        }

        return el;
      });
  }

  /**
   * テキストブロック補正
   * @param {Array} textBlocks
   * @returns {Array}
   */
  correctTextBlocks(textBlocks) {
    if (!Array.isArray(textBlocks)) return [];

    return textBlocks
      .filter(block => block && block.text && block.text.trim() !== '')
      .map(block => {
        // フォント情報の補正
        if (!block.fontSize) {
          block.fontSize = 16; // デフォルトフォントサイズ
        }

        if (!block.fontFamily) {
          block.fontFamily = 'Arial, sans-serif'; // デフォルトフォント
        }

        return block;
      });
  }

  /**
   * フォールバック結果生成
   * @param {Object} originalResult
   * @param {string} imageType
   * @returns {Object}
   */
  generateFallbackResult(originalResult, imageType) {
    const fallback = {
      colors: [
        { hex: '#FFFFFF', rgb: [255, 255, 255] },
        { hex: '#000000', rgb: [0, 0, 0] },
        { hex: '#333333', rgb: [51, 51, 51] },
        { hex: '#007BFF', rgb: [0, 123, 255] }
      ],
      textBlocks: [
        {
          text: 'Sample Text',
          fontSize: 16,
          fontFamily: 'Arial, sans-serif',
          x: 0,
          y: 0
        }
      ],
      elements: [
        {
          type: 'container',
          x: 0,
          y: 0,
          width: imageType === 'SP' ? 375 : 1200,
          height: imageType === 'SP' ? 600 : 800
        }
      ],
      layout: {
        type: 'standard',
        hasLayout: true
      },
      fallback: true
    };

    // 元の結果から使用可能なデータを保持
    if (originalResult.colors && Array.isArray(originalResult.colors) && originalResult.colors.length > 0) {
      fallback.colors = [...originalResult.colors, ...fallback.colors].slice(0, 10);
    }

    return fallback;
  }

  /**
   * ヘルパーメソッド群
   */
  isValidColorFormat(color) {
    return color &&
      typeof color === 'object' &&
      color.hex &&
      /^#[0-9A-Fa-f]{6}$/.test(color.hex);
  }

  getUniqueColors(colors) {
    const seen = new Set();
    return colors.filter(color => {
      if (seen.has(color.hex)) {
        return false;
      }
      seen.add(color.hex);
      return true;
    });
  }

  hasValidPosition(element) {
    return element &&
      typeof element.x === 'number' &&
      typeof element.y === 'number' &&
      typeof element.width === 'number' &&
      typeof element.height === 'number';
  }

  findDuplicateElements(elements) {
    const duplicates = [];
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        if (this.areElementsSimilar(elements[i], elements[j])) {
          duplicates.push(elements[j]);
        }
      }
    }
    return duplicates;
  }

  areElementsSimilar(el1, el2) {
    return el1.type === el2.type &&
      Math.abs(el1.x - el2.x) < 10 &&
      Math.abs(el1.y - el2.y) < 10 &&
      Math.abs(el1.width - el2.width) < 20 &&
      Math.abs(el1.height - el2.height) < 20;
  }

  calculateOverallConfidence(validationReport) {
    const weights = {
      structure: 0.3,
      colors: 0.25,
      layout: 0.25,
      text: 0.2
    };

    // エラーがある場合は大幅に信頼度を下げる
    if (validationReport.errors.length > 0) {
      return Math.max(0.1, 0.5 - (validationReport.errors.length * 0.1));
    }

    // 警告の数に応じて信頼度を調整
    const warningPenalty = validationReport.warnings.length * 0.05;
    return Math.max(0.1, 1.0 - warningPenalty);
  }

  mergeValidationResult(report, validation) {
    report.errors.push(...validation.errors);
    report.warnings.push(...validation.warnings);
    if (validation.errors.length > 0) {
      report.isValid = false;
    }
  }

  initializeValidationRules() {
    return {
      colors: {
        minCount: this.config.minColorCount,
        maxCount: this.config.maxColorCount,
        requiredFormat: /^#[0-9A-Fa-f]{6}$/
      },
      text: {
        minBlocks: this.config.minTextBlocks,
        requiredProperties: ['text']
      },
      layout: {
        minElements: this.config.minLayoutElements,
        requiredProperties: ['x', 'y', 'width', 'height']
      }
    };
  }

  log(message) {
    if (this.config.debug) {
      console.log(`[AnalysisValidator] ${message}`);
    }
  }
}

// シングルトンインスタンス
const analysisValidator = new AnalysisValidator({
  debug: true // 常にデバッグモードを有効に
});

// エクスポート
module.exports = {
  AnalysisValidator,
  analysisValidator,

  // 便利関数
  validateAndCorrect: (analysisResult, imageType) =>
    analysisValidator.validateAndCorrect(analysisResult, imageType)
};
