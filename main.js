const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { session } = require('electron');

// 開発環境かどうかを判定
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;

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
        if (!err) {
          mainWindow.webContents.send('file-updated', { file, content: data });
        }
      });
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

  // 画像から色を抽出するハンドラ
  ipcMain.on('extract-colors-from-image', async (event, { apiKey, prompt, imageData }) => {
    try {
      console.log("extract-colors-from-image ハンドラが呼び出されました");
      console.log("プロンプト長:", prompt.length);
      console.log("画像データ長:", imageData.length);

      if (!apiKey) {
        console.log("APIキーが設定されていません");
        event.reply('extract-colors-response', {
          error: 'APIキーが設定されていません。API設定から必要なAPIキーを設定してください。'
        });
        return;
      }

      // 画像サイズチェック（base64データの長さから概算）
      const estimatedSizeInBytes = Math.ceil((imageData.length * 3) / 4);
      const estimatedSizeInMB = (estimatedSizeInBytes / (1024 * 1024)).toFixed(2);
      console.log(`推定画像サイズ: 約${estimatedSizeInMB}MB`);

      // 5MBを超える場合はエラーを返す
      const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
      if (estimatedSizeInBytes > MAX_SIZE_BYTES) {
        console.log(`画像サイズが大きすぎます: ${estimatedSizeInMB}MB > 5MB`);
        event.reply('extract-colors-response', {
          error: `画像サイズが制限を超えています（${estimatedSizeInMB}MB > 5MB）。画像を小さくしてから再試行してください。`
        });
        return;
      }

      // 画像処理
      let base64Image = imageData;
      let media_type = 'image/jpeg'; // デフォルト
      let base64Data = '';

      // データURLの形式を確認してメディアタイプを適切に設定
      const dataUrlMatch = base64Image.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUrlMatch) {
        media_type = dataUrlMatch[1]; // 実際のMIMEタイプ
        base64Data = dataUrlMatch[2]; // base64データ部分
        console.log(`データURLから検出されたメディアタイプ: ${media_type}`);
      } else {
        // データURLでない場合はそのまま使用
        base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        console.log(`標準的なデータURL形式ではありません。メディアタイプ: ${media_type} を使用します`);
      }

      console.log("API リクエスト送信中...");
      console.log("APIキー長:", apiKey.length > 0 ? apiKey.length : "設定なし");
      console.log("使用モデル: claude-3-opus-20240229");
      console.log("メディアタイプ:", media_type);

      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: "claude-3-opus-20240229",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: media_type,
                  data: base64Data
                }
              }
            ]
          }
        ]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      });

      if (!response.data || !response.data.content || response.data.content.length === 0) {
        throw new Error("API からのレスポンスが不正です");
      }

      // レスポンスからテキスト部分を抽出
      const textContents = response.data.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');

      console.log("色抽出完了 (テキスト長: " + textContents.length + ")");
      console.log("テキストのサンプル:", textContents.substring(0, 200) + "...");

      // レスポンスをレンダラープロセスに送信
      event.reply('extract-colors-response', { content: textContents });

    } catch (error) {
      console.error("色抽出API呼び出しエラー:", error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : error.message);

      // エラーメッセージの詳細を整形
      let errorMessage = "API呼び出しエラー: ";
      if (error.response) {
        errorMessage += error.response.status + " - ";
        if (error.response.data && error.response.data.error) {
          errorMessage += error.response.data.error.message || JSON.stringify(error.response.data);
        } else {
          errorMessage += JSON.stringify(error.response.data);
        }
      } else {
        errorMessage += error.message;
      }

      // エラーをレンダラープロセスに送信
      event.reply('extract-colors-response', { error: errorMessage });
    }
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

  // AI コード生成ハンドラ
  ipcMain.handle("generate-code", async (event, { prompt, uploadedImage }) => {
    try {
      console.log("generate-code ハンドラが呼び出されました");
      console.log("受け取ったプロンプト:", prompt?.substring(0, 100) + "...");
      console.log("受け取った画像情報:", uploadedImage ? uploadedImage.name : "なし");

      // APIキーと選択されたプロバイダを取得
      const { openaiKey, claudeKey, selectedProvider } = getApiKey();

      // 選択されたプロバイダに基づいてAPIキーを選択
      const apiKey = selectedProvider === 'openai' ? openaiKey : claudeKey;

      if (!apiKey) {
        throw new Error(`選択されたプロバイダ(${selectedProvider})のAPIキーが設定されていません。API設定から必要なAPIキーを設定してください。`);
      }

      // 画像処理
      let base64Image = null;
      let imageMediaType = 'image/jpeg'; // デフォルト

      if (uploadedImage && uploadedImage.data) {
        // アップロードされた画像のメディアタイプを取得（デフォルトはJPEG）
        imageMediaType = uploadedImage.mimeType || 'image/jpeg';
        console.log(`アップロード画像のメディアタイプ: ${imageMediaType}`);

        // base64データからプレフィックスを削除（必要に応じて）
        base64Image = uploadedImage.data.includes('base64,')
          ? uploadedImage.data
          : `data:${imageMediaType};base64,${uploadedImage.data}`;
      }

      // OpenAI APIを呼び出す場合
      if (selectedProvider === 'openai') {
        const requestBody = {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "あなたは、HTMLとCSSを専門とする優れたフロントエンドエンジニアです。与えられた画像をできる限り正確に分析し、デザインカンプを忠実に再現するHTMLとSCSSコードを生成してください。"
            }
          ],
          max_tokens: 4000,
          temperature: 0.5
        };

        // プロンプトとオプションの画像を追加
        if (base64Image) {
          requestBody.messages.push({
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: base64Image,
                  detail: "high" // 高解像度の画像分析を要求
                }
              }
            ]
          });
        } else {
          requestBody.messages.push({
            role: "user",
            content: prompt
          });
        }

        console.log("OpenAI APIにリクエストを送信中...");
        const response = await axios.post("https://api.openai.com/v1/chat/completions", requestBody, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
          throw new Error("APIからのレスポンスが不正です");
        }

        const generatedCode = response.data.choices[0].message.content;
        console.log("APIからのレスポンスを受信しました");

        return { generatedCode };
      }
      // Anthropic Claude APIを呼び出す場合
      else if (selectedProvider === 'claude') {
        console.log("Claude APIのリクエストを準備中...");

        // Claude APIのメッセージ形式
        let messageContent = [];

        // テキストを追加
        messageContent.push({
          type: "text",
          text: prompt
        });

        // 画像があれば追加
        if (base64Image) {
          try {
            // データURLの形式を確認してメディアタイプを適切に設定
            let media_type = imageMediaType; // アップロードされたメディアタイプを尊重
            let base64Data = "";

            // データURLから正しいMIMEタイプとbase64データを抽出
            const dataUrlMatch = base64Image.match(/^data:([^;]+);base64,(.+)$/);
            if (dataUrlMatch) {
              media_type = dataUrlMatch[1]; // 実際のMIMEタイプ
              base64Data = dataUrlMatch[2]; // base64データ部分
              console.log(`データURLから検出されたメディアタイプ: ${media_type}`);
            } else {
              // データURLでない場合はそのまま使用
              base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
              console.log(`標準的なデータURL形式ではありません。メディアタイプ: ${media_type} を使用します`);
            }

            // 画像データのサイズ確認
            const imageSizeInMB = (base64Data.length * 3 / 4) / (1024 * 1024);
            console.log(`画像データサイズ: 約${imageSizeInMB.toFixed(2)}MB, メディアタイプ: ${media_type}`);

            // サイズ制限チェック - Claude APIは最大10MBまで
            if (imageSizeInMB > 9) {  // 安全マージンとして9MBに制限
              console.log("画像サイズが大きすぎるため、エラーを回避するために一部を切り詰めます");
              // 画像データを切り詰める (約9MBに制限)
              const maxLength = 9 * 1024 * 1024 * 4 / 3;
              base64Data = base64Data.substring(0, maxLength);
              console.log(`画像データを切り詰めました: 新サイズ 約9MB`);
            }

            console.log(`画像データを追加します（長さ: ${base64Data.length}文字, メディアタイプ: ${media_type}）`);

            // メディアタイプがClaude APIでサポートされているか確認
            // Claudeは image/jpeg, image/png, image/gif, image/webp をサポート
            if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(media_type)) {
              console.log(`警告: ${media_type} はClaude APIで明示的にサポートされていません。image/jpeg に変換します`);
              // サポートされていない場合はJPEGとして処理
              media_type = "image/jpeg";
            }

            messageContent.push({
              type: "image",
              source: {
                type: "base64",
                media_type: media_type,
                data: base64Data
              }
            });
          } catch (imgError) {
            console.error("画像データの処理中にエラーが発生しました:", imgError);
          }
        }

        // 最新のAPIバージョンを使用
        const anthropicVersion = "2023-06-01";

        // 利用可能なClaudeモデルを選択
        // claude-3-opus-20240229 (最高品質)、claude-3-sonnet-20240229 (バランス)
        // claude-3-haiku-20240307 (高速)、claude-3-5-sonnet-20240620 (最新)
        // claude-3-5-haiku-20241022 (高速・低コスト)
        const claudeModel = "claude-3-5-haiku-20241022";

        const requestBody = {
          model: claudeModel,
          max_tokens: 4000,
          temperature: 0.5,
          messages: [
            {
              role: "user",
              content: messageContent
            }
          ]
        };

        console.log(`Claude API（${claudeModel}）リクエストを準備完了`);

        console.log("Claude APIにリクエストを送信中...");
        try {
          const response = await axios.post("https://api.anthropic.com/v1/messages", requestBody, {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": anthropicVersion
            }
          });

          console.log("Claude APIからレスポンスを受信しました:",
            response.status,
            response.data ? "データあり" : "データなし"
          );

          if (!response.data || !response.data.content || response.data.content.length === 0) {
            throw new Error("Claude APIからのレスポンスが不正です");
          }

          // Claudeのレスポンスからテキスト部分を抽出
          const textContents = response.data.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n');

          console.log("Claude APIからのテキスト抽出完了（長さ: " + textContents.length + "）");

          return { generatedCode: textContents };
        } catch (apiError) {
          console.error("Claude API呼び出しエラー:", apiError.response ? {
            status: apiError.response.status,
            statusText: apiError.response.statusText,
            data: apiError.response.data
          } : apiError.message);

          // エラーメッセージの詳細を整形
          let errorMessage = "Claude API呼び出しエラー: ";
          if (apiError.response) {
            errorMessage += apiError.response.status + " - ";
            if (apiError.response.data && apiError.response.data.error) {
              errorMessage += apiError.response.data.error.message || JSON.stringify(apiError.response.data);
            } else {
              errorMessage += JSON.stringify(apiError.response.data);
            }
          } else {
            errorMessage += apiError.message;
          }

          throw new Error(errorMessage);
        }
      } else {
        throw new Error("サポートされていないAPIプロバイダが選択されています");
      }
    } catch (error) {
      console.error("Error generating code:", error);
      throw error;
    }
  });

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

  return mainWindow;
}

app.on('ready', async () => {
  // セッション設定を保持するための設定
  const ses = session.defaultSession;
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Accept-Language'] = 'ja';
    callback({ requestHeaders: details.requestHeaders });
  });

  mainWindow = createMainWindow();

  // ファイル監視対象
  const watchFiles = [
    path.join(__dirname, 'src/scss/base/_reset.scss'),
    path.join(__dirname, 'src/scss/global/_breakpoints.scss'),
  ];

  // ファイルの監視処理
  watchFiles.forEach((file) => {
    fs.watchFile(file, (curr, prev) => {
      fs.readFile(file, 'utf8', (err, data) => {
        if (!err) {
          mainWindow.webContents.send('file-updated', { file, content: data });
        }
      });
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
});

// Macでアプリケーションが閉じられる際の処理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Macでアプリケーションがアクティブになった際の処理
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
