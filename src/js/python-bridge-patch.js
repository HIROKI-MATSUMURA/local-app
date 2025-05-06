/**
 * Python-JavaScript通信パッチ
 * 標準出力を介した通信が失敗した場合のファイルベースの代替手段
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

class PythonBridgePatch {
  constructor(options = {}) {
    this.options = {
      pythonPath: options.pythonPath || 'python',
      scriptPath: options.scriptPath || path.join(__dirname, '..', 'python', 'file_output.py'),
      outputDir: options.outputDir || path.join(__dirname, '..', 'python', 'output'),
      pollingInterval: options.pollingInterval || 500, // ミリ秒
      debug: options.debug || false,
      ...options
    };

    this.responseCallbacks = new Map();
    this.isRunning = false;
    this.pythonProcess = null;
    this.watcher = null;

    // 出力ディレクトリの確保
    this.ensureOutputDir();
  }

  /**
   * 出力ディレクトリが存在することを確認
   */
  ensureOutputDir() {
    try {
      if (!fs.existsSync(this.options.outputDir)) {
        fs.mkdirSync(this.options.outputDir, { recursive: true });
      }
      return true;
    } catch (error) {
      console.error('出力ディレクトリの作成エラー:', error);
      return false;
    }
  }

  /**
   * Pythonブリッジを起動
   */
  start() {
    if (this.isRunning) {
      console.log('Pythonブリッジは既に実行中です');
      return true;
    }

    try {
      // Pythonプロセスを起動
      this.pythonProcess = spawn(this.options.pythonPath, [this.options.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // 標準出力のリスナー
      this.pythonProcess.stdout.on('data', (data) => {
        if (this.options.debug) {
          console.log('Python stdout:', data.toString());
        }
      });

      // 標準エラー出力のリスナー
      this.pythonProcess.stderr.on('data', (data) => {
        if (this.options.debug) {
          console.error('Python stderr:', data.toString());
        }
      });

      // プロセス終了のリスナー
      this.pythonProcess.on('close', (code) => {
        console.log(`Pythonプロセスが終了しました (コード: ${code})`);
        this.isRunning = false;
        this.pythonProcess = null;
        
        // ウォッチャーを停止
        this.stopWatcher();
      });

      this.isRunning = true;
      
      // レスポンスファイルの監視を開始
      this.startWatcher();
      
      console.log('Pythonブリッジを起動しました');
      return true;
    } catch (error) {
      console.error('Pythonブリッジの起動エラー:', error);
      return false;
    }
  }

  /**
   * Pythonブリッジを停止
   */
  stop() {
    if (!this.isRunning) {
      console.log('Pythonブリッジは実行されていません');
      return true;
    }

    try {
      // ウォッチャーを停止
      this.stopWatcher();
      
      // Pythonプロセスを終了
      if (this.pythonProcess) {
        this.pythonProcess.kill();
        this.pythonProcess = null;
      }
      
      this.isRunning = false;
      console.log('Pythonブリッジを停止しました');
      return true;
    } catch (error) {
      console.error('Pythonブリッジの停止エラー:', error);
      return false;
    }
  }

  /**
   * レスポンスファイルの監視を開始
   */
  startWatcher() {
    if (this.watcher) {
      this.stopWatcher();
    }

    try {
      // 定期的にディレクトリをポーリング
      this.watcher = setInterval(() => {
        this.checkForResponses();
      }, this.options.pollingInterval);
      
      console.log('レスポンス監視を開始しました');
      return true;
    } catch (error) {
      console.error('レスポンス監視の開始エラー:', error);
      return false;
    }
  }

  /**
   * レスポンスファイルの監視を停止
   */
  stopWatcher() {
    if (this.watcher) {
      clearInterval(this.watcher);
      this.watcher = null;
      console.log('レスポンス監視を停止しました');
    }
  }

  /**
   * レスポンスファイルを確認
   */
  checkForResponses() {
    try {
      if (!fs.existsSync(this.options.outputDir)) {
        return;
      }

      // レスポンスファイルを検索
      const files = fs.readdirSync(this.options.outputDir)
        .filter(file => file.startsWith('response_') && file.endsWith('.json'))
        .map(file => ({
          path: path.join(this.options.outputDir, file),
          mtime: fs.statSync(path.join(this.options.outputDir, file)).mtime
        }))
        .sort((a, b) => a.mtime - b.mtime); // 古い順にソート

      // 各レスポンスファイルを処理
      for (const file of files) {
        try {
          // ファイルを読み込む
          const data = JSON.parse(fs.readFileSync(file.path, 'utf8'));
          
          // レスポンスIDを取得
          const responseId = data.id;
          
          if (responseId && this.responseCallbacks.has(responseId)) {
            // コールバックを呼び出す
            const callback = this.responseCallbacks.get(responseId);
            this.responseCallbacks.delete(responseId);
            
            // コールバックを非同期で実行
            setTimeout(() => {
              callback(null, data.result, data.error);
            }, 0);
          }
          
          // ファイルを削除
          fs.unlinkSync(file.path);
          
          if (this.options.debug) {
            console.log(`レスポンスファイルを処理しました: ${file.path}`);
          }
        } catch (fileError) {
          console.error(`レスポンスファイル処理エラー (${file.path}):`, fileError);
        }
      }
    } catch (error) {
      console.error('レスポンス確認エラー:', error);
    }
  }

  /**
   * Pythonにコマンドを送信
   * @param {string} command - 実行するコマンド
   * @param {object} params - コマンドパラメータ
   * @param {function} callback - コールバック関数
   */
  sendCommand(command, params = {}, callback = null) {
    if (!this.isRunning) {
      if (callback) {
        callback(new Error('Pythonブリッジが実行されていません'), null, 'bridge_not_running');
      }
      return false;
    }

    try {
      // リクエストIDを生成
      const requestId = uuidv4();
      
      // リクエストデータを作成
      const requestData = {
        id: requestId,
        command,
        ...params
      };
      
      // コールバックを登録
      if (callback) {
        this.responseCallbacks.set(requestId, callback);
      }
      
      // リクエストファイルを書き込む
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
      const requestFile = path.join(this.options.outputDir, `request_${timestamp}_${requestId.substring(0, 8)}.json`);
      
      fs.writeFileSync(requestFile, JSON.stringify(requestData, null, 2), 'utf8');
      
      if (this.options.debug) {
        console.log(`リクエストファイルを作成しました: ${requestFile}`);
      }
      
      return true;
    } catch (error) {
      console.error('コマンド送信エラー:', error);
      
      if (callback) {
        callback(error, null, 'command_send_error');
      }
      
      return false;
    }
  }
}

module.exports = PythonBridgePatch; 