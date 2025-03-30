import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid'; // UUIDを使う
import Header from './Header';
import '../styles/GenerateHTML.scss';

const GenerateHTML = () => {
  const [fileName, setFileName] = useState('');
  const [fileList, setFileList] = useState([]); // 追加されたファイル名を管理
  const [error, setError] = useState(''); // エラーメッセージを管理
  const [editingFile, setEditingFile] = useState(null); // 編集中のファイルを管理

  // 初期化時にローカルストレージからファイルリストを復元
  useEffect(() => {
    const savedFiles = localStorage.getItem('generatedFiles');
    let files = [];

    if (savedFiles) {
      files = JSON.parse(savedFiles);
    }

    // index.htmlがリストにない場合は追加
    if (!files.some(file => file.name === 'index.html')) {
      files.push({
        id: uuidv4(),
        name: 'index.html',
        status: '保存済',
      });
    }

    setFileList(files);
    // 初期化後にlocalStorageに保存
    localStorage.setItem('generatedFiles', JSON.stringify(files));

    // 新しいファイルが追加された場合、ファイルリストを更新
    window.api.onNewHtmlFile((fileName) => {
      console.log('New HTML file detected:', fileName);
      setFileList((prevList) => {
        if (!prevList.some(file => file.name === fileName)) {
          const newFile = {
            id: uuidv4(),
            name: fileName,
            status: '保存済'
          };
          const updatedList = [...prevList, newFile];
          // 更新後にlocalStorageに保存
          localStorage.setItem('generatedFiles', JSON.stringify(updatedList));
          return updatedList;
        }
        return prevList;  // 重複があればそのまま
      });
    });

    // ファイル削除時の監視
    window.api.onFileDeleted((fileName) => {
      setFileList((prevList) => {
        const updatedList = prevList.filter((file) => file.name !== fileName);
        // 削除後にlocalStorageに保存
        localStorage.setItem('generatedFiles', JSON.stringify(updatedList));
        return updatedList;
      });
    });
  }, []);


  // ファイル名を追加（エンターキーでのみリストに追加）
  const handleAddFile = () => {
    if (fileName === '') {
      setError('ファイル名を入力してください');
      return;
    }

    let fileNameWithHtml = fileName;
    if (!fileNameWithHtml.endsWith('.html')) {
      fileNameWithHtml = fileNameWithHtml + '.html';
    }

    if (fileList.some(file => file.name === fileNameWithHtml)) {
      setError('このファイル名はすでに存在します');
      return;
    }

    const newFile = {
      id: uuidv4(), // 一意なUUIDを追加
      name: fileNameWithHtml,
      status: '未保存',
    };
    const updatedFileList = [...fileList, newFile];
    setFileList(updatedFileList);
    localStorage.setItem('generatedFiles', JSON.stringify(updatedFileList));
    setFileName('');
    setError('');
  };

  // エンターキーでファイル名をリストに追加のみ行う
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddFile(); // ファイル一覧に表示のみ行う
    }
  };

  // 編集モードの切り替え
  const handleEditFile = (file) => {
    setEditingFile(file); // 編集中のファイルを設定
    setFileName(file.name.replace('.html', '')); // 編集中のファイル名を表示（.htmlを外す）
  };

  const handleSaveFiles = () => {
    console.log('Before saving file:', fileList);

    const updatedFileList = fileList.map((file) => {
      if (file.status === '未保存') {
        const updatedFile = {
          ...file,
          status: '保存済',
        };

        const content = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <!-- style.scssを読み込むで正しい。buildすると勝手にcssに変換される 要コメント消 -->
  <link rel="stylesheet" href="./scss/style.scss">
</head>
<body>

  <!-- 画像の書き方は以下でOK！buildすると勝手にwebpに変換される 要コメント消-->
  <img src="./images/common/sample.jpeg" alt="">
  <!-- main.jsの位置もbodyの閉じタグ直上に書く→buildすると勝手に変換される 要コメント消-->
  <script type="module" src="./js/main.js"></script>
</body>
</html>`;


        const filePath = `${updatedFile.name}`;

        if (filePath) {
          try {
            window.api.send('save-html-file', { filePath, content });
            console.log(`File saved successfully: ${updatedFile.name}`);
          } catch (error) {
            console.error(`Error saving file: ${error}`);
          }
        }

        return updatedFile;
      }

      return file;
    });

    setFileList(updatedFileList);
    localStorage.setItem('generatedFiles', JSON.stringify(updatedFileList));
  };

  const isSaveDisabled = fileList.every(file => file.status === '保存済');

  const handleSaveFileName = () => {
    if (fileName === '') {
      setError('ファイル名を入力してください');
      return;
    }

    const updatedList = fileList.map((item) => {
      if (item.name === editingFile.name) {
        const newFileName = fileName.endsWith('.html') ? fileName : fileName + '.html';
        return { ...item, name: newFileName, status: '保存済' };
      }
      return item;
    });

    setFileList(updatedList);  // UIの更新
    localStorage.setItem('generatedFiles', JSON.stringify(updatedList));  // ローカルストレージ更新

    // 編集を終了し、フォームをリセット
    setEditingFile(null);
    setFileName('');

    // ファイル名を変更するためにメインプロセスに送信
    window.api.send('rename-file', {
      oldFileName: editingFile.name,
      newFileName: fileName.endsWith('.html') ? fileName : fileName + '.html',
    });
  };

  // 削除処理
  const handleDeleteFile = (fileName) => {
    let fileNameWithHtml = fileName;

    if (!fileNameWithHtml.endsWith('.html')) {
      fileNameWithHtml = fileNameWithHtml + '.html';
    }

    const updatedList = fileList.filter((file) => file.name !== fileNameWithHtml);
    setFileList(updatedList);
    localStorage.setItem('generatedFiles', JSON.stringify(updatedList));

    window.api.send('delete-html-file', { fileName: fileNameWithHtml });
    console.log(`Deleted file: ${fileNameWithHtml}`);
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
    <div className="generate-html-container">
      <Header
        title="HTMLファイル生成"
        description="新しいHTMLファイルを生成・管理します"
      />

      {/* ファイル追加フォーム */}
      <div className="file-form">
        <div className="file-form-input-container">
          <input
            type="text"
            value={fileName}
            onChange={handleFileNameChange}
            onKeyDown={handleKeyPress}
            placeholder="ファイル名を入力（英数字のみ）"
            className="file-input"
          />
          <button onClick={handleAddFile} className="add-button">
            ファイルを追加
          </button>
        </div>

        {/* エラーメッセージ表示 */}
        {error && <div className="error-message">{error}</div>}
      </div>

      {/* 作成されたファイルのリスト */}
      <div className="file-list">
        <h3>作成されたファイル</h3>
        <div className="file-list-items">
          {fileList.map((file) => (
            <div key={file.id} className="file-item">
              {editingFile && editingFile.name === file.name ? (
                <div className="file-edit-form">
                  <input
                    type="text"
                    value={fileName}
                    onChange={handleFileNameChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveFileName();
                      }
                    }}
                  />
                  <button onClick={handleSaveFileName} className="save-button">
                    保存
                  </button>
                </div>
              ) : (
                <>
                  <div className="file-name">
                    {file.name} {file.status === '保存済' && <span className="saved-badge">保存済</span>}
                  </div>
                  <div className="file-actions">
                    <button onClick={() => handleDeleteFile(file.name)} className="delete-button">
                      削除
                    </button>
                    <button onClick={() => handleEditFile(file)} className="edit-button">
                      編集
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSaveFiles}
        disabled={isSaveDisabled}
        className={`save-all-button ${isSaveDisabled ? 'disabled' : ''}`}
      >
        ファイルを保存
      </button>
    </div>
  );
};

export default GenerateHTML;
