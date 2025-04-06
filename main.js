const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { session } = require('electron');

// ハードコードされたAPIキー
const OPENAI_API_KEY = "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";
const CLAUDE_API_KEY = "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";
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

// 監視するディレクトリ
const htmlDirectory = path.join(__dirname, 'src');
// previousFilesをグローバルに宣言して、前回のファイルリストを保持
let previousFiles = [];

// HTMLファイルの作成を監視する
function watchDirectory() {
  fs.readdir(htmlDirectory, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }

    const htmlFiles = files.filter(file => file.endsWith('.html'));
    // 新しいファイルを検出
    const newFiles = htmlFiles.filter(file => !previousFiles.includes(file));

    // 新規ファイルのみを処理
    newFiles.forEach(fileName => {
      console.log(`Detected new HTML file: ${fileName}`);
      // フロントエンドに新しいHTMLファイルを通知
      mainWindow.webContents.send('new-html-file', fileName);
    });

    // 今回のファイルリストを保存
    previousFiles = htmlFiles;
  });
}

// 監視を1秒ごとにチェック
setInterval(watchDirectory, 1000); // 定期的にディレクトリの内容をチェック

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
    splashWindow = null;
  });
}

// メインウィンドウ作成関数
function createMainWindow() {
  // uploadsディレクトリを作成
  const uploadsDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at: ${uploadsDir}`);
  }

  const express = require('express');
  const server = express();

  // MIMEタイプの設定
  express.static.mime.define({ 'application/javascript': ['js', 'jsx'] });

  // Content-Security-Policy ヘッダーの設定
  server.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://unpkg.com https://cdn.jsdelivr.net; worker-src 'self' blob: https://unpkg.com; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://localhost:* https://api.anthropic.com https://api.openai.com https://unpkg.com https://fonts.googleapis.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com;"
    );
    next();
  });

  // JSXファイルのMIMEタイプを設定するミドルウェア
  server.use((req, res, next) => {
    if (req.path.endsWith('.jsx')) {
      res.type('application/javascript');
    }
    next();
  });

  server.use(express.static(path.join(__dirname, 'src')));

  // JSXファイルのMIMEタイプを適切に設定
  server.get('*.jsx', (req, res, next) => {
    res.setHeader('Content-Type', 'application/javascript');
    next();
  });

  server.get('/renderer.jsx', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'src/electron/renderer.jsx'));
  });

  server.get('/electron/renderer.jsx', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'src/electron/renderer.jsx'));
  });

  // コンポーネントのJSXファイルを処理
  server.get('/electron/components/*.jsx', (req, res) => {
    const componentPath = req.path.replace('/electron/components/', '');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'src/electron/components', componentPath));
  });

  server.get('/renderer.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    // Reactやその他のJSXトランスパイラがブラウザ側で処理できるように変換
    const jsxFilePath = path.join(__dirname, 'src/electron/renderer.jsx');
    fs.readFile(jsxFilePath, 'utf8', (err, data) => {
      if (err) {
        res.status(500).send(`Error reading file: ${err.message}`);
        return;
      }
      res.send(data);
    });
  });

  server.listen(3000, () => {
    console.log('サーバーが起動しました: http://localhost:3000');
  });

  // メインウィンドウの作成
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#f5f5f5',
    show: false,
    title: 'CreAIte Code',
  });

  // 準備ができたら表示（スプラッシュ画面のようなちらつきを防止）
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // スプラッシュウィンドウがあれば閉じる
    if (splashWindow) {
      splashWindow.close();
    }
  });

  // 開発モードなら開発サーバーのURLを、そうでなければローカルのHTMLファイルを読み込む
  if (isDevelopment) {
    mainWindow.loadURL('http://localhost:3000/electron/index.html');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/electron/index.html'));
  }

  // リロードイベントをハンドリング
  mainWindow.webContents.on('did-finish-load', () => {
    // webContents APIを使ってリロード後も正しく動作するようにする
    mainWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['*://*/*'] },
      (details, callback) => {
        // リロードやナビゲーションをハンドリング
        if (details.url.includes('index.html') && details.method === 'GET' && details.resourceType === 'mainFrame') {
          console.log('メインフレームがリロードされました:', details.url);
        }
        // リクエストをブロックせずに続行する
        callback({ cancel: false });
      }
    );
  });

  // Cmd+Rが押された時の処理（macOS）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.meta && input.key === 'r') || (input.control && input.key === 'r')) {
      console.log('リロードコマンドを検出しました');

      // デフォルトのリロード動作を防止
      event.preventDefault();

      // 手動で正しいリロードを実行
      if (isDevelopment) {
        mainWindow.loadURL('http://localhost:3000/electron/index.html');
      } else {
        mainWindow.loadFile(path.join(__dirname, 'dist/electron/index.html'));
      }
    }
  });

  // リロード時に白画面になる問題の対応
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log('ページの読み込みに失敗しました:', errorCode, errorDescription);

    // リロードを試みる
    if (isDevelopment) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('ページを再度読み込みます...');
          mainWindow.loadURL('http://localhost:3000/electron/index.html');
        }
      }, 1000);
    } else {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('ページを再度読み込みます...');
          mainWindow.loadFile(path.join(__dirname, 'dist/electron/index.html'));
        }
      }, 1000);
    }
  });

  // 開発ツールを開く
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }

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

  return mainWindow;
}

// アプリの起動が完了したら
app.whenReady().then(() => {
  // セッション設定を保持するための設定
  const ses = session.defaultSession;
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Accept-Language'] = 'ja';
    callback({ requestHeaders: details.requestHeaders });
  });

  // 最初にIPC ハンドラーを設定（レンダラープロセスのロード前に実行）
  console.log('アプリ起動時にIPCハンドラーを設定します');
  setupIPCHandlers();

  // まずスプラッシュ画面を表示
  createSplashWindow();

  // 少し遅延させてからメインウィンドウを作成
  setTimeout(() => {
    createMainWindow();

    // ウィンドウ状態を保存
    mainWindow.on('close', (e) => {
      const windowState = {
        bounds: mainWindow.getBounds()
      };
      // 状態をファイルに保存
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'window-state.json'),
        JSON.stringify(windowState)
      );
    });
  }, 1000);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
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
});

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

      // SCSSファイルパスの作成
      const scssFilePath = path.join(scssDir, `_${blockName}.scss`);

      // HTMLパーツファイルパスの作成
      const htmlPartsFilePath = path.join(htmlPartsDir, `${blockName}.html`);

      // ファイル名の衝突チェック
      const fileExists = {
        scss: fs.existsSync(scssFilePath),
        html: fs.existsSync(htmlPartsFilePath)
      };

      console.log('ファイル存在チェック結果:', fileExists);
      return {
        exists: fileExists.scss || fileExists.html,
        fileExists
      };
    } catch (error) {
      console.error('ファイル存在確認中にエラーが発生しました:', error);
      return { exists: false, fileExists: { scss: false, html: false } };
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
          }
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

      // 既存ファイルがある場合の処理
      if (fileExists.scss || fileExists.html) {
        console.log('ファイルが既に存在します:', { scssFileName, htmlFileName });
        return {
          success: false,
          error: `ファイルが既に存在します: ${fileExists.scss ? scssFileName : ''} ${fileExists.html ? htmlFileName : ''}`,
          needsRename: true,
          fileExists
        };
      }

      // SCSSファイルの保存
      const scssContent = `@use "../../global" as *;\n\n${scssCode}`;

      await fs.promises.writeFile(scssFilePath, scssContent, 'utf8');
      console.log(`SCSSファイルを保存しました: ${scssFilePath}`);

      // HTMLパーツファイルの保存（HTMLコードがある場合のみ）
      if (htmlCode) {
        await fs.promises.writeFile(htmlPartsFilePath, htmlCode, 'utf8');
        console.log(`HTMLパーツファイルを保存しました: ${htmlPartsFilePath}`);

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
              return { success: false, error: 'ターゲットHTMLファイルに</main>タグが見つかりません' };
            }
          } else {
            console.log(`対象HTMLファイルが存在しません: ${targetFilePath}`);
            return { success: false, error: 'ターゲットHTMLファイルが存在しません' };
          }
        }
      }

      return {
        success: true,
        savedFiles: {
          scss: scssFileName,
          html: htmlCode ? htmlFileName : null
        }
      };
    } catch (error) {
      console.error('AI生成コードの保存中にエラーが発生しました:', error);
      return { success: false, error: error.message };
    }
  };

  // AI生成コードの保存機能
  ipcMain.handle('save-ai-generated-code', async (event, params) => {
    console.log('save-ai-generated-code ハンドラーが呼び出されました');
    return await saveAIGeneratedCode(params);
  });

  // 既に存在するブロック名のリネーム処理
  ipcMain.handle('rename-and-save-ai-code', async (event, { scssCode, htmlCode, originalBlockName, newBlockName, targetHtmlFile }) => {
    try {
      console.log('rename-and-save-ai-code ハンドラーが呼び出されました:', { originalBlockName, newBlockName });
      return await saveAIGeneratedCode({
        scssCode,
        htmlCode,
        blockName: newBlockName,
        targetHtmlFile
      });
    } catch (error) {
      console.error('リネームして保存中にエラーが発生しました:', error);
      return { success: false, error: error.message };
    }
  });
}

// Macでアプリケーションが閉じられる際の処理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
