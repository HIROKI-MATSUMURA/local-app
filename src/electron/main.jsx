import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';

// アプリケーション用スタイルのインポート
import './styles/css/main.css';
import './styles/css/components.css';
import './styles/App.scss';

// window.apiがあるかチェック（Electron環境の場合）
const isElectronContext = typeof window !== 'undefined' && window.api;
console.log('Electron API 利用可能:', isElectronContext ? 'はい' : 'いいえ');

// ローディング画面を非表示にする関数
function hideLoadingScreen() {
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = 'none';
    console.log('ローディング画面を非表示にしました');
  }
}

// エラーハンドリング関数
function handleRenderError(error) {
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
  // エラー時もローディング画面を非表示に
  hideLoadingScreen();
}

// アプリケーションの初期化
const initApp = () => {
  console.log('Initializing React application');
  try {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error('Root element not found');
    }

    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <App />
    );
    console.log('React app rendered successfully');

    // レンダリング成功後にローディング画面を非表示
    setTimeout(hideLoadingScreen, 300);
  } catch (error) {
    handleRenderError(error);
  }
};

// DOMContentLoadedイベントでアプリケーションを初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOMがすでに読み込まれている場合は直接初期化
  initApp();
}
