import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import '../styles/css/components.css';

const ProjectManager = ({ onProjectChange }) => {
  console.log('ProjectManager コンポーネントが初期化されました');

  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProjectSettings, setActiveProjectSettings] = useState(null);

  // window.apiの状態をチェック
  useEffect(() => {
    console.log('window.api の状態:', {
      exists: typeof window !== 'undefined' && !!window.api,
      api: window.api ? Object.keys(window.api) : null
    });
  }, []);

  // 初期プロジェクトの読み込み
  useEffect(() => {
    console.log('初期プロジェクト読み込みの useEffect が実行されました');

    const loadInitialProjects = async () => {
      console.log('loadInitialProjects が呼び出されました');
      try {
        console.log('window.api.loadProjectsConfig を呼び出します');
        const config = await window.api.loadProjectsConfig();
        console.log('プロジェクト設定を読み込みました:', config);
        setProjects(config.projects || []);
        if (config.activeProjectId) {
          setActiveProjectId(config.activeProjectId);
          const activeProject = config.projects.find(p => p.id === config.activeProjectId);
          if (activeProject) {
            setActiveProjectSettings(activeProject.settings);
            onProjectChange && onProjectChange(activeProject);
          }
        }
      } catch (error) {
        console.error('プロジェクト設定の読み込みに失敗:', error);
      }
    };

    loadInitialProjects();
  }, [onProjectChange]);

  // プロジェクト設定の初期化
  const initializeProject = (name, path) => {
    return {
      id: uuidv4(),
      name,
      path,
      settings: {
        htmlGenerator: {
          template: 'default',
          options: {}
        },
        resetCss: {
          enabled: true,
          customRules: [],
          vendorPrefixes: ['-webkit-', '-moz-', '-ms-']
        },
        responsive: {
          breakpoints: {
            mobile: '320px',
            tablet: '768px',
            desktop: '1024px'
          }
        },
        variables: {
          colors: {},
          fonts: {},
          spacing: {}
        },
        aiCodeGenerator: {
          provider: 'claude',
          model: 'claude-3-opus',
          temperature: 0.7
        }
      }
    };
  };

  // プロジェクトの追加
  const addProject = async (name, path) => {
    const newProject = initializeProject(name, path);
    const updatedProjects = [...projects, newProject];
    setProjects(updatedProjects);
    setActiveProjectId(newProject.id);
    setActiveProjectSettings(newProject.settings);

    // プロジェクト設定の保存
    await window.api.saveProjectSettings(newProject);
    // 親コンポーネントに通知
    onProjectChange && onProjectChange(newProject);
  };

  // プロジェクトの切り替え
  const switchProject = async (projectId) => {
    setActiveProjectId(projectId);
    // プロジェクト設定の読み込み
    const project = await window.api.loadProjectSettings(projectId);
    if (project) {
      setActiveProjectSettings(project.settings);
      // 親コンポーネントに通知
      onProjectChange && onProjectChange(project);
    }
  };

  // プロジェクトの削除
  const removeProject = async (projectId) => {
    const updatedProjects = projects.filter(p => p.id !== projectId);
    setProjects(updatedProjects);

    if (activeProjectId === projectId) {
      const newActiveProject = updatedProjects[0] || null;
      setActiveProjectId(newActiveProject?.id || null);
      setActiveProjectSettings(newActiveProject?.settings || null);
      // 親コンポーネントに通知
      onProjectChange && onProjectChange(newActiveProject);
    }

    // プロジェクト設定の削除
    await window.api.deleteProjectSettings(projectId);
  };

  // プロジェクト設定の更新
  const updateProjectSettings = async (newSettings) => {
    if (!activeProjectId) return;

    const updatedProjects = projects.map(project => {
      if (project.id === activeProjectId) {
        return {
          ...project,
          settings: newSettings
        };
      }
      return project;
    });

    setProjects(updatedProjects);
    setActiveProjectSettings(newSettings);

    // プロジェクト設定の保存
    const activeProject = updatedProjects.find(p => p.id === activeProjectId);
    if (activeProject) {
      await window.api.saveProjectSettings(activeProject);
    }
  };

  return (
    <div className="project-manager">
      <h2 className="section-title">プロジェクト管理</h2>
      <div className="project-list">
        {projects.length === 0 ? (
          <div className="no-projects-message">
            プロジェクトがありません。新しいプロジェクトを追加してください。
          </div>
        ) : (
          projects.map(project => (
            <div
              key={project.id}
              className={`project-item ${activeProjectId === project.id ? 'active' : ''}`}
              onClick={() => switchProject(project.id)}
            >
              <div className="project-info">
                <div className="project-name">{project.name}</div>
                <div className="project-path">{project.path}</div>
              </div>
              <button
                className="delete-button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeProject(project.id);
                }}
              >
                削除
              </button>
            </div>
          ))
        )}
      </div>
      <button
        className="primary-button add-project-button"
        onClick={async () => {
          const result = await window.api.openProjectDialog();
          if (result) {
            await addProject(result.name, result.path);
          }
        }}
      >
        プロジェクトを追加
      </button>
    </div>
  );
};

export default ProjectManager;
