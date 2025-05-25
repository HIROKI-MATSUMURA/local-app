/**
 * 画像解析結果検証システム
 * 解析精度の測定、ベンチマーク、改善提案を行います
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析結果の品質評価クラス
 */
class AnalysisValidator {
  constructor() {
    this.benchmarkResults = [];
    this.validationHistory = [];
    
    // 期待される結果の基準値
    this.qualityThresholds = {
      colorExtraction: {
        minColors: 3,
        maxColors: 8,
        minDominantRatio: 0.1
      },
      textRecognition: {
        minConfidence: 0.7,
        minTextLength: 1
      },
      layoutAnalysis: {
        minConfidence: 0.6,
        validLayoutTypes: ['grid', 'list', 'card', 'hero', 'sidebar']
      },
      sectionDetection: {
        minSections: 1,
        maxSections: 10,
        minSectionHeight: 0.05
      },
      elementDetection: {
        minConfidence: 0.5,
        validElementTypes: ['button', 'input', 'navigation', 'card', 'image']
      }
    };
  }

  /**
   * 色抽出結果の検証
   * @param {Array} colors - 抽出された色配列
   * @param {string} imageData - 元画像データ
   * @returns {Object} 検証結果
   */
  validateColorExtraction(colors, imageData) {
    const validation = {
      score: 0,
      issues: [],
      suggestions: []
    };

    // 基本的な検証
    if (!colors || colors.length === 0) {
      validation.issues.push('色が抽出されませんでした');
      return validation;
    }

    let score = 70; // ベースライン

    // 色数の検証
    if (colors.length < this.qualityThresholds.colorExtraction.minColors) {
      validation.issues.push(`抽出された色が少なすぎます (${colors.length}色)`);
      validation.suggestions.push('K-meansのクラスター数を増やすか、サンプリング密度を上げてください');
      score -= 20;
    } else if (colors.length > this.qualityThresholds.colorExtraction.maxColors) {
      validation.issues.push(`抽出された色が多すぎます (${colors.length}色)`);
      validation.suggestions.push('類似色のマージ処理を追加してください');
      score -= 10;
    } else {
      score += 10;
    }

    // 占有率の検証
    let totalRatio = 0;
    let dominantColors = 0;
    
    colors.forEach(color => {
      if (color.ratio) {
        totalRatio += color.ratio;
        if (color.ratio >= this.qualityThresholds.colorExtraction.minDominantRatio) {
          dominantColors++;
        }
      }
    });

    if (Math.abs(totalRatio - 1.0) > 0.1) {
      validation.issues.push(`色の占有率の合計が不正確です (${totalRatio.toFixed(2)})`);
      score -= 15;
    }

    if (dominantColors === 0) {
      validation.issues.push('主要色が検出されませんでした');
      validation.suggestions.push('前処理でノイズ除去を強化してください');
      score -= 10;
    }

    // 色の多様性チェック
    const uniqueHues = this.calculateColorDiversity(colors);
    if (uniqueHues < 2) {
      validation.suggestions.push('色の多様性が低いです。画像の前処理を確認してください');
      score -= 5;
    }

    validation.score = Math.max(0, Math.min(100, score));
    return validation;
  }

  /**
   * テキスト認識結果の検証
   * @param {Object} textResult - OCR結果
   * @param {string} imageData - 元画像データ
   * @returns {Object} 検証結果
   */
  validateTextRecognition(textResult, imageData) {
    const validation = {
      score: 0,
      issues: [],
      suggestions: []
    };

    if (!textResult || !textResult.textBlocks) {
      validation.issues.push('テキスト認識結果が無効です');
      return validation;
    }

    let score = 60; // ベースライン

    // テキストブロックの信頼度検証
    let highConfidenceBlocks = 0;
    let totalConfidence = 0;
    
    textResult.textBlocks.forEach(block => {
      if (block.confidence >= this.qualityThresholds.textRecognition.minConfidence) {
        highConfidenceBlocks++;
      }
      totalConfidence += block.confidence;
    });

    const avgConfidence = textResult.textBlocks.length > 0 ? 
      totalConfidence / textResult.textBlocks.length : 0;

    if (avgConfidence < this.qualityThresholds.textRecognition.minConfidence) {
      validation.issues.push(`テキスト認識の信頼度が低いです (平均: ${avgConfidence.toFixed(2)})`);
      validation.suggestions.push('画像の前処理（コントラスト調整、ノイズ除去）を改善してください');
      score -= 20;
    } else {
      score += 15;
    }

    // テキスト長の検証
    if (textResult.text && textResult.text.trim().length < this.qualityThresholds.textRecognition.minTextLength) {
      validation.issues.push('認識されたテキストが短すぎます');
      validation.suggestions.push('OCRの前処理パラメータを調整してください');
      score -= 15;
    }

    // 位置情報の妥当性チェック
    let invalidPositions = 0;
    textResult.textBlocks.forEach(block => {
      if (!block.position || 
          block.position.width <= 0 || 
          block.position.height <= 0) {
        invalidPositions++;
      }
    });

    if (invalidPositions > 0) {
      validation.issues.push(`${invalidPositions}個のテキストブロックの位置情報が無効です`);
      score -= 10;
    }

    validation.score = Math.max(0, Math.min(100, score));
    return validation;
  }

  /**
   * レイアウト分析結果の検証
   * @param {Object} layoutResult - レイアウト分析結果
   * @param {string} imageData - 元画像データ
   * @returns {Object} 検証結果
   */
  validateLayoutAnalysis(layoutResult, imageData) {
    const validation = {
      score: 0,
      issues: [],
      suggestions: []
    };

    if (!layoutResult || !layoutResult.layoutType) {
      validation.issues.push('レイアウト分析結果が無効です');
      return validation;
    }

    let score = 65; // ベースライン

    // レイアウトタイプの妥当性
    if (!this.qualityThresholds.layoutAnalysis.validLayoutTypes.includes(layoutResult.layoutType)) {
      validation.issues.push(`未知のレイアウトタイプです: ${layoutResult.layoutType}`);
      score -= 20;
    }

    // 信頼度の検証
    if (layoutResult.confidence < this.qualityThresholds.layoutAnalysis.minConfidence) {
      validation.issues.push(`レイアウト分析の信頼度が低いです (${layoutResult.confidence})`);
      validation.suggestions.push('エッジ検出パラメータを調整するか、前処理を改善してください');
      score -= 15;
    } else {
      score += 10;
    }

    // レイアウト詳細情報の検証
    if (layoutResult.layoutDetails) {
      const details = layoutResult.layoutDetails;
      
      if (details.aspectRatio < 0.1 || details.aspectRatio > 10) {
        validation.issues.push(`画像のアスペクト比が異常です: ${details.aspectRatio}`);
        score -= 10;
      }

      if (details.significantAreas === 0) {
        validation.issues.push('有意な領域が検出されませんでした');
        validation.suggestions.push('輪郭検出の閾値を下げてください');
        score -= 10;
      }
    }

    validation.score = Math.max(0, Math.min(100, score));
    return validation;
  }

  /**
   * 総合的な解析結果の検証
   * @param {Object} analysisResult - 総合解析結果
   * @param {string} imageData - 元画像データ
   * @returns {Object} 総合検証結果
   */
  validateComprehensiveAnalysis(analysisResult, imageData) {
    const overallValidation = {
      overallScore: 0,
      componentScores: {},
      criticalIssues: [],
      recommendations: [],
      performanceMetrics: {}
    };

    if (!analysisResult || !analysisResult.success) {
      overallValidation.criticalIssues.push('解析が失敗しました');
      return overallValidation;
    }

    const data = analysisResult.data;
    const componentValidations = {};

    // 各コンポーネントの検証
    if (data.colors) {
      componentValidations.colors = this.validateColorExtraction(data.colors, imageData);
    }

    if (data.text || data.textBlocks) {
      componentValidations.text = this.validateTextRecognition({
        text: data.text,
        textBlocks: data.textBlocks
      }, imageData);
    }

    if (data.layout) {
      componentValidations.layout = this.validateLayoutAnalysis(data.layout, imageData);
    }

    // 追加検証: 要素間の整合性
    this.validateCrossComponentConsistency(data, overallValidation);

    // 総合スコアの計算
    const scores = Object.values(componentValidations).map(v => v.score);
    overallValidation.overallScore = scores.length > 0 ? 
      scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    overallValidation.componentScores = componentValidations;

    // 改善提案の統合
    Object.values(componentValidations).forEach(validation => {
      overallValidation.recommendations.push(...validation.suggestions);
    });

    return overallValidation;
  }

  /**
   * 要素間の整合性検証
   * @param {Object} data - 解析データ
   * @param {Object} validation - 検証結果オブジェクト
   */
  validateCrossComponentConsistency(data, validation) {
    // テキストと色の整合性チェック
    if (data.textBlocks && data.colors) {
      const textArea = this.calculateTextArea(data.textBlocks);
      const dominantColor = data.colors[0];
      
      if (textArea > 0.3 && dominantColor && dominantColor.role !== 'background') {
        validation.recommendations.push('テキストが多い画像では背景色の特定精度を上げることを推奨します');
      }
    }

    // レイアウトと要素の整合性チェック
    if (data.layout && data.elements) {
      const layoutType = data.layout.layoutType;
      const elementTypes = data.elements.elements ? 
        data.elements.elements.map(el => el.type) : [];

      if (layoutType === 'grid' && !elementTypes.includes('card')) {
        validation.recommendations.push('グリッドレイアウトではカード要素の検出精度を上げることを推奨します');
      }

      if (layoutType === 'list' && elementTypes.filter(t => t === 'navigation').length === 0) {
        validation.recommendations.push('リストレイアウトではナビゲーション要素の検出精度を確認してください');
      }
    }
  }

  /**
   * 色の多様性を計算
   * @param {Array} colors - 色配列
   * @returns {number} 多様性スコア
   */
  calculateColorDiversity(colors) {
    if (!colors || colors.length === 0) return 0;

    const hues = colors.map(color => {
      if (color.hex) {
        return this.hexToHsv(color.hex).h;
      }
      return 0;
    });

    // ユニークな色相の数を計算（30度の範囲で同じ色相とみなす）
    const uniqueHues = [];
    hues.forEach(hue => {
      if (!uniqueHues.some(unique => Math.abs(unique - hue) < 30)) {
        uniqueHues.push(hue);
      }
    });

    return uniqueHues.length;
  }

  /**
   * テキストブロックの総面積を計算
   * @param {Array} textBlocks - テキストブロック配列
   * @returns {number} テキストが占める面積の割合
   */
  calculateTextArea(textBlocks) {
    if (!textBlocks || textBlocks.length === 0) return 0;

    let totalTextArea = 0;
    let totalImageArea = 1; // デフォルト値

    textBlocks.forEach(block => {
      if (block.position) {
        totalTextArea += block.position.width * block.position.height;
      }
    });

    return totalTextArea / totalImageArea;
  }

  /**
   * HEXをHSVに変換
   * @param {string} hex - HEXカラーコード
   * @returns {Object} HSV値
   */
  hexToHsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    if (diff !== 0) {
      if (max === r) h = ((g - b) / diff) % 6;
      else if (max === g) h = (b - r) / diff + 2;
      else h = (r - g) / diff + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;

    const s = max === 0 ? 0 : diff / max;
    const v = max;

    return { h, s, v };
  }

  /**
   * 検証結果を保存
   * @param {Object} validationResult - 検証結果
   * @param {string} imageId - 画像ID
   */
  saveValidationResult(validationResult, imageId = null) {
    const result = {
      timestamp: new Date().toISOString(),
      imageId: imageId,
      validation: validationResult
    };

    this.validationHistory.push(result);

    // 履歴を最大100件に制限
    if (this.validationHistory.length > 100) {
      this.validationHistory.shift();
    }

    return result;
  }

  /**
   * 検証履歴からトレンド分析
   * @returns {Object} トレンド分析結果
   */
  analyzeTrends() {
    if (this.validationHistory.length < 5) {
      return { message: '分析には最低5件の履歴が必要です' };
    }

    const recentResults = this.validationHistory.slice(-20);
    
    const trends = {
      averageOverallScore: 0,
      averageComponentScores: {},
      commonIssues: {},
      performanceMetrics: {
        improving: [],
        declining: []
      }
    };

    // 平均スコアの計算
    const overallScores = recentResults.map(r => r.validation.overallScore).filter(s => s > 0);
    trends.averageOverallScore = overallScores.reduce((a, b) => a + b, 0) / overallScores.length;

    // コンポーネント別平均スコア
    const componentNames = ['colors', 'text', 'layout'];
    componentNames.forEach(component => {
      const scores = recentResults
        .map(r => r.validation.componentScores[component]?.score)
        .filter(s => s !== undefined);
      
      if (scores.length > 0) {
        trends.averageComponentScores[component] = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    });

    // よくある問題の集計
    recentResults.forEach(result => {
      if (result.validation.criticalIssues) {
        result.validation.criticalIssues.forEach(issue => {
          trends.commonIssues[issue] = (trends.commonIssues[issue] || 0) + 1;
        });
      }
    });

    return trends;
  }
}

module.exports = { AnalysisValidator };