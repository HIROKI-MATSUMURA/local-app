/**
 * Python処理と連携するためのブリッジモジュール
 * 単一の長時間実行Pythonプロセスを使用して効率的に画像処理を行います
 */
// Node.js環境かブラウザ環境かを判定
const isNode = typeof window === 'undefined' || typeof process !== 'undefined' && process.versions && process.versions.node;

// ブラウザ環境でエラーが出ないように条件付きでrequire
let spawn, path, fs, os, crypto;

if (isNode) {
  // Node.js環境でのみ必要なモジュールをロード
  spawn = require('child_process').spawn;
  path = require('path');
  fs = require('fs').promises;
  os = require('os');
  crypto = require('crypto');
} else {
  // ブラウザ環境用のダミーオブジェクト
  console.log('ブラウザ環境を検出しました：Pythonブリッジは限定機能で動作します');

  // ダミーのパスオブジェクト
  path = {
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    resolve: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    dirname: (p) => p.split('/').slice(0, -1).join('/'),
    basename: (p) => p.split('/').pop()
  };

  // ダミーのosオブジェクト
  os = {
    tmpdir: () => '/tmp',
    platform: () => 'browser'
  };

  // ダミーのcryptoオブジェクト
  crypto = {
    randomUUID: () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  };
}

// Pythonコマンド（OSによって異なる）
const PYTHON_CMD = isNode && os.platform() === 'win32' ? 'python' : 'python3';

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
    console.log(`Pythonブリッジ: コマンド[${command}]送信開始 (ID: ${requestId.substring(0, 8)}...)`);

    // プロセスが起動していなければ起動
    if (!this.pythonProcess && !this.isStarting) {
      console.log(`Pythonブリッジ: プロセスが未起動のため、起動処理を行います (コマンド: ${command})`);
      // リクエストをキューに追加して後で処理
      this.requestQueue.push({ requestId, command, params });
      try {
        await this.start();
        console.log(`Pythonブリッジ: プロセス起動完了 (コマンド: ${command})`);
      } catch (error) {
        console.error(`Pythonブリッジ: プロセス起動失敗 (コマンド: ${command})`, error);
        return Promise.reject(error);
      }
      console.log(`Pythonブリッジ: コマンド[${command}]をキューに追加しました`);
      return new Promise((resolve, reject) => {
        this.requestMap.set(requestId, { resolve, reject });
      });
    }

    // プロセス起動中ならキューに追加して終了を待つ
    if (this.isStarting) {
      console.log(`Pythonブリッジ: プロセス起動中のため、コマンド[${command}]をキューに追加します`);
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ requestId, command, params });
        this.requestMap.set(requestId, { resolve, reject });
      });
    }

    console.log(`Pythonブリッジ: コマンド[${command}]処理開始 - タイムアウト: ${timeout}ms`);
    return new Promise((resolve, reject) => {
      // タイムアウト処理
      const timeoutId = setTimeout(() => {
        if (this.requestMap.has(requestId)) {
          console.error(`Pythonブリッジ: コマンド[${command}]がタイムアウトしました (${timeout}ms)`);
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

      // リクエストデータのサイズをチェック
      const requestStr = JSON.stringify(requestData);
      const dataSize = requestStr.length;
      console.log(`Pythonブリッジ: コマンド[${command}]送信データサイズ: ${Math.round(dataSize / 1024)}KB`);

      // 大きなデータの場合は警告
      if (dataSize > 5000000) { // 5MB以上
        console.warn(`Pythonブリッジ: 送信データが非常に大きいです (${Math.round(dataSize / 1024 / 1024)}MB)`);
      }

      try {
        this.pythonProcess.stdin.write(requestStr + '\n');
        console.log(`Pythonブリッジ: コマンド[${command}]送信完了 (ID: ${requestId.substring(0, 8)}...)`);
      } catch (error) {
        console.error(`Pythonブリッジ: コマンド[${command}]送信エラー:`, error);
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
    const dataStr = data.toString();
    this.responseBuffer += dataStr;

    console.log(`Pythonブリッジ: stdout データ受信 (${dataStr.length}バイト)`);

    // データが大きい場合はプレビューのみ表示
    if (dataStr.length > 200) {
      console.log(`Pythonブリッジ: stdout プレビュー: ${dataStr.substring(0, 100)}...`);
    } else {
      console.log(`Pythonブリッジ: stdout 内容: ${dataStr}`);
    }

    // 完全なJSONレスポンスを探す
    let endIndex;
    while ((endIndex = this.responseBuffer.indexOf('\n')) !== -1) {
      const responseStr = this.responseBuffer.substring(0, endIndex);
      this.responseBuffer = this.responseBuffer.substring(endIndex + 1);

      if (!responseStr.trim()) continue;

      try {
        console.log(`Pythonブリッジ: JSONレスポンス解析中 (${responseStr.length}バイト)`);
        const response = JSON.parse(responseStr);
        this._processResponse(response);
      } catch (err) {
        console.error('Pythonブリッジ: JSONパースエラー:', err);
        console.error('Pythonブリッジ: 解析できないデータ:', responseStr.length > 100 ?
          responseStr.substring(0, 100) + '...' : responseStr);
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
    console.error('Pythonブリッジ: stderr 受信:', stderr);

    // エラーメッセージの分析
    if (stderr.includes('Traceback')) {
      console.error('Pythonブリッジ: Pythonスタックトレースを検出しました。');
    }

    if (stderr.includes('MemoryError')) {
      console.error('Pythonブリッジ: Pythonのメモリエラーを検出しました。リソース不足の可能性があります。');
    }

    // クリティカルなエラーが発生した場合、プロセスを再起動
    if (stderr.includes('Fatal error') || stderr.includes('Segmentation fault')) {
      console.error('Pythonブリッジ: 深刻なエラーを検出したため、プロセスを再起動します');
      this.restart().catch(err => {
        console.error('Pythonブリッジ: エラー後の再起動に失敗:', err);
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
    console.log(`Pythonブリッジ: レスポンス受信 (ID: ${id ? id.substring(0, 8) : 'unknown'}...)`);

    if (!this.requestMap.has(id)) {
      console.warn(`Pythonブリッジ: リクエストID '${id}' に対応するハンドラーが見つかりません`);
      return;
    }

    const { resolve, reject, timeoutId } = this.requestMap.get(id);

    // タイムアウトをクリア
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (error) {
      console.error(`Pythonブリッジ: エラーレスポンス受信 (ID: ${id.substring(0, 8)}...):`, error);
      reject(new Error(error));
    } else {
      console.log(`Pythonブリッジ: 成功レスポンス受信 (ID: ${id.substring(0, 8)}...)`);
      // レスポンスのプレビュー（大きなデータの場合は一部だけ表示）
      const resultStr = JSON.stringify(result);
      const previewLength = Math.min(100, resultStr.length);
      console.log(`Pythonブリッジ: レスポンスデータサイズ: ${Math.round(resultStr.length / 1024)}KB, プレビュー: ${resultStr.substring(0, previewLength)}${resultStr.length > previewLength ? '...' : ''}`);

      resolve(result);
    }

    this.requestMap.delete(id);
    console.log(`Pythonブリッジ: リクエスト完了 (ID: ${id.substring(0, 8)}...)`);
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
   * 互換性のあるPythonバージョンとライブラリが利用可能かを確認
   */
  async checkPythonEnvironment() {
    try {
      console.log('Python環境をチェックしています...');
      const result = await this.sendCommand('check_environment');
      console.log('Python環境チェック結果:', result);
      return result;
    } catch (error) {
      console.error('Python環境チェックエラー:', error);
      return { error: error.message, summary: { python_compatible: false } };
    }
  }

  /**
   * Python環境をセットアップする
   * 必要なパッケージのインストールを試みる
   */
  async setupPythonEnvironment() {
    try {
      console.log('Python環境をセットアップしています...');
      const result = await this.sendCommand('setup_environment');
      console.log('Python環境セットアップ結果:', result);
      return { ...result, success: true };
    } catch (error) {
      console.error('Python環境セットアップエラー:', error);
      return { success: false, message: error.message };
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
      console.log('Pythonブリッジ: テキスト抽出開始...');
      console.log('画像データサイズ:', imageData ? (typeof imageData === 'string' ? imageData.length : 'データ型:' + typeof imageData) : 'データなし');

      // データ形式をチェック
      if (imageData && typeof imageData === 'string') {
        const isProbablyBase64 = imageData.startsWith('data:') || /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(imageData);
        console.log('Pythonブリッジ: 画像データ形式: ' + (isProbablyBase64 ? 'Base64エンコード' : 'その他のテキスト'));

        // 大きすぎるデータを処理する場合は警告
        if (imageData.length > 10000000) { // 10MB以上
          console.warn('Pythonブリッジ: 大きな画像データ（' + Math.round(imageData.length / 1024 / 1024) + 'MB）を処理します。メモリ不足に注意してください。');
        }
      }

      // 実行前にプロセスが動いているか確認
      if (!this.pythonProcess) {
        console.warn('Pythonブリッジ: プロセスが起動していません。起動を試みます...');
        await this.start();
      }

      console.log('Pythonブリッジ: sendCommandを呼び出します...');
      const result = await this.sendCommand('extract_text', {
        image_data: imageData,
        options
      });

      console.log('Pythonブリッジ: 処理完了', result ? '成功' : '失敗');
      return result;
    } catch (error) {
      console.error('Pythonブリッジ: テキスト抽出エラー:', error);
      console.error('Pythonブリッジ: エラースタック:', error.stack);
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
    // レイアウトパターンを解析する
    try {
      await this._ensureRunning();

      return await this.sendCommand('analyze_layout', {
        image_data: imageData,
        options
      });
    } catch (error) {
      console.error('レイアウトパターン分析エラー:', error);
      throw new Error(`レイアウトパターン分析中にエラーが発生しました: ${error.message}`);
    }
  }

  /**
   * 画像解析結果を圧縮して重要な情報だけを抽出する
   * @param {object} analysisData - 元の解析結果
   * @param {object} options - 圧縮オプション
   * @returns {Promise<object>} 圧縮された解析結果
   */
  async compressAnalysisResults(analysisData, options = {}) {
    try {
      await this._ensureRunning();

      return await this.sendCommand('compress_analysis', {
        analysis_data: analysisData,
        options
      });
    } catch (error) {
      console.error('解析結果圧縮エラー:', error);
      throw new Error(`解析結果の圧縮中にエラーが発生しました: ${error.message}`);
    }
  }

  /**
   * 元画像とレンダリング画像を比較し類似度を評価する
   * @param {string} originalImage - Base64エンコードされた元画像データ
   * @param {string} renderedImage - Base64エンコードされたレンダリング画像データ
   * @returns {Promise<object>} 比較結果
   */
  async compareImages(originalImage, renderedImage) {
    try {
      await this._ensureRunning();

      return await this.sendCommand('compare_images', {
        original_image: originalImage,
        rendered_image: renderedImage
      });
    } catch (error) {
      console.error('画像比較エラー:', error);
      throw new Error(`画像比較中にエラーが発生しました: ${error.message}`);
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
      // フルオブジェクトが第一引数として渡される場合の対応
      let imageContent;
      let requestOptions = {};

      console.log('analyzeImage呼び出し - 引数の型:',
        typeof imageData, 'オプション:', options ? '指定あり' : 'なし');

      if (typeof imageData === 'object' && imageData !== null) {
        // オブジェクトとして渡された場合（main.jsからの呼び出し方法に対応）
        const dataObj = imageData;
        imageContent = dataObj.image;

        // type='compress'は必ず設定
        requestOptions = {
          ...dataObj,
          type: 'compress'
        };

        // イメージデータの確認
        if (!imageContent) {
          console.error('画像データがオブジェクト内に見つかりません:',
            Object.keys(dataObj).join(', '));
          return {
            success: false,
            error: '画像データが提供されていません',
            layout: { layoutType: "unknown" },
            elements: [],
            text: { text: "" },
            colors: []
          };
        }
      } else {
        // 直接画像データが渡された場合（古いコードとの互換性）
        imageContent = imageData;
        requestOptions = {
          ...options,
          type: 'compress'
        };
      }

      // リクエストパラメータを構成（シンプルに）
      const params = {
        image: imageContent,
        type: 'compress' // 常に圧縮モード
      };

      // オプションが存在する場合は追加
      if (Object.keys(requestOptions).length > 0) {
        params.options = requestOptions;
      }

      console.log('sendCommandに送信するパラメータ:', {
        ...params,
        image: params.image ? '(画像データあり)' : '(なし)'
      });

      // コマンドを常にanalyze_allに統一
      const command = 'analyze_all';

      const result = await this.sendCommand(command, params);

      // 結果の確認
      if (result) {
        console.log('Python処理結果の構造:', Object.keys(result).join(', '));

        // エラーチェック
        if (result.error) {
          console.error('Python処理エラー:', result.error);
        }

        // 色情報の確認
        if (result.colors) {
          console.log('色情報あり:', Array.isArray(result.colors) ? result.colors.length : 'non-array');
        } else {
          console.warn('色情報がありません');
        }
      }

      return result;
    } catch (error) {
      console.error('画像分析エラー:', error);
      return {
        success: false,
        error: error.message,
        layout: {
          layoutType: "unknown",
          confidence: 0.5
        },
        elements: [],
        text: { text: "" },
        colors: [] // 色情報を空配列として含める
      };
    }
  }
}

if (isNode) {
  // Node.js環境のみで実際のインスタンスをエクスポート
  const pythonBridge = new PythonBridge();
  module.exports = pythonBridge;
} else {
  // ブラウザ環境の場合はダミー実装を提供
  const dummyBridge = {
    checkPythonEnvironment: async () => {
      console.warn('ブラウザ環境ではPython環境チェックは利用できません');
      return { error: 'ブラウザ環境ではこの機能は利用できません', browserEnvironment: true };
    },
    setupPythonEnvironment: async () => {
      console.warn('ブラウザ環境ではPython環境セットアップは利用できません');
      return { success: false, message: 'ブラウザ環境ではこの機能は利用できません', browserEnvironment: true };
    },
    start: async () => {
      console.warn('ブラウザ環境ではPython処理は利用できません');
      return false;
    },
    stop: async () => {
      console.warn('ブラウザ環境ではPython処理は利用できません');
      return false;
    },
    sendCommand: async () => {
      console.warn('ブラウザ環境ではPython処理は利用できません');
      return { error: 'ブラウザ環境ではこの機能は利用できません', browserEnvironment: true };
    },
    extractColorsFromImage: async () => {
      console.warn('ブラウザ環境ではPython画像処理は利用できません');
      return { colors: [], error: 'ブラウザ環境ではこの機能は利用できません', browserEnvironment: true };
    },
    extractTextFromImage: async () => {
      console.warn('ブラウザ環境ではPython OCR処理は利用できません');
      return { text: '', error: 'ブラウザ環境ではこの機能は利用できません', browserEnvironment: true };
    }
  };

  // ES ModulesとCommonJSの両方に対応
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dummyBridge;
  } else if (typeof define === 'function' && define.amd) {
    define([], function () { return dummyBridge; });
  } else {
    window.pythonBridge = dummyBridge;
  }
}
