const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

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

  //変数管理
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

  // 変更されたファイル名を受け取るリスナー
  ipcMain.on('rename-file', (event, { oldFileName, newFileName }) => {
    const oldPath = path.join(__dirname, 'src', oldFileName);
    const newPath = path.join(__dirname, 'src', newFileName);

    // ファイル名を変更
    fs.rename(oldPath, newPath, (err) => {
      if (err) {
        console.error('Error renaming file:', err);
        event.reply('rename-file-error', err);
      } else {
        console.log(`Successfully renamed file: ${oldFileName} to ${newFileName}`);
        // 変更が成功した場合、成功メッセージを送信
        event.reply('rename-file-success', { oldFileName, newFileName });
      }
    });
  });

  /// ファイル保存処理のリスナー
  ipcMain.on('save-html-file', (event, fileData) => {
    const { filePath, content } = fileData;

    if (filePath && content) {
      // ファイルを保存するための処理
      fs.writeFile(filePath, content, 'utf8', (err) => {
        if (err) {
          console.error('Error occurred while saving file:', err);
          event.reply('save-html-file-error', err);
        } else {
          console.log(`Successfully saved file at: ${filePath}`);
          event.reply('save-html-file-success', filePath);
        }
      });
    } else {
      console.error('Invalid file data received');
      event.reply('save-html-file-error', 'Invalid file data');
    }
  });

  // HTMLファイル削除処理
  ipcMain.on('delete-html-file', (event, { fileName }) => {
    const filePath = path.join(__dirname, 'src', `${fileName}.html`);

    // ファイルが存在する場合、削除する
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);  // ファイル削除
      console.log(`Successfully deleted file: ${filePath}`);
      event.reply('file-deleted', fileName);  // 削除したファイル名をフロントエンドに通知
    } else {
      console.log(`File not found: ${filePath}`);
    }
  });

  // ファイル名を変更する処理
  ipcMain.on('rename-file', (event, { oldFileName, newFileName }) => {
    const oldFilePath = path.join(__dirname, 'src', `${oldFileName}.html`);
    const newFilePath = path.join(__dirname, 'src', `${newFileName}.html`);

    // ファイル名を変更する
    try {
      fs.renameSync(oldFilePath, newFilePath);
      console.log(`File renamed from ${oldFileName}.html to ${newFileName}.html`);

      // フロントエンドに変更が成功したことを通知
      event.reply('file-renamed', { oldFileName, newFileName });
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

});

// アプリ終了時の処理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
