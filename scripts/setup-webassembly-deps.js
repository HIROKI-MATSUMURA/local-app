/**
 * WebAssembly依存関係の自動セットアップスクリプト
 * npm installまたはアプリのインストール後に自動実行される
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 必要なWebAssemblyパッケージ
const REQUIRED_PACKAGES = [
  { name: '@techstark/opencv-js', version: '^4.10.0-release.1' },
  { name: 'tesseract.js', version: '^6.0.0' },
  { name: 'photon-web', version: '^0.3.2' }
];

console.log('🚀 WebAssembly依存関係のセットアップを開始します...');
console.log('📁 実行ディレクトリ:', __dirname);
console.log('📁 アプリルート:', path.resolve(__dirname, '../'));

// コンソールとファイルへの重複出力用関数
function logBoth(message) {
  console.log(message);
  try {
    const logFile = path.join(__dirname, '..', 'setup-log.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  } catch (e) {
    // ログファイル書き込みエラーは無視
  }
}

logBoth('🚀 自動セットアップスクリプトが開始されました');

// アプリケーションのルートディレクトリ
const appRoot = path.resolve(__dirname, '../');
const nodeModulesDir = path.join(appRoot, 'node_modules');
const packageJsonPath = path.join(appRoot, 'package.json');

/**
 * パッケージがインストールされているかチェック
 */
function isPackageInstalled(packageName) {
  const packageDir = path.join(nodeModulesDir, packageName);
  return fs.existsSync(packageDir);
}

/**
 * パッケージをインストール
 */
function installPackage(pkg) {
  try {
    console.log(`📦 ${pkg.name}@${pkg.version} をインストールしています...`);
    execSync(`npm install ${pkg.name}@${pkg.version} --save`, { 
      cwd: appRoot,
      stdio: 'pipe' // エラーの場合のみ出力
    });
    console.log(`✅ ${pkg.name} のインストールが完了しました`);
    return true;
  } catch (error) {
    console.error(`❌ ${pkg.name} のインストールに失敗しました: ${error.message}`);
    return false;
  }
}

/**
 * photon-webの特別な処理（完全な修復を含む）
 */
function fixPhotonWeb() {
  const photonWebDir = path.join(nodeModulesDir, 'photon-web');
  const packageJsonPath = path.join(photonWebDir, 'package.json');
  
  if (!fs.existsSync(photonWebDir)) {
    console.log('📦 photon-webが見つからないため、インストールを実行します...');
    return installPackage({ name: 'photon-web', version: '^0.3.2' });
  }
  
  // 必要なファイルの存在確認
  const mainFile = path.join(photonWebDir, 'photon_web.js');
  const wasmFile = path.join(photonWebDir, 'photon_web_bg.wasm');
  
  const mainExists = fs.existsSync(mainFile);
  const wasmExists = fs.existsSync(wasmFile);
  
  // ファイルが不足している場合は完全に再インストール
  if (!mainExists || !wasmExists) {
    console.log('🔄 photon-webのファイルが不足しているため、再インストールします...');
    try {
      // 既存のディレクトリを削除
      if (fs.existsSync(photonWebDir)) {
        fs.rmSync(photonWebDir, { recursive: true, force: true });
        console.log('🗑️ 既存のphoton-webディレクトリを削除しました');
      }
      
      // 再インストール
      execSync('npm install photon-web@latest --force', { 
        cwd: appRoot,
        stdio: 'pipe'
      });
      console.log('📦 photon-webを再インストールしました');
      
      // リビルド
      execSync('npm rebuild photon-web', { 
        cwd: appRoot,
        stdio: 'pipe'
      });
      console.log('🔧 photon-webをリビルドしました');
      
    } catch (error) {
      console.error(`❌ photon-webの再インストール中にエラー: ${error.message}`);
      return false;
    }
  }
  
  try {
    // package.jsonにmainエントリーを追加（必要な場合）
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (!packageJson.main) {
        packageJson.main = 'photon_web.js';
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log('🔧 photon-webのpackage.jsonにmainエントリーを追加しました');
      }
    }
    
    // 最終確認
    const finalMainExists = fs.existsSync(mainFile);
    const finalWasmExists = fs.existsSync(wasmFile);
    
    if (finalMainExists && finalWasmExists) {
      console.log('✅ photon-webの修復が完了しました');
      return true;
    } else {
      console.error('❌ photon-webの修復に失敗しました');
      console.error(`  - メインファイル: ${finalMainExists ? '存在' : '不在'}`);
      console.error(`  - WASMファイル: ${finalWasmExists ? '存在' : '不在'}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ photon-webの修正中にエラーが発生: ${error.message}`);
    return false;
  }
}

/**
 * メイン処理
 */
function main() {
  let allSuccess = true;
  let installedCount = 0;
  let skippedCount = 0;
  
  console.log('📋 必要なパッケージをチェックしています...');
  
  for (const pkg of REQUIRED_PACKAGES) {
    if (isPackageInstalled(pkg.name)) {
      console.log(`⏭️  ${pkg.name} は既にインストールされています`);
      skippedCount++;
    } else {
      const success = installPackage(pkg);
      if (success) {
        installedCount++;
      } else {
        allSuccess = false;
      }
    }
  }
  
  // photon-webの特別な処理
  if (isPackageInstalled('photon-web')) {
    console.log('🔧 photon-webの設定をチェックしています...');
    fixPhotonWeb();
  }
  
  // 結果の表示
  console.log('\n📊 セットアップ結果:');
  console.log(`   新規インストール: ${installedCount}個`);
  console.log(`   既存パッケージ: ${skippedCount}個`);
  
  if (allSuccess) {
    console.log('🎉 WebAssembly依存関係のセットアップが完了しました！');
    console.log('   アプリケーションを起動できます。');
  } else {
    console.log('⚠️  一部のパッケージでエラーが発生しました。');
    console.log('   手動で以下のコマンドを実行してください:');
    console.log('   npm run setup-deps');
  }
}

// スクリプトが直接実行された場合のみ実行
if (require.main === module) {
  main();
}

module.exports = { main, isPackageInstalled, installPackage, fixPhotonWeb };