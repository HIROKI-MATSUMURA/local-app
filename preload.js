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
      'rename-file',  // 'rename-file' を追加
      'generate-code',  // 'generate-code' を追加
      'save-api-key',    // 'save-api-key' を追加
      'extract-colors-from-image'  // 画像から色を抽出するチャンネル
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
      'file-rename-error', // 'file-rename-error' を追加
      'api-key-saved',  // 'api-key-saved' を追加
      'extract-colors-response'  // 色抽出結果を受け取るチャンネル
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

  // AIコード生成機能を呼び出す
  generateCode: async (params) => {
    try {
      // paramsが文字列の場合、古い形式の呼び出しとみなし、互換性のために変換
      if (typeof params === 'string') {
        const prompt = params;
        const uploadedImage = arguments[1];
        return await ipcRenderer.invoke('generate-code', { prompt, uploadedImage });
      }
      // 新しい形式の呼び出し（オブジェクト形式）
      return await ipcRenderer.invoke('generate-code', params);
    } catch (error) {
      console.error('Error generating code:', error);
      throw error;
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

  // 新しいHTMLファイルが生成された際に受信する
  onNewHtmlFile: (callback) => {
    ipcRenderer.on('new-html-file', (event, fileName) => {
      callback(fileName);  // 新しいHTMLファイルの名前を返す
    });
  },

  // ファイル削除時の通知を受け取る
  onFileDeleted: (callback) => {
    ipcRenderer.on('file-deleted', (event, fileName) => {
      callback(fileName);  // 削除されたファイル名を返す
    });
  },

  // 新しいHTMLファイルが生成されたときに通知を受ける
  onNewHtmlFile: (callback) => {
    ipcRenderer.on('new-html-file', (event, fileName) => {
      callback(fileName);
    });
  },

  // APIキー関連の機能
  saveApiKey: (apiData) => {
    // apiDataがオブジェクトでない場合は単純なapiKeyとして扱う（後方互換性のため）
    if (typeof apiData === 'string') {
      ipcRenderer.send('save-api-key', { apiKey: apiData });
    } else {
      ipcRenderer.send('save-api-key', apiData);
    }
  },

  getApiKey: async () => {
    try {
      return await ipcRenderer.invoke('get-api-key');
    } catch (error) {
      console.error('Error getting API key:', error);
      return null;
    }
  },

  // AI生成コードを保存する関数
  saveAIGeneratedCode: async (scssCode, htmlCode, blockName, targetHtmlFile) => {
    try {
      return await ipcRenderer.invoke('save-ai-generated-code', {
        scssCode,
        htmlCode,
        blockName,
        targetHtmlFile
      });
    } catch (error) {
      console.error('AI生成コードの保存中にエラーが発生しました:', error);
      throw error;
    }
  },

  // リネームして保存する関数
  renameAndSaveAICode: async (scssCode, htmlCode, originalBlockName, newScssBlockName, newHtmlBlockName, targetHtmlFile) => {
    try {
      return await ipcRenderer.invoke('rename-and-save-ai-code', {
        scssCode,
        htmlCode,
        originalBlockName,
        newScssBlockName,
        newHtmlBlockName,
        targetHtmlFile
      });
    } catch (error) {
      console.error('リネームして保存中にエラーが発生しました:', error);
      throw error;
    }
  },

  // HTMLファイル一覧を取得する関数
  getHtmlFiles: async () => {
    try {
      return await ipcRenderer.invoke('get-html-files');
    } catch (error) {
      console.error('HTMLファイル一覧の取得中にエラーが発生しました:', error);
      return [];
    }
  },

  // ファイルが存在するかチェックする関数
  checkFileExists: async (blockName) => {
    try {
      return await ipcRenderer.invoke('check-file-exists', blockName);
    } catch (error) {
      console.error('ファイル存在チェック中にエラーが発生しました:', error);
      return { fileExists: { scss: false, html: false }, error: error.message };
    }
  },
});
