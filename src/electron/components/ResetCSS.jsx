import React, { useState, useEffect, useCallback } from 'react';
import { Controlled as CodeMirror } from 'react-codemirror2';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/mode/css/css';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/brace-fold';
import '../styles/ResetCSS.scss';
import Header from './Header';
import projectDataStore from '../utils/projectDataStore';

// デバッグフラグ
const DEBUG = true;

// Electronコンテキストかどうかを判定
const isElectronContext = typeof window !== 'undefined' && window.api;

// パス操作のためのヘルパー関数（Node.jsのpathモジュールの代替）
const pathHelper = {
  basename: (filePath) => {
    if (!filePath) return '';
    // 両方のパスセパレータに対応
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || '';
  },

  dirname: (filePath) => {
    if (!filePath) return '';
    // 両方のパスセパレータに対応
    const normalizedPath = filePath.replace(/\\/g, '/');
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    return lastSlashIndex > -1 ? normalizedPath.substring(0, lastSlashIndex) : '';
  },

  join: (...parts) => {
    // 各パーツを文字列に変換し、nullやundefinedや非文字列オブジェクトを適切に処理
    const validParts = parts.map(part => {
      // nullやundefinedは空文字に
      if (part === null || part === undefined) return '';

      // オブジェクトや配列の場合は空文字に
      if (typeof part === 'object') {
        console.warn('pathHelper.join: オブジェクト型の値が渡されました:', part);
        return '';
      }

      // 空文字列、NaN、Infinityなどの特殊な値も空文字に
      if (part === '' || Number.isNaN(part) || part === Infinity || part === -Infinity) {
        console.warn('pathHelper.join: 特殊な値が渡されました:', part);
        return '';
      }

      // それ以外は文字列に変換
      try {
        return String(part);
      } catch (error) {
        console.error('pathHelper.join: 文字列変換に失敗しました:', error);
        return '';
      }
    });

    // 値がある要素だけをフィルタリングして結合
    const path = validParts.filter(Boolean).join('/');

    // 重複スラッシュを削除して返す
    return path.replace(/\/+/g, '/');
  }
};

const ResetCSS = ({ activeProject }) => {
  console.log('ResetCSS コンポーネントがレンダリングされました');
  console.log('activeProject:', activeProject);

  const [resetCssContent, setResetCssContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false); // 処理中フラグ
  const [isSaved, setIsSaved] = useState(true); // 保存状態
  const [statusMessage, setStatusMessage] = useState(''); // ステータスメッセージ
  const [isInitialized, setIsInitialized] = useState(false); // 初期化フラグ

  // ステータスメッセージの自動クリア
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage('');
      }, 3000); // 3秒後にメッセージを消す
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // ステータス表示関数
  const showStatus = useCallback((message, autoClear = true) => {
    setStatusMessage(message);
    if (!autoClear) return;

    // 自動クリアの処理はuseEffectで行うため不要
  }, []);

  // デフォルトのリセットCSSテンプレート
  const getDefaultResetCss = () => `/*
 * リセットCSS
 * ブラウザのデフォルトスタイルをリセットするためのCSSです
 */

/* Box sizing rules */
*,
*::before,
*::after {
  box-sizing: border-box;
}

/* Remove default margin */
body,
h1,
h2,
h3,
h4,
p,
figure,
blockquote,
dl,
dd {
  margin: 0;
}

/* Remove list styles on ul, ol elements */
ul,
ol {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* Set core root defaults */
html:focus-within {
  scroll-behavior: smooth;
}

/* Set core body defaults */
body {
  min-height: 100vh;
  text-rendering: optimizeSpeed;
  line-height: 1.5;
}

/* A elements that don't have a class get default styles */
a:not([class]) {
  text-decoration-skip-ink: auto;
}

/* Make images easier to work with */
img,
picture {
  max-width: 100%;
  display: block;
}

/* Inherit fonts for inputs and buttons */
input,
button,
textarea,
select {
  font: inherit;
}

/* Remove all animations, transitions and smooth scroll for people that prefer not to see them */
@media (prefers-reduced-motion: reduce) {
  html:focus-within {
   scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}`;

  // ファイルからリセットCSSを読み込む関数
  const loadResetCssFromFile = useCallback(async () => {
    if (!isElectronContext || !activeProject || !activeProject.path) return null;

    try {
      const resetCssPath = pathHelper.join(activeProject.path, 'src', 'scss', 'base', '_reset.scss');
      console.log(`ファイルからリセットCSSを読み込み試行: ${resetCssPath}`);

      const fileResult = await window.api.fs.readFile(resetCssPath);

      if (fileResult.success) {
        console.log('ファイルシステムからリセットCSSを読み込みました');
        return fileResult.data;
      } else {
        console.log('リセットCSSファイルが見つかりませんでした');
        return null;
      }
    } catch (error) {
      console.error('ファイル読み込みエラー:', error);
      return null;
    }
  }, [activeProject]);

  // プロジェクト変更時のデータ初期化・読み込み
  useEffect(() => {
    console.log('ResetCSS: activeProject変更が検出されました', {
      id: activeProject?.id,
      name: activeProject?.name,
      path: activeProject?.path
    });

    // プロジェクト切り替え時にステートをリセット
    setResetCssContent('');
    setIsProcessing(false);
    setIsSaved(true);
    setStatusMessage('');
    setIsInitialized(false);

    // activeProjectが変更された場合に実行
    if (activeProject && activeProject.id) {
      console.log(`プロジェクト[${activeProject.id}]のリセットCSS設定を読み込みます`);

      const loadResetCssData = async () => {
        try {
          setIsProcessing(true);

          // JSONからデータを読み込み
          const savedContent = await projectDataStore.loadProjectData(activeProject.id, 'resetCss');

          // ファイルシステムからも読み込みを試みる
          const fileContent = await loadResetCssFromFile();

          if (fileContent && (!savedContent || fileContent !== savedContent)) {
            // ファイルシステムから読み込めた場合、そちらを優先
            console.log('ファイルシステムから最新のリセットCSSを読み込みました');
            setResetCssContent(fileContent);

            // JSONも更新
            await projectDataStore.saveProjectData(activeProject.id, 'resetCss', fileContent);
            showStatus('ファイルシステムから最新のリセットCSSを読み込みました');
          } else if (savedContent) {
            // JSONにデータがある場合
            console.log('JSONから読み込んだリセットCSS:', savedContent);
            setResetCssContent(savedContent);
            showStatus('リセットCSSを読み込みました');
          } else {
            console.log('リセットCSSが見つからないため、デフォルトを使用します');
            const defaultContent = getDefaultResetCss();
            setResetCssContent(defaultContent);

            // デフォルトデータをJSONに保存
            await projectDataStore.saveProjectData(activeProject.id, 'resetCss', defaultContent);

            // デフォルトをファイルシステムにも保存
            await ensureResetCssFile(defaultContent);
            showStatus('デフォルトのリセットCSSを作成しました');
          }

          setIsInitialized(true);
          setIsSaved(true);
        } catch (error) {
          console.error('リセットCSS読み込みエラー:', error);
          showStatus('エラーが発生しました: ' + error.message, false);
        } finally {
          setIsProcessing(false);
        }
      };

      loadResetCssData();
    }

    // ファイル変更監視の設定
    if (isElectronContext && activeProject && activeProject.path) {
      // ファイル変更リスナーの設定
      const handleFileChange = async (data) => {
        if (!data || !data.filePath) return;

        // データの詳細をログ出力
        if (DEBUG) {
          console.log('ファイル変更イベント詳細:', data);
        }

        // リセットCSSのパスパターンを構築
        const resetScssPathPattern = '_reset.scss';
        const fullPathPattern = pathHelper.join('src', 'scss', 'base', '_reset.scss');

        // 変更されたファイルのパス
        const filePath = data.filePath.replace(/\\/g, '/');

        // リセットCSSファイルかどうかを判定
        const isResetScss =
          filePath.includes(resetScssPathPattern) &&
          (filePath.includes('/scss/base/') || filePath.includes('\\scss\\base\\'));

        if (DEBUG) {
          console.log('リセットCSSファイル判定:', {
            filePath,
            resetScssPathPattern,
            fullPathPattern,
            isResetScss
          });
        }

        // リセットCSSファイルの変更の場合
        if (isResetScss) {
          console.log('リセットCSSファイルの変更を検出:', filePath);

          try {
            const fileContent = await loadResetCssFromFile();

            if (fileContent !== null && fileContent !== resetCssContent) {
              console.log('ファイルの内容が変更されているため更新します');
              setResetCssContent(fileContent);
              setIsSaved(true);

              // JSONにも保存
              if (activeProject.id) {
                await projectDataStore.saveProjectData(activeProject.id, 'resetCss', fileContent);
              }

              showStatus('ファイルシステムの変更を読み込みました');
            }
          } catch (error) {
            console.error('ファイル変更処理エラー:', error);
          }
        }
      };

      // リスナー登録
      if (window.api.onFileChanged) {
        // デバッグ用：予想されるパスパターンをログ出力
        if (DEBUG) {
          const expectedPath = pathHelper.join(activeProject.path, 'src', 'scss', 'base', '_reset.scss');
          const normalizedExpectedPath = expectedPath.replace(/\\/g, '/');
          console.log('監視対象パス:', {
            プロジェクトパス: activeProject.path,
            絶対パス: expectedPath,
            正規化パス: normalizedExpectedPath,
            相対パス: 'src/scss/base/_reset.scss'
          });
        }

        window.api.onFileChanged(handleFileChange);
        console.log('ファイル変更監視リスナーを登録しました');
      }

      // クリーンアップ
      return () => {
        console.log('ファイル変更監視を解除します');
        // リスナーのクリーンアップがあれば実行
      };
    }
  }, [activeProject?.id, activeProject?.path, loadResetCssFromFile, showStatus]);

  // リセットCSSファイルの存在確認と作成
  const ensureResetCssFile = async (content = '') => {
    if (!isElectronContext || !activeProject) {
      console.error('ファイルシステムへの保存ができない環境です');
      return false;
    }

    // activeProject.pathの検証
    if (!activeProject.path) {
      console.error('プロジェクトパスが設定されていません');
      return false;
    }

    if (typeof activeProject.path !== 'string') {
      console.error('プロジェクトパスが文字列ではありません:', typeof activeProject.path);
      console.error('プロジェクトパスの内容:', activeProject.path);
      return false;
    }

    try {
      // プロジェクトのパスを正確に確認
      console.log(`プロジェクトパス: ${activeProject.path}`);

      // パスを段階的に構築して検証
      const projectPath = activeProject.path.trim();
      console.log(`検証済みプロジェクトパス: ${projectPath}`);

      // src ディレクトリのパスを構築
      const srcDir = pathHelper.join(projectPath, 'src');
      console.log(`srcディレクトリパス: ${srcDir}`);

      // scss ディレクトリのパスを構築
      const scssDir = pathHelper.join(srcDir, 'scss');
      console.log(`scssディレクトリパス: ${scssDir}`);

      // base ディレクトリのパスを構築
      const baseDir = pathHelper.join(scssDir, 'base');
      console.log(`baseディレクトリパス: ${baseDir}`);

      // ファイルパスを構築
      const filePath = pathHelper.join(baseDir, '_reset.scss');
      console.log(`リセットCSSファイルのパス: ${filePath}`);

      // ディレクトリの存在確認
      const dirExists = await window.api.fs.exists(baseDir);

      if (!dirExists.exists) {
        console.log(`ディレクトリが存在しないため作成します: ${baseDir}`);
        await window.api.fs.mkdir(baseDir, { recursive: true });
      }

      // ファイルの存在確認
      const fileExists = await window.api.fs.exists(filePath);

      if (!fileExists.exists) {
        console.log(`リセットCSSファイルが存在しないため作成します: ${filePath}`);
        // content が空の場合はデフォルトを使用
        const fileContent = content || getDefaultResetCss();
        await window.api.fs.writeFile(filePath, fileContent);
        return true;
      }

      return true;
    } catch (error) {
      console.error('ファイル作成エラー:', error);
      return false;
    }
  };

  // コードエディタの内容変更ハンドラ
  const handleContentChange = (editor, data, value) => {
    if (value !== resetCssContent) {
      setResetCssContent(value);
      setIsSaved(false);
    }
  };

  // 変更を保存するハンドラ
  const handleSave = async () => {
    if (!activeProject || !activeProject.id) {
      showStatus('プロジェクトが選択されていません', false);
      return;
    }

    setIsProcessing(true);
    showStatus('保存中...', false);

    try {
      // JSONに保存
      await projectDataStore.saveProjectData(activeProject.id, 'resetCss', resetCssContent);

      // ファイルシステムにも保存
      if (isElectronContext && activeProject.path) {
        const resetCssPath = pathHelper.join(activeProject.path, 'src', 'scss', 'base', '_reset.scss');

        // ディレクトリが存在することを確認
        await ensureResetCssFile(resetCssContent);

        // ファイルに保存
        const result = await window.api.fs.writeFile(resetCssPath, resetCssContent);

        if (!result || !result.success) {
          console.error('ファイル書き込みエラー:', result?.error || 'unknown error');
          showStatus('ファイルシステムへの保存に失敗しました', false);
          setIsProcessing(false);
          return;
        }
      }

      setIsSaved(true);
      showStatus('変更を保存しました');

      console.log('リセットCSSを保存しました');
    } catch (error) {
      console.error('保存エラー:', error);
      showStatus('保存中にエラーが発生しました: ' + error.message, false);
    } finally {
      setIsProcessing(false);
    }
  };

  // CodeMirrorのオプション
  const codeMirrorOptions = {
    mode: 'text/x-scss',
    theme: 'material',
    lineNumbers: true,
    lineWrapping: true,
    smartIndent: true,
    tabSize: 2,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    extraKeys: {
      'Ctrl-Space': 'autocomplete',
      'Ctrl-/': 'toggleComment',
      'Cmd-/': 'toggleComment',
      Tab: (cm) => {
        if (cm.somethingSelected()) {
          cm.indentSelection('add');
        } else {
          cm.replaceSelection('  ', 'end');
        }
      },
    },
  };

  return (
    <div className="reset-css">
      <Header
        title="リセットCSSの編集"
        description="ブラウザのデフォルトスタイルをリセットするCSSを管理します"
      />

      <div className="editor-container">
        {!activeProject ? (
          <div className="no-project-message">
            <p>プロジェクトが選択されていません。プロジェクト管理からプロジェクトを選択してください。</p>
          </div>
        ) : isProcessing ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>読み込み中...</p>
          </div>
        ) : (
          <>
            <CodeMirror
              value={resetCssContent}
              options={codeMirrorOptions}
              onBeforeChange={handleContentChange}
              className="code-editor-wrapper"
            />

            <div className="editor-actions">
              <div className="editor-status">
                {statusMessage && <p className="status-message">{statusMessage}</p>}
                <p className="save-status">
                  <span className={isSaved ? "saved" : "unsaved"}>
                    {isSaved ? "✓ 保存済み" : "● 未保存の変更があります"}
                  </span>
                </p>
              </div>

              <button
                className="save-button"
                onClick={handleSave}
                disabled={isProcessing || isSaved}
              >
                {isProcessing ? "保存中..." : "変更を保存"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetCSS;
