// scripts/copy-exe.js
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
  const { appOutDir, electronPlatformName, arch } = context;

  // Windowsビルドの場合のみ処理を実行
  if (electronPlatformName === 'win32') {
    console.log(`📦 Windowsビルド(${arch})の後処理を実行中...`);
    console.log(`📂 アプリ出力ディレクトリ: ${appOutDir}`);

    // 可能性のある実行ファイルのパスをすべて列挙
    const possibleExePaths = [
      path.join(__dirname, '../release/win-unpacked/CreAIteCode.exe'),
      path.join(__dirname, '../release/win-arm64-unpacked/CreAIteCode.exe'),
      path.join(__dirname, '../release/win-ia32-unpacked/CreAIteCode.exe'),
      path.join(__dirname, '../build/CreAIteCode.exe'),
      path.join(__dirname, '../dist/CreAIteCode.exe')
    ];

    // ディレクトリ構造の確認
    console.log(`📁 アプリケーションディレクトリの内容を列挙します...`);
    listDirectoryContents(appOutDir);

    // exeファイルを探して対象ディレクトリにコピー
    let copied = false;
    for (const exePath of possibleExePaths) {
      if (fs.existsSync(exePath)) {
        const exeTargetPath = path.join(appOutDir, 'CreAIteCode.exe');
        fs.copyFileSync(exePath, exeTargetPath);
        console.log(`✅ ${exePath} を ${exeTargetPath} にコピーしました`);
        copied = true;

        // リソースディレクトリにもコピー（予備）
        const resourcesDir = path.join(appOutDir, 'resources');
        if (fs.existsSync(resourcesDir)) {
          const resourceTargetPath = path.join(resourcesDir, 'CreAIteCode.exe');
          fs.copyFileSync(exePath, resourceTargetPath);
          console.log(`✅ 予備として ${exePath} を ${resourceTargetPath} にもコピーしました`);
        }

        break;
      }
    }

    if (!copied) {
      console.log(`⚠️ 既知のパスにCreAIteCode.exeが見つかりません。ディレクトリを検索します...`);
      const found = await findAndCopyExe(path.join(__dirname, '..'), appOutDir);
      if (!found) {
        console.error('❌ CreAIteCode.exeが見つかりませんでした。');
      }
    }

    // インストールディレクトリにマーカーファイルを作成
    createMarkerFile(appOutDir);
  } else {
    console.log(`ℹ️ ${electronPlatformName}プラットフォームではexeコピーをスキップします`);
  }
};

// ディレクトリの内容を再帰的に表示する関数
function listDirectoryContents(dirPath, level = 0) {
  if (level > 2) return; // 再帰の深さを制限

  try {
    const indent = '  '.repeat(level);
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        console.log(`${indent}📁 ${item}/`);
        listDirectoryContents(itemPath, level + 1);
      } else {
        console.log(`${indent}📄 ${item}`);
      }
    }
  } catch (err) {
    console.error(`ディレクトリ ${dirPath} の読み取り中にエラーが発生しました:`, err);
  }
}

// exeファイルを検索してコピーする関数
async function findAndCopyExe(rootDir, targetDir) {
  let found = false;

  try {
    const findExe = (dir) => {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        if (found) return; // 既に見つかった場合は終了

        const itemPath = path.join(dir, item);
        try {
          const stats = fs.statSync(itemPath);

          if (stats.isDirectory()) {
            findExe(itemPath);
          } else if (item === 'CreAIteCode.exe') {
            const targetPath = path.join(targetDir, 'CreAIteCode.exe');
            fs.copyFileSync(itemPath, targetPath);
            console.log(`✅ ${itemPath} を ${targetPath} にコピーしました`);
            found = true;
            return;
          }
        } catch (err) {
          // 一部のファイルにアクセスできない場合はスキップ
        }
      }
    };

    findExe(rootDir);
  } catch (err) {
    console.error('検索中にエラーが発生しました:', err);
  }

  return found;
}

// インストール確認用のマーカーファイルを作成
function createMarkerFile(appOutDir) {
  const markerPath = path.join(appOutDir, 'CreAIteCode.installed');
  try {
    fs.writeFileSync(markerPath, `インストール日時: ${new Date().toISOString()}\n`);
    console.log(`✅ マーカーファイルを作成しました: ${markerPath}`);
  } catch (err) {
    console.error('マーカーファイル作成中にエラーが発生しました:', err);
  }
}
