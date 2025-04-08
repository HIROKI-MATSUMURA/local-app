/**
 * Python処理と連携するためのブリッジモジュール
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Pythonコマンド（OSによって異なる）
const PYTHON_CMD = os.platform() === 'win32' ? 'python' : 'python3';

/**
 * Pythonスクリプトを実行する共通関数
 * @param {string} scriptName - 実行するPythonスクリプト名
 * @param {Array} args - スクリプトに渡す引数
 * @returns {Promise<any>} - スクリプトの実行結果
 */
function runPythonScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    // スクリプトの絶対パスを取得
    const scriptPath = path.join(__dirname, scriptName);

    // Pythonプロセスを起動
    const pythonProcess = spawn(PYTHON_CMD, [scriptPath, ...args]);

    let dataString = '';
    let errorString = '';

    // 標準出力からデータを取得
    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
    });

    // 標準エラー出力からデータを取得
    pythonProcess.stderr.on('data', (data) => {
      errorString += data.toString();
      console.error(`Python Error: ${data.toString()}`);
    });

    // プロセス終了時の処理
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        // エラーが発生した場合
        reject({
          error: `Process exited with code ${code}`,
          stderr: errorString,
          code: code
        });
        return;
      }

      try {
        // 出力がJSONの場合はパースする
        const result = JSON.parse(dataString);
        resolve(result);
      } catch (error) {
        // JSON以外の出力の場合はそのまま返す
        resolve(dataString);
      }
    });

    // エラー発生時の処理
    pythonProcess.on('error', (error) => {
      reject({
        error: `Failed to start Python process: ${error.message}`,
        original: error
      });
    });
  });
}

/**
 * Python環境をチェックする
 * @returns {Promise<object>} Python環境の状態
 */
async function checkPythonEnvironment() {
  try {
    return await runPythonScript('python_check.py');
  } catch (error) {
    console.error('Python環境チェックエラー:', error);
    return {
      error: 'Python環境チェックに失敗しました',
      details: error
    };
  }
}

/**
 * Python環境をセットアップする
 * @returns {Promise<object>} セットアップ結果
 */
async function setupPythonEnvironment() {
  try {
    return await runPythonScript('python_installer.py');
  } catch (error) {
    console.error('Python環境セットアップエラー:', error);
    return {
      success: false,
      message: 'Python環境のセットアップに失敗しました',
      details: error
    };
  }
}

/**
 * 画像から色を抽出する
 * @param {string} imageData - Base64形式の画像データ
 * @returns {Promise<Array>} 抽出された色の配列
 */
async function extractColorsFromImage(imageData) {
  try {
    // 一時ファイルに画像を保存
    const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, imageData);

    const result = await runPythonScript('image_analyzer.py', ['extract_colors', tempFilePath]);

    // 一時ファイルを削除
    fs.unlinkSync(tempFilePath);

    return result;
  } catch (error) {
    console.error('色抽出エラー:', error);
    return [];
  }
}

/**
 * 画像からテキストを抽出する
 * @param {string} imageData - Base64形式の画像データ
 * @returns {Promise<string>} 抽出されたテキスト
 */
async function extractTextFromImage(imageData) {
  try {
    // 一時ファイルに画像を保存
    const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, imageData);

    const result = await runPythonScript('image_analyzer.py', ['extract_text', tempFilePath]);

    // 一時ファイルを削除
    fs.unlinkSync(tempFilePath);

    return result;
  } catch (error) {
    console.error('テキスト抽出エラー:', error);
    return 'テキスト抽出に失敗しました';
  }
}

/**
 * 画像をセクション分析する
 * @param {string} imageData - Base64形式の画像データ
 * @returns {Promise<Array>} セクション分析結果
 */
async function analyzeImageSections(imageData) {
  try {
    // 一時ファイルに画像を保存
    const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, imageData);

    const result = await runPythonScript('image_analyzer.py', ['analyze_sections', tempFilePath]);

    // 一時ファイルを削除
    fs.unlinkSync(tempFilePath);

    return result;
  } catch (error) {
    console.error('セクション分析エラー:', error);
    return [];
  }
}

/**
 * 画像のレイアウトパターンを分析する
 * @param {string} imageData - Base64形式の画像データ
 * @returns {Promise<object>} レイアウト分析結果
 */
async function analyzeLayoutPattern(imageData) {
  try {
    // 一時ファイルに画像を保存
    const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, imageData);

    const result = await runPythonScript('image_analyzer.py', ['analyze_layout', tempFilePath]);

    // 一時ファイルを削除
    fs.unlinkSync(tempFilePath);

    return result;
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
 * 画像から特徴的な要素を検出する
 * @param {string} imageData - Base64形式の画像データ
 * @returns {Promise<object>} 検出された要素
 */
async function detectFeatureElements(imageData) {
  try {
    // 一時ファイルに画像を保存
    const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, imageData);

    const result = await runPythonScript('image_analyzer.py', ['detect_elements', tempFilePath]);

    // 一時ファイルを削除
    fs.unlinkSync(tempFilePath);

    return result;
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
 * @returns {Promise<object>} 総合分析結果
 */
async function analyzeImage(imageData) {
  try {
    // 一時ファイルに画像を保存
    const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, imageData);

    const result = await runPythonScript('image_analyzer.py', ['analyze_all', tempFilePath]);

    // 一時ファイルを削除
    fs.unlinkSync(tempFilePath);

    return result;
  } catch (error) {
    console.error('画像分析エラー:', error);
    return {
      error: '画像分析に失敗しました',
      details: error
    };
  }
}

module.exports = {
  checkPythonEnvironment,
  setupPythonEnvironment,
  extractColorsFromImage,
  extractTextFromImage,
  analyzeImageSections,
  analyzeLayoutPattern,
  detectFeatureElements,
  analyzeImage
};
