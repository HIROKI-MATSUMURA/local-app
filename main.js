const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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

app.on('ready', () => {
  const express = require('express');
  const server = express();

  // Content-Security-Policy ヘッダーの設定
  server.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline';"
    );
    next();
  });

  server.use(express.static(path.join(__dirname, 'src')));

  server.get('/renderer.jsx', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'src/electron/renderer.jsx'));
  });

  server.listen(3000, () => {
    console.log('サーバーが起動しました: http://localhost:3000');
  });

  // メインウィンドウの作成
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL('http://localhost:3000/electron/index.html');

  // 開発ツールを開く（開発時のみ推奨）
  mainWindow.webContents.openDevTools();

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
    const breakpointsContent = breakpoints && breakpoints.length > 0
      ? `$breakpoints: (\n  ${breakpoints
        .map(bp => `${bp.name}: ${bp.value}px`)
        .join(',\n  ')}\n);`
      : '';

    // 新しい内容でstyle.scssを更新
    const newContent = `${breakpointsContent}\n${content}`;

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

  // OpenAI APIキーの取得
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  ipcMain.handle("generate-code", async (event, { prompt, uploadedImage }) => {
    try {
      // OpenAIリクエストを送信
      const response = await axios.post(
        "https://api.openai.com/v1/completions",
        {
          model: "text-davinci-003",
          prompt,
          max_tokens: 500,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
        }
      );

      const generatedCode = response.data.choices[0].text.trim();

      // 必要に応じて画像と関連付ける処理
      if (uploadedImage) {
        const savePath = path.join(__dirname, "uploads", uploadedImage.name);
        fs.copyFileSync(uploadedImage.path, savePath);
      }

      return { generatedCode };
    } catch (error) {
      console.error("Error generating code:", error);
      throw error;
    }
  });
});

// アプリ終了時の処理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
