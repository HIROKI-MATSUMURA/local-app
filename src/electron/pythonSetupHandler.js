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

// Python環境に必要なパッケージ (参照用 - 実際の処理はpythonRuntime.jsで行う)
const REQUIRED_PACKAGES = [
  { name: 'numpy', import: 'numpy' },
  { name: 'pillow', import: 'PIL' },
  { name: 'opencv-python', import: 'cv2' },
  { name: 'scikit-image', import: 'skimage' },
  { name: 'scikit-learn', import: 'sklearn' },
  { name: 'pytesseract', import: 'pytesseract' },
  { name: 'matplotlib', import: 'matplotlib' },
  { name: 'torch', import: 'torch' },
  { name: 'requests', import: 'requests' },
  { name: 'imutils', import: 'imutils' },
  { name: 'psutil', import: 'psutil' }  // メモリ使用量の監視に必要
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
   * @param {boolean} forceInstall 必須パッケージを強制的にインストールするかどうか
   * @returns {Promise<boolean>} Python環境が準備できているかどうか
   */
  async checkEnvironment(parentWindow = null, showUIOnFailure = true, forceInstall = true) {
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

      // 初回起動時または強制インストールフラグがある場合は、必須パッケージを全てインストール
      if (forceInstall) {
        console.log('必須パッケージを全てインストールします...');
        const installResult = await this.installPackages();
        
        if (!installResult) {
          console.error('パッケージインストールに失敗しました');
          
          if (showUIOnFailure && parentWindow) {
            this._showSetupWindow(parentWindow, {
              pythonInstalled: true,
              missingPackages: REQUIRED_PACKAGES.map(p => p.name),
              installFailed: true
            });
          }
          
          this.isEnvironmentReady = false;
          this.hasCheckedEnvironment = true;
          return false;
        }
        
        console.log('パッケージインストールに成功しました');
      }

      // pythonRuntime.jsの機能を利用する
      const { checkPythonPackages } = require('./pythonRuntime');
      
      // 拡張したパッケージチェック関数を呼び出す
      const result = await checkPythonPackages({
        timeout: 5000 // 5秒に設定
      });
      
      console.log('パッケージチェック結果:', result);
      
      // 不足しているパッケージを取得
      const missingPackages = result.missingPackages;

      // 不足しているパッケージがあれば表示
      if (missingPackages.length > 0) {
        console.error('不足しているパッケージ:', missingPackages.join(', '));
        
        // 不足パッケージを自動的にインストールしてみる
        console.log('不足パッケージを自動的にインストールします...');
        await this.installSpecificPackages(missingPackages);
        
        // 再度チェック
        const recheckResult = await checkPythonPackages({
          timeout: 5000
        });
        
        if (recheckResult.missingPackages.length > 0) {
          console.error('パッケージのインストールに失敗しました。再度チェック:', recheckResult.missingPackages.join(', '));
          
          if (showUIOnFailure && parentWindow) {
            this._showSetupWindow(parentWindow, {
              pythonInstalled: true,
              missingPackages: recheckResult.missingPackages
            });
          }
          
          this.isEnvironmentReady = false;
        } else {
          console.log('全てのパッケージが正常にインストールされました');
          this.isEnvironmentReady = true;
        }
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
      
      // 必須パッケージをインストール（ユーザーに権限問題が発生しないよう--user フラグを追加）
      const installCmd = `${pipCmd} install --user numpy pillow opencv-python scikit-image scikit-learn pytesseract matplotlib torch requests imutils psutil`;
      console.log(`実行コマンド: ${installCmd}`);
      
      const { stdout } = await execAsync(installCmd);
      console.log('パッケージインストール結果:', stdout);
      
      // 成功とみなす（実際のチェックは呼び出し元で行う）
      return true;
    } catch (error) {
      console.error('パッケージインストールエラー:', error);
      return false;
    }
  }
  
  /**
   * 特定のパッケージをインストールする
   * @param {Array<string>} packageNames インストールするパッケージ名の配列
   * @returns {Promise<boolean>} インストール成功かどうか
   */
  async installSpecificPackages(packageNames) {
    if (!packageNames || packageNames.length === 0) {
      console.log('インストールするパッケージがありません');
      return true;
    }
    
    // Pythonコマンドがない場合は失敗
    if (!this.pythonCommand) {
      console.error('Pythonコマンドが見つかりません');
      return false;
    }
    
    try {
      console.log(`以下のパッケージをインストールします: ${packageNames.join(', ')}`);
      const pipCmd = process.platform === 'win32' 
        ? `${this.pythonCommand} -m pip` 
        : 'pip3';
      
      // 指定されたパッケージをインストール（ユーザーに権限問題が発生しないよう--user フラグを追加）
      const installCmd = `${pipCmd} install --user ${packageNames.join(' ')}`;
      console.log(`実行コマンド: ${installCmd}`);
      
      const { stdout } = await execAsync(installCmd);
      console.log('パッケージインストール結果:', stdout);
      
      return true;
    } catch (error) {
      console.error('パッケージインストールエラー:', error);
      return false;
    }
  }
}

module.exports = new PythonSetupHandler();