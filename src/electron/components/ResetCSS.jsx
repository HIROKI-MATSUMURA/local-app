import React, { useState, useEffect } from 'react';

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

  const handleContentChange = (event) => {
    const updatedContent = event.target.value;
    setResetCssContent(updatedContent); // 編集内容を更新
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

  return (
    <div>
      <h2>リセットCSSの編集</h2>
      <textarea
        value={resetCssContent}
        onChange={handleContentChange}
        style={{ width: '100%', height: '400px', fontFamily: 'monospace' }}
      />
      <div style={{ marginTop: '10px' }}>
        <button
          onClick={handleSave}
          disabled={isProcessing} // 処理中は無効化
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          変更する
        </button>
      </div>
    </div>
  );
};

export default ResetCSS;
