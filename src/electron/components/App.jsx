import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { BrowserRouter, Routes, Route, HashRouter } from 'react-router-dom';
import Login from './Login';
import "../styles/main.css";
// スタイルファイルの存在を確認し、存在しない場合はコメントアウト
// import "../styles/components.css";
import GenerateHTML from "./GenerateHTML";
import ResetCSS from "./ResetCSS";
import ResponsiveConfig from "./ResponsiveConfig";
import VariableConfig from "./VariableConfig";
import AICodeGenerator from "./AICodeGenerator";
import ProjectManager from "./ProjectManager";
import InitialSetup from './InitialSetup';




// 出力パスの設定
const OUTPUT_PATH = '../output';

const App = () => {
  const isElectronContext = useMemo(() => typeof window !== 'undefined' && window.api, []);
  // デバッグログを削減（必要時のみ）
  // console.log('App コンポーネントがレンダリングされました');
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


  const [activeTab, setActiveTab] = useState("project-manager");
  
  // ログイン成功時に呼ばれる関数
  const handleLoginSuccess = useCallback(() => {
    setIsLoggedIn(true);
    setActiveTab('project-manager');
  }, []);
  
  // デバッグログを削減（必要時のみ）
  // console.log('現在のアクティブタブ:', activeTab);

  const [activeProject, setActiveProject] = useState(null);
  const variableConfigRef = useRef(null);
  const [pythonCheck, setPythonCheck] = useState({
    showCheck: false,
    isComplete: false,
    isPythonAvailable: false
  });


  useEffect(() => {
    if (!isElectronContext || !window.api?.fs) return;
    
    window.api.fs.ensureDir(OUTPUT_PATH)
      .then((result) => {
        if (result?.success) {
          console.log(`出力ディレクトリ準備OK: ${OUTPUT_PATH}`);
        } else {
          console.error("ensureDir エラー", result?.error || '不明なエラー');
        }
      })
      .catch((e) => console.error("ensureDir エラー", e));
  }, [isElectronContext]);
  // ——— activeProject が変わるたびに、そのプロジェクト内に output フォルダを作成 ———

  useEffect(() => {
    if (!isElectronContext || !window.api?.fs || !activeProject?.path) return;
    
    const projectOut = `${activeProject.path}/output`;
    window.api.fs.ensureDir(projectOut)
      .then((result) => {
        if (result?.success) {
          console.log(`プロジェクト出力先準備OK: ${projectOut}`);
        } else {
          console.error("プロジェクト用 ensureDir エラー", result?.error || '不明なエラー');
        }
      })
      .catch((e) => console.error("プロジェクト用 ensureDir エラー", e));
  }, [isElectronContext, activeProject?.path]);

  // activeProjectの変更をログに出力（デバッグ時のみ）
  // useEffect(() => {
  //   console.log('activeProject更新:', activeProject);
  // }, [activeProject]);

  const handleProjectChange = useCallback((project) => {
    if (!project) return;

    // デバッグログ削減
    // console.log('handleProjectChange called with:', project);

    setActiveProject(prev => {
      // 同じプロジェクトなら state を更新しない
      if (prev?.id === project.id && 
          prev?.name === project.name && 
          prev?.path === project.path &&
          prev?.category === project.category) {
        // console.log('同じプロジェクトなので更新をスキップ');
        return prev;
      }

      // 新しいプロジェクト情報を詳細にログ出力（デバッグ時のみ）
      // console.log('プロジェクト情報更新:', {
      //   id: project.id,
      //   name: project.name,
      //   category: project.category,
      //   tags: project.tags
      // });

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

  const menuItems = useMemo(() => [
    { id: "project-manager", label: "プロジェクト管理", icon: "📁" },
    { id: "generate-html", label: "HTMLファイル生成", icon: "📄" },
    { id: "reset-css", label: "リセットCSS関連", icon: "🎨" },
    { id: "responsive-config", label: "レスポンシブ関連", icon: "📱" },
    { id: "variable-config", label: "変数設定", icon: "⚙️" },
    { id: "ai-code-generator", label: "AIコード生成", icon: "🤖" },
  ], []);

  // タブ切り替え前に未保存の変更をチェック
  const handleTabChange = useCallback((newTabId) => {
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
  }, [activeTab]);

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
  }, [activeProject?.id, activeProject?.name, activeProject?.path, activeProject?.category]);

  const renderContent = useCallback(() => {
    // デバッグログを制限（連続呼び出しを避ける）
    if (Math.random() < 0.1) { // 10%の確率でログ出力
      console.log('renderContent が呼び出されました。activeTab:', activeTab);
    }

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
  }, [activeTab, memoizedProject, handleProjectChange]);

  if (!isLoggedIn) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/" element={<Login onLoginSuccess={handleLoginSuccess} />} />
          <Route path="/setup" element={<InitialSetup />} />
        </Routes>
      </HashRouter>
    );
  }


  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>CreAIteCode</h2>
          {memoizedProject && (
            <div
              className="current-project"
              onClick={() => handleTabChange("project-manager")}
              style={{ cursor: 'pointer' }}
              title="クリックでプロジェクト管理ページに移動"
            >
              <span className="project-name">{memoizedProject.name}</span>
              <div className="project-meta">
                {memoizedProject.category && (
                  <span
                    className="project-category"
                    style={{}}
                  >
                    {memoizedProject.category}
                  </span>
                )}
                {memoizedProject.tags && memoizedProject.tags.length > 0 && (
                  <div className="project-tags">
                    {memoizedProject.tags.map(tag => (
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
