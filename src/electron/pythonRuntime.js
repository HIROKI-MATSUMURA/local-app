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
 * @param {Object} options - チェックオプション
 * @param {number} options.timeout - タイムアウト時間（ミリ秒）
 * @returns {Promise<Object>} チェック結果 { success: boolean, missingPackages: string[], detailedResults: Array }
 */
async function checkPythonPackages(options = {}) {
  console.log('必要なPythonパッケージをチェックしています...');
  const startTime = Date.now();
  
  // 必須パッケージリスト（すべて必須とする）
  const requiredPackages = [
    { name: 'numpy', importName: 'numpy', required: true },
    { name: 'pillow', importName: 'PIL', required: true },
    { name: 'opencv-python', importName: 'cv2', required: true },
    { name: 'scikit-image', importName: 'skimage', required: true },
    { name: 'scikit-learn', importName: 'sklearn', required: true },
    { name: 'pytesseract', importName: 'pytesseract', required: true },
    { name: 'matplotlib', importName: 'matplotlib', required: true },
    { name: 'torch', importName: 'torch', required: true },
    { name: 'requests', importName: 'requests', required: true },
    { name: 'imutils', importName: 'imutils', required: true },
    { name: 'psutil', importName: 'psutil', required: true }  // メモリ使用量の監視に必要
  ];
  
  // チェックするパッケージリスト（オプションを廃止）
  const packages = requiredPackages;
  
  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  
  // パッケージチェックのタイムアウト設定（環境に応じて調整可能）
  const PACKAGE_CHECK_TIMEOUT = options.timeout || 5000; // 5秒（2678msの実測に余裕を持たせる）
  
  try {
    // 並行処理でパッケージをチェックして速度を改善
    console.log('パッケージを並行でチェックします...');
    const packageChecks = packages.map(pkg => {
      return new Promise((resolve) => {
        let isResolved = false; // 解決済みフラグ
        
        // タイムアウト設定
        const timeoutId = setTimeout(() => {
          if (!isResolved) { // まだ解決されていない場合のみメッセージを表示
            console.error(`✗ ${pkg.name}のチェックがタイムアウトしました (${PACKAGE_CHECK_TIMEOUT}ms)`);
            isResolved = true;
            resolve({ name: pkg.name, installed: false, timeout: true });
          }
        }, PACKAGE_CHECK_TIMEOUT);
        
        // 実際のインポートチェック
        execAsync(`${pythonPath} -c "import ${pkg.importName}"`)
          .then(() => {
            clearTimeout(timeoutId); // タイムアウトをキャンセル
            if (!isResolved) { // まだ解決されていない場合のみ
              console.log(`✓ ${pkg.name}がインストールされています`);
              isResolved = true;
              resolve({ name: pkg.name, installed: true });
            }
          })
          .catch(error => {
            clearTimeout(timeoutId); // タイムアウトをキャンセル
            if (!isResolved) { // まだ解決されていない場合のみ
              console.error(`✗ ${pkg.name}がインストールされていません: ${error.message}`);
              isResolved = true;
              resolve({ name: pkg.name, installed: false, error: error.message });
            }
          });
      });
    });
    
    // 全てのチェック結果を取得
    const results = await Promise.all(packageChecks);
    
    // 不足しているパッケージを取得
    const missingPackages = results
      .filter(r => !r.installed)
      .map(r => r.name.toLowerCase());
    
    const endTime = Date.now();
    console.log(`✅ パッケージチェック完了: 所要時間 ${endTime - startTime}ms`);
    console.log(`- 必須パッケージ: ${results.length}個中 ${results.length - missingPackages.length}個 OK`);
    
    return {
      success: missingPackages.length === 0,
      missingPackages: missingPackages,
      allPackages: results.length,
      availablePackages: results.length - missingPackages.length,
      detailedResults: results,
      checkTimeMs: endTime - startTime
    };
  } catch (error) {
    const endTime = Date.now();
    console.error(`パッケージチェックエラー: ${error}, 所要時間 ${endTime - startTime}ms`);
    return {
      success: false,
      error: error.message,
      missingPackages: [],
      allPackages: 0,
      availablePackages: 0,
      detailedResults: [],
      checkTimeMs: endTime - startTime
    };
  }
}

module.exports = {
  checkPythonRuntime,
  checkPythonPackages
};