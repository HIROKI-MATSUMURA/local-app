import React, { useState, useRef, useEffect } from "react";
import "../styles/css/main.css";
import "../styles/css/components.css";
import GenerateHTML from "./GenerateHTML";
import ResetCSS from "./ResetCSS";
import ResponsiveConfig from "./ResponsiveConfig";
import VariableConfig from "./VariableConfig";
import AICodeGenerator from "./AICodeGenerator";

// Electronコンテキストかどうかを判定
const isElectronContext = typeof window !== 'undefined' && window.api;

// 出力パスの設定
const OUTPUT_PATH = '../output';

const App = () => {
  const [activeTab, setActiveTab] = useState("generate-html");
  // VariableConfigの参照を保持
  const variableConfigRef = useRef(null);
  // Python環境チェックの状態
  const [pythonCheck, setPythonCheck] = useState({
    showCheck: false, // 初期状態でチェックを無効化
    isComplete: false,
    isPythonAvailable: false
  });

  // Electron環境かどうかをコンソールに出力（デバッグ用）
  useEffect(() => {
    console.log('Electron API 利用可能:', isElectronContext ? 'はい' : 'いいえ');

    // 出力ディレクトリの存在確認と作成（Electron環境の場合）
    if (isElectronContext && window.api.fs) {
      window.api.fs.ensureDir(OUTPUT_PATH)
        .then(() => console.log(`出力ディレクトリを確認しました: ${OUTPUT_PATH}`))
        .catch(err => console.error('出力ディレクトリの確認に失敗しました:', err));
    }
  }, []);

  const menuItems = [
    { id: "generate-html", label: "HTMLファイル生成", icon: "📄" },
    { id: "reset-css", label: "リセットCSS関連", icon: "🎨" },
    { id: "responsive-config", label: "レスポンシブ関連", icon: "📱" },
    { id: "variable-config", label: "変数設定", icon: "⚙️" },
    { id: "ai-code-generator", label: "AIコード生成", icon: "🤖" },
  ];

  // タブ切り替え前に未保存の変更をチェック
  const handleTabChange = (newTabId) => {
    // 現在が変数設定タブで、かつ未保存の変更がある場合
    if (activeTab === "variable-config" &&
      variableConfigRef.current &&
      variableConfigRef.current.hasUnsavedChanges()) {
      // 確認ダイアログを表示
      const confirmed = window.confirm('変更が保存されていません。このページを離れますか？');
      if (!confirmed) {
        return; // キャンセルされた場合は何もしない
      }
    }
    // 問題なければタブを切り替え
    setActiveTab(newTabId);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "reset-css":
        return <ResetCSS />;
      case "responsive-config":
        return <ResponsiveConfig />;
      case "variable-config":
        return <VariableConfig ref={variableConfigRef} />;
      case "ai-code-generator":
        return <AICodeGenerator />;
      case "generate-html":
      default:
        return <GenerateHTML />;
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>CreAIte Code</h2>
        </div>
        <nav className="sidebar-nav">
          <ul>
            {menuItems.map((item) => (
              <li
                key={item.id}
                className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                onClick={() => handleTabChange(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="main-content">
        <div className="content-wrapper">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
