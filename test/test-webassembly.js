/**
 * WebAssembly Image Analysis Test Script
 * このスクリプトはWebAssembly版の画像解析機能をテストします
 */

// モジュールの読み込み
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { createCanvas, loadImage } = require('canvas');

// テスト環境のセットアップ
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});

// グローバル変数のセットアップ
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.Image = dom.window.Image;
global.FileReader = dom.window.FileReader;

// キャンバスモジュールのセットアップ
global.createCanvas = createCanvas;
global.loadImage = loadImage;

// ダミーのAPIモックを作成
global.window.api = {
  isElectron: true,
  useWebAssembly: true
};

// 開発モードを設定
process.env.NODE_ENV = 'development';

// 必要なモジュールのパスを追加
process.env.NODE_PATH = path.resolve(__dirname, '../node_modules');
require('module').Module._initPaths();

// ---------------------------------------
// テスト用ヘルパー関数
// ---------------------------------------

/**
 * エラーを出力して終了する
 * @param {string} message エラーメッセージ
 */
function fail(message) {
  console.error('\x1b[31m✘ ' + message + '\x1b[0m');
  process.exit(1);
}

/**
 * 成功メッセージを出力する
 * @param {string} message 成功メッセージ
 */
function success(message) {
  console.log('\x1b[32m✓ ' + message + '\x1b[0m');
}

/**
 * 情報メッセージを出力する
 * @param {string} message 情報メッセージ
 */
function info(message) {
  console.log('\x1b[34mi ' + message + '\x1b[0m');
}

/**
 * 予期しない値のエラーを出力する
 * @param {string} name 項目名
 * @param {any} expected 期待値
 * @param {any} actual 実際の値
 */
function assertExpected(name, expected, actual) {
  if (expected !== actual) {
    fail(`${name}が期待値と一致しません: 期待値=${expected}, 実際値=${actual}`);
  }
}

/**
 * オブジェクトにプロパティが存在することを確認する
 * @param {string} name 項目名
 * @param {object} obj 対象オブジェクト
 * @param {array} props 期待するプロパティの配列
 */
function assertProperties(name, obj, props) {
  for (const prop of props) {
    if (!(prop in obj)) {
      fail(`${name}に必須プロパティ ${prop} が見つかりません`);
    }
  }
}

/**
 * テスト画像のBase64データを読み込む
 * @param {string} imagePath 画像ファイルへのパス
 * @returns {Promise<string>} Base64エンコードされた画像データ
 */
async function loadTestImage(imagePath) {
  return new Promise((resolve, reject) => {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      resolve(base64Image);
    } catch (error) {
      reject(error);
    }
  });
}

// ---------------------------------------
// モジュールのテスト
// ---------------------------------------

/**
 * WebAssembly Bridge Adapterのテスト
 */
async function testBridgeAdapter() {
  console.log('\n--- WebAssembly Bridge Adapter テスト ---');
  
  try {
    // WebAssembly Bridge Adapterのインポート
    const wasmBridge = require('../src/electron/utils/webassembly-bridge-adapter');
    info('ブリッジアダプターをロードしました');
    
    // 1. 環境チェック関数のテスト
    const envCheck = await wasmBridge.checkPythonEnvironment();
    success('環境チェック関数が正常に実行されました');
    assertProperties('環境チェック結果', envCheck, ['status', 'webassembly_mode']);
    assertExpected('webassembly_mode', true, envCheck.webassembly_mode);
    
    // 2. 環境セットアップ関数のテスト
    const setupResult = await wasmBridge.setupPythonEnvironment();
    success('環境セットアップ関数が正常に実行されました');
    assertProperties('セットアップ結果', setupResult, ['success', 'webassembly_mode']);
    assertExpected('webassembly_mode', true, setupResult.webassembly_mode);
    
    // 3. 関数登録メカニズムのテスト
    // ダミー関数を作成して登録
    const dummyFunction = () => ({ test: 'success' });
    wasmBridge.registerAnalyzeLayoutPattern(dummyFunction);
    
    // 登録した関数を呼び出してテスト
    const result = await wasmBridge.analyzeLayoutPattern();
    assertProperties('登録関数の結果', result, ['test']);
    assertExpected('登録関数の戻り値', 'success', result.test);
    success('関数登録メカニズムが正常に動作しています');
    
    return true;
  } catch (error) {
    fail(`ブリッジアダプターテスト中にエラーが発生しました: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * WebAssembly Image Analyzerのテスト
 */
async function testImageAnalyzer() {
  console.log('\n--- WebAssembly Image Analyzer テスト ---');
  
  try {
    // テスト画像のロード
    const testImagePath = path.resolve(__dirname, '../public/icon.png');
    info(`テスト画像をロード中: ${testImagePath}`);
    
    if (!fs.existsSync(testImagePath)) {
      fail(`テスト画像が見つかりません: ${testImagePath}`);
      return false;
    }
    
    // 画像をBase64にエンコード
    const imageBase64 = await loadTestImage(testImagePath);
    info('テスト画像をBase64にエンコードしました');
    
    // WebAssembly Image Analyzerのインポート
    const wasmAnalyzer = require('../src/electron/utils/webassembly-image-analyzer');
    info('WebAssembly画像解析モジュールをロードしました');
    
    // 1. 色抽出関数のテスト
    info('色抽出テストを実行中...');
    const colors = await wasmAnalyzer.extractColors(imageBase64);
    success('色抽出関数が正常に実行されました');
    
    if (!Array.isArray(colors) || colors.length === 0) {
      fail('色抽出結果が不正です');
    } else {
      assertProperties('色情報', colors[0], ['rgb', 'hex', 'ratio']);
      success(`${colors.length}色を抽出しました`);
    }
    
    // 2. テキスト抽出関数のテスト
    info('テキスト抽出テストを実行中...');
    try {
      const textResult = await wasmAnalyzer.extractText(imageBase64);
      success('テキスト抽出関数が正常に実行されました');
      if (textResult && typeof textResult === 'object') {
        assertProperties('テキスト抽出結果', textResult, ['text']);
        success('テキスト抽出結果の構造が正しいです');
      }
    } catch (e) {
      // Tesseract.jsは環境によって初期化に失敗する可能性があるためスキップ可能
      info(`テキスト抽出テストをスキップしました: ${e.message}`);
    }
    
    // 3. レイアウト分析関数のテスト
    info('レイアウト分析テストを実行中...');
    const layout = await wasmAnalyzer.analyzeLayoutPattern(imageBase64);
    success('レイアウト分析関数が正常に実行されました');
    assertProperties('レイアウト情報', layout, ['layoutType', 'confidence']);
    success('レイアウト分析結果の構造が正しいです');
    
    // 4. セクション分析関数のテスト
    info('セクション分析テストを実行中...');
    const sections = await wasmAnalyzer.detectMainSections(imageBase64);
    success('セクション分析関数が正常に実行されました');
    assertProperties('セクション情報', sections, ['sectionsDetected', 'confidence']);
    success('セクション分析結果の構造が正しいです');
    
    // 5. カード要素検出関数のテスト
    info('カード要素検出テストを実行中...');
    const cards = await wasmAnalyzer.detectCardElements(imageBase64);
    success('カード要素検出関数が正常に実行されました');
    assertProperties('カード検出結果', cards, ['cardsDetected', 'confidence']);
    success('カード要素検出結果の構造が正しいです');
    
    // 6. 特徴要素検出関数のテスト
    info('特徴要素検出テストを実行中...');
    const features = await wasmAnalyzer.detectFeatureElements(imageBase64);
    success('特徴要素検出関数が正常に実行されました');
    assertProperties('特徴検出結果', features, ['elementsDetected', 'confidence']);
    success('特徴要素検出結果の構造が正しいです');
    
    // 7. 総合分析関数のテスト
    info('総合分析テストを実行中...');
    const completeAnalysis = await wasmAnalyzer.analyzeAll(imageBase64);
    success('総合分析関数が正常に実行されました');
    assertProperties('総合分析結果', completeAnalysis, ['success', 'data']);
    
    if (completeAnalysis.success) {
      const data = completeAnalysis.data;
      assertProperties('総合分析データ', data, ['colors', 'text', 'layout']);
      success('総合分析結果の構造が正しいです');
    } else {
      fail(`総合分析が失敗しました: ${completeAnalysis.error}`);
    }
    
    return true;
  } catch (error) {
    fail(`画像解析テスト中にエラーが発生しました: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * 実際のアプリケーションコードを通してテスト
 */
async function testImageAnalyzerAPI() {
  console.log('\n--- アプリケーションAPI テスト ---');
  
  try {
    // イメージアナライザーモジュールをロード
    const imageAnalyzer = require('../src/electron/utils/imageAnalyzer');
    info('イメージアナライザーAPIをロードしました');
    
    // テスト画像のロード
    const testImagePath = path.resolve(__dirname, '../public/icon.png');
    info(`テスト画像をロード中: ${testImagePath}`);
    
    if (!fs.existsSync(testImagePath)) {
      fail(`テスト画像が見つかりません: ${testImagePath}`);
      return false;
    }
    
    // 画像をBase64にエンコード
    const imageBase64 = await loadTestImage(testImagePath);
    info('テスト画像をBase64にエンコードしました');
    
    // 1. 色抽出関数のテスト
    info('アプリAPIを使った色抽出テストを実行中...');
    const colors = await imageAnalyzer.extractColorsFromImage(imageBase64);
    success('色抽出APIが正常に実行されました');
    
    if (!Array.isArray(colors)) {
      fail('色抽出結果が配列ではありません');
    } else {
      success(`${colors.length}色を抽出しました`);
    }
    
    // 2. レイアウト分析APIのテスト
    info('アプリAPIを使ったレイアウト分析テストを実行中...');
    const layout = await imageAnalyzer.analyzeLayoutPattern(imageBase64);
    success('レイアウト分析APIが正常に実行されました');
    assertProperties('レイアウト情報', layout, ['layoutType']);
    success('レイアウト分析結果の構造が正しいです');
    
    // 3. 総合分析APIのテスト
    info('アプリAPIを使った総合分析テストを実行中...');
    const analysis = await imageAnalyzer.analyzeAll(imageBase64);
    success('総合分析APIが正常に実行されました');
    assertProperties('総合分析結果', analysis, ['success', 'data']);
    success('総合分析結果の構造が正しいです');
    
    return true;
  } catch (error) {
    fail(`APIテスト中にエラーが発生しました: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Python依存関係切断の検証
 */
async function testPythonIndependence() {
  console.log('\n--- Python依存関係切断の検証 ---');
  
  try {
    // Pythonブリッジの参照を試みる
    try {
      const pythonBridge = require('../src/electron/python_bridge.js');
      info('警告: Pythonブリッジモジュールが存在します。完全に依存関係を切断するには削除が必要です。');
    } catch (e) {
      success('Pythonブリッジモジュールは参照できません');
    }
    
    // 1. WebAssemblyモードの確認
    const imageAnalyzer = require('../src/electron/utils/imageAnalyzer');
    const envCheck = await imageAnalyzer.checkPythonEnvironment();
    
    if (envCheck.webassembly_mode === true && envCheck.python_mode === false) {
      success('WebAssemblyモードが有効で、Pythonモードが無効です');
    } else {
      fail(`モード設定が不正です: WebAssembly=${envCheck.webassembly_mode}, Python=${envCheck.python_mode}`);
    }
    
    // 2. package.jsonの依存関係チェック
    const packageJson = require('../package.json');
    const dependencies = Object.keys(packageJson.dependencies || {});
    const devDependencies = Object.keys(packageJson.devDependencies || {});
    const allDependencies = [...dependencies, ...devDependencies];
    
    // WebAssembly関連の依存関係をチェック
    const requiredDeps = ['@opencv-js/opencv.js', 'tesseract.js', 'photon-web'];
    const missingDeps = requiredDeps.filter(dep => !allDependencies.includes(dep));
    
    if (missingDeps.length > 0) {
      fail(`WebAssembly関連の依存関係が不足しています: ${missingDeps.join(', ')}`);
    } else {
      success('必要なWebAssembly関連の依存関係がすべてインストールされています');
    }
    
    // 3. ビルド設定のチェック
    if (packageJson.build && packageJson.build.asarUnpack) {
      const unpackIncludes = packageJson.build.asarUnpack;
      const requiredUnpack = [
        'node_modules/@opencv-js/**',
        'node_modules/tesseract.js/**',
        'node_modules/photon-web/**'
      ];
      
      const missingUnpack = requiredUnpack.filter(item => 
        !unpackIncludes.some(unpack => unpack.includes(item.replace('/**', '')))
      );
      
      if (missingUnpack.length > 0) {
        fail(`ビルド設定でasarUnpackに不足している項目があります: ${missingUnpack.join(', ')}`);
      } else {
        success('ビルド設定のasarUnpackに必要な項目がすべて含まれています');
      }
    } else {
      fail('ビルド設定にasarUnpackプロパティが見つかりません');
    }
    
    return true;
  } catch (error) {
    fail(`Python依存関係チェック中にエラーが発生しました: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * 互換性チェックとパフォーマンステスト
 */
async function testCompatibilityAndPerformance() {
  console.log('\n--- 互換性・パフォーマンステスト ---');
  
  try {
    // テスト用の画像を読み込む
    const testImagePath = path.resolve(__dirname, '../public/icon.png');
    const imageBase64 = await loadTestImage(testImagePath);
    
    // イメージアナライザーモジュールをロード
    const imageAnalyzer = require('../src/electron/utils/imageAnalyzer');
    
    // 1. パフォーマンステスト（色抽出）
    info('色抽出パフォーマンステストを実行中...');
    const colorStart = Date.now();
    await imageAnalyzer.extractColorsFromImage(imageBase64);
    const colorEnd = Date.now();
    const colorTime = colorEnd - colorStart;
    
    info(`色抽出処理時間: ${colorTime}ms`);
    if (colorTime > 2000) {
      info('警告: 色抽出処理に2秒以上かかっています。最適化が必要かもしれません。');
    } else {
      success('色抽出処理のパフォーマンスは良好です');
    }
    
    // 2. パフォーマンステスト（レイアウト分析）
    info('レイアウト分析パフォーマンステストを実行中...');
    const layoutStart = Date.now();
    await imageAnalyzer.analyzeLayoutPattern(imageBase64);
    const layoutEnd = Date.now();
    const layoutTime = layoutEnd - layoutStart;
    
    info(`レイアウト分析処理時間: ${layoutTime}ms`);
    if (layoutTime > 3000) {
      info('警告: レイアウト分析処理に3秒以上かかっています。最適化が必要かもしれません。');
    } else {
      success('レイアウト分析処理のパフォーマンスは良好です');
    }
    
    // 3. メモリ使用量チェック
    const memoryUsage = process.memoryUsage();
    info(`メモリ使用量: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB (ヒープ使用) / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB (ヒープ合計)`);
    
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) {
      info('警告: メモリ使用量が500MB以上です。メモリリークがないか確認してください。');
    } else {
      success('メモリ使用量は適正範囲内です');
    }
    
    return true;
  } catch (error) {
    fail(`互換性・パフォーマンステスト中にエラーが発生しました: ${error.message}`);
    console.error(error);
    return false;
  }
}

// ---------------------------------------
// メインテスト実行
// ---------------------------------------
async function runTests() {
  console.log('---------------------------------------');
  console.log('| WebAssembly画像解析テストスイート      |');
  console.log('---------------------------------------');
  console.log(`テスト開始時刻: ${new Date().toLocaleString()}`);
  
  let allTestsPassed = true;
  
  try {
    // 各テストの実行
    const bridgeAdapterPassed = await testBridgeAdapter();
    const imageAnalyzerPassed = await testImageAnalyzer();
    const apiPassed = await testImageAnalyzerAPI();
    const pythonIndependencePassed = await testPythonIndependence();
    const compatibilityPassed = await testCompatibilityAndPerformance();
    
    // 全テスト結果の集計
    allTestsPassed = bridgeAdapterPassed && imageAnalyzerPassed && apiPassed && 
                     pythonIndependencePassed && compatibilityPassed;
    
    console.log('\n---------------------------------------');
    if (allTestsPassed) {
      console.log('\x1b[32m✓ すべてのテストが成功しました！\x1b[0m');
    } else {
      console.log('\x1b[31m✘ 一部のテストが失敗しました。上記のエラーを確認してください。\x1b[0m');
    }
    console.log('---------------------------------------');
    
    process.exit(allTestsPassed ? 0 : 1);
  } catch (error) {
    console.error('\n予期せぬエラーが発生しました:', error);
    process.exit(1);
  }
}

// テストの実行
runTests();