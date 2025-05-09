// Electron と基本モジュールの読み込み
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fsSync = require('fs');
// 環境フラグ
const isNode = typeof window === 'undefined' || (process && process.versions && process.versions.node);
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;

// プロジェクトルート（python_server.py の参照に使用）
const APP_ROOT = path.resolve(__dirname, '..', '..');

// Node.js 専用モジュール
let spawn, fs, os, crypto;
if (isNode) {
  spawn = require('child_process').spawn;
  fs = require('fs').promises;
  os = require('os');
  crypto = require('crypto');
} else {
  // ブラウザ環境用のダミーオブジェクト
  console.log('ブラウザ環境を検出しました：Pythonブリッジは限定機能で動作します');

  // ダミーのパスオブジェクト
  path = {
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    resolve: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (p) => p.split('/').slice(0, -1).join('/'),
    basename: (p) => p.split('/').pop()
  };

  // ダミーのosオブジェクト
  os = {
    tmpdir: () => '/tmp',
    platform: () => 'browser'
  };

  // ダミーのcryptoオブジェクト
  crypto = {
    randomUUID: () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  };
}

// プラットフォーム検出
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// Python実行環境の検出関数
async function detectPythonExecutable() {
  console.log('Python実行環境を検出しています...');

  // 候補となるPythonコマンド
  const candidates = isWindows
    ? ['python', 'python3', 'py -3', 'py']
    : ['python3', 'python3.9', 'python3.10', 'python3.11', 'python'];

  // 環境変数PATHから検索するコマンド
  const candidateResults = [];

  for (const cmd of candidates) {
    try {
      // バージョン確認コマンドを実行
      const { stdout } = await execAsync(`${cmd} --version`);
      const version = stdout.trim();
      candidateResults.push({ cmd, version, valid: true });
      console.log(`Python検出: ${cmd} -> ${version}`);
    } catch (error) {
      candidateResults.push({ cmd, valid: false, error: error.message });
      console.log(`Python検出失敗: ${cmd} -> ${error.message}`);
    }
  }

  // 有効なPythonコマンドを探す
  const validPython = candidateResults.find(result => result.valid);

  if (validPython) {
    console.log(`有効なPython実行環境を検出: ${validPython.cmd} (${validPython.version})`);
    return validPython.cmd;
  }

  // 開発環境の場合は追加の検索
  if (!app.isPackaged) {
    // プロジェクトのvenvを確認
    const venvPaths = isWindows
      ? [
        path.join(APP_ROOT, 'venv', 'Scripts', 'python.exe'),
        path.join(APP_ROOT, '.venv', 'Scripts', 'python.exe')
      ]
      : [
        path.join(APP_ROOT, 'venv', 'bin', 'python'),
        path.join(APP_ROOT, '.venv', 'bin', 'python')
      ];

    for (const venvPath of venvPaths) {
      if (fsSync.existsSync(venvPath)) {
        console.log(`仮想環境のPythonを検出: ${venvPath}`);
        return venvPath;
      }
    }
  }

  // 本番環境の場合はバンドルされたPythonを確認
  if (app.isPackaged) {
    const bundledPythonPaths = isWindows
      ? [
        path.join(APP_ROOT, 'python_env', 'python.exe'),
        path.join(app.getPath('userData'), 'python_env', 'python.exe')
      ]
      : [
        path.join(APP_ROOT, 'python_env', 'bin', 'python3'),
        path.join(app.getPath('userData'), 'python_env', 'bin', 'python3')
      ];

    for (const bundledPath of bundledPythonPaths) {
      if (fsSync.existsSync(bundledPath)) {
        console.log(`バンドルされたPythonを検出: ${bundledPath}`);
        return bundledPath;
      }
    }
  }

  // デフォルトのコマンドを返す
  console.warn('有効なPython実行環境を検出できませんでした。デフォルトを使用します。');
  return isWindows ? 'python' : 'python3';
}

// Pythonコマンドの初期化（実行前に検出）
let PYTHON_CMD = null;
let pythonDetectionPromise = null;

// Python検出の遅延初期化
function initPythonCmd() {
  if (pythonDetectionPromise === null) {
    pythonDetectionPromise = detectPythonExecutable()
      .then(pythonPath => {
        PYTHON_CMD = pythonPath;
        if (!PYTHON_CMD) {
          console.error('Python実行環境が見つかりませんでした。アプリケーションの一部機能が制限されます。');
          PYTHON_CMD = isWindows ? 'python' : 'python3'; // 最後の手段
        }
        console.log(`Python実行コマンド設定: ${PYTHON_CMD}`);
        return PYTHON_CMD;
      })
      .catch(err => {
        console.error('Python検出中にエラーが発生しました:', err);
        PYTHON_CMD = isWindows ? 'python' : 'python3'; // エラー時のフォールバック
        return PYTHON_CMD;
      });
  }
  return pythonDetectionPromise;
}

console.log(`Python実行コマンド: ${PYTHON_CMD}, 開発環境: ${isDevelopment}`);

/**
 * Python処理ブリッジクラス
 * 単一のPythonプロセスを管理し、JSONベースの通信プロトコルを使用
 */
class PythonBridge {
  constructor() {
    this.pythonProcess = null;
    this.requestMap = new Map();
    this.isStarting = false;
    this.requestQueue = [];
    this.restartCount = 0;
    this.maxRestarts = 5;
    this.responseBuffer = '';

    // メモリ管理のための追加プロパティ
    this.processCounter = 0;
    this.MAX_PROCESSES_BEFORE_RESTART = 20;
    this.memoryMonitorInterval = null;
    this.memoryThreshold = 500 * 1024 * 1024; // 500MB
    this.isIdle = true;

    // バッファプール
    this.bufferPool = new BufferPool();
  }


  /**
   * Pythonプロセスを起動する
   * @returns {Promise<void>}
   */
  async start(forceRestart = false) {
    if (this.pythonProcess && !forceRestart) {
      return;
    }

    if (this.pythonProcess) {
      await this.stop(); // 強制再起動の場合
    }

    this.isStarting = true;

    try {
      console.log('Pythonプロセスを起動中...');

      // Python実行コマンドの初期化を確認
      await initPythonCmd();

      // Pythonサーバープロセスのスクリプトパス
      let scriptPath;
      let isStandalone = false;

      if (isDevelopment) {
        // 開発環境ではPythonスクリプトを直接実行
        scriptPath = path.join(APP_ROOT, 'src', 'python', 'python_server.py');
      } else {
        // 本番環境ではスタンドアロン実行ファイルを優先
        const execName = isWindows ? 'python_server.exe' : 'python_server';

        // スタンドアロン実行ファイルの候補パス
        const standalonePathsToTry = [
          process.resourcesPath ? path.join(process.resourcesPath, 'app', execName) : null,
          process.resourcesPath ? path.join(process.resourcesPath, execName) : null,
          process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', execName) : null,
          process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'python', execName) : null,
          process.resourcesPath ? path.join(process.resourcesPath, 'app', 'dist', execName) : null,
          process.resourcesPath ? path.join(process.resourcesPath, 'app', 'src', 'python', execName) : null,
          process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'app', execName) : null,
          app.getAppPath() ? path.join(app.getAppPath(), 'dist', execName) : null,
          app.getAppPath() ? path.join(app.getAppPath(), '..', 'dist', execName) : null,
          app.getAppPath() ? path.join(app.getAppPath(), '..', execName) : null
        ].filter(Boolean);

        // スタンドアロン実行ファイルを探す
        for (const standalonePathToTry of standalonePathsToTry) {
          try {
            await fs.access(standalonePathToTry);
            scriptPath = standalonePathToTry;
            isStandalone = true;
            console.log(`スタンドアロンPython実行ファイルを発見: ${scriptPath}`);
            break;
          } catch (e) {
            console.log(`スタンドアロン実行ファイルが見つかりません: ${standalonePathToTry}`);
          }
        }

        // スタンドアロン実行ファイルが見つからない場合は従来のパスを試す
        if (!scriptPath) {
          const scriptPathsToTry = [
            path.join(__dirname, 'python_server.py'),
            process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'src', 'electron', 'python_server.py') : null,
            process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'electron', 'python_server.py') : null,
            process.resourcesPath ? path.join(process.resourcesPath, 'python', 'python_server.py') : null,
            process.resourcesPath ? path.join(process.resourcesPath, 'app', 'python', 'python_server.py') : null,
          ].filter(Boolean);

          // 存在するスクリプトを探す
          for (const pathToTry of scriptPathsToTry) {
            try {
              await fs.access(pathToTry);
              scriptPath = pathToTry;
              console.log(`Python実行スクリプトを発見: ${scriptPath}`);
              break;
            } catch (e) {
              console.log(`Python実行スクリプトが見つかりません: ${pathToTry}`);
            }
          }
        }

        if (!scriptPath) {
          throw new Error('Python実行スクリプトが見つかりません');
        }
      }

      // カスタム環境変数を設定
      const env = { ...process.env };

      // Pythonのガベージコレクション設定を調整
      env.PYTHONMALLOC = 'pymalloc';
      env.PYTHONGC = 'enabled';
      env.PYTHONUNBUFFERED = '1';

      // メモリ使用量を抑えるための追加設定
      if (process.platform === 'linux') {
        env.MALLOC_TRIM_THRESHOLD_ = '65536'; // 64KB以上の未使用メモリを解放
      }

      // スタンドアロン実行ファイルの場合とPythonスクリプト実行の場合で処理を分ける
      if (isStandalone) {
        console.log(`スタンドアロンPython実行ファイルを起動: ${scriptPath}`);
        this.pythonProcess = spawn(scriptPath, [], { env });
      } else {
        console.log(`Pythonプロセスを起動: ${PYTHON_CMD} ${scriptPath}`);
        this.pythonProcess = spawn(PYTHON_CMD, [scriptPath], { env });
      }

      // 標準出力からデータを読み取る設定
      this.pythonProcess.stdout.on('data', (data) => this._handleStdout(data));
      this.pythonProcess.stderr.on('data', (data) => this._handleStderr(data));
      this.pythonProcess.on('close', (code) => this._handleClose(code));
      this.pythonProcess.on('error', (err) => this._handleError(err));

      // 起動完了を待機（サーバーの初期化時間）
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Pythonプロセスが起動しました');

      // メモリモニタリングを開始
      this.startMemoryMonitoring();

      // キューに溜まったリクエストを処理
      this._processQueue();
    } catch (error) {
      console.error('Pythonプロセスの起動エラー:', error);
      throw new Error(`Pythonプロセスの起動に失敗しました: ${error.message}`);
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Pythonプロセスを停止する
   * @returns {Promise<void>}
   */
  async stop() {
    // メモリモニタリングを停止
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }

    if (this.pythonProcess) {
      console.log('Pythonプロセスを停止中...');
      // 終了コマンドを送信
      try {
        const exitCommand = {
          id: 'exit',
          command: 'exit'
        };
        this.pythonProcess.stdin.write(JSON.stringify(exitCommand) + '\n');

        // 正常終了のための待機時間
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        // 既に接続が閉じている場合などのエラーは無視
      }

      // プロセスを強制終了
      try {
        this.pythonProcess.kill();
      } catch (err) {
        // プロセスが既に終了している場合は無視
      }

      this.pythonProcess = null;
      console.log('Pythonプロセスが停止しました');
    }
  }

  /**
   * メモリ監視を開始する
   */
  startMemoryMonitoring() {
    // 既存のモニタリングを停止
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }

    // 新しいモニタリングを開始
    this.memoryMonitorInterval = setInterval(async () => {
      await this.checkMemoryUsage();
    }, 60000); // 1分ごと
  }

  /**
   * メモリ使用量をチェックする
   */
  async checkMemoryUsage() {
    try {
      if (!this.pythonProcess) return;

      // JSプロセスのメモリをログ
      const jsMemoryUsage = process.memoryUsage();
      const heapUsedMB = jsMemoryUsage.heapUsed / 1024 / 1024;
      const rssMemoryMB = jsMemoryUsage.rss / 1024 / 1024;

      console.log(`JS メモリ使用量: ${heapUsedMB.toFixed(2)} MB (ヒープ), ${rssMemoryMB.toFixed(2)} MB (RSS)`);

      // メモリ警告しきい値
      const WARNING_THRESHOLD = 300; // 300MB
      const CRITICAL_THRESHOLD = 400; // 400MB

      // JS側のメモリ使用量が高い場合は強制的にGCを促す
      if (heapUsedMB > WARNING_THRESHOLD) {
        console.warn(`JS メモリ使用量が警告しきい値を超えました (${heapUsedMB.toFixed(2)} MB)`);

        // V8 のGCを明示的に呼び出すためのグローバルGCを試みる
        // 注: Node.js に --expose-gc オプションが必要
        if (global.gc) {
          console.log('メモリ最適化: 明示的なGCを実行');
          global.gc();
        }

        // メモリ使用量が非常に高い場合は再起動を検討
        if (heapUsedMB > CRITICAL_THRESHOLD) {
          console.error(`JS メモリ使用量が危険値を超えました (${heapUsedMB.toFixed(2)} MB)`);
          // ここでアプリケーション固有の重いキャッシュなどをクリア
        }
      }

      // Pythonのメモリ使用状況を問い合わせ
      const memoryStatus = await this.sendCommand('check_memory', {}, 5000);

      if (memoryStatus.restart_needed) {
        console.warn('メモリ監視: Pythonプロセスの再起動が必要です');
        await this.restart();
      }
    } catch (error) {
      console.error('メモリ監視エラー:', error);
    }
  }

  /**
   * Pythonプロセスの健全性をチェックする
   * @returns {Promise<boolean>} 健全性状態
   */
  async checkPythonHealth() {
    try {
      const result = await this.sendCommand('check_environment', {}, 5000);
      return result.status === 'ok';
    } catch (error) {
      console.error('Pythonプロセス健全性チェックエラー:', error);
      return false;
    }
  }

  /**
   * アイドル時にメンテナンスを実行する
   * @returns {Promise<boolean>} メンテナンス結果
   */
  async performIdleMaintenanceIfNeeded() {
    if (this.isIdle && !await this.checkPythonHealth()) {
      console.log('アイドル時のメンテナンス: Pythonプロセスを再起動します');
      return this.restart();
    }
    return true;
  }

  /**
   * 画像前処理を行う
   * @param {string} imageData - Base64形式の画像データ
   * @returns {Promise<string>} 最適化された画像データ
   */
  async preprocessImage(imageData) {
    // ブラウザ環境でのみ実行可能
    if (isNode) {
      return imageData;
    }

    const MAX_IMAGE_SIZE = 1024 * 768; // 約78万ピクセル

    try {
      // 画像のサイズを取得
      const image = new Image();
      image.src = imageData;
      await new Promise(resolve => { image.onload = resolve; });

      // 大きすぎる場合はリサイズ
      if (image.width * image.height > MAX_IMAGE_SIZE) {
        const canvas = document.createElement('canvas');
        const ratio = Math.sqrt(MAX_IMAGE_SIZE / (image.width * image.height));
        canvas.width = Math.floor(image.width * ratio);
        canvas.height = Math.floor(image.height * ratio);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.85);
      }

      return imageData;
    } catch (e) {
      console.error('画像前処理エラー:', e);
      return imageData;
    }
  }

  /**
   * Pythonプロセスに再起動を要求する
   * @returns {Promise<boolean>} 再起動が成功したかどうか
   */
  async restart() {
    if (this.restartCount >= this.maxRestarts) {
      console.error(`最大再起動回数(${this.maxRestarts})に達しました`);
      return false;
    }

    this.restartCount++;
    console.log(`Pythonプロセスを再起動中... (${this.restartCount}/${this.maxRestarts})`);

    await this.stop();
    await this.start();

    return true;
  }

  /**
   * Pythonプロセスにコマンドを送信する
   * @param {string} command - コマンド名
   * @param {object} params - コマンドパラメータ
   * @param {number} timeout - タイムアウト時間（ミリ秒）
   * @returns {Promise<any>} コマンドの実行結果
   */
  async sendCommand(command, params = {}, timeout = 30000, existingRequestId = null) {
    // リクエストIDを生成（既存のIDが渡された場合はそれを使用）
    const requestId = existingRequestId || crypto.randomUUID();
    console.log(`Pythonブリッジ: コマンド[${command}]送信開始 (ID: ${requestId.substring(0, 8)}...)`);

    // プロセスが起動していなければ起動
    if (!this.pythonProcess && !this.isStarting) {
      console.log(`Pythonブリッジ: プロセスが未起動のため、起動処理を行います (コマンド: ${command})`);
      // リクエストをキューに追加して後で処理
      this.requestQueue.push({ requestId, command, params });
      try {
        await this.start();
        console.log(`Pythonブリッジ: プロセス起動完了 (コマンド: ${command})`);
      } catch (error) {
        console.error(`Pythonブリッジ: プロセス起動失敗 (コマンド: ${command})`, error);
        return Promise.reject(error);
      }
      console.log(`Pythonブリッジ: コマンド[${command}]をキューに追加しました`);
      return new Promise((resolve, reject) => {
        this.requestMap.set(requestId, { resolve, reject });
      });
    }

    // プロセス起動中ならキューに追加して終了を待つ
    if (this.isStarting) {
      console.log(`Pythonブリッジ: プロセス起動中のため、コマンド[${command}]をキューに追加します`);
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ requestId, command, params });
        this.requestMap.set(requestId, { resolve, reject });
      });
    }

    console.log(`Pythonブリッジ: コマンド[${command}]処理開始 - タイムアウト: ${timeout}ms`);
    return new Promise((resolve, reject) => {
      // タイムアウト処理
      const timeoutId = setTimeout(() => {
        if (this.requestMap.has(requestId)) {
          console.error(`Pythonブリッジ: コマンド[${command}]がタイムアウトしました (${timeout}ms)`);
          this.requestMap.delete(requestId);
          reject(new Error(`コマンド '${command}' の実行がタイムアウトしました (${timeout}ms)`));
        }
      }, timeout);



      // リクエストをマップに保存（タイムアウトIDも含む）
      this.requestMap.set(requestId, { resolve, reject, timeoutId });
      console.log(`Pythonブリッジ: リクエストマップに追加 (ID: ${requestId.substring(0, 8)}...), 現在のマップサイズ: ${this.requestMap.size}`);
      console.log(`Pythonブリッジ: 現在のリクエストIDs:`, Array.from(this.requestMap.keys()).map(id => id.substring(0, 8) + '...'));

      // コマンドをJSON形式で送信
      const requestData = {
        id: requestId,
        command,
        ...params
      };

      // リクエストデータのサイズをチェック
      const requestStr = JSON.stringify(requestData);
      const dataSize = requestStr.length;
      console.log(`Pythonブリッジ: コマンド[${command}]送信データサイズ: ${Math.round(dataSize / 1024)}KB`);

      // 大きなデータの場合は警告
      if (dataSize > 5000000) { // 5MB以上
        console.warn(`Pythonブリッジ: 送信データが非常に大きいです (${Math.round(dataSize / 1024 / 1024)}MB)`);
      }

      try {
        this.pythonProcess.stdin.write(requestStr + '\n');
        console.log(`Pythonブリッジ: コマンド[${command}]送信完了 (ID: ${requestId.substring(0, 8)}...)`);
      } catch (error) {
        // マップからリクエストを削除（クリーンアップ）
        if (requestId && this.requestMap.has(requestId)) {
          this.requestMap.delete(requestId);
        }

        console.error(`Pythonブリッジ: コマンド[${command}]送信エラー:`, error);
        throw error;
      }
    });
  }

  /**
   * 標準出力からのデータを処理
   * @param {Buffer} data - 受信データ
   * @private
   */
  _handleStdout(data) {
    // データバッファーに追加
    const dataStr = data.toString();
    this.responseBuffer += dataStr;

    console.log(`Pythonブリッジ: stdout データ受信 (${dataStr.length}バイト)`);

    // データが大きい場合はプレビューのみ表示
    if (dataStr.length > 200) {
      console.log(`Pythonブリッジ: stdout プレビュー: ${dataStr.substring(0, 100)}...`);
    } else {
      console.log(`Pythonブリッジ: stdout 内容: ${dataStr}`);
    }

    // 完全なJSONレスポンスを探す
    let endIndex;
    while ((endIndex = this.responseBuffer.indexOf('\n')) !== -1) {
      const responseStr = this.responseBuffer.substring(0, endIndex);
      this.responseBuffer = this.responseBuffer.substring(endIndex + 1);

      if (!responseStr.trim()) continue;

      try {
        console.log(`Pythonブリッジ: JSONレスポンス解析中 (${responseStr.length}バイト)`);
        const response = JSON.parse(responseStr);
        this._processResponse(response);
      } catch (err) {
        console.error('Pythonブリッジ: JSONパースエラー:', err);
        console.error('Pythonブリッジ: 解析できないデータ:', responseStr.length > 100 ?
          responseStr.substring(0, 100) + '...' : responseStr);
      }
    }
  }

  /**
   * 標準エラー出力からのデータを処理
   * @param {Buffer} data - 受信データ
   * @private
   */
  _handleStderr(data) {
    const stderr = data.toString();
    console.error(`Pythonプロセスからのエラー: ${stderr}`);

    // メモリ関連のエラーを検出
    if (
      stderr.includes('MemoryError') ||
      stderr.includes('Cannot allocate memory') ||
      stderr.includes('OutOfMemoryError') ||
      stderr.includes('MemoryLimit') ||
      stderr.includes('ResourceExhaustedError')
    ) {
      console.error('メモリエラー検出: プロセスを再起動します');
      this.restart();
    }
  }

  /**
   * JSONレスポンスを処理する
   * @param {Object} response - 受信したJSONレスポンス
   * @private
   */
  _processResponse(response) {
    try {
      // リクエストIDの取得
      const requestId = response.id;

      if (!requestId) {
        console.error('Pythonブリッジ: レスポンスにIDがありません:', response);
        return;
      }

      // リクエストマップからリクエスト情報を取得
      const requestInfo = this.requestMap.get(requestId);

      if (!requestInfo) {
        console.error(`Pythonブリッジ: 未知のレスポンスID: ${requestId}`);
        return;
      }

      // タイムアウトをクリア
      if (requestInfo.timeoutId) {
        clearTimeout(requestInfo.timeoutId);
      }

      // リクエストマップから削除
      this.requestMap.delete(requestId);

      // エラーまたは結果をリゾルブ
      if (response.error) {
        console.error(`Pythonブリッジ: エラーレスポンス: ${response.error}`);
        requestInfo.reject(new Error(response.error));
      } else {
        requestInfo.resolve(response.result);
      }

      // 大きなレスポンスデータの参照を解放
      if (response && response.result) {
        // 大きなデータオブジェクトの明示的な解放
        if (response.result.colors || response.result.textBlocks || response.result.elements) {
          // 参照を解放して次のGCでクリーンアップされるようにする
          response.result = null;
        }
      }
    } catch (error) {
      console.error('Pythonブリッジ: レスポンス処理エラー:', error);
    }
  }

  /**
   * プロセスクローズ時の処理
   * @param {number} code - 終了コード
   * @private
   */
  _handleClose(code) {
    console.log(`Pythonプロセスが終了しました (コード: ${code})`);
    this.pythonProcess = null;

    // 正常終了でない場合は保留中のリクエストを拒否
    if (code !== 0) {
      for (const [id, { reject, timeoutId }] of this.requestMap.entries()) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(new Error(`Pythonプロセスが予期せず終了しました (コード: ${code})`));
        this.requestMap.delete(id);
      }

      // 自動再起動
      if (this.requestQueue.length > 0 || this.requestMap.size > 0) {
        this.restart().catch(err => {
          console.error('プロセス再起動エラー:', err);
        });
      }
    }
  }

  /**
   * プロセスエラー時の処理
   * @param {Error} error - エラーオブジェクト
   * @private
   */
  _handleError(error) {
    console.error('Pythonプロセスエラー:', error);

    // すべての保留中リクエストを拒否
    for (const [id, { reject, timeoutId }] of this.requestMap.entries()) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(new Error(`Pythonプロセスエラー: ${error.message}`));
      this.requestMap.delete(id);
    }

    // 自動再起動
    if (this.requestQueue.length > 0) {
      this.restart().catch(err => {
        console.error('エラー後の再起動に失敗:', err);
      });
    }
  }

  /**
   * キューにあるリクエストを処理
   * @private
   */
  _processQueue() {
    const queue = [...this.requestQueue];
    this.requestQueue = [];

    for (const { requestId, command, params } of queue) {
      if (this.requestMap.has(requestId)) {
        const { resolve, reject } = this.requestMap.get(requestId);

        this.sendCommand(command, params)
          .then(resolve)
          .catch(reject);
      }
    }
  }

  /**
   * Python環境をチェックする
   * 互換性のあるPythonバージョンとライブラリが利用可能かを確認
   */
  async checkPythonEnvironment() {
    try {
      console.log('Python環境をチェックしています...');
      const result = await this.sendCommand('check_environment');
      console.log('Python環境チェック結果:', result);
      return result;
    } catch (error) {
      console.error('Python環境チェックエラー:', error);
      return { error: error.message, summary: { python_compatible: false } };
    }
  }

  /**
   * Python環境をセットアップする
   * 必要なパッケージのインストールを試みる
   */
  async setupPythonEnvironment() {
    try {
      console.log('Python環境をセットアップしています...');
      const result = await this.sendCommand('setup_environment');
      console.log('Python環境セットアップ結果:', result);
      return { ...result, success: true };
    } catch (error) {
      console.error('Python環境セットアップエラー:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 画像のレイアウトパターンを分析する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} レイアウト分析結果
   */
  async analyzeLayoutPattern(imageData, options = {}) {
    // レイアウトパターンを解析する
    try {
      await this._ensureRunning();

      return await this.sendCommand('analyze_layout', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('レイアウトパターン分析エラー:', error);
      throw new Error(`レイアウトパターン分析中にエラーが発生しました: ${error.message}`);
    }
  }

  /**
   * 画像解析結果を圧縮して重要な情報だけを抽出する
   * @param {object} analysisData - 元の解析結果
   * @param {object} options - 圧縮オプション
   * @returns {Promise<object>} 圧縮された解析結果
   */
  async compressAnalysisResults(analysisData, options = {}) {
    try {
      await this._ensureRunning();

      return await this.sendCommand('compress_analysis', {
        analysis_data: analysisData,
        options
      });
    } catch (error) {
      console.error('解析結果圧縮エラー:', error);
      throw new Error(`解析結果の圧縮中にエラーが発生しました: ${error.message}`);
    }
  }

  /**
   * 元画像とレンダリング画像を比較し類似度を評価する
   * @param {string} originalImage - Base64エンコードされた元画像データ
   * @param {string} renderedImage - Base64エンコードされたレンダリング画像データ
   * @returns {Promise<object>} 比較結果
   */
  async compareImages(originalImage, renderedImage) {
    try {
      await this._ensureRunning();

      return await this.sendCommand('compare_images', {
        original_image: originalImage,
        rendered_image: renderedImage
      });
    } catch (error) {
      console.error('画像比較エラー:', error);
      throw new Error(`画像比較中にエラーが発生しました: ${error.message}`);
    }
  }

  /**
   * 画像のメインセクションを検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<Array>} 検出されたメインセクション
   */
  async detectMainSections(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_main_sections', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('メインセクション検出エラー:', error);
      return [];
    }
  }

  /**
   * 画像からカード要素を検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<Array>} 検出されたカード要素
   */
  async detectCardElements(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_card_elements', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('カード要素検出エラー:', error);
      return [];
    }
  }

  /**
   * 画像から特徴的な要素を検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} 検出された要素
   */
  async detectFeatureElements(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_elements', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('要素検出エラー:', error);
      return {
        layoutType: "unknown",
        layoutConfidence: 0.5,
        elements: []
      };
    }
  }

  /**
   * Pythonプロセスが実行中であることを確認する
   * @returns {Promise<void>}
   * @private
   */
  async _ensureRunning() {
    if (!this.pythonProcess && !this.isStarting) {
      console.log('Pythonブリッジ: プロセスが実行されていないため、開始します');
      await this.start();
      console.log('Pythonブリッジ: プロセスが正常に開始されました');
    } else if (this.isStarting) {
      console.log('Pythonブリッジ: プロセスの起動を待機しています');
      // 起動が完了するまで待機
      let attempts = 0;
      while (this.isStarting && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      if (this.isStarting) {
        throw new Error('Pythonプロセスの起動がタイムアウトしました');
      }
    }
  }

  /**
   * 画像の総合分析を行う
   * @param {string|object} imageData - Base64形式の画像データ、またはオブジェクト
   * @param {object} options - オプション
   * @returns {Promise<object>} 総合分析結果
   */
  async analyzeAll(imageData, options = {}) {
    // 処理回数をカウント
    this.processCounter++;

    // 一定回数の処理後にPythonプロセスを再起動
    if (this.processCounter >= this.MAX_PROCESSES_BEFORE_RESTART) {
      console.log('メモリ最適化のためにPythonプロセスを再起動します');
      await this.stop();
      await this.start();
      this.processCounter = 0;
    }

    this.isIdle = false;

    try {
      // パラメータの型を確認し正規化
      let imageContent;
      let requestOptions = {};

      if (typeof imageData === 'object' && imageData !== null) {
        // オブジェクトとして渡された場合
        const dataObj = imageData;

        // 優先順位順にキーを確認
        for (const key of ['image', 'image_data', 'imageData']) {
          if (dataObj[key] && typeof dataObj[key] === 'string') {
            imageContent = dataObj[key];
            console.log(`オブジェクトから'${key}'キーの画像データを使用します`);
            break;
          }
        }

        // オプションをマージ
        requestOptions = { ...dataObj.options, ...options };

        if (!imageContent) {
          console.error('画像データがオブジェクト内に見つかりません:', Object.keys(dataObj).join(', '));
          return {
            success: false,
            error: '画像データが提供されていません',
          };
        }
      } else if (typeof imageData === 'string') {
        // 直接画像データが渡された場合
        imageContent = imageData;
        requestOptions = options;
      } else {
        console.error('不正な画像データ形式:', typeof imageData);
        return {
          success: false,
          error: `不正な画像データ形式: ${typeof imageData}`
        };
      }

      // base64チェック
      if (typeof imageContent === 'string') {
        if (!imageContent.startsWith('data:image') && !imageContent.match(/^[A-Za-z0-9+/=]+$/)) {
          console.warn('画像データがbase64形式でない可能性があります');
        }
      } else {
        console.error('画像データが文字列ではありません:', typeof imageContent);
        return {
          success: false,
          error: '画像データが文字列ではありません'
        };
      }

      // 画像の前処理
      const optimizedImageData = await this.preprocessImage(imageContent);

      // 元の処理を実行
      await this._ensureRunning();

      // 画像の型を確認
      const base64Image = typeof optimizedImageData === 'string'
        ? optimizedImageData
        : optimizedImageData?.image || optimizedImageData?.image_data || '';

      // Python側が参照する名前を 'image_data' に統一
      const result = await this.sendCommand('analyze_all', {
        image_data: base64Image,  // Python側が期待する名前に合わせる
        options: requestOptions
      }, 90000);  // より長いタイムアウト

      return result;
    } catch (error) {
      console.error('画像分析エラー:', error);
      return {
        success: false,
        error: `画像分析エラー: ${error.message || '(不明)'}`,
      };
    } finally {
      this.isIdle = true;
    }
  }

  /**
   * 画像から主要な色を抽出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<Array>} 抽出された色のリスト
   */
  async extractColors(imageData, options = {}) {
    try {
      const result = await this.sendCommand('extract_colors', {
        image_data: imageData, // 'image_data'に統一
        options
      });
      return result.colors || [];
    } catch (error) {
      console.error('色抽出エラー:', error);
      return [];
    }
  }

  /**
   * 画像からテキストを抽出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} 抽出されたテキスト情報
   */
  async extractText(imageData, options = {}) {
    try {
      return await this.sendCommand('extract_text', {
        image_data: imageData, // 'image_data'に統一
        options
      });
    } catch (error) {
      console.error('テキスト抽出エラー:', error);
      return { text: '', textBlocks: [] };
    }
  }

  /**
   * 画像のセクションを分析する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} 分析結果
   */
  async analyzeSections(imageData, options = {}) {
    try {
      return await this.sendCommand('analyze_sections', {
        image_data: imageData, // 'image_data'に統一
        options
      });
    } catch (error) {
      console.error('セクション分析エラー:', error);
      return { sections: [] };
    }
  }

  /**
   * 画像のレイアウトパターンを分析する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} レイアウト分析結果
   */
  async analyzeLayout(imageData, options = {}) {
    try {
      return await this.sendCommand('analyze_layout', {
        image_data: imageData, // 'image_data'に統一
        options
      });
    } catch (error) {
      console.error('レイアウト分析エラー:', error);
      return {
        width: 1200,
        height: 800,
        type: "unknown"
      };
    }
  }

  /**
   * 画像のメインセクションを検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} 検出されたメインセクション
   */
  async detectMainSections(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_main_sections', {
        image_data: imageData, // 'image_data'に統一
        options
      });
    } catch (error) {
      console.error('メインセクション検出エラー:', error);
      return { sections: [] };
    }
  }

  /**
   * 画像からカード要素を検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<Array>} 検出されたカード要素
   */
  async detectCardElements(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_card_elements', {
        image_data: imageData, // 'image_data'に統一
        options
      });
    } catch (error) {
      console.error('カード要素検出エラー:', error);
      return [];
    }
  }

  /**
   * 画像から特徴的な要素を検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} 検出された要素
   */
  async detectFeatureElements(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_elements', {
        image_data: imageData, // 'image_data'に統一
        options
      });
    } catch (error) {
      console.error('要素検出エラー:', error);
      return {
        layoutType: "unknown",
        layoutConfidence: 0.5,
        elements: []
      };
    }
  }

  /**
   * リクエストを送信する
   * @param {string} requestId - リクエストID
   * @param {string} command - コマンド名
   * @param {object} params - コマンドパラメータ
   * @param {number} timeout - タイムアウト（ミリ秒）
   * @private
   */
  _sendRequest(requestId, command, params, timeout) {
    // リクエストマップにエントリがあるならば、そこにあるプロミスを解決/拒否する
    if (this.requestMap.has(requestId)) {
      const { resolve, reject, timeoutId } = this.requestMap.get(requestId);

      // タイムアウトIDがあれば、クリアする
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // マップからリクエストエントリを削除
      this.requestMap.delete(requestId);

      if (command === 'sendCommand' || !this.pythonProcess) {
        // コマンド送信またはプロセスがない場合は拒否
        reject(new Error('Pythonプロセスが起動していません'));
      } else {
        // 実際のリクエストを送信
        this.sendCommand(command, params, timeout).then(resolve).catch(reject);
      }
    }
  }
}

/**
 * バッファプールクラス - 大きなバッファを再利用して不要なメモリ割り当てを減らす
 */
class BufferPool {
  constructor(maxBuffers = 3, bufferSize = 5 * 1024 * 1024) { // 5MB
    this.pool = [];
    this.maxBuffers = maxBuffers;
    this.bufferSize = bufferSize;
  }

  getBuffer() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return Buffer.allocUnsafe(this.bufferSize);
  }

  releaseBuffer(buffer) {
    if (this.pool.length < this.maxBuffers) {
      // バッファ内容をゼロにクリア
      buffer.fill(0);
      this.pool.push(buffer);
    }
    // プールが一杯ならバッファは破棄され、GCの対象になる
  }
}

if (isNode) {
  // Node.js環境のみで実際のインスタンスをエクスポート
  const pythonBridge = new PythonBridge();
  module.exports = pythonBridge;
} else {
  // ブラウザ環境の場合はダミー実装を提供
  const dummyBridge = {
    checkPythonEnvironment: async () => {
      console.warn('ブラウザ環境ではPython環境チェックは利用できません');
      return { error: 'ブラウザ環境ではこの機能は利用できません', browserEnvironment: true };
    },
    setupPythonEnvironment: async () => {
      console.warn('ブラウザ環境ではPython環境セットアップは利用できません');
      return { success: false, message: 'ブラウザ環境ではこの機能は利用できません', browserEnvironment: true };
    },
    start: async () => {
      console.warn('ブラウザ環境ではPython処理は利用できません');
      return false;
    },
    stop: async () => {
      console.warn('ブラウザ環境ではPython処理は利用できません');
      return false;
    },
    sendCommand: async () => {
      console.warn('ブラウザ環境ではPython処理は利用できません');
      return { error: 'ブラウザ環境ではこの機能は利用できません', browserEnvironment: true };
    },
  };

  // ES ModulesとCommonJSの両方に対応
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dummyBridge;
  } else if (typeof define === 'function' && define.amd) {
    define([], function () { return dummyBridge; });
  } else {
    window.pythonBridge = dummyBridge;
  }
}


// PythonBridge のインスタンスをエクスポート
const pythonBridge = new PythonBridge();
module.exports = pythonBridge;
