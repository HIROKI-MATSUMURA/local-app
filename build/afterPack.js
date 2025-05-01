/**
 * electron-builder向けのafterPackフック
 * ビルド後に追加の処理を行います
 */

const fs = require('fs');
const path = require('path');

/**
 * ビルド後のフックを実装
 * @param {Object} context - ビルドコンテキスト
 */
exports.default = async function (context) {
  const { appOutDir, packager, electronPlatformName } = context;
  const APP_NAME = packager.appInfo.productName;

  console.log(`afterPackフックが実行されました: ${electronPlatformName}`);

  // pythonスタンドアロン実行ファイルのパスを取得
  const execName = electronPlatformName === 'win32' ? 'python_server.exe' : 'python_server';

  // 複数のソースファイルの候補を定義
  const sourceFileCandidates = [
    path.resolve(packager.projectDir, 'dist', execName),
    path.resolve(packager.projectDir, 'build', execName),
    path.resolve(packager.projectDir, execName)
  ];

  // 最初に存在するファイルを使用
  let sourceFile = null;
  for (const candidate of sourceFileCandidates) {
    try {
      const stats = fs.statSync(candidate);
      if (stats.isFile()) {
        sourceFile = candidate;
        console.log(`スタンドアロンPython実行ファイルが見つかりました: ${sourceFile}`);
        break;
      } else {
        console.log(`${candidate}はファイルではありません（ディレクトリの可能性）`);
      }
    } catch (e) {
      console.log(`ファイルが見つかりません: ${candidate}`);
    }
  }

  if (!sourceFile) {
    console.error(`エラー: Python実行ファイルが見つかりません。以下の場所を確認しましたが見つかりませんでした:`);
    sourceFileCandidates.forEach(path => console.error(`- ${path}`));
    return;
  }

  // 宛先パスを取得
  let destDir;
  let destFile;

  if (electronPlatformName === 'darwin') {
    // macOS
    destDir = path.join(appOutDir, `${APP_NAME}.app`, 'Contents/Resources/app');
    destFile = path.join(destDir, execName);
  } else if (electronPlatformName === 'win32') {
    // Windows
    destDir = path.join(appOutDir, 'resources/app');
    destFile = path.join(destDir, execName);
  } else {
    // Linux
    destDir = path.join(appOutDir, 'resources/app');
    destFile = path.join(destDir, execName);
  }

  // 宛先ディレクトリが存在するか確認
  if (!fs.existsSync(destDir)) {
    try {
      fs.mkdirSync(destDir, { recursive: true });
      console.log(`ディレクトリを作成しました: ${destDir}`);
    } catch (err) {
      console.error(`ディレクトリの作成に失敗しました: ${err.message}`);
      return;
    }
  }

  // ファイルをコピー
  try {
    // ファイルの種類をチェック
    const stats = fs.statSync(sourceFile);
    if (!stats.isFile()) {
      console.error(`エラー: ソースが通常のファイルではありません: ${sourceFile}`);
      return;
    }

    // 手動でファイルをコピー
    try {
      const content = fs.readFileSync(sourceFile);
      fs.writeFileSync(destFile, content);
      console.log(`ファイルをコピーしました: ${sourceFile} -> ${destFile}`);

      // 実行権限を設定（macOSとLinux）
      if (electronPlatformName !== 'win32') {
        fs.chmodSync(destFile, 0o755);
        console.log(`実行権限を設定しました: ${destFile}`);
      }
    } catch (e) {
      console.error(`ファイルの読み書きに失敗しました: ${e.message}`);
      // ファイルがロックされている場合はcp操作を試みる
      try {
        const { execSync } = require('child_process');
        execSync(`cp "${sourceFile}" "${destFile}"`);
        console.log(`cp操作でファイルをコピーしました: ${sourceFile} -> ${destFile}`);

        if (electronPlatformName !== 'win32') {
          execSync(`chmod 755 "${destFile}"`);
          console.log(`cp操作で実行権限を設定しました: ${destFile}`);
        }
      } catch (cpErr) {
        console.error(`cp操作でファイルのコピーに失敗しました: ${cpErr.message}`);
      }
    }
  } catch (err) {
    console.error(`ファイルのコピーに失敗しました: ${err.message}`);
  }
};
