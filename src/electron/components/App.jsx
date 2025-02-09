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
  const [activeTab, setActiveTab] = useState('responsive-config');  // デフォルトを「ページ作成」に設定
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
      case 'drag-drop':
        return <DragDropPage />; // ここではページ作成の部分を表示
      case 'generate-html':  // HTMLファイル生成タブ
        return <GenerateHTML />;
      case 'preview':  // プレビュータブの処理
        return (
          <div>
            <h2>ページプレビュー</h2>
            {savedPage && savedPage.components && savedPage.components.length > 0 ? (
              <div>
                {savedPage.components.map((component, index) => {
                  switch (component.type) {
                    case 'header':
                      return (
                        <Header
                          key={index}
                          title={component.properties.title}
                          logoUrl={component.properties.logoUrl}
                        />
                      );
                    case 'footer':
                      return <Footer key={index} footerText={component.properties.footerText} />;
                    default:
                      return null;
                  }
                })}
              </div>
            ) : (
              <p>ページが保存されていません。</p>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* サイドメニュー */}
      <div style={{ width: '200px', backgroundColor: '#f4f4f4', padding: '10px' }}>
        <h3>メニュー</h3>
        <ul style={{ listStyleType: 'none', padding: 0 }}>
          <li onClick={() => handleTabChange('changelog')}>変更ログ</li>
          <li onClick={() => handleTabChange('reset-css')}>リセットCSS関連</li>
          <li onClick={() => handleTabChange('responsive-config')}>レスポンシブ関連</li>
          <li onClick={() => handleTabChange('variable-config')}>変数設定</li>
          <li onClick={() => handleTabChange('drag-drop')}>ページ作成</li>
          <li onClick={() => handleTabChange('generate-html')}>HTMLファイル生成</li> {/* ここで生成するHTMLタブを追加 */}
          <li onClick={() => handleTabChange('preview')}>ページプレビュー</li> {/* プレビュータブを追加 */}
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
