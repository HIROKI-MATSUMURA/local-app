import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';

// アプリケーション用スタイルのインポート
import './styles/main.css';
// 他のスタイルファイルもパスを確認
// import './styles/components.css';
// import './styles/App.scss';

/**
 * ElectronAPIの検出を行う関数
 * 複数の方法でElectron環境かどうかを判定する
 */
function isElectronEnvironment() {
  // 1. window.apiが存在し、isElectronフラグがtrueかどうか
  const hasApi = typeof window !== 'undefined' && window.api && window.api.isElectron === true;

  // 2. window.electronオブジェクトが存在するか
  const hasElectron = typeof window !== 'undefined' && window.electron !== undefined;

  // 3. userAgentにElectronが含まれているか
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const containsElectron = userAgent.indexOf(' electron/') > -1;

  console.log('Electron環境チェック:', {
    hasApi, hasElectron, containsElectron
  });

  return hasApi || hasElectron || containsElectron;
}

// Electronのポリフィルとフォールバック
function setupElectronFallback() {
  // window.apiがない場合の最小限のフォールバック
  if (typeof window !== 'undefined' && !window.api) {
    console.log('window.apiが見つからないため最小限のフォールバックを提供します');
    window.api = {
      isElectron: false,
      // 最小限のダミー関数
      loadCategories: () => Promise.resolve([
        { id: 'uncategorized', name: '未分類', description: '' },
        { id: 'company', name: '企業サイト', description: '企業向けサイト' },
        { id: 'ec', name: 'ECサイト', description: 'オンラインショップ' },
        { id: 'community', name: 'コミュニティ', description: 'コミュニティサイト' },
        { id: 'blog', name: 'ブログ', description: 'ブログサイト' }
      ]),
      loadTags: () => Promise.resolve([
        { id: 'responsive', name: 'レスポンシブ', description: '' },
        { id: 'modern', name: 'モダン', description: '' },
        { id: 'simple', name: 'シンプル', description: '' },
        { id: 'dark', name: 'ダーク', description: '' },
        { id: 'light', name: 'ライト', description: '' },
        { id: 'colorful', name: 'カラフル', description: '' }
      ]),
      loadProjectsConfig: () => Promise.resolve([]),
      loadActiveProjectId: () => Promise.resolve(null),
      saveActiveProjectId: () => Promise.resolve(false),

      // Python関連のダミー関数
      checkPythonEnvironmentStatus: () => Promise.resolve({
        success: false,
        isRunning: false,
        message: 'ブラウザ環境ではPython処理は利用できません',
        pythonVersion: '不明',
        status: 'unavailable'
      }),
      installPythonPackages: () => Promise.resolve({
        success: false,
        message: 'ブラウザ環境ではPythonパッケージのインストールは利用できません'
      }),
      checkPythonBridge: () => Promise.resolve({
        success: false,
        isRunning: false,
        message: 'ブラウザ環境ではPythonブリッジは利用できません'
      }),
      startPythonBridge: () => Promise.resolve({
        success: false,
        message: 'ブラウザ環境ではPythonブリッジの起動は利用できません'
      }),

      // 画像処理関連のダミー関数
      analyzeImageSections: () => Promise.resolve({
        success: false,
        data: [],
        error: 'ブラウザ環境ではPython画像セクション分析は利用できません'
      }),

      // ファイル操作系のダミー関数
      fs: {
        exists: () => Promise.resolve({ success: true, exists: false }),
        readFile: () => Promise.resolve({ success: false, error: 'ブラウザではファイル操作は利用できません' }),
        writeFile: () => Promise.resolve({ success: false, error: 'ブラウザではファイル操作は利用できません' })
      },
      path: {
        join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
        resolve: (...parts) => parts.join('/').replace(/\/+/g, '/'),
        dirname: (p) => p.split('/').slice(0, -1).join('/'),
        basename: (p) => p.split('/').pop()
      }
    };
  }

  // window.electronがない場合のフォールバック
  if (typeof window !== 'undefined' && !window.electron) {
    console.log('window.electronが見つからないためフォールバックを提供します');
    window.electron = {
      ipcRenderer: {
        send: () => console.warn('ブラウザ環境ではIPC通信は利用できません'),
        invoke: () => Promise.resolve(null),
        on: () => () => { },
        once: () => { }
      }
    };
  }
}

// セットアップを実行
setupElectronFallback();

// Electron環境の検出
const isElectronContext = isElectronEnvironment();
console.log('Electron API 利用可能:', isElectronContext ? 'はい' : 'いいえ');

// ローディング画面を非表示にする関数
function hideLoadingScreen() {
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = 'none';
    console.log('ローディング画面を非表示にしました');
  }
}

// Reactアプリケーションをレンダリング
try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  // ReactDOMを使用してAppコンポーネントをレンダリング
  const root = ReactDOM.createRoot(rootElement);
  root.render(React.createElement(App));
  console.log('React app rendered successfully');

  // レンダリング成功後にローディング画面を非表示
  setTimeout(hideLoadingScreen, 300);
} catch (error) {
  console.error('Failed to render React app:', error);
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Reactアプリのレンダリングに失敗しました</h2>
        <pre>${error.message}</pre>
      </div>
    `;
  }
}
