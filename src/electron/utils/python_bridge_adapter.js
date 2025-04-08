/**
 * Python画像解析ブリッジアダプター
 * 既存のimageAnalyzer.jsと同じインターフェースを提供しつつ、
 * 内部的にはPythonスクリプトを使用して処理を行う
 */

// Python処理ブリッジをインポート
const pythonBridge = require('../../../python_bridge');

/**
 * 画像の主要な色を抽出する
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<Array>} 抽出された色の配列
 */
const extractColorsFromImage = async (imageBase64) => {
  try {
    if (!imageBase64) {
      return [];
    }

    // Python処理に委譲
    const colors = await pythonBridge.extractColorsFromImage(imageBase64);

    // 古いインターフェースに合わせて結果を変換
    return colors.map(color => color.rgb);
  } catch (error) {
    console.error("色抽出エラー:", error);
    return [];
  }
};

/**
 * 画像からテキストを抽出する（OCR）
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<string>} 抽出されたテキスト
 */
const extractTextFromImage = async (imageBase64) => {
  try {
    if (!imageBase64) {
      return '';
    }

    // Python処理に委譲
    const text = await pythonBridge.extractTextFromImage(imageBase64);
    return text;
  } catch (error) {
    console.error("テキスト抽出エラー:", error);
    return 'OCR処理中にエラーが発生しました。';
  }
};

/**
 * 画像のセクション分析機能
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<Array>} セクション分析結果
 */
const analyzeImageSections = async (imageBase64) => {
  try {
    if (!imageBase64) {
      return [];
    }

    // Python処理に委譲
    const sections = await pythonBridge.analyzeImageSections(imageBase64);

    // 古いインターフェースに合わせて結果を変換
    return sections.map(section => ({
      section: section.section,
      position: {
        top: section.position.top,
        height: section.position.height
      },
      dominantColor: section.dominantColor ? section.dominantColor.rgb : 'rgb(255,255,255)'
    }));
  } catch (error) {
    console.error("セクション分析エラー:", error);
    return [];
  }
};

/**
 * レイアウトパターンを分析する関数
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - レイアウトタイプとその確信度を含むオブジェクト
 */
const analyzeLayoutPattern = async (imagePath) => {
  try {
    if (!imagePath) {
      return getDefaultLayoutResult();
    }

    // Python処理に委譲
    const layoutResult = await pythonBridge.analyzeLayoutPattern(imagePath);

    // 古いインターフェースに合わせて結果を変換
    return {
      layoutType: layoutResult.layoutType,
      confidence: layoutResult.confidence,
      patterns: {},
      layoutDetails: {
        dimensions: layoutResult.layoutDetails.dimensions,
        sections: await analyzeImageSections(imagePath),
        elements: [],
        styles: {
          colors: await extractColorsFromImage(imagePath),
          typography: {},
          spacing: {},
          layout: {}
        },
        text: await extractTextFromImage(imagePath)
      }
    };
  } catch (error) {
    console.error('レイアウトパターン分析中にエラーが発生しました:', error);
    return getDefaultLayoutResult();
  }
};

/**
 * 画像内の特徴的な要素を検出する（ボタン、ヘッダー、リストなど）
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - 検出された要素の情報
 */
const detectFeatureElements = async (imagePath) => {
  try {
    if (!imagePath) {
      return getDefaultElementsResult();
    }

    // Python処理に委譲
    const elementsResult = await pythonBridge.detectFeatureElements(imagePath);

    // レイアウト分析も取得してマージ
    const layoutAnalysis = await analyzeLayoutPattern(imagePath);

    return {
      layoutType: elementsResult.layoutType,
      layoutConfidence: elementsResult.layoutConfidence,
      elements: elementsResult.elements
    };
  } catch (error) {
    console.error('要素検出中にエラーが発生しました:', error);
    return getDefaultElementsResult();
  }
};

/**
 * 画像からメインセクション（ヘッダー、メイン、フッター）を検出する
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - 検出されたセクション情報
 */
const detectMainSections = async (imagePath) => {
  try {
    // レイアウト分析を利用
    const layoutAnalysis = await analyzeLayoutPattern(imagePath);
    const elementsResult = await detectFeatureElements(imagePath);

    // 基本情報
    const result = {
      dimensions: layoutAnalysis.layoutDetails.dimensions,
      layoutType: layoutAnalysis.layoutType,
      layoutConfidence: layoutAnalysis.confidence
    };

    // レイアウトタイプに基づいた詳細情報を追加
    switch (layoutAnalysis.layoutType) {
      case "two-column":
        result.header = {
          exists: true,
          height: Math.round(result.dimensions.height * 0.15),
          alignment: "center",
          hasTitle: true,
          hasSubtitle: true
        };

        // 要素データから画像位置を特定
        const imageElement = elementsResult.elements.find(el => el.type === "image-column");
        const imagePosition = imageElement ? "left" : "right"; // 単純化

        result.mainContent = {
          layout: "two-column",
          imagePosition: imagePosition,
          textPosition: imagePosition === "left" ? "right" : "left",
          hasTitle: true,
          titlePosition: imagePosition === "left" ? "right" : "left",
          hasSubtitle: true,
          hasText: true,
          hasButton: true,
          buttonPosition: imagePosition === "left" ? "right" : "left",
          imageWidth: "50%",
          textWidth: "50%"
        };

        result.footer = {
          exists: false
        };
        break;

      case "card-grid":
        result.header = {
          exists: true,
          height: Math.round(result.dimensions.height * 0.15),
          alignment: "center",
          hasTitle: true,
          hasSubtitle: false
        };

        result.mainContent = {
          layout: "card-grid",
          cardCount: elementsResult.elements.filter(el => el.type === "card").length,
          cardsPerRow: 3, // 推定値
          hasTitle: true,
          hasImage: true,
          hasText: true,
          cardWidth: "30%",
          cardHeight: "auto"
        };

        result.footer = {
          exists: false
        };
        break;

      // 他のレイアウトタイプも同様に処理
      default:
        result.header = {
          exists: true,
          height: Math.round(result.dimensions.height * 0.15),
          alignment: "center",
          hasTitle: true,
          hasSubtitle: false
        };

        result.mainContent = {
          layout: "custom",
          hasTitle: true,
          hasText: true
        };

        result.footer = {
          exists: false
        };
    }

    return result;
  } catch (error) {
    console.error('メインセクション検出中にエラーが発生しました:', error);
    return getDefaultMainSectionsResult();
  }
};

/**
 * カード要素を検出する関数
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - カード要素の情報
 */
const detectCardElements = async (imagePath) => {
  try {
    // 要素検出を利用
    const elementsResult = await detectFeatureElements(imagePath);

    // カード要素のみをフィルタリング
    const cardElements = elementsResult.elements.filter(element =>
      element.type === "card"
    );

    return {
      cardCount: cardElements.length,
      cards: cardElements.map((card, index) => ({
        id: `card-${index + 1}`,
        position: card.position,
        hasImage: card.children && card.children.some(child => child.type === "image"),
        hasTitle: card.children && card.children.some(child => child.type === "heading"),
        hasText: card.children && card.children.some(child => child.type === "text"),
        hasButton: card.children && card.children.some(child => child.type === "button")
      }))
    };
  } catch (error) {
    console.error('カード要素検出中にエラーが発生しました:', error);
    return {
      cardCount: 0,
      cards: []
    };
  }
};

// デフォルト結果を返すヘルパー関数
const getDefaultLayoutResult = () => {
  return {
    layoutType: "unknown",
    confidence: 0.6,
    patterns: {},
    layoutDetails: {
      dimensions: { width: 1200, height: 800, aspectRatio: 1.5 },
      sections: [],
      elements: [],
      styles: {
        colors: [],
        typography: {},
        spacing: {},
        layout: {}
      },
      text: ''
    }
  };
};

const getDefaultElementsResult = () => {
  return {
    layoutType: "unknown",
    layoutConfidence: 0.5,
    elements: []
  };
};

const getDefaultMainSectionsResult = () => {
  return {
    dimensions: {
      width: 1200,
      height: 800,
      aspectRatio: 1.5
    },
    layoutType: "unknown",
    layoutConfidence: 0.5,
    header: {
      exists: false
    },
    mainContent: {
      layout: "custom"
    },
    footer: {
      exists: false
    }
  };
};

// Python環境のチェックとセットアップ
const checkPythonEnvironment = async () => {
  return await pythonBridge.checkPythonEnvironment();
};

const setupPythonEnvironment = async () => {
  return await pythonBridge.setupPythonEnvironment();
};

// 元のimageAnalyzer.jsと同じインターフェースでエクスポート
module.exports = {
  extractTextFromImage,
  extractColorsFromImage,
  analyzeImageSections,
  detectMainSections,
  detectCardElements,
  detectFeatureElements,
  analyzeLayoutPattern,
  checkPythonEnvironment,
  setupPythonEnvironment
};
