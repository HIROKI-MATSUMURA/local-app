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
const pythonServerExe = path.join(distDir, 'python_server.exe');
const launcherBat = path.join(rootDir, 'python_server.bat');

// 出力ディレクトリを探す
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

// EXEファイルをコピー
function copyPythonExecutables(targetDirs) {
  const filesToCopy = [];
  
  // EXEファイルの存在を確認
  if (fs.existsSync(pythonServerX64Exe)) {
    filesToCopy.push({
      src: pythonServerX64Exe,
      dest: 'python_server_x64.exe'
    });
    console.log(`x64用EXEファイルが見つかりました: ${pythonServerX64Exe}`);
  } else {
    console.warn('警告: x64用EXEファイルが見つかりません');
  }
  
  if (fs.existsSync(pythonServerX86Exe)) {
    filesToCopy.push({
      src: pythonServerX86Exe,
      dest: 'python_server_x86.exe'
    });
    console.log(`x86用EXEファイルが見つかりました: ${pythonServerX86Exe}`);
  } else {
    console.warn('警告: x86用EXEファイルが見つかりません');
  }
  
  if (fs.existsSync(pythonServerExe)) {
    filesToCopy.push({
      src: pythonServerExe,
      dest: 'python_server.exe'
    });
    console.log(`共通EXEファイルが見つかりました: ${pythonServerExe}`);
  }
  
  // バッチファイルの存在を確認
  if (fs.existsSync(launcherBat)) {
    filesToCopy.push({
      src: launcherBat,
      dest: 'python_server.bat'
    });
    console.log(`バッチファイルが見つかりました: ${launcherBat}`);
  } else {
    console.error('エラー: バッチファイルが見つかりません');
    process.exit(1);
  }
  
  if (filesToCopy.length === 0) {
    console.error('エラー: コピーするファイルが見つかりません');
    process.exit(1);
  }
  
  // 各ターゲットディレクトリにファイルをコピー
  for (const targetDir of targetDirs) {
    console.log(`${targetDir} にファイルをコピーしています...`);
    
    // distフォルダを作成
    const targetDistDir = path.join(targetDir, 'dist');
    if (!fs.existsSync(targetDistDir)) {
      fs.mkdirSync(targetDistDir, { recursive: true });
      console.log(`distディレクトリを作成しました: ${targetDistDir}`);
    }
    
    for (const file of filesToCopy) {
      try {
        if (file.dest.endsWith('.exe')) {
          // EXEファイルはdistディレクトリにコピー
          const destPath = path.join(targetDistDir, file.dest);
          fs.copyFileSync(file.src, destPath);
          console.log(`  ${file.src} -> ${destPath}`);
        } else {
          // バッチファイルはルートディレクトリにコピー
          const destPath = path.join(targetDir, file.dest);
          fs.copyFileSync(file.src, destPath);
          console.log(`  ${file.src} -> ${destPath}`);
        }
      } catch (err) {
        console.error(`  コピー失敗 ${file.src}: ${err.message}`);
      }
    }
    
    console.log(`${targetDir} へのコピーが完了しました`);
  }
}

// メイン処理
try {
  console.log('Windows用Pythonスタンドアロン実行ファイルのコピーを開始します...');
  
  // 出力ディレクトリを検索
  const targetDirs = findOutputDirs();
  
  if (targetDirs.length === 0) {
    console.error('エラー: コピー先のディレクトリが見つかりません');
    process.exit(1);
  }
  
  // ファイルをコピー
  copyPythonExecutables(targetDirs);
  
  console.log('Pythonスタンドアロン実行ファイルのコピーが完了しました');
} catch (err) {
  console.error('エラーが発生しました:', err);
  process.exit(1);
}
