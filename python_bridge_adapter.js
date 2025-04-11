/**
 * Python Bridge Adapter
 * ElectronアプリケーションからPythonスクリプトを実行し、結果を処理するためのモジュール
 */

// Node.js環境かブラウザ環境かを判定
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

// Node.js環境でのみ必要なモジュールを条件付きでロード
let spawn, path, fs, os, log;

if (isNode) {
  try {
    // Node.js環境の場合のみ、requireを使用
    spawn = require('child_process').spawn;
    path = require('path');
    fs = require('fs');
    os = require('os');
    try {
      log = require('electron-log');
    } catch (e) {
      // electron-logが利用できない場合はコンソールを代用
      log = {
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug
      };
    }
  } catch (error) {
    console.warn('Electronモジュールをロードできませんでした - ブラウザ環境として続行します:', error);
    isNode = false;
  }
}

// ブラウザ環境では、ダミーのログオブジェクトとパスオブジェクトを作成
if (!isNode) {
  log = {
    info: (...args) => console.info('[Log]', ...args),
    warn: (...args) => console.warn('[Log]', ...args),
    error: (...args) => console.error('[Log]', ...args),
    debug: (...args) => console.debug('[Log]', ...args)
  };

  // ブラウザ環境用のダミーパスオブジェクト
  path = {
    join: (...parts) => {
      // 各パーツを検証して安全に変換
      const validParts = parts.map(part => {
        // null/undefinedは空文字列に
        if (part === null || part === undefined) return '';

        // オブジェクトや配列は空文字列に
        if (typeof part === 'object') {
          console.warn('path.join: オブジェクト型の値が渡されました:', part);
          return '';
        }

        // 特殊な値も空文字列に
        if (part === '' || Number.isNaN(part) || part === Infinity || part === -Infinity) {
          console.warn('path.join: 特殊な値が渡されました:', part);
          return '';
        }

        // それ以外は文字列変換を試みる
        try {
          return String(part);
        } catch (error) {
          console.error('path.join: 文字列変換に失敗しました:', error);
          return '';
        }
      });

      // 空でない値だけを結合
      return validParts.filter(Boolean).join('/').replace(/\/+/g, '/');
    },
    resolve: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (p) => p.split('/').slice(0, -1).join('/'),
    basename: (p) => p.split('/').pop()
  };

  // ダミーのosオブジェクト
  os = {
    tmpdir: () => '/tmp',
    platform: () => 'browser'
  };
}

// 設定
const CONFIG = {
  // Pythonコマンド (環境によって'python'または'python3')
  pythonCommand: isNode && process.platform === 'win32' ? 'python' : 'python3',

  // スクリプトパス (アプリルートからの相対パス)
  analyzerScript: 'image_analyzer.py',
  setupScript: 'python_setup.py',

  // ログパス
  logPath: isNode ? path.join(os.tmpdir(), 'electron-image-analyzer-bridge.log') : null,

  // タイムアウト設定 (ミリ秒)
  timeout: 30000,

  // デバッグモード
  debug: isNode && process.env.NODE_ENV === 'development'
};

// ブラウザ環境ではダミー関数を提供
if (!isNode) {
  // 全ての関数をラップしてダミー実装を提供
  const createDummyFunction = (functionName) => {
    return async function (...args) {
      console.warn(`[python_bridge_adapter] ${functionName} はブラウザでは動作しません`);
      return {
        success: false,
        error: 'この機能はElectronアプリケーション内でのみ利用可能です',
        browserEnvironment: true
      };
    };
  };

  // すべての関数をダミー実装で公開
  module.exports = {
    initializePythonBridge: createDummyFunction('initializePythonBridge'),
    checkPythonVersion: createDummyFunction('checkPythonVersion'),
    checkRequiredScripts: createDummyFunction('checkRequiredScripts'),
    verifyPythonEnvironment: createDummyFunction('verifyPythonEnvironment'),
    installPythonPackages: createDummyFunction('installPythonPackages'),
    extractColorsFromImage: createDummyFunction('extractColorsFromImage'),
    extractTextFromImage: createDummyFunction('extractTextFromImage'),
    analyzeImageSections: createDummyFunction('analyzeImageSections'),
    analyzeLayoutPattern: createDummyFunction('analyzeLayoutPattern'),
    detectMainSections: createDummyFunction('detectMainSections'),
    detectCardElements: createDummyFunction('detectCardElements'),
    detectFeatureElements: createDummyFunction('detectFeatureElements')
  };
} else {
  // 以下はNode.js環境でのみ実行される

  /**
   * ブリッジ初期化 - Python環境のチェックとセットアップ
   * @returns {Promise<boolean>} セットアップ成功の場合はtrue
   */
  async function initializePythonBridge() {
    try {
      log.info('Python Bridge: 初期化を開始します');

      // Python実行可能かチェック
      const pythonVersion = await checkPythonVersion();
      log.info(`Python Bridge: Python ${pythonVersion} を検出しました`);

      // 必要なスクリプトが存在するかチェック
      await checkRequiredScripts();

      // Python環境検証
      const setupResult = await verifyPythonEnvironment();

      if (setupResult.success) {
        log.info('Python Bridge: 初期化に成功しました');
        return true;
      } else {
        log.warn(`Python Bridge: 初期化に問題があります: ${setupResult.message}`);
        return false;
      }
    } catch (error) {
      log.error(`Python Bridge: 初期化エラー: ${error.message}`);
      return false;
    }
  }

  /**
   * Pythonバージョンチェック
   * @returns {Promise<string>} Pythonバージョン
   */
  async function checkPythonVersion() {
    return new Promise((resolve, reject) => {
      const python = spawn(CONFIG.pythonCommand, ['--version']);
      let versionOutput = '';

      python.stdout.on('data', (data) => {
        versionOutput += data.toString();
      });

      python.stderr.on('data', (data) => {
        versionOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          // Python --version の出力から数字部分を抽出
          const versionMatch = versionOutput.match(/Python\s+(\d+\.\d+\.\d+)/i);
          if (versionMatch && versionMatch[1]) {
            resolve(versionMatch[1]);
          } else {
            resolve('不明なバージョン');
          }
        } else {
          reject(new Error(`Pythonコマンド実行エラー (${code}): ${versionOutput}`));
        }
      });
    });
  }

  /**
   * 必要なPythonスクリプトが存在するかチェック
   */
  async function checkRequiredScripts() {
    const appRoot = getAppRoot();
    const scripts = [CONFIG.analyzerScript, CONFIG.setupScript];

    for (const scriptName of scripts) {
      const scriptPath = path.join(appRoot, scriptName);

      try {
        await fs.promises.access(scriptPath, fs.constants.F_OK);
        log.info(`Python Bridge: スクリプトが見つかりました: ${scriptPath}`);
      } catch (error) {
        log.error(`Python Bridge: スクリプトが見つかりません: ${scriptPath}`);
        throw new Error(`必要なスクリプトが見つかりません: ${scriptName}`);
      }
    }
  }

  /**
   * Python環境検証とセットアップ
   * @returns {Promise<Object>} セットアップ結果
   */
  async function verifyPythonEnvironment() {
    const appRoot = getAppRoot();
    const setupScriptPath = path.join(appRoot, CONFIG.setupScript);

    // --verify-onlyオプションでチェックのみ実行
    return new Promise((resolve) => {
      log.info('Python Bridge: 環境検証を開始します');

      const python = spawn(CONFIG.pythonCommand, [setupScriptPath, '--verify-only']);
      let stdoutData = '';
      let stderrData = '';

      python.stdout.on('data', (data) => {
        const output = data.toString();
        stdoutData += output;
        if (CONFIG.debug) log.debug(`Python setup stdout: ${output}`);
      });

      python.stderr.on('data', (data) => {
        const output = data.toString();
        stderrData += output;
        log.warn(`Python setup stderr: ${output}`);
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: '環境検証に成功しました'
          });
        } else {
          // 検証に失敗した場合は、インストールを実行
          installPythonPackages()
            .then(installResult => {
              resolve(installResult);
            })
            .catch(error => {
              resolve({
                success: false,
                message: `パッケージのインストールに失敗しました: ${error.message}`
              });
            });
        }
      });
    });
  }

  /**
   * 必要なPythonパッケージをインストール
   * @returns {Promise<Object>} インストール結果
   */
  async function installPythonPackages() {
    const appRoot = getAppRoot();
    const setupScriptPath = path.join(appRoot, CONFIG.setupScript);

    return new Promise((resolve) => {
      log.info('Python Bridge: パッケージインストールを開始します');

      const python = spawn(CONFIG.pythonCommand, [setupScriptPath]);
      let stdoutData = '';
      let stderrData = '';

      python.stdout.on('data', (data) => {
        const output = data.toString();
        stdoutData += output;
        if (CONFIG.debug) log.debug(`Python install stdout: ${output}`);
      });

      python.stderr.on('data', (data) => {
        const output = data.toString();
        stderrData += output;
        log.warn(`Python install stderr: ${output}`);
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: 'パッケージインストールに成功しました'
          });
        } else {
          resolve({
            success: false,
            message: `パッケージインストールに失敗しました (コード: ${code})`
          });
        }
      });
    });
  }

  /**
   * 画像から色情報を抽出する
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {Promise<Object>} 色情報
   */
  async function extractColorsFromImage(imageBase64) {
    try {
      const result = await runPythonAnalysis('extract_colors', { image: imageBase64 });
      return result;
    } catch (error) {
      log.error(`色抽出エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 画像からテキストを抽出する (OCR)
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {Promise<Object>} 抽出されたテキスト情報
   */
  async function extractTextFromImage(imageBase64) {
    try {
      const result = await runPythonAnalysis('extract_text', { image: imageBase64 });
      return result;
    } catch (error) {
      log.error(`テキスト抽出エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 画像のセクション分析を行う
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {Promise<Object>} セクション分析結果
   */
  async function analyzeImageSections(imageBase64) {
    try {
      const result = await runPythonAnalysis('analyze_sections', { image: imageBase64 });
      return result;
    } catch (error) {
      log.error(`セクション分析エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 画像のレイアウトパターンを分析する
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {Promise<Object>} レイアウト分析結果
   */
  async function analyzeLayoutPattern(imageBase64) {
    try {
      const result = await runPythonAnalysis('analyze_layout', { image: imageBase64 });
      return result;
    } catch (error) {
      log.error(`レイアウト分析エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 画像のメインセクションを検出する
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {Promise<Object>} メインセクション情報
   */
  async function detectMainSections(imageBase64) {
    try {
      const result = await runPythonAnalysis('detect_sections', { image: imageBase64 });
      return result;
    } catch (error) {
      log.error(`メインセクション検出エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * カード要素を検出する
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {Promise<Object>} カード要素情報
   */
  async function detectCardElements(imageBase64) {
    try {
      const result = await runPythonAnalysis('detect_cards', { image: imageBase64 });
      return result;
    } catch (error) {
      log.error(`カード要素検出エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 特徴的な要素を検出する
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {Promise<Object>} 特徴的な要素情報
   */
  async function detectFeatureElements(imageBase64) {
    try {
      const result = await runPythonAnalysis('detect_features', { image: imageBase64 });
      return result;
    } catch (error) {
      log.error(`特徴的要素検出エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pythonスクリプトを実行して画像分析を行う
   * @param {string} analysisType - 分析タイプ
   * @param {Object} params - パラメータ
   * @returns {Promise<Object>} 分析結果
   */
  async function runPythonAnalysis(analysisType, params) {
    const appRoot = getAppRoot();
    const scriptPath = path.join(appRoot, CONFIG.analyzerScript);

    // 一時ファイルに画像データを保存（大きなデータはコマンドライン引数で渡せない）
    const tmpImagePath = await saveImageToTempFile(params.image);

    return new Promise((resolve, reject) => {
      // コマンド実行のタイムアウト設定
      const timeoutId = setTimeout(() => {
        python.kill();
        cleanupTempFile(tmpImagePath);
        reject(new Error(`Python実行がタイムアウトしました (${CONFIG.timeout}ms)`));
      }, CONFIG.timeout);

      // 引数を準備
      const args = [
        scriptPath,
        '--type', analysisType,
        '--input', tmpImagePath,
        '--format', 'json'
      ];

      if (CONFIG.debug) {
        log.debug(`Python実行: ${CONFIG.pythonCommand} ${args.join(' ')}`);
      }

      const python = spawn(CONFIG.pythonCommand, args);
      let stdoutData = '';
      let stderrData = '';

      // 標準出力からデータを収集
      python.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      // 標準エラー出力からデータを収集
      python.stderr.on('data', (data) => {
        stderrData += data.toString();
        if (CONFIG.debug) log.debug(`Python stderr: ${data.toString()}`);
      });

      // プロセス終了時の処理
      python.on('close', (code) => {
        clearTimeout(timeoutId);
        cleanupTempFile(tmpImagePath);

        if (code === 0) {
          try {
            // JSONをパース
            const result = JSON.parse(stdoutData);
            resolve(result);
          } catch (error) {
            log.error(`Python出力のJSONパースエラー: ${error.message}`);
            log.error(`受信データ: ${stdoutData}`);
            reject(new Error('Python出力の解析に失敗しました'));
          }
        } else {
          log.error(`Python実行エラー (コード: ${code}): ${stderrData}`);
          reject(new Error(`Python実行エラー (コード: ${code})`));
        }
      });

      // エラーハンドリング
      python.on('error', (error) => {
        clearTimeout(timeoutId);
        cleanupTempFile(tmpImagePath);
        log.error(`Python起動エラー: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Base64画像データを一時ファイルに保存
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {Promise<string>} 一時ファイルのパス
   */
  async function saveImageToTempFile(imageBase64) {
    // Base64ヘッダーを削除
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // 一時ファイル名を生成
    const tmpFilePath = path.join(
      os.tmpdir(),
      `electron-image-analyzer-${Date.now()}.png`
    );

    try {
      await fs.promises.writeFile(tmpFilePath, imageBuffer);
      return tmpFilePath;
    } catch (error) {
      log.error(`一時ファイル作成エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * 一時ファイルを削除
   * @param {string} filePath - 削除するファイルパス
   */
  function cleanupTempFile(filePath) {
    fs.unlink(filePath, (err) => {
      if (err) {
        log.warn(`一時ファイル削除エラー: ${err.message}`);
      }
    });
  }

  /**
   * アプリのルートディレクトリを取得
   * @returns {string} アプリのルートディレクトリ
   */
  function getAppRoot() {
    // 開発モードと本番モードでパスが異なる場合がある
    if (process.env.NODE_ENV === 'production') {
      // 本番環境では、アプリリソースパスを使用
      return process.resourcesPath;
    } else {
      // 開発環境では、現在のディレクトリを使用
      return process.cwd();
    }
  }

  // モジュールをエクスポート
  module.exports = {
    initializePythonBridge,
    checkPythonVersion,
    checkRequiredScripts,
    verifyPythonEnvironment,
    installPythonPackages,
    extractColorsFromImage,
    extractTextFromImage,
    analyzeImageSections,
    analyzeLayoutPattern,
    detectMainSections,
    detectCardElements,
    detectFeatureElements
  };
}
