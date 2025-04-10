const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { v4: uuidv4 } = require('uuid');
const url = require('url');
const chokidar = require('chokidar'); // Chokidarをインポート
const glob = require('glob'); // Globをインポート
require('dotenv').config();

// プロジェクト設定ファイルのパスを定義
const PROJECTS_CONFIG_PATH = path.join(app.getPath('userData'), 'projects.json');
const ACTIVE_PROJECT_PATH = path.join(app.getPath('userData'), 'active-project.json');
const CATEGORIES_PATH = path.join(app.getPath('userData'), 'categories.json');
const TAGS_PATH = path.join(app.getPath('userData'), 'tags.json');
const SELECTED_CATEGORY_PATH = path.join(app.getPath('userData'), 'selected-category.json');
const SELECTED_TAGS_PATH = path.join(app.getPath('userData'), 'selected-tags.json');

// 新しいファイルパスを追加（app.getName()を使用）
const appName = app.getName() || 'electron-app';

// ハードコードされたAPIキー
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "";
const DEFAULT_PROVIDER = "claude"; // デフォルトはClaude

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

// 監視するディレクトリ
const htmlDirectory = path.join(__dirname, 'src');
// previousFilesをグローバルに宣言して、前回のファイルリストを保持
let previousFiles = [];

// JSONデータストア関連のパス設定
const PROJECT_DATA_DIR = path.join(app.getPath('userData'), 'projectData');

// アプリ起動時に監視を開始するフラグ
let isDirectoryWatcherInitialized = false;

// ファイル監視用のMap
const fileWatchers = new Map();

// プロジェクトファイル監視用のMap
const projectWatchers = new Map();
// プロジェクトの定期スキャンインターバル用のMap
const projectIntervals = new Map();

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
  // HTMLファイルの変更を監視（グローバル監視）
  fs.watch(htmlDirectory, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // HTMLファイルの変更のみを処理
    if (filename.endsWith('.html')) {
      console.log(`グローバルファイル変更を検出: ${filename} - イベント: ${eventType} - AIコード保存フラグ: ${isAICodeSaving}`);
      console.log(`ファイルパス: ${path.join(htmlDirectory, filename)}`);

      // AIコード保存中でない場合のみ通知を送信（保存中のリロードを防止）
      if (mainWindow && !mainWindow.isDestroyed() && !isAICodeSaving) {
        try {
          // ファイルタイプを判定
          const fileType = path.extname(filename).substring(1);

          // 安全なオブジェクトを作成
          const fileData = {
            type: fileType,
            fileType: fileType, // 明示的にfileTypeを追加
            eventType: eventType,
            fileName: filename,
            filename: filename,
            filePath: path.join(htmlDirectory, filename)
          };

          // シリアライズ可能なオブジェクトに変換
          const safeData = JSON.parse(JSON.stringify(fileData));

          mainWindow.webContents.send('file-changed', safeData);
          console.log('グローバル監視からファイル変更イベントを送信:', safeData);
        } catch (error) {
          console.error('ファイル変更通知の送信中にエラーが発生:', error);
        }
      } else if (isAICodeSaving) {
        console.log(`AIコード保存中のため、ファイル変更通知をスキップしました: ${filename}`);
      }
    }
  });

  console.log('グローバルファイル監視を設定しました');
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
          "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com"
        ]
      }
    });
  });

  // 重要: カテゴリとタグの初期化を他の処理より先に実行
  try {
    console.log('カテゴリとタグの初期化を開始します...');

    // userData ディレクトリの確認
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
      console.log(`userData ディレクトリを作成しました: ${userDataPath}`);
    }

    // ファイル存在確認と初期化（存在しない場合のみ）
    const defaultCategories = ['uncategorized', '制作会社', 'コミュニティ', 'エンド'];
    if (!fs.existsSync(CATEGORIES_PATH)) {
      fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(defaultCategories), 'utf8');
      console.log('カテゴリファイルを作成しました:', defaultCategories);
    } else {
      // ファイルは存在するが、uncategorizedが含まれているか確認
      try {
        const currentCategories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'));
        if (Array.isArray(currentCategories) && !currentCategories.includes('uncategorized')) {
          // uncategorizedが含まれていない場合は追加
          const updatedCategories = ['uncategorized', ...currentCategories];
          fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(updatedCategories), 'utf8');
          console.log('既存のカテゴリにuncategorizedを追加しました:', updatedCategories);
        } else {
          console.log('カテゴリファイルは既に存在し、適切な内容のため初期化をスキップします');
        }
      } catch (err) {
        console.error('カテゴリファイルの検証中にエラーが発生しました:', err);
        console.log('カテゴリファイルは既に存在するため、初期化をスキップします');
      }
    }

    // タグファイル
    const defaultTags = ['A社', 'B社'];
    if (!fs.existsSync(TAGS_PATH)) {
      fs.writeFileSync(TAGS_PATH, JSON.stringify(defaultTags), 'utf8');
      console.log('タグファイルを作成しました:', defaultTags);
    } else {
      console.log('タグファイルは既に存在するため、初期化をスキップします');
    }

    // 選択中カテゴリファイル
    if (!fs.existsSync(SELECTED_CATEGORY_PATH)) {
      fs.writeFileSync(SELECTED_CATEGORY_PATH, JSON.stringify('all'), 'utf8');
      console.log('選択中カテゴリファイルを作成しました: all');
    } else {
      console.log('選択中カテゴリファイルは既に存在するため、初期化をスキップします');
    }

    // 選択中タグファイル
    if (!fs.existsSync(SELECTED_TAGS_PATH)) {
      fs.writeFileSync(SELECTED_TAGS_PATH, JSON.stringify([]), 'utf8');
      console.log('選択中タグファイルを作成しました: []');
    } else {
      console.log('選択中タグファイルは既に存在するため、初期化をスキップします');
    }

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
    // 既存のウォッチャーがあれば閉じる
    unwatchProjectFiles(projectId);

    console.log(`プロジェクト[${projectId}]のファイル監視を開始: ${projectPath}`);
    console.log('監視パターン:', patterns);

    // ウォッチするHTMLファイルのパターンを追加
    const htmlPatterns = [
      'src/pages/**/*.html',
      'src/html/**/*.html',
      ...(patterns.filter(p => p.includes('.html')))
    ];

    // 除外パターン（partsHTMLディレクトリを除外）
    const ignoredPatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/partsHTML/**', // partsHTMLディレクトリを明示的に除外
      '**/*.json', // JSONファイルを監視対象から除外（自動生成されるため）
    ];

    // 監視済みファイルを追跡するためのSet
    const watchedFiles = new Set();

    // chokidarの設定
    const watcher = chokidar.watch(patterns, {
      cwd: projectPath,
      ignored: [
        /(^|[\/\\])\../, // ドットファイルを無視
        ...ignoredPatterns
      ],
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    // インターバルIDを保存するための配列を初期化
    if (!projectIntervals.has(projectId)) {
      projectIntervals.set(projectId, []);
    }

    // イベントハンドラー
    watcher
      .on('add', async path => {
        // partsHTMLディレクトリ内のファイルは無視
        if (path.includes('partsHTML/')) {
          console.log(`partsHTMLディレクトリのファイルはスキップ: ${path}`);
          return;
        }

        // ファイルが既に処理済みかチェック
        const fullPath = `${projectPath}/${path}`;
        if (watchedFiles.has(fullPath)) {
          console.log(`既に処理済みのファイル: ${path}`);
          return;
        }

        watchedFiles.add(fullPath);
        console.log(`ファイル追加検知: ${path}`);

        // HTMLファイルの場合、対応するJSONファイルを更新（オプション）
        if (path.endsWith('.html')) {
          try {
            // HTMLファイルの内容を読み込む
            const htmlContent = fs.readFileSync(`${projectPath}/${path}`, 'utf8');

            // ファイル内容をJSONに同期
            try {
              await syncFileToJson(projectId, `${projectPath}/${path}`, 'html');
            } catch (error) {
              console.error(`ファイル同期エラー (${path}):`, error);
            }
          } catch (error) {
            console.error(`HTMLファイル処理エラー: ${path}`, error);
          }
        } else {
          // 他のファイルタイプを処理
          const fileType = path.split('.').pop();

          // ファイル内容をJSONに同期
          try {
            await syncFileToJson(projectId, `${projectPath}/${path}`, fileType);
          } catch (error) {
            console.error(`ファイル同期エラー (${path}):`, error);
          }
        }

        // フロントエンドに通知
        if (mainWindow) {
          const fileType = path.split('.').pop();
          const eventData = {
            type: 'add',
            projectId: projectId,
            eventType: 'add',
            path: path,
            filePath: `${projectPath}/${path}`,
            fileType: fileType,
            fileName: path.split('/').pop(),
            timestamp: new Date().toISOString()
          };

          mainWindow.webContents.send('file-event', eventData);
          mainWindow.webContents.send('file-changed', eventData);
          console.log('ファイル追加イベントを送信:', eventData);
        }
      })
      .on('change', async path => {
        // partsHTMLディレクトリ内のファイルは無視
        if (path.includes('partsHTML/')) {
          return;
        }

        console.log(`ファイル変更検知: ${path}`);

        // HTMLファイルの場合の処理
        if (path.endsWith('.html')) {
          try {
            // ファイル内容をJSONに同期
            await syncFileToJson(projectId, `${projectPath}/${path}`, 'html');
          } catch (error) {
            console.error(`ファイル同期エラー (${path}):`, error);
          }
        } else {
          // 他のファイルタイプを処理
          const fileType = path.split('.').pop();

          // ファイル内容をJSONに同期
          try {
            await syncFileToJson(projectId, `${projectPath}/${path}`, fileType);
          } catch (error) {
            console.error(`ファイル同期エラー (${path}):`, error);
          }
        }

        // フロントエンドに通知
        if (mainWindow) {
          const fileType = path.split('.').pop();
          const eventData = {
            type: 'change',
            projectId: projectId,
            eventType: 'change',
            path: path,
            filePath: `${projectPath}/${path}`,
            fileType: fileType,
            fileName: path.split('/').pop(),
            timestamp: new Date().toISOString()
          };

          mainWindow.webContents.send('file-event', eventData);
          mainWindow.webContents.send('file-changed', eventData);
          console.log('ファイル変更イベントを送信:', eventData);
        }
      })
      .on('unlink', async path => {
        // partsHTMLディレクトリ内のファイルは無視
        if (path.includes('partsHTML/')) {
          return;
        }

        // Setから削除
        const fullPath = `${projectPath}/${path}`;
        watchedFiles.delete(fullPath);

        console.log(`ファイル削除検知: ${path}`);

        // ファイルタイプを判定
        const fileType = path.split('.').pop();

        // フロントエンドに通知
        if (mainWindow) {
          const eventData = {
            type: 'unlink',
            projectId: projectId,
            eventType: 'unlink',
            path: path,
            filePath: `${projectPath}/${path}`,
            fileType: fileType,
            fileName: path.split('/').pop(),
            timestamp: new Date().toISOString()
          };

          // ログ出力を追加
          console.log('ファイル削除イベントを送信:', JSON.stringify(eventData));

          // イベント名を両方試す
          mainWindow.webContents.send('file-event', eventData);
          mainWindow.webContents.send('file-changed', eventData);

          // 1秒後に再度送信して確実に届くようにする
          setTimeout(() => {
            console.log('ファイル削除イベントを再送信:', JSON.stringify(eventData));
            mainWindow.webContents.send('file-changed', eventData);
          }, 1000);
        }
      })
      .on('error', error => {
        console.error(`ファイル監視エラー: ${error}`);
      });

    // ウォッチャーを保存
    projectWatchers.set(projectId, watcher);

    // 初回スキャン後に手動で再スキャン（1回のみ）
    const initialScanTimeout = setTimeout(() => {
      console.log(`プロジェクト[${projectId}] 初期スキャン後の確認スキャンを実行`);
      try {
        // HTMLファイルを再確認（一度だけ）
        htmlPatterns.forEach(pattern => {
          // partsHTMLディレクトリを除外
          if (pattern.includes('partsHTML')) return;

          const htmlFiles = glob.sync(pattern, {
            cwd: projectPath,
            ignore: ignoredPatterns
          });

          console.log(`パターン[${pattern}]で検出されたHTMLファイル:`, htmlFiles);

          htmlFiles.forEach(async htmlPath => {
            // partsHTMLディレクトリのファイルは無視
            if (htmlPath.includes('partsHTML/')) {
              console.log(`partsHTMLディレクトリのファイルはスキップ: ${htmlPath}`);
              return;
            }

            const fullPath = `${projectPath}/${htmlPath}`;
            if (!watchedFiles.has(fullPath)) {
              console.log(`確認スキャンで検出された未処理ファイル: ${htmlPath}`);

              try {
                // ファイル内容をJSONに同期
                await syncFileToJson(projectId, fullPath, 'html');

                // フロントエンドに通知
                if (mainWindow) {
                  const eventData = {
                    type: 'add',
                    projectId: projectId,
                    eventType: 'add',
                    path: htmlPath,
                    filePath: fullPath,
                    fileType: 'html',
                    fileName: htmlPath.split('/').pop(),
                    timestamp: new Date().toISOString()
                  };

                  mainWindow.webContents.send('file-event', eventData);
                  mainWindow.webContents.send('file-changed', eventData);
                  console.log('ファイル検出イベントを送信:', eventData);
                }

                watchedFiles.add(fullPath);
              } catch (error) {
                console.error(`HTMLファイル処理エラー: ${htmlPath}`, error);
              }
            }
          });
        });
      } catch (error) {
        console.error('確認スキャンエラー:', error);
      }
    }, 5000);

    // タイマーを保存
    projectIntervals.get(projectId).push(initialScanTimeout);

    // 30秒ごとにファイルシステムを再スキャン（新規ファイル検出用）
    const scanInterval = setInterval(() => {
      console.log(`プロジェクト[${projectId}] 定期再スキャンを実行`);
      try {
        // HTMLファイルを再スキャン
        htmlPatterns.forEach(pattern => {
          // partsHTMLディレクトリを除外
          if (pattern.includes('partsHTML')) return;

          const htmlFiles = glob.sync(pattern, {
            cwd: projectPath,
            ignore: ignoredPatterns
          });

          htmlFiles.forEach(async htmlPath => {
            // partsHTMLディレクトリのファイルは無視
            if (htmlPath.includes('partsHTML/')) return;

            const fullPath = `${projectPath}/${htmlPath}`;
            if (!watchedFiles.has(fullPath)) {
              // 未処理のHTMLファイルがあれば処理
              console.log(`定期スキャンで検出された新規ファイル: ${htmlPath}`);

              try {
                // ファイル内容をJSONに同期
                await syncFileToJson(projectId, fullPath, 'html');

                // フロントエンドに通知
                if (mainWindow) {
                  const eventData = {
                    type: 'add',
                    projectId: projectId,
                    eventType: 'add',
                    path: htmlPath,
                    filePath: fullPath,
                    fileType: 'html',
                    fileName: htmlPath.split('/').pop(),
                    timestamp: new Date().toISOString()
                  };

                  mainWindow.webContents.send('file-event', eventData);
                  mainWindow.webContents.send('file-changed', eventData);
                  console.log('ファイル検出イベントを送信:', eventData);
                }

                watchedFiles.add(fullPath);
              } catch (error) {
                console.error(`HTMLファイル処理エラー: ${htmlPath}`, error);
              }
            }
          });
        });
      } catch (error) {
        console.error('定期再スキャンエラー:', error);
      }
    }, 30000);

    // インターバルIDを保存
    projectIntervals.get(projectId).push(scanInterval);

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

      // 定期スキャンインターバルもクリア
      if (projectIntervals.has(projectId)) {
        const intervals = projectIntervals.get(projectId);
        intervals.forEach(intervalId => {
          clearInterval(intervalId);
          console.log(`プロジェクト[${projectId}]の定期スキャンを停止しました`);
        });
        projectIntervals.delete(projectId);
      }

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

// 選択中のカテゴリを保存するパス

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

// 選択中のタグを保存するパス

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
  ipcMain.on('save-html-file', (event, { projectId, projectPath, filePath, content }) => {
    try {
      let fullPath;

      // プロジェクトパスが指定されている場合はそれを使用
      if (projectPath) {
        console.log(`指定されたプロジェクトパス: ${projectPath}`);

        // srcパスの重複を防止
        if (filePath.startsWith('src/')) {
          fullPath = path.join(projectPath, filePath);
        } else {
          fullPath = path.join(projectPath, 'src', filePath);
        }
      } else {
        // 旧方式: アプリのベースパスを使用
        const basePath = __dirname;
        console.log('アプリのbasePath（fallback）:', basePath);

        if (filePath.startsWith('src/')) {
          fullPath = path.join(basePath, filePath);
        } else {
          fullPath = path.join(basePath, 'src', filePath);
        }
      }

      // srcの重複がないか確認
      if (fullPath.includes('src/src/')) {
        console.warn('src/パスの重複を検出しました。修正します');
        fullPath = fullPath.replace('src/src/', 'src/');
      }

      console.log(`HTMLファイル保存リクエストを受信: ${filePath}`);
      console.log(`プロジェクトID: ${projectId || 'なし'}`);
      console.log(`保存先フルパス: ${fullPath}`);

      // ディレクトリが存在することを確認
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        console.log(`ディレクトリが存在しないため作成します: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
        console.log(`ディレクトリを作成しました: ${dir}`);
      } else {
        console.log(`ディレクトリが既に存在します: ${dir}`);
      }

      // ファイル保存
      fs.writeFile(fullPath, content, (err) => {
        if (err) {
          console.error('HTMLファイルの保存に失敗:', err);
          event.sender.send('file-error', { error: err.message });
        } else {
          console.log(`HTMLファイルを保存しました: ${filePath} -> ${fullPath}`);
          // 成功をフロントエンドに通知
          event.sender.send('file-saved', {
            projectId,
            filePath,
            fullPath,
            timestamp: new Date().toISOString()
          });

          // プロジェクトIDがある場合は、ファイル変更イベントを発行（自己通知）
          if (projectId) {
            try {
              // ファイル変更イベントの発行
              const fileChangeEvent = {
                projectId,
                eventType: 'add', // 新規追加または更新
                filePath: fullPath,
                fileType: 'html',
                fileName: path.basename(filePath),
                timestamp: new Date().toISOString()
              };

              // シリアライズ可能なオブジェクトに変換
              const safeData = JSON.parse(JSON.stringify(fileChangeEvent));

              // シンプルな通知を避けるためにタイムアウトを設定
              setTimeout(() => {
                event.sender.send('file-changed', safeData);
                console.log('ファイル保存後の変更イベントを発行:', safeData);
              }, 500);
            } catch (error) {
              console.error('ファイル変更イベント発行中にエラーが発生しました:', error);
            }
          }
        }
      });
    } catch (error) {
      console.error('HTMLファイル保存処理エラー:', error);
      event.sender.send('file-error', { error: error.message });
    }
  });

  // HTMLファイルの削除
  ipcMain.on('delete-html-file', (event, { projectId, projectPath, fileName }) => {
    try {
      console.log(`HTMLファイル削除要求を受信: ${fileName}`);
      console.log(`プロジェクト情報: ID=${projectId}, パス=${projectPath}`);

      // ファイルパスの構築（プロジェクトパスを優先）
      let filePath;
      if (projectPath) {
        filePath = path.join(projectPath, 'src/pages', fileName);
        console.log(`プロジェクトパスからファイルパスを構築: ${filePath}`);
      } else {
        // フォールバック: アプリディレクトリ基準
        const htmlDir = path.join(__dirname, 'src');
        filePath = path.join(htmlDir, fileName);
        console.log(`アプリベースディレクトリからファイルパスを構築: ${filePath}`);
      }

      // ファイルの存在確認
      if (!fs.existsSync(filePath)) {
        console.error(`削除対象ファイルが存在しません: ${filePath}`);
        event.sender.send('file-error', { error: 'ファイルが見つかりませんでした' });
        return;
      }

      // ファイル削除実行
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('HTMLファイルの削除に失敗:', err);
          event.sender.send('file-error', { error: err.message });
        } else {
          console.log(`HTMLファイルを削除しました: ${filePath}`);

          // 削除成功をフロントエンドに通知
          const deleteData = {
            projectId,
            fileName,
            filePath,
            timestamp: new Date().toISOString()
          };
          event.sender.send('file-deleted', deleteData);

          // ファイル変更イベントとしても通知
          try {
            const fileChangeEvent = {
              projectId,
              eventType: 'unlink',
              filePath,
              fileType: 'html',
              fileName,
              timestamp: new Date().toISOString()
            };

            // シリアライズ可能なオブジェクトに変換
            const safeData = JSON.parse(JSON.stringify(fileChangeEvent));

            setTimeout(() => {
              event.sender.send('file-changed', safeData);
              console.log('ファイル削除変更イベントを発行:', safeData);
            }, 500);
          } catch (error) {
            console.error('ファイル削除イベント発行中にエラーが発生しました:', error);
          }
        }
      });
    } catch (error) {
      console.error('HTMLファイル削除処理エラー:', error);
      event.sender.send('file-error', { error: error.message });
    }
  });

  // ファイル名の変更
  ipcMain.on('rename-file', (event, { oldPath, newPath }) => {
    try {
      const htmlDir = path.join(__dirname, 'src');
      const oldFilePath = path.join(htmlDir, oldPath);
      const newFilePath = path.join(htmlDir, newPath);

      // ファイルが存在するか確認
      if (!fs.existsSync(oldFilePath)) {
        console.error(`元のファイルが存在しません: ${oldFilePath}`);
        event.sender.send('file-error', { error: '元のファイルが存在しません' });
        return;
      }

      // 移動先に既にファイルがある場合は上書き確認
      if (fs.existsSync(newFilePath) && oldPath !== newPath) {
        console.warn(`移動先にファイルが既に存在します: ${newFilePath}`);
        // 上書き処理はUXに応じて実装
      }

      // ファイル名変更を実行
      fs.rename(oldFilePath, newFilePath, (err) => {
        if (err) {
          console.error('ファイル名の変更に失敗:', err);
          event.sender.send('file-error', { error: err.message });
        } else {
          console.log(`ファイル名を変更しました: ${oldPath} → ${newPath}`);
          // 変更成功をフロントエンドに通知
          event.sender.send('file-renamed', { oldPath, newPath });
        }
      });
    } catch (error) {
      console.error('ファイル名変更処理エラー:', error);
      event.sender.send('file-error', { error: error.message });
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
  ipcMain.handle('watch-project-files', async (event, { projectId, projectPath, patterns }) => {
    console.log('ファイル監視要求を受信:', { projectId, projectPath, patterns });
    try {
      // 監視パターンが配列であることを確認
      const validPatterns = Array.isArray(patterns) ? patterns : ['**/*.html', '**/*.css', '**/*.scss', '**/*.js', '**/*.json'];

      // 監視関数を呼び出し
      const result = watchProjectFiles(projectId, projectPath, validPatterns);

      console.log(`プロジェクト[${projectId}]のファイル監視を開始しました:`, result);
      return result;
    } catch (error) {
      console.error('ファイル監視の開始に失敗しました:', error);
      return false;
    }
  });

  // ファイル監視の停止
  ipcMain.handle('unwatch-project-files', async (event, { projectId }) => {
    return unwatchProjectFiles(projectId);
  });

  // プロジェクトデータの保存
  ipcMain.handle('save-project-data', async (event, { projectId, section, data }) => {
    return await saveProjectData(projectId, section, data);
  });

  // プロジェクトデータの読み込み
  ipcMain.handle('load-project-data', async (event, { projectId, section }) => {
    return await loadProjectData(projectId, section);
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

  // ファイルパスをExplorer/Finderで開くハンドラ
  ipcMain.handle('open-path-in-explorer', async (event, filePath) => {
    try {
      console.log(`パスをエクスプローラーで開く要求を受信: ${filePath}`);

      // ファイルパスの存在確認
      if (!fs.existsSync(filePath)) {
        console.error(`指定されたパスが存在しません: ${filePath}`);
        return { success: false, error: '指定されたパスが存在しません' };
      }

      // OSに応じてコマンドを選択
      let opened = false;
      if (process.platform === 'darwin') {
        // macOS
        opened = shell.openPath(filePath);
      } else if (process.platform === 'win32') {
        // Windows
        opened = shell.openPath(filePath);
      } else if (process.platform === 'linux') {
        // Linux
        opened = shell.openPath(filePath);
      }

      if (opened) {
        console.log(`パスを正常に開きました: ${filePath}`);
        return { success: true };
      } else {
        console.error(`パスを開けませんでした: ${filePath}`);
        return { success: false, error: 'パスを開けませんでした' };
      }
    } catch (error) {
      console.error(`パスを開く際にエラーが発生しました: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // フォルダをエクスプローラーで開く
  ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
      console.log(`フォルダを開こうとしています: ${folderPath}`);

      // ファイルパスの存在確認
      if (!fs.existsSync(folderPath)) {
        console.error(`指定されたフォルダが存在しません: ${folderPath}`);
        return { success: false, error: '指定されたフォルダが存在しません' };
      }

      // OSに応じてフォルダを開く
      let result = await shell.openPath(folderPath);
      if (result === '') {
        console.log(`フォルダを正常に開きました: ${folderPath}`);
        return { success: true };
      } else {
        console.error(`フォルダを開けませんでした: ${folderPath}, エラー: ${result}`);
        return { success: false, error: result };
      }
    } catch (error) {
      console.error(`フォルダを開く際にエラーが発生しました: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // セットされたインターバルを追跡する
  const projectIntervals = new Map();

  // HTMLファイルを定期的にスキャンする
  async function startPeriodicScan(projectId, projectPath, ignoreInitialScan = false) {
    if (projectIntervals.has(projectId)) {
      console.log(`ID ${projectId} の定期的なスキャンは既に実行中です`);
      return;
    }

    console.log(`プロジェクト ${projectId} の定期的スキャンを開始します`);

    // 初回スキャン（必要に応じてスキップ可能）
    if (!ignoreInitialScan) {
      try {
        await scanForNewFiles(projectId, projectPath);
        console.log('初期ファイルスキャンが完了しました');
      } catch (error) {
        console.error('初期ファイルスキャンエラー:', error);
      }
    }

    // 2分ごとにスキャン（以前は30秒）
    const intervalId = setInterval(async () => {
      try {
        await scanForNewFiles(projectId, projectPath);
      } catch (error) {
        console.error(`定期的なファイルスキャンエラー(プロジェクトID: ${projectId}):`, error);
      }
    }, 120000); // 2分ごとに実行(120,000ミリ秒)

    // インターバルIDを記録
    projectIntervals.set(projectId, intervalId);
    console.log(`プロジェクト ${projectId} の定期的なスキャンをセットアップしました(2分間隔)`);
  }
}

// ファイル内容をJSONデータに同期
async function syncFileToJson(projectId, filePath, fileType) {
  try {
    // サポートするファイルタイプとJSONのセクション名のマッピング
    const fileTypeToSection = {
      'html': 'htmlContents',
      'css': 'cssContents',
      'scss': 'scssContents',
      'js': 'jsContents',
      'json': 'jsonContents',
      'md': 'mdContents',
      'txt': 'txtContents'
    };

    // ファイルタイプからセクションを判定
    const section = fileTypeToSection[fileType];
    if (!section) {
      console.log(`未対応のファイルタイプ: ${fileType}`);
      return false; // 未対応のファイルタイプ
    }

    // ファイル内容を読み込む
    const content = await fs.promises.readFile(filePath, 'utf8');
    const fileName = path.basename(filePath);
    console.log(`ファイル内容をJSONに同期します: ${fileName} (${fileType} -> ${section})`);

    // 現在のデータを読み込む
    const currentData = await loadProjectData(projectId, section) || {};

    // ファイルデータを更新
    currentData[fileName] = content;

    // 更新したデータを保存
    await saveProjectData(projectId, section, currentData);
    console.log(`ファイル内容をJSONに同期しました: ${fileName} (${section})`);

    // HTML/SCSSファイルの場合は追加でファイルリストも更新
    if (fileType === 'html' || fileType === 'scss') {
      const listSection = fileType === 'html' ? 'htmlFiles' : 'scssFiles';
      const listData = await loadProjectData(projectId, listSection) || [];
      console.log(`ファイルリストを更新します: ${fileName} (${listSection})`);

      // 既にリストにあるかチェック
      if (!listData.some(file => file.name === fileName)) {
        // 新規ファイルの場合は追加
        listData.push({
          id: uuidv4(),
          name: fileName,
          status: '保存済',
          lastModified: new Date().toISOString()
        });

        // リストを保存
        await saveProjectData(projectId, listSection, listData);
        console.log(`ファイルリストを更新しました: ${fileName} (${listSection})`);
      } else {
        console.log(`ファイルは既にリストに存在します: ${fileName} (${listSection})`);
      }
    }

    return true;
  } catch (error) {
    console.error('ファイル同期に失敗:', error);
    return false;
  }
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
