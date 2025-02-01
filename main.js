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




  // 構造変更リクエストの処理
  ipcMain.on('generate-structure', (event, structureType) => {
    const logTime = new Date().toLocaleString();
    const logMessage = `${structureType}構造に変更されました`;

    // 変更ログを送信
    mainWindow.webContents.send('structure-generated', { time: logTime, message: logMessage });

    const basePath = path.join(__dirname, 'src/scss');
    const bemPaths = ['page', 'module'];
    const objectPath = path.join(basePath, 'object');

    // フォルダ削除
    if (structureType === 'FLOCSS') {
      bemPaths.forEach((dir) => {
        const fullPath = path.join(basePath, dir);
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      });
    } else if (fs.existsSync(objectPath)) {
      fs.rmSync(objectPath, { recursive: true, force: true });
    }

    // フォルダ作成
    if (structureType === 'FLOCSS') {
      const flocssPaths = ['layout', 'component', 'project'].map((dir) =>
        path.join(objectPath, dir)
      );
      if (!fs.existsSync(objectPath)) {
        fs.mkdirSync(objectPath, { recursive: true });
      }
      flocssPaths.forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
    } else {
      bemPaths.forEach((dir) => {
        const fullPath = path.join(basePath, dir);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
      });
    }

    // style.scss更新
    const styleFilePath = path.join(basePath, 'style.scss');
    const commonContent = `@use "./base/*";\n`; // 共通部分
    const flocssContent = `
@use "./object/layout/**/*";
@use "./object/component/**/*";
@use "./object/project/**/*";
`.trim();

    const bemContent = `
@use "./module/**/*";
@use "./page/**/*";
`.trim();

    const newContent =
      commonContent + (structureType === 'FLOCSS' ? flocssContent : bemContent);

    fs.writeFileSync(styleFilePath, newContent, 'utf8');
    console.log(`メインプロセス: style.scssを更新しました (${structureType})`);
  });
});

// アプリ終了時の処理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
