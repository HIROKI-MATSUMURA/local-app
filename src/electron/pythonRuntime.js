/**
 * Python実行環境の検出とチェック機能
 * 
 * システム環境依存型のPython環境をチェックして、適切なPythonコマンドを返す
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Python実行環境をチェックする関数
 * @returns {Promise<string>} ステータス ('ok', 'system_not_found', 'version_error', 'error')
 */
async function checkPythonRuntime() {
  console.log('Python実行環境をチェックしています...');

  try {
    // 常にシステムのPythonを使用する（システム環境依存版）
    let pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    console.log(`システム環境依存版: システムのPythonを使用します: ${pythonPath}`);

    try {
      // システムPythonの存在確認
      const { stdout } = await execAsync(`${pythonPath} --version`);
      console.log(`システムPythonのバージョン: ${stdout.trim()}`);
    } catch (error) {
      console.error(`システムPythonの実行に失敗しました: ${error.message}`);
      return 'system_not_found';
    }

    // Pythonのバージョンをチェック
    try {
      const { stdout } = await execAsync(`"${pythonPath}" --version`);
      console.log(`Python バージョン: ${stdout.trim()}`);
      return 'ok';
    } catch (error) {
      console.error(`Pythonバージョンチェックエラー: ${error.message}`);
      return 'version_error';
    }
  } catch (error) {
    console.error('Python実行環境チェックエラー:', error);
    return 'error';
  }
}

/**
 * 必要なPythonパッケージをチェックする関数
 * @returns {Promise<Object>} チェック結果 { success: boolean, missingPackages: string[] }
 */
async function checkPythonPackages() {
  console.log('必要なPythonパッケージをチェックしています...');
  const startTime = Date.now();
  
  // 必要なパッケージリスト
  const packages = [
    { name: 'numpy', importName: 'numpy' },
    { name: 'pillow', importName: 'PIL' },
    { name: 'opencv-python', importName: 'cv2' },
    { name: 'torch', importName: 'torch' }
  ];
  
  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  
  // パッケージチェックのタイムアウト設定（環境に応じて調整可能）
  const PACKAGE_CHECK_TIMEOUT = 3000; // 3秒に延長
  
  try {
    // 並行処理でパッケージをチェックして速度を改善
    console.log('パッケージを並行でチェックします...');
    const packageChecks = packages.map(pkg => {
      return Promise.race([
        // タイムアウトを設定
        execAsync(`${pythonPath} -c "import ${pkg.importName}"`, { timeout: PACKAGE_CHECK_TIMEOUT })
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

module.exports = {
  checkPythonRuntime,
  checkPythonPackages
};