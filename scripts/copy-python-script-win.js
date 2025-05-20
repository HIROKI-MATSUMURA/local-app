#!/usr/bin/env node

/**
 * Pythonスクリプトとランチャーをアプリケーションパッケージにコピーするスクリプト（Windows用）
 * システム環境依存版
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ルートディレクトリ
const rootDir = path.resolve(__dirname, '../');
const sourceScriptDir = path.join(rootDir, 'src', 'python');
const launcherBatPath = path.join(rootDir, 'scripts', 'python_server_launcher_simple.bat');
const releaseDir = path.join(rootDir, 'release');

// Windows向けの出力ディレクトリを検索
function findOutputDirs() {
  console.log('Windows用パッケージングディレクトリを検索中...');

  const outputDirs = [];

  try {
    // x64ディレクトリを検索
    const winX64ReleaseDir = path.join(releaseDir, 'win-unpacked');
    if (fs.existsSync(winX64ReleaseDir)) {
      console.log(`x64出力ディレクトリを発見: ${winX64ReleaseDir}`);
      outputDirs.push(winX64ReleaseDir);
    }

    // x86ディレクトリを検索
    const winX86ReleaseDir = path.join(releaseDir, 'win-ia32-unpacked');
    if (fs.existsSync(winX86ReleaseDir)) {
      console.log(`x86出力ディレクトリを発見: ${winX86ReleaseDir}`);
      outputDirs.push(winX86ReleaseDir);
    }

    // その他の候補ディレクトリを検索
    const dirs = fs.readdirSync(releaseDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory() && (dir.name.includes('win') || dir.name.endsWith('-win32'))) {
        const fullPath = path.join(releaseDir, dir.name);
        if (!outputDirs.includes(fullPath)) {
          console.log(`追加の出力ディレクトリを発見: ${fullPath}`);
          outputDirs.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error('出力ディレクトリの検索中にエラーが発生しました:', err);
  }

  return outputDirs;
}

// Pythonスクリプトとランチャーをコピー
function copyPythonScripts(targetDirs) {
  for (const targetDir of targetDirs) {
    console.log(`${targetDir} にファイルをコピーしています...`);
    
    // リソースディレクトリを取得
    const resourcesDir = path.join(targetDir, 'resources', 'app');
    
    // Pythonディレクトリを作成
    const targetPythonDir = path.join(resourcesDir, 'python');
    if (!fs.existsSync(targetPythonDir)) {
      fs.mkdirSync(targetPythonDir, { recursive: true });
      console.log(`Pythonディレクトリを作成しました: ${targetPythonDir}`);
    }
    
    // Pythonスクリプトをコピー
    try {
      fs.cpSync(sourceScriptDir, targetPythonDir, { recursive: true });
      console.log(`  Pythonスクリプトをコピーしました: ${targetPythonDir}`);
    } catch (err) {
      console.error(`  Pythonスクリプトのコピーに失敗しました: ${err.message}`);
    }
    
    // ランチャーバッチファイルをコピー
    try {
      const targetLauncherPath = path.join(resourcesDir, 'python_server.bat');
      fs.copyFileSync(launcherBatPath, targetLauncherPath);
      console.log(`  ランチャーバッチファイルをコピーしました: ${targetLauncherPath}`);
    } catch (err) {
      console.error(`  ランチャーバッチファイルのコピーに失敗しました: ${err.message}`);
    }
    
    console.log(`${targetDir} へのコピーが完了しました`);
  }
}

// メイン処理
function main() {
  console.log('Windows用Pythonスクリプトコピー処理を開始します...');
  
  // 出力ディレクトリを検索
  const targetDirs = findOutputDirs();
  
  if (targetDirs.length === 0) {
    console.error('エラー: コピー先のディレクトリが見つかりません');
    process.exit(1);
  }
  
  // ファイルをコピー
  copyPythonScripts(targetDirs);
  
  console.log('Windows用Pythonスクリプトのコピーが完了しました');
}

// スクリプト実行
main();