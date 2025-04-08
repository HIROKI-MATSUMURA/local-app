import React, { useState, useRef, useEffect } from "react";
import ChangeLog from "./ChangeLog";
import ResetCSS from "./ResetCSS";
import ResponsiveConfig from "./ResponsiveConfig";
import VariableConfig from "./VariableConfig";
import GenerateHTML from "./GenerateHTML";
import AICodeGenerator from "./AICodeGenerator";
import HeaderGenerator from "./HeaderGenerator";
// import APISettings from "./APISettings";
import StyleXConverter from "./StyleXConverter";
import PythonEnvironmentCheck from './PythonEnvironmentCheck';
import "../styles/css/main.css";
import "../styles/css/components.css";

const App = () => {
  const [activeTab, setActiveTab] = useState("generate-html");
  // VariableConfigの参照を保持
  const variableConfigRef = useRef(null);
  // Python環境チェックの状態
  const [pythonCheck, setPythonCheck] = useState({
    showCheck: true,
    isComplete: false,
    isPythonAvailable: false
  });

  const menuItems = [
    { id: "generate-html", label: "HTMLファイル生成", icon: "📄" },
    // { id: "changelog", label: "変更ログ", icon: "📝" },
    { id: "reset-css", label: "リセットCSS関連", icon: "🎨" },
    { id: "responsive-config", label: "レスポンシブ関連", icon: "📱" },
    { id: "variable-config", label: "変数設定", icon: "⚙️" },
    { id: "ai-code-generator", label: "AIコード生成", icon: "🤖" },
    // { id: "header-generator", label: "ヘッダー生成", icon: "🔝" },
    // { id: "stylex-converter", label: "StyleXコンバーター", icon: "🔄" },
    // { id: "api-settings", label: "API設定", icon: "🔑" },
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

  // Python環境チェック完了時の処理
  const handlePythonCheckComplete = (success) => {
    setPythonCheck({
      showCheck: false,
      isComplete: true,
      isPythonAvailable: success
    });

    // Pythonが利用できない場合は警告メッセージを表示
    if (!success) {
      console.warn('Python環境が利用できないため、一部の画像解析機能が制限されます。');
      // ここでToastやアラートを表示してもよい
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "changelog":
        return <ChangeLog />;
      case "reset-css":
        return <ResetCSS />;
      case "responsive-config":
        return <ResponsiveConfig />;
      case "variable-config":
        return <VariableConfig ref={variableConfigRef} />;
      case "generate-html":
        return <GenerateHTML />;
      case "ai-code-generator":
        return <AICodeGenerator />;
      case "header-generator":
        return <HeaderGenerator />;
      case "stylex-converter":
        return <StyleXConverter />;
      // case "api-settings":
      //   return <APISettings />;
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      {/* Python環境チェックモーダル */}
      {pythonCheck.showCheck && (
        <PythonEnvironmentCheck onComplete={handlePythonCheckComplete} />
      )}
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
