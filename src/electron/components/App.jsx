import React, { useState } from "react";
import ChangeLog from "./ChangeLog";
import ResetCSS from "./ResetCSS";
import ResponsiveConfig from "./ResponsiveConfig";
import VariableConfig from "./VariableConfig";
import GenerateHTML from "./GenerateHTML";
import AICodeGenerator from "./AICodeGenerator";
import APISettings from "./APISettings"; // 新しいAPI設定コンポーネント
import StyleXConverter from "./StyleXConverter"; // StyleXコンバーターを追加

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
      case "stylex-converter": // StyleXコンバーターのタブ
        return <StyleXConverter />;
      case "api-settings": // 新しいタブ
        return <APISettings />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{
        width: "200px",
        backgroundColor: "#f4f4f4",
        padding: "10px",
        position: "fixed",
        height: "100vh",
        overflowY: "auto"
      }}>
        <h3>メニュー</h3>
        <ul style={{ listStyleType: "none", padding: 0, display: 'grid', gap: '10px' }}>
          <li onClick={() => setActiveTab("generate-html")}>HTMLファイル生成</li>
          <li onClick={() => setActiveTab("changelog")}>変更ログ</li>
          <li onClick={() => setActiveTab("reset-css")}>リセットCSS関連</li>
          <li onClick={() => setActiveTab("responsive-config")}>レスポンシブ関連</li>
          <li onClick={() => setActiveTab("variable-config")}>変数設定</li>
          <li onClick={() => setActiveTab("ai-code-generator")}>AIコード生成</li>
          <li onClick={() => setActiveTab("stylex-converter")}>StyleXコンバーター</li>
          <li onClick={() => setActiveTab("api-settings")}>API設定</li>
        </ul>
      </div>
      <div style={{
        width: "calc(100% - 220px)",
        marginLeft: "220px",
        padding: "20px",
        height: "100vh",
        overflowY: "auto"
      }}>
        {renderContent()}
      </div>
    </div>
  );
};

export default App;
