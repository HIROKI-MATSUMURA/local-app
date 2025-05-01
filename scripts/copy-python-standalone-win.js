/**
 * Windows向けのPython実行ファイルをElectronアプリケーションディレクトリにコピーするスクリプト
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// パスの設定
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');
const pythonServerExe = path.join(distDir, 'python_server.exe');

// 出力ディレクトリを探す
function findOutputDir() {
  console.log('Windows用パッケージングディレクトリを検索中...');

  try {
    const winReleaseDir = path.join(releaseDir, 'win-unpacked');

    if (fs.existsSync(winReleaseDir)) {
      console.log(`出力ディレクトリを発見: ${winReleaseDir}`);
      return winReleaseDir;
    }

    // ディレクトリが見つからない場合
    console.error('Windows用出力ディレクトリが見つかりません。electron-builderの出力を確認してください。');
    return null;
  } catch (err) {
    console.error('ディレクトリ検索中にエラーが発生しました:', err);
    return null;
  }
}

// メイン処理
function main() {
  console.log('Windows用Pythonスタンドアロン実行ファイルコピープロセスを開始');

  try {
    // python_server.exeの存在確認
    if (!fs.existsSync(pythonServerExe)) {
      throw new Error(`Python実行ファイルが見つかりません: ${pythonServerExe}`);
    }

    console.log(`Python実行ファイルを発見: ${pythonServerExe}`);

    // 出力ディレクトリを取得
    const outputDir = findOutputDir();
    if (!outputDir) {
      throw new Error('コピー先ディレクトリが特定できないため、処理を中止します');
    }

    // コピー先のリソースディレクトリを作成
    const resourcesDir = path.join(outputDir, 'resources', 'app');

    if (!fs.existsSync(resourcesDir)) {
      console.log(`リソースディレクトリを作成: ${resourcesDir}`);
      fs.mkdirSync(resourcesDir, { recursive: true });
    }

    // Python実行ファイルをコピー
    const targetPath = path.join(resourcesDir, 'python_server.exe');
    fs.copyFileSync(pythonServerExe, targetPath);

    console.log(`Python実行ファイルをコピーしました: ${targetPath}`);
    console.log('Windows用Pythonスタンドアロン実行ファイルのコピーが完了しました');

  } catch (err) {
    console.error('エラーが発生しました:', err);
    process.exit(1);
  }
}

main();
