import React, { useState } from "react";
import ChangeLog from "./ChangeLog";
import ResetCSS from "./ResetCSS";
import ResponsiveConfig from "./ResponsiveConfig";
import VariableConfig from "./VariableConfig";
import GenerateHTML from "./GenerateHTML";
import AICodeGenerator from "./AICodeGenerator";
import APISettings from "./APISettings";
import StyleXConverter from "./StyleXConverter";
import "../styles/css/main.css";
import "../styles/css/components.css";

const App = () => {
  const [activeTab, setActiveTab] = useState("generate-html");

  const menuItems = [
    { id: "generate-html", label: "HTMLファイル生成", icon: "📄" },
    { id: "changelog", label: "変更ログ", icon: "📝" },
    { id: "reset-css", label: "リセットCSS関連", icon: "🎨" },
    { id: "responsive-config", label: "レスポンシブ関連", icon: "📱" },
    { id: "variable-config", label: "変数設定", icon: "⚙️" },
    { id: "ai-code-generator", label: "AIコード生成", icon: "🤖" },
    { id: "stylex-converter", label: "StyleXコンバーター", icon: "🔄" },
    { id: "api-settings", label: "API設定", icon: "🔑" },
  ];

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
      case "stylex-converter":
        return <StyleXConverter />;
      case "api-settings":
        return <APISettings />;
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>CodeUps</h2>
        </div>
        <nav className="sidebar-nav">
          <ul>
            {menuItems.map((item) => (
              <li
                key={item.id}
                className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                onClick={() => setActiveTab(item.id)}
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
