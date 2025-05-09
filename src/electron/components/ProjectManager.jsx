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

  // カテゴリとタグの状態管理
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTags, setSelectedTags] = useState([]);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [projectForTags, setProjectForTags] = useState(null);
  const [tagsInput, setTagsInput] = useState('');
  const [showDeleteCategoryDialog, setShowDeleteCategoryDialog] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [showManageTagsDialog, setShowManageTagsDialog] = useState(false);
  const [forceRender, setForceRender] = useState(false); // 強制再レンダリング用の状態

  // カテゴリとタグのローディング状態を追跡
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // window.apiの状態をチェック
  useEffect(() => {
    const checkApiAndLoadData = async () => {
      try {
        if (window.api) {
          console.log('window.api が利用可能です。データの読み込みを開始します。');

          // プロジェクト一覧の読み込み
          try {
            const projectsConfig = await window.api.loadProjectsConfig();
            if (projectsConfig && projectsConfig.projects) {
              console.log('プロジェクト一覧を読み込みました:', projectsConfig.projects.length);
              setProjects(projectsConfig.projects);
            }
          } catch (error) {
            console.error('プロジェクト一覧の読み込みに失敗:', error);
          }

          try {
            // カテゴリの読み込み（同期版）
            const loadedCategories = window.api.loadCategoriesSync();
            console.log('カテゴリの同期読み込み完了:', loadedCategories);

            // プロジェクトから使用されているカテゴリを収集
            const projectCategories = [...new Set(projects.map(p => p.category).filter(Boolean))];
            console.log('プロジェクトから検出されたカテゴリ:', projectCategories);

            // デフォルトカテゴリを定義
            const defaultCategories = ['uncategorized', '制作会社', 'コミュニティ', 'エンド'];

            // 全てのカテゴリをマージ
            const allCategories = [...new Set([
              ...loadedCategories,
              ...projectCategories,
              ...defaultCategories
            ])];

            console.log('最終カテゴリリスト:', allCategories);
            setCategories(allCategories);

            // 更新されたカテゴリを保存
            await window.api.saveCategories(allCategories);
            console.log('カテゴリの保存が完了しました');

            // 選択されたカテゴリの読み込み（同期版）
            const category = window.api.loadSelectedCategory();
            console.log('選択されたカテゴリの読み込み完了:', category);
            setSelectedCategory(category || 'all');

            // タグの読み込み（同期版）
            const loadedTags = window.api.loadTagsSync();
            console.log('タグの同期読み込み完了:', loadedTags);
            setTags(loadedTags || []);

            // 選択されたタグの読み込み（同期版）
            const selectedTagsList = window.api.loadSelectedTagsSync();
            console.log('選択されたタグの同期読み込み完了:', selectedTagsList);
            setSelectedTags(selectedTagsList || []);

            // カテゴリロード完了フラグをセット
            setCategoriesLoaded(true);
            console.log('カテゴリとタグの読み込みが完了しました');
          } catch (error) {
            console.error('カテゴリとタグの読み込み中にエラーが発生:', error);
            setError('カテゴリとタグの読み込みに失敗しました');
          }

          // アクティブプロジェクトIDの読み込み
          try {

          } catch (error) {
            console.error('アクティブプロジェクトIDの読み込みに失敗:', error);
          }
        } else {
          console.error('window.api が利用できません');
          setError('APIが初期化されていません。アプリを再起動してください。');
        }
      } catch (error) {
        console.error('データ読み込み中にエラーが発生:', error);
        setError('データの読み込みに失敗しました');
      }
    };

    checkApiAndLoadData();
  }, []);

  // ——— カテゴリ＆タグの読み込みが終わったら activeProjectId だけセット ———
  useEffect(() => {
    if (!categoriesLoaded) return;
    (async () => {
      const savedId = await window.api.loadActiveProjectId();
      if (savedId) {
        setActiveProjectId(savedId);
      }
    })();
  }, [categoriesLoaded]);
  // ——— activeProjectId が変わったタイミングだけ親に通知 ———
  useEffect(() => {
    if (!activeProjectId) return;
    const p = projects.find(p => p.id === activeProjectId);
    if (p && onProjectChange) {
      onProjectChange(p);
    }
  }, [activeProjectId, projects, onProjectChange]);


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
        try {
          // プロジェクトパスを取得
          const activeProject = projects.find(p => p.id === activeProjectId);
          if (!activeProject || !activeProject.path) {
            console.error('アクティブプロジェクトが見つからないか、パスが無効です');
            return;
          }

          console.log(`プロジェクト[${activeProjectId}]のファイル監視を開始します`);
          console.log(`プロジェクトパス: ${activeProject.path}`);

          // 監視パターン（設定ファイルの変更などの監視に焦点）
          const patterns = ['**/*.json', '**/*.js', '**/*.html'];

          // ファイル監視を開始
          const result = await window.api.watchProjectFiles(
            activeProjectId,
            activeProject.path,
            patterns
          );

          console.log('ファイル監視の開始結果:', result);
        } catch (error) {
          console.error('ファイル監視の開始に失敗:', error);
        }
      }
    };

    watchProjectFiles();

    // アンマウント時に監視を停止
    return () => {
      if (activeProjectId) {
        try {
          console.log(`プロジェクト[${activeProjectId}]のファイル監視を停止します`);
          window.api.unwatchProjectFiles(activeProjectId)
            .then(result => console.log('ファイル監視の停止結果:', result))
            .catch(error => console.error('ファイル監視の停止に失敗:', error));
        } catch (error) {
          console.error('ファイル監視停止中にエラーが発生:', error);
        }
      }
    };
  }, [activeProjectId, projects]);

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
  const initializeProject = async (name, projectPath) => {
    try {
      console.log('プロジェクト初期化中:', { name, path: projectPath });

      if (!projectPath) {
        console.error('パスが指定されていません');
        throw new Error('プロジェクトパスが指定されていません');
      }

      // パスの型を確認し、明示的に文字列に変換
      if (typeof projectPath !== 'string') {
        console.error('プロジェクトパスが文字列ではありません:', typeof projectPath);
        if (projectPath === null || projectPath === undefined) {
          throw new Error('プロジェクトパスがnullまたはundefinedです');
        }
        // 文字列に変換を試みる
        try {
          projectPath = String(projectPath);
          console.log('プロジェクトパスを文字列に変換しました:', projectPath);
        } catch (error) {
          console.error('プロジェクトパスの文字列変換に失敗しました:', error);
          throw new Error('プロジェクトパスの変換に失敗しました');
        }
      }

      // パスの最後の部分を取得（OSに依存しないように両方のパスセパレータで処理）
      const getBaseName = (path) => {
        if (typeof path !== 'string') {
          console.error('getBaseName: パスが文字列ではありません:', typeof path);
          return '無名プロジェクト';
        }
        const normalizedPath = path.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        return parts[parts.length - 1] || '無名プロジェクト';
      };

      const defaultSettings = await window.api.loadDefaultSettings();
      return {
        id: uuidv4(),
        name: name || getBaseName(projectPath),
        path: projectPath, // 既に文字列に変換済み
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
    } catch (error) {
      console.error('プロジェクト初期化エラー:', error);
      throw error;
    }
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
      console.log('プロジェクト追加ダイアログを開始します');

      const result = await window.api.openProjectDialog();
      console.log('プロジェクト選択結果:', result);

      if (!result) {
        console.log('プロジェクト追加がキャンセルされました');
        return;
      }

      if (result.error) {
        console.error('プロジェクト選択エラー:', result.message);
        setError(`プロジェクト選択中にエラーが発生しました: ${result.message}`);
        return;
      }

      // 結果からプロパティを抽出し、型の確認と変換を行う
      let { path: projectPath, name } = result;

      // プロジェクトパスの検証
      if (!projectPath) {
        console.error('プロジェクトパスが指定されていません');
        setError('プロジェクトパスが無効です');
        return;
      }

      // パスの型を確認（文字列でない場合は変換を試みる）
      if (typeof projectPath !== 'string') {
        console.error('プロジェクトパスが文字列ではありません:', typeof projectPath);
        console.error('プロジェクトパスの内容:', projectPath);

        try {
          // 文字列への変換を試みる
          projectPath = String(projectPath);
          console.log('プロジェクトパスを文字列に変換しました:', projectPath);
        } catch (error) {
          console.error('プロジェクトパスの文字列変換に失敗しました:', error);
          setError('プロジェクトパスの形式が無効です');
          return;
        }
      }

      // 名前の検証（名前が無効な場合はパスから取得）
      if (!name || typeof name !== 'string') {
        console.log('プロジェクト名が無効なため、パスから取得します');
        name = path.basename(projectPath);
      }

      console.log('検証済みプロジェクト情報:', { name, path: projectPath, pathType: typeof projectPath });

      // 既存のプロジェクトをチェック（パスの正規化と厳密な比較）
      const normalizedNewPath = projectPath.replace(/\\/g, '/').toLowerCase().trim();
      console.log('正規化されたパス:', normalizedNewPath);

      const existingProject = projects.find(p => {
        if (!p.path) return false;
        const normalizedExistingPath = (p.path || '').replace(/\\/g, '/').toLowerCase().trim();
        const isMatch = normalizedExistingPath === normalizedNewPath;
        if (isMatch) {
          console.log('一致するプロジェクトが見つかりました:', p);
        }
        return isMatch;
      });

      if (existingProject) {
        console.log('既存プロジェクトと衝突:', existingProject);
        setError(`選択されたフォルダ「${name}」は既にプロジェクトとして登録されています`);
        return;
      }

      console.log('新規プロジェクトを初期化します:', { name, path: projectPath });
      const newProject = await initializeProject(name, projectPath);
      console.log('プロジェクト初期化完了:', newProject);

      // プロジェクトオブジェクトの検証
      if (!newProject || typeof newProject !== 'object') {
        console.error('初期化されたプロジェクトが無効です:', newProject);
        setError('プロジェクトの初期化に失敗しました');
        return;
      }

      // パスの型を最終確認
      if (typeof newProject.path !== 'string') {
        console.error('初期化後のプロジェクトパスが文字列ではありません:', typeof newProject.path);
        console.error('初期化後のプロジェクトパスの内容:', newProject.path);

        // 致命的なエラー - この時点でパスは文字列であるべき
        setError('プロジェクトの初期化中に重大なエラーが発生しました');
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
        isArchived: false,
        category: 'uncategorized', // デフォルトカテゴリ
        tags: [] // 空のタグリスト
      };

      // 最終的なパスの検証
      console.log('最終プロジェクト情報:', {
        id: completeProject.id,
        name: completeProject.name,
        path: completeProject.path,
        pathType: typeof completeProject.path
      });

      const updatedProjects = [...projects, completeProject];
      setProjects(updatedProjects);

      // プロジェクト設定を保存
      console.log('新規プロジェクト設定を保存します');
      await window.api.saveProjectSettings(completeProject);
      console.log('プロジェクト設定が保存されました');

      // プロジェクトの切り替え
      console.log('新規プロジェクトにスイッチします:', completeProject.id);
      switchProject(null, completeProject.id);

      // カテゴリのチェックと保存
      if (!categories.includes('uncategorized')) {
        console.log('uncategorizedカテゴリを追加します');
        const updatedCategories = [...categories, 'uncategorized'];
        setCategories(updatedCategories);
        await window.api.saveCategories(updatedCategories);
      }

      console.log('プロジェクト追加が完了しました');
    } catch (error) {
      console.error('プロジェクトの追加に失敗:', error);
      setError('プロジェクトの追加に失敗しました: ' + (error.message || '不明なエラー'));
    }
  };

  // プロジェクトアクティブ化の関数を修正（クリックイベントが呼び出すもの）
  const switchProject = async (e, projectId) => {
    // eがnullの場合のチェックを追加
    if (e) {
      e.stopPropagation(); // 親要素のクリックイベントを停止
    }

    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        console.error(`プロジェクトID ${projectId} が見つかりません`);
        return;
      }

      if (project.isArchived) {
        console.error(`プロジェクト "${project.name}" はアーカイブされています`);
        return;
      }

      // プロジェクトのパスの検証
      if (!project.path) {
        console.error(`プロジェクト "${project.name}" のパスが設定されていません`);
        // 続行はするが、ログは残す
      } else if (typeof project.path !== 'string') {
        console.error(`プロジェクト "${project.name}" のパスが文字列ではありません:`, typeof project.path);
        console.error('パスの内容:', project.path);

        // パスを文字列に変換
        try {
          project.path = String(project.path || '');
          console.log(`プロジェクト "${project.name}" のパスを文字列に変換しました:`, project.path);
        } catch (error) {
          console.error(`プロジェクト "${project.name}" のパスの変換に失敗しました:`, error);
          // 続行はするが、ログは残す
        }
      }

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
      console.log('アクティブにするプロジェクト情報:', {
        id: updatedProject.id,
        name: updatedProject.name,
        path: updatedProject.path,
        pathType: typeof updatedProject.path
      });

      await window.api.saveProjectSettings(updatedProject);
      await window.api.saveActiveProjectId(projectId);
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
          await window.api.saveActiveProjectId(firstProject.id);
          if (onProjectChange) onProjectChange(firstProject);
        } else {
          setActiveProjectId(null);
          setActiveProjectSettings(null);
          await window.api.saveActiveProjectId(null);
          if (onProjectChange) onProjectChange(null);
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

      // プロジェクトリストを更新
      const updatedProjects = projects.map(p =>
        p.id === projectToArchive.id ? archivedProject : p
      );
      setProjects(updatedProjects);

      // アクティブプロジェクトがアーカイブされた場合
      if (activeProjectId === projectToArchive.id) {
        const activeProjects = updatedProjects.filter(p => !p.isArchived);
        if (activeProjects.length > 0) {
          const firstProject = activeProjects[0];
          await switchProject(null, firstProject.id);
        } else {
          setActiveProjectId(null);
          setActiveProjectSettings(null);
          await window.api.saveActiveProjectId(null);
          if (onProjectChange) onProjectChange(null);
        }
      }

      // プロジェクト設定を保存
      await window.api.saveProjectSettings(archivedProject);

      setShowArchiveDialog(false);
      setProjectToArchive(null);

      // タブを自動的にアーカイブに切り替え
      setShowArchived(true);
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

      // プロジェクトリストを更新
      const updatedProjects = projects.map(p =>
        p.id === projectId ? restoredProject : p
      );
      setProjects(updatedProjects);

      // プロジェクト設定を保存
      await window.api.saveProjectSettings(restoredProject);

      // タブを自動的にアクティブに切り替え
      setShowArchived(false);
    } catch (error) {
      console.error('プロジェクトの復元に失敗:', error);
      setError('プロジェクトの復元に失敗しました');
    }
  };

  // フィルタリングされたプロジェクトリスト
  const filteredProjects = projects.filter(project => {
    // アーカイブフィルタ
    const archiveFilter = showArchived ? project.isArchived : !project.isArchived;

    // カテゴリフィルタ
    const categoryFilter = selectedCategory === 'all' || project.category === selectedCategory;

    // タグフィルタ
    const tagFilter = selectedTags.length === 0 ||
      (project.tags && selectedTags.every(tag => project.tags.includes(tag)));

    return archiveFilter && categoryFilter && tagFilter;
  });

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
  const filteredAndSortedProjects = filteredProjects
    .filter(project => {
      const searchLower = searchQuery.toLowerCase();
      return (
        project.name.toLowerCase().includes(searchLower) ||
        project.path.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      // 作成日やアクセス日などのソート
      if (sortBy === 'created' || sortBy === 'lastModified' || sortBy === 'lastAccessed') {
        const aDate = new Date(a[sortBy] || 0).getTime();
        const bDate = new Date(b[sortBy] || 0).getTime();
        return sortOrder === 'asc' ? aDate - bDate : bDate - aDate;
      }

      // 文字列ベースのソート
      const aValue = (a[sortBy] || '').toLowerCase();
      const bValue = (b[sortBy] || '').toLowerCase();
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

  // カテゴリを削除
  const deleteCategory = async (categoryName) => {
    // protected categoriesは削除できない
    const protectedCategories = ['uncategorized'];
    if (protectedCategories.includes(categoryName)) {
      setError('このカテゴリは削除できません');
      return;
    }

    setCategoryToDelete(categoryName);
    setShowDeleteCategoryDialog(true);
    // ダイアログを表示するためにマネージダイアログを一時的に閉じる
    setShowManageTagsDialog(false);
  };

  // タグを削除
  const deleteTag = async (tagToDelete) => {
    try {
      // タグリストから削除
      const updatedTags = tags.filter(tag => tag !== tagToDelete);
      setTags(updatedTags);

      // プロジェクトからそのタグを削除
      const updatedProjects = projects.map(project => {
        if (project.tags && project.tags.includes(tagToDelete)) {
          return {
            ...project,
            tags: project.tags.filter(tag => tag !== tagToDelete),
            lastModified: new Date().toISOString()
          };
        }
        return project;
      });

      // プロジェクトリストを更新
      setProjects(updatedProjects);

      // 変更されたプロジェクトの設定を保存
      const projectsToUpdate = updatedProjects.filter(project =>
        project.tags &&
        project.tags.filter(tag => tag !== tagToDelete).length !==
        (project._originalTags || []).length
      );

      for (const project of projectsToUpdate) {
        await window.api.saveProjectSettings(project);
      }

      // タグリストを保存
      try {
        await window.api.saveTags(updatedTags);
        console.log('タグリストを更新しました:', updatedTags);
      } catch (error) {
        console.error('タグリストの保存に失敗:', error);
      }

      // 選択タグリストからも削除
      setSelectedTags(selectedTags.filter(tag => tag !== tagToDelete));
    } catch (error) {
      console.error('タグの削除に失敗:', error);
      setError('タグの削除に失敗しました');
    }
  };

  // タグを削除（管理ダイアログから）
  const deleteTagFromDialog = async (tagToDelete) => {
    await deleteTag(tagToDelete);
    // タグ削除後にダイアログを一旦閉じて再表示（リフレッシュ効果）
    setShowManageTagsDialog(false);
    setTimeout(() => setShowManageTagsDialog(true), 10);
  };

  // カテゴリ削除の確認
  const confirmDeleteCategory = async () => {
    try {
      if (!categoryToDelete) return;

      // カテゴリを削除
      const updatedCategories = categories.filter(cat => cat !== categoryToDelete);
      setCategories(updatedCategories);

      // 該当カテゴリのプロジェクトを「uncategorized」に変更
      const updatedProjects = projects.map(project => {
        if (project.category === categoryToDelete) {
          return {
            ...project,
            category: 'uncategorized',
            lastModified: new Date().toISOString()
          };
        }
        return project;
      });

      // プロジェクトリストを更新
      setProjects(updatedProjects);

      // 変更されたプロジェクトの設定を保存
      for (const project of updatedProjects) {
        if (project.category === 'uncategorized' && project.category !== categoryToDelete) {
          await window.api.saveProjectSettings(project);
        }
      }

      // カテゴリリストを保存
      try {
        await window.api.saveCategories(updatedCategories);
        console.log('カテゴリリストを更新しました:', updatedCategories);
      } catch (error) {
        console.error('カテゴリリストの保存に失敗:', error);
      }

      // 選択カテゴリが削除された場合は「all」に戻す
      if (selectedCategory === categoryToDelete) {
        setSelectedCategory('all');
      }

      setShowDeleteCategoryDialog(false);
      setCategoryToDelete(null);

      // 管理ダイアログを閉じて再表示（リフレッシュ効果）
      setShowManageTagsDialog(false);
      setTimeout(() => setShowManageTagsDialog(true), 10);
    } catch (error) {
      console.error('カテゴリの削除に失敗:', error);
      setError('カテゴリの削除に失敗しました');
    }
  };

  // カテゴリを追加
  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('カテゴリ名を入力してください');
      return;
    }

    const categoryName = newCategoryName.trim();

    // 重複チェック
    if (categories.includes(categoryName)) {
      setError('同名のカテゴリが既に存在します');
      return;
    }

    // 追加前のカテゴリを確認
    console.log('カテゴリ追加前の状態:', categories);

    // カテゴリファイルの内容を直接読み込んで確認（デバッグ用）
    try {
      const savedCategories = await window.api.loadCategories();
      console.log('追加前のカテゴリファイル内容:', savedCategories);
    } catch (error) {
      console.error('カテゴリファイル読み込みエラー:', error);
    }

    const updatedCategories = [...categories, categoryName];
    setCategories(updatedCategories);
    setNewCategoryName('');
    setShowCategoryDialog(false);

    // カテゴリを保存
    try {
      console.log('保存するカテゴリ:', updatedCategories);
      await window.api.saveCategories(updatedCategories);
      console.log('カテゴリを保存しました:', updatedCategories);

      // 保存後のカテゴリファイルを確認（デバッグ用）
      try {
        const savedCategories = await window.api.loadCategories();
        console.log('保存後のカテゴリファイル内容:', savedCategories);
      } catch (error) {
        console.error('カテゴリファイル読み込みエラー:', error);
      }
    } catch (error) {
      console.error('カテゴリの保存に失敗:', error);
      setError('カテゴリの保存に失敗しました');
    }
  };

  // プロジェクトのカテゴリを変更
  const changeProjectCategory = async (projectId, category) => {
    console.log(`プロジェクト[${projectId}]のカテゴリを変更します:`, category);

    const project = projects.find(p => p.id === projectId);
    if (!project) {
      console.error(`プロジェクト[${projectId}]が見つかりません`);
      return;
    }

    console.log('変更前のプロジェクト情報:', {
      id: project.id,
      name: project.name,
      category: project.category
    });

    const updatedProject = {
      ...project,
      category
      // lastModified を更新しない - カテゴリ変更はメタデータの変更のみ
    };

    console.log('更新後のプロジェクト情報:', {
      id: updatedProject.id,
      name: updatedProject.name,
      category: updatedProject.category
    });

    const updatedProjects = projects.map(p =>
      p.id === projectId ? updatedProject : p
    );
    setProjects(updatedProjects);

    // プロジェクト設定を保存
    await window.api.saveProjectSettings(updatedProject);

    // プロジェクトがアクティブなら親コンポーネントに通知
    if (projectId === activeProjectId && onProjectChange) {
      console.log('アクティブプロジェクトのカテゴリが変更されました。親コンポーネントに通知します:', {
        id: updatedProject.id,
        name: updatedProject.name,
        category: updatedProject.category
      });
      onProjectChange(updatedProject);
    } else {
      console.log('このプロジェクトはアクティブではないため、親コンポーネントには通知しません:', {
        projectId,
        activeProjectId,
        onProjectChangeExists: !!onProjectChange
      });
    }
  };

  // プロジェクトのタグを編集ダイアログを表示
  const openTagsDialog = (project) => {
    setProjectForTags(project);
    setTagsInput(project.tags?.join(', ') || '');
    setShowTagsDialog(true);
  };

  // プロジェクトのタグを保存
  const saveProjectTags = async () => {
    if (!projectForTags) return;

    try {
      // タグを処理（トリミング、重複除去）
      const newTags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
        .filter((tag, index, self) => self.indexOf(tag) === index);

      const updatedProject = {
        ...projectForTags,
        tags: newTags
        // lastModified を更新しない - タグ変更はメタデータの変更のみ
      };

      const updatedProjects = projects.map(p =>
        p.id === projectForTags.id ? updatedProject : p
      );
      setProjects(updatedProjects);

      // プロジェクト設定を保存
      await window.api.saveProjectSettings(updatedProject);

      // プロジェクトがアクティブなら親コンポーネントに通知
      if (projectForTags.id === activeProjectId && onProjectChange) {
        onProjectChange(updatedProject);
      }

      // 新しいタグをグローバルタグリストに追加
      const allTags = [...new Set([...tags, ...newTags])];

      // グローバルタグリストを更新
      setTags(allTags);
      await window.api.saveTags(allTags);
      console.log('タグリストを保存しました:', allTags);

      setShowTagsDialog(false);
      setProjectForTags(null);
      setTagsInput('');
    } catch (error) {
      console.error('タグの保存に失敗:', error);
      setError('タグの保存に失敗しました');
    }
  };

  // タグ管理ダイアログを表示
  const openManageTagsDialog = () => {
    setShowManageTagsDialog(true);
  };

  // カテゴリの色をハッシュ値から生成するユーティリティ関数
  const getColorForCategory = (category) => {
    // デフォルト定義されているカテゴリの色を返す
    const predefinedColors = {
      'uncategorized': { bg: '#f1f3f5', text: '#495057' },
      '制作会社': { bg: 'rgba(155, 89, 182, 0.1)', text: '#9b59b6' },
      'コミュニティ': { bg: 'rgba(241, 196, 15, 0.1)', text: '#f1c40f' },
      'エンド': { bg: 'rgba(231, 76, 60, 0.1)', text: '#e74c3c' }
    };

    if (predefinedColors[category]) {
      return predefinedColors[category];
    }

    // 文字列からハッシュ値を生成
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }

    // ハッシュ値をHSLカラーに変換（彩度と明度は固定）
    const h = Math.abs(hash) % 360;
    const s = 80;
    const l = 60;

    // HSLカラーの生成
    const color = `hsl(${h}, ${s}%, ${l}%)`;
    const bgColor = `hsla(${h}, ${s}%, ${l}%, 0.1)`;

    return { bg: bgColor, text: color };
  };

  // カテゴリごとのプロジェクト数を計算する関数
  const countProjectsByCategory = (category) => {
    if (category === 'all') {
      return projects.filter(p => !p.isArchived === !showArchived).length;
    }
    return projects.filter(p =>
      p.category === category &&
      !p.isArchived === !showArchived
    ).length;
  };

  // タグごとのプロジェクト数を計算する関数
  const countProjectsByTag = (tag) => {
    return projects.filter(p =>
      p.tags &&
      p.tags.includes(tag) &&
      !p.isArchived === !showArchived
    ).length;
  };

  // フォルダをエクスプローラーで開く関数
  const openFolderInExplorer = async (e, path) => {
    // イベントオブジェクトがある場合のみstopPropagationを呼び出す
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation(); // 親要素のクリックイベントを停止
    }

    try {
      if (path && path !== '未設定') {
        await window.api.openFolder(path);
      }
    } catch (error) {
      console.error('フォルダを開けませんでした:', error);
      setError('フォルダを開くことができませんでした');
    }
  };

  // カテゴリを選択する関数
  const selectCategory = (category) => {
    console.log(`カテゴリを選択: ${category}`);

    // 既に選択されているカテゴリかチェック
    if (selectedCategory === category) {
      console.log(`既に選択されているカテゴリです: ${category}`);
      return;
    }

    // 新しいカテゴリを設定
    setSelectedCategory(category);

    // カテゴリが存在するか確認
    if (category !== 'all' && !categories.includes(category)) {
      console.log(`警告: カテゴリ "${category}" はカテゴリリストに存在しません`);
    }

    try {
      // 選択されたカテゴリを保存（同期的に実行）
      console.log(`選択されたカテゴリを保存中: ${category}`);
      const result = window.api.saveSelectedCategory(category);
      console.log(`カテゴリ保存結果:`, result);

      // 保存を確認するために同期的に再読み込み
      const savedCategory = window.api.loadSelectedCategory();
      console.log(`保存された選択カテゴリ: ${savedCategory}`);

      // プロジェクトのフィルタリング状態を更新するために強制再レンダリング
      setForceRender(prev => !prev);
    } catch (error) {
      console.error(`カテゴリ選択の保存中にエラーが発生しました: ${error.message}`);
      setError(`カテゴリ選択の保存中にエラーが発生しました: ${error.message}`);
    }
  };

  return (
    <div className={styles['project-manager']}>
      <div className={styles['title-with-actions']}>
        <h2>プロジェクト管理</h2>
        <a
          href="https://github.com/HIROKI-MATSUMURA/for-CreAIteCode/archive/refs/heads/main.zip"
          className={styles['download-link']}
          title="専用開発ファイルをダウンロード"
          download="for-CreAIteCode.zip"
        >
          <svg className={styles['github-cat']} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
          <span className={styles['download-text']}>CreAIteCode専用ファイル</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </a>
      </div>

      {error && (
        <div className={styles['error-message']}>
          {error}
        </div>
      )}

      <div className={styles['filter-controls']}>
        <div className={styles['view-controls']}>
          <button
            className={`${styles['view-toggle']} ${!showArchived ? styles.active : ''}`}
            onClick={() => {
              console.log('アクティブタブへの切り替え');
              setShowArchived(false);
            }}
          >
            アクティブ
          </button>
          <button
            className={`${styles['view-toggle']} ${showArchived ? styles.active : ''}`}
            onClick={() => {
              console.log('アーカイブタブへの切り替え');
              setShowArchived(true);
            }}
          >
            アーカイブ済み
          </button>
        </div>

        <div className={styles['categories-filter']}>
          <div className={styles['categories-header']}>
            <h4>カテゴリ</h4>
            <div className={styles['categories-actions']}>
              <button
                className={styles['add-category']}
                onClick={() => setShowCategoryDialog(true)}
                title="カテゴリを追加"
              >
                +
              </button>
              <button
                className={styles['manage-category']}
                onClick={() => openManageTagsDialog()}
                title="カテゴリとタグを管理"
              >
                ⚙️
              </button>
            </div>
          </div>
          <div className={styles['categories-list']}>
            <button
              className={`${styles.category} ${selectedCategory === 'all' ? styles.active : ''}`}
              onClick={() => selectCategory('all')}
            >
              すべて <span className={styles['count']}>{countProjectsByCategory('all')}</span>
            </button>
            <button
              className={`${styles.category} ${selectedCategory === 'uncategorized' ? styles.active : ''}`}
              onClick={() => selectCategory('uncategorized')}
            >
              未分類 <span className={styles['count']}>{countProjectsByCategory('uncategorized')}</span>
            </button>
            {categories
              .filter(category => category !== 'uncategorized')
              .sort((a, b) => a.localeCompare(b, 'ja'))
              .map(category => (
                <button
                  key={category}
                  className={`${styles.category} ${selectedCategory === category ? styles.active : ''} ${styles[`category-${category}`] || ''}`}
                  style={!styles[`category-${category}`] ? {
                    backgroundColor: selectedCategory === category ?
                      getColorForCategory(category).text : getColorForCategory(category).bg,
                    color: selectedCategory === category ?
                      '#ffffff' : getColorForCategory(category).text,
                    borderColor: selectedCategory === category ?
                      getColorForCategory(category).text : '#e9ecef'
                  } : undefined}
                  onClick={() => selectCategory(category)}
                >
                  {category} <span className={styles['count']}>{countProjectsByCategory(category)}</span>
                </button>
              ))}
          </div>
        </div>

        <div className={styles['tags-filter']}>
          <h4>タグ</h4>
          <div className={styles['tags-list']}>
            {tags.map(tag => (
              <button
                key={tag}
                className={`${styles.tag} ${selectedTags.includes(tag) ? styles.active : ''}`}
                onClick={() => {
                  const newSelectedTags = selectedTags.includes(tag)
                    ? selectedTags.filter(t => t !== tag)
                    : [...selectedTags, tag];

                  setSelectedTags(newSelectedTags);

                  // 選択されたタグを保存
                  (async () => {
                    try {
                      const result = await window.api.saveSelectedTags(newSelectedTags);
                      console.log('選択されたタグを保存しました:', newSelectedTags, result);
                    } catch (error) {
                      console.error('選択されたタグの保存に失敗:', error);
                    }
                  })();
                }}
              >
                {tag} <span className={styles['count']}>{countProjectsByTag(tag)}</span>
              </button>
            ))}
          </div>
        </div>
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
            >
              <div className={styles['project-info']}>
                <div className={styles['project-header']}>
                  <div className={styles['name-path']}>
                    <h3>{project.name} <span className={styles.version}>v{project.version || '0.1.0'}</span></h3>
                    <p
                      className={styles['project-path']}
                      onClick={(e) => openFolderInExplorer(e, project.path)}
                      title="クリックでフォルダを開く"
                    >
                      {project.path || '未設定'}
                    </p>
                  </div>
                  <span className={`${styles.category} ${styles[`category-${project.category}`] || ''}`}
                    style={!styles[`category-${project.category}`] ? {
                      backgroundColor: getColorForCategory(project.category || 'uncategorized').bg,
                      color: getColorForCategory(project.category || 'uncategorized').text
                    } : undefined}>
                    {project.category || 'uncategorized'}
                  </span>
                </div>

                {project.tags && project.tags.length > 0 && (
                  <div className={styles['project-tags']}>
                    {project.tags.map(tag => (
                      <span key={tag} className={styles.tag}>{tag}</span>
                    ))}
                  </div>
                )}
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

                <div className={styles['project-actions']}>
                  {!project.isArchived ? (
                    <div className={styles['action-buttons']}>
                      {/* アクティブ化ボタンを追加 */}
                      <button
                        className={`${styles.activate} ${activeProjectId === project.id ? styles.active : ''}`}
                        onClick={(e) => switchProject(e, project.id)}
                        disabled={activeProjectId === project.id}
                      >
                        {activeProjectId === project.id ? 'アクティブ中' : 'アクティブにする'}
                      </button>
                      <button
                        className={styles.edit}
                        onClick={(e) => {
                          e.stopPropagation();
                          openTagsDialog(project);
                        }}
                      >
                        タグ編集
                      </button>
                      <select
                        id="category"
                        className={styles['category-select']}
                        value={project.category || 'uncategorized'}
                        onChange={(e) => changeProjectCategory(project.id, e.target.value)}
                      >
                        <option value="uncategorized">未分類</option>
                        {categories
                          .filter(c => c !== 'uncategorized')
                          .sort((a, b) => a.localeCompare(b, 'ja'))
                          .map(category => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))
                        }
                      </select>
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
                    </div>
                  ) : (
                    <button
                      className={styles.restore}
                      onClick={(e) => {
                        e.stopPropagation();
                        restoreProject(project.id);
                      }}
                    >
                      復元
                    </button>
                  )}
                </div>
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
        <div className={styles['dialog-overlay']}>
          <div className={styles['dialog-content']}>
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

      {showCategoryDialog && (
        <div className={styles['dialog-overlay']}>
          <div className={styles['dialog-content']}>
            <h3>新しいカテゴリを追加</h3>
            <div className={styles['form-group']}>
              <label htmlFor="category-name">カテゴリ名:</label>
              <input
                id="category-name"
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="カテゴリ名を入力してください"
              />
            </div>
            <div className={styles['dialog-actions']}>
              <button
                className={styles.cancel}
                onClick={() => {
                  setShowCategoryDialog(false);
                  setNewCategoryName('');
                }}
              >
                キャンセル
              </button>
              <button
                className={styles.confirm}
                onClick={addCategory}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {showTagsDialog && projectForTags && (
        <div className={styles['dialog-overlay']}>
          <div className={styles['dialog-content']}>
            <h3>タグを編集</h3>
            <p>プロジェクト「{projectForTags.name}」のタグを編集します</p>
            <div className={styles['form-group']}>
              <label htmlFor="tags-input">タグ（カンマ区切り）:</label>
              <input
                id="tags-input"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="例: 重要, 進行中, デザイン"
              />
            </div>
            <div className={styles['tags-suggestions']}>
              {tags.map(tag => (
                <button
                  key={tag}
                  className={styles['tag-suggestion']}
                  onClick={() => {
                    const currentTags = tagsInput.split(',').map(t => t.trim()).filter(t => t);
                    if (!currentTags.includes(tag)) {
                      setTagsInput(tagsInput ? `${tagsInput}, ${tag}` : tag);
                    }
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className={styles['dialog-actions']}>
              <button
                className={styles.cancel}
                onClick={() => {
                  setShowTagsDialog(false);
                  setProjectForTags(null);
                  setTagsInput('');
                }}
              >
                キャンセル
              </button>
              <button
                className={styles.confirm}
                onClick={saveProjectTags}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteCategoryDialog && (
        <div className={styles['dialog-overlay']}>
          <div className={styles['dialog-content']}>
            <h3>カテゴリを削除</h3>
            <p>カテゴリ「{categoryToDelete}」を削除しますか？</p>
            <p className={styles['warning-text']}>
              このカテゴリに属するすべてのプロジェクトは「uncategorized」カテゴリに移動します。
            </p>
            <div className={styles['dialog-actions']}>
              <button
                className={styles.cancel}
                onClick={() => {
                  setShowDeleteCategoryDialog(false);
                  setCategoryToDelete(null);
                }}
              >
                キャンセル
              </button>
              <button
                className={styles.delete}
                onClick={confirmDeleteCategory}
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {showManageTagsDialog && (
        <div className={styles['dialog-overlay']}>
          <div className={styles['dialog-content']}>
            <h3>カテゴリとタグの管理</h3>

            <div className={styles['manage-section']}>
              <h4>カテゴリ</h4>
              <div className={styles['manage-list']}>
                {categories.map(category => (
                  <div key={category} className={styles['manage-item']}>
                    <span>{category}</span>
                    {category !== 'uncategorized' && (
                      <button
                        className={styles['delete-btn']}
                        onClick={() => deleteCategory(category)}
                        title="カテゴリを削除"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                className={styles['add-btn']}
                onClick={() => {
                  setShowManageTagsDialog(false);
                  setShowCategoryDialog(true);
                }}
              >
                カテゴリを追加
              </button>
            </div>

            <div className={styles['manage-section']}>
              <h4>タグ</h4>
              <div className={styles['manage-list']}>
                {tags.map(tag => (
                  <div key={tag} className={styles['manage-item']}>
                    <span>{tag}</span>
                    <button
                      className={styles['delete-btn']}
                      onClick={() => deleteTagFromDialog(tag)}
                      title="タグを削除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles['dialog-actions']}>
              <button
                className={styles.confirm}
                onClick={() => setShowManageTagsDialog(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectManager;
