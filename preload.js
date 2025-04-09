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
    // イベントリスナー登録関数
    onNewHtmlFile: (callback) => {
      ipcRenderer.on('new-html-file', (event, fileName) => {
        callback(fileName);
      });
    },
    onFileDeleted: (callback) => {
      ipcRenderer.on('file-deleted', (event, fileName) => {
        callback(fileName);
      });
    },
    onFileChanged: (callback) => {
      ipcRenderer.on('file-changed', (event, data) => {
        callback(data);
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
      // ファイル一覧取得
      readdir: async (dirPath) => {
        try {
          const absPath = path.resolve(dirPath);
          const files = await fsPromises.readdir(absPath);
          return { success: true, files };
        } catch (error) {
          return { success: false, error: error.message };
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
    // プロジェクトファイル監視
    watchProjectFiles: (projectId) => ipcRenderer.invoke('watchProjectFiles', projectId),
    unwatchProjectFiles: (projectId) => ipcRenderer.invoke('unwatchProjectFiles', projectId),
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
