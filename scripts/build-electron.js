// scripts/build-electron.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ビルドプロセスを実行する関数
async function buildElectron() {
  console.log('🚀 Electronアプリケーションのビルドを開始します...');

  try {
    // Viteビルドを実行
    console.log('📦 Viteを使用してフロントエンドをビルド中...');
    execSync('npm run vite-build', { stdio: 'inherit' });

    // ビルド前の準備: 必要なディレクトリを確保
    const buildDir = path.join(__dirname, '../build');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    // electron-builderを実行
    console.log('🔨 electron-builderを使用してWindowsパッケージを作成中...');
    execSync('npx electron-builder --win --x64 --publish never', { stdio: 'inherit' });

    // ビルド後の処理: 実行ファイルをコピー
    console.log('🔍 実行ファイルを検索してコピー中...');
    copyExecutables();

    console.log('✅ ビルドプロセスが正常に完了しました！');
  } catch (error) {
    console.error('❌ ビルド中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行ファイルをコピーする関数
function copyExecutables() {
  const releaseDir = path.join(__dirname, '../release');

  // Win-unpackedディレクトリを探す
  const winUnpackedDir = path.join(releaseDir, 'win-unpacked');
  const winArm64UnpackedDir = path.join(releaseDir, 'win-arm64-unpacked');

  let exeSourcePath;
  if (fs.existsSync(path.join(winUnpackedDir, 'CreAIteCode.exe'))) {
    exeSourcePath = path.join(winUnpackedDir, 'CreAIteCode.exe');
  } else if (fs.existsSync(path.join(winArm64UnpackedDir, 'CreAIteCode.exe'))) {
    exeSourcePath = path.join(winArm64UnpackedDir, 'CreAIteCode.exe');
  } else {
    console.warn('⚠️ CreAIteCode.exeが見つかりません。');
    return;
  }

  // NSISインストーラーのリソースディレクトリにexeをコピー
  const nsisBuildDir = path.join(releaseDir, 'win-ia32-unpacked');
  if (fs.existsSync(nsisBuildDir)) {
    const exeTargetPath = path.join(nsisBuildDir, 'CreAIteCode.exe');
    fs.copyFileSync(exeSourcePath, exeTargetPath);
    console.log(`✅ ${exeSourcePath} を ${exeTargetPath} にコピーしました。`);
  }

  // ビルドディレクトリにもコピー（インストーラーのリソースになる可能性があるため）
  const buildDir = path.join(__dirname, '../build');
  const exeBuildPath = path.join(buildDir, 'CreAIteCode.exe');
  fs.copyFileSync(exeSourcePath, exeBuildPath);
  console.log(`✅ ${exeSourcePath} を ${exeBuildPath} にコピーしました。`);
}

// スクリプトを実行
buildElectron();
