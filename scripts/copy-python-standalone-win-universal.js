/**
 * Windows向けのユニバーサル（x86/x64）Python実行ファイルをElectronアプリケーションディレクトリにコピーするスクリプト
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// パスの設定
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');
const pythonServerX64Exe = path.join(distDir, 'python_server_x64.exe');
const pythonServerX86Exe = path.join(distDir, 'python_server_x86.exe');
const launcherBat = path.join(__dirname, 'python_server_launcher.bat');

// 出力ディレクトリを探す
function findOutputDirs() {
  console.log('Windows用パッケージングディレクトリを検索中...');

  const outputDirs = [];

  try {
    // x64ディレクトリを検索
    const winX64ReleaseDir = path.join(releaseDir, 'win-unpacked');
    if (fs.existsSync(winX64ReleaseDir)) {
      console.log(`x64出力ディレクトリを発見: ${winX64ReleaseDir}`);
      outputDirs.push({ arch: 'x64', dir: winX64ReleaseDir });
    }

    // ia32ディレクトリを検索
    const winX86ReleaseDir = path.join(releaseDir, 'win-ia32-unpacked');
    if (fs.existsSync(winX86ReleaseDir)) {
      console.log(`x86出力ディレクトリを発見: ${winX86ReleaseDir}`);
      outputDirs.push({ arch: 'ia32', dir: winX86ReleaseDir });
    }

    if (outputDirs.length === 0) {
      console.error('Windows用出力ディレクトリが見つかりません。electron-builderの出力を確認してください。');
      return null;
    }

    return outputDirs;
  } catch (err) {
    console.error('ディレクトリ検索中にエラーが発生しました:', err);
    return null;
  }
}

// メイン処理
function main() {
  console.log('Windows用Pythonスタンドアロン実行ファイルコピープロセスを開始');

  try {
    // python_server_x64.exeとpython_server_x86.exeの存在確認
    if (!fs.existsSync(pythonServerX64Exe)) {
      throw new Error(`x64 Python実行ファイルが見つかりません: ${pythonServerX64Exe}`);
    }
    console.log(`x64 Python実行ファイルを発見: ${pythonServerX64Exe}`);

    if (!fs.existsSync(pythonServerX86Exe)) {
      throw new Error(`x86 Python実行ファイルが見つかりません: ${pythonServerX86Exe}`);
    }
    console.log(`x86 Python実行ファイルを発見: ${pythonServerX86Exe}`);

    if (!fs.existsSync(launcherBat)) {
      throw new Error(`バッチランチャーが見つかりません: ${launcherBat}`);
    }
    console.log(`バッチランチャーを発見: ${launcherBat}`);

    // 出力ディレクトリを取得
    const outputDirs = findOutputDirs();
    if (!outputDirs) {
      throw new Error('コピー先ディレクトリが特定できないため、処理を中止します');
    }

    // 各アーキテクチャ向けに処理
    for (const { arch, dir } of outputDirs) {
      // コピー先のリソースディレクトリを作成
      const resourcesDir = path.join(dir, 'resources', 'app');

      if (!fs.existsSync(resourcesDir)) {
        console.log(`リソースディレクトリを作成: ${resourcesDir}`);
        fs.mkdirSync(resourcesDir, { recursive: true });
      }

      // x64 Python実行ファイルをコピー
      const targetX64Path = path.join(resourcesDir, 'python_server_x64.exe');
      fs.copyFileSync(pythonServerX64Exe, targetX64Path);
      console.log(`x64 Python実行ファイルをコピーしました: ${targetX64Path}`);

      // x86 Python実行ファイルをコピー
      const targetX86Path = path.join(resourcesDir, 'python_server_x86.exe');
      fs.copyFileSync(pythonServerX86Exe, targetX86Path);
      console.log(`x86 Python実行ファイルをコピーしました: ${targetX86Path}`);

      // ランチャーバッチファイルをコピー
      const targetLauncherPath = path.join(resourcesDir, 'python_server.bat');
      fs.copyFileSync(launcherBat, targetLauncherPath);
      console.log(`ランチャーバッチファイルをコピーしました: ${targetLauncherPath}`);

      // メインのpython_server.exeとしてシンボルを作成
      const targetMainPath = path.join(resourcesDir, 'python_server.exe');
      if (arch === 'x64') {
        fs.copyFileSync(pythonServerX64Exe, targetMainPath);
      } else {
        fs.copyFileSync(pythonServerX86Exe, targetMainPath);
      }
      console.log(`${arch}アーキテクチャ向けのメイン実行ファイルをコピーしました: ${targetMainPath}`);
    }

    console.log('Windows用Pythonスタンドアロン実行ファイルのコピーが完了しました');

  } catch (err) {
    console.error('エラーが発生しました:', err);
    process.exit(1);
  }
}

main();
