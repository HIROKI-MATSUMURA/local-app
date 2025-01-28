const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // メインプロセスにデータを送信
  send: (channel, data) => {
    const validChannels = ['generate-structure', 'save-scss-file']; // 許可されたチャンネル
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.warn(`Preload: Ignored invalid channel ${channel}`);
    }
  },

  // メインプロセスからのデータを受信
  receive: (channel, func) => {
    const validChannels = ['log-change', 'structure-generated', 'structure-change-cancelled', 'file-updated']; // 許可されたチャンネル
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

  // ファイルを保存
  saveScssFile: (filePath, content) => {
    if (filePath && content) {
      ipcRenderer.send('save-scss-file', { filePath, content });
      console.log('Preload: Sent save-scss-file with data:', { filePath, content });
    } else {
      console.warn('Preload: Ignored invalid save-scss-file data', { filePath, content });
    }
  },

  // ファイルの内容をリクエストする
  requestFileContent: (filePath) => {
    ipcRenderer.send('request-file-content', filePath); // ファイルの内容をリクエスト
  },
});
