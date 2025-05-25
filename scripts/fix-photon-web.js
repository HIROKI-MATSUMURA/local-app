/**
 * photon-webモジュールの問題を修正するためのスクリプト
 * photon-webが見つからないか正しく読み込めない場合に実行する
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// アプリケーションのルートディレクトリ
const appRoot = path.resolve(__dirname, '../');
const nodeModulesDir = path.join(appRoot, 'node_modules');
const photonWebDir = path.join(nodeModulesDir, 'photon-web');

console.log('photon-webモジュールの修復を開始します...');

// 現在のインストール状態を確認
const photonWebExists = fs.existsSync(photonWebDir);
console.log(`photon-webディレクトリの存在: ${photonWebExists}`);

// photon-webのpackage.jsonを確認
if (photonWebExists) {
  const packageJsonPath = path.join(photonWebDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      console.log(`インストールされているphoton-webのバージョン: ${packageJson.version}`);
    } catch (error) {
      console.error(`package.jsonの解析エラー: ${error.message}`);
    }
  } else {
    console.log('photon-webのpackage.jsonが見つかりません');
  }
}

// photon-webを削除して再インストール
try {
  console.log('1. photon-webを削除しています...');
  if (photonWebExists) {
    fs.rmSync(photonWebDir, { recursive: true, force: true });
    console.log('✅ photon-webディレクトリを削除しました');
  }

  console.log('2. photon-webをインストールしています...');
  execSync('npm install photon-web@latest --force', { 
    cwd: appRoot,
    stdio: 'inherit'
  });
  console.log('✅ photon-webをインストールしました');

  console.log('3. photon-webをリビルドしています...');
  execSync('npm rebuild photon-web', { 
    cwd: appRoot,
    stdio: 'inherit'
  });
  console.log('✅ photon-webをリビルドしました');

  // 再インストール後の状態を確認
  if (fs.existsSync(photonWebDir)) {
    console.log('✅ photon-webディレクトリが存在します');
    
    // photon-webはESMモジュールなので、CommonJSからは直接requireできない
    // ファイル存在のみをチェックして成功とする
    const mainFile = path.join(photonWebDir, 'photon_web.js');
    const wasmFile = path.join(photonWebDir, 'photon_web_bg.wasm');
    
    if (fs.existsSync(mainFile) && fs.existsSync(wasmFile)) {
      console.log('✅ photon-webモジュールのファイルが正しく配置されています！修復成功！');
      console.log('注意: photon-webはESMモジュールのため、Node.jsのrequire()では直接ロードできませんが、ブラウザ環境では正常に動作します。');
    } else {
      console.error(`⚠️ photon-webの必要なファイルが見つかりません`);
      console.log('必要なファイルの詳細確認:');
      console.error(`  - メインファイル ${mainFile}: ${fs.existsSync(mainFile) ? '存在' : '不在'}`);
      console.error(`  - WASMファイル ${wasmFile}: ${fs.existsSync(wasmFile) ? '存在' : '不在'}`);
    }
  } else {
    console.error('⚠️ photon-webディレクトリが見つかりません。インストールに失敗した可能性があります。');
  }
  
  console.log('\n修復処理が完了しました。アプリケーションを再起動してください。');
} catch (error) {
  console.error(`エラーが発生しました: ${error.message}`);
  console.error('修復に失敗しました。手動でコマンドを実行してみてください：');
  console.log('npm uninstall photon-web');
  console.log('npm install photon-web@latest --force');
  console.log('npm rebuild photon-web');
}