import React, { useState } from "react";
import ChangeLog from "./ChangeLog";
import ResetCSS from "./ResetCSS";
import ResponsiveConfig from "./ResponsiveConfig";
import VariableConfig from "./VariableConfig";
import GenerateHTML from "./GenerateHTML";
import AICodeGenerator from "./AICodeGenerator";
import APISettings from "./APISettings"; // 新しいAPI設定コンポーネント

const App = () => {
  const [activeTab, setActiveTab] = useState("generate-html"); // デフォルトタブ
  const renderContent = () => {
    switch (activeTab) {
      case "changelog":
        return <ChangeLog />;
      case "reset-css":
        return <ResetCSS />;
      case "responsive-config":
        return <ResponsiveConfig />;
      case "variable-config":
        return <VariableConfig />;
      case "generate-html":
        return <GenerateHTML />;
      case "ai-code-generator":
        return <AICodeGenerator />;
      case "api-settings": // 新しいタブ
        return <APISettings />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vw" }}>
      <div style={{ width: "200px", backgroundColor: "#f4f4f4", padding: "10px" }}>
        <h3>メニュー</h3>
        <ul style={{ listStyleType: "none", padding: 0, display : 'grid', gap: '10px' }}>
          <li onClick={() => setActiveTab("generate-html")}>HTMLファイル生成</li>
          <li onClick={() => setActiveTab("changelog")}>変更ログ</li>
          <li onClick={() => setActiveTab("reset-css")}>リセットCSS関連</li>
          <li onClick={() => setActiveTab("responsive-config")}>レスポンシブ関連</li>
          <li onClick={() => setActiveTab("variable-config")}>変数設定</li>
          <li onClick={() => setActiveTab("ai-code-generator")}>AIコード生成</li>
          <li onClick={() => setActiveTab("api-settings")}>API設定</li> {/* 新しいタブ */}
        </ul>
      </div>
      <div style={{ flex: 1, padding: "20px" }}>
        {renderContent()}
      </div>
    </div>
  );
};

export default App;
