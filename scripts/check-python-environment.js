#!/usr/bin/env node

/**
 * Python環境チェックスクリプト
 * Python実行環境が利用可能で、必要なパッケージ（numpy, pillow, opencv-python, torch）がインストールされているかを確認します
 * Web開発者向けに必要な環境をチェックし、不足しているものがあればインストール方法を表示します
 */

const { exec } = require('child_process');
const path = require('path');
const os = require('os');

// プラットフォーム検出
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// メイン関数
async function main() {
  console.log('Python環境チェックを開始します...');
  
  try {
    // Python検出
    const pythonCommand = await detectPythonExecutable();
    console.log(`Python実行コマンド: ${pythonCommand}`);
    
    if (!pythonCommand) {
      console.error('Pythonが見つかりませんでした。Python 3.9以上をインストールしてください。');
      process.exit(1);
    }
    
    // Pythonバージョン確認
    const pythonVersion = await getPythonVersion(pythonCommand);
    console.log(`Pythonバージョン: ${pythonVersion}`);
    
    // 必須パッケージの確認
    await checkRequiredPackages(pythonCommand);
    
    console.log('Python環境チェックが完了しました。必要な環境が整っています。');
  } catch (error) {
    console.error('Python環境チェックエラー:', error.message);
    process.exit(1);
  }
}

// Python実行環境の検出
async function detectPythonExecutable() {
  console.log('システムPythonを検出しています...');
  
  // 候補を単純化
  const candidates = isWindows
    ? ['python', 'py']  // Windowsでは通常python.exeまたはpy.exe
    : ['python3', 'python'];  // Mac/Linuxではpython3が優先
  
  for (const cmd of candidates) {
    try {
      // バージョン確認コマンドを実行
      const version = await execCommand(`${cmd} --version`);
      console.log(`Python検出: ${cmd} -> ${version}`);
      return cmd;  // 最初に見つかったコマンドを返す
    } catch (error) {
      console.log(`Python検出失敗: ${cmd} -> ${error.message}`);
    }
  }
  
  return null;
}

// Pythonバージョンを取得
async function getPythonVersion(pythonCmd) {
  try {
    const version = await execCommand(`${pythonCmd} --version`);
    return version.trim();
  } catch (error) {
    throw new Error(`Pythonバージョンの取得に失敗しました: ${error.message}`);
  }
}

// 必須パッケージの確認
async function checkRequiredPackages(pythonCmd) {
  console.log('必要なパッケージを確認しています...');
  
  const packages = [
    { name: 'NumPy', module: 'numpy' },
    { name: 'PIL/Pillow', module: 'PIL' },
    { name: 'OpenCV', module: 'cv2' },
    { name: 'PyTorch', module: 'torch' }
  ];
  
  const missingPackages = [];
  
  for (const pkg of packages) {
    try {
      await execCommand(`${pythonCmd} -c "import ${pkg.module}"`);
      console.log(`✅ ${pkg.name} がインストールされています`);
    } catch (error) {
      console.error(`❌ ${pkg.name} がインストールされていません`);
      missingPackages.push(pkg);
    }
  }
  
  if (missingPackages.length > 0) {
    console.error('以下のパッケージがインストールされていません:');
    missingPackages.forEach(pkg => console.error(`  - ${pkg.name}`));
    
    console.log('\n以下のコマンドでインストールできます:');
    if (isMac) {
      console.log(`  pip3 install numpy pillow opencv-python torch`);
    } else {
      console.log(`  ${pythonCmd} -m pip install numpy pillow opencv-python torch`);
    }
    
    throw new Error('必要なパッケージがインストールされていません');
  }
}

// コマンド実行補助関数
function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// スクリプトの実行
main().catch(error => {
  console.error('予期せぬエラーが発生しました:', error);
  process.exit(1);
});