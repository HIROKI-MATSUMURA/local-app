#!/usr/bin/env node

/**
 * Python実行環境をダウンロードし、パッケージ化のための準備を行うスクリプト
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

// Python実行環境をダウンロードするベースURL（例としてミニPython配布サイトなど）
const PYTHON_BASE_URL = {
  darwin: 'https://github.com/indygreg/python-build-standalone/releases/download/20231002/cpython-3.11.6+20231002-x86_64-apple-darwin-install_only.tar.gz',
  'darwin-arm64': 'https://github.com/indygreg/python-build-standalone/releases/download/20231002/cpython-3.11.6+20231002-aarch64-apple-darwin-install_only.tar.gz',
  win32: 'https://github.com/indygreg/python-build-standalone/releases/download/20231002/cpython-3.11.6+20231002-x86_64-pc-windows-msvc-shared-install_only.tar.gz',
  linux: 'https://github.com/indygreg/python-build-standalone/releases/download/20231002/cpython-3.11.6+20231002-x86_64-unknown-linux-gnu-install_only.tar.gz'
};

// ダウンロードするPythonのバージョン
const PYTHON_VERSION = '3.11.6';

// プラットフォームを検出
const platform = os.platform();
const arch = os.arch();
const platformKey = platform === 'darwin' && arch === 'arm64' ? 'darwin-arm64' : platform;

// ダウンロードURL
const downloadUrl = PYTHON_BASE_URL[platformKey];
if (!downloadUrl) {
  console.error(`サポートされていないプラットフォーム: ${platform}-${arch}`);
  process.exit(1);
}

console.log(`プラットフォーム: ${platform}-${arch}`);
console.log(`Python ${PYTHON_VERSION} のダウンロードを開始します...`);

// Python環境のダウンロード先ディレクトリ
const targetBaseDir = path.join(__dirname, '..', 'python-runtime');
const targetDir = path.join(targetBaseDir, platformKey);
const archiveFile = path.join(targetBaseDir, `python-${PYTHON_VERSION}-${platformKey}.tar.gz`);

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(targetBaseDir)) {
  fs.mkdirSync(targetBaseDir, { recursive: true });
}

// ダウンロード先が存在する場合は削除
if (fs.existsSync(targetDir)) {
  try {
    if (platform === 'win32') {
      execSync(`rmdir /s /q "${targetDir}"`);
    } else {
      execSync(`rm -rf "${targetDir}"`);
    }
  } catch (err) {
    console.error(`ディレクトリの削除に失敗しました: ${err.message}`);
  }
}

// ダウンロード先ディレクトリの作成
fs.mkdirSync(targetDir, { recursive: true });

console.log(`Python実行環境をダウンロードしています: ${downloadUrl}`);
console.log(`保存先: ${archiveFile}`);

// ファイルのダウンロード
const file = fs.createWriteStream(archiveFile);
https.get(downloadUrl, (response) => {
  response.pipe(file);

  file.on('finish', () => {
    file.close();
    console.log('ダウンロードが完了しました。');

    console.log('アーカイブを展開しています...');
    try {
      if (platform === 'win32') {
        execSync(`tar -xzf "${archiveFile}" -C "${targetDir}"`);
      } else {
        execSync(`tar -xzf "${archiveFile}" -C "${targetDir}"`);
      }
      console.log('アーカイブの展開が完了しました。');

      // 必要な場合は、実行ファイルに実行権限を付与
      if (platform !== 'win32') {
        try {
          // python実行ファイルのパスを特定
          const pythonBin = path.join(targetDir, 'python', 'bin', 'python3');
          if (fs.existsSync(pythonBin)) {
            execSync(`chmod +x "${pythonBin}"`);
            console.log(`実行権限を付与しました: ${pythonBin}`);

            // シンボリックリンクの作成
            const pythonLink = path.join(targetDir, 'python', 'python');
            if (!fs.existsSync(pythonLink)) {
              try {
                fs.symlinkSync(pythonBin, pythonLink);
                console.log(`シンボリックリンクを作成しました: ${pythonLink} -> ${pythonBin}`);
              } catch (linkErr) {
                console.error(`シンボリックリンクの作成に失敗しました: ${linkErr.message}`);
              }
            }
          } else {
            console.warn(`Python実行ファイルが見つかりません: ${pythonBin}`);
          }
        } catch (chmodErr) {
          console.error(`実行権限の付与に失敗しました: ${chmodErr.message}`);
        }
      } else {
        // Windowsの場合
        console.log('Windowsプラットフォームを検出しました - 追加の設定は必要ありません');
      }

      console.log('Python実行環境のセットアップが完了しました！');
      console.log(`実行環境ディレクトリ: ${targetDir}`);

      // アーカイブファイルを削除
      try {
        fs.unlinkSync(archiveFile);
        console.log(`アーカイブファイルを削除しました: ${archiveFile}`);
      } catch (unlinkErr) {
        console.error(`アーカイブファイルの削除に失敗しました: ${unlinkErr.message}`);
      }

    } catch (err) {
      console.error(`アーカイブの展開に失敗しました: ${err.message}`);
    }
  });
}).on('error', (err) => {
  fs.unlinkSync(archiveFile);
  console.error(`ダウンロードに失敗しました: ${err.message}`);
});
