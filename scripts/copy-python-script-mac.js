#!/usr/bin/env node

/**
 * Pythonスクリプトとランチャーをアプリケーションパッケージにコピーするスクリプト（Mac用）
 * システム環境依存版
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ルートディレクトリ
const rootDir = path.resolve(__dirname, '../');
const sourceScriptDir = path.join(rootDir, 'src', 'python');
const launcherShPath = path.join(rootDir, 'scripts', 'python_server_launcher_simple.sh');
const releaseDir = path.join(rootDir, 'release');

// Macアプリ内のリソースディレクトリを探す
function findMacAppResourcesDir() {
  const macDirNames = ['mac', 'mac-arm64', 'mac-universal', 'mac-x64'];
  
  for (const dirName of macDirNames) {
    const macDir = path.join(releaseDir, dirName);
    if (!fs.existsSync(macDir)) continue;
    
    const files = fs.readdirSync(macDir);
    for (const file of files) {
      if (file.endsWith('.app')) {
        return path.join(macDir, file, 'Contents', 'Resources', 'app');
      }
    }
  }
  
  return null;
}

// メイン処理
function main() {
  console.log('Mac用Pythonスクリプトコピー処理を開始します...');
  
  const resourcesDir = findMacAppResourcesDir();
  if (!resourcesDir) {
    console.error('Mac用アプリが見つかりません');
    process.exit(1);
  }
  
  console.log(`リソースディレクトリを発見: ${resourcesDir}`);
  
  // Pythonスクリプトディレクトリをコピー
  const targetPythonDir = path.join(resourcesDir, 'python');
  fs.mkdirSync(targetPythonDir, { recursive: true });
  
  // src/pythonディレクトリのコンテンツをコピー（コピー関数を使用）
  try {
    fs.cpSync(sourceScriptDir, targetPythonDir, { recursive: true });
    console.log(`Pythonスクリプトをコピーしました: ${targetPythonDir}`);
  } catch (err) {
    console.error(`Pythonスクリプトのコピーに失敗しました: ${err.message}`);
    process.exit(1);
  }
  
  // ランチャースクリプトをコピー
  const targetLauncherPath = path.join(resourcesDir, 'python_server');
  try {
    fs.copyFileSync(launcherShPath, targetLauncherPath);
    fs.chmodSync(targetLauncherPath, 0o755); // 実行権限を付与
    console.log(`ランチャースクリプトをコピーしました: ${targetLauncherPath}`);
  } catch (err) {
    console.error(`ランチャースクリプトのコピーに失敗しました: ${err.message}`);
    process.exit(1);
  }
  
  console.log('Pythonスクリプトのコピーが完了しました');
}

// スクリプト実行
main();