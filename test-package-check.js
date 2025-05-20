const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
const startTime = Date.now();

console.log('パッケージチェックテスト開始...');

// 必要なパッケージリスト
const packages = [
  { name: 'numpy', importName: 'numpy' },
  { name: 'pillow', importName: 'PIL' },
  { name: 'opencv-python', importName: 'cv2' },
  { name: 'torch', importName: 'torch' }
];

// パッケージチェックのタイムアウト設定
const PACKAGE_CHECK_TIMEOUT = 3000; // 3秒

async function testPackageCheck() {
  try {
    // 並行処理でパッケージをチェック
    console.log('パッケージを並行でチェックします...');
    const packageChecks = packages.map(pkg => {
      return Promise.race([
        execAsync(`${pythonCommand} -c "import ${pkg.importName}"`, { timeout: PACKAGE_CHECK_TIMEOUT })
          .then(() => {
            console.log(`✓ ${pkg.name}がインストールされています`);
            return { name: pkg.name, installed: true };
          })
          .catch(error => {
            console.error(`✗ ${pkg.name}がインストールされていません: ${error.message}`);
            return { name: pkg.name, installed: false };
          }),
        new Promise(resolve => setTimeout(() => {
          console.error(`✗ ${pkg.name}のチェックがタイムアウトしました (${PACKAGE_CHECK_TIMEOUT}ms)`);
          resolve({ name: pkg.name, installed: false, timeout: true });
        }, PACKAGE_CHECK_TIMEOUT))
      ]);
    });
    
    // 全てのチェック結果を取得
    const results = await Promise.all(packageChecks);
    
    // 不足しているパッケージを取得
    const missingPackages = results.filter(r => !r.installed).map(r => r.name.toLowerCase());
    
    const endTime = Date.now();
    console.log(`✅ パッケージチェック完了: 所要時間 ${endTime - startTime}ms、不足: ${missingPackages.length}個`);
    
    return {
      success: missingPackages.length === 0,
      missingPackages,
      checkTimeMs: endTime - startTime
    };
  } catch (error) {
    const endTime = Date.now();
    console.error(`パッケージチェックエラー: ${error}, 所要時間 ${endTime - startTime}ms`);
    return {
      success: false,
      error: error.message,
      missingPackages: [],
      checkTimeMs: endTime - startTime
    };
  }
}

// テスト実行
testPackageCheck()
  .then(result => {
    console.log('テスト結果:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('テスト失敗:', error);
    process.exit(1);
  });