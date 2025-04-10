// シンプルなpreload.jsの実装
// Node.js環境でない場合も考慮したエラーハンドリング付き
try {
  // Electronモジュールを読み込み
  const { contextBridge, ipcRenderer } = require('electron');
  const path = require('path');
  const fs = require('fs');
  const fsPromises = fs.promises;

  // APIをウェブコンテンツに公開
  contextBridge.exposeInMainWorld('api', {
    // IPC通信
    send: (channel, data) => {
      // 許可されたチャンネルのみ
      const validChannels = [
        'toMain',
        'saveFile',
        'openFile',
        'generateCode',
        'save-html-file',
        'save-scss-file',
        'delete-html-file',
        'rename-file',
        'save-ai-generated-code',
        'rename-and-save-ai-code',
        'switch-tab'
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      } else {
        console.warn(`チャンネル "${channel}" は許可されていません`);
      }
    },
    receive: (channel, func) => {
      // 許可されたチャンネルのみ
      const validChannels = [
        'fromMain',
        'fileData',
        'codeGenerated',
        'file-updated',
        'new-html-file',
        'file-changed',
        'file-deleted',
        'tab-switched'
      ];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      } else {
        console.warn(`チャンネル "${channel}" は許可されていません`);
      }
    },
    // HTMLファイル一覧を取得する関数
    getHtmlFiles: () => ipcRenderer.invoke('get-html-files'),
    // イベントリスナー登録関数
    onNewHtmlFile: (callback) => {
      ipcRenderer.on('new-html-file', (event, fileName) => {
        callback(fileName);
      });
    },
    onFileDeleted: (callback) => {
      ipcRenderer.on('file-deleted', (event, data) => {
        try {
          // シリアライズ可能なオブジェクトに変換
          const safeData = JSON.parse(JSON.stringify(data));
          console.log('ファイル削除イベントを受信:', safeData);
          callback(safeData);
        } catch (error) {
          console.error('ファイル削除イベント処理エラー:', error);
          // 最低限のデータでコールバック
          callback({ fileName: data.fileName || 'unknown' });
        }
      });
    },
    onFileChanged: (callback) => {
      ipcRenderer.on('file-changed', (event, data) => {
        try {
          // シリアライズ可能なオブジェクトに変換
          const safeData = JSON.parse(JSON.stringify(data));

          // 削除イベントの場合は特別に詳細ログを出力
          if (safeData.eventType === 'unlink' || safeData.type === 'unlink') {
            console.log('ファイル削除イベントを受信:', safeData);
            console.log(`削除されたファイル: ${safeData.fileName}`);
          } else {
            console.log('ファイル変更イベントを受信:', safeData);
          }

          callback(safeData);
        } catch (error) {
          console.error('ファイル変更イベント処理エラー:', error);
          // 最低限のデータでコールバック
          callback({
            eventType: data.eventType || 'unknown',
            fileType: data.fileType || 'unknown',
            fileName: data.fileName || 'unknown',
            timestamp: new Date().toISOString()
          });
        }
      });
    },
    requestFileContent: (filePath) => {
      ipcRenderer.send('request-file-content', filePath);
    },
    // 標準的なファイル操作API
    fs: {
      // ファイル読み込み
      readFile: async (filePath, options = 'utf8') => {
        try {
          const absPath = path.resolve(filePath);
          const data = await fsPromises.readFile(absPath, options);
          return { success: true, data };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
      // ファイル書き込み
      writeFile: async (filePath, data, options = 'utf8') => {
        try {
          const absPath = path.resolve(filePath);
          // ディレクトリが存在しない場合は作成
          const dirname = path.dirname(absPath);
          await fsPromises.mkdir(dirname, { recursive: true });

          await fsPromises.writeFile(absPath, data, options);
          return { success: true, filePath: absPath };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
      // ディレクトリ作成
      mkdir: async (dirPath, options = { recursive: true }) => {
        try {
          const absPath = path.resolve(dirPath);
          await fsPromises.mkdir(absPath, options);
          return { success: true, dirPath: absPath };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
      // ディレクトリ存在確認と作成
      ensureDir: async (dirPath) => {
        try {
          const absPath = path.resolve(dirPath);
          try {
            await fsPromises.access(absPath);
          } catch (error) {
            // ディレクトリが存在しない場合は作成
            await fsPromises.mkdir(absPath, { recursive: true });
          }
          return { success: true, dirPath: absPath };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
      // ディレクトリ内容を読む
      readdir: async (dirPath, options = { withFileTypes: false }) => {
        try {
          const absPath = path.resolve(dirPath);
          let files;

          // オプションに基づいて関数を選択
          if (options.withFileTypes) {
            // Direntオブジェクトを使用して詳細情報を取得
            const dirents = await fsPromises.readdir(absPath, { withFileTypes: true });
            files = dirents.map(dirent => ({
              name: dirent.name,
              isDirectory: dirent.isDirectory(),
              isFile: dirent.isFile(),
              isSymbolicLink: dirent.isSymbolicLink()
            }));
          } else {
            // 単純なファイル名リストを取得
            files = await fsPromises.readdir(absPath);
          }

          return {
            success: true,
            dirPath: absPath,
            files,
            isDirectory: true
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            isDirectory: false
          };
        }
      },
      // ファイルやディレクトリの存在確認
      exists: async (filePath) => {
        try {
          const absPath = path.resolve(filePath);
          await fsPromises.access(absPath);
          return { success: true, exists: true, path: absPath };
        } catch (error) {
          if (error.code === 'ENOENT') {
            return { success: true, exists: false, path: filePath };
          }
          return { success: false, error: error.message, exists: false, path: filePath };
        }
      }
    },
    // パス操作
    path: {
      join: (...paths) => path.join(...paths),
      resolve: (...paths) => path.resolve(...paths),
      dirname: (filePath) => path.dirname(filePath),
      basename: (filePath, ext) => path.basename(filePath, ext),
      extname: (filePath) => path.extname(filePath),
    },
    // プロジェクト管理
    openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
    saveProjectSettings: (project) => ipcRenderer.invoke('save-project-settings', project),
    loadProjectSettings: (projectId) => ipcRenderer.invoke('load-project-settings', projectId),
    deleteProjectSettings: (projectId) => ipcRenderer.invoke('delete-project-settings', projectId),
    loadProjectsConfig: () => ipcRenderer.invoke('load-projects-config'),
    // アクティブプロジェクトIDの保存と読み込み
    saveActiveProjectId: (projectId) => ipcRenderer.invoke('save-active-project-id', projectId),
    loadActiveProjectId: () => ipcRenderer.invoke('load-active-project-id'),
    // ファイルパスをエクスプローラーで開く
    openPathInExplorer: (path) => ipcRenderer.invoke('open-path-in-explorer', path),
    // フォルダをエクスプローラーで開く
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    // カテゴリとタグの管理
    loadCategories: () => ipcRenderer.invoke('loadCategories'),
    saveCategories: (categories) => ipcRenderer.invoke('saveCategories', categories),
    loadTags: () => ipcRenderer.invoke('loadTags'),
    saveTags: (tags) => ipcRenderer.invoke('saveTags', tags),
    // 選択中のカテゴリとタグの管理
    saveSelectedCategory: (category) => ipcRenderer.invoke('saveSelectedCategory', category),
    loadSelectedCategory: () => ipcRenderer.invoke('loadSelectedCategory'),
    saveSelectedTags: (tags) => ipcRenderer.invoke('saveSelectedTags', tags),
    loadSelectedTags: () => ipcRenderer.invoke('loadSelectedTags'),
    // ファイル監視
    watchProjectFiles: (projectId, projectPath, patterns) => {
      try {
        // サニタイズされたオブジェクトを作成
        const requestData = {
          projectId: String(projectId),
          projectPath: String(projectPath),
          patterns: Array.isArray(patterns) ? patterns : ['src/pages/**/*.html']
        };

        // 安全なシリアライズ可能なオブジェクトに変換
        const safeData = JSON.parse(JSON.stringify(requestData));
        console.log('ファイル監視リクエストを送信:', safeData);

        return ipcRenderer.invoke('watch-project-files', safeData);
      } catch (error) {
        console.error('watchProjectFiles呼び出しエラー:', error);
        // エラーの場合はfalseを返す
        return Promise.resolve(false);
      }
    },
    unwatchProjectFiles: (projectId) => {
      try {
        return ipcRenderer.invoke('unwatch-project-files', {
          projectId: String(projectId)
        });
      } catch (error) {
        console.error('unwatchProjectFiles呼び出しエラー:', error);
        return Promise.resolve(false);
      }
    },
    // タブ切り替え用のメソッドを追加
    switchTab: (tabId) => {
      console.log('タブ切り替え要求を受信:', tabId);
      try {
        ipcRenderer.send('switch-tab', tabId);
        console.log('タブ切り替え要求を送信しました');
      } catch (error) {
        console.error('タブ切り替え要求の送信に失敗:', error);
      }
    },
    // コンソール情報のコールバックを設定
    onConsoleInfoUpdated: (callback) => {
      window.onConsoleInfoUpdated = callback;
    },
    // デフォルト設定の読み込み
    loadDefaultSettings: () => ipcRenderer.invoke('loadDefaultSettings'),

    // デフォルト設定の保存
    saveDefaultSettings: (settings) => ipcRenderer.invoke('saveDefaultSettings', settings),

    // プロジェクトデータの管理
    saveProjectData: (projectId, section, data) =>
      ipcRenderer.invoke('save-project-data', { projectId, section, data }),

    loadProjectData: (projectId, section) =>
      ipcRenderer.invoke('load-project-data', { projectId, section }),
  });

  // コンソール情報のイベントリスナー
  ipcRenderer.on('console-info-updated', (event, consoleInfo) => {
    if (window.onConsoleInfoUpdated) {
      window.onConsoleInfoUpdated(consoleInfo);
    }
  });

  console.log('Preload script loaded successfully');
} catch (error) {
  console.error('Failed to initialize preload script:', error);
}
