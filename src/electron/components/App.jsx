import React, { useState } from 'react';
import Settings from './Settings';
import ChangeLog from './ChangeLog';
import ResetCSS from './ResetCSS'; // リセットCSS関連
import ResponsiveConfig from './ResponsiveConfig'; // レスポンシブ関連
import VariableConfig from './VariableConfig'; // 変数設定関連

const App = () => {
  const [activeTab, setActiveTab] = useState('settings'); // アクティブなタブ
  const [logs, setLogs] = useState([]); // ログ状態管理

  const addLog = (newLog) => {
    setLogs((prevLogs) => [...prevLogs, newLog]);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'settings':
        return <Settings addLog={addLog} />;
      case 'changelog':
        return <ChangeLog logs={logs} />;
      case 'reset-css':
        return <ResetCSS addLog={addLog} />;
      case 'responsive-config':
        return <ResponsiveConfig addLog={addLog} />;
      case 'variable-config':
        return <VariableConfig addLog={addLog} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* サイドメニュー */}
      <div style={{ width: '200px', backgroundColor: '#f4f4f4', padding: '10px' }}>
        <h3>メニュー</h3>
        <ul style={{ listStyleType: 'none', padding: 0 }}>
          <li
            style={{ cursor: 'pointer', marginBottom: '10px' }}
            onClick={() => setActiveTab('settings')}
          >
            設定
          </li>
          <li
            style={{ cursor: 'pointer', marginBottom: '10px' }}
            onClick={() => setActiveTab('changelog')}
          >
            変更ログ
          </li>
          <li
            style={{ fontWeight: 'bold', marginTop: '20px', marginBottom: '10px' }}
          >
            SCSS設定
          </li>
          <li
            style={{ cursor: 'pointer', marginLeft: '10px', marginBottom: '10px' }}
            onClick={() => setActiveTab('reset-css')}
          >
            リセットCSS関連
          </li>
          <li
            style={{ cursor: 'pointer', marginLeft: '10px', marginBottom: '10px' }}
            onClick={() => setActiveTab('responsive-config')}
          >
            レスポンシブ関連
          </li>
          <li
            style={{ cursor: 'pointer', marginLeft: '10px', marginBottom: '10px' }}
            onClick={() => setActiveTab('variable-config')}
          >
            変数設定
          </li>
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
