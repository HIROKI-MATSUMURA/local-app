/**
 * WebAssembly環境セットアップウィンドウ
 * 初回起動時にWebAssembly環境が整っていない場合に表示する
 */

const { BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

class WebAssemblySetupWindow {
  constructor(parentWindow) {
    this.parentWindow = parentWindow;
    this.window = null;
    this.setupData = null;
    this.windowTitle = '環境セットアップ';
  }

  /**
   * セットアップウィンドウを表示する
   * @param {Object} setupData セットアップデータ
   */
  show(setupData) {
    console.log('🚀 WebAssemblySetupWindow.show() が呼ばれました');
    console.log('📋 setupData:', JSON.stringify(setupData, null, 2));
    
    this.setupData = setupData;
    
    // すでに開いていれば前面に表示
    if (this.window) {
      console.log('♻️ 既存ウィンドウを前面に表示します');
      this.window.focus();
      return;
    }
    
    console.log('🆕 新しいセットアップウィンドウを作成します');
    
    // ウィンドウを作成
    this.window = new BrowserWindow({
      width: 650,
      height: 550,
      title: this.windowTitle,
      parent: this.parentWindow,
      modal: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // HTMLを生成して表示
    console.log('📝 HTMLコンテンツを生成しています...');
    const htmlContent = this._generateHtml();
    console.log('📄 HTMLコンテンツ生成完了 (文字数:', htmlContent.length, ')');
    
    const tempFile = path.join(os.tmpdir(), 'webassembly-setup.html');
    console.log('💾 一時ファイルに保存:', tempFile);
    fs.writeFileSync(tempFile, htmlContent);
    
    console.log('🌐 ウィンドウにHTMLファイルをロードします');
    this.window.loadFile(tempFile);
    
    // ウィンドウが閉じられたときの処理
    this.window.on('closed', () => {
      this.window = null;
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (error) {
          console.error('一時ファイルの削除に失敗しました:', error);
        }
      }
    });
  }
  
  /**
   * ウィンドウを閉じる、メモリリークを防ぐためのクリーンアップも行う
   */
  close() {
    if (this.window) {
      // メモリリークを防ぐために、イベントリスナーを明示的に削除
      if (this.window.webContents) {
        this.window.webContents.removeAllListeners('did-finish-load');
      }
      
      // ウィンドウを閉じる
      this.window.close();
      this.window = null;
      
      // メモリ解放を弾的に促進
      if (global.gc) {
        setTimeout(() => {
          global.gc();
        }, 1000);
      }
    }
  }
  
  /**
   * HTML生成
   * @private
   * @returns {string} HTML文字列
   */
  _generateHtml() {
    const missingModules = this.setupData.missingModules || [];
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>WebAssembly環境セットアップ</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2c3e50;
      margin-top: 0;
      font-size: 24px;
    }
    h2 {
      color: #3498db;
      font-size: 18px;
      margin-top: 20px;
    }
    p {
      margin: 15px 0;
      line-height: 1.5;
    }
    .message {
      padding: 15px;
      border-radius: 4px;
      margin: 15px 0;
    }
    .error {
      background-color: #fee;
      border-left: 4px solid #e74c3c;
    }
    .info {
      background-color: #e8f4f8;
      border-left: 4px solid #3498db;
    }
    .success {
      background-color: #eafbee;
      border-left: 4px solid #2ecc71;
    }
    .command {
      background-color: #2c3e50;
      color: #fff;
      padding: 12px;
      border-radius: 4px;
      font-family: Consolas, Monaco, 'Andale Mono', monospace;
      overflow-x: auto;
      white-space: nowrap;
      position: relative;
    }
    .command::after {
      content: 'クリックでコピー';
      position: absolute;
      right: 5px;
      top: 5px;
      background: rgba(255,255,255,0.3);
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 10px;
      opacity: 0.7;
      cursor: pointer;
    }
    .command.copied::after {
      content: 'コピーしました！';
      background: rgba(46, 204, 113, 0.3);
    }
    button {
      background-color: #3498db;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 10px;
    }
    button:hover {
      background-color: #2980b9;
    }
    .link {
      color: #3498db;
      text-decoration: none;
    }
    .link:hover {
      text-decoration: underline;
    }
    .steps {
      margin-left: 20px;
    }
    .steps li {
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>環境セットアップ</h1>
    
    <div class="message info">
      <p>CreAIteCodeを使用するには環境を整える必要があります。このウィンドウでは必要な環境のセットアップ方法を案内します。</p>
      <p style="font-size: 11px; color: #777; margin-top: 8px;">
        ※ 画像解析に使用するコンポーネントは、お使いのパソコン環境（Mac/Windows、Intel/ARM等）に最適化する必要があるため、初回起動時にセットアップが必要な場合があります。これはアプリの安全性と互換性を確保するための正常な動作です。
      </p>
    </div>
    
    ${!this.setupData.modulesInstalled && missingModules.length > 0 ? `
    <h2>必要なモジュールのインストール</h2>
    <div class="message error">
      <p>以下のモジュールがインストールされていないか、ロードできませんでした：</p>
      <ul>
        ${missingModules.map(mod => `<li>${mod}</li>`).join('')}
      </ul>
    </div>
    
    <div class="message info" style="margin-top: 15px;">
      <p><strong>解決方法：</strong></p>
      <p>この問題を解決するには、アプリケーションを再インストールしてください：</p>
      <ol class="steps">
        <li>現在のアプリケーションをアンインストール</li>
        <li>公式サイトから最新バージョンをダウンロード</li>
        <li>新しいバージョンをインストール</li>
        <li>アプリケーションを起動</li>
      </ol>
      <p style="font-size: 12px; color: #666; margin-top: 10px;">
        ※ 最新バージョンには必要なモジュールが正しく含まれています。
      </p>
    </div>
    ` : ''}
    
    ${this.setupData.reinstallRecommended && missingModules.length > 0 ? `
    <h2>モジュールの再インストールが必要</h2>
    <div class="message warning" style="background-color: #fff3e0; border-left: 4px solid #ff9800;">
      <p>モジュールはインストールされていますが、正しく読み込めませんでした。モジュールの再インストールが必要かもしれません：</p>
      <ul>
        ${missingModules.map(mod => `<li>${mod}</li>`).join('')}
      </ul>
      <p style="font-size: 11px; color: #777; margin-top: 8px;">
        ※ 画像処理モジュールはお使いの環境に合わせて最適化する必要があります。パソコンの種類やOSによって互換性の問題が発生することがありますが、下記の手順で簡単に解決できます。
      </p>
    </div>
    
    ${missingModules.includes('photon-web') ? `
    <h3>photon-webの修復</h3>
    <p>photon-webモジュールは特別な処理が必要です。以下の手順で修復してください：</p>
    
    <h4 style="color: #2ecc71; margin-top: 15px;">修復方法：</h4>
    <div class="message info" style="background-color: #f8f9fa; border-left: 4px solid #2ecc71;">
      <p>この問題を解決するには、アプリケーションを再インストールしてください：</p>
      <ol class="steps">
        <li>現在のアプリケーションをアンインストール</li>
        <li>公式サイトから最新バージョンをダウンロード</li>
        <li>新しいバージョンをインストール</li>
        <li>アプリケーションを起動</li>
      </ol>
      <p style="font-size: 12px; color: #666; margin-top: 10px;">
        ※ 最新バージョンには必要なモジュールが正しく含まれています。
      </p>
    </div>
    ` : `
    <div class="message info" style="background-color: #f8f9fa; border-left: 4px solid #3498db;">
      <p>この問題を解決するには、アプリケーションを再インストールしてください：</p>
      <ol class="steps">
        <li>現在のアプリケーションをアンインストール</li>
        <li>公式サイトから最新バージョンをダウンロード</li>
        <li>新しいバージョンをインストール</li>
        <li>アプリケーションを起動</li>
      </ol>
    </div>
    `}
    ` : ''}
    
    ${this.setupData.modulesInstalled && missingModules.length === 0 ? `
    <div class="message success">
      <p>✅ 環境が正しく設定されています！</p>
    </div>
    ` : ''}
    
    <h2>環境セットアップ後</h2>
    <p>必要な環境をセットアップした後、アプリケーションを再起動してください。</p>
    
    <div style="margin-top: 20px;">
      <button id="close-btn" style="background-color: #3498db;">閉じる</button>
    </div>
  </div>
  
  <script>
    // DOMContentLoadedで初期化
    document.addEventListener('DOMContentLoaded', () => {
      // 閉じるボタン
      const closeBtn = document.getElementById('close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          window.close();
        });
      }
      
      // コマンドコピー機能
      document.querySelectorAll('.command').forEach(cmd => {
        cmd.addEventListener('click', function() {
          const text = this.textContent.trim();
          navigator.clipboard.writeText(text).then(() => {
            this.classList.add('copied');
            setTimeout(() => {
              this.classList.remove('copied');
            }, 2000);
          }).catch(err => {
            console.error('コピーエラー:', err);
          });
        });
      });
    });
  </script>
</body>
</html>`;
  }
}

module.exports = WebAssemblySetupWindow;