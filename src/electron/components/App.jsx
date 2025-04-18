import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './Login';
import "@styles/css/main.css";
import "@styles/css/components.css";
import GenerateHTML from "./GenerateHTML";
import ResetCSS from "./ResetCSS";
import ResponsiveConfig from "./ResponsiveConfig";
import VariableConfig from "./VariableConfig";
import AICodeGenerator from "./AICodeGenerator";
import ProjectManager from "./ProjectManager";


// 出力パスの設定
const OUTPUT_PATH = '../output';

const App = () => {
  const isElectronContext = typeof window !== 'undefined' && window.api;
  console.log('App コンポーネントがレンダリングされました');  // デバッグログ追加
  const [isLoggedIn, setIsLoggedIn] = useState(false); // ★ログイン判定追加
  const SESSION_TIMEOUT_MINUTES = 180; // 3時間

  const [lastActivityTime, setLastActivityTime] = useState(Date.now());

  // アクティビティ（操作）があったら時間更新
  useEffect(() => {
    const updateActivity = () => setLastActivityTime(Date.now());

    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
    };
  }, []);

  // セッションタイムアウトチェック
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMinutes = (now - lastActivityTime) / (1000 * 60);
      if (elapsedMinutes > SESSION_TIMEOUT_MINUTES) {
        setIsLoggedIn(false);
        alert('セッションが切れました。再ログインしてください。');
      }
    }, 60000); // 毎分チェック

    return () => clearInterval(interval);
  }, [lastActivityTime]);


  // ログイン成功時に呼ばれる関数
  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    setActiveTab('project-manager');
  };
  const [activeTab, setActiveTab] = useState("project-manager");
  console.log('現在のアクティブタブ:', activeTab);  // デバッグログ追加

  const [activeProject, setActiveProject] = useState(null);
  const variableConfigRef = useRef(null);
  const [pythonCheck, setPythonCheck] = useState({
    showCheck: false,
    isComplete: false,
    isPythonAvailable: false
  });


  useEffect(() => {
    if (!isElectronContext) return;
    if (!window.api.fs) {
      console.warn("fs API がまだ来ていません");
      return;
    }
    window.api.fs
      .ensureDir(OUTPUT_PATH)
      .then(() => console.log(`出力ディレクトリ準備OK: ${OUTPUT_PATH}`))
      .catch((e) => console.error("ensureDir エラー", e));
  }, [isElectronContext]);
  // ——— activeProject が変わるたびに、そのプロジェクト内に output フォルダを作成 ———

  useEffect(() => {
    if (!isElectronContext || !window.api.fs || !activeProject) return;
    const projectOut = `${activeProject.path}/output`;

    window.api.fs
      .ensureDir(projectOut)
      .then(() => console.log(`プロジェクト出力先準備OK: ${projectOut}`))
      .catch((e) => console.error("プロジェクト用 ensureDir エラー", e));
  }, [isElectronContext, activeProject]);

  // プロジェクト変更時のハンドラー

  const handleProjectChange = useCallback((project) => {
    if (!project) return;

    setActiveProject(prev => {
      // 同じプロジェクトなら state を更新しない
      if (prev?.id === project.id) {
        console.log('同じプロジェクトなので更新をスキップ');
        return prev;
      }

      // path を正規化
      const normalizedPath =
        typeof project.path === 'string'
          ? project.path.replace(/\/+/g, '/')
          : '';

      return {
        ...project,
        path: normalizedPath
      };
    });
  }, []);

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

  // activeProjectが存在する場合だけメモ化
  // activeProjectが存在する場合だけメモ化
  const memoizedProject = useMemo(() => {
    if (!activeProject) return null;

    const validated = { ...activeProject };

    validated.id = typeof validated.id === 'string' && validated.id
      ? validated.id
      : 'unknown';

    validated.name = typeof validated.name === 'string' && validated.name
      ? validated.name
      : 'Unknown Project';

    if (typeof validated.path !== 'string') {
      console.error('validated.pathが文字列じゃないため、空文字にします:', validated.path);
      validated.path = '';
    } else {
      validated.path = validated.path.replace(/\/+/g, '/');
    }

    return validated;
  }, [activeProject]);

  const renderContent = () => {
    console.log('renderContent が呼び出されました。activeTab:', activeTab);

    // project-managerなら無条件で表示
    if (activeTab === 'project-manager') {
      console.log('ProjectManager コンポーネントをレンダリングします');
      return <ProjectManager onProjectChange={handleProjectChange} />;
    }

    // それ以外で、memoizedProjectがなければ警告
    if (!memoizedProject) {
      return <div>プロジェクトが選択されていません</div>;
    }

    // 各タブごとのコンポーネント表示
    switch (activeTab) {
      case "reset-css":
        return <ResetCSS activeProject={memoizedProject} />;
      case "responsive-config":
        return <ResponsiveConfig key="responsive-config-page" activeProject={memoizedProject} />;
      case "variable-config":
        return <VariableConfig ref={variableConfigRef} activeProject={memoizedProject} />;
      case "ai-code-generator":
        return <AICodeGenerator activeProject={memoizedProject} />;
      case "generate-html":
      default:
        return <GenerateHTML activeProject={memoizedProject} />;
    }
  };




  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>CreAIte Code</h2>
          {activeProject && (
            <div
              className="current-project"
              onClick={() => handleTabChange("project-manager")}
              style={{ cursor: 'pointer' }}
              title="クリックでプロジェクト管理ページに移動"
            >
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
