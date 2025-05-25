/**
 * モジュール解決ヘルパー
 * WebAssemblyモジュールなど特殊な依存関係のロードを支援
 */

const path = require('path');
const fs = require('fs');

/**
 * モジュールが存在するかチェックし、ロードを試みる
 * @param {string} moduleName モジュール名
 * @param {object} options オプション
 * @param {boolean} options.verbose 詳細出力するかどうか
 * @returns {object} 結果オブジェクト {success, module, error}
 */
function resolveModule(moduleName, options = { verbose: false }) {
  const log = (msg) => {
    if (options.verbose) {
      console.log(`[ModuleResolver] ${msg}`);
    }
  };

  try {
    // 1. 通常のrequireを試す
    try {
      const loadedModule = require(moduleName);
      log(`モジュール '${moduleName}' を通常の方法でロードしました`);
      return { success: true, module: loadedModule, error: null };
    } catch (error) {
      log(`通常の方法でモジュール '${moduleName}' のロードに失敗: ${error.message}`);
    }

    // 2. アプリルートからのパスを試す
    const appRoot = path.resolve(__dirname, '../../../');
    const modulePath = path.resolve(appRoot, 'node_modules', moduleName);
    
    if (fs.existsSync(modulePath)) {
      try {
        const loadedModule = require(modulePath);
        log(`モジュール '${moduleName}' を絶対パスでロードしました: ${modulePath}`);
        return { success: true, module: loadedModule, error: null };
      } catch (error) {
        log(`絶対パスでモジュール '${moduleName}' のロードに失敗: ${error.message}`);
      }
    } else {
      log(`モジュールパス '${modulePath}' は存在しません`);
    }

    // 3. package.jsonを直接確認
    try {
      const packageJsonPath = path.resolve(appRoot, 'node_modules', moduleName, 'package.json');
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const mainFile = packageJson.main || 'index.js';
        const mainPath = path.resolve(appRoot, 'node_modules', moduleName, mainFile);
        
        if (fs.existsSync(mainPath)) {
          try {
            const loadedModule = require(mainPath);
            log(`モジュール '${moduleName}' をpackage.jsonのmainエントリーポイントからロードしました: ${mainPath}`);
            return { success: true, module: loadedModule, error: null };
          } catch (error) {
            log(`メインエントリーポイントからモジュール '${moduleName}' のロードに失敗: ${error.message}`);
          }
        } else {
          log(`メインエントリーポイント '${mainPath}' は存在しません`);
        }
      }
    } catch (error) {
      log(`package.jsonの解析中にエラーが発生: ${error.message}`);
    }

    // すべての方法が失敗
    return { 
      success: false, 
      module: null, 
      error: new Error(`モジュール '${moduleName}' を解決できませんでした`) 
    };
  } catch (error) {
    log(`モジュール '${moduleName}' の解決中に予期しないエラーが発生: ${error.message}`);
    return { success: false, module: null, error };
  }
}

/**
 * photon-webモジュールの特別な解決
 * photon-webはESMモジュールなので、動的インポートを使用する
 * @returns {object} 結果オブジェクト
 */
function resolvePhotonWeb() {
  const log = (msg) => console.log(`[ModuleResolver] ${msg}`);
  
  try {
    // photon-webは純粋なESMモジュールなので、CommonJSからは直接requireできない
    // ファイルが存在するかどうかのみをチェックする
    const appRoot = path.resolve(__dirname, '../../../');
    const modulePath = path.resolve(appRoot, 'node_modules', 'photon-web');
    const mainFile = path.resolve(modulePath, 'photon_web.js');
    const wasmFile = path.resolve(modulePath, 'photon_web_bg.wasm');
    
    log(`photon-webパッケージパスをチェック: ${modulePath}`);
    
    if (!fs.existsSync(modulePath)) {
      log(`photon-webパッケージが見つかりません: ${modulePath}`);
      return { 
        success: false, 
        module: null, 
        error: new Error(`photon-webパッケージが見つかりません: ${modulePath}`) 
      };
    }
    
    if (!fs.existsSync(mainFile)) {
      log(`photon-webメインファイルが見つかりません: ${mainFile}`);
      return { 
        success: false, 
        module: null, 
        error: new Error(`photon-webメインファイルが見つかりません: ${mainFile}`) 
      };
    }
    
    if (!fs.existsSync(wasmFile)) {
      log(`photon-web WASMファイルが見つかりません: ${wasmFile}`);
      return { 
        success: false, 
        module: null, 
        error: new Error(`photon-web WASMファイルが見つかりません: ${wasmFile}`) 
      };
    }
    
    log('photon-webの必要なファイルがすべて存在します');
    // ESMモジュールなので実際のロードはスキップし、ファイル存在確認のみで成功とする
    return { 
      success: true, 
      module: { name: 'photon-web', type: 'esm' }, 
      error: null 
    };
    
  } catch (error) {
    log(`photon-web解決中にエラーが発生: ${error.message}`);
    return { success: false, module: null, error };
  }
}

/**
 * 指定したパッケージがインストールされているか確認する
 * @param {Array<{name: string, version: string}>} packages 確認するパッケージのリスト
 * @returns {Object} {installedModules: string[], missingModules: string[]}
 */
function checkInstalledPackages(packages) {
  const installedModules = [];
  const missingModules = [];
  
  for (const pkg of packages) {
    const result = resolveModule(pkg.name);
    if (result.success) {
      installedModules.push(pkg.name);
    } else {
      missingModules.push(pkg.name);
    }
  }
  
  return { installedModules, missingModules };
}

module.exports = {
  resolveModule,
  resolvePhotonWeb,
  checkInstalledPackages
};