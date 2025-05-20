// Electron と基本モジュールの読み込み
const path = require('path');
const fsSync = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// 環境フラグ
const isNode = typeof window === 'undefined' || (process && process.versions && process.versions.node);
let app;
let isDevelopment;

try {
  // Electron環境で実行されている場合のみElectronモジュールをロード
  if (process.versions && process.versions.electron) {
    app = require('electron').app;
    isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;
  } else {
    // Node.js環境の場合はElectronなしでも動作するようにフラグを設定
    isDevelopment = process.env.NODE_ENV === 'development';
    app = { getPath: (name) => name === 'userData' ? path.join(process.cwd(), '.userData') : process.cwd() };
  }
} catch (err) {
  console.log('Electronモジュールのロードに失敗しました。Node.js環境で実行されています。');
  isDevelopment = process.env.NODE_ENV === 'development';
  app = { getPath: (name) => name === 'userData' ? path.join(process.cwd(), '.userData') : process.cwd() };
}

// プロジェクトルート（python_server.py の参照に使用）
const APP_ROOT = path.resolve(__dirname, '..', '..');

// デバッグログファイル設定
const DEBUG_LOG = true; // デバッグログを有効化
let LOG_FILE_PATH = null;
if (isNode) {
  try {
    const logDir = app.getPath('userData');
    // ディレクトリが存在しない場合は作成
    if (!fsSync.existsSync(logDir)) {
      fsSync.mkdirSync(logDir, { recursive: true });
    }
    LOG_FILE_PATH = path.join(logDir, 'python_bridge_debug.log');
  } catch (err) {
    console.log('ログディレクトリの作成に失敗しました:', err);
    LOG_FILE_PATH = null;
  }
}

// デバッグログ関数
function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  console.log(logMessage);
  
  // ファイルにもログを書き込む
  if (DEBUG_LOG && LOG_FILE_PATH && isNode) {
    try {
      fsSync.appendFileSync(LOG_FILE_PATH, logMessage + '\n');
    } catch (err) {
      console.error('ログファイル書き込みエラー:', err);
      // エラー後はログファイルへの書き込みを無効化
      LOG_FILE_PATH = null;
    }
  }
}

// Node.js 専用モジュール
let spawn, fs, os, crypto;
if (isNode) {
  spawn = require('child_process').spawn;
  fs = require('fs').promises;
  os = require('os');
  crypto = require('crypto');
  
  // ログファイルの初期化
  if (DEBUG_LOG && LOG_FILE_PATH) {
    try {
      // ログファイルが大きすぎる場合はリセット（10MB以上）
      if (fsSync.existsSync(LOG_FILE_PATH)) {
        const stats = fsSync.statSync(LOG_FILE_PATH);
        if (stats.size > 10 * 1024 * 1024) {
          console.log('ログファイルが大きすぎるため、リセットします');
          try {
            fsSync.writeFileSync(LOG_FILE_PATH, `=== Python Bridge Debug Log (${new Date().toISOString()}) ===\n`);
          } catch (writeErr) {
            console.error('ログファイル書き込みエラー:', writeErr);
            LOG_FILE_PATH = null;
          }
        }
      } else {
        try {
          fsSync.writeFileSync(LOG_FILE_PATH, `=== Python Bridge Debug Log (${new Date().toISOString()}) ===\n`);
        } catch (writeErr) {
          console.error('ログファイル書き込みエラー:', writeErr);
          LOG_FILE_PATH = null;
        }
      }
      
      debugLog('Python Bridge デバッグログを開始しました');
      if (process.versions && process.versions.electron) {
        debugLog(`アプリバージョン: ${app.getVersion()}`);
      } else {
        debugLog(`Node.js環境で実行中`);
      }
      debugLog(`OS: ${process.platform} ${os.release()}`);
      debugLog(`Node.js: ${process.version}`);
    } catch (err) {
      console.error('ログファイル初期化エラー:', err);
      LOG_FILE_PATH = null;
    }
  }
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

// Python実行環境の検出関数 - シンプル化
async function detectPythonExecutable() {
  console.log('システムPythonを検出しています...');

  // 候補を単純化
  const candidates = isWindows
    ? ['python', 'py']  // Windowsでは通常python.exeまたはpy.exe
    : ['python3', 'python'];  // Mac/Linuxではpython3が優先

  // 各候補を試す
  for (const cmd of candidates) {
    try {
      // バージョン確認コマンドを実行
      const { stdout } = await execAsync(`${cmd} --version`);
      const version = stdout.trim();
      console.log(`Python検出: ${cmd} -> ${version}`);
      return cmd;  // 最初に見つかったコマンドを返す
    } catch (error) {
      console.log(`Python検出失敗: ${cmd} -> ${error.message}`);
    }
  }

  // デフォルト値
  console.warn('有効なPython実行環境を検出できませんでした。デフォルト値を使用します。');
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
      // Python実行ファイルのパスを取得
      await initPythonCmd();

      console.log(`[PythonBridge] 起動処理開始: PYTHON_CMD=${PYTHON_CMD}, プラットフォーム=${process.platform}, 開発環境=${isDevelopment}`);
      console.log(`[PythonBridge] 詳細環境: Node.js=${process.version}, Electron=${process.versions.electron || '不明'}`);

      // Pythonスクリプトへのパス - 開発環境とパッケージ版で異なるパスを使用
      let pythonScriptPath;
      
      if (app.isPackaged) {
        // パッケージ版では、Pythonフォルダのパスを設定
        const appPath = path.dirname(app.getAppPath());
        pythonScriptPath = path.join(appPath, 'app', 'python', 'python_server.py');
        console.log(`[PythonBridge] パッケージ版用のPythonスクリプトパス: ${pythonScriptPath}`);
      } else {
        // 開発環境では従来のパスをそのまま使用
        pythonScriptPath = path.resolve(__dirname, '../python/python_server.py');
        console.log(`[PythonBridge] 開発環境用のPythonスクリプトパス: ${pythonScriptPath}`);
      }
      
      console.log(`[PythonBridge] 現在の作業ディレクトリ: ${process.cwd()}`);
      console.log(`[PythonBridge] APP_ROOT: ${APP_ROOT}`);
      console.log(`[PythonBridge] __dirname: ${__dirname}`);
      console.log(`[PythonBridge] Pythonスクリプトパス: ${pythonScriptPath}`);

      // Pythonプロセスのオプション設定
      const spawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        windowsHide: true,
        shell: process.platform === 'win32', // Windowsでは必ずshellをtrueに設定
      };
      
      // Windows環境向けの追加設定
      if (isWindows) {
        spawnOptions.env.PYTHONUTF8 = '1';  // Python 3.7以降、UTF-8モードを強制
        spawnOptions.env.PYTHONLEGACYWINDOWSSTDIO = '0';  // レガシーモードを無効化
        spawnOptions.env.PYTHONFAULTHANDLER = '1';  // クラッシュ時のトレースバックを有効化
      }
      
      console.log(`[PythonBridge] 環境設定: shell=${spawnOptions.shell}, windowsHide=${spawnOptions.windowsHide}`);
      console.log(`[PythonBridge] 環境変数: PYTHONIOENCODING=${spawnOptions.env.PYTHONIOENCODING}, PYTHONUNBUFFERED=${spawnOptions.env.PYTHONUNBUFFERED}`);
      
      // プロセス起動
      this.pythonProcess = spawn(PYTHON_CMD, [pythonScriptPath], spawnOptions);
      
      if (this.pythonProcess && this.pythonProcess.pid) {
        console.log(`[PythonBridge] プロセス起動成功: PID=${this.pythonProcess.pid}`);
        console.log(`[PythonBridge] Pythonサーバーを起動しました`);
      } else {
        console.warn(`[PythonBridge] プロセス起動したがPIDが取得できません`);
      }

      // エンコーディングを明示的に設定
      this.pythonProcess.stdout.setEncoding('utf-8');

      // 標準出力ハンドラ
      this.pythonProcess.stdout.on('data', (data) => {
        // データをバッファに追加
        const chunk = data.toString();
        this.responseBuffer += chunk;
        
        // デバッグログ
        console.log(`[Bridge] データ受信: ${chunk.length}バイト, バッファ合計: ${this.responseBuffer.length}バイト`);
        
        // __END__マーカーがある限り処理を繰り返す
        while (this.responseBuffer.includes('__END__')) {
          console.log(`[Bridge] [DEBUG] __END__マーカーの処理開始`);
          
          const parts = this.responseBuffer.split('__END__');
          const jsonPart = parts[0].trim();
          
          // 残りのバッファを更新（次の応答用に保持）
          this.responseBuffer = parts.slice(1).join('__END__');
          
          if (!jsonPart) {
            console.log(`[Bridge] [DEBUG] 空のJSONパートをスキップ`);
            continue; // 空の場合はスキップ
          }
          
          this._processJsonPart(jsonPart);
        }
      });

      // 標準エラー出力ハンドラ
      this.pythonProcess.stderr.on('data', (data) => {
        const dataStr = data.toString().trim();
        
        // 空のデータを無視
        if (!dataStr) return;
        
        console.error(`[PythonBridge] Python stderr: ${dataStr}`);
        
        // メモリ関連のエラーを検出
        if (
          dataStr.includes('MemoryError') ||
          dataStr.includes('Cannot allocate memory') ||
          dataStr.includes('OutOfMemoryError')
        ) {
          console.error('メモリエラー検出: プロセスを再起動します');
          this.restart();
        }
      });

      // プロセス終了イベント処理
      this.pythonProcess.on('close', (code) => {
        this._handleClose(code);
      });

      // プロセスエラーイベント処理
      this.pythonProcess.on('error', (error) => {
        this._handleError(error);
      });

      // プロセス起動待機（200ms）
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 正常起動したらフラグをリセット
      this.isStarting = false;
      this.restartCount = 0;
      
      // 起動後に待機リクエストがあれば処理
      this._processQueue();
      
      // メモリ監視を開始
      this.startMemoryMonitoring();
      
      return;
    } catch (error) {
      // エラー統一処理
      this.isStarting = false;
      console.error('[PythonBridge] Python起動エラー:', error);
      
      // 自動再起動を試みる（最大回数まで）
      if (this.restartCount < this.maxRestarts) {
        this.restartCount++;
        console.log(`[PythonBridge] 自動再起動を試みます(${this.restartCount}/${this.maxRestarts})`);
        return this.start();
      } else {
        console.error(`[PythonBridge] 最大再起動回数(${this.maxRestarts})に達しました。`);
        throw new Error(`Pythonサーバーの起動に失敗しました: ${error.message}`);
      }
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
    // Node.js環境では前処理をスキップ
    if (isNode) {
      return imageData;
    }

    // ブラウザ環境での処理
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
  async sendCommand(command, params = {}, timeout = 30000) {
    try {
      // リクエストIDを生成
      const requestId = crypto.randomUUID();
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
        let timeoutId = setTimeout(() => {
          if (this.requestMap.has(requestId)) {
            console.error(`Pythonブリッジ: コマンド[${command}]のタイムアウト (${timeout}ms)`);
            this.requestMap.delete(requestId);
            reject(new Error(`コマンド '${command}' の実行がタイムアウトしました (${timeout}ms)`));
          }
        }, timeout);

        // リクエストをマップに保存
        this.requestMap.set(requestId, { resolve, reject, timeoutId });
        console.log(`Pythonブリッジ: リクエストマップに追加 (ID: ${requestId.substring(0, 8)}...), 現在のマップサイズ: ${this.requestMap.size}`);

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

        try {
          this.pythonProcess.stdin.write(requestStr + '\n');
          console.log(`Pythonブリッジ: コマンド[${command}]送信完了 (ID: ${requestId.substring(0, 8)}...)`);
        } catch (error) {
          // マップからリクエストを削除（クリーンアップ）
          if (requestId && this.requestMap.has(requestId)) {
            clearTimeout(timeoutId);
            this.requestMap.delete(requestId);
          }

          console.error(`Pythonブリッジ: コマンド[${command}]送信エラー:`, error);
          reject(error); // エラーを伝播
        }
      });
    } catch (outerError) {
      // 外側のtry-catchブロックでエラーをキャッチ
      console.error(`Pythonブリッジ: コマンド送信での予期せぬエラー: ${outerError.message}`);
      return Promise.reject(outerError);
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
   * JSONパーツを処理する共通メソッド
   * @private
   */
  _processJsonPart(jsonPart) {
    try {
      console.log(`[Bridge] JSONパース開始: ${jsonPart.length}バイト`);
      
      const parsedData = JSON.parse(jsonPart);
      console.log(`[Bridge] JSONパース成功: id=${parsedData.id || 'なし'}`);
      
      this._handleParsedData(parsedData);
    } catch (error) {
      console.error(`[Bridge] JSONパース失敗:`, error);
    }
  }
  
  /**
   * パース済みデータを処理する共通メソッド
   * @private
   */
  _handleParsedData(parsedData) {
    // リクエストIDに対応するPromiseを解決
    if (parsedData.id && this.requestMap.has(parsedData.id)) {
      const { resolve, reject, timeoutId } = this.requestMap.get(parsedData.id);
      
      // タイマーがあれば解除
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // ファイルレスポンスの特別処理
      if (parsedData.file_response) {
        // ファイルからレスポンスを読み込む
        try {
          const fileContent = fsSync.readFileSync(parsedData.file_response, 'utf-8');
          let fileData = null;
          
          try {
            // ファイル内容をJSONとしてパース
            fileData = JSON.parse(fileContent);
            // 成功の場合は読み込んだデータで解決
            resolve(fileData);
          } catch (jsonErr) {
            // ファイルはJSONでない場合は生データを返す
            resolve(fileContent);
          }
        } catch (fileErr) {
          reject(new Error(`ファイル応答の読み込みに失敗: ${fileErr.message}`));
        }
      } 
      // 通常のエラーまたは結果を処理
      else if (parsedData.error) {
        reject(new Error(parsedData.error));
      } else {
        resolve(parsedData.result);
      }
      
      // マップからリクエストを削除
      this.requestMap.delete(parsedData.id);
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
      return { error: error.message, python_compatible: false };
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
   * 画像の総合分析を行う
   * @param {string|object} imageData - Base64形式の画像データ、またはオブジェクト
   * @param {object} options - オプション
   * @returns {Promise<object>} 総合分析結果
   */
  async analyzeAll(imageData, options = {}) {
    try {
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

        // 画像の前処理
        const optimizedImageData = await this.preprocessImage(imageContent);

        // プロセスが実行中であることを確認
        await this._ensureRunning();

        // 画像の型を確認
        const base64Image = typeof optimizedImageData === 'string'
          ? optimizedImageData
          : optimizedImageData?.image || optimizedImageData?.image_data || '';

        // OCRの文字化け対策フラグを追加
        requestOptions.verbose = false;

        // Python側が参照する名前を 'image_data' に統一
        try {
          const result = await this.sendCommand('analyze_all', {
            image_data: base64Image,  // Python側が期待する名前に合わせる
            options: requestOptions
          }, 90000);  // 90秒タイムアウト
          
          return result;
        } catch (commandError) {
          console.error(`analyzeAll: コマンド実行エラー: ${commandError.message}`);
          return {
            success: false,
            error: `画像分析エラー: ${commandError.message || '(不明)'}`,
          };
        }
      } finally {
        this.isIdle = true;
      }
    } catch (outerError) {
      // 最も外側のtry-catchブロック
      console.error('analyzeAll: 最上位レベルでのエラー捕捉:', outerError);
      return {
        success: false,
        error: `画像分析処理エラー: ${outerError.message || '(不明)'}`,
      };
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

// Python環境の詳細チェック - 環境検証のための新機能
async function detailedPythonCheck() {
  const result = {
    pythonInstalled: false,
    pythonVersion: null,
    pythonPath: null,
    pipInstalled: false,
    requiredPackages: {
      numpy: false,
      pillow: false,
      opencv: false
    },
    systemInfo: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    }
  };
  
  // Python検出
  const pythonCmd = await initPythonCmd();
  
  try {
    // Python バージョン確認
    const { stdout: versionOutput } = await execAsync(`${pythonCmd} --version`);
    result.pythonInstalled = true;
    result.pythonVersion = versionOutput.trim();
    
    // Python パス確認
    const { stdout: pathOutput } = await execAsync(
      `${pythonCmd} -c "import sys; print(sys.executable)"`
    );
    result.pythonPath = pathOutput.trim();
    
    // pip確認
    try {
      await execAsync(`${pythonCmd} -m pip --version`);
      result.pipInstalled = true;
    } catch (error) {
      console.log('pip未インストール:', error.message);
    }
    
    // パッケージ確認
    const packages = [
      { name: 'numpy', check: 'numpy' },
      { name: 'pillow', check: 'PIL' },
      { name: 'opencv', check: 'cv2' }
    ];
    
    for (const pkg of packages) {
      try {
        await execAsync(`${pythonCmd} -c "import ${pkg.check}"`);
        result.requiredPackages[pkg.name] = true;
      } catch (error) {
        console.log(`${pkg.name}未インストール:`, error.message);
      }
    }
  } catch (error) {
    console.error('Python環境チェックエラー:', error);
  }
  
  // 全体の状態確認
  result.allPackagesInstalled = 
    Object.values(result.requiredPackages).every(installed => installed);
  
  result.ready = result.pythonInstalled && result.pipInstalled && result.allPackagesInstalled;
  
  return result;
}

if (isNode) {
  // Node.js環境のみで実際のインスタンスをエクスポート
  const pythonBridge = new PythonBridge();
  
  // 詳細チェック関数も追加でエクスポート
  pythonBridge.detailedPythonCheck = detailedPythonCheck;
  
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