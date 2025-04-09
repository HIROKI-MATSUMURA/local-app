import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import styles from '../styles/ProjectManager.module.scss';

const ProjectManager = ({ onProjectChange }) => {
  console.log('ProjectManager コンポーネントが初期化されました');

  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProjectSettings, setActiveProjectSettings] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showDetails, setShowDetails] = useState(false);

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
        const config = await window.api.loadProjectsConfig();
        console.log('プロジェクト設定を読み込みました:', config);

        if (config && Array.isArray(config.projects)) {
          // プロジェクトリストの更新
          setProjects(config.projects);

          // アクティブプロジェクトの設定
          if (config.activeProjectId) {
            const activeProject = config.projects.find(p => p.id === config.activeProjectId);
            if (activeProject) {
              setActiveProjectId(config.activeProjectId);
              setActiveProjectSettings(activeProject.settings);
              onProjectChange && onProjectChange(activeProject);
            }
          } else if (config.projects.length > 0) {
            // アクティブプロジェクトが設定されていない場合は最初のプロジェクトを選択
            const firstProject = config.projects[0];
            setActiveProjectId(firstProject.id);
            setActiveProjectSettings(firstProject.settings);
            onProjectChange && onProjectChange(firstProject);
          }
        } else {
          console.log('有効なプロジェクト設定が見つかりませんでした');
          setProjects([]);
          setActiveProjectId(null);
          setActiveProjectSettings(null);
        }
      } catch (error) {
        console.error('プロジェクト設定の読み込みに失敗:', error);
        setError('プロジェクト設定の読み込みに失敗しました');
      }
    };

    // 初回のみ実行
    loadInitialProjects();
  }, []); // onProjectChangeを依存配列から削除

  // デフォルト設定の読み込み
  useEffect(() => {
    const loadDefaultSettings = async () => {
      try {
        const defaultSettings = await window.api.loadDefaultSettings();
        if (!defaultSettings) {
          // デフォルト設定が存在しない場合、新規作成
          const defaultConfig = {
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
          };
          await window.api.saveDefaultSettings(defaultConfig);
        }
      } catch (error) {
        console.error('デフォルト設定の読み込みに失敗:', error);
      }
    };

    loadDefaultSettings();
  }, []);

  // ファイル監視の設定
  useEffect(() => {
    const watchProjectFiles = async () => {
      if (activeProjectId) {
        await window.api.watchProjectFiles(activeProjectId, (changes) => {
          console.log('プロジェクトファイルの変更を検知:', changes);
          updateProjectSettings(changes);
        });
      }
    };

    watchProjectFiles();
    return () => {
      if (activeProjectId) {
        window.api.unwatchProjectFiles(activeProjectId);
      }
    };
  }, [activeProjectId]);

  // プロジェクト設定の自動保存
  useEffect(() => {
    let timeoutId;

    if (activeProjectId && activeProjectSettings) {
      timeoutId = setTimeout(async () => {
        try {
          const activeProject = projects.find(p => p.id === activeProjectId);
          if (activeProject) {
            const updatedProject = {
              ...activeProject,
              settings: activeProjectSettings
            };
            await window.api.saveProjectSettings(updatedProject);
            console.log('プロジェクト設定を自動保存しました');
          }
        } catch (error) {
          console.error('自動保存に失敗:', error);
        }
      }, 1000);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [activeProjectId, activeProjectSettings, projects]);

  // プロジェクト設定の初期化
  const initializeProject = async (name, path) => {
    const defaultSettings = await window.api.loadDefaultSettings();
    return {
      id: uuidv4(),
      name,
      path,
      settings: defaultSettings || {
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
  const addProject = async () => {
    try {
      const result = await window.api.openProjectDialog();
      if (result) {
        const { name, path } = result;
        console.log('新規プロジェクトの情報:', { name, path });

        const newProject = await initializeProject(name, path);
        console.log('新規プロジェクトのオブジェクト:', newProject);

        // 新しいプロジェクトを保存
        const saved = await window.api.saveProjectSettings(newProject);
        console.log('プロジェクト保存結果:', saved);

        if (saved) {
          setProjects(prevProjects => [...prevProjects, newProject]);
          setActiveProjectId(newProject.id);
          setActiveProjectSettings(newProject.settings);
          onProjectChange && onProjectChange(newProject);
        } else {
          throw new Error('プロジェクトの保存に失敗しました');
        }
      }
    } catch (error) {
      console.error('プロジェクトの追加に失敗:', error);
      setError('プロジェクトの追加に失敗しました');
    }
  };

  // プロジェクトの切り替え
  const switchProject = async (projectId) => {
    try {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        setActiveProjectId(projectId);
        setActiveProjectSettings(project.settings);
        onProjectChange && onProjectChange(project);
      } else {
        throw new Error('プロジェクトが見つかりません');
      }
    } catch (error) {
      console.error('プロジェクトの切り替えに失敗:', error);
      setError('プロジェクトの切り替えに失敗しました');
    }
  };

  // プロジェクトの削除
  const removeProject = async (projectId) => {
    try {
      const updatedProjects = projects.filter(p => p.id !== projectId);
      setProjects(updatedProjects);

      if (activeProjectId === projectId) {
        const newActiveProject = updatedProjects[0] || null;
        setActiveProjectId(newActiveProject?.id || null);
        setActiveProjectSettings(newActiveProject?.settings || null);
        onProjectChange && onProjectChange(newActiveProject);
      }

      await window.api.deleteProjectSettings(projectId);
    } catch (error) {
      console.error('プロジェクトの削除に失敗:', error);
      setError('プロジェクトの削除に失敗しました');
    }
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

  // プロジェクトの検索とソート
  const filteredAndSortedProjects = projects
    .filter(project => {
      const searchLower = searchQuery.toLowerCase();
      return (
        project.name.toLowerCase().includes(searchLower) ||
        project.path.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      const aValue = a[sortBy]?.toLowerCase() || '';
      const bValue = b[sortBy]?.toLowerCase() || '';
      return sortOrder === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });

  // ソート順の切り替え
  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className={styles['project-manager']}>
      <h2>プロジェクト管理</h2>

      {error && (
        <div className={styles['error-message']}>
          {error}
        </div>
      )}

      <div className={styles['project-list']}>
        {projects.length === 0 ? (
          <div className={styles['no-projects']}>
            プロジェクトがありません
          </div>
        ) : (
          projects.map(project => (
            <div
              key={project.id}
              className={`${styles['project-item']} ${activeProjectId === project.id ? styles.active : ''}`}
              onClick={() => switchProject(project.id)}
            >
              <div className={styles['project-info']}>
                <h3>{project.name}</h3>
                <p className={styles['project-path']}>{project.path}</p>
                <div className={styles['project-details']}>
                  <p>最終更新: {project.lastModified || '未設定'}</p>
                  <p>ステータス: {project.status || 'アクティブ'}</p>
                </div>
              </div>
              <div className={styles['project-actions']}>
                <button
                  className={styles.delete}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeProject(project.id);
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button
        className={styles['add-project']}
        onClick={addProject}
      >
        プロジェクトを追加
      </button>
    </div>
  );
};

export default ProjectManager;
