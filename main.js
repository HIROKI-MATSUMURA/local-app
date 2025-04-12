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
require('dotenv').config();

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

// ハードコードされたAPIキー
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "";
const DEFAULT_PROVIDER = "claude"; // デフォルトはClaude

// Pythonブリッジをロード
let pythonBridge;
try {
  pythonBridge = require('./python_bridge');
  console.log('Pythonブリッジを読み込みました');
} catch (error) {
  console.error('Pythonブリッジの読み込みに失敗しました:', error);
  pythonBridge = {
    checkPythonEnvironment: () => Promise.resolve({ success: false, error: 'モジュール読み込みエラー' }),
    extractTextFromImage: () => Promise.resolve({ success: false, error: 'Pythonブリッジが初期化されていません' }),
    extractColorsFromImage: () => Promise.resolve({ success: false, error: 'Pythonブリッジが初期化されていません' })
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
const htmlDirectory = path.join(__dirname, 'src');
// previousFilesをグローバルに宣言して、前回のファイルリストを保持
let previousFiles = [];

// アプリ起動時に監視を開始するフラグ
let isDirectoryWatcherInitialized = false;

// HTMLファイルの作成を監視する
function watchDirectory() {
  if (!isDirectoryWatcherInitialized) {
    console.log('ディレクトリ監視を初期化します');
    isDirectoryWatcherInitialized = true;

    // 監視を1秒ごとにチェック - mainWindowが使用可能になるまで遅延
    const watchIntervalId = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return; // mainWindowがまだ利用できない場合はスキップ
      }

      fs.readdir(htmlDirectory, (err, files) => {
        if (err) {
          console.error('Error reading directory:', err);
          return;
        }

        const htmlFiles = files.filter(file => file.endsWith('.html'));
        // 新しいファイルを検出
        const newFiles = htmlFiles.filter(file => !previousFiles.includes(file));

        // 新規ファイルのみを処理
        if (newFiles.length > 0) {
          newFiles.forEach(fileName => {
            console.log(`Detected new HTML file: ${fileName}`);
            // フロントエンドに新しいHTMLファイルを通知（mainWindowが存在する場合のみ）
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('new-html-file', fileName);
            }
          });
        }

        // 今回のファイルリストを保存
        previousFiles = htmlFiles;
      });
    }, 1000); // 1秒ごとにチェック

    // アプリ終了時に監視を停止
    app.on('will-quit', () => {
      clearInterval(watchIntervalId);
    });
  }
}

// ファイル変更監視ハンドラー - Viteのリロードに頼らずElectronで独自に処理
function setupFileWatcher() {
  const htmlDirectory = path.join(__dirname, 'src');

  // HTMLファイルの変更を監視
  fs.watch(htmlDirectory, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // HTMLファイルの変更のみを処理
    if (filename.endsWith('.html')) {
      console.log(`ファイル変更を検出: ${filename} - イベント: ${eventType} - AIコード保存フラグ: ${isAICodeSaving}`);

      // AIコード保存中でない場合のみ通知を送信（保存中のリロードを防止）
      if (mainWindow && !mainWindow.isDestroyed() && !isAICodeSaving) {
        mainWindow.webContents.send('file-changed', {
          type: 'html',
          filename: filename,
          path: path.join(htmlDirectory, filename)
        });
      } else if (isAICodeSaving) {
        console.log(`AIコード保存中のため、ファイル変更通知をスキップしました: ${filename}`);
      }
    }
  });

  console.log('ファイル監視を設定しました');
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

  splashWindow.loadFile(path.join(__dirname, 'src/electron/splash.html'));

  splashWindow.on('closed', () => {
    console.log('スプラッシュウィンドウが閉じられました');
    splashWindow = null;
  });
}

// メインウィンドウ作成関数
function createMainWindow() {
  console.log('メインウィンドウの作成を開始します');  // デバッグログ追加

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
    webPreferences: {
      nodeIntegration: true,  // trueに変更
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,  // falseに変更
      preload: preloadPath
    }
  };

  console.log('ウィンドウオプション:', windowOptions);  // デバッグログ追加

  // メインウィンドウの作成
  mainWindow = new BrowserWindow(windowOptions);

  // uploadsディレクトリを作成
  const uploadsDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at: ${uploadsDir}`);
  }

  // ブラウザの開発者ツールを開く（開発時のみ）
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }

  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('isDevelopment:', isDevelopment);

  // 開発環境と本番環境で適切なパスを使い分ける
  let filePath;

  if (isDevelopment) {
    // 開発環境では、Viteによってビルドされたファイルを使用
    filePath = path.join(__dirname, 'dist', 'index.html');
    console.log('開発モード: ビルド済みファイルを読み込みます:', filePath);
  } else {
    // 本番環境では、パッケージ化されたファイルを使用
    filePath = path.join(__dirname, 'dist', 'index.html');
    console.log('本番モード: ビルド済みファイルを読み込みます:', filePath);
  }

  // ブラウザコンソールのログを表示
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[WebContents] ${message}`);
  });

  // ファイルを読み込む
  mainWindow.loadFile(filePath).catch(err => {
    console.error('ファイル読み込みエラー:', err);

    // 読み込み失敗時のフォールバック
    const fallbackPath = path.join(__dirname, 'src', 'electron', 'index.html');
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
    path.join(__dirname, 'src/scss/global/_breakpoints.scss'),
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
          "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:;"
        ]
      }
    });
  });

  // Pythonブリッジの初期化
  try {
    console.log('Pythonブリッジを初期化しています...');

    // Pythonの実行パスを設定
    const pythonPath = isDevelopment
      ? 'python' // 開発環境ではシステムのPythonを使用
      : path.join(process.resourcesPath, 'python', 'python'); // 本番環境ではバンドルされたPythonを使用

    // PythonShellの設定
    let options = {
      mode: 'text',
      pythonPath: pythonPath,
      pythonOptions: ['-u'], // 出力をバッファリングしない
      scriptPath: path.join(__dirname, 'python_scripts'),
    };

    // Pythonブリッジの動作確認
    PythonShell.run('test_bridge.py', options, function (err, results) {
      if (err) {
        console.error('Pythonブリッジの初期化中にエラーが発生しました:', err);
      } else {
        console.log('Pythonブリッジが正常に初期化されました');
        console.log('Pythonからの応答:', results);
      }
    });
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

    // ファイル存在確認と強制作成（同期的に確実に実行）
    // カテゴリファイル
    const defaultCategories = ['uncategorized', 'work', 'personal'];
    fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(defaultCategories), 'utf8');
    console.log('カテゴリファイルを作成/更新しました:', defaultCategories);

    // タグファイル
    const defaultTags = ['important', 'urgent', 'in-progress', 'completed'];
    fs.writeFileSync(TAGS_PATH, JSON.stringify(defaultTags), 'utf8');
    console.log('タグファイルを作成/更新しました:', defaultTags);

    // 選択中カテゴリファイル
    fs.writeFileSync(SELECTED_CATEGORY_PATH, JSON.stringify('all'), 'utf8');
    console.log('選択中カテゴリファイルを作成/更新しました: all');

    // 選択中タグファイル
    fs.writeFileSync(SELECTED_TAGS_PATH, JSON.stringify([]), 'utf8');
    console.log('選択中タグファイルを作成/更新しました: []');

    // 読み込みテスト - 確実に作成されたか確認
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
  setupFileWatcher();

  // 出力ディレクトリの準備
  const outputPath = path.join(__dirname, 'output');
  try {
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
      console.log('出力ディレクトリを作成しました:', outputPath);
    }
  } catch (err) {
    console.error('出力ディレクトリの作成に失敗しました:', err);
  }

  // スプラッシュウィンドウを作成
  createSplashWindow();

  // メインウィンドウの作成をわずかに遅延させる
  setTimeout(() => {
    createMainWindow();

    // ディレクトリ監視を開始
    watchDirectory();
  }, 1000);

  // Mac OS の場合、アプリがアクティブ化されたらメインウィンドウを作成
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

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

function watchProjectFiles(projectId, projectPath, patterns = ['**/*.html', '**/*.css', '**/*.scss', '**/*.js', '**/*.json']) {
  try {
    console.log(`プロジェクト[${projectId}]のファイル監視を開始します。パス: ${projectPath}`);
    console.log(`監視パターン: ${patterns.join(', ')}`);

    if (projectWatchers.has(projectId)) {
      console.log(`プロジェクト[${projectId}]の以前の監視を停止して再開します`);
      unwatchProjectFiles(projectId);
    }

    // chokidar または fs.watch を使用してファイル監視を実装
    const watcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // パターンマッチングを簡易的に実装
      const matchesPattern = patterns.some(pattern => {
        // 簡易ワイルドカードマッチング
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*');
        return new RegExp(regexPattern).test(filename);
      });

      if (matchesPattern) {
        console.log(`ファイル変更を検出: ${filename} (${eventType})`);
        // 必要に応じてレンダラープロセスに通知
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project-file-changed', {
            projectId,
            eventType,
            filename,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    // ウォッチャーを保存
    projectWatchers.set(projectId, watcher);
    console.log(`プロジェクト[${projectId}]のファイル監視を開始しました`);
    return true;
  } catch (error) {
    console.error('ファイル監視の設定中にエラーが発生しました:', error);
    return false;
  }
}

// ファイル監視の停止
function unwatchProjectFiles(projectId) {
  try {
    console.log(`プロジェクト[${projectId}]のファイル監視を停止します`);
    if (projectWatchers.has(projectId)) {
      // ウォッチャーを閉じる
      projectWatchers.get(projectId).close();
      projectWatchers.delete(projectId);
      console.log(`プロジェクト[${projectId}]のファイル監視を停止しました`);
      return true;
    } else {
      console.log(`プロジェクト[${projectId}]の監視は既に停止しています`);
      return false;
    }
  } catch (error) {
    console.error('ファイル監視の停止中にエラーが発生しました:', error);
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
async function loadCategories() {
  try {
    if (fs.existsSync(CATEGORIES_PATH)) {
      const data = await fs.promises.readFile(CATEGORIES_PATH, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('カテゴリの読み込みに失敗:', error);
    return null;
  }
}

// カテゴリの保存
async function saveCategories(categories) {
  try {
    // ディレクトリが存在することを確認
    const dirPath = path.dirname(CATEGORIES_PATH);
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }

    await fs.promises.writeFile(CATEGORIES_PATH, JSON.stringify(categories));
    console.log(`カテゴリを保存しました: ${CATEGORIES_PATH}`, categories);
    return true;
  } catch (error) {
    console.error('カテゴリの保存に失敗:', error);
    return false;
  }
}

// タグの読み込み
async function loadTags() {
  try {
    if (fs.existsSync(TAGS_PATH)) {
      const data = await fs.promises.readFile(TAGS_PATH, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('タグの読み込みに失敗:', error);
    return null;
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


// 選択中のカテゴリを保存
async function saveSelectedCategory(category) {
  try {
    // ディレクトリが存在することを確認
    const dirPath = path.dirname(SELECTED_CATEGORY_PATH);
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }

    await fs.promises.writeFile(SELECTED_CATEGORY_PATH, JSON.stringify(category));
    console.log(`選択中のカテゴリを保存しました: ${SELECTED_CATEGORY_PATH}`, category);
    return true;
  } catch (error) {
    console.error('選択中のカテゴリの保存に失敗:', error);
    return false;
  }
}

// 選択中のカテゴリを読み込み
async function loadSelectedCategory() {
  try {
    if (fs.existsSync(SELECTED_CATEGORY_PATH)) {
      const data = await fs.promises.readFile(SELECTED_CATEGORY_PATH, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('選択中のカテゴリの読み込みに失敗:', error);
    return null;
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
    console.error('選択中のタグの読み込みに失敗:', error);
    return null;
  }
}

// IPC ハンドラーを設定する関数
function setupIPCHandlers() {
  // 必要なディレクトリの作成
  const ensureDirectories = () => {
    const directories = [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'src/scss'),
      path.join(__dirname, 'src/scss/object'),
      path.join(__dirname, 'src/scss/object/AI_Component'),
      path.join(__dirname, 'src/partsHTML')
    ];

    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`ディレクトリを作成しました: ${dir}`);
      }
    });
  };

  // 起動時にディレクトリを確認・作成
  ensureDirectories();

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
      const srcDir = path.join(__dirname, 'src');

      if (!fs.existsSync(srcDir)) {
        console.log(`srcディレクトリが存在しません: ${srcDir}`);
        return [];
      }

      const files = await fs.promises.readdir(srcDir);
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

    const filePath = path.join(__dirname, 'src/scss/global/_settings.scss');
    fs.writeFile(filePath, scssContent, 'utf8', (err) => {
      if (err) {
        console.error(`Error writing to ${filePath}:`, err);
      } else {
        console.log(`Successfully updated ${filePath}`);
      }
    });
  });

  // 管理画面からファイルを保存する要求を受け取る
  ipcMain.on('save-html-file', (event, { filePath, content }) => {
    console.log('Received save request:', filePath, content);  // ここでログを確認

    const absolutePath = path.join(__dirname, 'src', filePath);  // 絶対パスに変換
    fs.writeFile(absolutePath, content, 'utf8', (err) => {
      if (err) {
        console.error('Error occurred while saving file:', err);
        event.reply('save-html-file-error', err);
      } else {
        console.log(`Successfully saved file at: ${absolutePath}`);
        event.reply('save-html-file-success', absolutePath);
      }
    });
  });

  // ファイル削除処理
  ipcMain.on('delete-html-file', (event, { fileName }) => {
    const filePath = path.join(__dirname, 'src', `${fileName}`);
    console.log(`取得しているファイルパス: ${filePath}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);  // ファイル削除
      console.log(`Successfully deleted file: ${filePath}`);
      event.reply('file-deleted', fileName);
      mainWindow.webContents.send('file-deleted', fileName); // 監視しているレンダラープロセスに通知
    } else {
      console.log(`File not found(Delete Path): ${filePath}`);
    }
  });

  // ファイル名を変更する処理
  ipcMain.on('rename-file', (event, { oldFileName, newFileName }) => {
    // 拡張子が重複しないように処理
    const oldFilePath = path.join(__dirname, 'src', oldFileName);
    const newFileNameWithHtml = newFileName.endsWith('.html') ? newFileName : newFileName + '.html'; // .htmlがなければ追加
    const newFilePath = path.join(__dirname, 'src', newFileNameWithHtml);

    // ファイル名を変更する
    try {
      fs.renameSync(oldFilePath, newFilePath);
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
    try {
      if (fs.existsSync(apiKeyPath)) {
        const data = fs.readFileSync(apiKeyPath, 'utf8');
        console.log(`APIキーファイルを読み込みました: ${apiKeyPath}`);

        const apiData = JSON.parse(data);
        console.log(`APIデータ解析結果: プロバイダ=${apiData.selectedProvider || 'openai'}, OpenAIキー=${apiData.apiKey ? '設定済み' : '未設定'}, Claudeキー=${apiData.claudeKey ? '設定済み' : '未設定'}`);

        return {
          openaiKey: apiData.apiKey,
          claudeKey: apiData.claudeKey,
          selectedProvider: apiData.selectedProvider || 'openai' // デフォルトはOpenAI
        };
      } else {
        console.log(`APIキーファイルが存在しません: ${apiKeyPath}`);
      }
    } catch (error) {
      console.error('Error reading API key:', error);
    }
    console.log('デフォルトのAPI設定を返します');
    return { openaiKey: null, claudeKey: null, selectedProvider: 'openai' };
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

  // AIコード生成ハンドラ
  ipcMain.handle('generate-code', async (event, params) => {
    try {
      console.log('AIコード生成リクエストを受信しました');

      // ハードコードされたAPIキーを使用
      const selectedProvider = DEFAULT_PROVIDER;
      const apiKey = selectedProvider === 'openai' ? OPENAI_API_KEY : CLAUDE_API_KEY;

      console.log(`選択されたAIプロバイダ: ${selectedProvider}`);

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
  const saveAIGeneratedCode = async ({ scssCode, htmlCode, blockName, targetHtmlFile }) => {
    try {
      console.log('AI生成コードの保存処理を開始します:', { blockName, targetHtmlFile });

      // ディレクトリの存在確認・作成
      const scssDir = path.join(__dirname, 'src/scss/object/AI_Component');
      const htmlPartsDir = path.join(__dirname, 'src/partsHTML');

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

      // HTMLパーツファイルパスの作成
      let htmlFileName = `${blockName}.html`;
      let htmlPartsFilePath = path.join(htmlPartsDir, htmlFileName);

      // ファイル名の衝突チェック
      const fileExists = {
        scss: fs.existsSync(scssFilePath),
        html: htmlCode && fs.existsSync(htmlPartsFilePath)
      };

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
      if (!scssNeedsRename) {
        const scssContent = `@use "../../global" as *;\n\n${scssCode}`;
        await fs.promises.writeFile(scssFilePath, scssContent, 'utf8');
        console.log(`SCSSファイルを保存しました: ${scssFilePath}`);
        result.savedFiles.scss = scssFileName;
        result.success = true;
      }

      // HTMLパーツファイルを保存（HTMLコードがあり、衝突がなければ）
      if (htmlCode && !htmlNeedsRename) {
        await fs.promises.writeFile(htmlPartsFilePath, htmlCode, 'utf8');
        console.log(`HTMLパーツファイルを保存しました: ${htmlPartsFilePath}`);
        result.savedFiles.html = htmlFileName;
        result.success = true;

        // 対象のHTMLファイルにインクルード文を追加
        if (targetHtmlFile) {
          const targetFilePath = path.join(__dirname, 'src', targetHtmlFile);

          if (fs.existsSync(targetFilePath)) {
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
            return {
              success: false,
              error: 'ターゲットHTMLファイルが存在しません',
              savedFiles: result.savedFiles
            };
          }
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
      hasScssCode: !!params.scssCode,
      targetHtmlFile: params.targetHtmlFile
    });

    // AIコード保存フラグをオン
    isAICodeSaving = true;

    // 処理開始のタイムスタンプを記録
    const startTime = Date.now();

    try {
      // 保存処理を実行
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
        newHtmlBlockName
      });

      // SCSSとHTMLで異なるブロック名を処理
      const scssDir = path.join(__dirname, 'src/scss/object/AI_Component');
      const htmlPartsDir = path.join(__dirname, 'src/partsHTML');

      if (!fs.existsSync(scssDir)) {
        fs.mkdirSync(scssDir, { recursive: true });
      }

      if (!fs.existsSync(htmlPartsDir)) {
        fs.mkdirSync(htmlPartsDir, { recursive: true });
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
          const scssContent = `@use "../../global" as *;\n\n${scssCode}`;
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
            const targetFilePath = path.join(__dirname, 'src', targetHtmlFile);

            if (fs.existsSync(targetFilePath)) {
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

      // 最終更新日時を設定
      if (!project.lastModified) {
        project.lastModified = new Date().toISOString();
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
    return watchProjectFiles(projectId, (changes) => {
      event.sender.send('project-files-changed', changes);
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
      // パターンが正しく配列であることを確認
      const watchPatterns = Array.isArray(patterns) ? patterns : ['**/*.html', '**/*.css', '**/*.scss', '**/*.js', '**/*.json'];

      // watchProjectFiles関数を呼び出してファイル監視を開始
      const result = watchProjectFiles(projectId, projectPath, watchPatterns);
      return { success: result };
    } catch (error) {
      console.error('プロジェクトファイル監視エラー:', error);
      return { success: false, error: error.message };
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

  // Python画像処理ハンドラー
  ipcMain.handle('extract-text-from-image', async (event, imageData) => {
    try {
      console.log('画像からテキスト抽出リクエストを受信 - データサイズ:',
        imageData ? (typeof imageData === 'string' ? imageData.length : 'データ型:' + typeof imageData) : 'データなし');

      // pythonブリッジの状態確認
      if (!pythonBridge) {
        console.error('Pythonブリッジが初期化されていません');
        return { success: false, error: 'Pythonブリッジが初期化されていません' };
      }

      console.log('Pythonブリッジにリクエスト送信を開始...');

      // 画像データの形式をログ出力
      if (imageData && typeof imageData === 'string') {
        const isProbablyBase64 = imageData.startsWith('data:') || /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(imageData);
        console.log('画像データ形式: ' + (isProbablyBase64 ? 'Base64エンコード' : 'その他のテキスト'));
        console.log('画像データプレビュー:', imageData.substring(0, 50) + '...');
      }

      // pythonブリッジを通じて画像からテキストを抽出
      const result = await pythonBridge.extractTextFromImage(imageData);
      console.log('Python処理完了:', result ? '成功' : '失敗');

      if (result) {
        console.log('処理結果:', JSON.stringify(result).substring(0, 100) + '...');
      }

      console.log('画像からテキスト抽出が完了しました');
      return result;
    } catch (error) {
      console.error('画像からテキスト抽出エラー:', error);
      console.error('エラースタック:', error.stack);
      return { success: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('extract-colors-from-image', async (event, imageData) => {
    try {
      console.log('画像から色抽出リクエストを受信');
      // pythonブリッジを通じて画像から色を抽出
      if (!pythonBridge) {
        console.error('Pythonブリッジが初期化されていません');
        return { success: false, error: 'Pythonブリッジが初期化されていません' };
      }

      const result = await pythonBridge.extractColorsFromImage(imageData);
      console.log('画像から色抽出が完了しました');
      return result;
    } catch (error) {
      console.error('画像から色抽出エラー:', error);
      return { success: false, error: error.message || String(error) };
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
