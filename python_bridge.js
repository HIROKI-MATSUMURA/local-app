/**
 * Python処理と連携するためのブリッジモジュール
 * 単一の長時間実行Pythonプロセスを使用して効率的に画像処理を行います
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');

// Pythonコマンド（OSによって異なる）
const PYTHON_CMD = os.platform() === 'win32' ? 'python' : 'python3';

/**
 * Python処理ブリッジクラス
 * 単一のPythonプロセスを管理し、JSONベースの通信プロトコルを使用
 */
class PythonBridge {
  constructor() {
    this.pythonProcess = null;
    this.requestMap = new Map();
    this.isStarting = false;
    this.requestQueue = [];
    this.restartCount = 0;
    this.maxRestarts = 5;
    this.responseBuffer = '';
  }

  /**
   * Pythonプロセスを起動する
   * @returns {Promise<void>}
   */
  async start() {
    if (this.pythonProcess || this.isStarting) {
      return;
    }

    this.isStarting = true;

    try {
      console.log('Pythonプロセスを起動中...');
      // Pythonサーバープロセスを起動
      const scriptPath = path.join(__dirname, 'python_server.py');
      this.pythonProcess = spawn(PYTHON_CMD, [scriptPath]);

      // 標準出力からデータを読み取る設定
      this.pythonProcess.stdout.on('data', (data) => this._handleStdout(data));
      this.pythonProcess.stderr.on('data', (data) => this._handleStderr(data));
      this.pythonProcess.on('close', (code) => this._handleClose(code));
      this.pythonProcess.on('error', (err) => this._handleError(err));

      // 起動完了を待機（サーバーの初期化時間）
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Pythonプロセスが起動しました');

      // キューに溜まったリクエストを処理
      this._processQueue();
    } catch (error) {
      console.error('Pythonプロセスの起動エラー:', error);
      throw new Error(`Pythonプロセスの起動に失敗しました: ${error.message}`);
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Pythonプロセスを停止する
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.pythonProcess) {
      console.log('Pythonプロセスを停止中...');
      // 終了コマンドを送信
      try {
        const exitCommand = {
          id: 'exit',
          command: 'exit'
        };
        this.pythonProcess.stdin.write(JSON.stringify(exitCommand) + '\n');

        // 正常終了のための待機時間
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        // 既に接続が閉じている場合などのエラーは無視
      }

      // プロセスを強制終了
      try {
        this.pythonProcess.kill();
      } catch (err) {
        // プロセスが既に終了している場合は無視
      }

      this.pythonProcess = null;
      console.log('Pythonプロセスが停止しました');
    }
  }

  /**
   * Pythonプロセスに再起動を要求する
   * @returns {Promise<boolean>} 再起動が成功したかどうか
   */
  async restart() {
    if (this.restartCount >= this.maxRestarts) {
      console.error(`最大再起動回数(${this.maxRestarts})に達しました`);
      return false;
    }

    this.restartCount++;
    console.log(`Pythonプロセスを再起動中... (${this.restartCount}/${this.maxRestarts})`);

    await this.stop();
    await this.start();

    return true;
  }

  /**
   * Pythonプロセスにコマンドを送信する
   * @param {string} command - コマンド名
   * @param {object} params - コマンドパラメータ
   * @param {number} timeout - タイムアウト時間（ミリ秒）
   * @returns {Promise<any>} コマンドの実行結果
   */
  async sendCommand(command, params = {}, timeout = 30000) {
    // リクエストIDを生成
    const requestId = crypto.randomUUID();

    // プロセスが起動していなければ起動
    if (!this.pythonProcess && !this.isStarting) {
      // リクエストをキューに追加して後で処理
      this.requestQueue.push({ requestId, command, params });
      try {
        await this.start();
      } catch (error) {
        return Promise.reject(error);
      }
      return new Promise((resolve, reject) => {
        this.requestMap.set(requestId, { resolve, reject });
      });
    }

    // プロセス起動中ならキューに追加して終了を待つ
    if (this.isStarting) {
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ requestId, command, params });
        this.requestMap.set(requestId, { resolve, reject });
      });
    }

    return new Promise((resolve, reject) => {
      // タイムアウト処理
      const timeoutId = setTimeout(() => {
        if (this.requestMap.has(requestId)) {
          this.requestMap.delete(requestId);
          reject(new Error(`コマンド '${command}' の実行がタイムアウトしました (${timeout}ms)`));
        }
      }, timeout);

      // リクエストをマップに保存（タイムアウトIDも含む）
      this.requestMap.set(requestId, { resolve, reject, timeoutId });

      // コマンドをJSON形式で送信
      const requestData = {
        id: requestId,
        command,
        ...params
      };

      try {
        this.pythonProcess.stdin.write(JSON.stringify(requestData) + '\n');
      } catch (error) {
        clearTimeout(timeoutId);
        this.requestMap.delete(requestId);
        reject(new Error(`コマンド送信エラー: ${error.message}`));

        // 接続エラーの場合、プロセスを再起動
        this.restart().catch(err => {
          console.error('プロセス再起動エラー:', err);
        });
      }
    });
  }

  /**
   * 標準出力からのデータを処理
   * @param {Buffer} data - 受信データ
   * @private
   */
  _handleStdout(data) {
    // データバッファーに追加
    this.responseBuffer += data.toString();

    // 完全なJSONレスポンスを探す
    let endIndex;
    while ((endIndex = this.responseBuffer.indexOf('\n')) !== -1) {
      const responseStr = this.responseBuffer.substring(0, endIndex);
      this.responseBuffer = this.responseBuffer.substring(endIndex + 1);

      if (!responseStr.trim()) continue;

      try {
        const response = JSON.parse(responseStr);
        this._processResponse(response);
      } catch (err) {
        console.error('JSONパースエラー:', err, 'データ:', responseStr);
      }
    }
  }

  /**
   * 標準エラー出力からのデータを処理
   * @param {Buffer} data - 受信データ
   * @private
   */
  _handleStderr(data) {
    const stderr = data.toString();
    console.error('Python stderr:', stderr);

    // クリティカルなエラーが発生した場合、プロセスを再起動
    if (stderr.includes('Fatal error') || stderr.includes('Segmentation fault')) {
      this.restart().catch(err => {
        console.error('エラー後の再起動に失敗:', err);
      });
    }
  }

  /**
   * レスポンスを処理する
   * @param {object} response - JSONレスポンス
   * @private
   */
  _processResponse(response) {
    const { id, result, error } = response;

    if (!this.requestMap.has(id)) {
      console.warn(`リクエストID '${id}' に対応するハンドラーが見つかりません`);
      return;
    }

    const { resolve, reject, timeoutId } = this.requestMap.get(id);

    // タイムアウトをクリア
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (error) {
      reject(new Error(error));
    } else {
      resolve(result);
    }

    this.requestMap.delete(id);
  }

  /**
   * プロセスクローズ時の処理
   * @param {number} code - 終了コード
   * @private
   */
  _handleClose(code) {
    console.log(`Pythonプロセスが終了しました (コード: ${code})`);
    this.pythonProcess = null;

    // 正常終了でない場合は保留中のリクエストを拒否
    if (code !== 0) {
      for (const [id, { reject, timeoutId }] of this.requestMap.entries()) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(new Error(`Pythonプロセスが予期せず終了しました (コード: ${code})`));
        this.requestMap.delete(id);
      }

      // 自動再起動
      if (this.requestQueue.length > 0 || this.requestMap.size > 0) {
        this.restart().catch(err => {
          console.error('プロセス再起動エラー:', err);
        });
      }
    }
  }

  /**
   * プロセスエラー時の処理
   * @param {Error} error - エラーオブジェクト
   * @private
   */
  _handleError(error) {
    console.error('Pythonプロセスエラー:', error);

    // すべての保留中リクエストを拒否
    for (const [id, { reject, timeoutId }] of this.requestMap.entries()) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(new Error(`Pythonプロセスエラー: ${error.message}`));
      this.requestMap.delete(id);
    }

    // 自動再起動
    if (this.requestQueue.length > 0) {
      this.restart().catch(err => {
        console.error('エラー後の再起動に失敗:', err);
      });
    }
  }

  /**
   * キューにあるリクエストを処理
   * @private
   */
  _processQueue() {
    const queue = [...this.requestQueue];
    this.requestQueue = [];

    for (const { requestId, command, params } of queue) {
      if (this.requestMap.has(requestId)) {
        const { resolve, reject } = this.requestMap.get(requestId);

        this.sendCommand(command, params)
          .then(resolve)
          .catch(reject);
      }
    }
  }

  /**
   * Python環境をチェックする
   * @returns {Promise<object>} Python環境の状態
   */
  async checkPythonEnvironment() {
    try {
      return await this.sendCommand('check_environment');
    } catch (error) {
      console.error('Python環境チェックエラー:', error);
      return {
        error: 'Python環境チェックに失敗しました',
        details: error.message
      };
    }
  }

  /**
   * Python環境をセットアップする
   * @returns {Promise<object>} セットアップ結果
   */
  async setupPythonEnvironment() {
    try {
      return await this.sendCommand('setup_environment');
    } catch (error) {
      console.error('Python環境セットアップエラー:', error);
      return {
        success: false,
        message: 'Python環境のセットアップに失敗しました',
        details: error.message
      };
    }
  }

  /**
   * 画像から色を抽出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<Array>} 抽出された色の配列
   */
  async extractColorsFromImage(imageData, options = {}) {
    try {
      return await this.sendCommand('extract_colors', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('色抽出エラー:', error);
      return [];
    }
  }

  /**
   * 画像からテキストを抽出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} 抽出されたテキスト
   */
  async extractTextFromImage(imageData, options = {}) {
    try {
      return await this.sendCommand('extract_text', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('テキスト抽出エラー:', error);
      return {
        text: '',
        error: error.message,
        textBlocks: []
      };
    }
  }

  /**
   * 画像をセクション分析する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<Array>} セクション分析結果
   */
  async analyzeImageSections(imageData, options = {}) {
    try {
      return await this.sendCommand('analyze_sections', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('セクション分析エラー:', error);
      return [];
    }
  }

  /**
   * 画像のレイアウトパターンを分析する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} レイアウト分析結果
   */
  async analyzeLayoutPattern(imageData, options = {}) {
    try {
      return await this.sendCommand('analyze_layout', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('レイアウト分析エラー:', error);
      return {
        layoutType: "unknown",
        confidence: 0.6,
        layoutDetails: {
          dimensions: { width: 1200, height: 800, aspectRatio: 1.5 },
          sections: [],
          styles: { colors: [] }
        }
      };
    }
  }

  /**
   * 画像のメインセクションを検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<Array>} 検出されたメインセクション
   */
  async detectMainSections(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_main_sections', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('メインセクション検出エラー:', error);
      return [];
    }
  }

  /**
   * 画像からカード要素を検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<Array>} 検出されたカード要素
   */
  async detectCardElements(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_card_elements', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('カード要素検出エラー:', error);
      return [];
    }
  }

  /**
   * 画像から特徴的な要素を検出する
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} 検出された要素
   */
  async detectFeatureElements(imageData, options = {}) {
    try {
      return await this.sendCommand('detect_elements', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('要素検出エラー:', error);
      return {
        layoutType: "unknown",
        layoutConfidence: 0.5,
        elements: []
      };
    }
  }

  /**
   * 画像の総合分析を行う
   * @param {string} imageData - Base64形式の画像データ
   * @param {object} options - オプション
   * @returns {Promise<object>} 総合分析結果
   */
  async analyzeImage(imageData, options = {}) {
    try {
      return await this.sendCommand('analyze_all', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('画像分析エラー:', error);
      return {
        error: error.message,
        layout: {
          layoutType: "unknown",
          confidence: 0.5
        },
        elements: [],
        text: { text: "" }
      };
    }
  }
}

// シングルトンインスタンスを作成
const pythonBridge = new PythonBridge();

// アプリケーション終了時にPythonプロセスも終了させる
process.on('exit', () => {
  pythonBridge.stop().catch(console.error);
});

process.on('SIGINT', () => {
  pythonBridge.stop().catch(console.error);
  process.exit(0);
});

process.on('SIGTERM', () => {
  pythonBridge.stop().catch(console.error);
  process.exit(0);
});

// ブリッジをエクスポート
module.exports = pythonBridge;
