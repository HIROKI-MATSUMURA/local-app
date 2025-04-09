/**
 * Python画像解析ブリッジアダプター
 * 既存のimageAnalyzer.jsと同じインターフェースを提供しつつ、
 * 内部的にはPythonスクリプトを使用して処理を行う
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const log = require('electron-log');
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');
const isDev = require('electron-is-dev');

// Python処理ブリッジをインポート
const pythonBridge = require('../../../python_bridge');

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
  if (isDev) {
    // 開発モードでは、プロジェクトルートからのパス
    return path.join(process.cwd(), scriptName);
  } else {
    // 本番モードでは、extraResourcesからのパス
    return path.join(app.getAppPath(), '..', 'extraResources', scriptName);
  }
}

/**
 * Pythonインタープリタのパスを取得
 */
function getPythonInterpreter() {
  // 環境変数からPythonパスを取得試行
  const pythonEnvPath = process.env.PYTHON_PATH;

  if (pythonEnvPath && fs.existsSync(pythonEnvPath)) {
    return pythonEnvPath;
  }

  // OSごとのデフォルトPythonパスを試行
  const platform = os.platform();
  let pythonCommands = ['python3', 'python'];

  // WindowsではPythonがレジストリに登録されている可能性がある
  if (platform === 'win32') {
    pythonCommands = ['python', 'py'];
  }

  return pythonCommands[0]; // 単純化のため最初のコマンドを返す
}

/**
 * Pythonプロセスを初期化
 * @returns {Promise<boolean>} 初期化成功時はtrue
 */
async function initialize() {
  if (isInitialized && pythonProcess) {
    return true;
  }

  try {
    const pythonScript = getPythonScriptPath('python_server.py');
    const pythonInterpreter = getPythonInterpreter();

    log.info(`Pythonサーバーを起動します: ${pythonInterpreter} ${pythonScript}`);

    // Pythonプロセスを起動
    pythonProcess = spawn(pythonInterpreter, [pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    // 標準出力ハンドラ
    pythonProcess.stdout.on('data', handlePythonMessage);

    // 標準エラーハンドラ
    pythonProcess.stderr.on('data', handlePythonError);

    // プロセス終了ハンドラ
    pythonProcess.on('close', handlePythonExit);

    // 環境チェック
    const checkResult = await sendRequest('check_environment', {});

    if (checkResult.status === 'missing_dependencies') {
      log.info('必要なPythonパッケージをインストールします...');
      const setupResult = await sendRequest('setup_environment', {});

      if (!setupResult.success) {
        log.error('Pythonパッケージのインストールに失敗しました:', setupResult.message);
        return false;
      }

      log.info('Pythonパッケージのインストールが完了しました:', setupResult.message);
    }

    isInitialized = true;
    log.info('Pythonブリッジを初期化しました');
    return true;
  } catch (error) {
    log.error('Pythonブリッジの初期化に失敗しました:', error);
    return false;
  }
}

/**
 * Python処理サーバーにリクエストを送信
 * @param {string} command コマンド名
 * @param {object} params パラメータ
 * @returns {Promise<any>} レスポンス
 */
function sendRequest(command, params = {}) {
  return new Promise((resolve, reject) => {
    if (!pythonProcess || pythonProcess.killed) {
      reject(new Error('Pythonプロセスが実行されていません'));
      return;
    }

    // リクエストID生成
    const requestId = `req_${Date.now()}_${requestCounter++}`;

    // リクエストオブジェクト作成
    const request = {
      id: requestId,
      command,
      ...params
    };

    // コールバックを保存
    pendingRequests.set(requestId, { resolve, reject });

    // タイムアウト設定
    const timeoutMs = params.timeout || 30000; // デフォルト30秒
    const timeoutId = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error(`リクエストがタイムアウトしました: ${command}`));
      }
    }, timeoutMs);

    // プロミス完了時にタイムアウトをクリア
    const clearTimeoutAndForward = (result) => {
      clearTimeout(timeoutId);
      return result;
    };

    // プロミスにタイムアウトクリアを追加
    const originalResolve = pendingRequests.get(requestId).resolve;
    pendingRequests.set(requestId, {
      resolve: (value) => {
        clearTimeout(timeoutId);
        originalResolve(value);
      },
      reject: (reason) => {
        clearTimeout(timeoutId);
        reject(reason);
      }
    });

    try {
      // JSONリクエストをPythonプロセスに送信
      const requestString = JSON.stringify(request) + '\n';
      pythonProcess.stdin.write(requestString);
    } catch (error) {
      pendingRequests.delete(requestId);
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * リソースをクリーンアップし、Pythonプロセスを終了
 */
async function shutdown() {
  isShuttingDown = true;

  if (pythonProcess && !pythonProcess.killed) {
    try {
      // 正常終了をリクエスト
      await sendRequest('exit');
    } catch (error) {
      log.warn('Pythonプロセスの正常終了に失敗しました:', error);
    }

    // 強制終了
    try {
      pythonProcess.kill();
    } catch (error) {
      log.error('Pythonプロセスの強制終了に失敗しました:', error);
    }
  }

  // リソースのクリーンアップ
  pythonProcess = null;
  isInitialized = false;
  isShuttingDown = false;

  log.info('Pythonブリッジをシャットダウンしました');
}

/**
 * 画像の主要な色を抽出する
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<Array>} 抽出された色の配列
 */
const extractColorsFromImage = async (imageBase64) => {
  await initialize();
  return sendRequest('extract_colors', { image_data: imageBase64 });
};

/**
 * 画像からテキストを抽出する（OCR）
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<string>} 抽出されたテキスト
 */
const extractTextFromImage = async (imageBase64) => {
  await initialize();
  return sendRequest('extract_text', { image_data: imageBase64 });
};

/**
 * 画像のセクション分析機能
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<Array>} セクション分析結果
 */
const analyzeImageSections = async (imageBase64) => {
  await initialize();
  return sendRequest('analyze_sections', { image_data: imageBase64 });
};

/**
 * レイアウトパターンを分析する関数
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - レイアウトタイプとその確信度を含むオブジェクト
 */
const analyzeLayoutPattern = async (imagePath) => {
  await initialize();
  return sendRequest('analyze_layout', { image_data: imagePath });
};

/**
 * 画像内の特徴的な要素を検出する（ボタン、ヘッダー、リストなど）
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - 検出された要素の情報
 */
const detectFeatureElements = async (imagePath) => {
  await initialize();
  return sendRequest('detect_elements', { image_data: imagePath });
};

/**
 * 画像からメインセクション（ヘッダー、メイン、フッター）を検出する
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - 検出されたセクション情報
 */
const detectMainSections = async (imagePath) => {
  await initialize();
  return sendRequest('detect_main_sections', { image_data: imagePath });
};

/**
 * カード要素を検出する関数
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - カード要素の情報
 */
const detectCardElements = async (imagePath) => {
  await initialize();
  return sendRequest('detect_card_elements', { image_data: imagePath });
};

/**
 * 画像の総合分析
 * @param {string} imageBase64 Base64エンコードされた画像データ
 * @param {object} options オプション
 * @returns {Promise<object>} 画像分析結果
 */
const analyzeImage = async (imageBase64, options = {}) => {
  await initialize();
  return sendRequest('analyze_all', { image_data: imageBase64, options });
};

// アプリ終了時にクリーンアップを実行
if (app) {
  app.on('will-quit', async (event) => {
    event.preventDefault();
    await shutdown();
    app.exit();
  });
}

// 元のimageAnalyzer.jsと同じインターフェースでエクスポート
module.exports = {
  extractTextFromImage,
  extractColorsFromImage,
  analyzeImageSections,
  detectMainSections,
  detectCardElements,
  detectFeatureElements,
  analyzeLayoutPattern,
  analyzeImage
};
