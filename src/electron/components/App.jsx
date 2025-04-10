import React, { useState, useRef, useEffect } from "react";
import "@styles/css/main.css";
import "@styles/css/components.css";
import GenerateHTML from "./GenerateHTML";
import ResetCSS from "./ResetCSS";
import ResponsiveConfig from "./ResponsiveConfig";
import VariableConfig from "./VariableConfig";
import AICodeGenerator from "./AICodeGenerator";
import ProjectManager from "./ProjectManager";

// Electronコンテキストかどうかを判定
const isElectronContext = typeof window !== 'undefined' && window.api;

// 出力パスの設定
const OUTPUT_PATH = '../output';

const App = () => {
  console.log('App コンポーネントがレンダリングされました');  // デバッグログ追加

  const [activeTab, setActiveTab] = useState("project-manager");
  console.log('現在のアクティブタブ:', activeTab);  // デバッグログ追加

  const [activeProject, setActiveProject] = useState(null);
  const variableConfigRef = useRef(null);
  const [pythonCheck, setPythonCheck] = useState({
    showCheck: false,
    isComplete: false,
    isPythonAvailable: false
  });

  // Electron環境かどうかをコンソールに出力（デバッグ用）
  useEffect(() => {
    console.log('Appコンポーネントがマウントされました');
    console.log('初期タブ:', activeTab);
    console.log('Electron API 利用可能:', isElectronContext ? 'はい' : 'いいえ');
    console.log('現在のプロジェクト:', activeProject);

    // 出力ディレクトリの存在確認と作成（Electron環境の場合）
    if (isElectronContext && window.api.fs) {
      window.api.fs.ensureDir(OUTPUT_PATH)
        .then(() => console.log(`出力ディレクトリを確認しました: ${OUTPUT_PATH}`))
        .catch(err => console.error('出力ディレクトリの確認に失敗しました:', err));
    }
  }, [activeProject, activeTab]);

  // プロジェクト変更時のハンドラー
  const handleProjectChange = (project) => {
    console.log('プロジェクト変更:', project);
    setActiveProject(project);
  };

  const menuItems = [
    { id: "project-manager", label: "プロジェクト管理", icon: "📁" },
    { id: "generate-html", label: "HTMLファイル生成", icon: "📄" },
    { id: "reset-css", label: "リセットCSS関連", icon: "🎨" },
    { id: "responsive-config", label: "レスポンシブ関連", icon: "📱" },
    { id: "variable-config", label: "変数設定", icon: "⚙️" },
    { id: "ai-code-generator", label: "AIコード生成", icon: "🤖" },
  ];

  // タブ切り替え前に未保存の変更をチェック
  const handleTabChange = (newTabId) => {
    console.log('タブ切り替え開始:', newTabId);

    // 現在のタブと新しいタブが同じ場合は何もしない
    if (activeTab === newTabId) {
      console.log('同じタブへの切り替えは無視します');
      return;
    }

    // 未保存の変更がある場合の確認
    if (activeTab === "variable-config" &&
      variableConfigRef.current &&
      variableConfigRef.current.hasUnsavedChanges()) {
      const confirmed = window.confirm('変更が保存されていません。このページを離れますか？');
      if (!confirmed) {
        console.log('タブ切り替えをキャンセルしました');
        return;
      }
    }

    // タブを切り替える
    console.log('タブを切り替えます:', newTabId);
    setActiveTab(newTabId);

    // Electron APIを使用してタブ切り替えを通知
    if (window.api && window.api.switchTab) {
      console.log('Electron APIを使用してタブ切り替えを通知');
      window.api.switchTab(newTabId);
    }
  };

  const renderContent = () => {
    console.log('renderContent が呼び出されました。activeTab:', activeTab);  // デバッグログ追加
    switch (activeTab) {
      case "project-manager":
        console.log('ProjectManager コンポーネントをレンダリングします');  // デバッグログ追加
        return <ProjectManager onProjectChange={handleProjectChange} />;
      case "reset-css":
        return <ResetCSS activeProject={activeProject} />;
      case "responsive-config":
        return <ResponsiveConfig activeProject={activeProject} />;
      case "variable-config":
        return <VariableConfig ref={variableConfigRef} activeProject={activeProject} />;
      case "ai-code-generator":
        return <AICodeGenerator activeProject={activeProject} />;
      case "generate-html":
      default:
        return <GenerateHTML activeProject={activeProject} />;
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>CreAIte Code</h2>
          {activeProject && (
            <div className="current-project">
              <span className="project-name">{activeProject.name}</span>
              <div className="project-meta">
                {activeProject.category && (
                  <span
                    className="project-category"
                    style={{}}
                  >
                    {activeProject.category}
                  </span>
                )}
                {activeProject.tags && activeProject.tags.length > 0 && (
                  <div className="project-tags">
                    {activeProject.tags.map(tag => (
                      <span key={tag} className="project-tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <nav className="sidebar-nav">
          <ul>
            {menuItems.map((item) => (
              <li
                key={item.id}
                className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('メニュー項目クリック:', item.id);
                  handleTabChange(item.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
