/**
 * Python環境セットアップウィンドウ
 * 初回起動時にPython環境が整っていない場合に表示する
 */

const { BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class PythonSetupWindow {
  constructor(parentWindow) {
    this.parentWindow = parentWindow;
    this.window = null;
    this.setupData = null;
  }

  /**
   * セットアップウィンドウを表示する
   * @param {Object} setupData セットアップデータ
   */
  show(setupData) {
    this.setupData = setupData;
    
    // すでに開いていれば前面に表示
    if (this.window) {
      this.window.focus();
      return;
    }
    
    // ウィンドウを作成
    this.window = new BrowserWindow({
      width: 650,
      height: 550,
      title: 'Python環境セットアップ',
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
    const htmlContent = this._generateHtml();
    const tempFile = path.join(os.tmpdir(), 'python-setup.html');
    fs.writeFileSync(tempFile, htmlContent);
    this.window.loadFile(tempFile);
    
    // Note: イベント処理は生成されるHTML内にscriptタグで組み込まれているため
    // ここでの追加処理は不要
    
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
   * イベント設定を行うメソッド
   * 注意: 現在は生成されるHTML内のスクリプトがイベント処理を行っているため、このメソッドは使用されていません。
   * 将来的には、ここで直接IPCイベントを設定するのが望ましい実装方法です。
   * @private
   */
  _setupEvents() {
    // 将来的な実装のためのプレースホルダー
  }
  
  /**
   * HTML生成
   * @private
   * @returns {string} HTML文字列
   */
  _generateHtml() {
    const isWindows = process.platform === 'win32';
    const pythonCmd = isWindows ? 'python' : 'python3';
    const pipCmd = isWindows ? 'python -m pip' : 'pip3';
    
    const missingPackages = this.setupData.missingPackages || [];
    
    let installCommand = '';
    if (missingPackages.length > 0) {
      installCommand = `${pipCmd} install ${missingPackages.join(' ')}`;
    }
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Python環境セットアップ</title>
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
    <h1>Python環境セットアップ</h1>
    
    <div class="message info">
      <p>CreAIteCodeを使用するには必要なPython環境が整っている必要があります。このウィンドウでは必要な環境のセットアップ方法を案内します。</p>
    </div>
    
    ${!this.setupData.pythonInstalled ? `
    <h2>1. Pythonのインストール</h2>
    <div class="message error">
      <p>Python (${pythonCmd}) がインストールされていないか、環境パスに設定されていません。</p>
    </div>
    <p>以下の手順でPythonをインストールしてください：</p>
    <ol class="steps">
      <li><a href="https://www.python.org/downloads/" class="link" target="_blank">Python公式サイト</a>から最新版をダウンロード</li>
      <li>インストーラーを実行（Windowsの場合は「Add Python to PATH」オプションを必ず選択）</li>
      <li>インストール完了後、コンピュータを再起動することをお勧めします</li>
      <li>インストール後、ターミナル/コマンドプロンプトで「${pythonCmd} --version」を実行して確認してください</li>
    </ol>
    ` : ''}
    
    ${this.setupData.pythonInstalled && missingPackages.length > 0 ? `
    <h2>2. 必要なパッケージのインストール</h2>
    <div class="message error">
      <p>以下のPythonパッケージがインストールされていません：</p>
      <ul>
        ${missingPackages.map(pkg => `<li>${pkg}</li>`).join('')}
      </ul>
    </div>
    
    <p>ターミナル/コマンドプロンプトで以下のコマンドを実行して必要なパッケージをインストールしてください：</p>
    <div class="command">${installCommand}</div>
    
    <div class="message info" style="margin-top: 15px;">
      <p><strong>注意</strong>: 権限エラーが発生する場合は、次のコマンドを試してみてください：</p>
      <div class="command">${pipCmd.includes('pip3') ? 'pip3 install --user' : pythonCmd + ' -m pip install --user'} ${missingPackages.join(' ')}</div>
    </div>
    
    <div class="message info" style="margin-top: 15px;">
      <p>インストールに問題がある場合や、詳細なエラーが発生した場合は、ChatGPTやClaudeなどのAIアシスタントにエラーメッセージを含めて質問することをお勧めします。多くの場合、AIアシスタントは環境固有の問題に対して適切な解決策を提案できます。</p>
    </div>
    ` : ''}
    
    ${this.setupData.pythonInstalled && missingPackages.length === 0 ? `
    <div class="message success">
      <p>✅ Python環境が正しく設定されています！</p>
    </div>
    ` : ''}
    
    <h2>環境セットアップ後</h2>
    <p>必要な環境をセットアップした後、アプリケーションを再起動してください。</p>
    
    <div style="text-align: right; margin-top: 20px;">
      <button id="close-btn">閉じる</button>
    </div>
  </div>
  
  <script>
    // 「閉じる」ボタンのイベント
    document.getElementById('close-btn').addEventListener('click', () => {
      // 両方の方法を試す（互換性のため）
      try {
        if (window.electron && window.electron.closePythonSetup) {
          window.electron.closePythonSetup();
        } else if (window.electron && window.electron.ipcRenderer) {
          window.electron.ipcRenderer.send('close-python-setup');
        }
      } catch (e) {
        console.error('閉じるボタンエラー:', e);
        // フォールバック：ウィンドウを閉じようとする
        window.close();
      }
    });
    
    // リンククリックでブラウザを開く
    document.querySelectorAll('a[target="_blank"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          if (window.electron && window.electron.openExternalUrl) {
            window.electron.openExternalUrl(e.currentTarget.href);
          } else if (window.electron && window.electron.ipcRenderer) {
            window.electron.ipcRenderer.send('open-external-url', e.currentTarget.href);
          }
        } catch (e) {
          console.error('リンクエラー:', e);
        }
      });
    });
    
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
  </script>
</body>
</html>`;
  }
}

module.exports = PythonSetupWindow;