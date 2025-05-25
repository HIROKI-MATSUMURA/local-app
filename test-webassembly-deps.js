/**
 * WebAssembly依存関係チェック
 * アプリケーションで必要なWebAssemblyモジュールが正しく読み込めるか確認するテスト
 */

console.log('WebAssembly依存関係チェック開始...');
const startTime = Date.now();

// 必要なパッケージリスト
const packages = [
  { name: '@techstark/opencv-js', importName: '@techstark/opencv-js' },
  { name: 'tesseract.js', importName: 'tesseract.js' },
  { name: 'photon-web', importName: 'photon-web' }
];

async function testModuleDependencies() {
  try {
    // 並行処理でモジュールをチェック
    console.log('モジュールを並行でチェックします...');
    const moduleChecks = packages.map(pkg => {
      try {
        // モジュールを動的に読み込む試み
        const module = require(pkg.importName);
        console.log(`✓ ${pkg.name}が正常に読み込めます`);
        return { name: pkg.name, loaded: true };
      } catch (error) {
        console.error(`✗ ${pkg.name}の読み込みに失敗しました: ${error.message}`);
        return { name: pkg.name, loaded: false, error: error.message };
      }
    });
    
    // 不足しているモジュールを取得
    const missingModules = moduleChecks.filter(m => !m.loaded).map(m => m.name);
    
    const endTime = Date.now();
    console.log(`✅ モジュールチェック完了: 所要時間 ${endTime - startTime}ms、不足: ${missingModules.length}個`);
    
    return {
      success: missingModules.length === 0,
      missingModules,
      details: moduleChecks,
      checkTimeMs: endTime - startTime
    };
  } catch (error) {
    const endTime = Date.now();
    console.error(`モジュールチェックエラー: ${error.message}, 所要時間 ${endTime - startTime}ms`);
    return {
      success: false,
      error: error.message,
      missingModules: [],
      checkTimeMs: endTime - startTime
    };
  }
}

// テスト実行
testModuleDependencies()
  .then(result => {
    console.log('テスト結果:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('テスト失敗:', error);
    process.exit(1);
  });