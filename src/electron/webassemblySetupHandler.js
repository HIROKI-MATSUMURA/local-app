/**
 * WebAssembly環境セットアップハンドラ
 * アプリケーション起動時のWebAssembly環境チェックと設定補助機能を提供
 */

const path = require('path');
const fs = require('fs');
const WebAssemblySetupWindow = require('./WebAssemblySetupWindow');
const moduleResolver = require('./utils/module-resolver');

// WebAssembly環境に必要なパッケージ
const REQUIRED_PACKAGES = [
  { name: '@techstark/opencv-js', version: '^4.10.0-release.1' },
  { name: 'tesseract.js', version: '^6.0.0' },
  { name: 'photon-web', version: '^0.3.2' }
];

class WebAssemblySetupHandler {
  constructor() {
    this.setupWindow = null;
    this.hasCheckedEnvironment = false;
    this.isEnvironmentReady = false;
  }

  /**
   * WebAssembly環境をチェックする
   * @param {BrowserWindow} parentWindow 親ウィンドウ
   * @param {boolean} showUIOnFailure 失敗時にUIを表示するかどうか
   * @param {boolean} forceInstall 必須パッケージを強制的にインストールするかどうか
   * @returns {Promise<boolean>} WebAssembly環境が準備できているかどうか
   */
  async checkEnvironment(parentWindow = null, showUIOnFailure = true, forceInstall = true) {
    console.log('WebAssembly環境のチェックを開始します...');
    const startTime = Date.now();

    try {
      // WebAssemblyモジュールのインポート
      let opencv, tesseract, photon;
      
      try {
        // OpenCVのロード
        opencv = require('@techstark/opencv-js');
        console.log('OpenCV.js確認: 利用可能');
      } catch (error) {
        console.error(`OpenCV.jsのロードに失敗しました: ${error.message}`);
        
        if (showUIOnFailure && parentWindow) {
          this._showSetupWindow(parentWindow, {
            modulesInstalled: false,
            missingModules: ['@techstark/opencv-js']
          });
        }
        
        return false;
      }
      
      try {
        // Tesseract.jsのロード
        tesseract = require('tesseract.js');
        console.log('Tesseract.js確認: 利用可能');
      } catch (error) {
        console.error(`Tesseract.jsのロードに失敗しました: ${error.message}`);
        
        if (showUIOnFailure && parentWindow) {
          this._showSetupWindow(parentWindow, {
            modulesInstalled: false,
            missingModules: ['tesseract.js']
          });
        }
        
        return false;
      }
      
      try {
        // 特別なモジュール解決ヘルパーを使用してPhoton Webをチェック
        const photonResult = moduleResolver.resolvePhotonWeb();
        
        if (photonResult.success) {
          // ESMモジュールなので、ファイル存在確認のみで成功とする
          console.log('Photon Web確認: 利用可能 (ESMモジュール)');
          photon = photonResult.module; // メタデータオブジェクト
        } else {
          console.error(`Photon Webのチェックに失敗しました: ${photonResult.error.message}`);
          
          // パッケージが存在するかを確認
          const appRoot = path.resolve(__dirname, '../../');
          const modulePath = path.resolve(appRoot, 'node_modules/photon-web');
          const packageExists = fs.existsSync(modulePath);
          
          if (showUIOnFailure && parentWindow) {
            this._showSetupWindow(parentWindow, {
              modulesInstalled: packageExists,
              missingModules: ['photon-web'],
              reinstallRecommended: true  // photon-webは常に特別な処理が必要
            });
          }
          
          return false;
        }
      } catch (error) {
        console.error(`Photon Webの処理中に予期しないエラーが発生しました: ${error.message}`);
        
        if (showUIOnFailure && parentWindow) {
          this._showSetupWindow(parentWindow, {
            modulesInstalled: false,
            missingModules: ['photon-web']
          });
        }
        
        return false;
      }
      
      // 全てのモジュールがロードできれば成功
      this.isEnvironmentReady = true;
      this.hasCheckedEnvironment = true;
      const endTime = Date.now();
      console.log(`✅ WebAssembly環境チェック完了: 所要時間 ${endTime - startTime}ms`);
      return true;
    } catch (error) {
      const endTime = Date.now();
      console.error(`WebAssembly環境チェックエラー: ${error}, 所要時間 ${endTime - startTime}ms`);
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
    console.log('🔥 _showSetupWindow が呼ばれました！');
    console.log('📋 setupData:', JSON.stringify(setupData, null, 2));
    console.log('🪟 parentWindow:', parentWindow ? 'あり' : 'なし');
    
    if (!this.setupWindow) {
      console.log('🆕 WebAssemblySetupWindow を新規作成します');
      this.setupWindow = new WebAssemblySetupWindow(parentWindow);
    } else {
      console.log('♻️ 既存のWebAssemblySetupWindow を使用します');
    }
    
    console.log('📺 セットアップウィンドウを表示します');
    this.setupWindow.show(setupData);
    console.log('✅ セットアップウィンドウ表示完了');
  }

  /**
   * 設定ウィンドウを閉じる
   */
  closeSetupWindow() {
    if (this.setupWindow) {
      this.setupWindow.close();
      this.setupWindow = null;
      
      // メモリ解放を積極的に促進
      if (global.gc) {
        setTimeout(() => {
          global.gc();
        }, 1000);
      }
    }
  }

  /**
   * 必要なモジュールが存在するか確認する
   * @returns {Promise<{missingModules: string[], installedModules: string[]}>} モジュール確認結果
   */
  async checkRequiredModules() {
    console.log('必要なWebAssemblyモジュールの確認を開始します...');
    
    // モジュール解決ヘルパーを使用してパッケージをチェック
    const { installedModules, missingModules } = moduleResolver.checkInstalledPackages(REQUIRED_PACKAGES);
    
    // 結果をログに出力
    if (installedModules.length > 0) {
      console.log(`インストール済みモジュール: ${installedModules.join(', ')}`);
    }
    
    if (missingModules.length > 0) {
      console.log(`不足しているモジュール: ${missingModules.join(', ')}`);
    } else {
      console.log('全ての必要なモジュールがインストールされています');
    }
    
    return {
      missingModules,
      installedModules
    };
  }
}

module.exports = new WebAssemblySetupHandler();