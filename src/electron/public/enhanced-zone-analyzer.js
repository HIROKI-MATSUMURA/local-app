/**
 * 🚀 Phase 1.5: 改善型カード内ゾーン分析システム
 * SP特化型アルゴリズム + テキスト要素高精度分析 + 動的密度調整
 */

// 🆕 Phase 1.5: 改善型ゾーン分析システム設定
const ENHANCED_ZONE_CONFIG = {
  // デバイス別しきい値設定
  device_thresholds: {
    sp: {
      visual_zone: { minArea: 500, aspectRatio: [0.5, 3.0] },
      title_zone: { textLength: [3, 50], fontSize: [12, 32] },
      metadata_zone: { textLength: [5, 30] },
      description_zone: { textLength: [20, 200] },
      action_zone: { minArea: 100, aspectRatio: [1.5, 8.0] }
    },
    pc: {
      visual_zone: { minArea: 3000, aspectRatio: [0.5, 3.0] },
      title_zone: { textLength: [5, 100], fontSize: [14, 48] },
      metadata_zone: { textLength: [10, 50] },
      description_zone: { textLength: [50, 500] },
      action_zone: { minArea: 500, aspectRatio: [1.5, 8.0] }
    }
  },

  // 要素タイプ優先度マトリックス
  type_priority_matrix: {
    visual_zone: {
      'image': { priority: 3, confidence: 0.95 },
      'card': { priority: 3, confidence: 0.9 },
      'content_section': { priority: 2, confidence: 0.7, condition: 'hasLargeArea' }
    },
    title_zone: {
      'text': { priority: 3, confidence: 0.9, condition: 'isShortText' },
      'content_section': { priority: 2, confidence: 0.8, condition: 'isShortText' }
    },
    description_zone: {
      'content_section': { priority: 3, confidence: 0.85, condition: 'isLongText' },
      'text': { priority: 2, confidence: 0.75, condition: 'isLongText' }
    },
    action_zone: {
      'button': { priority: 3, confidence: 0.95 },
      'card': { priority: 2, confidence: 0.7, condition: 'isSmallCard' }
    }
  },

  // テキスト分析パターン
  text_analysis_patterns: {
    title: {
      length: [3, 50],
      patterns: [
        /^[A-Za-z\u3042-\u3096\u30a1-\u30f6\u4e00-\u9faf\s]{1,50}$/,
        /^[\w\s]{1,50}$/
      ],
      exclusions: [/。|です|ます/, /\d{4}[-\/]\d{1,2}/],
      confidence: 0.85
    },
    metadata: {
      length: [5, 30],
      patterns: [
        /\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日]?/,
        /\d{1,2}[-\/月]\d{1,2}[日]?/,
        /20\d{2}年/,
        /カテゴリ|タグ|投稿者/
      ],
      confidence: 0.9
    },
    description: {
      length: [20, 500],
      patterns: [
        /。.+。/,
        /です。|ます。|した。/,
        /ここにテキストが/
      ],
      confidence: 0.8
    }
  },

  // 密度戦略設定
  density_strategies: {
    high_density: { threshold: 20, zoneCount: 5, algorithm: 'fine_grained', confidenceBoost: 0.1 },
    medium_density: { threshold: 8, zoneCount: 4, algorithm: 'standard', confidenceBoost: 0.05 },
    low_density: { threshold: 3, zoneCount: 3, algorithm: 'merge_sparse', confidenceBoost: 0 },
    minimal_density: { threshold: 0, zoneCount: 1, algorithm: 'single_zone', confidenceBoost: -0.1 }
  }
};

/**
 * 🧠 テキスト要素高精度分析
 */
const analyzeTextElement = (element) => {
  if (!element.properties?.textContent) return null;

  const text = element.properties.textContent.trim();
  const analysisResult = {
    originalText: text,
    normalizedText: text.replace(/\s+/g, ' '),
    length: text.length,
    detectedType: null,
    confidence: 0.5,
    reasons: []
  };

  // パターンマッチング実行
  for (const [type, config] of Object.entries(ENHANCED_ZONE_CONFIG.text_analysis_patterns)) {
    const score = calculateTextTypeScore(text, config);
    if (score.confidence > analysisResult.confidence) {
      analysisResult.detectedType = type;
      analysisResult.confidence = score.confidence;
      analysisResult.reasons = score.reasons;
    }
  }

  return analysisResult;
};

/**
 * 📊 テキストタイプスコア計算
 */
const calculateTextTypeScore = (text, config) => {
  let confidence = 0.5;
  const reasons = [];

  // 長さチェック
  const [minLength, maxLength] = config.length;
  if (text.length >= minLength && text.length <= maxLength) {
    confidence += 0.2;
    reasons.push(`length_match:${text.length}`);
  }

  // パターンマッチング
  if (config.patterns) {
    const matchedPatterns = config.patterns.filter(pattern => pattern.test(text));
    if (matchedPatterns.length > 0) {
      confidence += 0.3 * (matchedPatterns.length / config.patterns.length);
      reasons.push(`pattern_match:${matchedPatterns.length}`);
    }
  }

  // 除外パターンチェック
  if (config.exclusions) {
    const excludedPatterns = config.exclusions.filter(pattern => pattern.test(text));
    if (excludedPatterns.length > 0) {
      confidence -= 0.2;
      reasons.push(`exclusion_match:${excludedPatterns.length}`);
    }
  }

  return {
    confidence: Math.max(0.1, Math.min(0.95, confidence)),
    reasons
  };
};

/**
 * 🎯 要素タイプ条件評価
 */
const evaluateTypeCondition = (element, condition, deviceType) => {
  const thresholds = ENHANCED_ZONE_CONFIG.device_thresholds[deviceType];

  switch (condition) {
    case 'hasLargeArea':
      return element.properties?.area > thresholds.visual_zone.minArea;
    case 'isShortText':
      return element.properties?.textContent?.length <= thresholds.title_zone.textLength[1];
    case 'isLongText':
      return element.properties?.textContent?.length > thresholds.description_zone.textLength[0];
    case 'isSmallCard':
      return element.properties?.area < thresholds.action_zone.minArea * 2;
    default:
      return true;
  }
};

/**
 * 📈 要素密度分析
 */
const analyzeDensityPattern = (cardGroup) => {
  const { elements, bounds } = cardGroup;
  const cardArea = bounds.width * bounds.height;
  const elementCount = elements.length;

  const density = elementCount / (cardArea / 10000); // 要素数/万px²

  let recommendation = 'minimal_density';
  if (elementCount >= 20) recommendation = 'high_density';
  else if (elementCount >= 8) recommendation = 'medium_density';
  else if (elementCount >= 3) recommendation = 'low_density';

  return {
    density,
    elementCount,
    cardArea,
    recommendation,
    strategy: ENHANCED_ZONE_CONFIG.density_strategies[recommendation]
  };
};

/**
 * 🚀 Phase 1.5: 改善型ゾーン分析エンジン
 * @param {Array} elements - カード内要素
 * @param {Object} cardBounds - カード境界
 * @param {Object} imageInfo - 画像情報
 * @returns {Object} 改善されたゾーン分析結果
 */
const performEnhancedZoneAnalysis = (elements, cardBounds, imageInfo) => {
  console.log(`🔍 改善型ゾーン分析開始: ${elements.length}個の要素を処理`);

  // 1. デバイス・密度分析
  const deviceType = imageInfo.deviceType || 'pc';
  const densityPattern = analyzeDensityPattern({ elements, bounds: cardBounds });
  const thresholds = ENHANCED_ZONE_CONFIG.device_thresholds[deviceType];
  const strategy = densityPattern.strategy;

  console.log(`📊 分析設定: ${deviceType}デバイス、${densityPattern.recommendation}密度、${elements.length}要素`);

  // 2. 要素分析・ゾーン割り当て
  const zones = {};
  const cardHeight = cardBounds.height;

  elements.forEach(element => {
    const relativeY = (element.position.y - cardBounds.y) / cardHeight;
    const elementArea = element.position.width * element.position.height;

    let zoneType = 'unknown';
    let confidence = 0.5;
    let analysisMethod = 'position_based';

    // 🆕 Step 1: 要素タイプ優先判定
    const typeMatrix = ENHANCED_ZONE_CONFIG.type_priority_matrix;
    let bestTypeMatch = null;
    let highestPriority = 0;

    for (const [zoneTypeName, typeConfigs] of Object.entries(typeMatrix)) {
      const typeConfig = typeConfigs[element.type];
      if (typeConfig && typeConfig.priority > highestPriority) {
        const conditionMet = !typeConfig.condition || evaluateTypeCondition(element, typeConfig.condition, deviceType);
        if (conditionMet) {
          bestTypeMatch = { zoneType: zoneTypeName, config: typeConfig };
          highestPriority = typeConfig.priority;
        }
      }
    }

    if (bestTypeMatch) {
      zoneType = bestTypeMatch.zoneType;
      confidence = bestTypeMatch.config.confidence + (strategy.confidenceBoost || 0);
      analysisMethod = 'type_priority';
    }

    // 🆕 Step 2: テキスト要素高精度分析
    if (element.properties?.textContent && (zoneType === 'unknown' || bestTypeMatch?.config.priority < 3)) {
      const textAnalysis = analyzeTextElement(element);
      if (textAnalysis && textAnalysis.confidence > confidence) {
        zoneType = textAnalysis.detectedType + '_zone';
        confidence = textAnalysis.confidence + (strategy.confidenceBoost || 0);
        analysisMethod = 'text_pattern';
        console.log(`  📝 テキスト分析: "${textAnalysis.originalText.substring(0, 20)}..." → ${zoneType} (${textAnalysis.confidence.toFixed(2)})`);
      }
    }

    // 🆕 Step 3: SP/PC別位置ベース補正
    if (zoneType === 'unknown') {
      if (deviceType === 'sp') {
        // SP特化型判定
        if (relativeY < 0.3 && elementArea > thresholds.visual_zone.minArea) {
          zoneType = 'visual_zone';
          confidence = 0.7;
          analysisMethod = 'sp_position';
        } else if (relativeY > 0.7) {
          if (element.type === 'button' || elementArea > thresholds.action_zone.minArea) {
            zoneType = 'action_zone';
            confidence = 0.6;
            analysisMethod = 'sp_position';
          } else if (element.type === 'content_section') {
            zoneType = 'description_zone';
            confidence = 0.6;
            analysisMethod = 'sp_fallback';
          }
        } else if (element.type === 'content_section' || element.type === 'text') {
          zoneType = 'title_zone';
          confidence = 0.5;
          analysisMethod = 'sp_fallback';
        }
      } else {
        // PC従来ロジック
        if (relativeY < 0.4) {
          if (elementArea > thresholds.visual_zone.minArea) {
            zoneType = 'visual_zone';
            confidence = 0.85;
          } else if (element.properties?.textContent) {
            zoneType = 'title_zone';
            confidence = 0.75;
          }
        } else if (relativeY < 0.7) {
          if (element.properties?.textContent) {
            zoneType = element.properties.textContent.length < 30 ? 'title_zone' : 'metadata_zone';
            confidence = 0.7;
          }
        } else {
          if (element.properties?.textContent) {
            zoneType = 'description_zone';
            confidence = 0.75;
          }
        }
        analysisMethod = 'pc_position';
      }
    }

    // ゾーン統合
    if (zones[zoneType]) {
      zones[zoneType].elements.push(element);
      zones[zoneType].confidence = Math.max(zones[zoneType].confidence, confidence);
      zones[zoneType].methods.add(analysisMethod);
    } else {
      zones[zoneType] = {
        type: zoneType,
        elements: [element],
        confidence: confidence,
        methods: new Set([analysisMethod]),
        bounds: { ...element.position }
      };
    }

    console.log(`  📍 要素[${element.type}]: ${zoneType} (信頼度:${confidence.toFixed(2)}, 方法:${analysisMethod})`);
  });

  // 3. ゾーン情報の最終処理
  Object.values(zones).forEach(zone => {
    zone.methods = Array.from(zone.methods);
    zone.content_hint = determineEnhancedContentHint(zone.type);
  });

  return zones;
};

/**
 * 💡 コンテンツヒントの判定（Enhanced版）
 */
const determineEnhancedContentHint = (zoneType) => {
  switch (zoneType) {
    case 'visual_zone': return 'primary_visual';
    case 'title_zone': return 'primary_title';
    case 'metadata_zone': return 'date_or_category';
    case 'description_zone': return 'summary_content';
    case 'action_zone': return 'interactive_element';
    default: return 'unknown_content';
  }
};

// エクスポート（Node.js環境用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ENHANCED_ZONE_CONFIG,
    performEnhancedZoneAnalysis,
    analyzeTextElement,
    analyzeDensityPattern
  };
}

// ブラウザ環境でのグローバル登録
if (typeof window !== 'undefined') {
  window.EnhancedZoneAnalyzer = {
    ENHANCED_ZONE_CONFIG,
    performEnhancedZoneAnalysis,
    analyzeTextElement,
    analyzeDensityPattern
  };
  console.log('🚀 Enhanced Zone Analyzer loaded successfully');
}

/**
 * 📋 従来版ゾーン分析（フォールバック用）
 */
const performLegacyZoneAnalysis = (elements, cardBounds, imageInfo) => {
  const zones = {};
  const cardHeight = cardBounds.height;

  elements.forEach(element => {
    const relativeY = (element.position.y - cardBounds.y) / cardHeight;
    const elementArea = element.position.width * element.position.height;

    let zoneType = 'unknown';
    let confidence = 0.5;

    if (relativeY < 0.4) {
      // 上部40% - 画像・タイトルエリア
      if (elementArea > 3000 || element.type === 'image') {
        zoneType = 'visual_zone';
        confidence = 0.85;
      } else if (element.properties?.textContent) {
        zoneType = 'title_zone';
        confidence = 0.75;
      }
    } else if (relativeY < 0.7) {
      // 中部30% - メタデータエリア
      if (element.properties?.textContent) {
        zoneType = element.properties.textContent.length < 30 ? 'title_zone' : 'metadata_zone';
        confidence = 0.7;
      }
    } else {
      // 下部30% - 説明・アクションエリア
      if (element.properties?.textContent) {
        zoneType = 'description_zone';
        confidence = 0.75;
      } else if (element.type === 'button') {
        zoneType = 'action_zone';
        confidence = 0.8;
      }
    }

    // ゾーン統合
    if (zones[zoneType]) {
      zones[zoneType].elements.push(element);
      zones[zoneType].confidence = Math.max(zones[zoneType].confidence, confidence);
    } else {
      zones[zoneType] = {
        type: zoneType,
        elements: [element],
        confidence: confidence
      };
    }
  });

  return zones;
};

/**
 * 🔄 統合型ゾーン分析（改善版 + フォールバック）
 */
const performIntegratedZoneAnalysis = (elements, cardBounds, imageInfo) => {
  console.log(`🔍 統合型ゾーン分析開始: ${elements.length}個の要素を処理`);

  try {
    // 改善版を優先的に試行
    return performEnhancedZoneAnalysis(elements, cardBounds, imageInfo);
  } catch (enhancedError) {
    console.warn(`⚠️ 改善版ゾーン分析エラー、従来版にフォールバック:`, enhancedError);
    return performLegacyZoneAnalysis(elements, cardBounds, imageInfo);
  }
};

// ブラウザ環境でのグローバル登録（フォールバック関数も含める）
if (typeof window !== 'undefined') {
  window.EnhancedZoneAnalyzer = {
    ENHANCED_ZONE_CONFIG,
    performEnhancedZoneAnalysis,
    performLegacyZoneAnalysis,
    performIntegratedZoneAnalysis,
    analyzeTextElement,
    analyzeDensityPattern
  };
  console.log('🚀 Enhanced Zone Analyzer with fallback loaded successfully');
}
