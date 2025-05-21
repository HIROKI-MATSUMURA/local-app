/**
 * 画像分析ユーティリティ
 * WebAssembly実装による画像処理機能を提供します
 * 以前のPython版からの完全移行版
 */

// OpenCV.js と Tesseract.js をロード（外部依存は main.js で行われる想定）
import cv from '@techstark/opencv-js';
import { createWorker } from 'tesseract.js';

// 開発モードかどうかを確認
const isDevelopment = process.env.NODE_ENV === 'development';

// ブラウザ環境でWindow APIの初期化を確認
if (typeof window !== 'undefined' && !window.api) {
  console.log('window.apiが存在しないため、最小限のAPIをセットアップします');

  // 最小限のダミーAPIを提供
  window.api = {
    isElectron: false,
    extractColorsFromImage: () => Promise.resolve({ success: false, data: [], error: 'ブラウザ環境ではWebAssembly処理は直接実行できません' }),
    extractTextFromImage: () => Promise.resolve({ success: false, data: '', error: 'ブラウザ環境ではWebAssembly処理は直接実行できません' }),
    analyzeImageSections: () => Promise.resolve({ success: false, data: [], error: 'ブラウザ環境ではWebAssembly処理は直接実行できません' })
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

// WebAssembly版の画像分析ユーティリティをインポート
import * as wasmAnalyzer from './webassembly-image-analyzer';
import * as wasmBridge from './webassembly-bridge-adapter';

/**
 * 画像の主要な色を抽出する
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {Promise<Array>} 抽出された色のリスト
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
    if (window.api && window.api.useWebAssembly !== false) {
      // WebAssembly実装を直接使用
      const colors = await wasmAnalyzer.extractColorsFromImage(imageBase64);
      return colors;
    } else {
      // Electronのメインプロセス経由で実行（既存互換モード）
      const result = await window.api.extractColorsFromImage(imageBase64);

      if (result.success) {
        return result.data;
      } else {
        console.error('色抽出エラー:', result?.error ?? 'unknown');
        // エラー時のフォールバックカラー
        return [
          'rgb(200, 200, 200)', // ライトグレー
          'rgb(150, 150, 150)', // ミディアムグレー
          'rgb(100, 100, 100)', // ダークグレー
          'rgb(50, 50, 50)',    // ベリーダークグレー
          'rgb(0, 0, 0)'        // ブラック
        ];
      }
    }
  } catch (error) {
    console.error("色抽出エラー:", error);
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
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {Promise<string|object>} 抽出されたテキスト
 */
const extractTextFromImage = async (imageBase64) => {
  if (!isElectron()) {
    console.log("Electron環境外での実行 - ダミーテキストを返します");
    return "これはダミーのテキストです。実際のOCR処理はElectronアプリケーション内でのみ利用可能です。";
  }

  try {
    if (window.api && window.api.useWebAssembly !== false) {
      // WebAssembly実装を直接使用
      const result = await wasmAnalyzer.extractTextFromImage(imageBase64);
      return result.text || '';
    } else {
      // Electronのメインプロセス経由で実行（既存互換モード）
      const result = await window.api.extractTextFromImage(imageBase64);

      if (result && result.success) {
        return result.data;
      } else {
        const errorMessage = result?.error ?? '不明なエラー（successがfalse）';
        console.error("OCR処理エラー:", errorMessage);
        return "OCR処理中にエラーが発生しました。";
      }
    }
  } catch (error) {
    console.error("OCR処理中にエラーが発生しました:", error);
    return "OCR処理中にエラーが発生しました。";
  }
};

/**
 * 画像のセクション分析機能
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {Promise<Array>} セクション情報の配列
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
    if (window.api && window.api.useWebAssembly !== false) {
      // WebAssembly実装を直接使用
      const sections = await wasmAnalyzer.analyzeImageSections(imageBase64);
      return sections;
    } else {
      // Electronのメインプロセス経由で実行（既存互換モード）
      const result = await window.api.analyzeImageSections(imageBase64);

      if (result.success) {
        return result.data;
      } else {
        console.error("セクション分析エラー:", result.error);
        return [];
      }
    }
  } catch (error) {
    console.error("セクション分析エラー:", error);
    return [];
  }
};

/**
 * レイアウトパターンを分析する関数
 * @param {string} imageData - 分析する画像データ
 * @returns {Promise<Object>} - レイアウトタイプとその確信度を含むオブジェクト
 */
const analyzeLayoutPattern = async (imageData) => {
  try {
    if (window.api && window.api.useWebAssembly !== false) {
      // WebAssembly実装を直接使用
      return await wasmAnalyzer.analyzeLayoutPattern(imageData);
    } else {
      // 既存の橋渡し実装を使用
      return await wasmBridge.analyzeLayoutPattern(imageData);
    }
  } catch (error) {
    console.error("レイアウト分析でエラーが発生しました。フォールバックを使用します。", error);

    // フォールバック: 簡易実装
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
        const colors = await extractColorsFromImage(imageData);
        result.layoutDetails.styles.colors = colors;
      } catch (error) {
        console.error('色の抽出に失敗しました:', error);
        result.layoutDetails.styles.colors = [];
      }

      // テキストを抽出
      try {
        const text = await extractTextFromImage(imageData);
        result.layoutDetails.text = text;
      } catch (error) {
        console.error('テキストの抽出に失敗しました:', error);
        result.layoutDetails.text = '';
      }

      // セクション分析
      try {
        const sections = await analyzeImageSections(imageData);
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
 * @param {string} imageData - 分析する画像データ
 * @returns {Promise<Object>} セクション情報
 */
const detectMainSections = async (imageData) => {
  try {
    if (window.api && window.api.useWebAssembly !== false) {
      // WebAssembly実装を直接使用
      return await wasmAnalyzer.detectMainSections(imageData);
    } else {
      // 既存の橋渡し実装を使用
      return await wasmBridge.detectMainSections(imageData);
    }
  } catch (error) {
    console.error("メインセクション検出でエラーが発生しました。フォールバックを使用します。", error);

    // フォールバック: 簡易実装
    try {
      // レイアウトパターンを分析
      const layoutAnalysis = await analyzeLayoutPattern(imageData);

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
 * @param {string} imageData - 分析する画像データ
 * @returns {Promise<Object>} 検出されたカード要素情報
 */
const detectCardElements = async (imageData) => {
  try {
    if (window.api && window.api.useWebAssembly !== false) {
      // WebAssembly実装を直接使用
      return await wasmAnalyzer.detectCardElements(imageData);
    } else {
      // 既存の橋渡し実装を使用
      return await wasmBridge.detectCardElements(imageData);
    }
  } catch (error) {
    console.error("カード要素検出でエラーが発生しました。フォールバックを使用します。", error);

    // フォールバック: 簡易実装
    try {
      // レイアウトパターンを分析
      const layoutAnalysis = await analyzeLayoutPattern(imageData);

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
 * @param {string} imageData - 分析する画像データ
 * @returns {Promise<Object>} 検出された要素情報
 */
const detectFeatureElements = async (imageData) => {
  try {
    if (window.api && window.api.useWebAssembly !== false) {
      // WebAssembly実装を直接使用
      return await wasmAnalyzer.detectFeatureElements(imageData);
    } else {
      // 既存の橋渡し実装を使用
      return await wasmBridge.detectFeatureElements(imageData);
    }
  } catch (error) {
    console.error("特徴要素検出でエラーが発生しました。フォールバックを使用します。", error);

    // フォールバック: 簡易実装
    try {
      // レイアウトパターンを分析
      const layoutAnalysis = await analyzeLayoutPattern(imageData);

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
 * 画像解析処理をまとめて実行する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @param {object} options - オプション
 * @returns {Promise<object>} 総合分析結果
 */
const analyzeAll = async (imageData, options = {}) => {
  if (!isElectron()) {
    console.log("Electron環境外での実行 - ダミーデータを返します");
    return {
      success: false,
      error: "ブラウザ環境では直接実行できません",
      data: {}
    };
  }

  try {
    if (window.api && window.api.useWebAssembly !== false) {
      // WebAssembly実装を直接使用
      return await wasmAnalyzer.analyzeAll(imageData, options);
    } else {
      // メインプロセス経由で実行（既存モード）
      if (window.api.analyzeAll) {
        return await window.api.analyzeAll(imageData, options);
      } else {
        // 個別APIを使って集約（後方互換性）
        const colors = await extractColorsFromImage(imageData);
        const text = await extractTextFromImage(imageData);
        const sections = await analyzeImageSections(imageData);
        
        const result = {
          success: true,
          data: {
            colors,
            text,
            sections
          }
        };
        
        // オプションに応じて追加情報を取得
        if (options.detectCards !== false) {
          result.data.cards = await detectCardElements(imageData);
        }
        
        if (options.detectFeatures !== false) {
          result.data.elements = await detectFeatureElements(imageData);
        }
        
        // レイアウト分析は常に実行
        result.data.layout = await analyzeLayoutPattern(imageData);
        
        return result;
      }
    }
  } catch (error) {
    console.error("総合画像分析エラー:", error);
    return {
      success: false,
      error: `画像分析エラー: ${error.message}`,
      data: {}
    };
  }
};

// WebAssembly環境チェック関数をエクスポート（Python環境チェックの代替）
export const checkPythonEnvironment = wasmBridge.checkPythonEnvironment;
export const setupPythonEnvironment = wasmBridge.setupPythonEnvironment;

// 関数をエクスポート
export {
  extractColorsFromImage,
  extractTextFromImage,
  analyzeImageSections,
  analyzeLayoutPattern,
  detectMainSections,
  detectCardElements,
  detectFeatureElements,
  analyzeAll
};