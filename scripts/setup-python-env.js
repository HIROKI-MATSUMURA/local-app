#!/usr/bin/env node

/**
 * Python環境セットアップスクリプト
 * 必要なパッケージを自動的にインストールします
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// プロジェクトルートディレクトリ
const ROOT_DIR = path.resolve(__dirname, '..');

// ログ出力関数
function log(message) {
  console.log(`[Setup] ${message}`);
}

function error(message) {
  console.error(`[Error] ${message}`);
}

// Pythonコマンドの検出
function detectPythonCommand() {
  const isWindows = process.platform === 'win32';
  const candidates = isWindows
    ? ['python', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const version = execSync(`${cmd} --version`, { encoding: 'utf8' }).trim();
      log(`Python検出: ${cmd} -> ${version}`);
      return { command: cmd, version };
    } catch (err) {
      // 実行できない場合は次の候補を試す
    }
  }

  throw new Error('インストール済みのPython実行環境が見つかりませんでした。');
}

// パッケージをインストール
function installPackages(pythonCmd) {
  log('必要なPythonパッケージをインストールしています...');
  
  const requirementsPath = path.join(ROOT_DIR, 'requirements.txt');
  
  if (!fs.existsSync(requirementsPath)) {
    error(`requirements.txtが見つかりません: ${requirementsPath}`);
    return false;
  }
  
  try {
    // パッケージのインストール
    execSync(`${pythonCmd} -m pip install -r "${requirementsPath}"`, {
      stdio: 'inherit',
      cwd: ROOT_DIR
    });
    
    log('パッケージのインストールが完了しました');
    return true;
  } catch (err) {
    error(`パッケージのインストールに失敗しました: ${err.message}`);
    return false;
  }
}

// パッケージのインストール確認
function verifyPackages(pythonCmd) {
  log('必要なパッケージがインストールされていることを確認します...');
  
  const requiredPackages = ['numpy', 'PIL', 'cv2'];
  const missingPackages = [];
  
  for (const pkg of requiredPackages) {
    try {
      execSync(`${pythonCmd} -c "import ${pkg}"`, { stdio: 'ignore' });
    } catch (err) {
      missingPackages.push(pkg);
    }
  }
  
  if (missingPackages.length > 0) {
    error(`以下のパッケージが見つかりません: ${missingPackages.join(', ')}`);
    return false;
  }
  
  log('必要なパッケージが正常にインストールされています');
  return true;
}

// メイン処理
async function main() {
  log('Python環境のセットアップを開始します');
  
  try {
    // Python検出
    const { command: pythonCmd, version } = detectPythonCommand();
    log(`Python実行環境: ${version}`);
    
    // pipの確認
    try {
      const pipVersion = execSync(`${pythonCmd} -m pip --version`, { encoding: 'utf8' }).trim();
      log(`pip: ${pipVersion}`);
    } catch (err) {
      error('pipが見つかりません。Pythonインストールを確認してください。');
      process.exit(1);
    }
    
    // パッケージのインストール
    if (!installPackages(pythonCmd)) {
      error('パッケージのインストールに失敗しました。');
      process.exit(1);
    }
    
    // パッケージの確認
    if (!verifyPackages(pythonCmd)) {
      error('必要なパッケージが正しくインストールされていません。');
      log('手動でインストールを試してください:');
      log(`${pythonCmd} -m pip install numpy pillow opencv-python`);
      process.exit(1);
    }
    
    log('Python環境のセットアップが完了しました');
  } catch (err) {
    error(`セットアップエラー: ${err.message}`);
    log('Python 3.9以上がインストールされていることを確認してください。');
    log('https://www.python.org/downloads/');
    process.exit(1);
  }
}

// スクリプト実行
main().catch(err => {
  error(`予期せぬエラー: ${err.message}`);
  process.exit(1);
});