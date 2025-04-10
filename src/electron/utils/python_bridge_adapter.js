/**
 * Python画像解析ブリッジアダプター
 * 既存のimageAnalyzer.jsと同じインターフェースを提供しつつ、
 * 内部的にはPythonスクリプトを使用して処理を行う
 */

// Electron環境かどうかチェック
const isElectron = typeof window !== 'undefined' && window.api;
let childProcess, path, fs, os, electronLog, app, uuid, isDev, pythonBridge;

// Electron環境の場合のみモジュールをロード
if (isElectron) {
  try {
    // Electronのrequireを使用
    const _require = window.require || require;

    if (typeof _require === 'function') {
      const electron = _require('electron');
      childProcess = _require('child_process');
      path = _require('path');
      fs = _require('fs');
      os = _require('os');
      electronLog = _require('electron-log');
      app = electron.remote ? electron.remote.app : null;
      try {
        const { v4: uuidv4 } = _require('uuid');
        uuid = { v4: uuidv4 };
      } catch (err) {
        console.warn('UUID モジュールをロードできませんでした:', err);
        uuid = { v4: () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
      }
      isDev = _require('electron-is-dev');

      try {
        pythonBridge = _require('../../../python_bridge');
      } catch (bridgeErr) {
        console.warn('Python ブリッジをロードできませんでした:', bridgeErr);
      }
    } else {
      console.warn('requireが利用できません - ブラウザ環境と判断します');
    }
  } catch (err) {
    console.warn('Electronモジュールをロードできませんでした - ブラウザ環境として続行します:', err);
  }
}

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
  if (!isElectron) return null;

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
  if (!isElectron) {
    logger.info('ブラウザ環境ではPythonブリッジは利用できません');
    return false;
  }

  if (isInitialized && pythonProcess) {
    return true;
  }

  try {
    const pythonScript = getPythonScriptPath('python_server.py');
    const pythonInterpreter = getPythonInterpreter();

    logger.info(`Pythonサーバーを起動します: ${pythonInterpreter} ${pythonScript}`);

    // Pythonプロセスを起動
    pythonProcess = childProcess.spawn(pythonInterpreter, [pythonScript], {
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
      logger.info('必要なPythonパッケージをインストールします...');
      const setupResult = await sendRequest('setup_environment', {});

      if (!setupResult.success) {
        logger.error('Pythonパッケージのインストールに失敗しました:', setupResult.message);
        return false;
      }

      logger.info('Pythonパッケージのインストールが完了しました:', setupResult.message);
    }

    isInitialized = true;
    logger.info('Pythonブリッジを初期化しました');
    return true;
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
  if (!isElectron) return;

  isShuttingDown = true;

  if (pythonProcess && !pythonProcess.killed) {
    try {
      // 正常終了をリクエスト
      await sendRequest('exit');
    } catch (error) {
      logger.warn('Pythonプロセスの正常終了に失敗しました:', error);
    }

    // 強制終了
    try {
      pythonProcess.kill();
    } catch (error) {
      logger.error('Pythonプロセスの強制終了に失敗しました:', error);
    }
  }

  // リソースのクリーンアップ
  pythonProcess = null;
  isInitialized = false;
  isShuttingDown = false;

  logger.info('Pythonブリッジをシャットダウンしました');
}

/**
 * 画像の主要な色を抽出する
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<Array>} 抽出された色の配列
 */
export const extractColorsFromImage = async (imageBase64) => {
  if (!isElectron) {
    console.warn(`[python_bridge_adapter] extractColorsFromImage はブラウザでは動作しません`);
    return [];
  }

  await initialize();
  return sendRequest('extract_colors', { image_data: imageBase64 });
};

/**
 * 画像からテキストを抽出する（OCR）
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<string>} 抽出されたテキスト
 */
export const extractTextFromImage = async (imageBase64) => {
  if (!isElectron) {
    console.warn(`[python_bridge_adapter] extractTextFromImage はブラウザでは動作しません`);
    return "";
  }

  await initialize();
  return sendRequest('extract_text', { image_data: imageBase64 });
};

/**
 * 画像のセクション分析機能
 * @param {string} imageBase64 - Base64形式の画像データ
 * @returns {Promise<Array>} セクション情報の配列
 */
export const analyzeImageSections = async (imageBase64) => {
  if (!isElectron) {
    console.warn(`[python_bridge_adapter] analyzeImageSections はブラウザでは動作しません`);
    return [];
  }

  await initialize();
  return sendRequest('analyze_sections', { image_data: imageBase64 });
};

/**
 * レイアウトパターンを分析する
 * @param {string} imagePath - 画像パス
 * @returns {Promise<Object>} レイアウト情報
 */
export const analyzeLayoutPattern = async (imagePath) => {
  if (!isElectron) {
    console.warn(`[python_bridge_adapter] analyzeLayoutPattern はブラウザでは動作しません`);
    return { layoutType: "unknown", confidence: 0.5 };
  }

  await initialize();
  return sendRequest('analyze_layout', { image_path: imagePath });
};

/**
 * サイトの特徴要素を検出する
 * @param {string} imagePath - 画像パス
 * @returns {Promise<Object>} 検出された要素情報
 */
export const detectFeatureElements = async (imagePath) => {
  if (!isElectron) {
    console.warn(`[python_bridge_adapter] detectFeatureElements はブラウザでは動作しません`);
    return { elements: [] };
  }

  await initialize();
  return sendRequest('detect_features', { image_path: imagePath });
};

/**
 * メインセクションを検出する
 * @param {string} imagePath - 画像パス
 * @returns {Promise<Object>} 検出されたセクション情報
 */
export const detectMainSections = async (imagePath) => {
  if (!isElectron) {
    console.warn(`[python_bridge_adapter] detectMainSections はブラウザでは動作しません`);
    return { sections: [] };
  }

  await initialize();
  return sendRequest('detect_sections', { image_path: imagePath });
};

/**
 * カード要素を検出する
 * @param {string} imagePath - 画像パス
 * @returns {Promise<Object>} 検出されたカード要素情報
 */
export const detectCardElements = async (imagePath) => {
  if (!isElectron) {
    console.warn(`[python_bridge_adapter] detectCardElements はブラウザでは動作しません`);
    return { cards: [] };
  }

  await initialize();
  return sendRequest('detect_cards', { image_path: imagePath });
};

/**
 * 画像を包括的に解析する
 * @param {string} imageBase64 - Base64形式の画像データ
 * @param {Object} options - 解析オプション
 * @returns {Promise<Object>} 解析結果
 */
export const analyzeImage = async (imageBase64, options = {}) => {
  if (!isElectron) {
    console.warn(`[python_bridge_adapter] analyzeImage はブラウザでは動作しません`);
    return { success: false, reason: "ブラウザ環境では実行できません" };
  }

  await initialize();
  return sendRequest('analyze_image', {
    image_data: imageBase64,
    options
  });
};
