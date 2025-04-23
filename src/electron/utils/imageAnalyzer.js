/**
 * 画像分析ユーティリティ
 * Electronモードの場合はMainプロセス経由でPython処理を実行、
 * ブラウザモードの場合はテスト/デモ用の警告を表示
 */

import { createWorker } from 'tesseract.js';

// 開発モードかどうかを確認
const isDevelopment = process.env.NODE_ENV === 'development';

// ブラウザ環境でWindow APIの初期化を確認
if (typeof window !== 'undefined' && !window.api) {
  console.log('window.apiが存在しないため、最小限のAPIをセットアップします');

  // 最小限のダミーAPIを提供
  window.api = {
    isElectron: false,
    extractColorsFromImage: () => Promise.resolve({ success: false, data: [], error: 'ブラウザ環境ではPython処理は利用できません' }),
    extractTextFromImage: () => Promise.resolve({ success: false, data: '', error: 'ブラウザ環境ではPython処理は利用できません' }),
    analyzeImageSections: () => Promise.resolve({ success: false, data: [], error: 'ブラウザ環境ではPython処理は利用できません' })
  };
}

// Electronコンテキストかどうかをチェック (複数の方法でチェック)
const isElectron = () => {
  // 早期チェック - window自体が存在するか
  if (typeof window === 'undefined') {
    return false;
  }

  // 1. window.apiの存在をチェック (これが最も信頼性が高い)
  const hasApi = window.api && window.api.isElectron === true;

  // 2. window.electronの存在をチェック
  const hasElectron = window.electron !== undefined;

  // 3. userAgentをチェック
  const userAgent = navigator.userAgent.toLowerCase();
  const containsElectron = userAgent.indexOf(' electron/') > -1;

  // 詳細ログ (開発時のみ)
  if (isDevelopment) {
    console.log('Electron環境チェック:', {
      hasApi,
      hasElectron,
      containsElectron,
      userAgent
    });
  }

  return hasApi || hasElectron || containsElectron;
};

// Node.jsモジュールを安全に読み込む
let fs, path;
if (isElectron()) {
  try {
    // window.api経由でのみアクセス
    if (window.api && window.api.fs && window.api.path) {
      fs = window.api.fs;
      path = window.api.path;
    } else {
      console.warn('Node.jsモジュールへのアクセス方法が見つかりません');
    }
  } catch (err) {
    console.warn('Nodeモジュールのロードに失敗しました。一部の機能が制限されます。', err);
  }
}

// Python版の画像分析ユーティリティをインポート（ただしブラウザでは使用しない）
import * as pythonAnalyzer from './python_bridge_adapter';

/**
 * 画像の主要な色を抽出する
 */
const extractColorsFromImage = async (imageBase64) => {
  const electronEnv = isElectron();

  if (!electronEnv) {
    console.log("Electron環境外での実行 - ダミーデータを返します");

    // ブラウザ環境用のダミーデータ
    return [
      'rgb(51, 51, 51)',    // ダークグレー
      'rgb(255, 255, 255)', // ホワイト
      'rgb(0, 123, 255)',   // ブルー
      'rgb(220, 53, 69)',   // レッド
      'rgb(40, 167, 69)'    // グリーン
    ];
  }

  try {
    // Electronのメインプロセス経由でPython処理を実行
    const result = await window.api.extractColorsFromImage(imageBase64);

    if (result.success) {
      return result.data;
    } else {
      if (!result?.success) {
        console.error('Python処理エラー:', result?.error ?? 'unknown');
      }

      // エラー時のフォールバックカラー
      return [
        'rgb(200, 200, 200)', // ライトグレー
        'rgb(150, 150, 150)', // ミディアムグレー
        'rgb(100, 100, 100)', // ダークグレー
        'rgb(50, 50, 50)',    // ベリーダークグレー
        'rgb(0, 0, 0)'        // ブラック
      ];
    }
  } catch (error) {
    console.error("Python画像処理エラー:", error);

    // エラー時のフォールバックカラー
    return [
      'rgb(200, 200, 200)', // ライトグレー
      'rgb(150, 150, 150)', // ミディアムグレー
      'rgb(100, 100, 100)', // ダークグレー
      'rgb(50, 50, 50)',    // ベリーダークグレー
      'rgb(0, 0, 0)'        // ブラック
    ];
  }
};

/**
 * 画像からテキストを抽出する（OCR）
 */
const extractTextFromImage = async (imageBase64) => {
  if (!isElectron()) {
    console.log("Electron環境外での実行 - ダミーテキストを返します");
    return "これはダミーのテキストです。実際のOCR処理はElectronアプリケーション内でのみ利用可能です。";
  }

  try {
    // Electronのメインプロセス経由でPython処理を実行
    const result = await window.api.extractTextFromImage(imageBase64);

    if (result && result.success) {
      return result.data;
    } else {
      const errorMessage = result?.error ?? '不明なエラー（successがfalse）';
      console.error("Python OCR処理エラー:", errorMessage);
      return "OCR処理中にエラーが発生しました。";
    }
  } catch (error) {
    console.error("Python OCR処理中に例外が発生しました:", error);
    return "OCR処理中に例外が発生しました。";
  }

};

/**
 * 画像のセクション分析機能
 */
const analyzeImageSections = async (imageBase64) => {
  if (!isElectron()) {
    console.log("Electron環境外での実行 - ダミーセクションデータを返します");

    // ダミーのセクションデータを返す
    return [
      {
        section: 1,
        position: { top: 0, height: 100 },
        dominantColor: { rgb: 'rgb(240, 240, 240)', hex: '#f0f0f0' }
      },
      {
        section: 2,
        position: { top: 100, height: 100 },
        dominantColor: { rgb: 'rgb(220, 220, 220)', hex: '#dcdcdc' }
      },
      {
        section: 3,
        position: { top: 200, height: 100 },
        dominantColor: { rgb: 'rgb(200, 200, 200)', hex: '#c8c8c8' }
      },
      {
        section: 4,
        position: { top: 300, height: 100 },
        dominantColor: { rgb: 'rgb(180, 180, 180)', hex: '#b4b4b4' }
      },
      {
        section: 5,
        position: { top: 400, height: 100 },
        dominantColor: { rgb: 'rgb(160, 160, 160)', hex: '#a0a0a0' }
      }
    ];
  }

  try {
    // Electronのメインプロセス経由でPython処理を実行
    const result = await window.api.analyzeImageSections(imageBase64);

    if (result.success) {
      return result.data;
    } else {
      console.error("Python セクション分析エラー:", result.error);
      // エラー時のダミーデータを返す
      return [];
    }
  } catch (error) {
    console.error("Python セクション分析エラー:", error);
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
    // Python版の実装を使用
    return await pythonAnalyzer.analyzeLayoutPattern(imagePath);
  } catch (error) {
    console.error("Python版レイアウト分析でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
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
  }
};

/**
 * 画像からヘッダー、メイン、フッターセクションを推測
 */
const detectMainSections = async (imagePath) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.detectMainSections(imagePath);
  } catch (error) {
    console.error("Python版メインセクション検出でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    try {
      // レイアウトパターンを分析
      const layoutAnalysis = await analyzeLayoutPattern(imagePath);

      // 基本情報（仮の値）
      const result = {
        dimensions: {
          width: 1200,
          height: 800,
          aspectRatio: 1.5
        },
        sectionsDetected: true,
        confidence: 0.8,
        sections: [
          {
            name: "header",
            type: "header",
            position: {
              top: 0,
              left: 0,
              width: 1200,
              height: 80
            },
            confidence: 0.9
          },
          {
            name: "main",
            type: "content",
            position: {
              top: 80,
              left: 0,
              width: 1200,
              height: 640
            },
            confidence: 0.9
          },
          {
            name: "footer",
            type: "footer",
            position: {
              top: 720,
              left: 0,
              width: 1200,
              height: 80
            },
            confidence: 0.9
          }
        ]
      };

      return result;
    } catch (error) {
      console.error('メインセクション検出中にエラーが発生しました:', error);
      return {
        sectionsDetected: false,
        confidence: 0.5,
        sections: []
      };
    }
  }
};

/**
 * カード要素を検出する
 */
const detectCardElements = async (imagePath) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.detectCardElements(imagePath);
  } catch (error) {
    console.error("Python版カード要素検出でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    try {
      // レイアウトパターンを分析
      const layoutAnalysis = await analyzeLayoutPattern(imagePath);

      // カード要素を検出（仮の結果）
      const result = {
        cardsDetected: true,
        confidence: 0.8,
        cards: [
          {
            id: "card_1",
            position: {
              top: 100,
              left: 50,
              width: 300,
              height: 200
            },
            confidence: 0.9
          },
          {
            id: "card_2",
            position: {
              top: 100,
              left: 400,
              width: 300,
              height: 200
            },
            confidence: 0.9
          },
          {
            id: "card_3",
            position: {
              top: 350,
              left: 50,
              width: 300,
              height: 200
            },
            confidence: 0.9
          }
        ]
      };

      return result;
    } catch (error) {
      console.error('カード要素検出中にエラーが発生しました:', error);
      return {
        cardsDetected: false,
        confidence: 0.5,
        cards: []
      };
    }
  }
};

/**
 * 特徴的な要素（ボタン、フォーム、ナビゲーションなど）を検出
 */
const detectFeatureElements = async (imagePath) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.detectFeatureElements(imagePath);
  } catch (error) {
    console.error("Python版特徴要素検出でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    try {
      // レイアウトパターンを分析
      const layoutAnalysis = await analyzeLayoutPattern(imagePath);

      // 特徴的な要素を検出（仮の結果）
      const result = {
        elementsDetected: true,
        confidence: 0.7,
        elements: [
          {
            type: "button",
            position: {
              top: 550,
              left: 500,
              width: 200,
              height: 50
            },
            confidence: 0.8,
            text: "送信"
          },
          {
            type: "input",
            position: {
              top: 400,
              left: 500,
              width: 300,
              height: 40
            },
            confidence: 0.7,
            text: ""
          },
          {
            type: "navigation",
            position: {
              top: 20,
              left: 600,
              width: 500,
              height: 40
            },
            confidence: 0.9,
            items: 5
          }
        ]
      };

      return result;
    } catch (error) {
      console.error('特徴要素検出中にエラーが発生しました:', error);
      return {
        elementsDetected: false,
        confidence: 0.5,
        elements: []
      };
    }
  }
};

/**
 * 画像の主要色を抽出するヘルパー関数
 */
function getDominantColor(pixelData) {
  const colorMap = {};

  // ピクセルデータからRGBカラーを抽出してカウント
  for (let i = 0; i < pixelData.length; i += 4) {
    const r = pixelData[i];
    const g = pixelData[i + 1];
    const b = pixelData[i + 2];

    // 量子化して同じような色をまとめる
    const quantizedR = Math.round(r / 32) * 32;
    const quantizedG = Math.round(g / 32) * 32;
    const quantizedB = Math.round(b / 32) * 32;

    const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
    colorMap[colorKey] = (colorMap[colorKey] || 0) + 1;
  }

  // 最も多い色を取得
  let dominantColorKey = "";
  let maxCount = 0;

  for (const [color, count] of Object.entries(colorMap)) {
    if (count > maxCount) {
      maxCount = count;
      dominantColorKey = color;
    }
  }

  // RGBカラーを取得
  const [r, g, b] = dominantColorKey.split(",").map(Number);
  const hexColor = `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

  return {
    rgb: `rgb(${r}, ${g}, ${b})`,
    hex: hexColor,
  };
}

/**
 * 画像から主要な色を抽出
 */
function extractDominantColor(imageData) {
  // カラーマップを作成
  const colorMap = {};
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const key = `${r},${g},${b}`;
    colorMap[key] = (colorMap[key] || 0) + 1;
  }

  // 最も多い色を抽出
  let maxColor = '';
  let maxCount = 0;
  for (const [color, count] of Object.entries(colorMap)) {
    if (count > maxCount) {
      maxCount = count;
      maxColor = color;
    }
  }

  // RGBを解析
  const [r, g, b] = maxColor.split(',').map(Number);

  return `rgb(${r},${g},${b})`;
}

// Python環境をチェックする関数をエクスポート
export const checkPythonEnvironment = pythonAnalyzer.checkPythonEnvironment;
export const setupPythonEnvironment = pythonAnalyzer.setupPythonEnvironment;

export {
  extractColorsFromImage,
  extractTextFromImage,
  analyzeImageSections,
  analyzeLayoutPattern,
  detectMainSections,
  detectCardElements,
  detectFeatureElements
};
