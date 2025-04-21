// Electronアプリ内でReactを使用するためのレンダラー

// Electronのコンテキストではモジュールインポートが特殊なため、
// window.nodeRequireを使ってモジュールを読み込みます
window.addEventListener('DOMContentLoaded', () => {
  // scriptタグを使ってReactとReact DOMを読み込む
  const reactScript = document.createElement('script');
  reactScript.src = '../node_modules/react/umd/react.development.js';
  document.head.appendChild(reactScript);

  const reactDomScript = document.createElement('script');
  reactDomScript.src = '../node_modules/react-dom/umd/react-dom.development.js';

  // React DOMが読み込まれた後にアプリを初期化
  reactDomScript.onload = () => {
    // Appコンポーネントを読み込む
    const script = document.createElement('script');
    script.src = './components/App.js';
    script.type = 'text/javascript';
    script.onload = () => {
      console.log('App component loaded, rendering React app');
      initApp();
    };
    document.head.appendChild(script);
  };

  document.head.appendChild(reactDomScript);
});

function initApp() {
  // グローバルスコープのReactとReactDOMを使用
  const root = ReactDOM.createRoot(document.getElementById('root'));
  // グローバルなAppコンポーネント
  root.render(React.createElement(window.App));
}
