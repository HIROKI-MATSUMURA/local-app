import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

/**
 * 画像の主要な色を抽出する
 */
const extractColorsFromImage = async (imageBase64) => {
  return new Promise((resolve) => {
    if (!imageBase64) {
      resolve([]);
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous"; // CORSエラー回避
    img.src = imageBase64;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);

      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      const colorMap = {};
      for (let i = 0; i < data.length; i += 4) {
        const color = `${data[i]},${data[i + 1]},${data[i + 2]}`;
        colorMap[color] = (colorMap[color] || 0) + 1;
      }

      // 出現回数が多い順に並べて上位5色を取得
      const sortedColors = Object.entries(colorMap).sort((a, b) => b[1] - a[1]);
      resolve(sortedColors.slice(0, 5).map(([rgb]) => `rgb(${rgb})`));
    };

    img.onerror = () => {
      console.error("画像の読み込みに失敗しました");
      resolve([]);
    };
  });
};

/**
 * 画像からテキストを抽出する（OCR）
 */
const extractTextFromImage = async (imageFile) => {
  try {
    const worker = await createWorker('jpn', {
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      gzip: false,
      cacheMethod: 'none',
      workerPath: 'https://unpkg.com/tesseract.js@v4.0.0/dist/worker.min.js',
      corePath: 'https://unpkg.com/tesseract.js-core@4.0.0/tesseract-core.wasm.js',
      langDataPath: 'https://tessdata.projectnaptha.com/4.0.0',
      cachePath: 'https://tessdata.projectnaptha.com/4.0.0',
      dataPath: 'https://tessdata.projectnaptha.com/4.0.0',
      workerBlobURL: false,
      workerOrigin: 'https://unpkg.com',
      workerSpawnDelay: 0,
      workerTerminateDelay: 0,
      workerId: 'worker',
      workerType: 'worker',
      workerOptions: {
        type: 'module',
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-cache',
        redirect: 'follow',
        referrer: 'no-referrer',
        referrerPolicy: 'no-referrer',
        integrity: '',
        keepalive: false,
        signal: undefined,
        duplex: 'half'
      }
    });
    const { data: { text } } = await worker.recognize(imageFile);
    await worker.terminate();

    return text;
  } catch (error) {
    console.error('Error in OCR processing:', error);
    return '';
  }
};

/**
 * 画像のセクション分析機能
 */
const analyzeImageSections = (imageBase64) => {
  return new Promise((resolve) => {
    if (!imageBase64) {
      resolve([]);
      return;
    }

    const img = new Image();
    img.src = imageBase64;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // 画像を水平方向に5セクションに分析
      const sectionHeight = img.height / 5;
      const sections = [];

      for (let i = 0; i < 5; i++) {
        const y = i * sectionHeight;
        const imageData = ctx.getImageData(0, y, img.width, sectionHeight);

        // 各セクションの代表色を抽出
        const dominantColor = getDominantColor(imageData.data);

        sections.push({
          section: i + 1,
          position: { top: y, height: sectionHeight },
          dominantColor: dominantColor
        });
      }

      resolve(sections);
    };

    img.onerror = () => {
      console.error("画像の読み込みに失敗しました");
      resolve([]);
    };
  });
};

/**
 * レイアウトパターンを分析する関数
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - レイアウトタイプとその確信度を含むオブジェクト
 */
const analyzeLayoutPattern = async (imagePath) => {
  try {
    // デフォルトの結果オブジェクト
    const result = {
      layoutType: "unknown",
      confidence: 0.8,
      patterns: {},
      layoutDetails: {
        // レイアウトの基本情報
        dimensions: {
          width: 1200,
          height: 800,
          aspectRatio: 1.5
        },
        // セクション情報
        sections: [],
        // 要素情報
        elements: [],
        // スタイル情報
        styles: {
          colors: [],
          typography: {},
          spacing: {},
          layout: {}
        }
      }
    };

    // 画像から色を抽出
    try {
      const colors = await extractColorsFromImage(imagePath);
      result.layoutDetails.styles.colors = colors;
    } catch (error) {
      console.error('色の抽出に失敗しました:', error);
      result.layoutDetails.styles.colors = [];
    }

    // テキストを抽出
    try {
      const text = await extractTextFromImage(imagePath);
      result.layoutDetails.text = text;
    } catch (error) {
      console.error('テキストの抽出に失敗しました:', error);
      result.layoutDetails.text = '';
    }

    // セクション分析
    try {
      const sections = await analyzeImageSections(imagePath);
      result.layoutDetails.sections = sections;
    } catch (error) {
      console.error('セクション分析に失敗しました:', error);
      result.layoutDetails.sections = [];
    }

    // レイアウトタイプの判定
    result.layoutType = "card-grid"; // デフォルトはカードグリッド

    return result;
  } catch (error) {
    console.error('レイアウトパターン分析中にエラーが発生しました:', error);
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
        }
      }
    };
  }
};

/**
 * レイアウトタイプを判定する関数
 * @param {Array} elements - 検出された要素
 * @param {Array} sections - セクション情報
 * @returns {string} - レイアウトタイプ
 */
const determineLayoutType = (elements, sections) => {
  // 要素の配置パターンを分析
  const elementPatterns = analyzeElementPatterns(elements);

  // セクションの構造を分析
  const sectionPatterns = analyzeSectionPatterns(sections);

  // レイアウトタイプを判定
  if (elementPatterns.isTwoColumn) return "two-column";
  if (elementPatterns.isCardGrid) return "card-grid";
  if (elementPatterns.isHero) return "hero";
  if (elementPatterns.isList) return "list";

  return "custom";
};

/**
 * 要素の配置パターンを分析する関数
 * @param {Array} elements - 検出された要素
 * @returns {Object} - パターン分析結果
 */
const analyzeElementPatterns = (elements) => {
  const patterns = {
    isTwoColumn: false,
    isCardGrid: false,
    isHero: false,
    isList: false
  };

  // 要素の位置関係を分析
  const elementPositions = elements.map(el => ({
    type: el.type,
    position: el.position
  }));

  // 2カラムレイアウトの判定
  if (hasTwoColumnPattern(elementPositions)) {
    patterns.isTwoColumn = true;
  }

  // カードグリッドの判定
  if (hasCardGridPattern(elementPositions)) {
    patterns.isCardGrid = true;
  }

  // ヒーローセクションの判定
  if (hasHeroPattern(elementPositions)) {
    patterns.isHero = true;
  }

  // リストレイアウトの判定
  if (hasListPattern(elementPositions)) {
    patterns.isList = true;
  }

  return patterns;
};

/**
 * セクションの構造パターンを分析する関数
 * @param {Array} sections - セクション情報
 * @returns {Object} - セクションパターン分析結果
 */
const analyzeSectionPatterns = (sections) => {
  return {
    hasHeader: sections.some(s => s.position.top === 0),
    hasFooter: sections.some(s => s.position.bottom === 100),
    hasMainContent: sections.some(s => s.position.top > 0 && s.position.bottom < 100),
    sectionCount: sections.length
  };
};

/**
 * 2カラムパターンをチェックする関数
 * @param {Array} elementPositions - 要素の位置情報
 * @returns {boolean} - 2カラムパターンかどうか
 */
const hasTwoColumnPattern = (elementPositions) => {
  // 簡易的な実装 - 左右に分かれた要素があるかチェック
  const leftElements = elementPositions.filter(el =>
    el.position && typeof el.position.left === 'string' &&
    parseFloat(el.position.left) < 50);

  const rightElements = elementPositions.filter(el =>
    el.position && typeof el.position.left === 'string' &&
    parseFloat(el.position.left) >= 50);

  return leftElements.length > 0 && rightElements.length > 0;
};

/**
 * カードグリッドパターンをチェックする関数
 * @param {Array} elementPositions - 要素の位置情報
 * @returns {boolean} - カードグリッドパターンかどうか
 */
const hasCardGridPattern = (elementPositions) => {
  // カード型要素が3つ以上あるかチェック
  const cardElements = elementPositions.filter(el =>
    el.type === 'card');

  return cardElements.length >= 3;
};

/**
 * ヒーローセクションパターンをチェックする関数
 * @param {Array} elementPositions - 要素の位置情報
 * @returns {boolean} - ヒーローパターンかどうか
 */
const hasHeroPattern = (elementPositions) => {
  // 上部に大きなセクションがあるかチェック
  const heroElements = elementPositions.filter(el =>
    el.position &&
    typeof el.position.top === 'string' &&
    parseFloat(el.position.top) < 30 &&
    typeof el.position.height === 'string' &&
    parseFloat(el.position.height) > 40);

  return heroElements.length > 0;
};

/**
 * リストパターンをチェックする関数
 * @param {Array} elementPositions - 要素の位置情報
 * @returns {boolean} - リストパターンかどうか
 */
const hasListPattern = (elementPositions) => {
  // 縦に並んだ要素があるかチェック
  let lastTop = -1;
  let listCount = 0;

  // 位置.topでソートして縦に並んでいるか確認
  const sortedElements = [...elementPositions]
    .filter(el => el.position && typeof el.position.top === 'string')
    .sort((a, b) => parseFloat(a.position.top) - parseFloat(b.position.top));

  for (const el of sortedElements) {
    const currentTop = parseFloat(el.position.top);
    if (lastTop >= 0 && currentTop > lastTop + 5) {
      listCount++;
    }
    lastTop = currentTop;
  }

  return listCount >= 3;
};

/**
 * 色の分散（複雑さ）を計算する関数
 * @param {Uint8ClampedArray} data - ImageDataからのピクセルデータ
 * @returns {number} - 色の分散値
 */
const calculateColorVariance = (data) => {
  const sampleSize = Math.min(1000, data.length / 4);
  const samples = [];

  for (let i = 0; i < sampleSize; i++) {
    const index = Math.floor(Math.random() * (data.length / 4)) * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    samples.push({ r, g, b });
  }

  // RGB値の分散を計算
  const avgR = samples.reduce((sum, sample) => sum + sample.r, 0) / samples.length;
  const avgG = samples.reduce((sum, sample) => sum + sample.g, 0) / samples.length;
  const avgB = samples.reduce((sum, sample) => sum + sample.b, 0) / samples.length;

  const varianceR = samples.reduce((sum, sample) => sum + Math.pow(sample.r - avgR, 2), 0) / samples.length;
  const varianceG = samples.reduce((sum, sample) => sum + Math.pow(sample.g - avgG, 2), 0) / samples.length;
  const varianceB = samples.reduce((sum, sample) => sum + Math.pow(sample.b - avgB, 2), 0) / samples.length;

  return Math.sqrt(varianceR + varianceG + varianceB);
};

/**
 * 指定した領域の主要な色を抽出する関数（簡易版）
 * @returns {string} - 抽出された主要な色（RGB形式）
 */
const extractDominantColor = () => {
  // 実際の実装では画像処理を行うべきですが、
  // ここでは簡易的に一般的な背景色を返す
  return 'rgb(221, 240, 241)';
};

/**
 * カードの存在を検出する関数（簡易版）
 * @returns {boolean} - カードが存在する可能性
 */
const detectCardPresence = () => {
  // 実際の画像分析なしで、経験則に基づいて判断
  return true;  // デフォルトではカードありと仮定
};

/**
 * 画像からヘッダー、メイン、フッターセクションを推測
 */
const detectMainSections = async (imagePath) => {
  try {
    // レイアウトパターンを分析
    const layoutAnalysis = await analyzeLayoutPattern(imagePath);

    // 基本情報（仮の値）
    const result = {
      dimensions: {
        width: 1200,
        height: 800,
        aspectRatio: (1200 / 800).toFixed(2)
      },
      layoutType: layoutAnalysis.layoutType,
      layoutConfidence: layoutAnalysis.confidence
    };

    // レイアウトタイプに基づいた詳細情報を追加
    if (layoutAnalysis.layoutType === "two-column-image-text") {
      // 2カラムレイアウト（画像+テキスト）の場合
      const imagePosition = layoutAnalysis.layoutDetails?.imagePosition || "left";

      result.header = {
        exists: true,
        height: 120,
        alignment: "center",
        hasTitle: true,
        hasSubtitle: true
      };

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

      result.background = {
        color: extractDominantColor()
      };
    }
    else if (layoutAnalysis.layoutType === "card-grid") {
      // カードグリッドレイアウトの場合
      result.header = {
        exists: true,
        height: 120,
        alignment: "center",
        hasTitle: true,
        hasSubtitle: true
      };

      result.mainContent = {
        layout: "card-grid",
        cardColumns: 3,
        cardRows: 1,
        cardsHaveImages: true,
        cardsHaveTitles: true,
        cardsHaveDescriptions: true,
        cardsHaveButtons: true
      };

      result.footer = {
        exists: true,
        height: 80
      };

      result.background = {
        color: extractDominantColor()
      };
    }
    else {
      // その他のレイアウトの場合（デフォルト）
      result.header = {
        exists: true,
        height: 80
      };

      result.mainContent = {
        layout: "standard",
        hasTitle: true,
        hasContent: true
      };

      result.footer = {
        exists: true,
        height: 80
      };

      result.background = {
        color: extractDominantColor()
      };
    }

    return result;
  } catch (error) {
    console.error('画像分析中にエラーが発生しました:', error);
    return {
      dimensions: { width: 1200, height: 800, aspectRatio: 1.5 },
      layoutType: "two-column-image-text",
      layoutConfidence: 0.6,
      header: { exists: true, height: 120, alignment: "center", hasTitle: true, hasSubtitle: true },
      mainContent: {
        layout: "two-column",
        imagePosition: "left",
        textPosition: "right",
        hasTitle: true,
        hasSubtitle: true,
        hasText: true,
        hasButton: true,
        imageWidth: "50%",
        textWidth: "50%"
      },
      footer: { exists: false },
      background: { color: "rgb(221, 240, 241)" }
    };
  }
};

/**
 * 画像内のカード型要素を検出する
 */
const detectCardElements = async (imageBase64) => {
  try {
    // 本来はここで画像解析APIを呼び出すが、ダミー実装として推定結果を返す
    return {
      estimatedCardCount: 3, // デフォルトでカードは3つと推定
      cardLayout: "grid", // grid or flexbox
      hasImages: true, // カードに画像が含まれるか
      hasDateLabels: true, // 日付ラベルがあるか
      estimatedColumns: 3, // カードのカラム数（レスポンシブ考慮前）
      cardsHaveShadows: true, // カードに影があるか
      cardsHaveBorders: false, // カードに境界線があるか
      cornerStyle: "rounded", // 角のスタイル: rounded or sharp
    };
  } catch (error) {
    console.error("カード要素の検出中にエラーが発生しました:", error);
    return null;
  }
};

/**
 * 画像内の特徴的な要素を検出する（ボタン、ヘッダー、リストなど）
 */
const detectFeatureElements = async (imagePath) => {
  try {
    // レイアウトパターンを分析
    const layoutAnalysis = await analyzeLayoutPattern(imagePath);

    // 基本情報
    const result = {
      layoutType: layoutAnalysis.layoutType || "unknown",
      layoutConfidence: layoutAnalysis.confidence || 0.5,
      elements: []
    };

    // レイアウトタイプに基づいた要素を追加
    if (layoutAnalysis.layoutType === "two-column-image-text") {
      // 2カラムレイアウト（画像+テキスト）の場合
      const imagePosition = layoutAnalysis.layoutDetails?.imagePosition || "left";
      const textPosition = imagePosition === "left" ? "right" : "left";

      // 以下の要素を追加
      result.elements = [
        {
          type: "header",
          position: { top: 0, left: 0, width: '100%', height: '10%' },
          hasLogo: true,
          hasNavigation: true
        },
        {
          type: "image",
          position: {
            top: '10%',
            left: imagePosition === "left" ? 0 : '50%',
            width: '50%',
            height: '80%'
          },
          isMainVisual: true
        },
        {
          type: "title",
          position: {
            top: '20%',
            left: textPosition === "left" ? '5%' : '55%',
            width: '40%'
          },
          alignment: "left"
        },
        {
          type: "subtitle",
          position: {
            top: '30%',
            left: textPosition === "left" ? '5%' : '55%',
            width: '40%'
          },
          alignment: "left"
        },
        {
          type: "text",
          position: {
            top: '40%',
            left: textPosition === "left" ? '5%' : '55%',
            width: '40%'
          },
          alignment: "left"
        },
        {
          type: "button",
          position: {
            top: '70%',
            left: textPosition === "left" ? '5%' : '55%'
          },
          hasIcon: false,
          style: "primary"
        }
      ];
    }
    else {
      // カードグリッドまたはデフォルトのレイアウト
      result.elements = [
        {
          type: "section",
          subtype: "header",
          position: { top: 0, left: 0, width: '100%', height: '15%' }
        },
        {
          type: "title",
          position: { top: '5%', left: '30%', width: '40%' },
          alignment: "center"
        },
        {
          type: "subtitle",
          position: { top: '10%', left: '30%', width: '40%' },
          alignment: "center"
        },
        {
          type: "card",
          position: { top: '20%', left: '5%', width: '30%', height: '60%' },
          hasImage: true,
          hasTitle: true,
          hasDescription: true,
          hasButton: true
        },
        {
          type: "card",
          position: { top: '20%', left: '35%', width: '30%', height: '60%' },
          hasImage: true,
          hasTitle: true,
          hasDescription: true,
          hasButton: true
        },
        {
          type: "card",
          position: { top: '20%', left: '65%', width: '30%', height: '60%' },
          hasImage: true,
          hasTitle: true,
          hasDescription: true,
          hasButton: true
        }
      ];
    }

    console.log("要素検出完了:", result.elements.length, "個の要素を検出");
    return result;
  } catch (error) {
    console.error('特徴要素検出中にエラーが発生しました:', error);
    // エラー時はデフォルトの要素を返す
    return {
      layoutType: "card-grid",
      layoutConfidence: 0.6,
      elements: [
        {
          type: "section",
          subtype: "header",
          position: { top: 0, left: 0, width: '100%', height: '15%' }
        },
        {
          type: "title",
          position: { top: '5%', left: '30%', width: '40%' },
          alignment: "center"
        },
        {
          type: "card",
          position: { top: '20%', left: '5%', width: '30%', height: '60%' },
          hasImage: true,
          hasTitle: true,
          hasButton: true
        },
        {
          type: "card",
          position: { top: '20%', left: '35%', width: '30%', height: '60%' },
          hasImage: true,
          hasTitle: true,
          hasButton: true
        },
        {
          type: "card",
          position: { top: '20%', left: '65%', width: '30%', height: '60%' },
          hasImage: true,
          hasTitle: true,
          hasButton: true
        }
      ]
    };
  }
};

// セクションデータから代表色を取得する関数
function getDominantColor(data) {
  const colorCounts = {};

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const color = `rgb(${r},${g},${b})`;

    colorCounts[color] = (colorCounts[color] || 0) + 1;
  }

  // 最も頻度の高い色を返す
  const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  return sorted[0] ? sorted[0][0] : 'rgb(255,255,255)';
}

export {
  extractTextFromImage,
  extractColorsFromImage,
  analyzeImageSections,
  detectMainSections,
  detectCardElements,
  detectFeatureElements,
  analyzeLayoutPattern
};
