// 🔥 ここ！
console.log("🔥 preload.js 実行確認: window.api セット前");

// シンプルなpreload.jsの実装 - パフォーマンスとセキュリティのバランスを最適化
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

console.log("🔥 preload.js: contextBridge利用可能:", !!contextBridge);
console.log("🔥 preload.js: ipcRenderer利用可能:", !!ipcRenderer);

// 強化されたエラーロギング
const logError = (error, context = '') => {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack || '(スタックトレースなし)'}`
    : String(error);

  const formattedMessage = `[${timestamp}] ${context ? context + ': ' : ''}${errorMessage}`;

  // コンソールに出力
  console.error(formattedMessage);

  // エラーログファイルにも書き込む
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `renderer_errors_${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, formattedMessage + '\n', 'utf8');
  } catch (ioError) {
    console.error('エラーログの書き込みに失敗:', ioError);
  }
};

// 未処理のPromiseエラーをグローバルにキャッチ
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, 'UnhandledPromiseRejection');
  });
}

// contextIsolation無効化のため、直接windowオブジェクトに設定
window.api = {
  // Electron環境のフラグ
  isElectron: true,

  // メモリ管理
  gc: () => ipcRenderer.invoke('gc'),

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

  // エラーハンドリングを強化したinvoke関数
  invoke: async (channel, ...args) => {
    try {
      // APIリクエストの開始をログに記録
      console.log(`[API Request] ${channel} 開始`);

      // リクエストを実行
      const result = await ipcRenderer.invoke(channel, ...args);

      // 成功結果をログに記録（必要に応じて)
      if (channel.includes('analyze') || channel.includes('extract')) {
        console.log(`[API Request] ${channel} 完了: データサイズ=${JSON.stringify(result).length}バイト`);
      } else {
        console.log(`[API Request] ${channel} 完了`);
      }

      // エラーチェック（WebAssemblyブリッジからのエラーレスポンス）
      if (result && typeof result === 'object') {
        if (result.error || (result.success === false)) {
          const errorMessage = result.error || '不明なエラー';
          logError(errorMessage, `WebAssemblyError in ${channel}`);
          console.error(`[WebAssembly Error] ${channel}: ${errorMessage}`);
        }
      }

      return result;
    } catch (error) {
      // エラーを詳細にログに記録
      logError(error, `API Error in ${channel}`);
      console.error(`[API Error] ${channel}:`, error);

      // エラーをスローして呼び出し元にも伝える
      throw error;
    }
  },

  // IPC通信
  send: (channel, data) => {
    const validChannels = [
      'toMain', 'saveFile', 'openFile', 'generateCode',
      'save-html-file', 'save-scss-file', 'delete-html-file',
      'rename-file', 'save-ai-generated-code', 'rename-and-save-ai-code',
      'switch-tab', 'run-auto-setup', 'close-webassembly-setup'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  receive: (channel, func) => {
    const validChannels = [
      'fromMain', 'fileData', 'codeGenerated', 'file-updated',
      'new-html-file', 'file-changed', 'file-deleted', 'tab-switched',
      'python-environment-status'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },

  // WebAssembly環境イベントリスナー
  onWebAssemblyEnvironmentStatus: (callback) => {
    if (typeof callback !== 'function') {
      console.error('onWebAssemblyEnvironmentStatus: コールバックが関数ではありません');
      return;
    }
    ipcRenderer.on('webassembly-environment-status', (event, data) => callback(data));
  },

  // 後方互換性のための古いリスナー（非推奨）
  onPythonEnvironmentStatus: (callback) => {
    console.warn('[非推奨] onPythonEnvironmentStatus は使用されました。onWebAssemblyEnvironmentStatus をご利用ください。');
    if (typeof callback !== 'function') {
      console.error('onPythonEnvironmentStatus: コールバックが関数ではありません');
      return;
    }
    ipcRenderer.on('webassembly-environment-status', (event, data) => callback(data));
  },

  // 強化されたエラーログ関数
  logError: (error, context) => logError(error, context),

  // HTMLファイル一覧を取得する関数
  getHtmlFiles: () => ipcRenderer.invoke('get-html-files'),

  // ファイルの存在をチェックする関数
  checkFileExists: (blockName) => ipcRenderer.invoke('check-file-exists', blockName),

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

  // この関数は下の同名の関数と重複しているため削除、下の方を使用します

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

  // 選択されたタグの保存
  saveSelectedTags: async (tags) => {
    try {
      console.log('saveSelectedTags: 選択タグを保存します', tags);
      return await ipcRenderer.invoke('saveSelectedTags', tags);
    } catch (err) {
      console.error('saveSelectedTags 失敗:', err);
      return false;
    }
  },

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
  saveAIGeneratedCode: (scssCode, htmlCode, blockName, targetHtmlFile) =>
    ipcRenderer.invoke('save-ai-generated-code', {
      scssCode,
      htmlCode,
      blockName,
      targetHtmlFile
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
        patterns: Array.isArray(patterns) ?
          // ディープコピーを避けてパターンを直接コピーする
          patterns.map(p => String(p)) :
          ['**/*.html', '**/*.css', '**/*.scss', '**/*.js', '**/*.json']
      };

      // JSON.stringify/parseを使わず、単純なオブジェクトとして送信
      console.log('ファイル監視リクエストを送信:', requestData);

      return ipcRenderer.invoke('watch-project-files', requestData);
    } catch (error) {
      console.error('watchProjectFiles呼び出しエラー:', error);
      // エラーの場合はfalseを返す
      return Promise.resolve({ success: false, error: error.message || String(error) });
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
  // WebAssembly環境検証機能
  checkEnvironment: () => ipcRenderer.invoke('check-environment'),
  setupEnvironment: () => ipcRenderer.invoke('setup-environment'),

  // 後方互換性のための古い関数名（非推奨）
  checkPythonBridge: () => {
    console.warn('[非推奨] checkPythonBridge は使用されました。checkEnvironment をご利用ください。');
    return ipcRenderer.invoke('check-environment');
  },
  startPythonBridge: () => {
    console.warn('[非推奨] startPythonBridge は使用されました。setupEnvironment をご利用ください。');
    return ipcRenderer.invoke('setup-environment');
  },
  checkPythonEnvironmentStatus: () => {
    console.warn('[非推奨] checkPythonEnvironmentStatus は使用されました。checkEnvironment をご利用ください。');
    return ipcRenderer.invoke('check-environment');
  },
  installPythonPackages: () => {
    console.warn('[非推奨] installPythonPackages は使用されました。setupEnvironment をご利用ください。');
    return ipcRenderer.invoke('setup-environment');
  },

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

  // プロンプト生成
  generatePrompt: async (options) => {
    try {
      console.log("🔥 preload.js: generatePrompt関数が呼び出されました");
      console.log("🔥 preload.js: options =", options);
      console.log("🔥 preload.js: IPCでgeneratePromptチャンネルを呼び出します");

      const result = await ipcRenderer.invoke('generatePrompt', options);

      console.log("🔥 preload.js: IPCからの応答を受信しました");
      console.log("🔥 preload.js: 結果の長さ =", result ? result.length : 0);

      return result;
    } catch (err) {
      console.error('🔥 preload.js: generatePrompt failed:', err);
      throw err;
    }
  },

  // 画像の総合分析
  // 非推奨API（WebAssemblyモードでは使用しないことを推奨）
  analyzeImage: async (data) => {
    console.warn('[非推奨] analyzeImage は使用されました。analyzeAll をご利用ください。');
    return await window.api.analyzeAll(data);
  },

  getProjectContent: (projectPath, fileName) => ipcRenderer.invoke('get-project-content', { projectPath, fileName }),
  getProjectStructure: (projectPath) => ipcRenderer.invoke('get-project-structure', projectPath),

  // メモリ管理
  gc: () => ipcRenderer.invoke('gc'),

  // 現在のディレクトリを開く
  openCurrentDirectory: () => ipcRenderer.invoke('open-current-directory'),

  // HTTPリクエスト用API（axiosの代替）
  httpRequest: async (options) => {
    try {
      console.log('🌐 HTTPリクエスト: 開始', options.method, options.url);
      const result = await ipcRenderer.invoke('http-request', options);
      console.log('🌐 HTTPリクエスト: 完了', result.status);
      return result;
    } catch (error) {
      console.error('🌐 HTTPリクエスト: エラー', error);
      throw error;
    }
  },

  // レンダラープロセスで画像解析を実行（WebAssembly環境で実行）
  analyzeImageInRenderer: async (imageData, options = {}) => {
    try {
      console.log('🔍 analyzeImageInRenderer: 開始 - データサイズ:', imageData ? imageData.length : 0);
      
      // imageData の検証
      if (!imageData || typeof imageData !== 'string') {
        console.error('🔍 analyzeImageInRenderer: 無効な画像データ');
        return { success: false, error: '無効な画像データが提供されました' };
      }

      // WebAssemblyAnalyzerの初期化を待つ（最大5秒）
      let attempts = 0;
      const maxAttempts = 50; // 5秒間（100ms x 50回）
      
      while (attempts < maxAttempts) {
        if (window.webAssemblyAnalyzer && window.webAssemblyAnalyzer.analyzeAll) {
          console.log('🔍 analyzeImageInRenderer: WebAssemblyAnalyzer利用可能（試行', attempts + 1, '回目）');
          
          try {
            const result = await window.webAssemblyAnalyzer.analyzeAll(imageData, options);
            console.log('🔍 analyzeImageInRenderer: 解析完了 - 成功:', result && result.success !== false);
            return result;
          } catch (analysisError) {
            console.error('🔍 analyzeImageInRenderer: 解析中エラー:', analysisError);
            // 解析エラーでもフォールバックデータを返す
            break;
          }
        }
        
        // 100ms待機
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      // グローバル関数が利用できない場合のエラー
      console.error('🔍 analyzeImageInRenderer: window.webAssemblyAnalyzerが利用できません（', attempts, '回試行）');
      console.error('🔍 window.webAssemblyAnalyzer:', typeof window.webAssemblyAnalyzer);
      console.error('🔍 window.webAssemblyAnalyzerReady:', window.webAssemblyAnalyzerReady);
      console.error('🔍 利用可能なwindowプロパティ:', Object.keys(window).filter(key => 
        key.includes('cv') || key.includes('Tesseract') || key.includes('webAssembly')));
      
      return { 
        success: false, 
        error: 'WebAssembly画像解析モジュールが利用できません',
        fallbackData: {
          colors: [],
          text: '',
          textBlocks: [],
          sections: [],
          elements: []
        }
      };
    } catch (error) {
      console.error('🔍 analyzeImageInRenderer: エラー発生:', error);
      return { 
        success: false, 
        error: error.message || String(error),
        stack: error.stack
      };
    }
  }
};

// Electronオブジェクトも公開
window.electron = {
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
  },
  // WebAssemblyセットアップ用のAPI
  closeWebAssemblySetup: () => ipcRenderer.send('close-webassembly-setup'),

  // 後方互換性のための古いAPI（非推奨）
  closePythonSetup: () => {
    console.warn('[非推奨] closePythonSetup は使用されました。closeWebAssemblySetup をご利用ください。');
    ipcRenderer.send('close-webassembly-setup');
  },
  openExternalUrl: (url) => ipcRenderer.send('open-external-url', url)
};

// コード生成
window.codeGeneration = {
  // 新しいAIコード生成リクエスト
  requestAICodeGeneration: async (data) => {
    return await ipcRenderer.invoke('request-ai-code-generation', data);
  },

  // 保存済みのAIコードを取得
  getSavedAICode: async (blockId) => {
    return await ipcRenderer.invoke('get-saved-ai-code', blockId);
  },

  // 画像解析結果からコードを生成（WebAssembly生成エンジン使用）
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
};

// 画像解析
window.imageAnalysis = {
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
};

// 画像分析とコード生成のためのAPIをレンダラープロセスに公開
window.electronAPI = {
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
};

// AI API関連の機能をレンダラープロセスに公開
window.aiApi = {
  // APIキーを安全に取得
  getConfig: async () => {
    try {
      console.log('aiApi: APIキーを取得中...');
      // メインプロセスからAPIキーを取得
      const result = await ipcRenderer.invoke('get-api-key');
      console.log('aiApi: メインプロセスからの応答:', JSON.stringify({
        success: result.success,
        hasClaudeKey: !!result.claudeKey,
        hasOpenAIKey: !!result.openaiKey,
        provider: result.selectedProvider,
        version: result.anthropicVersion
      }));

      if (result && (result.claudeKey || result.openaiKey)) {
        console.log('aiApi: APIキー取得成功 - プロバイダ:', result.selectedProvider);
        return {
          apiKey: result.claudeKey || result.openaiKey,
          provider: result.selectedProvider,
          baseUrl: result.anthropicBaseUrl || 'https://api.anthropic.com/v1',
          version: result.anthropicVersion || '2023-06-01',
          success: true
        };
      } else {
        console.error('aiApi: APIキー取得エラー: キーが見つかりません');
        return {
          apiKey: '',
          provider: 'claude',
          baseUrl: 'https://api.anthropic.com/v1',
          version: '2023-06-01',
          success: false
        };
      }
    } catch (error) {
      console.error('aiApi: APIキー設定エラー:', error.message);
      // エラー時にはデフォルト値を返す
      return {
        apiKey: '',
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        version: '2023-06-01',
        success: false
      };
    }
  },

  // AIリクエストを送信
  sendRequest: async (prompt, options = {}) => {
    try {
      console.log('aiApi: AIリクエスト送信 - プロンプト:', prompt.substring(0, 50) + '...');
      // APIキーを取得
      const config = await window.aiApi.getConfig();
      console.log('aiApi: 設定取得結果:', JSON.stringify({
        success: config.success,
        provider: config.provider,
        version: config.version
      }));

      if (!config.success) {
        console.error('aiApi: APIキーが見つかりません');
        throw new Error('APIキーが見つかりません');
      }

      // リクエストオプションを設定
      const requestOptions = {
        ...options,
        apiKey: config.apiKey,
        provider: config.provider,
        version: config.version,
        prompt: prompt
      };

      console.log('aiApi: リクエスト送信中...');
      // リクエストを送信
      const response = await ipcRenderer.invoke('send-ai-request', requestOptions);
      console.log('aiApi: レスポンス受信:', JSON.stringify({
        success: response.success,
        textLength: response.text ? response.text.length : 0,
        provider: response.provider
      }));

      return response;
    } catch (error) {
      console.error('aiApi: リクエスト失敗:', error);
      throw new Error(`AIリクエスト失敗: ${error.message}`);
    }
  },

  // 画像解析デバッガー用API
  analyzeImageDebug: async (imageData) => {
    try {
      console.log('🔍 画像解析デバッガー: リクエスト開始');
      const result = await ipcRenderer.invoke('analyze-image-debug', imageData);
      console.log('🔍 画像解析デバッガー: 結果受信');
      return result;
    } catch (error) {
      console.error('🔍 画像解析デバッガー: エラー', error);
      throw error;
    }
  },

  // UUID生成用API（uuidの代替）
  generateUUID: () => {
    // シンプルなUUID v4の実装
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

console.log('🔥 preload.js: window APIs設定完了');
console.log('🔥 preload.js: window.api設定完了');
console.log('Preload script loaded successfully');
