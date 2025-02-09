const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // メインプロセスにデータを送信
  send: (channel, data) => {
    const validChannels = [
      'generate-structure',
      'save-scss-file',
      'save-variables',
      'save-page',
      'save-html-file',
      'delete-html-file',  // 'delete-html-file' を追加
      'rename-file'  // 'rename-file' を追加
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.warn(`Preload: Ignored invalid channel ${channel}`);
    }
  },

  // メインプロセスからのデータを受信
  receive: (channel, func) => {
    const validChannels = [
      'log-change',
      'structure-generated',
      'structure-change-cancelled',
      'file-updated',
      'file-deleted',  // 'file-deleted' を追加
      'file-renamed', // 'file-renamed' を追加
      'file-rename-error' // 'file-rename-error' を追加
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel); // 古いリスナーを削除
      ipcRenderer.on(channel, (event, ...args) => {
        const data = args[0];
        console.log(`Preload: Received ${channel} with args:`, data);

        // データ検証
        if (data) {
          func(data); // データが完全な場合のみ関数を呼び出す
        } else {
          console.warn(`Preload: Ignored incomplete data for ${channel}`, data);
        }
      });
    } else {
      console.warn(`Preload: Ignored invalid channel ${channel}`);
    }
  },

  // ファイル削除処理
  deleteHtmlFile: (fileName) => {
    ipcRenderer.send('delete-html-file', { fileName }); // メインプロセスに送信
  },

  // ファイル名変更をメインプロセスに送信
  renameFile: (oldFileName, newFileName) => {
    ipcRenderer.send('rename-file', { oldFileName, newFileName });
  },

  // ファイル名変更成功時の受信
  onFileRenamed: (callback) => {
    ipcRenderer.on('file-renamed', (event, data) => {
      callback(data); // 成功した場合、UIに反映するためにコールバックを呼び出す
    });
  },

  // ファイル名変更エラー時の受信
  onFileRenameError: (callback) => {
    ipcRenderer.on('file-rename-error', (event, errorMessage) => {
      callback(errorMessage); // エラーメッセージをUIに表示
    });
  },

  // ファイルの更新を監視
  onFileUpdate: (callback) => {
    ipcRenderer.on('file-updated', (event, data) => {
      console.log('Preload: File updated:', data);
      if (data && data.file && data.content) {
        callback(data); // ファイルデータをコールバックで返す
      } else {
        console.warn('Preload: Ignored incomplete file update data', data);
      }
    });
  },

  // ファイル保存処理
  saveScssFile: (filePath, content) => {
    if (filePath && content) {
      ipcRenderer.send('save-scss-file', { filePath, content });
      console.log('Preload: Sent save-scss-file with data:', { filePath, content });
    } else {
      console.warn('Preload: Ignored invalid save-scss-file data', { filePath, content });
    }
  },

  // HTMLファイル保存用の関数
  saveHtmlFile: (fileData) => {
    ipcRenderer.send('save-html-file', fileData); // メインプロセスに送信
  },

  // ファイルの内容をリクエストする
  requestFileContent: (filePath) => {
    ipcRenderer.send('request-file-content', filePath); // ファイルの内容をリクエスト
  },

  // 変数を保存するための関数
  saveVariables: (variables) => {
    ipcRenderer.send('save-variables', variables); // メインプロセスに送信
  },

  // ページ保存用の関数
  savePage: (pageData) => {
    console.log('Saving page:', pageData);  // デバッグ用
    ipcRenderer.send('save-page', pageData); // メインプロセスにページデータを送信
  },
});
