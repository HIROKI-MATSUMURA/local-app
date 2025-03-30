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

const ResetCSS = () => {
  const [resetCssContent, setResetCssContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false); // 処理中フラグ

  useEffect(() => {
    // 初期表示時にファイル内容を取得し、テキストエリアに反映
    if (window.api && typeof window.api.receive === 'function') {
      window.api.receive('file-updated', (data) => {
        if (data.file === '_reset.scss') {
          console.log('React: _reset.scssの内容を受信', data.content);
          setResetCssContent(data.content); // 内容をstateに設定
        }
      });

      // 初期内容をファイルから読み込んでセット
      const resetCssPath = 'src/scss/base/_reset.scss';
      window.api.requestFileContent(resetCssPath); // メインプロセスにファイル内容をリクエスト
    }
  }, []);

  const handleContentChange = (editor, data, value) => {
    setResetCssContent(value);
  };

  const handleSave = () => {
    setIsProcessing(true);

    // 更新内容をメインプロセスに送信
    window.api.send('save-scss-file', {
      filePath: 'src/scss/base/_reset.scss',
      content: resetCssContent,
    });

    console.log('React: _reset.scssの更新を送信');

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
