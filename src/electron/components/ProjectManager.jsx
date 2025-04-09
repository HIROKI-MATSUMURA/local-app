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
  const [showArchived, setShowArchived] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [projectToArchive, setProjectToArchive] = useState(null);

  // window.apiの状態をチェック
  useEffect(() => {
    console.log('window.api の状態:', {
      exists: typeof window !== 'undefined' && !!window.api,
      api: window.api ? Object.keys(window.api) : null
    });
  }, []);

  // アクティブプロジェクトの保存
  const saveActiveProject = async (projectId) => {
    try {
      await window.api.saveActiveProjectId(projectId);
      console.log('アクティブプロジェクトIDを保存しました:', projectId);
    } catch (error) {
      console.error('アクティブプロジェクトIDの保存に失敗:', error);
    }
  };

  // 初期プロジェクトの読み込み
  useEffect(() => {
    console.log('初期プロジェクト読み込みの useEffect が実行されました');

    const loadInitialProjects = async () => {
      console.log('loadInitialProjects が呼び出されました');
      try {
        const config = await window.api.loadProjectsConfig();
        console.log('プロジェクト設定を読み込みました:', config);

        if (config && Array.isArray(config.projects)) {
          setProjects(config.projects);

          // 保存されているアクティブプロジェクトIDを読み込む
          const savedActiveProjectId = await window.api.loadActiveProjectId();
          console.log('保存されていたアクティブプロジェクトID:', savedActiveProjectId);

          if (savedActiveProjectId) {
            const activeProject = config.projects.find(p => p.id === savedActiveProjectId);
            if (activeProject) {
              setActiveProjectId(savedActiveProjectId);
              setActiveProjectSettings(activeProject.settings);
              onProjectChange && onProjectChange(activeProject);
              return;
            }
          }

          // 保存されたアクティブプロジェクトが見つからない場合は最初のプロジェクトを選択
          if (config.projects.length > 0) {
            const firstProject = config.projects[0];
            setActiveProjectId(firstProject.id);
            setActiveProjectSettings(firstProject.settings);
            onProjectChange && onProjectChange(firstProject);
            await saveActiveProject(firstProject.id);
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

    loadInitialProjects();
  }, []);

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

  // プロジェクトのバージョン更新
  const updateProjectVersion = (project, type = 'patch') => {
    const [major, minor, patch] = (project.version || '0.1.0').split('.').map(Number);
    let newVersion;

    switch (type) {
      case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
      case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
      case 'patch':
      default:
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
    }

    const versionHistory = project.versionHistory || [];
    versionHistory.push({
      version: newVersion,
      date: new Date().toISOString(),
      description: `Version ${newVersion}`
    });

    return {
      ...project,
      version: newVersion,
      versionHistory,
      lastModified: new Date().toISOString()
    };
  };

  // プロジェクトの追加
  const addProject = async () => {
    try {
      const result = await window.api.openProjectDialog();
      if (result) {
        const { filePath, name } = result;
        const newProject = await initializeProject(name, filePath);

        // 既存のプロジェクトをチェック
        const existingProject = projects.find(p => p.path === filePath);
        if (existingProject) {
          setError('選択されたフォルダは既にプロジェクトとして登録されています');
          return;
        }

        const now = new Date().toISOString();
        const completeProject = {
          ...newProject,
          created: now,
          lastModified: now,
          lastAccessed: now,
          version: '0.1.0',
          versionHistory: [
            {
              version: '0.1.0',
              date: now,
              description: '初期バージョン'
            }
          ],
          isArchived: false
        };

        const updatedProjects = [...projects, completeProject];
        setProjects(updatedProjects);

        // プロジェクト設定を保存
        await window.api.saveProjectSettings(completeProject);

        // プロジェクトの切り替え
        switchProject(completeProject.id);
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
      if (project && !project.isArchived) {
        setActiveProjectId(projectId);
        setActiveProjectSettings(project.settings);

        // 最終アクセス日時を更新
        const updatedProject = {
          ...project,
          lastAccessed: new Date().toISOString()
        };

        // プロジェクトリストを更新
        const updatedProjects = projects.map(p =>
          p.id === projectId ? updatedProject : p
        );
        setProjects(updatedProjects);

        // プロジェクト設定を保存
        await window.api.saveProjectSettings(updatedProject);
        await saveActiveProject(projectId);
        onProjectChange && onProjectChange(updatedProject);
      }
    } catch (error) {
      console.error('プロジェクトの切り替えに失敗:', error);
      setError('プロジェクトの切り替えに失敗しました');
    }
  };

  // プロジェクトの削除
  const removeProject = async (projectId) => {
    try {
      const confirmed = window.confirm('本当にこのプロジェクトを削除しますか？');
      if (!confirmed) return;

      const updatedProjects = projects.filter(p => p.id !== projectId);
      setProjects(updatedProjects);

      // アクティブプロジェクトが削除された場合
      if (activeProjectId === projectId) {
        if (updatedProjects.length > 0) {
          const firstProject = updatedProjects[0];
          setActiveProjectId(firstProject.id);
          setActiveProjectSettings(firstProject.settings);
          await saveActiveProject(firstProject.id);
          onProjectChange && onProjectChange(firstProject);
        } else {
          setActiveProjectId(null);
          setActiveProjectSettings(null);
          await saveActiveProject(null);
          onProjectChange && onProjectChange(null);
        }
      }

      // 設定ファイルに保存
      await window.api.deleteProjectSettings(projectId);

      // 注意: window.api.saveProjectsConfigはAPIに存在しないため削除しました
      // 各プロジェクトの設定はindividualに保存されています
    } catch (error) {
      console.error('プロジェクトの削除に失敗:', error);
      setError('プロジェクトの削除に失敗しました');
    }
  };

  // プロジェクトのアーカイブ
  const archiveProject = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setProjectToArchive(project);
      setArchiveReason('');
      setShowArchiveDialog(true);
    }
  };

  // アーカイブの確定
  const confirmArchive = async () => {
    try {
      if (!projectToArchive) return;

      const now = new Date().toISOString();
      const archivedProject = {
        ...projectToArchive,
        isArchived: true,
        archivedDate: now,
        archiveReason: archiveReason,
        lastModified: now
      };

      const updatedProjects = projects.map(p =>
        p.id === projectToArchive.id ? archivedProject : p
      );
      setProjects(updatedProjects);

      // アクティブプロジェクトがアーカイブされた場合
      if (activeProjectId === projectToArchive.id) {
        const activeProjects = updatedProjects.filter(p => !p.isArchived);
        if (activeProjects.length > 0) {
          const firstProject = activeProjects[0];
          await switchProject(firstProject.id);
        } else {
          setActiveProjectId(null);
          setActiveProjectSettings(null);
          await saveActiveProject(null);
          onProjectChange && onProjectChange(null);
        }
      }

      // プロジェクト設定を保存
      await window.api.saveProjectSettings(archivedProject);

      // 注意: window.api.saveProjectsConfigはAPIに存在しないため削除しました
      // 各プロジェクトの設定はindividualに保存されています

      setShowArchiveDialog(false);
      setProjectToArchive(null);
    } catch (error) {
      console.error('プロジェクトのアーカイブに失敗:', error);
      setError('プロジェクトのアーカイブに失敗しました');
    }
  };

  // アーカイブからの復元
  const restoreProject = async (projectId) => {
    try {
      const confirmed = window.confirm('このプロジェクトをアーカイブから復元しますか？');
      if (!confirmed) return;

      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const restoredProject = {
        ...project,
        isArchived: false,
        archivedDate: null,
        archiveReason: null,
        lastModified: new Date().toISOString()
      };

      const updatedProjects = projects.map(p =>
        p.id === projectId ? restoredProject : p
      );
      setProjects(updatedProjects);

      // プロジェクト設定を保存
      await window.api.saveProjectSettings(restoredProject);

      // 注意: window.api.saveProjectsConfigはAPIに存在しないため削除しました
      // 各プロジェクトの設定はindividualに保存されています
    } catch (error) {
      console.error('プロジェクトの復元に失敗:', error);
      setError('プロジェクトの復元に失敗しました');
    }
  };

  // フィルタリングされたプロジェクトリスト
  const filteredProjects = projects.filter(project =>
    showArchived ? project.isArchived : !project.isArchived
  );

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

      <div className={styles['view-controls']}>
        <button
          className={`${styles['view-toggle']} ${!showArchived ? styles.active : ''}`}
          onClick={() => setShowArchived(false)}
        >
          アクティブ
        </button>
        <button
          className={`${styles['view-toggle']} ${showArchived ? styles.active : ''}`}
          onClick={() => setShowArchived(true)}
        >
          アーカイブ済み
        </button>
      </div>

      <div className={styles['project-list']}>
        {filteredProjects.length === 0 ? (
          <div className={styles['no-projects']}>
            {showArchived
              ? 'アーカイブされたプロジェクトはありません'
              : 'プロジェクトがありません'}
          </div>
        ) : (
          filteredProjects.map(project => (
            <div
              key={project.id}
              className={`${styles['project-item']} ${activeProjectId === project.id ? styles.active : ''}`}
              onClick={() => !project.isArchived && switchProject(project.id)}
            >
              <div className={styles['project-info']}>
                <h3>{project.name} <span className={styles.version}>v{project.version || '0.1.0'}</span></h3>
                <p className={styles['project-path']}>{project.path}</p>
                <div className={styles['project-details']}>
                  <p>作成日: {project.created ? new Date(project.created).toLocaleDateString('ja-JP') : '未設定'}</p>
                  <p>最終更新: {project.lastModified ? new Date(project.lastModified).toLocaleDateString('ja-JP') : '未設定'}</p>
                  {project.isArchived && (
                    <>
                      <p>アーカイブ日: {project.archivedDate ? new Date(project.archivedDate).toLocaleDateString('ja-JP') : '不明'}</p>
                      {project.archiveReason && <p>理由: {project.archiveReason}</p>}
                    </>
                  )}
                </div>
              </div>
              <div className={styles['project-actions']}>
                {project.isArchived ? (
                  <button
                    className={styles.restore}
                    onClick={(e) => {
                      e.stopPropagation();
                      restoreProject(project.id);
                    }}
                  >
                    復元
                  </button>
                ) : (
                  <>
                    <button
                      className={styles.archive}
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveProject(project.id);
                      }}
                    >
                      アーカイブ
                    </button>
                    <button
                      className={styles.delete}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeProject(project.id);
                      }}
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {!showArchived && (
        <button
          className={styles['add-project']}
          onClick={addProject}
        >
          プロジェクトを追加
        </button>
      )}

      {showArchiveDialog && (
        <div className={styles['archive-dialog']}>
          <div className={styles['archive-dialog-content']}>
            <h3>プロジェクトをアーカイブ</h3>
            <p>{projectToArchive ? projectToArchive.name : ''}をアーカイブします。</p>
            <div className={styles['form-group']}>
              <label htmlFor="archive-reason">アーカイブの理由（任意）:</label>
              <input
                id="archive-reason"
                type="text"
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="アーカイブの理由を入力してください"
              />
            </div>
            <div className={styles['dialog-actions']}>
              <button
                className={styles.cancel}
                onClick={() => {
                  setShowArchiveDialog(false);
                  setProjectToArchive(null);
                }}
              >
                キャンセル
              </button>
              <button
                className={styles.confirm}
                onClick={confirmArchive}
              >
                アーカイブ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectManager;
