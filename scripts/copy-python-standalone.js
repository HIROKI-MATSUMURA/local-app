#!/usr/bin/env node

/**
 * スタンドアロンPython実行ファイルをアプリケーションパッケージにコピーするスクリプト
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ルートディレクトリ
const rootDir = path.resolve(__dirname, '../');

// ビルドディレクトリとリリースディレクトリ
const buildDir = path.join(rootDir, 'dist');
const buildDir2 = path.join(rootDir, 'build');
const releaseDir = path.join(rootDir, 'release');

// プラットフォーム検出
const platform = process.platform;
const isWin = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';

// 実行ファイル名
const executableName = isWin ? 'python_server.exe' : 'python_server';

// 検索するソースファイルの候補
const sourceFileCandidates = [
  path.join(buildDir, executableName),
  path.join(buildDir2, executableName),
  path.join(rootDir, executableName)
];

console.log(`スタンドアロンPython実行ファイルのコピーを開始します...`);
console.log(`プラットフォーム: ${platform}`);

// ファイルを探す
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

// ファイルが存在することを確認
if (!sourceFile) {
  console.error(`エラー: ソースファイルが見つかりません。以下の場所を確認しましたが見つかりませんでした:`);
  sourceFileCandidates.forEach(path => console.error(`- ${path}`));
  process.exit(1);
}

// releaseディレクトリ内のサブディレクトリを検索
function findAppDirectories() {
  if (!fs.existsSync(releaseDir)) {
    console.log(`リリースディレクトリが見つかりません: ${releaseDir}`);
    return [];
  }

  const appDirs = [];

  // macOS向けのパターン
  if (isMac) {
    const macAppDirs = [
      'mac',
      'mac-arm64',
      'mac-universal',
      'mac-x64',
      'mac-universal-x64-temp',
      'mac-universal-arm64-temp'
    ];

    for (const dir of macAppDirs) {
      const appPath = path.join(releaseDir, dir);
      if (fs.existsSync(appPath)) {
        // .app ディレクトリを検索
        const files = fs.readdirSync(appPath);
        for (const file of files) {
          if (file.endsWith('.app')) {
            const resourcesPath = path.join(appPath, file, 'Contents', 'Resources', 'app');
            if (fs.existsSync(resourcesPath)) {
              appDirs.push(resourcesPath);
            }
          }
        }
      }
    }
  }

  // Windows向けのパターン
  if (isWin) {
    const winAppDirs = [
      'win-unpacked',
      'win-ia32-unpacked',
      'win-x64-unpacked'
    ];

    for (const dir of winAppDirs) {
      const resourcesPath = path.join(releaseDir, dir, 'resources', 'app');
      if (fs.existsSync(resourcesPath)) {
        appDirs.push(resourcesPath);
      }
    }
  }

  // Linux向けのパターン
  if (isLinux) {
    const linuxAppDirs = [
      'linux-unpacked',
      'linux-ia32-unpacked',
      'linux-x64-unpacked',
      'linux-armv7l-unpacked',
      'linux-arm64-unpacked'
    ];

    for (const dir of linuxAppDirs) {
      const resourcesPath = path.join(releaseDir, dir, 'resources', 'app');
      if (fs.existsSync(resourcesPath)) {
        appDirs.push(resourcesPath);
      }
    }
  }

  return appDirs;
}

// ファイルをコピー
function copyFile(source, destination) {
  try {
    // ファイルの種類をチェック
    const stats = fs.statSync(source);
    if (!stats.isFile()) {
      console.error(`エラー: ソースが通常のファイルではありません: ${source}`);
      return false;
    }

    // 親ディレクトリを作成
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // 手動でファイルをコピー
    try {
      const content = fs.readFileSync(source);
      fs.writeFileSync(destination, content);
      console.log(`コピー成功: ${source} -> ${destination}`);

      // 実行ファイルの場合は権限を設定
      if (!isWin) {
        try {
          fs.chmodSync(destination, 0o755); // 実行権限を付与
          console.log(`実行権限を設定: ${destination}`);
        } catch (e) {
          console.warn(`権限設定に失敗: ${e.message}`);
        }
      }

      return true;
    } catch (e) {
      console.error(`ファイルの読み書きに失敗しました: ${e.message}`);
      // ファイルがロックされている場合はcp操作を試みる
      try {
        const { execSync } = require('child_process');
        execSync(`cp "${source}" "${destination}"`);
        console.log(`cp操作でファイルをコピーしました: ${source} -> ${destination}`);

        if (!isWin) {
          execSync(`chmod 755 "${destination}"`);
          console.log(`cp操作で実行権限を設定しました: ${destination}`);
        }
        return true;
      } catch (cpErr) {
        console.error(`cp操作でファイルのコピーに失敗しました: ${cpErr.message}`);
        return false;
      }
    }
  } catch (e) {
    console.error(`コピー失敗: ${e.message}`);
    return false;
  }
}

// メインの処理
async function main() {
  // すべてのアプリディレクトリを検索
  const appDirs = findAppDirectories();

  if (appDirs.length === 0) {
    console.log('対象となるアプリディレクトリが見つかりませんでした。');
    console.log('直接DMGをマウントして手動でファイルをコピーしてください。');
    return;
  }

  console.log(`${appDirs.length}個のアプリディレクトリが見つかりました。`);

  // 各ディレクトリにコピー
  let successCount = 0;

  for (const appDir of appDirs) {
    const destFile = path.join(appDir, executableName);
    if (copyFile(sourceFile, destFile)) {
      successCount++;
    }
  }

  console.log(`完了: ${successCount}/${appDirs.length}個のディレクトリにコピーしました。`);
}

// スクリプト実行
main().catch(err => {
  console.error('エラーが発生しました:', err);
  process.exit(1);
});
