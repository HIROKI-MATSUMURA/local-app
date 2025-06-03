/**
 * 画像分析ユーティリティ
 * WebAssembly実装による画像処理機能を提供します
 * 高性能かつクロスプラットフォーム対応の画像解析機能
 */

// OpenCV.js と Tesseract.js の動的インポート
let cv, createWorker;

// 開発モードかどうかを確認（ブラウザ環境では安全にチェック）
const isDevelopment = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development';

// 不要な環境チェックコードを削除

// WebAssembly版の画像分析ユーティリティの動的インポート
let wasmAnalyzer, wasmBridge;

/**
 * 必要なモジュールを動的に初期化
 */
const initializeModules = async () => {
  if (!wasmAnalyzer || !wasmBridge) {
    try {
      console.log('WebAssemblyモジュールを初期化中...');

      // 動的インポートでモジュールを読み込み
      const wasmAnalyzerModule = await import('../public/webassembly-image-analyzer.js');
      const wasmBridgeModule = await import('./webassembly-bridge-adapter.js');

      // defaultエクスポートを使用
      wasmAnalyzer = wasmAnalyzerModule.default;
      wasmBridge = wasmBridgeModule.default;

      console.log('wasmAnalyzer初期化:', wasmAnalyzer ? '成功' : '失敗');
      console.log('wasmBridge初期化:', wasmBridge ? '成功' : '失敗');

      // OpenCV.js と Tesseract.js も初期化
      if (typeof window !== 'undefined') {
        cv = window.cv;
        const tesseractModule = await import('tesseract.js');
        createWorker = tesseractModule.createWorker;
      }

      console.log('WebAssemblyモジュール初期化完了');
    } catch (error) {
      console.error('モジュール初期化エラー:', error);
      throw error;
    }
  }
};

/**
 * 画像の主要な色を抽出する
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {Promise<Array>} 抽出された色のリスト
 */
const extractColorsFromImage = async (imageBase64) => {
  try {
    // モジュールを初期化
    await initializeModules();

    // WebAssembly実装で色抽出を実行
    const colors = await wasmAnalyzer.extractColorsFromImage(imageBase64);
    return colors;
  } catch (error) {
    console.error("色抽出エラー:", error);
    throw error;
  }
};

/**
 * 画像からテキストを抽出する（OCR）
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {Promise<string|object>} 抽出されたテキスト
 */
const extractTextFromImage = async (imageBase64) => {
  try {
    // モジュールを初期化
    await initializeModules();

    // WebAssembly実装でテキスト抽出を実行
    const result = await wasmAnalyzer.extractTextFromImage(imageBase64);
    return result.text || '';
  } catch (error) {
    console.error("テキスト抽出エラー:", error);
    throw error;
  }
};

/**
 * 画像のセクション分析機能
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {Promise<Array>} セクション情報の配列
 */
const analyzeImageSections = async (imageBase64) => {
  try {
    // モジュールを初期化
    await initializeModules();

    // WebAssembly実装でセクション分析を実行
    const sections = await wasmAnalyzer.analyzeImageSections(imageBase64);
    return sections;
  } catch (error) {
    console.error("セクション分析エラー:", error);
    throw error;
  }
};

/**
 * レイアウトパターンを分析する関数
 * @param {string} imageData - 分析する画像データ
 * @returns {Promise<Object>} - レイアウトタイプとその確信度を含むオブジェクト
 */
const analyzeLayoutPattern = async (imageData) => {
  try {
    // モジュールを初期化
    await initializeModules();

    // WebAssembly実装でレイアウト分析を実行
    return await wasmAnalyzer.analyzeLayoutPattern(imageData);
  } catch (error) {
    console.error("レイアウト分析エラー:", error);
    throw error;
  }
};


/**
 * 画像からヘッダー、メイン、フッターセクションを推測
 * @param {string} imageData - 分析する画像データ
 * @returns {Promise<Object>} セクション情報
 */
const detectMainSections = async (imageData) => {
  try {
    // モジュールを初期化
    await initializeModules();

    // WebAssembly実装でメインセクション検出を実行
    return await wasmAnalyzer.detectMainSections(imageData);
  } catch (error) {
    console.error("メインセクション検出エラー:", error);
    throw error;
  }
};

/**
 * カード要素を検出する
 * @param {string} imageData - 分析する画像データ
 * @returns {Promise<Object>} 検出されたカード要素情報
 */
const detectCardElements = async (imageData) => {
  try {
    // モジュールを初期化
    await initializeModules();

    // WebAssembly実装でカード要素検出を実行
    return await wasmAnalyzer.detectCardElements(imageData);
  } catch (error) {
    console.error("カード要素検出エラー:", error);
    throw error;
  }
};


/**
 * 特徴的な要素（ボタン、フォーム、ナビゲーションなど）を検出
 * @param {string} imageData - 分析する画像データ
 * @returns {Promise<Object>} 検出された要素情報
 */
const detectFeatureElements = async (imageData) => {
  try {
    // モジュールを初期化
    await initializeModules();

    // WebAssembly実装で特徴要素検出を実行
    return await wasmAnalyzer.detectFeatureElements(imageData);
  } catch (error) {
    console.error("特徴要素検出エラー:", error);
    throw error;
  }
};


/**
 * 画像解析処理をまとめて実行する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @param {object} options - オプション
 * @returns {Promise<object>} 総合分析結果
 */
const analyzeAll = async (imageData, options = {}) => {
  try {
    // モジュールを初期化
    await initializeModules();

    // WebAssembly実装で総合分析を実行
    return await wasmAnalyzer.analyzeAll(imageData, options);
  } catch (error) {
    console.error("総合画像分析エラー:", error);
    throw error;
  }
};

// 環境チェック関数（動的に初期化される）
const checkEnvironment = async () => {
  await initializeModules();
  return wasmBridge.checkEnvironment();
};

const setupEnvironment = async () => {
  await initializeModules();
  return wasmBridge.setupEnvironment();
};

// CommonJS形式でエクスポート
const moduleExports = {
  // WebAssembly環境チェック関数
  checkEnvironment,
  setupEnvironment,
  // 後方互換性のため
  checkPythonEnvironment: checkEnvironment,
  setupPythonEnvironment: setupEnvironment,
  // 画像解析関数
  extractColorsFromImage,
  extractTextFromImage,
  analyzeImageSections,
  analyzeLayoutPattern,
  detectMainSections,
  detectCardElements,
  detectFeatureElements,
  analyzeAll
};

// CommonJS形式でエクスポート
module.exports = moduleExports;
