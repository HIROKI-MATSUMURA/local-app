/**
 * Python環境セットアップハンドラ
 * アプリケーション起動時のPython環境チェックと設定補助機能を提供
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs');
const PythonSetupWindow = require('./PythonSetupWindow');

// Python環境に必要なパッケージ
const REQUIRED_PACKAGES = [
  { name: 'numpy', import: 'numpy' },
  { name: 'pillow', import: 'PIL' },
  { name: 'opencv-python', import: 'cv2' },
  { name: 'torch', import: 'torch' }
];

class PythonSetupHandler {
  constructor() {
    this.pythonCommand = null;
    this.setupWindow = null;
    this.hasCheckedEnvironment = false;
    this.isEnvironmentReady = false;
  }

  /**
   * Python環境をチェックする
   * @param {BrowserWindow} parentWindow 親ウィンドウ
   * @param {boolean} showUIOnFailure 失敗時にUIを表示するかどうか
   * @returns {Promise<boolean>} Python環境が準備できているかどうか
   */
  async checkEnvironment(parentWindow = null, showUIOnFailure = true) {
    console.log('Python環境のチェックを開始します...');
    const startTime = Date.now();

    try {
      // Python実行コマンドの検出
      this.pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
      console.log(`使用するPythonコマンド: ${this.pythonCommand}`);

      // Pythonの存在確認
      let pythonInstalled = false;
      try {
        const { stdout } = await execAsync(`${this.pythonCommand} --version`);
        console.log(`Python確認: ${stdout.trim()}`);
        pythonInstalled = true;
      } catch (error) {
        console.error(`Pythonが見つかりません: ${error.message}`);
        
        if (showUIOnFailure && parentWindow) {
          this._showSetupWindow(parentWindow, {
            pythonInstalled: false,
            missingPackages: []
          });
        }
        
        return false;
      }

      // 必要なパッケージの確認
      let missingPackages = [];
      
      // パッケージチェックのタイムアウト設定（環境に応じて調整可能）
      const PACKAGE_CHECK_TIMEOUT = 3000; // 3秒に延長
      
      // 並行処理でパッケージをチェックすることで、処理速度を大幅に改善
      console.log('パッケージを並行でチェックします...');
      const packageChecks = REQUIRED_PACKAGES.map(pkg => {
        return Promise.race([
          // タイムアウトを設定
          execAsync(`${this.pythonCommand} -c "import ${pkg.import}"`, { timeout: PACKAGE_CHECK_TIMEOUT })
            .then(() => {
              console.log(`✅ ${pkg.name}がインストールされています`);
              return { name: pkg.name, installed: true, importName: pkg.import };
            })
            .catch(error => {
              console.error(`❌ ${pkg.name}がインストールされていません: ${error.message}`);
              console.error(`  パッケージ名: ${pkg.name}, インポート名: ${pkg.import}`);
              console.error(`  インストールコマンド例: ${this.pythonCommand === 'python' ? 'python -m pip' : 'pip3'} install ${pkg.name}`);
              return { name: pkg.name, installed: false, importName: pkg.import };
            }),
          new Promise(resolve => setTimeout(() => {
            console.error(`❌ ${pkg.name}のチェックがタイムアウトしました (${PACKAGE_CHECK_TIMEOUT}ms)`);
            resolve({ name: pkg.name, installed: false, importName: pkg.import, timeout: true });
          }, PACKAGE_CHECK_TIMEOUT))
        ]);
      });
      
      // 全てのチェック結果を取得
      const results = await Promise.all(packageChecks);
      
      // 不足しているパッケージを取得
      missingPackages = results.filter(r => !r.installed).map(r => r.name.toLowerCase());

      // 不足しているパッケージがあれば表示
      if (missingPackages.length > 0) {
        console.error('不足しているパッケージ:', missingPackages.join(', '));
        
        if (showUIOnFailure && parentWindow) {
          this._showSetupWindow(parentWindow, {
            pythonInstalled: true,
            missingPackages: missingPackages
          });
        }
        
        this.isEnvironmentReady = false;
      } else {
        console.log('✅ Python環境が正常に設定されています');
        this.isEnvironmentReady = true;
      }

      this.hasCheckedEnvironment = true;
      const endTime = Date.now();
      console.log(`✅ Python環境チェック完了: 所要時間 ${endTime - startTime}ms`);
      return this.isEnvironmentReady;
    } catch (error) {
      const endTime = Date.now();
      console.error(`Python環境チェックエラー: ${error}, 所要時間 ${endTime - startTime}ms`);
      this.hasCheckedEnvironment = true;
      this.isEnvironmentReady = false;
      return false;
    }
  }

  /**
   * 設定ウィンドウを表示する
   * @param {BrowserWindow} parentWindow 親ウィンドウ
   * @param {Object} setupData セットアップデータ
   * @private
   */
  _showSetupWindow(parentWindow, setupData) {
    if (!this.setupWindow) {
      this.setupWindow = new PythonSetupWindow(parentWindow);
    }
    
    this.setupWindow.show(setupData);
  }

  /**
   * 設定ウィンドウを閉じる
   */
  closeSetupWindow() {
    if (this.setupWindow) {
      this.setupWindow.close();
      this.setupWindow = null;
    }
  }

  /**
   * パッケージを自動インストールする（オプション機能）
   * @returns {Promise<boolean>} インストール成功かどうか
   */
  async installPackages() {
    if (!this.hasCheckedEnvironment) {
      await this.checkEnvironment(null, false);
    }
    
    if (this.isEnvironmentReady) {
      console.log('すべてのパッケージがすでにインストールされています');
      return true;
    }
    
    // Pythonコマンドがない場合は失敗
    if (!this.pythonCommand) {
      console.error('Pythonコマンドが見つかりません');
      return false;
    }
    
    try {
      console.log('必要なパッケージをインストールしています...');
      const pipCmd = process.platform === 'win32' 
        ? `${this.pythonCommand} -m pip` 
        : 'pip3';
      
      const installCmd = `${pipCmd} install numpy pillow opencv-python torch`;
      console.log(`実行コマンド: ${installCmd}`);
      
      const { stdout } = await execAsync(installCmd);
      console.log('パッケージインストール結果:', stdout);
      
      // 環境を再チェック
      return await this.checkEnvironment(null, false);
    } catch (error) {
      console.error('パッケージインストールエラー:', error);
      return false;
    }
  }
}

module.exports = new PythonSetupHandler();