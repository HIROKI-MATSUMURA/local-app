/**
 * Python画像解析ブリッジアダプター
 * 既存のimageAnalyzer.jsと同じインターフェースを提供しつつ、
 * 内部的にはPythonスクリプトを使用して処理を行う
 */

// Electron環境かどうかチェック
const isElectron = typeof window !== 'undefined' && window.api;
// すべてのAPIアクセスはwindow.apiを通して行う

// リクエストIDカウンター
let requestCounter = 0;

// リクエストコールバックマップ
const pendingRequests = new Map();

// Pythonプロセス参照
let pythonProcess = null;

// プロセス状態
let isInitialized = false;
let isShuttingDown = false;

// ログレベル設定
const LOG_LEVEL = {
  DEBUG: 3,
  INFO: 2,
  ERROR: 1,
  NONE: 0
};

// 現在のログレベル
const currentLogLevel = LOG_LEVEL.INFO;

// ロガー
const logger = {
  debug: (...args) => currentLogLevel >= LOG_LEVEL.DEBUG && console.debug('[Python Bridge]', ...args),
  info: (...args) => currentLogLevel >= LOG_LEVEL.INFO && console.info('[Python Bridge]', ...args),
  error: (...args) => currentLogLevel >= LOG_LEVEL.ERROR && console.error('[Python Bridge]', ...args)
};

/**
 * Pythonスクリプトの場所を取得
 */
function getPythonScriptPath(scriptName) {
  if (!isElectron) return null;

  // パス操作はwindow.api.pathを使用
  if (window.api && window.api.path) {
    return window.api.path.join(scriptName);
  }

  return scriptName;
}

/**
 * Pythonインタープリタのパスを取得
 */
function getPythonInterpreter() {
  if (!isElectron) return null;

  // OSごとのデフォルトPythonパスを試行
  let pythonCommands = ['python3', 'python'];

  // Windowsではpythonコマンドを優先
  if (navigator.platform.toLowerCase().includes('win')) {
    pythonCommands = ['python', 'py'];
  }

  return pythonCommands[0]; // 単純化のため最初のコマンドを返す
}

/**
 * Pythonプロセスを初期化
 * @returns {Promise<boolean>} 初期化成功時はtrue
 */
async function initialize() {
  if (!isElectron) {
    logger.info('ブラウザ環境ではPythonブリッジは利用できません');
    return false;
  }

  try {
    // APIを通じてPythonブリッジの初期化を実行
    if (window.api && window.api.startPythonBridge) {
      const result = await window.api.startPythonBridge();
      isInitialized = result.success;
      logger.info('Pythonブリッジ初期化結果:', result);
      return result.success;
    }

    logger.error('window.api.startPythonBridgeが見つかりません');
    return false;
  } catch (error) {
    logger.error('Pythonブリッジの初期化に失敗しました:', error);
    return false;
  }
}

/**
 * Pythonプロセスからのメッセージハンドラ
 */
function handlePythonMessage(data) {
  if (!isElectron) return;

  try {
    const messages = data.toString().trim().split('\n');

    for (const message of messages) {
      if (!message.trim()) continue;

      const response = JSON.parse(message);
      const requestId = response.id;

      if (pendingRequests.has(requestId)) {
        const { resolve } = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        resolve(response.result);
      }
    }
  } catch (error) {
    logger.error('Pythonメッセージの処理中にエラーが発生しました:', error);
  }
}

/**
 * Pythonプロセスからのエラーハンドラ
 */
function handlePythonError(data) {
  if (!isElectron) return;
  logger.error('Python Error:', data.toString());
}

/**
 * Pythonプロセス終了ハンドラ
 */
function handlePythonExit(code) {
  if (!isElectron) return;

  if (code !== 0 && !isShuttingDown) {
    logger.error(`Pythonプロセスが異常終了しました: 終了コード ${code}`);

    // 保留中のリクエストをすべて拒否
    for (const [id, { reject }] of pendingRequests.entries()) {
      reject(new Error('Pythonプロセスが終了しました'));
      pendingRequests.delete(id);
    }

    pythonProcess = null;
    isInitialized = false;
  } else {
    logger.info(`Pythonプロセスが終了しました: 終了コード ${code}`);
  }
}

/**
 * Python処理サーバーにリクエストを送信
 * @param {string} command コマンド名
 * @param {object} params パラメータ
 * @returns {Promise<any>} レスポンス
 */
function sendRequest(command, params = {}) {
  if (!isElectron) {
    return Promise.reject(new Error('ブラウザ環境ではPythonリクエストは実行できません'));
  }

  // APIを通じてリクエストを送信
  if (window.api) {
    return window.api[command] ? window.api[command](params) :
      Promise.reject(new Error(`APIメソッド ${command} が見つかりません`));
  }

  return Promise.reject(new Error('window.apiが見つかりません'));
}

/**
 * リソースをクリーンアップし、Pythonプロセスを終了
 */
async function shutdown() {
  if (!isElectron) {
    return;
  }

  isShuttingDown = true;

  // APIを通じてシャットダウン
  if (window.api && window.api.stopPythonBridge) {
    await window.api.stopPythonBridge();
  }

  isInitialized = false;
  isShuttingDown = false;
}

/**
 * Python環境をチェックする
 * @returns {Promise<Object>} 環境チェック結果
 */
export const checkPythonEnvironment = async () => {
  try {
    return await sendRequest('checkPythonEnvironment');
  } catch (error) {
    logger.error('Python環境チェックエラー:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Python環境をセットアップする
 * @returns {Promise<Object>} セットアップ結果
 */
export const setupPythonEnvironment = async () => {
  try {
    return await sendRequest('setupPythonEnvironment');
  } catch (error) {
    logger.error('Python環境セットアップエラー:', error);
    return { success: false, error: error.message };
  }
};

/**
 * レイアウトパターンを分析する
 * @param {string} imagePath - 画像パス
 * @returns {Promise<Object>} レイアウト情報
 */
export const analyzeLayoutPattern = async (imagePath) => {
  if (!isElectron) {
    return { success: false, data: { layoutType: 'unknown' }, error: 'ブラウザ環境では処理できません' };
  }

  try {
    return window.api.analyzeImage(imagePath, { type: 'layout' });
  } catch (error) {
    logger.error('レイアウト分析処理エラー:', error);
    return { success: false, data: { layoutType: 'unknown' }, error: error.message || String(error) };
  }
};

/**
 * サイトの特徴要素を検出する
 * @param {string} imagePath - 画像パス
 * @returns {Promise<Object>} 検出された要素情報
 */
export const detectFeatureElements = async (imagePath) => {
  if (!isElectron) {
    return { success: false, data: [], error: 'ブラウザ環境では処理できません' };
  }

  try {
    return window.api.analyzeImage(imagePath, { type: 'features' });
  } catch (error) {
    logger.error('特徴要素検出処理エラー:', error);
    return { success: false, data: [], error: error.message || String(error) };
  }
};

/**
 * メインセクションを検出する
 * @param {string} imagePath - 画像パス
 * @returns {Promise<Object>} 検出されたセクション情報
 */
export const detectMainSections = async (imagePath) => {
  if (!isElectron) {
    return { success: false, data: [], error: 'ブラウザ環境では処理できません' };
  }

  try {
    return window.api.analyzeImage(imagePath, { type: 'sections' });
  } catch (error) {
    logger.error('メインセクション検出処理エラー:', error);
    return { success: false, data: [], error: error.message || String(error) };
  }
};

/**
 * カード要素を検出する
 * @param {string} imagePath - 画像パス
 * @returns {Promise<Object>} 検出されたカード要素情報
 */
export const detectCardElements = async (imagePath) => {
  if (!isElectron) {
    return { success: false, data: [], error: 'ブラウザ環境では処理できません' };
  }

  try {
    return window.api.analyzeImage(imagePath, { type: 'cards' });
  } catch (error) {
    logger.error('カード要素検出処理エラー:', error);
    return { success: false, data: [], error: error.message || String(error) };
  }
};

/**
 * 画像を包括的に解析する
 * @param {string} imageBase64 - Base64形式の画像データ
 * @param {Object} options - 解析オプション
 * @returns {Promise<Object>} 解析結果
 */
export const analyzeImage = async (imageBase64, options = {}) => {
  if (!isElectron) {
    return { success: false, data: {}, error: 'ブラウザ環境では処理できません' };
  }

  try {
    return window.api.analyzeImage({ image: imageBase64, ...options });
  } catch (error) {
    logger.error('画像解析処理エラー:', error);
    return { success: false, data: {}, error: error.message || String(error) };
  }
};
