import React, { useState, useEffect } from 'react';
import ChangeLog from './ChangeLog';
import ResetCSS from './ResetCSS';
import ResponsiveConfig from './ResponsiveConfig';
import VariableConfig from './VariableConfig';
import DragDropPage from './DragDropPage';
import GenerateHTML from './GenerateHTML'; // HTMLファイル生成のコンポーネントをインポート
// コンポーネント例：Header
const Header = ({ title, logoUrl }) => (
  <div>
    <h1>{title}</h1>
    <img src={logoUrl} alt="Logo" />
  </div>
);

// コンポーネント例：Footer
const Footer = ({ footerText }) => (
  <div>
    <p>{footerText}</p>
  </div>
);

const App = () => {
  const [activeTab, setActiveTab] = useState('generate-html');  // デフォルトを「ページ作成」に設定
  const [logs, setLogs] = useState([]);
  const [savedPage, setSavedPage] = useState(null); // 保存されたページデータ

  const addLog = (newLog) => {
    setLogs((prevLogs) => [...prevLogs, newLog]);
  };

  useEffect(() => {
    // ページデータをlocalStorageから読み込む
    const pageData = localStorage.getItem('pageParts');
    if (pageData) {
      const parsedData = JSON.parse(pageData);
      console.log('Loaded page data:', parsedData); // データをコンソールで確認
      setSavedPage(parsedData);
    }
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'changelog':
        return <ChangeLog logs={logs} />;
      case 'reset-css':
        return <ResetCSS addLog={addLog} />;
      case 'responsive-config':
        return <ResponsiveConfig addLog={addLog} />;
      case 'variable-config':
        return <VariableConfig addLog={addLog} />;
      case 'generate-html':  // HTMLファイル生成タブ
        return <GenerateHTML />;
      default:
        return null;
    }
  };

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
  };

  return (
    <div style={{ display: 'flex', height: '100vw' }}>
      {/* サイドメニュー */}
      <div style={{ width: '200px', backgroundColor: '#f4f4f4', padding: '10px' }}>
        <h3>メニュー</h3>
        <ul style={{ listStyleType: 'none', display: 'grid', gap: '10px',padding: '0px' }}>
          <li onClick={() => handleTabChange('generate-html')}>HTMLファイル生成</li> {/* ここで生成するHTMLタブを追加 */}
          <li onClick={() => handleTabChange('changelog')}>変更ログ</li>
          <li onClick={() => handleTabChange('reset-css')}>リセットCSS関連</li>
          <li onClick={() => handleTabChange('responsive-config')}>レスポンシブ関連</li>
          <li onClick={() => handleTabChange('variable-config')}>変数設定</li>
        </ul>
      </div>

      {/* メインコンテンツ */}
      <div style={{ flex: 1, padding: '20px' }}>
        {renderContent()}
      </div>
    </div>
  );
};

export default App;
