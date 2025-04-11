// シンプルなpreload.jsの実装 - パフォーマンスとセキュリティのバランスを最適化
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

// APIをコンテキストブリッジを通してウェブコンテンツに公開
contextBridge.exposeInMainWorld('api', {
  // Electron環境のフラグ
  isElectron: true,

  // パス操作
  path: {
    join: (...paths) => path.join(...paths),
    resolve: (...paths) => path.resolve(...paths),
    dirname: (filePath) => path.dirname(filePath),
    basename: (filePath, ext) => path.basename(filePath, ext),
    extname: (filePath) => path.extname(filePath),
  },

  // ファイル操作 - 基本的な機能のみ
  fs: {
    readFileSync: (filePath, encoding = 'utf8') => {
      try {
        const absPath = path.resolve(filePath);
        const data = fs.readFileSync(absPath, encoding);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    // 非同期ファイル読み取り
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
        const files = await fsPromises.readdir(absPath, options);
        return { success: true, files };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    // ファイル存在確認
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

  // IPC通信
  send: (channel, data) => {
    const validChannels = [
      'toMain', 'saveFile', 'openFile', 'generateCode',
      'save-html-file', 'save-scss-file', 'delete-html-file',
      'rename-file', 'save-ai-generated-code', 'rename-and-save-ai-code',
      'switch-tab'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  receive: (channel, func) => {
    const validChannels = [
      'fromMain', 'fileData', 'codeGenerated', 'file-updated',
      'new-html-file', 'file-changed', 'file-deleted', 'tab-switched'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },

  // HTMLファイル一覧を取得する関数
  getHtmlFiles: () => ipcRenderer.invoke('get-html-files'),

  // ファイルコンテンツリクエスト
  requestFileContent: (filePath) => ipcRenderer.send('request-file-content', filePath),

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

  // プロジェクト管理
  loadCategories: () => ipcRenderer.invoke('loadCategories'),
  saveCategories: (categories) => ipcRenderer.invoke('saveCategories', categories),
  loadTags: () => ipcRenderer.invoke('loadTags'),
  saveTags: (tags) => ipcRenderer.invoke('saveTags', tags),

  // アクティブプロジェクトIDの保存と読み込み
  saveActiveProjectId: (projectId) => ipcRenderer.invoke('save-active-project-id', projectId),
  loadActiveProjectId: () => ipcRenderer.invoke('load-active-project-id'),

  // プロジェクト設定
  loadProjectsConfig: () => ipcRenderer.invoke('load-projects-config'),
  loadProjectSettings: (projectId) => ipcRenderer.invoke('load-project-settings', projectId),
  saveProjectSettings: (project) => ipcRenderer.invoke('save-project-settings', project),
  deleteProjectSettings: (projectId) => ipcRenderer.invoke('delete-project-settings', projectId),

  // デフォルト設定
  loadDefaultSettings: () => ipcRenderer.invoke('loadDefaultSettings'),
  saveDefaultSettings: (settings) => ipcRenderer.invoke('saveDefaultSettings', settings),

  // プロジェクトデータ操作
  loadProjectData: (projectId, section) => ipcRenderer.invoke('load-project-data', { projectId, section }),
  saveProjectData: (projectId, section, data) => ipcRenderer.invoke('save-project-data', { projectId, section, data }),

  // ファイル操作イベント - 直接メソッド呼び出し用
  onFileChanged: (callback) => {
    if (typeof callback !== 'function') {
      console.error('onFileChanged: コールバックが関数ではありません');
      return;
    }
    ipcRenderer.on('file-changed', (event, data) => callback(data));
  },
  onFileDeleted: (callback) => {
    if (typeof callback !== 'function') {
      console.error('onFileDeleted: コールバックが関数ではありません');
      return;
    }
    ipcRenderer.on('file-deleted', (event, data) => callback(data));
  },
  onNewFile: (callback) => {
    if (typeof callback !== 'function') {
      console.error('onNewFile: コールバックが関数ではありません');
      return;
    }
    ipcRenderer.on('new-html-file', (event, data) => callback(data));
  },

  // ファイル監視
  watchProjectFiles: (projectId, projectPath, patterns) => {
    try {
      // サニタイズされたオブジェクトを作成
      const requestData = {
        projectId: String(projectId),
        projectPath: String(projectPath),
        patterns: Array.isArray(patterns) ? patterns : ['**/*.html', '**/*.css', '**/*.scss', '**/*.js', '**/*.json']
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
  //APIキー取得
  getClaudeApiKey: () => ipcRenderer.invoke('get-claude-api-key'),

  // Python関連機能
  checkPythonBridge: () => ipcRenderer.invoke('check-python-bridge'),
  startPythonBridge: () => ipcRenderer.invoke('start-python-bridge'),
  checkPythonEnvironmentStatus: () => ipcRenderer.invoke('check-python-environment-status'),
  installPythonPackages: () => ipcRenderer.invoke('install-python-packages'),

  // 画像分析API
  analyzeImage: async (data) => {
    try {
      return await ipcRenderer.invoke('analyze-image', data);
    } catch (error) {
      console.error('画像分析エラー:', error);
      return { success: false, error: error.message || String(error) };
    }
  },

  // Python画像処理API
  extractColorsFromImage: (imageData) => ipcRenderer.invoke('extract-colors-from-image', imageData),
  extractTextFromImage: (imageData) => ipcRenderer.invoke('extract-text-from-image', imageData),
  analyzeImageSections: (imageData) => ipcRenderer.invoke('analyze-image-sections', imageData),

  // 拡張性重視派（エラーハンドリングしたいならこっち）
  generateCode: async (data) => {
    try {
      return await ipcRenderer.invoke('generate-code', data);
    } catch (err) {
      console.error('generateCode failed:', err);
      return { success: false, error: err };
    }
  }
});

// Electronオブジェクトも公開
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => {
      ipcRenderer.on(channel, (event, ...args) => listener(...args));
      return () => ipcRenderer.removeListener(channel, listener);
    },
    once: (channel, listener) => {
      ipcRenderer.once(channel, (event, ...args) => listener(...args));
    }
  }
});

console.log('Preload script loaded successfully');
