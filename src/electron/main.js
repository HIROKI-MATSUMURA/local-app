const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { PythonShell } = require('python-shell');
const { debounce } = require('lodash');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { v4: uuidv4 } = require('uuid');
const chokidar = require('chokidar');
// dotenvを開発モードだけ読み込む
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config();
}
app.commandLine.appendSwitch('js-flags', '--expose-gc');
// GC機能の確認とフラグ設定
// package.jsonのelectron-builder設定例:
// "build": {
//   "extraMetadata": {
//     "main": "main.js"
//   },
//   "files": [
//     "**/*",
//     "!**/*.{ts,map,md}"
//   ],
//   "extraResources": [
//     "assets/**"
//   ],
//   "mac": {
//     "executableArgs": ["--expose-gc"]
//   },
//   "win": {
//     "executableArgs": ["--expose-gc"]
//   },
//   "linux": {
//     "executableArgs": ["--expose-gc"]
//   }
// }

// 自動再起動をスキップするフラグ - ターミナルを走らせ続けるために有効化
const SKIP_GC_RELAUNCH = true; // trueに設定するとGCフラグがなくても再起動しません

// 開発環境では自動的に--expose-gcフラグを付けて再起動（スキップフラグがfalseの場合のみ）
if (!process.argv.includes('--expose-gc') && !app.isPackaged && !SKIP_GC_RELAUNCH) {
  console.log('GC機能を有効化するため、--expose-gcフラグを付けて再起動します');
  app.relaunch({ args: process.argv.slice(1).concat(['--expose-gc']) });
  app.exit(0);
  return;
}

// GCのポリフィル - GC機能が利用できない場合に代替手段を提供
if (!global.gc) {
  console.log('--expose-gcフラグがないため、完全なメモリクリーンアップ機能は使用できません');
  console.log('ターミナルログを確認するために自動再起動はスキップされました');
  console.log('完全なGC機能を有効化するには、アプリを終了して以下のコマンドで再起動してください:');
  console.log('NODE_ENV=development electron --expose-gc .');

  // モックGC関数を提供してエラーを防止
  global.gc = () => {
    console.log('⚠️ GC機能の擬似実行: 実際のメモリ解放はされていません');
    // 可能な限りのメモリ解放処理
    if (global.window && global.window.performance) {
      try {
        const memoryInfo = global.window.performance.memory;
        console.log(`メモリ使用状況: ${Math.round(memoryInfo.usedJSHeapSize / (1024 * 1024))}MB / ${Math.round(memoryInfo.jsHeapSizeLimit / (1024 * 1024))}MB`);
      } catch (e) {
        // メモリ情報取得エラーを無視
      }
    }

    try {
      // 一部のリソースを解放するためのダミー処理
      if (global.process && typeof global.process.memoryUsage === 'function') {
        const memUsage = process.memoryUsage();
        console.log(`プロセスメモリ: RSS=${Math.round(memUsage.rss / (1024 * 1024))}MB, Heap=${Math.round(memUsage.heapUsed / (1024 * 1024))}MB / ${Math.round(memUsage.heapTotal / (1024 * 1024))}MB`);
      }
    } catch (e) {
      console.error('メモリ使用量の取得に失敗しました', e);
    }
  };
}

// プロジェクト設定ファイルのパスを定義
const PROJECTS_CONFIG_PATH = path.join(app.getPath('userData'), 'projects.json');
const ACTIVE_PROJECT_PATH = path.join(app.getPath('userData'), 'active-project.json');
const CATEGORIES_PATH = path.join(app.getPath('userData'), 'categories.json');
const TAGS_PATH = path.join(app.getPath('userData'), 'tags.json');
const SELECTED_CATEGORY_PATH = path.join(app.getPath('userData'), 'selected-category.json');
const SELECTED_TAGS_PATH = path.join(app.getPath('userData'), 'selected-tags.json');
const PROJECT_DATA_DIR = path.join(app.getPath('userData'), 'projectData');

// 新しいファイルパスを追加（app.getName()を使用）
const appName = app.getName() || 'electron-app';

// 環境変数からAPIキーを取得
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DEFAULT_PROVIDER = "claude"; // デフォルトはClaude
const NO_PYTHON_MODE = false; // Pythonモードを有効化（falseの場合、Pythonを使用）

// Pythonブリッジをロード
let pythonBridge;
try {
  // python_scriptsディレクトリの存在を確認し、必要なら作成
  const pythonScriptsDir = path.join(__dirname, 'python_scripts');
  if (!fs.existsSync(pythonScriptsDir)) {
    console.log(`python_scriptsディレクトリが存在しないため作成します: ${pythonScriptsDir}`);
    fs.mkdirSync(pythonScriptsDir, { recursive: true });
  }

  // テスト用スクリプトを作成（存在しない場合のみ）
  const testBridgePath = path.join(pythonScriptsDir, 'test_bridge.py');
  if (!fs.existsSync(testBridgePath)) {
    console.log(`テスト用Pythonスクリプトを作成します: ${testBridgePath}`);
    const testScript = `
# テスト用Python Bridgeスクリプト
import sys
import json

def main():
    print(json.dumps({
        "success": True,
        "message": "Python bridge test script executed successfully"
    }))
    return 0

if __name__ == "__main__":
    sys.exit(main())
`;
    fs.writeFileSync(testBridgePath, testScript.trim(), 'utf8');
  }

  pythonBridge = require('./python_bridge');
  console.log('Pythonブリッジを読み込みました');
} catch (error) {
  console.error('Pythonブリッジの読み込みに失敗しました:', error);
  pythonBridge = {
    checkPythonEnvironment: () => Promise.resolve({ success: false, error: 'モジュール読み込みエラー' }),
  };
}

// グローバルエラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('未捕捉の例外が発生しました:', error);
  // エラーログを保存するなどの追加処理も可能
});

// 開発環境かどうかを判定
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;

// グローバル変数としてスプラッシュウィンドウを宣言
let splashWindow;

// グローバル変数の宣言
let isElectronAppReloadBlocked = true; // Electronアプリでのリロードをブロックするフラグ
let isAICodeSaving = false; // AIコード保存中のフラグ
const projectWatchers = new Map(); // プロジェクトファイル監視用Mapオブジェクト

// 監視するディレクトリ
const htmlDirectory = isDevelopment
  ? path.join(__dirname, '..', 'renderer')
  : path.join(process.resourcesPath, 'app', 'dist');
// previousFilesをグローバルに宣言して、前回のファイルリストを保持
let previousFiles = [];

// アプリ起動時に監視を開始するフラグ
let isDirectoryWatcherInitialized = false;

/**
 * 指定されたディレクトリを監視する
 * @param {string} directoryPath 監視するディレクトリパス
 * @param {function} callback 変更があった時に呼び出されるコールバック関数
 * @returns {FSWatcher|null} ファイル監視インスタンスまたはnull
 */
function watchDirectory(directoryPath, callback) {
  try {
    // 本番環境ではasar内のパスを監視できないため、監視をスキップ
    if (!isDevelopment && directoryPath.includes('.asar')) {
      console.log(`本番環境のため監視をスキップ: ${directoryPath}`);
      return null;
    }

    // ディレクトリの存在確認
    if (!fs.existsSync(directoryPath)) {
      console.warn(`監視対象ディレクトリが存在しません: ${directoryPath}`);
      return null;
    }

    // ディレクトリ監視を設定
    const watcher = chokidar.watch(directoryPath, {
      ignored: /(^|[\/\\])\../, // ドットファイルを無視
      persistent: true,
      depth: 2, // 再帰的に監視する深さを制限
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // 変更イベントを検知したらコールバックを呼び出す
    watcher.on('all', (event, path) => {
      if (event === 'change' || event === 'add' || event === 'unlink') {
        callback(path, event);
      }
    });

    console.log(`ディレクトリの監視を開始: ${directoryPath}`);
    return watcher;
  } catch (error) {
    console.error(`ディレクトリ監視の設定エラー: ${directoryPath}`, error);
    return null;
  }
}

/**
 * ファイル監視システムをセットアップ
 * @param {BrowserWindow} mainWindow メインウィンドウインスタンス
 */
function setupFileWatcher(mainWindow) {
  // 開発環境でのみソースコードの変更を監視
  if (isDevelopment) {
    // フロントエンドのソースコードを監視
    const frontendWatcher = watchDirectory(
      path.join(__dirname, '..', 'renderer'),
      (changedPath, event) => {
        console.log(`フロントエンドファイルが変更されました: ${changedPath} (${event})`);
        mainWindow.webContents.send('reload-renderer');
      }
    );

    // バックエンドのPythonコードを監視
    const pythonWatcher = watchDirectory(
      path.join(__dirname, '..', 'python'),
      (changedPath, event) => {
        if (path.extname(changedPath) === '.py') {
          console.log(`Pythonファイルが変更されました: ${changedPath} (${event})`);
          mainWindow.webContents.send('python-file-changed', {
            path: changedPath,
            event: event
          });
        }
      }
    );

    // 環境設定ファイルを監視
    const configWatcher = watchDirectory(
      app.getPath('userData'),
      (changedPath, event) => {
        if (path.basename(changedPath) === 'settings.json') {
          console.log(`設定ファイルが変更されました: ${changedPath} (${event})`);
          loadSettings();
          mainWindow.webContents.send('settings-changed', appSettings);
        }
      }
    );

    // アプリ終了時に監視を停止
    app.on('will-quit', () => {
      if (frontendWatcher) frontendWatcher.close();
      if (pythonWatcher) pythonWatcher.close();
      if (configWatcher) configWatcher.close();
      console.log('ファイル監視を停止しました');
    });
  } else {
    console.log('本番環境のためファイル監視システムは無効化されています');
  }
}

/**
 * プロジェクトファイルを監視
 * @param {string} projectId プロジェクトID
 * @param {string} projectPath プロジェクトディレクトリパス
 * @param {array} patterns 監視対象のファイルパターン
 * @returns {boolean} 監視が正常に開始されたかどうか
 */
function watchProjectFiles(projectId, projectPath, patterns) {
  console.log(`プロジェクトファイル監視を設定: ${projectId} - ${projectPath}`);

  // すでに監視中なら停止
  if (projectWatchers.has(projectId)) {
    try {
      const stopWatcher = projectWatchers.get(projectId);
      if (typeof stopWatcher === 'function') {
        stopWatcher();
      }
    } catch (error) {
      console.error(`既存の監視を停止中にエラー: ${projectId}`, error);
    }
  }

  // 本番環境でasar内のパスが含まれる場合は監視をスキップ
  if (!isDevelopment && (
    projectPath.includes('.asar') ||
    projectPath.includes(app.getAppPath())
  )) {
    console.log('本番環境のasarパスのため、プロジェクト監視をスキップします');
    return false;
  }

  try {
    // プロジェクトディレクトリが存在するか確認
    if (!fs.existsSync(projectPath)) {
      console.warn(`プロジェクトディレクトリが存在しません: ${projectPath}`);
      return false;
    }

    // 監視対象パターンを確認
    const watchPatterns = Array.isArray(patterns) && patterns.length > 0
      ? patterns
      : ['**/*.html', '**/*.htm', '**/*.css', '**/*.scss', '**/*.sass', '**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.json'];

    console.log(`監視パターン: ${watchPatterns.join(', ')}`);

    // 監視設定
    const watcher = chokidar.watch(watchPatterns, {
      cwd: projectPath,
      ignored: [
        /(^|[\/\\])\../, // ドットファイル
        '**/node_modules/**', // node_modules
        '**/.git/**', // git
        '**/dist/**', // ビルド成果物
        '**/build/**' // ビルド成果物
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 3, // 再帰的に監視する深さを制限
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    });

    // ファイル変更イベントを検知
    watcher.on('all', (event, filePath) => {
      // 重要なファイルに対するイベントのみ処理
      if (['add', 'change', 'unlink'].includes(event)) {
        // ファイル拡張子を取得
        const ext = path.extname(filePath).toLowerCase();

        console.log(`プロジェクトファイルの変更を検出: ${filePath} (${event})`);

        // レンダラープロセスに通知
        if (mainWindow) {
          mainWindow.webContents.send('project-file-changed', {
            projectId: projectId,
            path: filePath,
            fullPath: path.resolve(projectPath, filePath),
            event: event,
            ext: ext
          });
        }
      }
    });

    // エラーイベント処理
    watcher.on('error', error => {
      console.error(`プロジェクトファイル監視エラー(${projectId}):`, error);
    });

    // 監視を停止する関数
    const stopWatcher = () => {
      try {
        watcher.close();
        projectWatchers.delete(projectId);
        console.log(`プロジェクト監視を停止: ${projectId}`);
        return true;
      } catch (error) {
        console.error(`プロジェクト監視の停止に失敗: ${projectId}`, error);
        return false;
      }
    };

    // 監視状態を保存
    projectWatchers.set(projectId, stopWatcher);
    console.log(`プロジェクト[${projectId}]の監視を開始しました`);
    return true;
  } catch (error) {
    console.error(`プロジェクト監視の設定に失敗: ${projectId}`, error);
    return false;
  }
}

/**
 * プロジェクトファイルの監視を停止
 * @param {string} projectId プロジェクトID
 * @returns {boolean} 監視の停止が成功したかどうか
 */
function unwatchProjectFiles(projectId) {
  try {
    if (projectWatchers.has(projectId)) {
      const stopWatcher = projectWatchers.get(projectId);
      if (typeof stopWatcher === 'function') {
        return stopWatcher();
      }
    }
    return true; // 監視していなかった場合も成功とみなす
  } catch (error) {
    console.error(`プロジェクト監視の停止中にエラー: ${projectId}`, error);
    return false;
  }
}

// スプラッシュウィンドウを作成する関数
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  splashWindow.on('closed', () => {
    console.log('スプラッシュウィンドウが閉じられました');
    splashWindow = null;
  });
}

// メインウィンドウ作成関数
function createMainWindow() {
  console.log('メインウィンドウの作成を開始します');

  // アップロードディレクトリを作成（userData内に作成してasarの制限を回避）
  const uploadDir = path.join(app.getPath('userData'), 'uploads');
  try {
    if (!fs.existsSync(uploadDir)) {
      console.log(`アップロードディレクトリを作成します: ${uploadDir}`);
      fs.mkdirSync(uploadDir, { recursive: true });
    } else {
      console.log(`アップロードディレクトリが既に存在します: ${uploadDir}`);
    }
  } catch (err) {
    console.error('アップロードディレクトリの作成に失敗しました:', err);
  }

  const windowWidth = 1280;
  const windowHeight = 800;

  // preloadスクリプトのパスを確認
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('preloadスクリプトのパス:', preloadPath);  // デバッグログ追加
  console.log('preloadスクリプトが存在するか:', fs.existsSync(preloadPath));  // デバッグログ追加

  // ウィンドウオプションを設定
  const windowOptions = {
    width: windowWidth,
    height: windowHeight,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    show: false,
    title: 'CreAIte Code',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#001f3f',
      symbolColor: '#ffffff',
      height: 32
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,  // falseに変更
      preload: preloadPath
    }
  };

  console.log('ウィンドウオプション:', windowOptions);  // デバッグログ追加

  // メインウィンドウの作成
  mainWindow = new BrowserWindow(windowOptions);

  // ブラウザの開発者ツールを開く（開発時のみ）
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }

  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('isDevelopment:', isDevelopment);

  // 開発環境と本番環境で適切なパスを使い分ける
  let filePath;


  if (isDevelopment) {
    filePath = path.join(__dirname, '..', '..', 'dist', 'index.html');
  } else {
    // 複数の候補パスを試す
    const possiblePaths = [
      path.join(app.getAppPath(), 'dist', 'index.html'), // asarパッケージ内
      path.join(process.resourcesPath, 'app/dist', 'index.html'), // extraResourcesからのパス
      path.join(process.resourcesPath, 'dist', 'index.html') // 直接Resourcesディレクトリ
    ];

    // 存在する最初のパスを使用
    filePath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
    console.log('本番モード: HTMLファイルを読み込みます:', filePath);
  }

  // ブラウザコンソールのログを表示
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[WebContents] ${message}`);
  });

  // ファイルを読み込む
  mainWindow.loadFile(filePath).catch(err => {
    console.error('ファイル読み込みエラー:', err);

    // 読み込み失敗時のフォールバック
    const fallbackPath = isDevelopment
      ? path.join(__dirname, 'index.html')
      : path.join(process.resourcesPath, 'app', 'dist', 'index.html');
    console.log('フォールバックファイルを読み込みます:', fallbackPath);
    mainWindow.loadFile(fallbackPath).catch(fallbackErr => {
      console.error('フォールバックファイルの読み込みにも失敗:', fallbackErr);
    });
  });

  // レンダリングの問題をデバッグするためのフラグを設定
  app.commandLine.appendSwitch('disable-site-isolation-trials');

  // ウィンドウが閉じられたときにメインウィンドウを破棄
  mainWindow.on('closed', () => {
    console.log('メインウィンドウが閉じられました');
    mainWindow = null;
  });

  // メインウィンドウの準備ができたら表示
  mainWindow.once('ready-to-show', () => {
    console.log('メインウィンドウの表示準備完了');

    // スプラッシュウィンドウが存在すれば閉じる
    if (splashWindow && !splashWindow.isDestroyed()) {
      console.log('スプラッシュウィンドウを閉じます');
      splashWindow.close();
      splashWindow = null;
    }

    // 0.5秒待ってからメインウィンドウを表示（スプラッシュが完全に閉じるのを待つ）
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
    }, 500);
  });

  // ファイル監視対象
  const watchFiles = [
    path.join(__dirname, 'src/scss/base/_reset.scss'),
    path.join(__dirname, 'src/scss/globals/_breakpoints.scss'),
  ];

  // ファイルの監視処理
  watchFiles.forEach((file) => {
    fs.watchFile(file, (curr, prev) => {
      fs.readFile(file, 'utf8', (err, data) => {
        if (!err && mainWindow) {
          mainWindow.webContents.send('file-updated', { file, content: data });
        }
      });
    });
  });

  // ウィンドウの読み込みイベントをリッスン
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('ウィンドウの読み込みを開始しました');  // デバッグログ追加
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('ウィンドウの読み込みが完了しました');  // デバッグログ追加
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log('DOMの準備が完了しました');  // デバッグログ追加
  });

  return mainWindow;
}

// アプリの起動が完了したら
app.whenReady().then(async () => {
  // ユーザーデータディレクトリとパスを確認
  const userDataPath = app.getPath('userData');
  console.log('ユーザーデータディレクトリ:', userDataPath);
  console.log('設定ファイルパス:');
  console.log(`- PROJECTS_CONFIG_PATH: ${PROJECTS_CONFIG_PATH}`);
  console.log(`- ACTIVE_PROJECT_PATH: ${ACTIVE_PROJECT_PATH}`);
  console.log(`- CATEGORIES_PATH: ${CATEGORIES_PATH}`);
  console.log(`- TAGS_PATH: ${TAGS_PATH}`);
  console.log(`- SELECTED_CATEGORY_PATH: ${SELECTED_CATEGORY_PATH}`);
  console.log(`- SELECTED_TAGS_PATH: ${SELECTED_TAGS_PATH}`);

  // CSPの設定
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; connect-src 'self' https://payments.codeups.jp; script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:;"
        ]
      }
    });
  });

  // Pythonブリッジの初期化
  try {
    console.log('Pythonブリッジを初期化しています...');

    // アプリケーションのルートパスを環境変数に設定
    process.env.APP_ROOT_PATH = app.getAppPath();
    console.log(`アプリケーションルートパス: ${process.env.APP_ROOT_PATH}`);

    // リソースパスをログ出力
    console.log(`process.resourcesPath: ${process.resourcesPath}`);

    // パッケージ済みアプリケーションの場合、extraResourcesから正しいパスを取得
    if (!isDevelopment && app.isPackaged) {
      // extraResourcesのパスを設定
      process.env.PYTHON_RESOURCES_PATH = path.join(process.resourcesPath, 'app', 'python');
      console.log(`Python リソースパス: ${process.env.PYTHON_RESOURCES_PATH}`);

      // ディレクトリ内容を確認
      if (fs.existsSync(process.resourcesPath)) {
        try {
          const resourcesDir = fs.readdirSync(process.resourcesPath);
          console.log('リソースディレクトリ内容:', resourcesDir);

          const pythonPath = path.join(process.resourcesPath, 'python');
          if (fs.existsSync(pythonPath)) {
            console.log('Pythonディレクトリ内容:', fs.readdirSync(pythonPath));
          } else {
            console.log('Pythonディレクトリが見つかりません:', pythonPath);
          }
        } catch (dirErr) {
          console.error('ディレクトリ内容の確認中にエラーが発生しました:', dirErr);
        }
      }
    } else {
      // 開発環境ではソースコードのパスを使用
      process.env.PYTHON_RESOURCES_PATH = path.join(app.getAppPath(), 'src', 'python');
      console.log(`Python 開発リソースパス: ${process.env.PYTHON_RESOURCES_PATH}`);
    }

    // Pythonの実行パスを設定 - ベストプラクティス
    // 開発環境ではシステムのPython、本番環境ではバンドルされたPythonを使用
    const pythonPath = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'app', 'python', 'python.exe') // Windows
      : path.join(process.resourcesPath, 'app', 'python', 'python'); // macOS/Linux

    console.log(`使用するPythonパス: ${pythonPath}`);

    // PythonShellの設定
    let options = {
      mode: 'text',
      pythonPath: pythonPath,
      pythonOptions: ['-u'], // 出力をバッファリングしない
      scriptPath: process.env.PYTHON_RESOURCES_PATH || path.join(app.getAppPath(), 'src', 'python')
    };

    console.log('PythonShell設定:', options);

    // test_bridge.pyを作成 - ユーザーデータフォルダに作成してasarの制限を回避
    const userDataPath = app.getPath('userData');
    const pythonTestDir = path.join(userDataPath, 'python_temp');
    if (!fs.existsSync(pythonTestDir)) {
      fs.mkdirSync(pythonTestDir, { recursive: true });
    }

    const testBridgePath = path.join(pythonTestDir, 'test_bridge.py');
    const testBridgeContent = `
import sys
import platform

print("Python bridge test - Success!")
print(f"Python version: {sys.version}")
print(f"Platform: {platform.platform()}")
print("==== End of test ====")
sys.exit(0)
`;

    fs.writeFileSync(testBridgePath, testBridgeContent);
    console.log(`テスト用Pythonスクリプトを作成しました: ${testBridgePath}`);

    // テスト設定を更新
    options.scriptPath = pythonTestDir;

    // Pythonブリッジのテスト実行
    console.log('Pythonブリッジのテスト実行を開始します...');
    try {
      PythonShell.run('test_bridge.py', options, function (err, results) {
        if (err) {
          console.error('Pythonブリッジのテストに失敗しました:', err);
        } else {
          console.log('Pythonブリッジのテスト結果:', results);
        }
      });
    } catch (testErr) {
      console.error('Pythonブリッジのテスト実行中にエラーが発生しました:', testErr);
    }
  } catch (error) {
    console.error('Pythonブリッジの設定中にエラーが発生しました:', error);
  }

  // 重要: カテゴリとタグの初期化を他の処理より先に実行
  try {
    console.log('カテゴリとタグの初期化を開始します...');

    // userData ディレクトリの確認
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
      console.log(`userData ディレクトリを作成しました: ${userDataPath}`);
    }

    // ファイル存在確認と初期化（存在しない場合のみ）
    // カテゴリファイル
    const defaultCategories = ['uncategorized', '制作会社', 'コミュニティ', 'エンド'];
    if (!fs.existsSync(CATEGORIES_PATH)) {
      fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(defaultCategories), 'utf8');
      console.log('カテゴリファイルを新規作成しました:', defaultCategories);
    } else {
      console.log('カテゴリファイルは既に存在するため、初期化をスキップします');
    }

    // タグファイル
    const defaultTags = [];
    if (!fs.existsSync(TAGS_PATH)) {
      fs.writeFileSync(TAGS_PATH, JSON.stringify(defaultTags), 'utf8');
      console.log('タグファイルを新規作成しました:', defaultTags);
    } else {
      console.log('タグファイルは既に存在するため、初期化をスキップします');
    }

    // 選択中カテゴリファイル
    if (!fs.existsSync(SELECTED_CATEGORY_PATH)) {
      fs.writeFileSync(SELECTED_CATEGORY_PATH, JSON.stringify('all'), 'utf8');
      console.log('選択中カテゴリファイルを新規作成しました: all');
    } else {
      console.log('選択中カテゴリファイルは既に存在するため、初期化をスキップします');
    }

    // 選択中タグファイル
    if (!fs.existsSync(SELECTED_TAGS_PATH)) {
      fs.writeFileSync(SELECTED_TAGS_PATH, JSON.stringify([]), 'utf8');
      console.log('選択中タグファイルを新規作成しました: []');
    } else {
      console.log('選択中タグファイルは既に存在するため、初期化をスキップします');
    }

    // ファイル作成確認
    console.log('ファイル作成確認:');
    console.log('- カテゴリファイル存在:', fs.existsSync(CATEGORIES_PATH));
    console.log('- タグファイル存在:', fs.existsSync(TAGS_PATH));
    console.log('- 選択カテゴリファイル存在:', fs.existsSync(SELECTED_CATEGORY_PATH));
    console.log('- 選択タグファイル存在:', fs.existsSync(SELECTED_TAGS_PATH));

    // ファイル内容確認
    try {
      const catContent = fs.readFileSync(CATEGORIES_PATH, 'utf8');
      console.log('カテゴリファイル内容:', catContent);
    } catch (err) {
      console.error('カテゴリファイル読み込みエラー:', err);
    }

    console.log('カテゴリとタグの初期化が完了しました');
  } catch (error) {
    console.error('カテゴリとタグの初期化中にエラーが発生しました:', error);
  }

  console.log('アプリ起動時にIPCハンドラーを設定します');
  setupIPCHandlers();
  setupFileWatcher(mainWindow);

  // スプラッシュウィンドウを作成
  createSplashWindow();

  // メインウィンドウの作成をわずかに遅延させる
  setTimeout(() => {
    createMainWindow();

    // ディレクトリ監視を開始
    watchDirectory(htmlDirectory, (changedPath, event) => {
      console.log(`ファイルが変更されました: ${changedPath} (${event})`);
      mainWindow.webContents.send('file-changed', {
        type: path.extname(changedPath).toLowerCase(),
        filename: path.basename(changedPath),
        path: changedPath
      });
    });
  }, 1000);

  // Mac OS の場合、アプリがアクティブ化されたらメインウィンドウを作成
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
  function startPeriodicGC() {
    console.log('定期的なガベージコレクションを開始します');

    // メモリ使用状況をチェックし、必要に応じてGCを実行
    const gcInterval = setInterval(() => {
      try {
        if (global.gc) {
          // メモリ使用状況をログ
          const memUsage = process.memoryUsage();
          const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
          const rssMemoryMB = Math.round(memUsage.rss / (1024 * 1024));

          // メモリ使用量が一定のしきい値を超えた場合のみGCを実行
          const HEAP_THRESHOLD_MB = 300; // 300MB

          if (heapUsedMB > HEAP_THRESHOLD_MB) {
            console.log(`メモリ使用量しきい値超過 (${heapUsedMB}MB)。ガベージコレクションを実行します`);
            global.gc();

            // GC後のメモリ使用状況をログ
            const afterGcMemUsage = process.memoryUsage();
            const afterHeapUsedMB = Math.round(afterGcMemUsage.heapUsed / (1024 * 1024));
            console.log(`GC後のメモリ使用量: ${afterHeapUsedMB}MB (解放: ${heapUsedMB - afterHeapUsedMB}MB)`);
          } else {
            console.log(`現在のメモリ使用量: ${heapUsedMB}MB (ヒープ), ${rssMemoryMB}MB (RSS)`);
          }
        }
      } catch (error) {
        console.error('定期的なガベージコレクション中にエラーが発生しました:', error);
      }
    }, 60000); // 1分ごとにチェック

    // アプリケーション終了時にインターバルをクリア
    app.on('quit', () => {
      clearInterval(gcInterval);
      console.log('定期的なガベージコレクションを停止しました');
    });
  }

  // コンソール情報を取得する関数
  function getConsoleInfo() {
    try {
      const consoleInfo = {
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        platform: process.platform,
        arch: process.arch,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      };
      return consoleInfo;
    } catch (error) {
      console.error('コンソール情報の取得に失敗:', error);
      return null;
    }
  }

  // コンソール情報を定期的に取得する関数
  function startConsoleMonitoring() {
    setInterval(() => {
      const consoleInfo = getConsoleInfo();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('console-info-updated', consoleInfo);
      }
    }, 5000); // 5秒ごとに更新
  }

  // コンソール監視を開始
  startConsoleMonitoring();

  // メモリ管理を開始
  if (global.gc) {
    console.log('メモリ管理: ガベージコレクション機能が有効です');
    startPeriodicGC();
  } else {
    console.warn('メモリ管理: ガベージコレクション機能が無効です。--js-flags="--expose-gc"フラグを使用してください');
  }

  // Python実行環境のチェック
  const pythonStatus = await checkPythonRuntime();
  console.log(`Python実行環境ステータス: ${pythonStatus}`);

  // JSXファイルのMIMEタイプを設定
  // ... existing code ...
});

// Macでアプリケーションが閉じられる際の処理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// デフォルト設定ファイルのパスを定義
const DEFAULT_SETTINGS_PATH = path.join(app.getPath('userData'), 'default-settings.json');

// デフォルト設定の読み込み
function loadDefaultSettings() {
  try {
    if (fs.existsSync(DEFAULT_SETTINGS_PATH)) {
      const data = fs.readFileSync(DEFAULT_SETTINGS_PATH, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('デフォルト設定の読み込みに失敗:', error);
    return null;
  }
}

// デフォルト設定の保存
function saveDefaultSettings(settings) {
  try {
    fs.writeFileSync(DEFAULT_SETTINGS_PATH, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('デフォルト設定の保存に失敗:', error);
    return false;
  }
}

// アクティブプロジェクトIDの保存
async function saveActiveProjectId(projectId) {
  try {
    await fs.promises.writeFile(ACTIVE_PROJECT_PATH, JSON.stringify({ activeProjectId: projectId }));
    console.log('アクティブプロジェクトIDを保存しました:', projectId);
    return true;
  } catch (error) {
    console.error('アクティブプロジェクトIDの保存に失敗:', error);
    return false;
  }
}

// アクティブプロジェクトIDの読み込み
async function loadActiveProjectId() {
  try {
    if (fs.existsSync(ACTIVE_PROJECT_PATH)) {
      const data = await fs.promises.readFile(ACTIVE_PROJECT_PATH, 'utf8');
      const { activeProjectId } = JSON.parse(data);
      console.log('アクティブプロジェクトIDを読み込みました:', activeProjectId);
      return activeProjectId;
    }
    return null;
  } catch (error) {
    console.error('アクティブプロジェクトIDの読み込みに失敗:', error);
    return null;
  }
}

// カテゴリの読み込み
const loadCategories = () => {
  console.log('カテゴリの読み込みを開始します。パス:', CATEGORIES_PATH);

  // デフォルトカテゴリリスト（最小限）
  const defaultCategories = ['uncategorized'];

  try {
    // カテゴリファイルが存在するか確認
    if (fs.existsSync(CATEGORIES_PATH)) {
      console.log('カテゴリファイルが存在します。読み込みを実行します。');

      // ファイルの内容を読み込む
      const data = fs.readFileSync(CATEGORIES_PATH, 'utf8');
      console.log('カテゴリファイルの内容:', data);

      try {
        // JSONとしてパース
        const parsedCategories = JSON.parse(data);
        console.log('パースされたカテゴリ:', parsedCategories);

        // データが配列であることを確認
        if (!Array.isArray(parsedCategories)) {
          console.error('カテゴリデータが配列ではありません。デフォルト値を使用します。');
          fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(defaultCategories));
          return defaultCategories;
        }

        // 空の配列の場合はデフォルト値を使用
        if (parsedCategories.length === 0) {
          console.log('カテゴリリストが空です。デフォルト値を使用します。');
          fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(defaultCategories));
          return defaultCategories;
        }

        // uncategorizedが含まれていない場合は追加
        if (!parsedCategories.includes('uncategorized')) {
          console.log('uncategorizedカテゴリが含まれていないため追加します。');
          const updatedCategories = ['uncategorized', ...parsedCategories];
          fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(updatedCategories));
          return updatedCategories;
        }

        return parsedCategories;
      } catch (parseError) {
        console.error('カテゴリJSONのパースに失敗:', parseError);
        console.log('デフォルトカテゴリを使用して新しいファイルを作成します。');
        fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(defaultCategories));
        return defaultCategories;
      }
    } else {
      console.log('カテゴリファイルが存在しません。新しく作成します。');

      // ディレクトリが存在しない場合は作成
      const dir = path.dirname(CATEGORIES_PATH);
      if (!fs.existsSync(dir)) {
        console.log('ディレクトリを作成します:', dir);
        fs.mkdirSync(dir, { recursive: true });
      }

      // 最小限のデフォルトカテゴリを保存
      fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(defaultCategories));
      console.log('デフォルトカテゴリを保存しました:', defaultCategories);
      return defaultCategories;
    }
  } catch (error) {
    console.error('カテゴリファイルの読み込み中にエラーが発生:', error);
    return defaultCategories;
  }
};

// カテゴリの保存
async function saveCategories(categories) {
  try {
    console.log('カテゴリを保存します。入力データ:', categories);

    // 必須カテゴリの確認（uncategorizedのみ）
    const requiredCategories = ['uncategorized'];

    // カテゴリが配列であることを確認
    if (!Array.isArray(categories)) {
      console.error('カテゴリが配列ではありません:', categories);
      return false;
    }

    // 必須カテゴリが含まれているか確認し、なければ追加
    let updatedCategories = [...categories];
    let wasUpdated = false;

    if (!updatedCategories.includes('uncategorized')) {
      console.log(`必須カテゴリ "uncategorized" が含まれていないため追加します`);
      updatedCategories.unshift('uncategorized');
      wasUpdated = true;
    }

    // ディレクトリが存在することを確認
    const dirPath = path.dirname(CATEGORIES_PATH);
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }

    // 更新されたカテゴリリストを保存
    if (wasUpdated) {
      console.log('必須カテゴリを追加した更新リスト:', updatedCategories);
    }

    await fs.promises.writeFile(CATEGORIES_PATH, JSON.stringify(updatedCategories));
    console.log(`カテゴリを保存しました: ${CATEGORIES_PATH}`, updatedCategories);
    return true;
  } catch (error) {
    console.error('カテゴリの保存に失敗:', error);
    return false;
  }
}

// タグの読み込み
async function loadTags() {
  try {
    console.log('タグの読み込みを開始します。パス:', TAGS_PATH);

    if (fs.existsSync(TAGS_PATH)) {
      const data = await fs.promises.readFile(TAGS_PATH, 'utf8');
      console.log('タグファイルの内容:', data);

      try {
        const parsedTags = JSON.parse(data);

        // 配列でない場合は空の配列を返す
        if (!Array.isArray(parsedTags)) {
          console.error('タグデータが配列ではありません。空の配列を使用します。');
          return [];
        }

        console.log('読み込まれたタグ:', parsedTags);
        return parsedTags;
      } catch (parseError) {
        console.error('タグJSONのパース失敗:', parseError);
        return [];
      }
    }

    console.log('タグファイルが存在しないため、空の配列を返します。');
    return [];
  } catch (error) {
    console.error('タグの読み込みに失敗:', error);
    return [];
  }
}

// タグの保存
async function saveTags(tags) {
  try {
    // ディレクトリが存在することを確認
    const dirPath = path.dirname(TAGS_PATH);
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }

    await fs.promises.writeFile(TAGS_PATH, JSON.stringify(tags));
    console.log(`タグを保存しました: ${TAGS_PATH}`, tags);
    return true;
  } catch (error) {
    console.error('タグの保存に失敗:', error);
    return false;
  }
}


// 選択中のカテゴリを保存 (同期版)
function saveSelectedCategory(category) {
  try {
    console.log(`選択中のカテゴリを保存します: ${SELECTED_CATEGORY_PATH}`, category);

    // ディレクトリが存在することを確認
    const dirPath = path.dirname(SELECTED_CATEGORY_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(SELECTED_CATEGORY_PATH, JSON.stringify(category));
    console.log(`選択中のカテゴリを同期的に保存しました: ${category}`);
    return true;
  } catch (error) {
    console.error('選択中のカテゴリの保存に失敗:', error);
    return false;
  }
}

// 選択中のカテゴリを読み込み (同期版)
function loadSelectedCategory() {
  try {
    console.log(`選択中のカテゴリを読み込みます: ${SELECTED_CATEGORY_PATH}`);

    if (fs.existsSync(SELECTED_CATEGORY_PATH)) {
      const data = fs.readFileSync(SELECTED_CATEGORY_PATH, 'utf8');
      const category = JSON.parse(data);
      console.log('選択中のカテゴリを同期的に読み込みました:', category);
      return category || 'all';
    }
    console.log('カテゴリファイルが存在しないため、デフォルト値 "all" を返します');
    return 'all';
  } catch (error) {
    console.error('選択中のカテゴリの読み込みに失敗:', error);
    return 'all';
  }
}


// 選択中のタグを保存
async function saveSelectedTags(tags) {
  try {
    // ディレクトリが存在することを確認
    const dirPath = path.dirname(SELECTED_TAGS_PATH);
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }

    await fs.promises.writeFile(SELECTED_TAGS_PATH, JSON.stringify(tags));
    console.log(`選択中のタグを保存しました: ${SELECTED_TAGS_PATH}`, tags);
    return true;
  } catch (error) {
    console.error('選択中のタグの保存に失敗:', error);
    return false;
  }
}

// 選択中のタグを読み込み
async function loadSelectedTags() {
  try {
    if (fs.existsSync(SELECTED_TAGS_PATH)) {
      const data = await fs.promises.readFile(SELECTED_TAGS_PATH, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('選択されたタグの読み込みに失敗:', error);
    return null;
  }
}

// IPC ハンドラーを設定する関数
function setupIPCHandlers() {

  // 選択されたカテゴリを同期的に保存するハンドラー
  ipcMain.on('save-selected-category-sync', (event, category) => {
    console.log('選択されたカテゴリを同期的に保存します:', category);
    try {
      const result = saveSelectedCategory(category);
      event.returnValue = result;
    } catch (error) {
      console.error('選択されたカテゴリの同期保存中にエラーが発生しました:', error);
      event.returnValue = false;
    }
  });

  // 選択されたカテゴリを同期的に読み込むハンドラー
  ipcMain.on('load-selected-category-sync', (event) => {
    console.log('選択されたカテゴリを同期的に読み込みます');
    try {
      const category = loadSelectedCategory();
      console.log('読み込まれたカテゴリ:', category);
      event.returnValue = category;
    } catch (error) {
      console.error('選択されたカテゴリの同期読み込み中にエラーが発生しました:', error);
      event.returnValue = 'all';
    }
  });

  // カスタムリロード機能 - フロントエンドファイルのみをリロードし、Electron管理画面は維持する
  ipcMain.on('reload-frontend-only', (event, { filePath }) => {
    console.log('フロントエンドファイルのリロードリクエスト:', filePath);

    // ここでフロントエンドのコンテンツだけを更新し、Electron管理画面はそのまま維持
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.error('ファイルの読み込みエラー:', err);
        event.reply('reload-frontend-error', err.message);
      } else {
        // ファイルの内容をフロントエンドに送信
        event.reply('frontend-content-updated', { filePath, content: data });
        console.log('フロントエンドコンテンツを更新しました:', filePath);
      }
    });
  });

  // 管理画面がファイルの内容をリクエストした際に、その内容を返す処理
  ipcMain.on('request-file-content', (event, filePath) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading file:', err);
      } else {
        event.sender.send('file-updated', { file: path.basename(filePath), content: data });
      }
    });
  });

  // HTMLファイル一覧を取得する
  ipcMain.handle('get-html-files', async () => {
    try {
      console.log('get-html-files ハンドラーが呼び出されました');

      // アクティブプロジェクトのIDを取得
      const activeProjectId = await loadActiveProjectId();
      if (!activeProjectId) {
        console.error('アクティブなプロジェクトが見つかりません');
        return [];
      }

      // プロジェクト情報の取得
      const project = await loadProjectSettings(activeProjectId);
      if (!project || !project.path) {
        console.error('プロジェクト情報の取得に失敗しました');
        return [];
      }

      console.log(`アクティブプロジェクト: ${project.name}, パス: ${project.path}`);

      // アクティブプロジェクトのHTMLファイルフォルダ
      const pagesDir = path.join(project.path, 'src/pages');

      console.log(`HTMLファイルを検索するディレクトリ: ${pagesDir}`);

      // ディレクトリが存在しない場合は作成
      if (!fs.existsSync(pagesDir)) {
        console.log(`pagesディレクトリが存在しないため作成します: ${pagesDir}`);
        await fs.promises.mkdir(pagesDir, { recursive: true });
        return [];
      }

      const files = await fs.promises.readdir(pagesDir);
      const htmlFiles = files.filter(file => file.endsWith('.html'));
      console.log('HTMLファイル一覧:', htmlFiles);
      return htmlFiles;
    } catch (error) {
      console.error('HTMLファイル一覧の取得中にエラーが発生しました:', error);
      return [];
    }
  });

  // ファイル存在確認
  ipcMain.handle('check-file-exists', async (event, blockName) => {
    try {
      console.log('check-file-exists ハンドラーが呼び出されました:', blockName);

      const scssDir = path.join(__dirname, 'src/scss/object/AI_Component');
      const htmlPartsDir = path.join(__dirname, 'src/partsHTML');

      const scssFilePath = path.join(scssDir, `_${blockName}.scss`);
      const htmlFilePath = path.join(htmlPartsDir, `${blockName}.html`);

      return {
        fileExists: {
          scss: fs.existsSync(scssFilePath),
          html: fs.existsSync(htmlFilePath)
        }
      };
    } catch (error) {
      console.error('ファイル存在確認中にエラーが発生しました:', error);
      return {
        fileExists: { scss: false, html: false },
        error: error.message
      };
    }
  });

  // 変数管理
  ipcMain.on('save-variables', (event, variables) => {
    const {
      lInner,
      paddingPc,
      paddingSp,
      jaFont,
      enFont,
      regularWeight,
      normalWeight,
      boldWeight,
      primaryColor,
      secondaryColor,
    } = variables;

    const scssContent = `
@use "sass:map";

// インナー幅設定（remに変換済み）
$l-inner: ${lInner}rem;
$padding-pc: ${paddingPc}rem;
$padding-sp: ${paddingSp}rem;

// フォント設定
$ja: "${jaFont}";
$en: "${enFont}";
$regular: ${regularWeight};
$normal: ${normalWeight};
$bold: ${boldWeight};

// 色の指定
$primary-color: ${primaryColor};
$secondary-color: ${secondaryColor};
`;

    const filePath = path.join(__dirname, 'src/scss/globals/_settings.scss');
    fs.writeFile(filePath, scssContent, 'utf8', (err) => {
      if (err) {
        console.error(`Error writing to ${filePath}:`, err);
      } else {
        console.log(`Successfully updated ${filePath}`);
      }
    });
  });

  // 管理画面からファイルを保存する要求を受け取る
  ipcMain.on('save-html-file', async (event, { filePath, content, projectId, projectPath }) => {
    console.log('HTMLファイル保存リクエスト:', { filePath });

    try {
      // プロジェクト情報のチェック
      if (!projectId && !projectPath) {
        // 引数でプロジェクト情報が渡されていない場合はアクティブなプロジェクトを取得
        const activeProjectId = await loadActiveProjectId();
        if (!activeProjectId) {
          console.error('アクティブなプロジェクトが見つかりません');
          event.reply('save-html-file-error', 'アクティブなプロジェクトが見つかりません');
          return;
        }

        // プロジェクト設定を読み込む
        const project = await loadProjectSettings(activeProjectId);
        if (!project || !project.path) {
          console.error('プロジェクトのパスが設定されていません');
          event.reply('save-html-file-error', 'プロジェクトのパスが設定されていません');
          return;
        }

        projectPath = project.path;
      }

      // プロジェクトパスの確認
      if (!projectPath) {
        console.error('プロジェクトパスが指定されていません');
        event.reply('save-html-file-error', 'プロジェクトパスが指定されていません');
        return;
      }

      // 相対パスのチェックと調整
      let relativeFilePath = filePath;

      // src/が含まれていない場合は追加
      if (!relativeFilePath.includes('src/')) {
        relativeFilePath = `src/${relativeFilePath}`;
      }

      // pages/が含まれていない場合は追加
      if (!relativeFilePath.includes('pages/') && !relativeFilePath.includes('pages\\')) {
        // src/の後にpages/を挿入
        const srcIndex = relativeFilePath.indexOf('src/') + 4;
        relativeFilePath = `${relativeFilePath.substring(0, srcIndex)}pages/${relativeFilePath.substring(srcIndex)}`;
      }

      // 絶対パスに変換
      const absolutePath = path.join(projectPath, relativeFilePath);
      console.log(`ファイル保存先の絶対パス: ${absolutePath}`);

      // ディレクトリが存在しない場合は作成
      const dirPath = path.dirname(absolutePath);
      if (!fs.existsSync(dirPath)) {
        console.log(`ディレクトリが存在しないため作成します: ${dirPath}`);
        await fs.promises.mkdir(dirPath, { recursive: true });
      }

      // ファイルを書き込む
      await fs.promises.writeFile(absolutePath, content, 'utf8');
      console.log(`HTMLファイルを保存しました: ${absolutePath}`);

      // 成功レスポンスを送信
      event.reply('save-html-file-success', absolutePath);

      // 他のリスナーにも通知
      mainWindow.webContents.send('file-updated', { filePath: absolutePath, projectPath });
    } catch (err) {
      console.error('HTMLファイル保存中にエラーが発生しました:', err);
      event.reply('save-html-file-error', err.message);
    }
  });

  // ファイル削除処理
  ipcMain.on('delete-html-file', async (event, { fileName, projectId, projectPath }) => {
    try {
      console.log('HTMLファイル削除リクエスト:', { fileName, projectId, projectPath });

      // プロジェクトIDとパスのチェック
      if (!projectId && !projectPath) {
        // 引数でプロジェクト情報が渡されていない場合はアクティブなプロジェクトを取得
        const activeProjectId = await loadActiveProjectId();
        if (!activeProjectId) {
          console.error('アクティブなプロジェクトが見つかりません');
          event.reply('file-delete-error', 'アクティブなプロジェクトが見つかりません');
          return;
        }

        // プロジェクト設定を読み込む
        const activeProject = await loadProjectSettings(activeProjectId);
        if (!activeProject || !activeProject.path) {
          console.error('プロジェクトのパスが設定されていません');
          event.reply('file-delete-error', 'プロジェクトのパスが設定されていません');
          return;
        }

        projectPath = activeProject.path;
      }

      // プロジェクトパスの確認
      if (!projectPath) {
        console.error('プロジェクトパスが指定されていません');
        event.reply('file-delete-error', 'プロジェクトパスが指定されていません');
        return;
      }

      // ファイル名がpages/以下を含んでいる場合と含んでいない場合を処理
      const relativePath = fileName.includes('pages/') ? fileName : `pages/${fileName}`;
      const filePath = path.join(projectPath, 'src', relativePath);

      console.log(`削除予定のファイルパス: ${filePath}`);

      // ファイルの存在確認
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);  // ファイル削除
        console.log(`ファイルを削除しました: ${filePath}`);
        event.reply('file-deleted', fileName);
        mainWindow.webContents.send('file-deleted', fileName); // 監視しているレンダラープロセスに通知
      } else {
        console.log(`ファイルが見つかりません: ${filePath}`);
        // エラーではなく通知として返す
        event.reply('file-deleted', fileName);
        mainWindow.webContents.send('file-deleted', fileName);
      }
    } catch (error) {
      console.error('ファイル削除中にエラーが発生しました:', error);
      event.reply('file-delete-error', error.message);
    }
  });

  // ファイル名を変更する処理
  ipcMain.on('rename-file', async (event, { oldFileName, newFileName }) => {
    try {
      // アクティブなプロジェクトのIDを取得
      const projectId = await loadActiveProjectId();
      if (!projectId) {
        console.error('アクティブなプロジェクトが見つかりません');
        event.reply('file-rename-error', 'アクティブなプロジェクトが見つかりません');
        return;
      }

      // プロジェクト設定を読み込む
      const project = await loadProjectSettings(projectId);
      if (!project || !project.path) {
        console.error('プロジェクトのパスが設定されていません');
        event.reply('file-rename-error', 'プロジェクトのパスが設定されていません');
        return;
      }

      // 拡張子が重複しないように処理
      const oldFilePath = path.join(project.path, 'src', oldFileName);
      const newFileNameWithHtml = newFileName.endsWith('.html') ? newFileName : newFileName + '.html'; // .htmlがなければ追加
      const newFilePath = path.join(project.path, 'src', newFileNameWithHtml);

      // ファイル名を変更する
      await fs.promises.rename(oldFilePath, newFilePath);
      console.log(`File renamed from ${oldFileName} to ${newFileNameWithHtml}`);

      // フロントエンドに変更が成功したことを通知
      event.reply('file-renamed', { oldFileName, newFileName: newFileNameWithHtml });
    } catch (err) {
      console.error('Error renaming file:', err);
      event.reply('file-rename-error', err.message);
    }
  });

  // SCSSファイルの保存処理
  ipcMain.on('save-scss-file', (event, { filePath, content, breakpoints }) => {
    // 動的なブレークポイントの生成
    let breakpointsContent = '';

    if (breakpoints && breakpoints.length > 0) {
      // _breakpoints.scssの場合、完全なファイル内容を構築
      if (filePath.includes('_breakpoints.scss')) {
        breakpointsContent = `
@use "sass:map";

// どっちファーストの設定（"sp" or "pc"）
$startFrom: sp;

// ブレークポイント
$breakpoints: (
  ${breakpoints.map(bp => `${bp.name}: ${bp.value}px`).join(',\n  ')}
);

// メディアクエリ
$mediaquerys: (
  ${breakpoints.map(bp => `${bp.name}: "screen and (min-width: #{map.get($breakpoints,'${bp.name}')})"`)
            .join(',\n  ')}
);

// スマホファースト用メディアクエリ
@mixin mq($mediaquery: md) {
  @media #{map.get($mediaquerys, $mediaquery)} {
    @content;
  }
}
`;
        // ブレークポイントファイルの場合は、生成した内容をそのまま保存
        fs.writeFile(filePath, breakpointsContent, 'utf8', (err) => {
          if (err) {
            console.error(`Error writing ${filePath}:`, err);
          } else {
            console.log(`${filePath} updated successfully`);
          }
        });
        return;
      } else {
        // 他のSCSSファイルの場合は従来通りの処理
        breakpointsContent = `$breakpoints: (\n  ${breakpoints
          .map(bp => `${bp.name}: ${bp.value}px`)
          .join(',\n  ')}\n);`;
      }
    }

    // 通常のSCSSファイル更新
    const newContent = filePath.includes('_breakpoints.scss')
      ? content
      : `${breakpointsContent}\n${content}`;

    // SCSSファイルを保存
    fs.writeFile(filePath, newContent, 'utf8', (err) => {
      if (err) {
        console.error(`Error writing ${filePath}:`, err);
      } else {
        console.log(`${filePath} updated successfully`);
      }
    });
  });

  // ページ保存用のIPCリスナー
  ipcMain.on('save-page', (event, pageData) => {
    console.log('Received page data:', pageData); // デバッグ用
    const pageFilePath = path.join(__dirname, 'src/pages', `${pageData.pageName}.json`);

    // ファイルを保存
    fs.writeFile(pageFilePath, JSON.stringify(pageData, null, 2), 'utf8', (err) => {
      if (err) {
        console.error(`Error saving page data:`, err); // エラーメッセージを表示
      } else {
        console.log(`Successfully saved page data to ${pageFilePath}`);
      }
    });
  });

  // APIキー用のストレージファイルパス
  const apiKeyPath = path.join(app.getPath('userData'), 'api_key.json');

  // APIキー取得関数
  const getApiKey = () => {
    // まず環境変数からAPIキーを確認
    if (process.env.ANTHROPIC_API_KEY) {
      console.log('環境変数からAnthropicキーを発見しました');
      return {
        openaiKey: null,
        claudeKey: process.env.ANTHROPIC_API_KEY,
        selectedProvider: 'claude',
        anthropicVersion: process.env.API_VERSION || '2023-06-01',
        anthropicBaseUrl: process.env.API_BASE_URL || 'https://api.anthropic.com/v1',
        success: true
      };
    }

    // 環境変数にキーがなければ設定ファイルから読み込む
    try {
      console.log('設定ファイルからAPIキーを読み込みます');
      const apiConfigPath = isDevelopment
        ? path.join(__dirname, '..', 'config', 'api-keys.js') // 開発環境：src/config/api-keys.js
        : path.join(process.resourcesPath, 'app', 'dist', 'config', 'api-keys.js'); // 本番環境

      console.log(`Anthropic APIキー設定パス: ${apiConfigPath}`);

      // ファイルが存在するか確認
      if (fs.existsSync(apiConfigPath)) {
        // 設定ファイルを読み込む
        const apiConfig = require(apiConfigPath);
        console.log('Anthropic APIキー設定を読み込みました');

        // Anthropicキーが設定されていれば、それを使用
        if (apiConfig.ANTHROPIC_API_KEY) {
          console.log('Anthropic APIキーを発見しました');
          return {
            openaiKey: null,
            claudeKey: apiConfig.ANTHROPIC_API_KEY,
            selectedProvider: 'claude',
            anthropicVersion: apiConfig.API_VERSION || '2023-06-01',
            anthropicBaseUrl: apiConfig.API_BASE_URL || 'https://api.anthropic.com/v1',
            success: true
          };
        } else {
          console.error('Anthropic APIキーが設定されていません');
        }
      } else {
        console.error(`APIキー設定ファイルが見つかりません: ${apiConfigPath}`);
      }
    } catch (error) {
      console.error('Error reading API key:', error);
    }

    console.log('デフォルトのAPI設定を返します');
    return {
      openaiKey: null,
      claudeKey: null,
      selectedProvider: 'claude',
      success: false
    };
  };

  // APIキー保存ハンドラ
  ipcMain.on('save-api-key', (event, { apiKey, claudeKey, selectedProvider }) => {
    try {
      fs.writeFileSync(apiKeyPath, JSON.stringify({
        apiKey, // OpenAI API Key
        claudeKey, // Claude API Key
        selectedProvider // 選択されたプロバイダ
      }), 'utf8');
      event.reply('api-key-saved', true);
    } catch (error) {
      console.error('Error saving API key:', error);
      event.reply('api-key-saved', false);
    }
  });

  // APIキー取得ハンドラ
  ipcMain.handle('get-api-key', async () => {
    return getApiKey();
  });

  // Claude APIキー取得ハンドラ - 統合バージョン
  ipcMain.handle('get-claude-api-key', async (event) => {
    try {
      console.log('Claude APIキーの取得をリクエストされました');

      // 環境変数から直接取得を試みる（最優先）
      if (process.env.ANTHROPIC_API_KEY) {
        console.log('環境変数からAnthropic APIキーを取得しました');
        return { success: true, claudeKey: process.env.ANTHROPIC_API_KEY };
      }

      // 最初にsrc/config/api-keys.jsから取得を試みる
      try {
        const apiConfigPath = isDevelopment
          ? path.join(__dirname, '..', 'config', 'api-keys.js') // 開発環境：src/config/api-keys.js
          : path.join(process.resourcesPath, 'app', 'dist', 'config', 'api-keys.js'); // 本番環境：リソースディレクトリ内のビルド済みファイル
        console.log(`Anthropic APIキー設定パス: ${apiConfigPath}`);

        if (fs.existsSync(apiConfigPath)) {
          // 設定ファイルを読み込む
          const apiConfig = require(apiConfigPath);
          console.log('Anthropic APIキー設定を読み込みました');

          // Anthropicキーが設定されていれば、それを使用
          if (apiConfig.ANTHROPIC_API_KEY) {
            console.log(`Claude APIキーの取得に成功: ${apiConfig.ANTHROPIC_API_KEY.substring(0, 10)}...`);
            return { success: true, claudeKey: apiConfig.ANTHROPIC_API_KEY };
          }
        }
      } catch (configError) {
        console.error('Anthropic API設定の読み込みに失敗:', configError);
      }

      // 従来のパスから取得を試みる（フォールバック）
      const secretApiKeyPath = path.join(__dirname, '..', 'secret', 'api-keys.json');
      console.log(`従来のAPIキーファイルパス: ${secretApiKeyPath}`);
      console.log(`ファイルの存在確認: ${fs.existsSync(secretApiKeyPath)}`);

      if (fs.existsSync(secretApiKeyPath)) {
        const fileContent = fs.readFileSync(secretApiKeyPath, 'utf8');
        console.log(`APIキーファイルの読み込み成功。内容の長さ: ${fileContent.length}文字`);

        const apiData = JSON.parse(fileContent);
        console.log(`APIデータ解析成功: ${apiData.claudeKey ? 'キーあり' : 'キーなし'}`);

        if (!apiData.claudeKey) {
          console.error('Claude APIキーがファイル内に見つかりません');
          return { success: false, error: 'API key is empty or invalid' };
        }

        console.log(`Claude APIキーの取得に成功: ${apiData.claudeKey.substring(0, 10)}...`);
        return { success: true, claudeKey: apiData.claudeKey };
      } else {
        console.log(`Claude API キーファイルが存在しません: ${secretApiKeyPath}`);
        return { success: false, error: 'API key file not found' };
      }
    } catch (error) {
      console.error('Error reading Claude API key:', error);
      return { success: false, error: error.message };
    }
  });

  // AIコード生成ハンドラ
  ipcMain.handle('generate-code', async (event, params) => {
    try {
      console.log('AIコード生成リクエストを受信しました');

      // JavaScript環境でコード生成を実行します
      console.log('JavaScript環境でコード生成を実行します');

      // デフォルトプロバイダはclaudeに固定
      const selectedProvider = 'claude';
      let apiKey;

      // 環境変数から直接APIキーを取得（最優先）
      // 環境変数から直接APIキーを取得（最優先）
      if (process.env.ANTHROPIC_API_KEY) {
        console.log('環境変数からAnthropic APIキーを取得しました');
        apiKey = process.env.ANTHROPIC_API_KEY;
      } else {
        // APIキーを設定ファイルから取得
        try {
          console.log('src/config/api-keys.jsからAPIキーを読み込みます');
          const apiConfigPath = isDevelopment
            ? path.join(__dirname, '..', 'config', 'api-keys.js') // 開発環境：src/config/api-keys.js
            : path.join(process.resourcesPath, 'app', 'dist', 'config', 'api-keys.js'); // 本番環境
          console.log(`設定ファイルパス: ${apiConfigPath}`);

          if (fs.existsSync(apiConfigPath)) {
            // JavaScriptモジュールとして読み込む
            const apiConfig = require(apiConfigPath);
            console.log(`APIキー設定を読み込みました`);
            // Anthropicキーを使用
            apiKey = apiConfig.ANTHROPIC_API_KEY;
            console.log(`Claude APIキーを取得: ${apiKey ? '成功' : '失敗'}`);
          } else {
            console.error(`APIキーファイルが見つかりません: ${apiConfigPath}`);
          }
        } catch (keyError) {
          console.error('APIキー読み込みエラー:', keyError);
        }
      }

      console.log(`選択されたAIプロバイダ: ${selectedProvider}, APIキー存在: ${apiKey ? 'はい' : 'いいえ'}`);

      if (!apiKey) {
        throw new Error(`APIキーが設定されていません`);
      }

      const { prompt, uploadedImage } = params;

      if (!prompt) {
        throw new Error('プロンプトが指定されていません');
      }

      // 画像情報のログ
      if (uploadedImage) {
        console.log(`画像情報: ${uploadedImage.name || 'unknown'} (${uploadedImage.data ? uploadedImage.data.length + ' bytes' : 'no data'})`);
      } else {
        console.log('画像なし - テキストのみのリクエスト');
      }

      // APIリクエスト
      let response;

      if (selectedProvider === 'openai') {
        // OpenAI APIリクエスト
        console.log('OpenAI APIにリクエスト送信...');

        const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];

        // 画像がある場合
        if (uploadedImage && uploadedImage.data) {
          messages[0].content.push({
            type: 'image_url',
            image_url: {
              url: uploadedImage.data,
              detail: 'high'
            }
          });
        }

        const requestData = {
          model: 'gpt-4o',
          messages,
          max_tokens: 4096,
          temperature: 0.7
        };

        response = await axios.post('https://api.openai.com/v1/chat/completions', requestData, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        });

        console.log(`OpenAI APIレスポンス: HTTP ${response.status}`);

        return {
          generatedCode: response.data.choices[0].message.content,
          provider: 'openai'
        };
      } else {
        // Claude APIリクエスト
        console.log('Claude APIにリクエスト送信...');

        let messageContent;

        // 画像がある場合
        if (uploadedImage && uploadedImage.data) {
          messageContent = [
            { type: 'text', text: prompt },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: uploadedImage.mimeType || 'image/jpeg',
                data: uploadedImage.data.split(',')[1] // Base64データ部分のみ抽出
              }
            }
          ];
        } else {
          messageContent = prompt;
        }

        const requestData = {
          model: 'claude-3-5-haiku-20241022',
          messages: [{
            role: 'user',
            content: messageContent
          }],
          max_tokens: 4096,
          temperature: 0.7
        };

        response = await axios.post('https://api.anthropic.com/v1/messages', requestData, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 120000 // タイムアウトを120秒に設定
        });

        console.log(`Claude APIレスポンス: HTTP ${response.status}`);

        return {
          generatedCode: response.data.content[0].text,
          provider: 'claude'
        };
      }
    } catch (error) {
      console.error('AIコード生成エラー:', error);
      throw new Error(`コード生成中にエラーが発生しました: ${error.message}`);
    }
  });

  // AI生成コードの保存用共通関数
  const saveAIGeneratedCode = async ({ scssCode, htmlCode, blockName, targetHtmlFile, project }) => {
    try {
      console.log('AI生成コードの保存処理を開始します:', {
        blockName,
        targetHtmlFile,
        hasScssCode: !!scssCode,
        hasHtmlCode: !!htmlCode,
        scssCodeLength: scssCode ? scssCode.length : 0,
        htmlCodeLength: htmlCode ? htmlCode.length : 0
      });

      // パラメータのバリデーション
      if (!scssCode || scssCode.trim() === '') {
        console.error('SCSSコードが空です');
        return { success: false, error: 'SCSSコードが空です' };
      }

      if (!blockName || blockName.trim() === '') {
        console.error('ブロック名が指定されていません');
        return { success: false, error: 'ブロック名が指定されていません' };
      }

      if (targetHtmlFile && (!htmlCode || htmlCode.trim() === '')) {
        console.error('HTML対象ファイルが指定されていますが、HTMLコードが空です');
        return { success: false, error: 'HTMLファイルが選択されていますが、HTMLコードが空です' };
      }

      console.log('アクティブプロジェクトパス:', project.path);

      // ディレクトリの存在確認・作成
      const scssDir = path.join(project.path, 'src/scss/object/AI_Component');
      const htmlPartsDir = path.join(project.path, 'src/partsHTML');

      console.log(`SCSSディレクトリ: ${scssDir}`);
      console.log(`HTMLパーツディレクトリ: ${htmlPartsDir}`);

      if (!fs.existsSync(scssDir)) {
        fs.mkdirSync(scssDir, { recursive: true });
        console.log(`SCSSディレクトリを作成しました: ${scssDir}`);
      }

      if (!fs.existsSync(htmlPartsDir)) {
        fs.mkdirSync(htmlPartsDir, { recursive: true });
        console.log(`HTMLパーツディレクトリを作成しました: ${htmlPartsDir}`);
      }

      // SCSSファイルパスの作成
      let scssFileName = `_${blockName}.scss`;
      let scssFilePath = path.join(scssDir, scssFileName);
      console.log(`SCSSファイルパス: ${scssFilePath}`);

      // HTMLパーツファイルパスの作成
      let htmlFileName = `${blockName}.html`;
      let htmlPartsFilePath = path.join(htmlPartsDir, htmlFileName);
      console.log(`HTMLパーツファイルパス: ${htmlPartsFilePath}`);

      // ファイル名の衝突チェック
      const fileExists = {
        scss: fs.existsSync(scssFilePath),
        html: htmlCode && fs.existsSync(htmlPartsFilePath)
      };
      console.log('ファイル存在チェック結果:', fileExists);

      // 既存ファイルがある場合は何を保存できるか確認
      const scssNeedsRename = fileExists.scss;
      const htmlNeedsRename = htmlCode && fileExists.html;
      const anyRenameNeeded = scssNeedsRename || htmlNeedsRename;

      // 保存結果のステータス
      const result = {
        success: false,
        savedFiles: {
          scss: null,
          html: null
        }
      };

      // 両方のファイルでリネームが必要な場合
      if (scssNeedsRename && htmlNeedsRename) {
        console.log('SCSSファイルとHTMLファイルが両方存在します:', { scssFileName, htmlFileName });
        return {
          success: false,
          error: `ファイルが既に存在します: ${scssFileName} ${htmlFileName}`,
          needsRename: true,
          fileExists
        };
      }

      // SCSSファイルを保存（衝突がなければ）
      if (!scssNeedsRename && scssCode && scssCode.trim() !== '') {
        try {
          console.log(`SCSSファイル保存開始: ${scssFilePath}`);
          const scssContent = `@use "../../globals" as *;\n\n${scssCode}`;
          await fs.promises.writeFile(scssFilePath, scssContent, 'utf8');
          console.log(`SCSSファイルを保存しました: ${scssFilePath}`);
          result.savedFiles.scss = scssFileName;
          result.success = true;
        } catch (err) {
          console.error(`SCSSファイルの保存に失敗しました: ${err.message}`);
          return {
            success: false,
            error: `SCSSファイルの保存に失敗しました: ${err.message}`
          };
        }
      } else {
        console.log(`SCSSファイルの保存をスキップします: ${scssNeedsRename ? '衝突あり' : 'コードなし'}`);
        if (scssNeedsRename) {
          return {
            success: false,
            error: `SCSSファイルが既に存在します: ${scssFileName}`,
            needsRename: true,
            fileExists
          };
        }
      }

      // HTMLパーツファイルを保存（HTMLコードがあり、衝突がなければ）
      if (htmlCode && htmlCode.trim() !== '' && !htmlNeedsRename) {
        try {
          console.log(`HTMLパーツファイル保存開始: ${htmlPartsFilePath}`);
          console.log(`HTMLコードの長さ: ${htmlCode.length}文字`);
          console.log(`HTMLコードの先頭100文字: ${htmlCode.substring(0, 100)}...`);

          await fs.promises.writeFile(htmlPartsFilePath, htmlCode, 'utf8');
          console.log(`HTMLパーツファイルを保存しました: ${htmlPartsFilePath}`);
          result.savedFiles.html = htmlFileName;
          result.success = true;
        } catch (err) {
          console.error(`HTMLファイルの保存に失敗しました: ${err.message}`);
          return { success: false, error: `HTMLファイルの保存に失敗しました: ${err.message}` };
        }
      } else {
        console.log(`HTMLファイルの保存をスキップします:`, {
          hasHtmlCode: !!htmlCode,
          isHtmlEmpty: htmlCode ? htmlCode.trim() === '' : true,
          needsRename: htmlNeedsRename
        });
        if (htmlNeedsRename) {
          return {
            success: false,
            error: `HTMLファイルが既に存在します: ${htmlFileName}`,
            needsRename: true,
            fileExists
          };
        }
      }

      // 対象のHTMLファイルにインクルード文を追加
      if (targetHtmlFile) {
        // アクティブプロジェクトのpagesディレクトリ内のHTMLファイルを参照
        const targetFilePath = path.join(project.path, 'src/pages', targetHtmlFile);

        console.log(`対象HTMLファイルパス (アクティブプロジェクト内): ${targetFilePath}`);

        if (fs.existsSync(targetFilePath)) {
          console.log(`対象HTMLファイルが存在します: ${targetFilePath}`);
          let targetHtmlContent = await fs.promises.readFile(targetFilePath, 'utf8');

          // </main>タグの直前にインクルード文を追加
          const mainCloseTag = '</main>';
          const includeStatement = `  {{> ${blockName} }}\n  `;

          if (targetHtmlContent.includes(mainCloseTag)) {
            // 既に同じインクルード文があるか確認
            if (!targetHtmlContent.includes(`{{> ${blockName} }}`)) {
              targetHtmlContent = targetHtmlContent.replace(mainCloseTag, `${includeStatement}${mainCloseTag}`);
              await fs.promises.writeFile(targetFilePath, targetHtmlContent, 'utf8');
              console.log(`対象HTMLファイルにインクルード文を追加しました: ${targetFilePath}`);

              // HTMLインクルード成功を結果に追加
              result.includedInHtml = targetHtmlFile;
            } else {
              console.log(`インクルード文は既に存在しています: ${targetFilePath}`);
            }
          } else {
            console.log(`対象HTMLファイルに</main>タグが見つかりません: ${targetFilePath}`);
            return {
              success: false,
              error: 'ターゲットHTMLファイルに</main>タグが見つかりません',
              savedFiles: result.savedFiles
            };
          }
        } else {
          console.log(`対象HTMLファイルが存在しません: ${targetFilePath}`);

          // pagesディレクトリが存在しなければ作成（アクティブプロジェクト内）
          const pagesDir = path.join(project.path, 'src/pages');
          if (!fs.existsSync(pagesDir)) {
            await fs.promises.mkdir(pagesDir, { recursive: true });
            console.log(`pagesディレクトリを作成しました: ${pagesDir}`);
          }

          return {
            success: false,
            error: 'ターゲットHTMLファイルが存在しません',
            savedFiles: result.savedFiles
          };
        }
      }

      // 一部のファイルでリネームが必要な場合
      if (anyRenameNeeded) {
        return {
          success: result.success,
          partialSuccess: true,
          needsRename: true,
          fileExists,
          savedFiles: result.savedFiles,
          error: `一部のファイルが既に存在します: ${scssNeedsRename ? scssFileName : ''} ${htmlNeedsRename ? htmlFileName : ''}`
        };
      }

      return {
        success: true,
        savedFiles: result.savedFiles
      };
    } catch (error) {
      console.error('AI生成コードの保存中にエラーが発生しました:', error);
      return { success: false, error: error.message };
    }
  };

  // AI生成コードの保存機能
  ipcMain.handle('save-ai-generated-code', async (event, params) => {
    console.log('save-ai-generated-code ハンドラーが呼び出されました', {
      blockName: params.blockName,
      hasHtmlCode: !!params.htmlCode,
      htmlCodeLength: params.htmlCode ? params.htmlCode.length : 0,
      hasScssCode: !!params.scssCode,
      scssCodeLength: params.scssCode ? params.scssCode.length : 0,
      targetHtmlFile: params.targetHtmlFile
    });

    // HTMLパラメータが無効な場合のチェック
    if (params.targetHtmlFile && (!params.htmlCode || params.htmlCode.trim() === '')) {
      console.log('ターゲットHTMLファイルが指定されていますが、HTMLコードがありません');
    }

    // HTMLコードがあってもターゲットHTMLファイルが無効な場合のチェック
    if (params.htmlCode && params.htmlCode.trim() !== '' && !params.targetHtmlFile) {
      console.log('HTMLコードがありますが、ターゲットHTMLファイルが指定されていません');
    }

    // アクティブプロジェクトの取得
    const activeProjectId = await loadActiveProjectId();
    if (!activeProjectId) {
      console.error('アクティブなプロジェクトが見つかりません');
      return { success: false, error: 'アクティブなプロジェクトが見つかりません' };
    }

    // プロジェクト情報の取得
    const project = await loadProjectSettings(activeProjectId);
    if (!project || !project.path) {
      console.error('プロジェクト情報の取得に失敗しました');
      return { success: false, error: 'プロジェクト情報の取得に失敗しました' };
    }

    console.log(`アクティブプロジェクト: ${project.name}, パス: ${project.path}`);

    // AIコード保存フラグをオン
    isAICodeSaving = true;

    // 処理開始のタイムスタンプを記録
    const startTime = Date.now();

    try {
      // 保存処理を実行（プロジェクト情報を渡す）
      params.project = project;
      const result = await saveAIGeneratedCode(params);

      // 処理完了のタイムスタンプと処理時間を計算
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      console.log(`save-ai-generated-code 処理完了: ${processingTime}ms`, {
        success: result.success,
        partialSuccess: result.partialSuccess,
        savedFiles: result.savedFiles,
        needsRename: result.needsRename
      });

      // 少し遅延してフラグをオフにする（ファイル変更検出の後にフラグをリセットするため）
      setTimeout(() => {
        isAICodeSaving = false;
        console.log('AIコード保存フラグをリセットしました');
      }, 1000);

      return result;
    } catch (error) {
      console.error('AI生成コード保存中にエラーが発生:', error);
      isAICodeSaving = false;
      throw error;
    }
  });

  // 既に存在するブロック名のリネーム処理
  ipcMain.handle('rename-and-save-ai-code', async (event, { scssCode, htmlCode, originalBlockName, newScssBlockName, newHtmlBlockName, targetHtmlFile }) => {
    try {
      console.log('rename-and-save-ai-code ハンドラーが呼び出されました:', {
        originalBlockName,
        newScssBlockName,
        newHtmlBlockName,
        targetHtmlFile
      });

      // アクティブプロジェクトの取得
      const activeProjectId = await loadActiveProjectId();
      if (!activeProjectId) {
        console.error('アクティブなプロジェクトが見つかりません');
        return { success: false, error: 'アクティブなプロジェクトが見つかりません' };
      }

      // プロジェクト情報の取得
      const project = await loadProjectSettings(activeProjectId);
      if (!project || !project.path) {
        console.error('プロジェクト情報の取得に失敗しました');
        return { success: false, error: 'プロジェクト情報の取得に失敗しました' };
      }

      console.log(`アクティブプロジェクト: ${project.name}, パス: ${project.path}`);

      // SCSSとHTMLで異なるブロック名を処理
      const scssDir = path.join(project.path, 'src/scss/object/AI_Component');
      const htmlPartsDir = path.join(project.path, 'src/partsHTML');

      console.log(`SCSSディレクトリ: ${scssDir}`);
      console.log(`HTMLパーツディレクトリ: ${htmlPartsDir}`);

      if (!fs.existsSync(scssDir)) {
        fs.mkdirSync(scssDir, { recursive: true });
        console.log(`SCSSディレクトリを作成しました: ${scssDir}`);
      }

      if (!fs.existsSync(htmlPartsDir)) {
        fs.mkdirSync(htmlPartsDir, { recursive: true });
        console.log(`HTMLパーツディレクトリを作成しました: ${htmlPartsDir}`);
      }

      // 保存結果のステータス
      const result = {
        success: false,
        savedFiles: {
          scss: null,
          html: null
        }
      };

      // SCSSファイルの保存
      if (scssCode) {
        const scssFileName = `_${newScssBlockName}.scss`;
        const scssFilePath = path.join(scssDir, scssFileName);

        try {
          const scssContent = `@use "../../globals" as *;\n\n${scssCode}`;
          await fs.promises.writeFile(scssFilePath, scssContent, 'utf8');
          console.log(`SCSSファイルを保存しました: ${scssFilePath}`);
          result.savedFiles.scss = scssFileName;
          result.success = true;
        } catch (err) {
          console.error(`SCSSファイルの保存に失敗しました: ${err.message}`);
          return { success: false, error: `SCSSファイルの保存に失敗しました: ${err.message}` };
        }
      }

      // HTMLファイルの保存
      if (htmlCode) {
        const htmlFileName = `${newHtmlBlockName}.html`;
        const htmlFilePath = path.join(htmlPartsDir, htmlFileName);

        try {
          await fs.promises.writeFile(htmlFilePath, htmlCode, 'utf8');
          console.log(`HTMLパーツファイルを保存しました: ${htmlFilePath}`);
          result.savedFiles.html = htmlFileName;
          result.success = true;

          // 対象のHTMLファイルにインクルード文を追加
          if (targetHtmlFile) {
            // アクティブプロジェクトのpagesディレクトリ内のHTMLファイルを参照
            const targetFilePath = path.join(project.path, 'src/pages', targetHtmlFile);

            console.log(`対象HTMLファイルパス (アクティブプロジェクト内): ${targetFilePath}`);

            if (fs.existsSync(targetFilePath)) {
              console.log(`対象HTMLファイルが存在します: ${targetFilePath}`);
              let targetHtmlContent = await fs.promises.readFile(targetFilePath, 'utf8');

              // </main>タグの直前にインクルード文を追加
              const mainCloseTag = '</main>';
              const includeStatement = `  {{> ${newHtmlBlockName} }}\n  `;

              if (targetHtmlContent.includes(mainCloseTag)) {
                // 既に同じインクルード文があるか確認
                if (!targetHtmlContent.includes(`{{> ${newHtmlBlockName} }}`)) {
                  targetHtmlContent = targetHtmlContent.replace(mainCloseTag, `${includeStatement}${mainCloseTag}`);
                  await fs.promises.writeFile(targetFilePath, targetHtmlContent, 'utf8');
                  console.log(`対象HTMLファイルにインクルード文を追加しました: ${targetFilePath}`);
                } else {
                  console.log(`インクルード文は既に存在しています: ${targetFilePath}`);
                }
              } else {
                console.log(`対象HTMLファイルに</main>タグが見つかりません: ${targetFilePath}`);
                return {
                  success: false,
                  error: 'ターゲットHTMLファイルに</main>タグが見つかりません',
                  savedFiles: result.savedFiles
                };
              }
            } else {
              console.log(`対象HTMLファイルが存在しません: ${targetFilePath}`);

              // pagesディレクトリが存在しなければ作成（アクティブプロジェクト内）
              const pagesDir = path.join(project.path, 'src/pages');
              if (!fs.existsSync(pagesDir)) {
                await fs.promises.mkdir(pagesDir, { recursive: true });
                console.log(`pagesディレクトリを作成しました: ${pagesDir}`);
              }

              return {
                success: false,
                error: 'ターゲットHTMLファイルが存在しません',
                savedFiles: result.savedFiles
              };
            }
          }
        } catch (err) {
          console.error(`HTMLファイルの保存に失敗しました: ${err.message}`);
          if (result.savedFiles.scss) {
            return {
              success: false,
              partialSuccess: true,
              error: `HTMLファイルの保存に失敗しましたが、SCSSファイルは保存されました: ${err.message}`,
              savedFiles: result.savedFiles
            };
          } else {
            return { success: false, error: `HTMLファイルの保存に失敗しました: ${err.message}` };
          }
        }
      }

      return {
        success: true,
        savedFiles: result.savedFiles
      };
    } catch (error) {
      console.error('リネームして保存中にエラーが発生しました:', error);
      return { success: false, error: error.message };
    }
  });
  // プロジェクト設定の読み込み
  async function loadProjectSettings(projectId) {
    try {
      if (!projectId) {
        console.error('プロジェクトIDが指定されていません');
        return null;
      }

      const projectDir = path.join(app.getPath('userData'), 'projects');
      const projectFilePath = path.join(projectDir, `${projectId}.json`);

      if (!fs.existsSync(projectFilePath)) {
        console.error(`プロジェクト設定ファイルが見つかりません: ${projectFilePath}`);
        return null;
      }

      const data = await fs.promises.readFile(projectFilePath, 'utf8');
      const projectSettings = JSON.parse(data);

      // 必要なプロパティが不足している場合は追加
      if (!projectSettings.created) {
        projectSettings.created = new Date().toISOString();
      }
      if (!projectSettings.lastModified) {
        projectSettings.lastModified = new Date().toISOString();
      }
      if (!projectSettings.lastAccessed) {
        projectSettings.lastAccessed = new Date().toISOString();
      }
      if (!projectSettings.version) {
        projectSettings.version = '0.1.0';
      }
      if (!projectSettings.versionHistory) {
        projectSettings.versionHistory = [{
          version: '0.1.0',
          date: projectSettings.created,
          description: '初期バージョン'
        }];
      }
      if (projectSettings.isArchived === undefined) {
        projectSettings.isArchived = false;
      }

      return projectSettings;
    } catch (error) {
      console.error('プロジェクト設定の読み込みに失敗:', error);
      return null;
    }
  }

  // プロジェクト設定の保存
  async function saveProjectSettings(project) {
    try {
      if (!project || !project.id) {
        console.error('有効なプロジェクトオブジェクトが指定されていません');
        return false;
      }

      const projectDir = path.join(app.getPath('userData'), 'projects');
      await fs.promises.mkdir(projectDir, { recursive: true });

      const projectFilePath = path.join(projectDir, `${project.id}.json`);

      // ファイル操作関連の更新フラグがあれば最終更新日時を設定
      // このフラグは、ファイル追加・編集操作時に設定される
      if (project.fileUpdated) {
        project.lastModified = new Date().toISOString();
        // 一度使用したら削除
        delete project.fileUpdated;
      }

      await fs.promises.writeFile(projectFilePath, JSON.stringify(project, null, 2));
      console.log(`プロジェクト設定を保存しました: ${projectFilePath}`);
      return true;
    } catch (error) {
      console.error('プロジェクト設定の保存に失敗:', error);
      return false;
    }
  }

  // プロジェクト設定の削除
  async function deleteProjectSettings(projectId) {
    try {
      const projectDir = path.join(app.getPath('userData'), 'projects');
      const projectFilePath = path.join(projectDir, `${projectId}.json`);

      if (fs.existsSync(projectFilePath)) {
        await fs.promises.unlink(projectFilePath);
        console.log(`プロジェクト設定を削除しました: ${projectFilePath}`);

        // プロジェクト一覧からも削除
        if (fs.existsSync(PROJECTS_CONFIG_PATH)) {
          const configData = await fs.promises.readFile(PROJECTS_CONFIG_PATH, 'utf8');
          const config = JSON.parse(configData);

          if (config.projects && Array.isArray(config.projects)) {
            // 該当プロジェクトを除外
            const updatedProjects = config.projects.filter(p => p.id !== projectId);

            if (updatedProjects.length !== config.projects.length) {
              config.projects = updatedProjects;
              await fs.promises.writeFile(PROJECTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
              console.log(`プロジェクト一覧からプロジェクトを削除しました: ${projectId}`);
            } else {
              console.log(`プロジェクト一覧に該当IDのプロジェクトが見つかりませんでした: ${projectId}`);
            }
          }
        }

        return true;
      } else {
        console.log(`プロジェクト設定ファイルが見つかりません: ${projectFilePath}`);
        return false;
      }
    } catch (error) {
      console.error('プロジェクト設定の削除に失敗:', error);
      return false;
    }
  }

  // プロジェクト一覧の読み込み
  async function loadProjectsConfig() {
    try {
      if (!fs.existsSync(PROJECTS_CONFIG_PATH)) {
        return { projects: [] };
      }

      const data = await fs.promises.readFile(PROJECTS_CONFIG_PATH, 'utf8');
      const config = JSON.parse(data);

      // 各プロジェクトに不足しているプロパティを追加
      if (config.projects && Array.isArray(config.projects)) {
        config.projects = config.projects.map(project => {
          if (!project.created) {
            project.created = new Date().toISOString();
          }
          if (!project.lastModified) {
            project.lastModified = new Date().toISOString();
          }
          if (!project.lastAccessed) {
            project.lastAccessed = new Date().toISOString();
          }
          if (!project.version) {
            project.version = '0.1.0';
          }
          if (!project.versionHistory) {
            project.versionHistory = [{
              version: '0.1.0',
              date: project.created,
              description: '初期バージョン'
            }];
          }
          if (project.isArchived === undefined) {
            project.isArchived = false;
          }
          return project;
        });
      }

      return config;
    } catch (error) {
      console.error('プロジェクト一覧の読み込みに失敗:', error);
      return { projects: [] };
    }
  }

  // プロジェクト設定ファイルとprojects.jsonの同期をとる
  async function synchronizeProjectsConfig() {
    try {
      console.log('プロジェクト設定ファイルとprojects.jsonの同期を開始します');

      // まず個別プロジェクトファイルを読み込む
      const projectDir = path.join(app.getPath('userData'), 'projects');
      const projectsFromFiles = [];

      if (fs.existsSync(projectDir)) {
        // ディレクトリ内のすべてのJSONファイルを読み込む
        const files = await fs.promises.readdir(projectDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        console.log(`プロジェクトディレクトリからファイルを読み込みます。ファイル数: ${jsonFiles.length}`);

        for (const file of jsonFiles) {
          try {
            const filePath = path.join(projectDir, file);
            const data = await fs.promises.readFile(filePath, 'utf8');
            const project = JSON.parse(data);

            // 必要なプロパティが存在するかチェック
            if (project && project.id) {
              projectsFromFiles.push(project);
            }
          } catch (err) {
            console.error(`プロジェクトファイルの読み込みエラー (${file}):`, err);
          }
        }
      } else {
        console.log('プロジェクトディレクトリが存在しません。作成します。');
        await fs.promises.mkdir(projectDir, { recursive: true });
      }

      // projects.jsonも読み込む
      let projectsConfig = { projects: [] };
      try {
        if (fs.existsSync(PROJECTS_CONFIG_PATH)) {
          const data = await fs.promises.readFile(PROJECTS_CONFIG_PATH, 'utf8');
          projectsConfig = JSON.parse(data);
        }
      } catch (err) {
        console.error('projects.jsonの読み込みエラー:', err);
      }

      // プロジェクトファイルのIDを取得
      const projectFileIds = projectsFromFiles.map(p => p.id);
      console.log(`プロジェクトディレクトリから読み込んだプロジェクト数: ${projectFileIds.length}`);

      // projects.jsonの中にあるプロジェクトIDを取得
      const projectsConfigIds = projectsConfig.projects ? projectsConfig.projects.map(p => p.id) : [];
      console.log(`projects.jsonに登録されているプロジェクト数: ${projectsConfigIds.length}`);

      // マージするためのマップを作成
      const mergedProjects = {};

      // まずprojects.jsonのプロジェクトを追加
      if (projectsConfig.projects) {
        projectsConfig.projects.forEach(project => {
          if (project && project.id) {
            mergedProjects[project.id] = project;
          }
        });
      }

      // プロジェクトファイルからの情報で上書き（より新しい情報として優先）
      projectsFromFiles.forEach(project => {
        mergedProjects[project.id] = project;
      });

      // マージされたプロジェクトを配列に変換
      const finalProjects = Object.values(mergedProjects);
      console.log(`同期後の合計プロジェクト数: ${finalProjects.length}`);

      // projects.jsonファイルを更新
      await fs.promises.writeFile(PROJECTS_CONFIG_PATH, JSON.stringify({ projects: finalProjects }, null, 2), 'utf8');
      console.log('projects.jsonファイルを更新しました');

      return { projects: finalProjects };
    } catch (error) {
      console.error('プロジェクト設定の同期に失敗:', error);
      // エラーが発生した場合でも、できる限り最新情報を返す
      const config = await loadProjectsConfig();
      return config;
    }
  }

  // プロジェクト管理関連のIPCハンドラー
  ipcMain.handle('load-projects-config', async () => {
    // 同期処理を実行してから結果を返す
    return await synchronizeProjectsConfig();
  });

  ipcMain.handle('save-project-settings', async (event, project) => {
    try {
      return await saveProjectSettings(project);
    } catch (error) {
      console.error('プロジェクト設定の保存中にエラーが発生:', error);
      return false;
    }
  });

  ipcMain.handle('load-project-settings', async (event, projectId) => {
    return await loadProjectSettings(projectId);
  });

  ipcMain.handle('delete-project-settings', async (event, projectId) => {
    return await deleteProjectSettings(projectId);
  });

  ipcMain.handle('open-project-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'プロジェクトフォルダを選択'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const projectPath = result.filePaths[0];
      const projectName = path.basename(projectPath);
      return { name: projectName, path: projectPath };
    }
    return null;
  });

  // タブ切り替えのハンドラを追加
  ipcMain.on('switch-tab', (event, tabId) => {
    console.log('メインプロセスでタブ切り替えを受信:', tabId);
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('レンダラープロセスにタブ切り替えを通知');
        mainWindow.webContents.send('tab-switched', tabId);
      } else {
        console.warn('メインウィンドウが存在しないか破棄されています');
      }
    } catch (error) {
      console.error('タブ切り替えの通知中にエラーが発生:', error);
    }
  });

  // デフォルト設定の読み込み
  ipcMain.handle('loadDefaultSettings', async () => {
    return loadDefaultSettings();
  });

  // デフォルト設定の保存
  ipcMain.handle('saveDefaultSettings', async (event, settings) => {
    return saveDefaultSettings(settings);
  });

  // プロジェクトファイルの監視
  ipcMain.handle('watchProjectFiles', async (event, projectId) => {
    return watchProjectFiles(projectId, (changedPath, event) => {
      mainWindow.webContents.send('project-files-changed', {
        path: changedPath,
        event: event
      });
    });
  });

  // プロジェクトファイルの監視解除
  ipcMain.handle('unwatchProjectFiles', async (event, projectId) => {
    return unwatchProjectFiles(projectId);
  });

  // アクティブプロジェクトIDの保存
  ipcMain.handle('save-active-project-id', async (event, projectId) => {
    return await saveActiveProjectId(projectId);
  });

  // アクティブプロジェクトIDの読み込み
  ipcMain.handle('load-active-project-id', async () => {
    return await loadActiveProjectId();
  });

  // カテゴリーとタグの管理
  ipcMain.handle('loadCategories', async () => {
    return await loadCategories();
  });

  ipcMain.handle('saveCategories', async (event, categories) => {
    return await saveCategories(categories);
  });

  ipcMain.handle('loadTags', async () => {
    return await loadTags();
  });

  ipcMain.handle('saveTags', async (event, tags) => {
    return await saveTags(tags);
  });

  // 選択中のカテゴリを保存
  ipcMain.handle('saveSelectedCategory', async (event, category) => {
    return await saveSelectedCategory(category);
  });

  // 選択中のカテゴリを読み込み
  ipcMain.handle('loadSelectedCategory', async () => {
    return await loadSelectedCategory();
  });

  // 選択中のタグを保存
  ipcMain.handle('saveSelectedTags', async (event, tags) => {
    return await saveSelectedTags(tags);
  });

  // 選択中のタグを読み込み
  ipcMain.handle('loadSelectedTags', async () => {
    return await loadSelectedTags();
  });

  // プロジェクトファイル監視ハンドラー
  ipcMain.handle('watch-project-files', async (event, { projectId, projectPath, patterns }) => {
    try {
      console.log(`プロジェクトファイル監視リクエスト: ${projectId} - ${projectPath}`);

      // 入力値の検証
      if (!projectId || typeof projectId !== 'string') {
        throw new Error('無効なプロジェクトID');
      }

      if (!projectPath || typeof projectPath !== 'string') {
        throw new Error('無効なプロジェクトパス');
      }

      // パターンが正しく配列であることを確認
      const watchPatterns = Array.isArray(patterns) ? patterns : ['**/*.html', '**/*.css', '**/*.scss', '**/*.js', '**/*.json'];

      // watchProjectFiles関数を呼び出してファイル監視を開始
      const result = watchProjectFiles(projectId, projectPath, watchPatterns);
      return { success: result };
    } catch (error) {
      console.error('ファイル監視の開始に失敗:', error);
      return { success: false, error: error.message || '不明なエラー' };
    }
  });

  // プロジェクトファイル監視停止ハンドラー
  ipcMain.handle('unwatch-project-files', async (event, projectId) => {
    try {
      console.log(`プロジェクトファイル監視停止リクエスト: ${projectId}`);
      const result = unwatchProjectFiles(projectId);
      return { success: result };
    } catch (error) {
      console.error('プロジェクトファイル監視停止エラー:', error);
      return { success: false, error: error.message };
    }
  });

  // プロジェクトデータの保存/読み込みハンドラー
  ipcMain.handle('save-project-data', async (event, { projectId, section, data }) => {
    try {
      console.log(`プロジェクトデータ保存リクエスト: ${projectId}/${section}`);
      const result = await saveProjectData(projectId, section, data);
      return { success: result };
    } catch (error) {
      console.error('プロジェクトデータ保存エラー:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-project-data', async (event, { projectId, section }) => {
    try {
      console.log(`プロジェクトデータ読み込みリクエスト: ${projectId}/${section}`);
      const data = await loadProjectData(projectId, section);
      return data;
    } catch (error) {
      console.error('プロジェクトデータ読み込みエラー:', error);
      return null;
    }
  });

  // Python環境状態確認
  ipcMain.handle('check-python-bridge', async () => {
    try {
      console.log('Pythonブリッジの状態を確認します');
      if (!pythonBridge) {
        console.error('Pythonブリッジが初期化されていません');
        return { running: false, error: 'Pythonブリッジが初期化されていません' };
      }

      // 簡単なコマンドを送信して応答を確認
      const pingResult = await pythonBridge.sendCommand('ping', {}, 5000);
      console.log('Pythonブリッジの状態確認結果:', pingResult);
      return { running: true, result: pingResult };
    } catch (error) {
      console.error('Pythonブリッジの状態確認エラー:', error);
      return { running: false, error: error.message || String(error) };
    }
  });

  // Pythonブリッジ起動
  ipcMain.handle('start-python-bridge', async () => {
    try {
      console.log('Pythonブリッジの起動を試みます');
      if (!pythonBridge) {
        console.error('Pythonブリッジオブジェクトが初期化されていません');
        return { success: false, error: 'Pythonブリッジが初期化されていません' };
      }

      await pythonBridge.start();
      console.log('Pythonブリッジが正常に起動しました');
      return { success: true };
    } catch (error) {
      console.error('Pythonブリッジの起動エラー:', error);
      return { success: false, error: error.message || String(error) };
    }
  });

  // Python環境状態確認
  ipcMain.handle('check-python-environment-status', async () => {
    try {
      console.log('Python環境の状態を確認します');
      if (!pythonBridge) {
        console.error('Pythonブリッジが初期化されていません');
        return { installed: false, error: 'Pythonブリッジが初期化されていません' };
      }

      const checkResult = await pythonBridge.checkPythonEnvironment();
      console.log('Python環境の状態確認結果:', checkResult);
      return checkResult;
    } catch (error) {
      console.error('Python環境の状態確認エラー:', error);
      return { installed: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('install-python-packages', async () => {
    try {
      console.log('Python環境のセットアップを開始します...');
      const result = await pythonBridge.setupPythonEnvironment();
      console.log('Python環境セットアップ結果:', result);

      if (result.success) {
        // ブリッジを再起動
        await pythonBridge.restart();
      }

      return result;
    } catch (error) {
      console.error('Pythonパッケージインストールエラー:', error);
      return { success: false, error: error.message || String(error) };
    }
  });

  // 選択されたカテゴリを同期的に読み込むハンドラー
  ipcMain.on('load-selected-category-sync', (event) => {
    console.log('選択されたカテゴリを同期的に読み込みます');
    try {
      const category = loadSelectedCategory();
      console.log('読み込まれたカテゴリ:', category);
      event.returnValue = category;
    } catch (error) {
      console.error('選択されたカテゴリの同期読み込み中にエラーが発生しました:', error);
      event.returnValue = 'all';
    }
  });

  // カテゴリリストを同期的に読み込むハンドラー
  ipcMain.on('load-categories-sync', (event) => {
    console.log('カテゴリリストを同期的に読み込みます');
    try {
      if (fs.existsSync(CATEGORIES_PATH)) {
        const data = fs.readFileSync(CATEGORIES_PATH, 'utf8');
        const categories = JSON.parse(data);
        console.log('読み込まれたカテゴリリスト（同期）:', categories);
        event.returnValue = categories;
      } else {
        console.log('カテゴリファイルが存在しないため、デフォルト値を返します');
        event.returnValue = ['uncategorized', '制作会社', 'コミュニティ', 'エンド'];
      }
    } catch (error) {
      console.error('カテゴリリストの同期読み込み中にエラーが発生しました:', error);
      // デフォルトカテゴリを返す
      event.returnValue = ['uncategorized', '制作会社', 'コミュニティ', 'エンド'];
    }
  });

  // タグリストを同期的に読み込むハンドラー
  ipcMain.on('load-tags-sync', (event) => {
    console.log('タグリストを同期的に読み込みます');
    try {
      if (fs.existsSync(TAGS_PATH)) {
        const data = fs.readFileSync(TAGS_PATH, 'utf8');
        const tags = JSON.parse(data);
        console.log('読み込まれたタグリスト（同期）:', tags);
        event.returnValue = tags;
      } else {
        console.log('タグファイルが存在しないため、空配列を返します');
        event.returnValue = [];
      }
    } catch (error) {
      console.error('タグリストの同期読み込み中にエラーが発生しました:', error);
      event.returnValue = [];
    }
  });

  // 選択されたタグを同期的に読み込むハンドラー
  ipcMain.on('load-selected-tags-sync', (event) => {
    console.log('選択されたタグを同期的に読み込みます');
    try {
      if (fs.existsSync(SELECTED_TAGS_PATH)) {
        const data = fs.readFileSync(SELECTED_TAGS_PATH, 'utf8');
        const selectedTags = JSON.parse(data);
        console.log('読み込まれた選択されたタグ（同期）:', selectedTags);
        event.returnValue = selectedTags;
      } else {
        console.log('選択されたタグファイルが存在しないため、空配列を返します');
        event.returnValue = [];
      }
    } catch (error) {
      console.error('選択されたタグの同期読み込み中にエラーが発生しました:', error);
      event.returnValue = [];
    }
  });

  // プロンプトプレビュー取得（デバッグ用）
  ipcMain.handle('get-prompt-preview', async (event, analysisData) => {
    try {
      console.log('プロンプトプレビュー生成リクエストを受信しました');
      // promptGenerator.jsからプロンプト生成関数をロード
      const promptGenerator = require('./promptGenerator');
      // プロンプト生成
      const prompt = promptGenerator.generatePromptFromCompressedData(analysisData);
      return prompt;
    } catch (error) {
      console.error('プロンプトプレビュー生成エラー:', error);
      return `プロンプト生成エラー: ${error.message}`;
    }
  });

  ipcMain.handle('analyze_all', async (event, data, options = {}) => {
    try {
      console.log('[analyze_all] リクエスト受信');

      // データが直接イメージデータか、オブジェクトかを確認
      let image, type = 'compress', requestOptions = {};

      if (typeof data === 'object' && data !== null) {
        // オブジェクトとして渡された場合
        image = data.image || data.image_data;
        type = data.type || 'compress';
        requestOptions = data.options || {};

        // オプションパラメータが別に渡された場合はマージ
        if (Object.keys(options).length > 0) {
          requestOptions = { ...requestOptions, ...options };
        }
      } else {
        // 直接画像データが渡された場合
        image = data;
        requestOptions = options;
      }

      if (!image) {
        console.error('[analyze_all] 画像データが存在しません');
        return { success: false, error: '画像データが存在しません' };
      }

      console.log('[analyze_all] 解析タイプ:', type);
      console.log('[analyze_all] 画像データ形式:', typeof image);
      if (typeof image === 'string') {
        console.log('[analyze_all] データサイズ:', image.length);
      }

      const requestPayload = {
        image,
        type,
        ...requestOptions
      };

      console.log('[analyze_all] Pythonへ送信するpayload:', {
        type: requestPayload.type,
        image: '(base64省略)',
        options: requestOptions
      });

      // 追加: タイムスタンプ記録
      const startTime = Date.now();
      console.log(`[analyze_all] analyzeAll呼び出し開始: ${new Date(startTime).toISOString()}`);
      
      try {
        console.log(`[analyze_all] pythonBridge.analyzeAllを呼び出します (タイムアウト: 90秒)`);
        const result = await pythonBridge.analyzeAll(requestPayload);
        
        // 追加: 処理時間計算
        const endTime = Date.now();
        const processingTime = (endTime - startTime) / 1000;
        console.log(`[analyze_all] レスポンス受信完了: 処理時間=${processingTime.toFixed(2)}秒`);
        
        // 追加: 結果の詳細ログ
        if (result) {
          console.log('[analyze_all] 受信データ構造:', {
            keys: Object.keys(result),
            hasColors: 'colors' in result,
            hasText: 'text' in result,
            hasTextBlocks: 'textBlocks' in result,
            colorsCount: result.colors ? (Array.isArray(result.colors) ? result.colors.length : '配列でない') : '未定義',
            textLength: result.text ? (typeof result.text === 'string' ? result.text.length : '文字列でない') : '未定義',
            textBlocksCount: result.textBlocks ? (Array.isArray(result.textBlocks) ? result.textBlocks.length : '配列でない') : '未定義'
          });
        } else {
          console.warn('[analyze_all] 解析結果が null/undefined');
        }

        return result;
      } catch (bridgeError) {
        // 追加: エラーの詳細ログ
        const endTime = Date.now();
        const processingTime = (endTime - startTime) / 1000;
        console.error(`[analyze_all] エラー発生: 処理時間=${processingTime.toFixed(2)}秒, エラー=${bridgeError.message}`);
        throw bridgeError; // 元のエラーハンドリングに引き継ぐ
      }
    } catch (error) {
      const isTimeout = error.message?.includes('タイムアウト');

      if (isTimeout) {
        console.error('[analyze_all] タイムアウトエラー:', error.message);
      } else {
        console.error('[analyze_all] エラー:', error.message);
      }

      return {
        success: false,
        error: error.message || String(error),
        context: isTimeout ? 'timeout' : 'runtime_error'
      };
    }
  });

  // 後方互換性のために残す場合はリダイレクト処理に
  ipcMain.handle('analyze-image', async (event, data) => {
    console.log('[analyze-image] ⚠️ 非推奨の API が呼び出されました - analyze_all へリダイレクトします');
    return await ipcMain.handlers['analyze_all'](event, data);
  });

  // AI関連のIPCハンドラーを追加
  ipcMain.handle('send-ai-request', async (event, requestOptions) => {
    try {
      console.log('AI送信: リクエスト受信', {
        promptLength: requestOptions.prompt.length,
        provider: requestOptions.provider,
        hasApiKey: !!requestOptions.apiKey
      });

      // APIキーの確認
      if (!requestOptions.apiKey) {
        // APIキーを取得
        const apiKeyData = getApiKey();
        console.log('AI送信: APIキー取得結果', {
          success: apiKeyData.success,
          provider: apiKeyData.selectedProvider,
          hasClaudeKey: !!apiKeyData.claudeKey
        });

        if (!apiKeyData.success) {
          throw new Error('APIキーが設定されていません');
        }

        // プロバイダに応じたAPIキーを設定
        if (apiKeyData.selectedProvider === 'claude') {
          requestOptions.apiKey = apiKeyData.claudeKey;
          requestOptions.provider = 'claude';
          requestOptions.version = apiKeyData.anthropicVersion;
          requestOptions.baseUrl = apiKeyData.anthropicBaseUrl;
        } else {
          requestOptions.apiKey = apiKeyData.openaiKey;
          requestOptions.provider = 'openai';
        }
      }

      console.log('AI送信: 使用するAPI', {
        provider: requestOptions.provider,
        apiKeyExists: !!requestOptions.apiKey,
        version: requestOptions.version
      });

      // プロバイダに応じたAPIリクエスト
      if (requestOptions.provider === 'claude') {
        // Claude APIリクエスト
        console.log('AI送信: Claude APIにリクエスト送信...');

        // メッセージ形式は単純なテキストにする
        const messageContent = requestOptions.prompt;

        const requestData = {
          model: requestOptions.model || 'claude-3-5-haiku-20241022',
          messages: [{
            role: 'user',
            content: messageContent
          }],
          max_tokens: requestOptions.maxTokens || 4096,
          temperature: requestOptions.temperature || 0.7
        };

        console.log('AI送信: Claudeリクエストデータ', {
          model: requestData.model,
          messagesCount: requestData.messages.length,
          messageLength: requestData.messages[0].content.length,
          maxTokens: requestData.max_tokens,
          temperature: requestData.temperature
        });

        const apiUrl = requestOptions.baseUrl || 'https://api.anthropic.com/v1';
        console.log('AI送信: API URL', apiUrl + '/messages');

        const response = await axios.post(apiUrl + '/messages', requestData, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': requestOptions.apiKey,
            'anthropic-version': requestOptions.version || '2023-06-01'
          },
          timeout: 120000 // タイムアウトを120秒に設定
        });

        console.log('AI送信: Claude APIレスポンス', {
          status: response.status,
          contentLength: response.data.content?.[0]?.text?.length || 0
        });

        return {
          success: true,
          text: response.data.content[0].text,
          provider: 'claude'
        };
      } else {
        // OpenAI APIリクエスト
        console.log('AI送信: OpenAI APIにリクエスト送信...');

        const messages = [{ role: 'user', content: [{ type: 'text', text: requestOptions.prompt }] }];

        const requestData = {
          model: requestOptions.model || 'gpt-4o',
          messages,
          max_tokens: requestOptions.maxTokens || 4096,
          temperature: requestOptions.temperature || 0.7
        };

        console.log('AI送信: OpenAIリクエストデータ', {
          model: requestData.model,
          messagesCount: requestData.messages.length,
          contentLength: requestData.messages[0].content[0].text.length,
          maxTokens: requestData.max_tokens,
          temperature: requestData.temperature
        });

        const response = await axios.post('https://api.openai.com/v1/chat/completions', requestData, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${requestOptions.apiKey}`
          }
        });

        console.log('AI送信: OpenAI APIレスポンス', {
          status: response.status,
          contentLength: response.data.choices[0].message.content.length
        });

        return {
          success: true,
          text: response.data.choices[0].message.content,
          provider: 'openai'
        };
      }
    } catch (error) {
      // エラー情報を詳しく出力
      console.error('AI送信: エラー発生', {
        message: error.message,
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data
        } : 'レスポンスなし'
      });

      return {
        success: false,
        error: error.message || String(error),
        details: error.response?.data || null
      };
    }
  });

  // HTMLファイルの保存ハンドラー
  ipcMain.handle('save-html-file', async (event, { fileName, content }) => {
    try {
      // ファイル保存中フラグをON
      isAICodeSaving = true;

      if (!fileName) {
        throw new Error('ファイル名が指定されていません');
      }

      // アクティブプロジェクトの取得
      const activeProjectId = await loadActiveProjectId();
      if (!activeProjectId) {
        throw new Error('アクティブなプロジェクトが設定されていません');
      }

      // プロジェクト情報の取得
      const project = await loadProjectSettings(activeProjectId);
      if (!project) {
        throw new Error('プロジェクト情報の取得に失敗しました');
      }

      // fileUpdated フラグを追加
      project.fileUpdated = true;

      // HTMLファイルの保存
      const htmlFilePath = path.join(project.path, fileName);
      await fs.promises.writeFile(htmlFilePath, content, 'utf8');
      console.log(`${fileName} を保存しました`);

      // プロジェクト設定を更新
      await saveProjectSettings(project);

      // ファイル保存中フラグをOFF
      isAICodeSaving = false;

      return {
        success: true,
        filePath: htmlFilePath
      };
    } catch (error) {
      // エラー時もフラグを必ずOFF
      isAICodeSaving = false;
      console.error('HTMLファイルの保存に失敗:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // SCSSファイルの保存ハンドラー
  ipcMain.handle('save-scss-file', async (event, { fileName, content }) => {
    try {
      // ファイル保存中フラグをON
      isAICodeSaving = true;

      if (!fileName) {
        throw new Error('ファイル名が指定されていません');
      }

      // アクティブプロジェクトの取得
      const activeProjectId = await loadActiveProjectId();
      if (!activeProjectId) {
        throw new Error('アクティブなプロジェクトが設定されていません');
      }

      // プロジェクト情報の取得
      const project = await loadProjectSettings(activeProjectId);
      if (!project) {
        throw new Error('プロジェクト情報の取得に失敗しました');
      }

      // fileUpdated フラグを追加
      project.fileUpdated = true;

      // SCSSファイルの保存
      const scssFilePath = path.join(project.path, fileName);

      // SCSSファイルのディレクトリが存在するか確認し、存在しなければ作成
      const scssDir = path.dirname(scssFilePath);
      await fs.promises.mkdir(scssDir, { recursive: true });

      await fs.promises.writeFile(scssFilePath, content, 'utf8');
      console.log(`${fileName} を保存しました`);

      // プロジェクト設定を更新
      await saveProjectSettings(project);

      // ファイル保存中フラグをOFF
      isAICodeSaving = false;

      return {
        success: true,
        filePath: scssFilePath
      };
    } catch (error) {
      // エラー時もフラグを必ずOFF
      isAICodeSaving = false;
      console.error('SCSSファイルの保存に失敗:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // フォルダをシステムのファイルエクスプローラーで開く
  ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
      if (!folderPath) {
        throw new Error('フォルダパスが指定されていません');
      }

      // OSに応じてフォルダを開くコマンドを実行
      if (process.platform === 'win32') {
        await shell.openPath(folderPath);
      } else if (process.platform === 'darwin') {
        await shell.openPath(folderPath);
      } else {
        await shell.openPath(folderPath);
      }

      return { success: true };
    } catch (error) {
      console.error('フォルダを開く際にエラーが発生しました:', error);
      return { success: false, error: error.message };
    }
  });

  // メモリ管理のためのガベージコレクション実行API
  ipcMain.handle('gc', async () => {
    try {
      if (global.gc) {
        global.gc();
        console.log('メインプロセスでガベージコレクションを実行しました');
        return { success: true };
      } else {
        console.log('ガベージコレクション機能が利用できません。--expose-gc フラグを使用して起動してください。');
        return { success: false, error: 'GC not available' };
      }
    } catch (error) {
      console.error('ガベージコレクション実行中にエラーが発生しました:', error);
      return { success: false, error: error.message };
    }
  });

  // Python実行環境をチェックする関数
  async function checkPythonRuntime() {
    console.log('Python実行環境をチェックしています...');

    try {
      // 開発環境と本番環境で異なるPythonパスを使用
      let pythonPath;

      if (isDevelopment) {
        // 開発環境ではシステムのPythonを使用
        pythonPath = process.platform === 'win32' ? 'python' : 'python3';
        console.log(`開発環境: システムのPythonを使用します: ${pythonPath}`);
      } else {
        // 本番環境ではバンドルされたPythonを使用試行
        const pythonPath = isDevelopment
          ? process.platform === 'win32' ? 'python' : 'python3'
          : path.join(process.resourcesPath, 'app', 'python', process.platform === 'win32' ? 'python.exe' : 'python');

        console.log(`本番環境: バンドルされたPythonパス: ${pythonPath}`);

        // バンドルされたPythonが存在するか確認
        if (!fs.existsSync(pythonPath)) {
          console.warn(`警告: バンドルされたPython実行ファイルが見つかりません: ${pythonPath}`);

          // フォールバック: システムのPythonを使用
          const systemPython = process.platform === 'win32' ? 'python' : 'python3';
          console.log(`フォールバック: システムのPythonを使用します: ${systemPython}`);

          try {
            // システムPythonの存在確認
            const { stdout } = await execAsync(`${systemPython} --version`);
            console.log(`システムPythonのバージョン: ${stdout.trim()}`);
            pythonPath = systemPython; // システムPythonを使用
          } catch (error) {
            console.error(`システムPythonの実行に失敗しました: ${error.message}`);
            return 'system_not_found';
          }
        }
      }

      // Pythonのバージョンをチェック
      try {
        const { stdout } = await execAsync(`"${pythonPath}" --version`);
        console.log(`Python バージョン: ${stdout.trim()}`);
        return 'ok';
      } catch (error) {
        console.error(`Pythonバージョンチェックエラー: ${error.message}`);
        return 'version_error';
      }
    } catch (error) {
      console.error('Python実行環境チェックエラー:', error);
      return 'error';
    }
  }

  // アプリの起動が完了したら
  app.whenReady().then(async () => {
    // メモリ管理を開始
    if (global.gc) {
      console.log('メモリ管理: ガベージコレクション機能が有効です');
      startPeriodicGC();
    } else {
      console.warn('メモリ管理: ガベージコレクション機能が無効です。--js-flags="--expose-gc"フラグを使用してください');
    }

    // Python実行環境のチェック
    const pythonStatus = await checkPythonRuntime();
    console.log(`Python実行環境ステータス: ${pythonStatus}`);

    // JSXファイルのMIMEタイプを設定
    // ... existing code ...
  });
}

// プロジェクトデータの保存
async function saveProjectData(projectId, section, data) {
  try {
    if (!projectId) {
      console.error('プロジェクトIDが指定されていません');
      return false;
    }

    // JSONデータの保存先ディレクトリを確保
    const projectDir = path.join(PROJECT_DATA_DIR, projectId);
    await fs.promises.mkdir(projectDir, { recursive: true });

    // セクション別のJSONファイルパス
    const filePath = path.join(projectDir, `${section}.json`);

    // データと最終更新日時を保存
    const jsonData = {
      data,
      lastModified: new Date().toISOString()
    };

    // JSONファイルに保存
    await fs.promises.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
    console.log(`プロジェクトデータを保存しました: ${projectId}/${section}`);
    return true;
  } catch (error) {
    console.error(`プロジェクトデータの保存エラー (${projectId}/${section}):`, error);
    return false;
  }
}

// プロジェクトデータの読み込み
async function loadProjectData(projectId, section) {
  try {
    if (!projectId) {
      console.error('プロジェクトIDが指定されていません');
      return null;
    }

    // セクション別のJSONファイルパス
    const filePath = path.join(PROJECT_DATA_DIR, projectId, `${section}.json`);

    // ファイルが存在するか確認
    if (!fs.existsSync(filePath)) {
      console.log(`プロジェクトデータが見つかりません: ${projectId}/${section}`);
      return null;
    }

    // JSONファイルから読み込み
    const fileData = await fs.promises.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(fileData);
    console.log(`プロジェクトデータを読み込みました: ${projectId}/${section}`);

    // データ部分のみを返す
    return jsonData.data;
  } catch (error) {
    console.error(`プロジェクトデータの読み込みエラー (${projectId}/${section}):`, error);
    return null;
  }
}
