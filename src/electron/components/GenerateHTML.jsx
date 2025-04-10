import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid'; // UUIDを使う
import Header from './Header';
import '../styles/GenerateHTML.scss';
import projectDataStore from '../utils/projectDataStore';

// デバッグフラグ（必要に応じてtrueに変更）
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

  extname: (filePath) => {
    if (!filePath) return '';
    const fileName = pathHelper.basename(filePath);
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex > -1 ? fileName.substring(dotIndex) : '';
  },

  relative: (from, to) => {
    if (!from || !to) return to || '';

    // 両方のパスを正規化
    const fromParts = from.replace(/\\/g, '/').split('/').filter(Boolean);
    const toParts = to.replace(/\\/g, '/').split('/').filter(Boolean);

    // 共通部分をスキップ
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
      i++;
    }

    // 残りの部分を結合
    const result = [...Array(fromParts.length - i).fill('..'), ...toParts.slice(i)].join('/');
    return result || '.';
  },

  join: (...parts) => {
    return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
  }
};

const GenerateHTML = ({ activeProject }) => {
  console.log('GenerateHTML コンポーネントがレンダリングされました');
  console.log('activeProject:', activeProject);

  const [fileName, setFileName] = useState('');
  const [fileList, setFileList] = useState([]); // 追加されたファイル名を管理
  const [error, setError] = useState(''); // エラーメッセージを管理
  const [editingFile, setEditingFile] = useState(null); // 編集中のファイルを管理
  const [isInitialized, setIsInitialized] = useState(false); // 初期化フラグ
  const [fileContents, setFileContents] = useState({}); // ファイル内容を保持するステート
  const [updateTrigger, setUpdateTrigger] = useState(0); // 強制更新用のトリガー

  // JSON管理へのデータ移行
  useEffect(() => {
    console.log('GenerateHTML: activeProject変更が検出されました', {
      id: activeProject?.id,
      name: activeProject?.name,
      path: activeProject?.path
    });

    // プロジェクト切り替え時にステートをリセット
    setFileList([]);
    setFileContents({});
    setFileName('');
    setEditingFile(null);
    setError('');
    setIsInitialized(false);

    // activeProjectが変更された場合に実行
    if (activeProject && activeProject.id) {
      console.log(`プロジェクト[${activeProject.id}]のHTMLファイル設定を読み込みます`);

      // データの読み込み（JSONから）
      const loadData = async () => {
        try {
          // JSONからデータを読み込み
          let data = await projectDataStore.loadProjectData(activeProject.id, 'htmlFiles');
          console.log('JSONから読み込んだHTMLファイルリスト:', data);

          // ファイル内容も読み込む
          let contents = await projectDataStore.loadProjectData(activeProject.id, 'htmlContents') || {};
          console.log('JSONから読み込んだHTMLファイル内容:', Object.keys(contents));

          // 有効な配列が返ってきた場合と、初期化が必要な場合で分岐
          if (Array.isArray(data) && data.length > 0) {
            console.log('既存のファイルリストを使用します');

            // index.htmlが重複していないか確認
            const indexFiles = data.filter(file => file.name === 'index.html');
            if (indexFiles.length > 1) {
              console.log('index.htmlが重複しています。重複を削除します。');
              // 最初のindex.htmlだけを残して他を削除
              data = [
                indexFiles[0],
                ...data.filter(file => file.name !== 'index.html')
              ];
            } else if (indexFiles.length === 0) {
              // index.htmlがない場合は追加
              console.log('index.htmlがないため追加します');
              data.push({
                id: uuidv4(),
                name: 'index.html',
                status: '保存済',
              });
            }

            // index.htmlの内容がなければ初期コンテンツを設定
            if (!contents['index.html']) {
              contents['index.html'] = getDefaultHtmlTemplate('index');
            }

            // ステートを更新
            setFileList(data);
            setFileContents(contents);

            // 変更があれば保存
            await projectDataStore.saveProjectData(activeProject.id, 'htmlFiles', data);
            await projectDataStore.saveProjectData(activeProject.id, 'htmlContents', contents);

            // 初期化完了
            setIsInitialized(true);
          } else {
            console.log('初期データを設定します');
            // 初期データの設定
            const initialData = [{
              id: uuidv4(),
              name: 'index.html',
              status: '保存済',
            }];

            const initialContents = {
              'index.html': getDefaultHtmlTemplate('index')
            };

            // ステートを更新
            setFileList(initialData);
            setFileContents(initialContents);

            // 初期データを保存
            await projectDataStore.saveProjectData(activeProject.id, 'htmlFiles', initialData);
            await projectDataStore.saveProjectData(activeProject.id, 'htmlContents', initialContents);

            // 初期化完了
            setIsInitialized(true);
          }

          // ファイルシステムと同期を確認するために、手動でスキャンを実行
          if (isElectronContext && activeProject.path) {
            try {
              console.log('ファイルシステムとの同期チェックを開始します');
              const pagesDir = pathHelper.join(activeProject.path, 'src', 'pages');

              // ファイルシステムAPIを使ってファイル一覧を取得
              if (window.api && window.api.fs) {
                const dirResult = await window.api.fs.readdir(pagesDir);
                if (dirResult.success) {
                  console.log('ディレクトリ内のファイル一覧:', dirResult.files);

                  // HTMLファイルだけをフィルタリング
                  const htmlFiles = dirResult.files.filter(f => f.endsWith('.html'));
                  console.log('HTMLファイル一覧:', htmlFiles);

                  // 現在のリストにないファイルを追加
                  const currentFiles = new Set(data ? data.map(f => f.name) : []);
                  const missingFiles = htmlFiles.filter(f => !currentFiles.has(f));

                  if (missingFiles.length > 0) {
                    console.log('JSONに存在しないHTMLファイルを検出:', missingFiles);

                    // 検出したファイルを読み込んでJSONに追加
                    for (const fileName of missingFiles) {
                      const filePath = pathHelper.join(pagesDir, fileName);
                      console.log(`検出したファイルを読み込み: ${filePath}`);

                      try {
                        // ファイル内容を読み込む
                        const fileResult = await window.api.fs.readFile(filePath);
                        if (fileResult.success) {
                          // 内容をJSONに保存
                          console.log(`ファイル内容を同期: ${fileName}`);

                          // ファイルリストを更新
                          setFileList(prev => {
                            const newList = [...prev, {
                              id: uuidv4(),
                              name: fileName,
                              status: '保存済'
                            }];

                            // JSONに保存
                            projectDataStore.saveProjectData(activeProject.id, 'htmlFiles', newList);
                            return newList;
                          });

                          // ファイル内容も更新
                          setFileContents(prev => {
                            const newContents = {
                              ...prev,
                              [fileName]: fileResult.data
                            };
                            projectDataStore.saveProjectData(activeProject.id, 'htmlContents', newContents);
                            return newContents;
                          });
                        }
                      } catch (fileErr) {
                        console.error(`ファイル読み込みエラー: ${fileName}`, fileErr);
                      }
                    }
                  }

                  // JSONにあるがファイルシステムにないファイルを削除
                  if (data) {
                    const fileSystemFiles = new Set(htmlFiles);
                    const nonExistentFiles = data
                      .filter(f => f.name !== 'index.html') // index.htmlは常に維持
                      .filter(f => !fileSystemFiles.has(f.name));

                    if (nonExistentFiles.length > 0) {
                      console.log('ファイルシステムに存在しないJSONエントリーを検出:',
                        nonExistentFiles.map(f => f.name));

                      // 見つからないファイルをJSONから削除
                      const filesToKeep = data.filter(f =>
                        f.name === 'index.html' || fileSystemFiles.has(f.name)
                      );

                      setFileList(filesToKeep);
                      projectDataStore.saveProjectData(activeProject.id, 'htmlFiles', filesToKeep);

                      // ファイル内容も削除
                      const newContents = { ...contents };
                      for (const file of nonExistentFiles) {
                        delete newContents[file.name];
                      }
                      setFileContents(newContents);
                      projectDataStore.saveProjectData(activeProject.id, 'htmlContents', newContents);
                    }
                  }
                }
              }
            } catch (scanError) {
              console.error('ファイルシステムスキャンエラー:', scanError);
            }
          }
        } catch (error) {
          console.error('HTMLファイル設定の読み込みに失敗:', error);
        }
      };

      loadData();

      // ファイル監視の設定（Electron環境でのみ）
      if (isElectronContext && activeProject.path) {
        console.log(`プロジェクトパス[${activeProject.path}]のファイル監視を開始します`);

        // 監視対象のパターンをプロジェクトパスに応じて特定
        const patterns = ['src/pages/**/*.html']; // 具体的なパターンを指定
        console.log('監視対象パターン:', patterns);

        try {
          // ファイル監視を開始
          window.api.watchProjectFiles(
            activeProject.id,
            activeProject.path,
            patterns
          ).then(result => {
            console.log('ファイル監視の開始結果:', result);
          }).catch(error => {
            console.error('ファイル監視の開始に失敗:', error);
          });

          // ファイル変更の監視
          const handleFileChange = async (data) => {
            console.log('ファイル変更イベントを受信:', data);

            // プロジェクトIDが一致するイベントのみ処理
            if (data.projectId && data.projectId !== activeProject.id) {
              console.log(`プロジェクトID不一致のため無視: 受信=${data.projectId}, 現在のプロジェクト=${activeProject.id}`);
              return;
            }

            // ファイルタイプを取得
            const fileType = data.fileType || (() => {
              const fileExt = pathHelper.extname(data.filePath || '');
              return fileExt ? fileExt.substring(1) : null;
            })();

            const fileName = data.fileName || pathHelper.basename(data.filePath || '');
            const eventType = data.eventType || 'unknown';

            console.log('ファイル変更情報:', {
              fileName,
              fileType,
              eventType,
              filePath: data.filePath
            });

            if (fileType === 'html') {
              try {
                // ファイルパスが正しいプロジェクトに属するか確認
                if (!data.filePath || !data.filePath.includes(activeProject.path)) {
                  // プロジェクトパスの確認: ファイルパスの中にプロジェクトパスが含まれるかチェック
                  console.log(`プロジェクトパス不一致のため無視:`, {
                    filePath: data.filePath,
                    projectPath: activeProject.path
                  });

                  // 特別ケース: ローカル開発環境のパス変換
                  const appPath = '/Users/matsu/Documents/新CodeUps/sampleApps/electron-sample-app';
                  if (data.filePath && data.filePath.includes(appPath)) {
                    console.log('開発環境パスを検出。パス変換を試みます');
                    // アプリパスをプロジェクトパスに置き換え
                    const convertedPath = data.filePath.replace(appPath, activeProject.path);
                    console.log(`パス変換: ${data.filePath} -> ${convertedPath}`);
                    data.filePath = convertedPath;
                  }
                }

                // プロジェクトパスと相対パスの計算
                const projectPath = activeProject.path;

                console.log('パス解析:', {
                  fileName,
                  absPath: data.filePath,
                  projectPath
                });

                // ファイル名がHTMLファイルでない場合はスキップ
                if (!fileName.endsWith('.html')) {
                  console.log(`HTMLファイルではないためスキップします: ${fileName}`);
                  return;
                }

                // イベントタイプに応じた処理
                if (eventType === 'unlink' || eventType === 'delete') {
                  console.log(`ファイル削除イベントを処理します: ${fileName}`);
                  handleFileUnlink(fileName);
                } else if (eventType === 'add' || eventType === 'change') {
                  console.log(`ファイル追加/変更イベントを処理します: ${eventType}, ${fileName}`);
                  await handleFileAddOrChange(data, fileName, projectPath);
                }
              } catch (error) {
                console.error('HTMLファイル処理中にエラーが発生:', error);
              }
            }
          };

          // ファイル削除イベント処理
          const handleFileUnlink = (fileName) => {
            // 現在のリストを表示して確認
            console.log('削除前のファイルリスト:', JSON.stringify(fileList));

            // 削除対象のファイルがリストに存在するか確認
            const fileExists = fileList.some(file => file.name === fileName);
            console.log(`ファイル[${fileName}]の存在チェック:`, fileExists);

            if (fileExists) {
              // 共通の削除関数を使用
              removeFileFromState(fileName);

              // 強制的に再フェッチ（オプション）
              setTimeout(() => {
                projectDataStore.loadProjectData(activeProject.id, 'htmlFiles')
                  .then(data => {
                    if (data) {
                      console.log('削除後の再フェッチ結果:', data);
                      // まだ存在する場合は再度削除
                      if (data.some(file => file.name === fileName)) {
                        console.log(`ファイルがまだ存在しています。再度削除を試みます: ${fileName}`);
                        removeFileFromState(fileName);
                      }
                    }
                  });
              }, 1000);
            } else {
              console.log(`削除対象のファイル[${fileName}]がリストに見つかりませんでした`);
            }
          };

          // ファイル追加/変更イベント処理
          const handleFileAddOrChange = async (data, fileName, projectPath) => {
            // ファイル追加または変更
            let relativePath;
            try {
              relativePath = pathHelper.relative(projectPath, data.filePath);
            } catch (error) {
              console.error('相対パス計算エラー:', error);
              // 代替手段: 絶対パスからファイル名とディレクトリを抽出
              const dirName = pathHelper.dirname(data.filePath);
              const pagesDir = dirName.includes('pages') ?
                dirName.substring(dirName.indexOf('pages') - 4) : // src/pages を含める
                null;
              relativePath = pagesDir ? pathHelper.join(pagesDir, fileName) : fileName;
            }

            const dirName = pathHelper.dirname(relativePath);

            if (DEBUG) {
              console.log('ファイル変更の相対パス情報:', {
                relativePath,
                dirName,
                fileName
              });
            }

            // ファイル内容を読み込む
            if (isElectronContext && data.filePath) {
              try {
                const fileContent = await window.api.fs.readFile(data.filePath);
                if (fileContent.success) {
                  // 内容をJSONに保存
                  setFileContents(prev => {
                    const newContents = { ...prev, [fileName]: fileContent.data };
                    // JSONに保存
                    projectDataStore.saveProjectData(activeProject.id, 'htmlContents', newContents);
                    return newContents;
                  });

                  // ファイルリストを更新
                  setFileList(prev => {
                    // ファイルが既にリストに存在するか確認
                    const fileExists = prev.some(file => file.name === fileName);

                    if (!fileExists) {
                      // 新規ファイル
                      const newFile = {
                        id: uuidv4(),
                        name: fileName,
                        status: '保存済'
                      };

                      const newList = [...prev, newFile];

                      // JSONに保存
                      projectDataStore.saveProjectData(activeProject.id, 'htmlFiles', newList);
                      return newList;
                    }
                    return prev;
                  });
                } else {
                  console.error(`ファイル読み込みに失敗しました: ${fileName}`, fileContent.error);
                }
              } catch (error) {
                console.error(`ファイル読み込みエラー: ${fileName}`, error);
              }
            }
          };

          // コールバック登録
          window.api.onFileChanged(handleFileChange);
          console.log('ファイル変更監視のコールバックを登録しました');

          // コンポーネントのアンマウント時に監視を解除
          return () => {
            console.log(`プロジェクト[${activeProject.id}]のファイル監視を解除します`);
            window.api.unwatchProjectFiles(activeProject.id);
          };
        } catch (error) {
          console.error('ファイル監視の設定中にエラーが発生しました:', error);
        }
      } else {
        console.log('Electron環境でないか、プロジェクトパスが設定されていないため、ファイル監視をスキップします');
      }
    } else {
      console.log('有効なプロジェクトがないため、データ読み込みとファイル監視をスキップします');
    }
  }, [activeProject]);

  // ファイルリストが変更されたらJSONに保存
  useEffect(() => {
    if (isInitialized && activeProject && activeProject.id) {
      projectDataStore.saveProjectData(activeProject.id, 'htmlFiles', fileList);
    }
  }, [fileList, activeProject, isInitialized]);

  // ファイル内容が変更されたらJSONに保存
  useEffect(() => {
    if (isInitialized && activeProject && activeProject.id && Object.keys(fileContents).length > 0) {
      projectDataStore.saveProjectData(activeProject.id, 'htmlContents', fileContents);
    }
  }, [fileContents, activeProject, isInitialized]);

  // ファイル変更を監視してUIを更新する
  useEffect(() => {
    if (!activeProject?.id || !isInitialized) return;

    console.log(`ファイル変更監視を開始します。プロジェクトID: ${activeProject.id}`);

    // ファイル変更のハンドラー関数
    const handleFileChanges = async () => {
      if (DEBUG) console.log('ファイル変更イベントによる更新処理を実行');

      try {
        // JSONから最新のファイルリストを取得
        const latestData = await projectDataStore.loadProjectData(activeProject.id, 'htmlFiles');

        if (!Array.isArray(latestData)) {
          console.log('有効なファイルデータがありません');
          return;
        }

        // ファイル名だけの配列を作成する
        const latestFileMap = new Map();
        latestData.forEach(file => {
          latestFileMap.set(file.name, file);
        });

        // 重複がないようにして、新しいファイルリストを作成
        const newFileList = [];
        const processedFiles = new Set();

        // 現在のリストから重複なく取り込む
        fileList.forEach(file => {
          if (!processedFiles.has(file.name)) {
            if (latestFileMap.has(file.name)) {
              // JSONにも存在する場合はJSONの情報で更新
              newFileList.push(latestFileMap.get(file.name));
            } else {
              // JSONに存在しない場合は削除対象
              if (DEBUG) console.log(`削除されたファイル: ${file.name}`);
              // この場合はnewFileListに追加しない
            }
            processedFiles.add(file.name);
          }
        });

        // 新規ファイルの追加
        latestData.forEach(file => {
          if (!processedFiles.has(file.name)) {
            if (DEBUG) console.log(`新規ファイル: ${file.name}`);
            newFileList.push(file);
            processedFiles.add(file.name);
          }
        });

        // リストを更新
        if (JSON.stringify(fileList.map(f => f.name).sort()) !==
          JSON.stringify(newFileList.map(f => f.name).sort())) {
          if (DEBUG) console.log('ファイルリストを更新します', {
            現在: fileList.map(f => f.name),
            新規: newFileList.map(f => f.name)
          });
          setFileList(newFileList);
        }
      } catch (error) {
        console.error('ファイル変更の処理中にエラーが発生しました:', error);
      }
    };

    // 初回実行
    handleFileChanges();

    // ファイル変更イベントをリッスン
    if (isElectronContext) {
      window.api.onFileChanged(() => {
        // 少し遅延を入れてファイルシステムの変更が反映される時間を確保
        setTimeout(handleFileChanges, 200);
      });
    }

    return () => {
      console.log('ファイル変更監視を停止します');
      // ここでリスナーのクリーンアップがあれば実行
    };
  }, [activeProject?.id, isInitialized, updateTrigger]);

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
    if (!activeProject || !activeProject.id) {
      setError('アクティブなプロジェクトがありません');
      return;
    }

    console.log('ファイル保存を開始します', {
      projectId: activeProject.id,
      projectPath: activeProject.path,
      fileCount: fileList.filter(file => file.status === '未保存').length
    });

    const updatedFileList = fileList.map((file) => {
      if (file.status === '未保存') {
        const updatedFile = {
          ...file,
          status: '保存済',
        };

        // 既存のファイル内容を使用するか、なければデフォルトテンプレートを使用
        const content = fileContents[file.name] || getDefaultHtmlTemplate(file.name.replace('.html', ''));

        // ファイル内容をステートに保存
        setFileContents(prev => ({
          ...prev,
          [file.name]: content
        }));

        // プロジェクト固有のパスを生成
        // src/pagesディレクトリに保存するパスを指定
        const filePath = `src/pages/${updatedFile.name}`;
        console.log(`ファイルを保存します: ${filePath}`);

        if (filePath && isElectronContext) {
          try {
            // プロジェクトIDも一緒に送信
            window.api.send('save-html-file', {
              projectId: activeProject.id,
              projectPath: activeProject.path,
              filePath,
              content
            });
            console.log(`ファイル保存リクエストを送信しました: ${filePath}`);
          } catch (error) {
            console.error(`ファイル保存エラー: ${error}`);
          }
        } else {
          console.log('Electron環境でないため、ファイル保存をスキップします');
        }

        return updatedFile;
      }

      return file;
    });

    setFileList(updatedFileList);
    console.log('ファイルリストを更新しました', updatedFileList);
  };

  const isSaveDisabled = fileList.every(file => file.status === '保存済');

  const handleSaveFileName = () => {
    if (fileName === '') {
      setError('ファイル名を入力してください');
      return;
    }

    const newFileName = fileName.endsWith('.html') ? fileName : fileName + '.html';

    // 編集前と同じファイル名なら何もしない
    if (newFileName === editingFile.name) {
      setEditingFile(null);
      setFileName('');
      return;
    }

    // 既に存在するファイル名との重複チェック
    if (fileList.some(item => item.name === newFileName && item.name !== editingFile.name)) {
      setError('このファイル名はすでに存在します');
      return;
    }

    // ファイル名の変更を適用
    const updatedList = fileList.map((item) => {
      if (item.id === editingFile.id) {
        return { ...item, name: newFileName, status: '保存済' };
      }
      return item;
    });

    // ファイル内容も新しい名前で保存
    const newContents = { ...fileContents };
    if (fileContents[editingFile.name]) {
      newContents[newFileName] = fileContents[editingFile.name];
      delete newContents[editingFile.name];
      setFileContents(newContents);
    }

    setFileList(updatedList);

    // 編集を終了し、フォームをリセット
    setEditingFile(null);
    setFileName('');

    // ファイル名を変更するためにメインプロセスに送信
    if (isElectronContext) {
      window.api.send('rename-file', {
        oldPath: `src/pages/${editingFile.name}`,
        newPath: `src/pages/${newFileName}`
      });
    }
  };

  // ファイル削除ハンドラ
  const handleDeleteFile = (fileName) => {
    try {
      console.log(`ファイル削除要求: ${fileName}`);

      // 確認ダイアログ
      if (!window.confirm(`${fileName} を削除してもよろしいですか？`)) {
        console.log('ファイル削除がキャンセルされました');
        return;
      }

      if (isElectronContext) {
        console.log(`Delete request sent for: ${fileName}`);

        // プロジェクト情報を含める
        window.api.send('delete-html-file', {
          projectId: activeProject.id,
          projectPath: activeProject.path,
          fileName
        });

        // 削除処理を実行
        removeFileFromState(fileName);
      }
    } catch (error) {
      console.error('ファイル削除処理中にエラーが発生しました:', error);
      setError(`ファイルの削除中にエラーが発生しました: ${error.message}`);
    }
  };

  // ファイルをステートから削除する共通関数
  const removeFileFromState = (fileName) => {
    try {
      console.log(`ファイル[${fileName}]をステートから削除します`);
      if (DEBUG) console.log('現在のファイルリスト:', fileList.map(f => f.name));

      // ファイルが削除リストに既に存在するか確認
      if (!fileList.some(file => file.name === fileName)) {
        console.log(`ファイル[${fileName}]は既に削除されているため処理をスキップします`);
        return;
      }

      // UIを即時更新するために先にステートを更新
      setFileList(prevList => {
        const newList = prevList.filter(file => file.name !== fileName);
        console.log(`ファイルリストを更新: ${prevList.length} → ${newList.length}件`);

        // ストアにも保存
        projectDataStore.saveProjectData(activeProject.id, 'htmlFiles', newList);
        return newList;
      });

      // ファイル内容も削除
      setFileContents(prev => {
        const newContents = { ...prev };
        delete newContents[fileName];

        // ストアにも保存
        projectDataStore.saveProjectData(activeProject.id, 'htmlContents', newContents);
        return newContents;
      });

      // 強制的に再レンダリング
      setUpdateTrigger(prev => prev + 1);
    } catch (error) {
      console.error(`ファイル[${fileName}]の削除中にエラーが発生:`, error);
    }
  };

  // 入力制限: 日本語・全角入力を防ぐ
  const handleFileNameChange = (e) => {
    const value = e.target.value;
    const regex = /^[a-zA-Z0-9-_]*$/;
    if (regex.test(value) || value === '') {
      setFileName(value);
    }
  };

  // デフォルトのHTMLテンプレートを返す関数
  const getDefaultHtmlTemplate = (pageName) => {
    const title = pageName === 'index' ? 'ホームページ' : pageName;
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
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
  };

  // レンダリング
  return (
    <div className="generate-html-container">
      <Header title="HTMLファイル生成" />

      {error && <div className="error-message">{error}</div>}

      {!activeProject ? (
        <div className="no-project">プロジェクトを選択してください</div>
      ) : (
        <>
          <div className="file-form">
            <input
              type="text"
              placeholder={editingFile ? "新しいファイル名" : "新規ファイル名（英数字のみ）"}
              value={fileName}
              onChange={handleFileNameChange}
              onKeyPress={handleKeyPress}
              className="file-input"
            />

            {editingFile ? (
              <button onClick={handleSaveFileName} className="save-button">
                ファイル名を変更
              </button>
            ) : (
              <button onClick={handleAddFile} className="add-button">
                ファイルを追加
              </button>
            )}
          </div>

          <div className="file-list">
            <h3>HTMLファイル一覧</h3>
            <ul>
              {fileList.map((file) => (
                <li key={file.id} className={file.status === '未保存' ? 'unsaved' : ''}>
                  <span className="file-name">{file.name}</span>
                  <span className="file-status">{file.status}</span>
                  <div className="file-actions">
                    <button
                      onClick={() => handleEditFile(file)}
                      className="edit-button"
                      title="ファイル名を編集"
                    >
                      編集
                    </button>
                    {file.name !== 'index.html' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(file.name);
                        }}
                        className="delete-button"
                        title="ファイルを削除"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="action-buttons">
            <button
              onClick={handleSaveFiles}
              disabled={isSaveDisabled}
              className={`save-all-button ${isSaveDisabled ? 'disabled' : ''}`}
            >
              すべてのファイルを保存
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default GenerateHTML;
