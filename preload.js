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
        // リロードを防止する特殊なフラグをチェック
        if (window.__electronAppPreventingReload) {
          console.log('Preload: ファイル更新通知を抑制しました（リロード防止中）');
          return;
        }
        callback(data); // ファイルデータをコールバックで返す
      } else {
        console.warn('Preload: Ignored incomplete file update data', data);
      }
    });
  },

  // ファイル変更を監視（HTML変更など）
  onFileChanged: (callback) => {
    // 既存のリスナーを削除するためのIDを保存
    const listenerId = `fileChanged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // グローバルなリスナー管理オブジェクトを初期化
    if (!window.__electronAppListeners) {
      window.__electronAppListeners = {};
    }

    // グローバルなデバウンスタイマーを初期化
    if (!window.__electronAppGlobalProcessedEvents) {
      window.__electronAppGlobalProcessedEvents = {};
    }

    // より強力なデバウンス - 同一ファイルのイベントは全リスナーで時間単位で共有
    if (!window.__electronAppLastEventTimes) {
      window.__electronAppLastEventTimes = {};
    }

    // グローバルなデバウンスチェック - これにより全てのリスナー間で情報を共有
    const isEventProcessedGlobally = (key) => {
      return !!window.__electronAppGlobalProcessedEvents[key];
    };

    const markEventProcessedGlobally = (key, duration = 1000) => {
      window.__electronAppGlobalProcessedEvents[key] = true;

      // 既存のタイマーをクリア
      if (window.__electronAppGlobalProcessedEvents[`timer_${key}`]) {
        clearTimeout(window.__electronAppGlobalProcessedEvents[`timer_${key}`]);
      }

      // 新しいタイマーを設定
      window.__electronAppGlobalProcessedEvents[`timer_${key}`] = setTimeout(() => {
        delete window.__electronAppGlobalProcessedEvents[key];
        delete window.__electronAppGlobalProcessedEvents[`timer_${key}`];
      }, duration);
    };

    // 処理済みイベント管理用オブジェクトの初期化
    if (!window.__electronAppProcessedEvents) {
      window.__electronAppProcessedEvents = {};
    }

    // 1秒ごとに処理済みイベントをクリア（リセット用タイマー）
    if (!window.__electronAppEventCleanupTimer) {
      window.__electronAppEventCleanupTimer = setInterval(() => {
        window.__electronAppProcessedEvents = {};
      }, 2000); // 2秒ごとにリセット
    }

    // 既存のリスナーをクリーンアップ
    if (window.__electronAppListeners[listenerId]) {
      ipcRenderer.removeListener('file-changed', window.__electronAppListeners[listenerId]);
      delete window.__electronAppListeners[listenerId];
    }

    // 新しいリスナー関数を定義
    const listener = (event, data) => {
      // データが正常かチェック
      if (!data || !data.filename || !data.type) {
        console.log('Preload: 不完全なファイル変更データを無視:', data);
        return;
      }

      console.log('Preload: File changed:', data);

      // リロード防止フラグをチェック
      if (window.__electronAppPreventingReload) {
        console.log('Preload: ファイル変更通知を抑制しました（リロード防止中）');
        return;
      }

      // 同一イベントの重複処理を防止
      const eventKey = `${data.filename}_${data.type}`;
      const fileKey = data.filename;

      // 最後のイベント時間をチェック（ファイル単位）
      const now = Date.now();
      const lastProcessTime = window.__electronAppLastEventTimes[fileKey] || 0;

      // 5秒以内のファイル変更は頻度を制限（異なるタイプでも）
      if (now - lastProcessTime < 5000) {
        console.log(`Preload: ファイル変更を時間制限によりスキップ: ${data.filename} (前回処理から ${now - lastProcessTime}ms)`);

        // グローバルな処理フラグを設定して他のリスナーもブロック
        markEventProcessedGlobally(eventKey, 5000);
        return;
      }

      // グローバルなデバウンスチェック（全てのリスナー間で共有）
      if (isEventProcessedGlobally(eventKey)) {
        console.log(`Preload: ファイル変更イベントをスキップ（グローバルデバウンス中）: ${data.filename}`);
        return;
      }

      // ローカルな処理済みチェック（このリスナー内のみ）
      if (window.__electronAppProcessedEvents[eventKey]) {
        console.log(`Preload: ファイル変更イベントをスキップ（デバウンス中）: ${data.filename}`);
        return;
      }

      // イベントを処理済みとしてマーク（グローバルとローカル両方）
      markEventProcessedGlobally(eventKey, 5000); // 5秒間グローバルにブロック
      window.__electronAppProcessedEvents[eventKey] = true;

      // 最後のイベント時間を更新
      window.__electronAppLastEventTimes[fileKey] = now;

      // このイベントのみをコールバックに渡す
      console.log(`Preload: ファイル変更イベントを処理: ${data.filename}`);

      try {
        callback(data);
      } catch (error) {
        console.error('Preload: コールバック実行中にエラー:', error);
      }
    };

    // リスナーを保存
    window.__electronAppListeners[listenerId] = listener;

    // 新しいリスナーを登録
    ipcRenderer.on('file-changed', listener);

    // リスナーを削除する関数を返す
    return () => {
      if (window.__electronAppListeners && window.__electronAppListeners[listenerId]) {
        ipcRenderer.removeListener('file-changed', window.__electronAppListeners[listenerId]);
        delete window.__electronAppListeners[listenerId];
        console.log(`Preload: Removed file-changed listener ${listenerId}`);
      }
    };
  },

  // リロード防止フラグをセット
  setPreventReload: (value) => {
    console.log(`Preload: リロード防止フラグを${value ? 'オン' : 'オフ'}にしました`);
    if (typeof window !== 'undefined') {
      window.__electronAppPreventingReload = value;

      // リロード防止フラグがオンの場合、追加の対策を適用
      if (value) {
        // 現在のURLを保存
        window.__originalLocation = window.location.href;

        // history APIのpushStateとreplaceStateをオーバーライド
        if (!window.__originalPushState) {
          window.__originalPushState = window.history.pushState;
          window.history.pushState = function () {
            console.log('Preload: pushStateをブロックしました');
            return null;
          };
        }

        if (!window.__originalReplaceState) {
          window.__originalReplaceState = window.history.replaceState;
          window.history.replaceState = function () {
            console.log('Preload: replaceStateをブロックしました');
            return null;
          };
        }
      } else {
        // リロード防止フラグがオフの場合、元の関数を復元
        if (window.__originalPushState) {
          window.history.pushState = window.__originalPushState;
        }

        if (window.__originalReplaceState) {
          window.history.replaceState = window.__originalReplaceState;
        }
      }
    }
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
      // リロード防止フラグをオン
      if (typeof window !== 'undefined') {
        window.__electronAppPreventingReload = true;
        console.log('Preload: AI生成コード保存のためリロード防止フラグをオンにしました');
      }

      const result = await ipcRenderer.invoke('save-ai-generated-code', {
        scssCode, htmlCode, blockName, targetHtmlFile
      });

      // 保存完了後もしばらくリロード防止を維持（ipcの完了後もファイル監視イベントが発生する可能性がある）
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.__electronAppPreventingReload = false;
          console.log('Preload: リロード防止フラグをオフにしました');
        }
      }, 2000);

      return result;
    } catch (error) {
      console.error('AI生成コードの保存中にエラーが発生しました:', error);
      // エラー時はリロード防止フラグをオフ
      if (typeof window !== 'undefined') {
        window.__electronAppPreventingReload = false;
      }
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
