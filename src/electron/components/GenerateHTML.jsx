import React, { useState, useEffect } from 'react';

const GenerateHTML = () => {
  const [fileName, setFileName] = useState('');
  const [fileList, setFileList] = useState([]); // 追加されたファイル名を管理
  const [error, setError] = useState(''); // エラーメッセージを管理
  const [editingFile, setEditingFile] = useState(null); // 編集中のファイルを管理

  // 初期化時にローカルストレージからファイルリストを復元
  useEffect(() => {
    const savedFiles = localStorage.getItem('generatedFiles');
    if (savedFiles) {
      setFileList(JSON.parse(savedFiles));
    }
  }, []);

  // ファイル名を追加
  const handleAddFile = () => {
    if (fileName === '') {
      setError('ファイル名を入力してください');
      return;
    }

    // ファイル名が重複しているかチェック
    if (fileList.some(file => file.name === fileName)) {
      setError('このファイル名はすでに存在します');
      return;
    }

    const newFile = {
      name: fileName, // ファイル名に.htmlを追加
      status: '未保存',  // 新しく追加されたファイルは未保存
    };
    const updatedFileList = [...fileList, newFile];
    setFileList(updatedFileList);

    // ローカルストレージに保存
    localStorage.setItem('generatedFiles', JSON.stringify(updatedFileList));
    setFileName(''); // 入力フォームをリセット
    setError(''); // エラーメッセージをリセット
  };

  // エンターキーでファイルを追加
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddFile();
    }
  };

  // 編集モードの切り替え
  const handleEditFile = (file) => {
    setEditingFile(file); // 編集中のファイルを設定
    setFileName(file.name.replace('.html', '')); // 編集中のファイル名を表示（.htmlを外す）
  };

  // 保存処理
  const handleSaveFileName = () => {
    if (fileName === '') {
      setError('ファイル名を入力してください');
      return;
    }

    // 編集したファイル名を更新
    const updatedList = fileList.map((item) => {
      if (item.name === editingFile.name) {
        return { ...item, name: fileName, status: '保存済' }; // 編集したファイル名を反映
      }
      return item;
    });

    setFileList(updatedList);
    localStorage.setItem('generatedFiles', JSON.stringify(updatedList));

    // 編集を終了し、フォームをリセット
    setEditingFile(null);
    setFileName('');

    // ファイル名を変更するためにメインプロセスに送信
    window.api.send('rename-file', {
      oldFileName: editingFile.name,
      newFileName: fileName, // .html をファイル名に追加
    });
  };



  // 保存処理
  const handleSaveFiles = () => {
    const updatedFileList = fileList.map((file) => {
      if (file.status === '未保存') {
        return {
          ...file,
          status: '保存済',  // 保存したファイルのステータスを更新
        };
      }
      return file;
    });

    setFileList(updatedFileList);
    localStorage.setItem('generatedFiles', JSON.stringify(updatedFileList));

    // 実際に保存処理を行う（例えば、サーバーへの送信やファイルシステムへの書き込み）
    updatedFileList.forEach((file) => {
      if (file.status === '保存済') {
        const content = `
      <html>
        <head>
          <title>${file.name}</title>
        </head>
        <body>
          <h1>Welcome to ${file.name}</h1>
        </body>
      </html>`;

        const filePath = `src/${file.name}.html`;

        if (filePath) {
          window.api.send('save-html-file', { filePath, content }); // 上書き保存
          console.log(`Saving file: ${file.name}.html`);
        } else {
          console.error('File path is invalid');
        }
      }
    });
  };

  // 削除処理
  const handleDeleteFile = (fileName) => {
    const updatedList = fileList.filter((file) => file.name !== fileName);
    setFileList(updatedList);
    localStorage.setItem('generatedFiles', JSON.stringify(updatedList));

    window.api.send('delete-html-file', { fileName }); // VScode側に削除通知
    console.log(`Deleted file: ${fileName}`);
  };


  // 入力制限: 日本語・全角入力を防ぐ
  const handleFileNameChange = (e) => {
    const value = e.target.value;
    const regex = /^[a-zA-Z0-9-_]*$/;
    if (regex.test(value) || value === '') {
      setFileName(value);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>HTMLファイル生成</h2>

      {/* ファイル名入力フォーム */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <input
          type="text"
          value={fileName}
          onChange={handleFileNameChange}
          onKeyDown={handleKeyPress}  // エンターキーでファイル追加
          placeholder="ファイル名を入力（英数字のみ）"
          style={{
            padding: '10px',
            width: '200px',
            marginRight: '10px',
            border: '1px solid #ccc',
            borderRadius: '5px',
          }}
        />
        <button
          onClick={handleAddFile}
          style={{
            padding: '10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
          }}
        >
          ファイルを追加
        </button>
      </div>

      {/* エラーメッセージ表示 */}
      {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

      {/* 作成されたファイルのリスト */}
      <div style={{ marginTop: '20px' }}>
        <h3>作成されたファイル</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {fileList.map((file, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f8f9fa',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
              }}
            >
              {editingFile && editingFile.name === file.name ? (
                <>
                  <input
                    type="text"
                    value={fileName}
                    onChange={handleFileNameChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveFileName();
                      }
                    }}
                    style={{
                      padding: '5px',
                      fontSize: '14px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      marginRight: '10px',
                    }}
                  />
                  <button
                    onClick={handleSaveFileName}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                    }}
                  >
                    保存
                  </button>
                </>
              ) : (
                <>
                  <div
                    style={{
                      fontWeight: 'bold',
                      color: file.status === '保存済' ? '#28a745' : '#dc3545',
                    }}
                  >
                    {file.name}.html {file.status === '保存済' && <span style={{ color: '#28a745' }}>(保存済)</span>}
                  </div>
                  <button
                    onClick={() => handleDeleteFile(file.name)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                    }}
                  >
                    削除
                  </button>
                  <button
                    onClick={() => handleEditFile(file)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#ffc107',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                    }}
                  >
                    編集
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSaveFiles}
        style={{
          padding: '10px',
          marginTop: '20px',
          backgroundColor: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
        }}
      >
        ファイルを保存
      </button>
    </div>
  );
};

export default GenerateHTML;
