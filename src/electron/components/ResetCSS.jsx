import React, { useState, useEffect } from 'react';
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

// Electronコンテキストかどうかを判定
const isElectronContext = typeof window !== 'undefined' && window.api;

const ResetCSS = () => {
  const [resetCssContent, setResetCssContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false); // 処理中フラグ

  useEffect(() => {
    // 初期表示時にファイル内容を取得し、テキストエリアに反映
    if (isElectronContext && typeof window.api.receive === 'function') {
      window.api.receive('file-updated', (data) => {
        if (data.file === '_reset.scss') {
          console.log('React: _reset.scssの内容を受信', data.content);
          setResetCssContent(data.content); // 内容をstateに設定
        }
      });

      // 初期内容をファイルから読み込んでセット
      const resetCssPath = 'src/scss/base/_reset.scss';
      window.api.requestFileContent(resetCssPath); // メインプロセスにファイル内容をリクエスト
    } else {
      // ブラウザ環境の場合はデフォルトの内容を表示
      setResetCssContent(`/*
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
}`);
    }
  }, []);

  const handleContentChange = (editor, data, value) => {
    setResetCssContent(value);
  };

  const handleSave = () => {
    setIsProcessing(true);

    if (isElectronContext) {
      // 更新内容をメインプロセスに送信
      window.api.send('save-scss-file', {
        filePath: 'src/scss/base/_reset.scss',
        content: resetCssContent,
      });

      console.log('React: _reset.scssの更新を送信');
    } else {
      // ブラウザ環境の場合はローカルストレージに保存
      localStorage.setItem('reset-css-content', resetCssContent);
      console.log('ブラウザ環境: _reset.scssの内容をローカルストレージに保存しました');
    }

    setIsProcessing(false);
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
        <CodeMirror
          value={resetCssContent}
          options={codeMirrorOptions}
          onBeforeChange={handleContentChange}
          className="code-editor-wrapper"
        />
      </div>

      <div className="editor-actions">
        <div className="editor-hint">
          <p><span>💡</span> タブや自動インデント、シンタックスハイライトに対応</p>
        </div>
        <button
          className="save-button"
          onClick={handleSave}
          disabled={isProcessing}
        >
          変更する
        </button>
      </div>
    </div>
  );
};

export default ResetCSS;
