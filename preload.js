// 🔥 ここ！
console.log("🔥 preload.js 実行確認: window.api セット前");



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

  // Claude APIキーを取得
  getClaudeApiKey: () => ipcRenderer.invoke('get-claude-api-key'),

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

  invoke: (...args) => ipcRenderer.invoke(...args),

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

  // 選択されたカテゴリの保存と読み込み (同期バージョン)
  saveSelectedCategory: (category) => ipcRenderer.sendSync('save-selected-category-sync', category),
  loadSelectedCategory: () => ipcRenderer.sendSync('load-selected-category-sync'),

  // カテゴリとタグの同期読み込み
  loadCategoriesSync: () => ipcRenderer.sendSync('load-categories-sync'),
  loadTagsSync: () => ipcRenderer.sendSync('load-tags-sync'),
  loadSelectedTagsSync: () => ipcRenderer.sendSync('load-selected-tags-sync'),

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

  // ファイル操作関連のAPI
  getFileContent: (filePath) => ipcRenderer.invoke('get-file-content', filePath),
  saveHtmlFile: (fileName, content) => ipcRenderer.invoke('save-html-file', { fileName, content }),
  saveScssFile: (fileName, content) => ipcRenderer.invoke('save-scss-file', { fileName, content }),
  saveAIGeneratedCode: (htmlFileName, htmlContent, scssFileName, scssContent) =>
    ipcRenderer.invoke('save-ai-generated-code', {
      htmlFileName,
      htmlContent,
      scssFileName,
      scssContent
    }),

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
      return ipcRenderer.invoke('unwatch-project-files', projectId);
    } catch (error) {
      console.error('unwatchProjectFiles呼び出しエラー:', error);
      return Promise.resolve(false);
    }
  },
  //Python関連機能
  checkPythonBridge: () => ipcRenderer.invoke('check-python-bridge'),
  startPythonBridge: () => ipcRenderer.invoke('start-python-bridge'),
  checkPythonEnvironmentStatus: () => ipcRenderer.invoke('check-python-environment-status'),
  installPythonPackages: () => ipcRenderer.invoke('install-python-packages'),

  // 画像分析API
  // 画像の総合分析（旧 analyzeImage のロジックを統合）
  analyzeAll: async (data, options = {}) => {
    try {
      // データの存在確認
      if (!data) {
        console.error('[preload] analyzeAll: 画像分析データが提供されていません');
        return { success: false, error: 'データが提供されていません' };
      }

      // データ形式の確認と修正
      if (data.image_data) {
        console.log('[preload] analyzeAll: image_data → image に変換');
        data.image = data.image_data;
        delete data.image_data;
      }

      // 画像データの検証
      const image = data.image || data;
      if (!image || typeof image !== 'string') {
        console.error('[preload] analyzeAll: 画像データが不正です');
        return { success: false, error: '画像データが不正です' };
      }

      console.log('[preload] analyzeAll: データサイズ =', image.length);

      // options をマージ
      const mergedPayload = {
        image_data: image,
        options: {
          ...(data.options || {}),
          ...options,
          type: data.type || 'compress'
        }
      };

      console.log('[preload] analyzeAll: 送信するpayload:', {
        image_data: '(省略)',
        options: mergedPayload.options
      });

      // ipc 呼び出し
      const result = await ipcRenderer.invoke('analyze_all', mergedPayload);

      if (result && result.success === false) {
        console.error('[preload] analyzeAll: エラーあり:', result.error);
      } else {
        console.log('[preload] analyzeAll: 成功 - キー:', result ? Object.keys(result).join(', ') : 'なし');
      }

      return result;
    } catch (error) {
      console.error('[preload] analyzeAll: 例外発生:', error);
      return { success: false, error: error.message || String(error) };
    }
  },


  // プロジェクト追加ダイアログ
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),

  // フォルダを開く
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),

  // 拡張性重視派（エラーハンドリングしたいならこっち）
  generateCode: async (data) => {
    try {
      return await ipcRenderer.invoke('generate-code', data);
    } catch (err) {
      console.error('generateCode failed:', err);
      return { success: false, error: err };
    }
  },
  // 画像の総合分析
  analyzeImage: async (data) => {
    console.warn('[非推奨] analyzeImage は使用されました。analyzeAll をご利用ください。');
    return await window.api.analyzeAll(data);
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

// コード生成
contextBridge.exposeInMainWorld('codeGeneration', {
  // 新しいAIコード生成リクエスト
  requestAICodeGeneration: async (data) => {
    return await ipcRenderer.invoke('request-ai-code-generation', data);
  },

  // 保存済みのAIコードを取得
  getSavedAICode: async (blockId) => {
    return await ipcRenderer.invoke('get-saved-ai-code', blockId);
  },

  // 画像解析結果からコードを生成
  generateCodeFromAnalysis: async (analysisData, options = {}) => {
    return await ipcRenderer.invoke('generate-code-from-analysis', {
      analysisData,
      options
    });
  },

  // プロンプトプレビューを取得（デバッグ用）
  getPromptPreview: async (analysisData) => {
    return await ipcRenderer.invoke('get-prompt-preview', analysisData);
  },

  // AIコードを保存
  saveAICode: async (data) => {
    return await ipcRenderer.invoke('save-ai-code', data);
  }
});

// 画像解析
contextBridge.exposeInMainWorld('imageAnalysis', {
  // 画像の色を抽出
  extractColors: async (imageData) => {
    return await ipcRenderer.invoke('extract-colors', imageData);
  },

  // 画像のテキストを抽出
  extractText: async (imageData, options = {}) => {
    return await ipcRenderer.invoke('extract-text', imageData, options);
  },

  // 画像のセクションを分析
  analyzeSections: async (imageData, options = {}) => {
    return await ipcRenderer.invoke('analyze-sections', imageData, options);
  },

  // 画像のレイアウトを分析
  analyzeLayout: async (imageData, options = {}) => {
    return await ipcRenderer.invoke('analyze-layout', imageData, options);
  },

  // 画像の要素を検出
  detectElements: async (imageData, options = {}) => {
    return await ipcRenderer.invoke('detect-elements', imageData, options);
  },



  // 画像解析結果を圧縮
  compressAnalysisResults: async (analysisData, options = {}) => {
    return await ipcRenderer.invoke('compress-analysis', { analysisData, options });
  },

  // 元画像とレンダリング画像を比較
  compareImages: async (originalImage, renderedImage) => {
    return await ipcRenderer.invoke('compare-images', { originalImage, renderedImage });
  },

  // 環境チェック
  checkEnvironment: async () => {
    return await ipcRenderer.invoke('check-environment');
  }
});

// 画像分析とコード生成のためのAPIをレンダラープロセスに公開
contextBridge.exposeInMainWorld('electronAPI', {
  // 画像保存
  saveImage: (imageData) => {
    return ipcRenderer.invoke('save-image', imageData);
  },

  // 画像分析結果からコード生成
  generateCodeFromAnalysis: (analysisData) => {
    return ipcRenderer.invoke('generate-code-from-analysis', analysisData);
  },

  // 生成されたコードと元の画像を比較
  compareImages: (originalImageData, renderedImageData) => {
    return ipcRenderer.invoke('compare-images', {
      originalImage: originalImageData,
      renderedImage: renderedImageData
    });
  },

  // フィードバックを基にコードを再生成
  regenerateCodeWithFeedback: (data) => {
    return ipcRenderer.invoke('regenerate-code-with-feedback', data);
  },

  // 高精度画像分析を実行
  performAdvancedImageAnalysis: (imageData, options = {}) => {
    return ipcRenderer.invoke('perform-advanced-analysis', { imageData, options });
  },

  // 意味的な色抽出を行う
  extractSemanticColors: (imageData) => {
    return ipcRenderer.invoke('extract-semantic-colors', imageData);
  },

  // UI要素の階層構造を検出
  detectUIHierarchy: (imageData) => {
    return ipcRenderer.invoke('detect-ui-hierarchy', imageData);
  },

  // レスポンシブデザイン推論
  inferResponsiveDesign: (imageData) => {
    return ipcRenderer.invoke('infer-responsive-design', imageData);
  },

  // 設計意図を抽出
  extractDesignIntent: (analysisData) => {
    return ipcRenderer.invoke('extract-design-intent', analysisData);
  },

  // 自然言語プロンプトを生成
  generateNaturalLanguagePrompt: (analysisData) => {
    return ipcRenderer.invoke('generate-nl-prompt', analysisData);
  }
});

console.log('Preload script loaded successfully');
