/**
 * WebAssembly 画像解析エンジン
 * OpenCV.js, Tesseract.js を使用した画像解析機能を提供します
 * 高性能なWebAssembly実装による画像分析を行います
 */

console.log('🔧 webassembly-image-analyzer.js スクリプト開始');

// ESM/CommonJS両対応のインポート
let cv, createWorker, registerAnalyzeLayoutPattern, registerDetectMainSections, registerDetectCardElements, registerDetectFeatureElements;

// モジュール初期化フラグとPromise管理
let modulesInitialized = false;
let initializationPromise = null;
let isInitializing = false;

// モジュールを動的に初期化する関数（シングルトンパターン）
const initializeModules = async () => {
  // 既に初期化済みの場合は即座に終了
  if (modulesInitialized) {
    return true;
  }

  // 初期化中の場合は、既存のPromiseを待機
  if (initializationPromise) {
    console.log('初期化処理が既に実行中です。既存のPromiseを待機中...');
    return await initializationPromise;
  }

  // 新しい初期化処理を開始
  initializationPromise = (async () => {
    try {
      console.log('WebAssemblyモジュールの初期化を開始...');

      // OpenCV.js の初期化
      await waitForOpenCV();

      // Tesseract.js チェック
      if (typeof Tesseract !== 'undefined') {
        console.log('Tesseract.js が利用可能です');
        console.log('📋 Tesseract.js詳細情報:', {
          'Tesseract': typeof Tesseract,
          'Tesseract.createWorker': typeof Tesseract.createWorker,
          'Tesseract.recognize': typeof Tesseract.recognize,
          'Tesseract.detect': typeof Tesseract.detect,
          'Tesseract版本情報': Tesseract.version || 'バージョン情報なし'
        });

        createWorker = Tesseract.createWorker;
        console.log('✅ createWorker 関数を設定:', typeof createWorker);
      } else {
        console.warn('Tesseract.js が見つかりません');
        createWorker = null;
      }

      // ブリッジアダプター設定確認
      if (window.webAssemblyBridge && window.webAssemblyBridge.isEnabled()) {
        console.log('WebAssembly ブリッジアダプターを有効化');
        // 追加の設定があればここに実装
      } else {
        console.log('ブリッジアダプターは現在無効化されています');
      }

      modulesInitialized = true;
      console.log('WebAssemblyモジュールの初期化完了');
      return true;
    } catch (error) {
      console.error('WebAssemblyモジュール初期化エラー:', error);
      modulesInitialized = false;
      return false;
    } finally {
      // 初期化完了後にPromiseをクリア
      initializationPromise = null;
    }
  })();

  return await initializationPromise;
};

// OpenCV.jsの初期化待ち（堅牢なバージョン）
const waitForOpenCV = async () => {
  return new Promise((resolve, reject) => {
    console.log('OpenCV.js初期化を開始...');

    const checkOpenCV = () => {
      const status = {
        'document.readyState': document.readyState,
        'window.cvReady': window.cvReady,
        'window.cv': typeof window.cv,
        'window.cv.Mat': window.cv ? typeof window.cv.Mat : 'undefined',
        'window.cv.cvtColor': window.cv ? typeof window.cv.cvtColor : 'undefined',
        'window.cv.imread': window.cv ? typeof window.cv.imread : 'undefined'
      };

      console.log('OpenCV状態チェック:', status);

      // より柔軟なチェック（cv.imdecode要件を削除）
      if (window.cv &&
        typeof window.cv.Mat === 'function' &&
        typeof window.cv.cvtColor === 'function') {
        cv = window.cv;
        console.log('OpenCV.js初期化完了 - 利用可能な主要関数:', {
          Mat: typeof cv.Mat,
          cvtColor: typeof cv.cvtColor,
          imread: typeof cv.imread,
          imdecode: typeof cv.imdecode || 'undefined（代替処理あり）'
        });
        return true;
      }
      return false;
    };

    // 即座にチェック
    if (checkOpenCV()) {
      resolve();
      return;
    }

    // DOMContentLoaded待ち
    if (document.readyState !== 'complete') {
      console.log('DOMの読み込み完了を待機中...');
      window.addEventListener('load', () => {
        console.log('DOMの読み込み完了');
        setTimeout(() => {
          if (checkOpenCV()) {
            resolve();
          }
        }, 1000);
      });
    }

    // フォールバック: ポーリング（間隔を長くして負荷軽減）
    let attempts = 0;
    const maxAttempts = 30; // 6秒間（200ms × 30回）に短縮

    const checkInterval = setInterval(() => {
      attempts++;
      // 5回おきにログ出力（ログの量を削減）
      if (attempts % 5 === 0 || attempts === maxAttempts) {
        console.log(`OpenCV初期化チェック ${attempts}/${maxAttempts}`);
      }

      if (checkOpenCV()) {
        clearInterval(checkInterval);
        console.log('✅ OpenCV.js 初期化成功');
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        // タイムアウト時にフォールバック処理（エラーではなく警告として扱う）
        console.warn(`⚠️ OpenCV.js初期化がタイムアウト（${maxAttempts * 200}ms）。フォールバック処理を実行します。`);
        // エラーではなく成功として扱い、フォールバック処理を後で実装
        resolve();
      }
    }, 200);
  });
};

// Tesseractワーカーのキャッシュ
let tesseractWorker = null;

// 定数定義
const MAX_COLORS = 5;
const RESIZE_WIDTH = 300;
const MIN_SECTION_HEIGHT_RATIO = 0.05;

/**
 * Canvas経由で直接色を抽出する関数
 * @param {string} imageData - Base64エンコードされた画像データ
 * @param {object} options - オプション設定
 * @returns {Promise<Array>} - 抽出された色情報の配列
 */
const extractColorsFromCanvas = async (imageData, options = {}) => {
  try {
    console.log("🎨 Canvas経由で色抽出を開始");

    // Canvas要素を作成
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    return new Promise((resolve) => {
      img.onload = () => {
        // キャンバスサイズを設定
        const maxSize = 500; // 処理速度とのバランスを考慮
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1.0);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        canvas.width = width;
        canvas.height = height;

        // 画像を描画
        ctx.drawImage(img, 0, 0, width, height);

        // ピクセルデータを取得
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        // 色の出現回数をカウント
        const colorMap = new Map();

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // 透明ピクセルは無視
          if (a < 128) continue;

          // 色をHEX形式に変換
          const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;

          // 出現回数をカウント
          colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }

        // 色を出現頻度でソート
        const sortedColors = Array.from(colorMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, options.numColors || MAX_COLORS)
          .map(([hex, count]) => {
            // HEX形式から RGB 値を計算
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            return {
              hex: hex,
              rgb: `rgb(${r}, ${g}, ${b})`,
              r: r,
              g: g,
              b: b,
              ratio: count / (width * height)
            };
          });

        console.log(`✅ Canvas経由で${sortedColors.length}色を抽出`);
        resolve(sortedColors);
      };

      img.onerror = (error) => {
        console.error("❌ Canvas経由の色抽出エラー:", error);
        // エラー時は空の配列を返す
        resolve([]);
      };

      // 画像読み込み開始
      img.src = imageData;
    });
  } catch (error) {
    console.error("❌ extractColorsFromCanvas エラー:", error);
    return [];
  }
};

/**
 * 画像からテキストを抽出する関数
 * @param {string} imageData - Base64エンコードされた画像データ
 * @param {object} options - オプション設定
 * @returns {Promise<object>} - 抽出されたテキスト情報
 */
const extractText = async (imageData, options = {}) => {
  try {
    console.log("📝 extractText: テキスト抽出を開始");

    await initializeModules();

    // Tesseract.jsが利用可能かチェック
    if (!createWorker) {
      console.log("⚠️ Tesseract.jsが利用できないため、空のテキスト結果を返します");
      return { text: "", textBlocks: [] };
    }

    // ワーカーを作成または再利用
    if (!tesseractWorker) {
      console.log("🔧 新しいTesseractワーカーを作成");
      tesseractWorker = createWorker();
      await tesseractWorker.load();
      await tesseractWorker.loadLanguage('eng+jpn');
      await tesseractWorker.initialize('eng+jpn');
    }

    console.log("🔍 OCR処理を実行中...");
    const result = await tesseractWorker.recognize(imageData);

    // テキスト抽出結果を整形
    const extractedResult = {
      text: result.data.text || "",
      textBlocks: result.data.lines?.map(line => ({
        text: line.text,
        confidence: line.confidence / 100,
        bbox: line.bbox
      })) || []
    };

    console.log(`✅ テキスト抽出完了: ${extractedResult.text.length}文字, ${extractedResult.textBlocks.length}ブロック`);
    return extractedResult;
  } catch (error) {
    console.error("❌ テキスト抽出エラー:", error);
    return { text: "", textBlocks: [] };
  }
};

/**
 * 画像のセクション分析を行う関数
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<object>} - セクション分析結果
 */
const analyzeImageSections = async (imageData) => {
  try {
    console.log("🔍 analyzeImageSections: セクション分析を開始");

    // セクション検出関数を呼び出し
    const sectionsResult = await detectMainSections(imageData);

    return sectionsResult;
  } catch (error) {
    console.error("❌ セクション分析エラー:", error);
    return {
      sectionsDetected: false,
      confidence: 0.5,
      error: error.message
    };
  }
};

/**
 * 画像のレイアウトパターンを分析する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<object>} - レイアウト分析結果
 */
const analyzeLayoutPattern = async (imageData) => {
  try {
    console.log("🔍 analyzeLayoutPattern: レイアウト分析を開始");

    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    console.log(`📐 画像サイズ: ${width}x${height}px`);

    // OpenCVが利用できない場合の早期リターン
    if (!cv || img.isMock) {
      console.log("⚠️ analyzeLayoutPattern: OpenCVが利用できないため、フォールバック処理を実行");
      return {
        layoutType: "unknown",
        confidence: 0.5,
        fallback: true
      };
    }

    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // Cannyエッジ検出
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    // 輪郭検出
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 水平・垂直線の検出
    const lines = new cv.Mat();
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 50, 10);

    // パターン判定のための特徴量
    let horizontalLines = 0;
    let verticalLines = 0;

    // 線の方向を分析
    for (let i = 0; i < lines.rows; i++) {
      const line = lines.data32S.slice(i * 4, (i + 1) * 4);
      const [x1, y1, x2, y2] = line;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

      if (angle < 10 || angle > 170) {
        horizontalLines++;
      } else if (angle > 80 && angle < 100) {
        verticalLines++;
      }
    }

    // レイアウトパターンのスコア
    const layoutPatterns = {
      grid: 0,
      list: 0,
      card: 0,
      hero: 0,
      sidebar: 0
    };

    // グリッドパターン
    if (horizontalLines > 3 && verticalLines > 3) {
      layoutPatterns.grid += 0.6;
    }

    // リストパターン
    if (horizontalLines > 3 && verticalLines < 3) {
      layoutPatterns.list += 0.6;
    }

    // 最も確率の高いパターンを判定
    let maxPattern = 'unknown';
    let maxScore = 0;

    for (const [pattern, score] of Object.entries(layoutPatterns)) {
      if (score > maxScore) {
        maxScore = score;
        maxPattern = pattern;
      }
    }

    // 結果をまとめる
    const result = {
      layoutType: maxScore > 0.3 ? maxPattern : 'unknown',
      confidence: Math.min(maxScore, 0.9),
      fallback: false,
      patterns: layoutPatterns
    };

    console.log(`✅ analyzeLayoutPattern: 分析完了 - レイアウト: ${result.layoutType}（信頼度: ${result.confidence.toFixed(2)}）`);

    // リソース解放
    img.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    lines.delete();

    return result;
  } catch (error) {
    console.error('❌ レイアウト分析エラー:', error);
    return {
      layoutType: "unknown",
      confidence: 0.5,
      error: error.message,
      fallback: true
    };
  }
};

/**
 * base64エンコードされた画像データをデコードしてOpenCV用のMatに変換
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {object} - OpenCV用のMat
 */
const decodeImageToMat = async (imageBase64) => {
  try {
    // OpenCVが初期化されているかチェック
    if (!cv || !cv.Mat) {
      console.warn('OpenCV.jsが利用できません。フォールバック処理を実行します。');
      return createMockImageMatrix(imageBase64);
    }

    // Base64データを処理
    let base64Data = imageBase64;
    if (imageBase64.includes('data:image')) {
      base64Data = imageBase64.split(',')[1];
    }

    // cv.imdecodeが利用可能な場合は従来の処理
    if (cv.imdecode) {
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const array = new Uint8Array(bytes.buffer);
      return cv.imdecode(array, cv.IMREAD_COLOR);
    }
    // cv.imdecodeが利用できない場合の代替処理
    else if (cv.imread) {
      console.log('cv.imdecodeが利用できません。cv.imreadで代替処理を実行します。');
      // HTMLの隠しcanvasを使用して画像をMatに変換
      return await decodeImageViaCanvas(base64Data);
    }
    else {
      console.warn('画像デコード関数が利用できません。フォールバック処理を実行します。');
      return createMockImageMatrix(imageBase64);
    }
  } catch (error) {
    console.error('画像のデコードに失敗しました:', error);
    console.warn('フォールバック処理を実行します。');
    return createMockImageMatrix(imageBase64);
  }
};

// Canvas経由での画像デコード（cv.imdecodeの代替）
const decodeImageViaCanvas = async (base64Data) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Canvas ImageDataからOpenCV Matを作成
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const mat = cv.matFromImageData(imageData);
        console.log(`✅ Canvas経由でMat作成成功: ${mat.cols}x${mat.rows}px`);
        resolve(mat);
      } catch (error) {
        console.error('Canvas経由の画像変換に失敗:', error);
        reject(error);
      }
    };
    img.onerror = (error) => {
      console.error('画像の読み込みに失敗:', error);
      reject(error);
    };
    img.src = 'data:image/jpeg;base64,' + base64Data;
  });
};

// フォールバック用のモック画像マトリックス作成
const createMockImageMatrix = (imageData) => {
  console.log("🔄 フォールバック: モック画像マトリックスを作成します");
  console.log("📊 フォールバック理由: OpenCV.jsが利用できないため、代替処理を実行");

  // 画像サイズの推定（base64データサイズから概算）
  const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  const estimatedSize = Math.sqrt(base64Data.length / 4); // 概算
  const width = Math.max(Math.floor(estimatedSize), 800);
  const height = Math.max(Math.floor(estimatedSize * 0.75), 600);

  console.log(`📐 推定画像サイズ: ${width}x${height}px (base64サイズ: ${base64Data.length}文字)`);

  return {
    rows: height,
    cols: width,
    type: () => 16, // CV_8UC3相当
    channels: () => 3,
    isMock: true, // フォールバック用フラグ
    data: new Uint8Array(width * height * 3).fill(128), // グレーで埋める
    delete: () => {
      console.log("🗑️ フォールバック: モックMatのdelete()が呼び出されました");
    }, // OpenCVのMat.delete()相当のダミー関数
    size: () => ({ width, height }),
    Size: function (w, h) {
      console.log(`📏 フォールバック: Size(${w || width}, ${h || height})が呼び出されました`);
      return { width: w || width, height: h || height };
    }, // cv.Size()相当
    ptr: (row, col) => {
      // RGB値を返す（グレー値128）
      return [128, 128, 128];
    },
    ucharPtr: (row, col) => {
      // グレースケール値を返す
      return [128];
    },
    // 追加のOpenCV互換メソッド
    clone: () => {
      console.log("🔄 フォールバック: clone()が呼び出されました");
      return createMockImageMatrix(imageData);
    },
    copyTo: (dst) => {
      console.log("📋 フォールバック: copyTo()が呼び出されました");
      return dst;
    }
  };
};

/**
 * ピクセル配列からK-meansクラスタリングを使用して代表色を抽出
 * @param {Array} pixels - RGB値を持つピクセル配列
 * @param {number} k - クラスター数
 * @returns {Array} - 抽出された代表色の情報
 */
const kmeans = (pixels, k = MAX_COLORS) => {
  // 入力データのチェック
  if (!pixels || pixels.length === 0) {
    return [];
  }

  // ランダムにk個の初期中心点を選択
  const centers = [];
  const usedIndices = new Set();

  for (let i = 0; i < k; i++) {
    // 既に選択されていない点をランダムに選ぶ
    let index;
    do {
      index = Math.floor(Math.random() * pixels.length);
    } while (usedIndices.has(index));

    usedIndices.add(index);
    centers.push([...pixels[index]]);
  }

  // データポイントがどのクラスタに属するかを記録する配列
  let labels = new Array(pixels.length).fill(0);
  let oldLabels = new Array(pixels.length).fill(-1);

  // 最大イテレーション回数
  const maxIterations = 20;

  // 収束するか最大イテレーション回数に達するまで繰り返す
  for (let iter = 0; iter < maxIterations; iter++) {
    // クラスタの割り当て
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let label = 0;

      for (let j = 0; j < k; j++) {
        // ユークリッド距離の計算
        const dist = Math.sqrt(
          Math.pow(pixels[i][0] - centers[j][0], 2) +
          Math.pow(pixels[i][1] - centers[j][1], 2) +
          Math.pow(pixels[i][2] - centers[j][2], 2)
        );

        if (dist < minDist) {
          minDist = dist;
          label = j;
        }
      }

      labels[i] = label;
    }

    // 収束チェック
    let converged = true;
    for (let i = 0; i < pixels.length; i++) {
      if (labels[i] !== oldLabels[i]) {
        converged = false;
        break;
      }
    }

    if (converged) {
      break;
    }

    // 古いラベルを保存
    oldLabels = [...labels];

    // クラスタ中心の更新
    const counts = new Array(k).fill(0);
    const newCenters = new Array(k).fill(0).map(() => [0, 0, 0]);

    for (let i = 0; i < pixels.length; i++) {
      const label = labels[i];
      counts[label]++;

      newCenters[label][0] += pixels[i][0];
      newCenters[label][1] += pixels[i][1];
      newCenters[label][2] += pixels[i][2];
    }

    for (let i = 0; i < k; i++) {
      if (counts[i] > 0) {
        newCenters[i][0] /= counts[i];
        newCenters[i][1] /= counts[i];
        newCenters[i][2] /= counts[i];
      }
    }

    centers.splice(0, centers.length, ...newCenters);
  }

  // 各クラスタのサイズを計算
  const clusterSizes = new Array(k).fill(0);
  for (let i = 0; i < labels.length; i++) {
    clusterSizes[labels[i]]++;
  }

  // 結果を整形して返す
  const totalPixels = pixels.length;
  const results = [];

  for (let i = 0; i < k; i++) {
    // RGB値を整数に丸める
    const rgb = centers[i].map(Math.round);
    // HEX形式に変換
    const hex = `#${rgb[0].toString(16).padStart(2, '0')}${rgb[1].toString(16).padStart(2, '0')}${rgb[2].toString(16).padStart(2, '0')}`;

    results.push({
      rgb: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
      hex: hex,
      ratio: clusterSizes[i] / totalPixels
    });
  }

  // 占有率でソート
  results.sort((a, b) => b.ratio - a.ratio);

  return results;
};

/**
 * 画像から代表的な色を抽出する（超高精度版 - UI色特化）
 * @param {string} imageData - Base64エンコードされた画像データ
 * @param {object} options - オプション設定
 * @returns {Array} - 抽出された色情報の配列
 */
const extractColors = async (imageData, options = {}) => {
  try {
    console.log("🎨 extractColors: 超高精度UI色抽出を開始");

    await initializeModules();

    // 5MB超過時の段階的圧縮
    const processedImageData = await optimizeImageSize(imageData);

    // 画像をデコード
    const img = await decodeImageToMat(processedImageData);
    const height = img.rows;
    const width = img.cols;

    console.log(`📐 画像サイズ: ${width}x${height}px`);

    // OpenCVが利用できない場合の早期リターン
    if (!cv || img.isMock) {
      console.log("⚠️ extractColors: OpenCVが利用できないため、Canvas直接処理を実行");
      return await extractColorsFromCanvas(imageData, options);
    }

    console.log("✅ extractColors: 超高精度OpenCV処理を開始");

    // 高解像度設定（色精度最優先）
    const maxSize = 2000;
    const minCompressionRatio = 0.9; // 90%以上のサイズを維持
    const scale = Math.max(
      Math.min(maxSize / width, maxSize / height, 1.0),
      minCompressionRatio
    );

    let processedImg = img;
    if (scale < 1.0) {
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);

      let dsize;
      if (typeof cv.Size === 'function') {
        dsize = new cv.Size(newWidth, newHeight);
      } else {
        dsize = { width: newWidth, height: newHeight };
      }

      processedImg = new cv.Mat();
      const resizeFlag = cv.INTER_LANCZOS4 || cv.INTER_CUBIC || cv.INTER_LINEAR;
      cv.resize(img, processedImg, dsize, 0, 0, resizeFlag);
      console.log(`🔍 画像リサイズ: ${width}x${height} → ${Math.round(width * scale)}x${Math.round(height * scale)} (縮小率: ${(scale * 100).toFixed(1)}%)`);
    } else {
      console.log("🔍 画像サイズが適切なため、リサイズをスキップ");
    }

    // 軽微なノイズ除去
    const blurred = new cv.Mat();
    cv.GaussianBlur(processedImg, blurred, new cv.Size(3, 3), 0.3, 0.3, cv.BORDER_DEFAULT);

    // 🚀 新機能: 超高精度UI色抽出
    const extractedColors = await extractUIColorsWithPrecision(blurred);

    console.log(`✅ extractColors: 超高精度処理完了 - ${extractedColors.length}色を抽出`);

    // リソース解放
    img.delete();
    if (processedImg !== img) processedImg.delete();
    blurred.delete();

    return extractedColors;
  } catch (error) {
    console.error('❌ extractColors: 色抽出エラー:', error);
    console.log('🔄 Canvas直接処理にフォールバック');
    return await extractColorsFromCanvas(imageData, options);
  }
};

/**
 * 🚀 ハイブリッド超高精度UI色抽出（WebAssembly + 変数設定ページアルゴリズム）
 */
const extractUIColorsWithPrecision = async (img) => {
  try {
    console.log("🎯 ハイブリッド超高精度UI色抽出を開始");

    const height = img.rows;
    const width = img.cols;

    // 🔧 WebAssembly機能: 写真除外マスク生成
    const uiMask = createUIOnlyMask(img);
    console.log("📊 写真除外マスク生成完了");

    // 🚀 変数設定ページ高精度アルゴリズム: 全ピクセル処理
    console.log("🔍 UI領域の全ピクセル解析を開始（変数設定ページ方式）");
    const colorMap = new Map();
    const totalPixels = height * width;
    const minOccurrence = totalPixels * 0.0005; // 0.05%以上の出現で有意

    let processedPixels = 0;
    let skippedPhotoPixels = 0;

    // UI領域の全ピクセルを処理
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 写真除外マスクをチェック
        if (uiMask && uiMask.ucharPtr(y, x)[0] === 0) {
          skippedPhotoPixels++;
          continue; // 写真部分はスキップ
        }

        const pixel = img.ptr(y, x);
        const r = pixel[0]; // 🔧 修正: RGB正順 (was pixel[2])
        const g = pixel[1];
        const b = pixel[2]; // 🔧 修正: RGB正順 (was pixel[0])

        // 透明度チェック（もしある場合）
        if (pixel.length > 3 && pixel[3] === 0) continue;

        // RGBを16進数に変換（変数設定ページと同じ方式）
        const color = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;

        // 出現回数をカウント
        colorMap.set(color, (colorMap.get(color) || 0) + 1);
        processedPixels++;
      }
    }

    console.log(`📊 ピクセル処理完了: 処理=${processedPixels}, 写真除外=${skippedPhotoPixels}`);
    console.log(`📊 写真除外率: ${((skippedPhotoPixels / totalPixels) * 100).toFixed(1)}%`);

    // 🔧 変数設定ページ高精度アルゴリズム: 厳密な色の類似性結合
    console.log("🔗 厳密な色結合処理を開始（distance < 15）");
    const mergedColors = new Map();
    const processedColors = new Set();

    for (const [color1, count1] of colorMap.entries()) {
      if (processedColors.has(color1)) continue;

      let totalCount = count1;
      let weightedR = parseInt(color1.slice(1, 3), 16) * count1;
      let weightedG = parseInt(color1.slice(3, 5), 16) * count1;
      let weightedB = parseInt(color1.slice(5, 7), 16) * count1;

      // 類似色の厳密な結合（変数設定ページと同じ閾値）
      for (const [color2, count2] of colorMap.entries()) {
        if (color1 === color2 || processedColors.has(color2)) continue;

        const r1 = parseInt(color1.slice(1, 3), 16);
        const g1 = parseInt(color1.slice(3, 5), 16);
        const b1 = parseInt(color1.slice(5, 7), 16);
        const r2 = parseInt(color2.slice(1, 3), 16);
        const g2 = parseInt(color2.slice(3, 5), 16);
        const b2 = parseInt(color2.slice(5, 7), 16);

        // 🎯 厳密な色距離計算（変数設定ページと同じ）
        const distance = Math.sqrt(
          Math.pow(r1 - r2, 2) +
          Math.pow(g1 - g2, 2) +
          Math.pow(b1 - b2, 2)
        );

        // 厳密な色結合（distance < 15）
        if (distance < 15) {
          totalCount += count2;
          weightedR += r2 * count2;
          weightedG += g2 * count2;
          weightedB += b2 * count2;
          processedColors.add(color2);
        }
      }

      // 加重平均で新しい色を計算
      const avgR = Math.round(weightedR / totalCount);
      const avgG = Math.round(weightedG / totalCount);
      const avgB = Math.round(weightedB / totalCount);
      const mergedColor = `#${((1 << 24) + (avgR << 16) + (avgG << 8) + avgB).toString(16).slice(1).toUpperCase()}`;

      mergedColors.set(mergedColor, totalCount);
      processedColors.add(color1);
    }

    // 🔧 変数設定ページ高精度アルゴリズム: 出現頻度フィルタリング
    const filteredColors = Array.from(mergedColors.entries())
      .filter(([_, count]) => count > minOccurrence)
      .sort((a, b) => b[1] - a[1])
      .map(([color, count]) => {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        return {
          hex: color,
          r: r,
          g: g,
          b: b,
          ratio: count / processedPixels
          // ✅ roleプロパティは削除
        };
      })
      .slice(0, MAX_COLORS);

    // リソース解放
    if (uiMask) uiMask.delete();

    console.log(`✅ ハイブリッド超高精度色抽出完了: ${filteredColors.length}色抽出`);
    filteredColors.forEach((color, index) => {
      console.log(`  ${index + 1}. ${color.hex} (${(color.ratio * 100).toFixed(2)}%)`);
    });

    return filteredColors;

  } catch (error) {
    console.error('❌ ハイブリッド超高精度UI色抽出エラー:', error);

    // シンプルなフォールバック
    const fallbackColors = [];
    try {
      for (let y = 0; y < img.rows; y += 10) {
        for (let x = 0; x < img.cols; x += 10) {
          const pixel = img.ptr(y, x);
          const r = pixel[0]; // 🔧 修正: RGB正順 (was pixel[2])
          const g = pixel[1];
          const b = pixel[2]; // 🔧 修正: RGB正順 (was pixel[0])
          const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;

          fallbackColors.push({
            hex: hex,
            r: r,
            g: g,
            b: b,
            ratio: 1.0 / Math.min(5, fallbackColors.length + 1)
          });

          if (fallbackColors.length >= 5) break;
        }
        if (fallbackColors.length >= 5) break;
      }
    } catch (fallbackError) {
      console.error('フォールバックエラー:', fallbackError);
    }

    return fallbackColors;
  }
};

/**
 * 写真要素を除外するマスクを作成
 */
const createUIOnlyMask = (img) => {
  try {
    console.log("🎭 UI要素マスクを作成");

    if (!cv || !cv.Canny) {
      console.log("⚠️ OpenCV機能制限のため、マスク作成をスキップ");
      return null;
    }

    const height = img.rows;
    const width = img.cols;

    // グレースケール変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // エッジ検出
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    // 画像の質感分析（UI要素と写真の区別）
    const mask = new cv.Mat.zeros(height, width, cv.CV_8UC1);

    // テクスチャ分析のためのブロックサイズ
    const blockSize = 16;

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        const blockHeight = Math.min(blockSize, height - y);
        const blockWidth = Math.min(blockSize, width - x);

        // ブロック内のエッジ密度を計算
        let edgeCount = 0;
        for (let by = 0; by < blockHeight; by++) {
          for (let bx = 0; bx < blockWidth; bx++) {
            if (edges.ucharPtr(y + by, x + bx)[0] > 0) {
              edgeCount++;
            }
          }
        }

        // エッジ密度による判定（高い = 写真、低い = UI）
        const edgeDensity = edgeCount / (blockHeight * blockWidth);
        const isUIRegion = edgeDensity < 0.1 || edgeDensity > 0.4; // UI要素は非常に少ないか、規則的な多数のエッジ

        // ブロック全体をマスクに設定
        const value = isUIRegion ? 255 : 0; // UI=255（白）、写真=0（黒）
        for (let by = 0; by < blockHeight; by++) {
          for (let bx = 0; bx < blockWidth; bx++) {
            if (y + by < height && x + bx < width) {
              mask.ucharPtr(y + by, x + bx)[0] = value;
            }
          }
        }
      }
    }

    // リソース解放
    gray.delete();
    edges.delete();

    return mask;
  } catch (error) {
    console.error('❌ createUIOnlyMask エラー:', error);
    return null;
  }
};

/**
 * 画像からヘッダー、メイン、フッターセクションを検出する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<object>} - メインセクション検出結果
 */
const detectMainSections = async (imageData) => {
  try {
    console.log("🔍 detectMainSections: メインセクション検出を開始");

    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    console.log(`📐 画像サイズ: ${width}x${height}px`);

    // OpenCVが利用できない場合の早期リターン
    if (!cv || img.isMock) {
      console.log("⚠️ detectMainSections: OpenCVが利用できないため、フォールバック処理を実行");
      console.log("📊 フォールバック: 推定ベースでセクション情報を生成");

      return {
        dimensions: {
          width: width,
          height: height,
          aspectRatio: width / height
        },
        sectionsDetected: true,
        confidence: 0.5, // フォールバック時は信頼度を下げる
        fallback: true,
        sections: [
          {
            name: "header",
            type: "header",
            position: {
              top: 0,
              left: 0,
              width: width,
              height: Math.floor(height * 0.15) // 上位15%をヘッダー
            },
            confidence: 0.5,
            fallback: true
          },
          {
            name: "main",
            type: "content",
            position: {
              top: Math.floor(height * 0.15),
              left: 0,
              width: width,
              height: Math.floor(height * 0.7) // 中央70%をメイン
            },
            confidence: 0.6,
            fallback: true
          },
          {
            name: "footer",
            type: "footer",
            position: {
              top: Math.floor(height * 0.85),
              left: 0,
              width: width,
              height: Math.floor(height * 0.15) // 下位15%をフッター
            },
            confidence: 0.5,
            fallback: true
          }
        ]
      };
    }

    console.log("✅ detectMainSections: OpenCV処理を開始");

    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // 水平方向のエッジを検出（Sobelフィルター）
    const gradX = new cv.Mat();
    const absGradX = new cv.Mat();
    cv.Sobel(gray, gradX, cv.CV_16S, 1, 0, 3);
    cv.convertScaleAbs(gradX, absGradX);

    // 各行の勾配平均を計算
    const rowMeans = Array(height).fill(0);
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        rowMeans[i] += absGradX.ucharPtr(i, j)[0];
      }
      rowMeans[i] /= width;
    }

    // 移動平均フィルタでスムージング
    const windowSize = Math.max(3, Math.floor(height / 50));
    const smoothMeans = [];
    for (let i = 0; i < height; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - windowSize); j < Math.min(height, i + windowSize + 1); j++) {
        sum += rowMeans[j];
        count++;
      }
      smoothMeans.push(sum / count);
    }

    // ピーク検出（セクション境界の候補）
    const peakIndices = [];
    const avgMean = smoothMeans.reduce((a, b) => a + b, 0) / height;
    const threshold = avgMean * 1.5;
    const minDistance = height * 0.05; // 最小距離

    for (let i = 1; i < height - 1; i++) {
      if (
        smoothMeans[i] > threshold &&
        smoothMeans[i] > smoothMeans[i - 1] &&
        smoothMeans[i] > smoothMeans[i + 1]
      ) {
        if (peakIndices.length === 0 || i - peakIndices[peakIndices.length - 1] > minDistance) {
          peakIndices.push(i);
        }
      }
    }

    console.log(`🎯 detectMainSections: ${peakIndices.length}個のピークを検出`);

    // ヒューリスティックルールを使用してヘッダー/フッターを判定
    let headerBottom = Math.floor(height * 0.15); // デフォルト: 上位15%をヘッダーとする
    let footerTop = Math.floor(height * 0.85);    // デフォルト: 下位15%をフッターとする

    if (peakIndices.length > 0) {
      // 上部のピークをヘッダー境界として使用
      for (const peak of peakIndices) {
        if (peak < height * 0.3) { // 上部30%以内にあるピーク
          headerBottom = peak;
          break;
        }
      }

      // 下部のピークをフッター境界として使用
      for (let i = peakIndices.length - 1; i >= 0; i--) {
        if (peakIndices[i] > height * 0.7) { // 下部30%以内にあるピーク
          footerTop = peakIndices[i];
          break;
        }
      }
    }

    // セクション情報を構築
    const result = {
      dimensions: {
        width: width,
        height: height,
        aspectRatio: width / height
      },
      sectionsDetected: true,
      confidence: 0.8,
      fallback: false,
      sections: [
        {
          name: "header",
          type: "header",
          position: {
            top: 0,
            left: 0,
            width: width,
            height: headerBottom
          },
          confidence: 0.85,
          fallback: false
        },
        {
          name: "main",
          type: "content",
          position: {
            top: headerBottom,
            left: 0,
            width: width,
            height: footerTop - headerBottom
          },
          confidence: 0.9,
          fallback: false
        },
        {
          name: "footer",
          type: "footer",
          position: {
            top: footerTop,
            left: 0,
            width: width,
            height: height - footerTop
          },
          confidence: 0.85,
          fallback: false
        }
      ]
    };

    console.log("✅ detectMainSections: OpenCV処理完了");

    // リソース解放
    img.delete();
    gray.delete();
    gradX.delete();
    absGradX.delete();

    return result;
  } catch (error) {
    console.error('❌ detectMainSections: メインセクション検出エラー:', error);
    console.error('🔍 エラー詳細:', {
      message: error.message,
      stack: error.stack,
      cvAvailable: typeof cv !== 'undefined',
      cvMatAvailable: typeof cv !== 'undefined' && typeof cv.Mat === 'function'
    });

    return {
      sectionsDetected: false,
      confidence: 0.5,
      sections: [],
      error: error.message,
      fallback: true
    };
  }
};

/**
 * 画像からカード要素を検出する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<object>} - カード要素検出結果
 */
const detectCardElements = async (imageData) => {
  try {
    console.log("🔍 detectCardElements: カード要素検出を開始");

    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    console.log(`📐 画像サイズ: ${width}x${height}px`);

    // OpenCVが利用できない場合の早期リターン
    if (!cv || img.isMock) {
      console.log("⚠️ detectCardElements: OpenCVが利用できないため、フォールバック処理を実行");
      console.log("📊 フォールバック: 推定ベースでカード要素を生成");

      // 簡単なグリッドベースの推定カード配置
      const cardWidth = Math.floor(width / 3);
      const cardHeight = Math.floor(height / 4);
      const mockCards = [];

      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          mockCards.push({
            type: "card",
            position: {
              x: col * cardWidth + 20,
              y: row * cardHeight + 100,
              width: cardWidth - 40,
              height: cardHeight - 40
            },
            confidence: 0.4,
            fallback: true,
            properties: {
              aspectRatio: (cardWidth - 40) / (cardHeight - 40),
              area: (cardWidth - 40) * (cardHeight - 40)
            }
          });
        }
      }

      console.log(`🎯 detectCardElements: フォールバックで${mockCards.length}個のカードを推定`);

      return {
        cardsDetected: true,
        confidence: 0.4,
        fallback: true,
        cards: mockCards
      };
    }

    console.log("✅ detectCardElements: OpenCV処理を開始");

    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // ガウシアンぼかしでノイズ除去
    const blurred = new cv.Mat();
    if (typeof cv.Size === 'function') {
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    } else {
      gray.copyTo(blurred);
    }

    // Cannyエッジ検出
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);

    // 輪郭検出
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const cards = [];
    const minCardArea = width * height * 0.01; // 最小カードサイズ
    const maxCardArea = width * height * 0.5;  // 最大カードサイズ

    console.log(`🔍 detectCardElements: ${contours.size()}個の輪郭を検出`);

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // サイズフィルタリング
      if (area < minCardArea || area > maxCardArea) continue;

      // 輪郭を近似
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      // 矩形に近い形状のみをカードとして扱う
      if (approx.rows >= 4 && approx.rows <= 8) {
        const rect = cv.boundingRect(contour);

        // アスペクト比チェック（極端に細長いものは除外）
        const aspectRatio = rect.width / rect.height;
        if (aspectRatio > 0.3 && aspectRatio < 3.0) {
          // カード要素の検出信頼度を計算
          let confidence = 0.7;

          // 矩形に近いほど信頼度上昇
          if (approx.rows === 4) confidence += 0.1;

          // アスペクト比が標準的なカードに近いほど信頼度上昇
          if (aspectRatio > 0.5 && aspectRatio < 2.0) confidence += 0.1;

          cards.push({
            id: `card_${cards.length + 1}`,
            position: {
              top: rect.y,
              left: rect.x,
              width: rect.width,
              height: rect.height
            },
            confidence: Math.min(confidence, 0.95) // 最大0.95に制限
          });
        }
      }

      approx.delete();
    }

    // 結果をまとめる
    const result = {
      cardsDetected: cards.length > 0,
      confidence: cards.length > 0 ? 0.85 : 0.5,
      fallback: false,
      cards: cards
    };

    console.log(`✅ detectCardElements: OpenCV処理完了 - ${cards.length}個のカードを検出`);

    // リソース解放
    img.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return result;
  } catch (error) {
    console.error('❌ detectCardElements: カード要素検出エラー:', error);
    console.error('🔍 エラー詳細:', {
      message: error.message,
      stack: error.stack,
      cvAvailable: typeof cv !== 'undefined',
      cvMatAvailable: typeof cv !== 'undefined' && typeof cv.Mat === 'function'
    });

    return {
      cardsDetected: false,
      confidence: 0.5,
      cards: [],
      error: error.message,
      fallback: true
    };
  }
};

/**
 * 画像から特徴的なUI要素（ボタン、フォーム、ナビゲーションなど）を検出する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<object>} - UI要素検出結果
 */
const detectFeatureElements = async (imageData) => {
  try {
    console.log("🔍 detectFeatureElements: UI要素検出を開始");

    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    console.log(`📐 画像サイズ: ${width}x${height}px`);

    // OpenCVが利用できない場合の早期リターン
    if (!cv || img.isMock) {
      console.log("⚠️ detectFeatureElements: OpenCVが利用できないため、フォールバック処理を実行");
      console.log("📊 フォールバック: 推定ベースでUI要素を生成");

      // 一般的なUI要素の推定配置
      const mockElements = [
        {
          type: "button",
          position: { x: width - 150, y: 20, width: 120, height: 40 },
          confidence: 0.4,
          fallback: true,
          properties: { role: "primary", text: "ボタン" }
        },
        {
          type: "navigation",
          position: { x: 0, y: 0, width: width, height: 60 },
          confidence: 0.5,
          fallback: true,
          properties: { role: "header", orientation: "horizontal" }
        },
        {
          type: "form",
          position: { x: 50, y: height * 0.3, width: width - 100, height: height * 0.4 },
          confidence: 0.3,
          fallback: true,
          properties: { fields: 3 }
        }
      ];

      console.log(`🎯 detectFeatureElements: フォールバックで${mockElements.length}個のUI要素を推定`);

      return {
        elementsDetected: true,
        confidence: 0.4,
        fallback: true,
        elements: mockElements
      };
    }

    console.log("✅ detectFeatureElements: OpenCV処理を開始");

    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // ガウシアンぼかしでノイズ除去
    const blurred = new cv.Mat();
    if (typeof cv.Size === 'function') {
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    } else {
      gray.copyTo(blurred);
    }

    // Cannyエッジ検出
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);

    // 輪郭検出
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

    // UI要素を格納する配列
    const elements = [];

    // 要素検出のための最小サイズ
    const minElementArea = width * height * 0.001;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // 小さすぎる要素は無視
      if (area < minElementArea) continue;

      const rect = cv.boundingRect(contour);
      const aspectRatio = rect.width / rect.height;

      // 要素タイプの推定
      let type = "unknown";
      let confidence = 0.5;

      // ボタン検出（横長の小さな矩形）
      if (
        aspectRatio > 1.5 && aspectRatio < 5.0 &&
        rect.height < height * 0.1 &&
        rect.width < width * 0.5
      ) {
        type = "button";
        confidence = 0.7;
      }
      // 入力フィールド検出（横長の矩形）
      else if (
        aspectRatio > 3.0 && aspectRatio < 10.0 &&
        rect.height < height * 0.08
      ) {
        type = "input";
        confidence = 0.65;
      }
      // ナビゲーション検出（上部の横長の領域）
      else if (
        rect.y < height * 0.2 &&
        rect.width > width * 0.5 &&
        rect.height < height * 0.15
      ) {
        type = "navigation";
        confidence = 0.6;
      }
      // カード検出（中程度のアスペクト比の矩形）
      else if (
        aspectRatio > 0.5 && aspectRatio < 2.0 &&
        area > minElementArea * 10
      ) {
        type = "card";
        confidence = 0.6;
      }
      // 画像要素（正方形に近い形状）
      else if (
        aspectRatio > 0.8 && aspectRatio < 1.2 &&
        area > minElementArea * 5
      ) {
        type = "image";
        confidence = 0.6;
      }

      // 十分な信頼度がある要素のみ追加
      if (confidence > 0.5) {
        elements.push({
          type: type,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          confidence: confidence,
          properties: {
            area: area,
            aspectRatio: aspectRatio
          }
        });
      }

      contour.delete();
    }

    console.log(`🎯 detectFeatureElements: ${elements.length}個のUI要素を検出`);

    return {
      elementsDetected: true,
      confidence: 0.8,
      elements: elements
    };
  } catch (error) {
    console.error('❌ detectFeatureElements: UI要素検出エラー:', error);
    return {
      elementsDetected: false,
      confidence: 0.5,
      elements: [],
      error: error.message
    };
  }
};

/**
 * 5MBを超える画像を段階的に圧縮して4MB以下に収める
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<string>} - 最適化された画像データ
 */
const optimizeImageSize = async (imageData) => {
  try {
    // Base64データサイズを計算（バイト単位）
    let base64Data = imageData;
    if (imageData.includes('data:image')) {
      base64Data = imageData.split(',')[1];
    }

    const sizeInBytes = (base64Data.length * 3) / 4; // Base64デコード後のサイズ
    const sizeInMB = sizeInBytes / (1024 * 1024);

    console.log(`📊 画像サイズチェック: ${sizeInMB.toFixed(2)}MB`);

    // 5MB以下なら圧縮不要
    if (sizeInMB <= 5.0) {
      console.log("✅ 画像サイズが5MB以下のため、圧縮をスキップ");
      return imageData;
    }

    console.log(`⚠️ 画像サイズが5MB超過（${sizeInMB.toFixed(2)}MB）- 段階的圧縮を開始`);

    // Canvas経由で段階的圧縮
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    return new Promise((resolve) => {
      img.onload = async () => {
        console.log(`📐 元画像サイズ: ${img.width}x${img.height}px`);

        canvas.width = img.width;
        canvas.height = img.height;

        // 高品質設定で初期描画
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0);

        let currentImageData = imageData;
        let currentSize = sizeInMB;
        let compressionStep = 1;

        // 段階的圧縮ループ
        while (currentSize > 4.0 && compressionStep <= 5) {
          console.log(`🔄 圧縮ステップ${compressionStep}: 現在${currentSize.toFixed(2)}MB`);

          let newImageData;

          if (compressionStep <= 2) {
            // ステップ1-2: 画質調整（サイズは維持）
            const quality = compressionStep === 1 ? 0.9 : 0.8;
            newImageData = canvas.toDataURL('image/jpeg', quality);
            console.log(`🎚️ 画質調整: quality=${quality}`);
          } else {
            // ステップ3-5: サイズ縮小 + 画質調整
            const sizeReduction = compressionStep === 3 ? 0.9 : compressionStep === 4 ? 0.8 : 0.7;
            const quality = compressionStep === 3 ? 0.85 : compressionStep === 4 ? 0.8 : 0.75;

            const newWidth = Math.round(img.width * sizeReduction);
            const newHeight = Math.round(img.height * sizeReduction);

            canvas.width = newWidth;
            canvas.height = newHeight;

            // 高品質リサイズ
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            newImageData = canvas.toDataURL('image/jpeg', quality);
            console.log(`📏 サイズ縮小: ${img.width}x${img.height} → ${newWidth}x${newHeight} (${(sizeReduction * 100).toFixed(0)}%), quality=${quality}`);
          }

          // 新しいサイズを計算
          const newBase64 = newImageData.split(',')[1];
          const newSizeInBytes = (newBase64.length * 3) / 4;
          const newSizeInMB = newSizeInBytes / (1024 * 1024);

          console.log(`📉 圧縮結果: ${currentSize.toFixed(2)}MB → ${newSizeInMB.toFixed(2)}MB（${((1 - newSizeInMB / currentSize) * 100).toFixed(1)}%削減）`);

          currentImageData = newImageData;
          currentSize = newSizeInMB;
          compressionStep++;

          // 十分小さくなったら終了
          if (currentSize <= 4.0) {
            break;
          }
        }

        if (currentSize <= 4.0) {
          console.log(`✅ 圧縮成功: 最終サイズ ${currentSize.toFixed(2)}MB（目標4MB以下達成）`);
        } else {
          console.log(`⚠️ 圧縮完了: 最終サイズ ${currentSize.toFixed(2)}MB（目標未達成だが処理続行）`);
        }

        resolve(currentImageData);
      };

      img.onerror = (error) => {
        console.error("❌ 画像最適化エラー:", error);
        console.log("🔄 最適化失敗 - 元画像を使用");
        resolve(imageData);
      };

      img.src = imageData;
    });

  } catch (error) {
    console.error("❌ optimizeImageSize エラー:", error);
    console.log("🔄 最適化失敗 - 元画像を使用");
    return imageData;
  }
};

/**
 * 画像解析処理をまとめて実行する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @param {object} options - 解析オプション
 * @returns {Promise<object>} - 解析結果
 */
const analyzeAll = async (imageData, options = {}) => {
  try {
    console.log("🚀 analyzeAll: 総合画像解析を開始");
    console.log("📋 解析オプション:", options);

    // 前処理などの今後の拡張用にoptionsを準備
    const processingOptions = {
      ...options,
      numColors: options.numColors || MAX_COLORS,
      detectCards: options.detectCards !== false, // デフォルトで有効
      detectFeatures: options.detectFeatures !== false, // デフォルトで有効
      detectMainSections: options.detectMainSections !== false // デフォルトで有効
    };

    console.log("⚙️ 処理オプション:", processingOptions);

    // 並列処理のためのPromiseの配列
    const tasks = [
      extractColors(imageData, processingOptions),
      extractText(imageData, processingOptions)
    ];

    console.log("📊 基本タスク（色抽出・テキスト抽出）を追加");

    // オプションに応じて追加タスクを実行
    if (processingOptions.detectMainSections) {
      tasks.push(detectMainSections(imageData));
      console.log("📐 メインセクション検出タスクを追加");
    }

    if (processingOptions.detectCards) {
      tasks.push(detectCardElements(imageData));
      console.log("🃏 カード要素検出タスクを追加");
    }

    if (processingOptions.detectFeatures) {
      tasks.push(detectFeatureElements(imageData));
      console.log("🔍 UI要素検出タスクを追加");
    }

    // レイアウト分析は常に実行
    tasks.push(analyzeLayoutPattern(imageData));
    console.log("📋 レイアウト分析タスクを追加");

    console.log(`⏳ ${tasks.length}個のタスクを並列実行中...`);

    // すべてのタスクを並列実行
    const [colors, textResult, ...otherResults] = await Promise.all(tasks);

    console.log("✅ 全タスク完了 - 結果を統合中");

    // 結果を統合
    const result = {
      success: true,
      data: {
        colors,
        text: textResult.text,
        textBlocks: textResult.textBlocks
      }
    };

    // 追加タスクの結果を統合
    let resultIndex = 0;

    if (processingOptions.detectMainSections) {
      result.data.mainSections = otherResults[resultIndex++];
      console.log("📐 メインセクション結果を統合");
    }

    if (processingOptions.detectCards) {
      result.data.cards = otherResults[resultIndex++];
      console.log("🃏 カード要素結果を統合");
    }

    if (processingOptions.detectFeatures) {
      result.data.elements = otherResults[resultIndex++];
      console.log("🔍 UI要素結果を統合");
    }

    // レイアウト分析結果を追加
    result.data.layout = otherResults[resultIndex];
    console.log("📋 レイアウト分析結果を統合");

    console.log("🎉 analyzeAll: 総合画像解析完了");
    console.log("📊 結果サマリー:", {
      colorsCount: result.data.colors?.length || 0,
      textLength: result.data.text?.length || 0,
      textBlocksCount: result.data.textBlocks?.length || 0,
      mainSectionsDetected: result.data.mainSections?.sectionsDetected || false,
      cardsDetected: result.data.cards?.cardsDetected || false,
      elementsDetected: result.data.elements?.elementsDetected || false,
      layoutConfidence: result.data.layout?.confidence || 0
    });

    // 🔍 詳細解析結果をログ出力
    console.log("\n==================== WebAssembly解析器 詳細結果 ====================");

    // 色抽出の詳細
    if (result.data.colors && result.data.colors.length > 0) {
      console.log(`🎨 抽出された色 (${result.data.colors.length}個):`);
      result.data.colors.forEach((color, index) => {
        if (typeof color === 'string') {
          console.log(`  [${index + 1}] ${color}`);
        } else if (color && color.hex) {
          console.log(`  [${index + 1}] ${color.hex}${color.ratio ? ` (${(color.ratio * 100).toFixed(1)}%)` : ''}${color.rgb ? ` RGB(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})` : ''}`);
        } else {
          console.log(`  [${index + 1}] ${JSON.stringify(color)}`);
        }
      });
    }

    // テキスト抽出の詳細
    if (result.data.text) {
      console.log(`\n📝 抽出されたテキスト (${result.data.text.length}文字):`);
      console.log(`"${result.data.text}"`);
    }

    // テキストブロックの詳細
    if (result.data.textBlocks && result.data.textBlocks.length > 0) {
      console.log(`\n📋 テキストブロック (${result.data.textBlocks.length}個):`);
      result.data.textBlocks.forEach((block, index) => {
        console.log(`  [${index + 1}] "${block.text || block}"`);
        if (block.confidence) {
          console.log(`       信頼度: ${(block.confidence * 100).toFixed(1)}%`);
        }
        if (block.bbox) {
          console.log(`       位置: x=${block.bbox.x0}, y=${block.bbox.y0}, w=${block.bbox.x1 - block.bbox.x0}, h=${block.bbox.y1 - block.bbox.y0}`);
        }
      });
    }

    // UI要素の詳細
    if (result.data.elements) {
      const elements = result.data.elements.elements || result.data.elements;
      if (Array.isArray(elements) && elements.length > 0) {
        console.log(`\n🔲 検出されたUI要素 (${elements.length}個):`);
        elements.forEach((element, index) => {
          console.log(`  [${index + 1}] ${element.type || 'unknown'} (信頼度: ${(element.confidence * 100).toFixed(1)}%)`);
          if (element.position) {
            console.log(`       位置: (${element.position.left || element.position.x}, ${element.position.top || element.position.y})`);
            console.log(`       サイズ: ${element.position.width}×${element.position.height}`);
          }
        });
      }
    }

    // メインセクションの詳細
    if (result.data.mainSections) {
      const sections = result.data.mainSections.sections || [];
      if (sections.length > 0) {
        console.log(`\n📐 メインセクション (${sections.length}個):`);
        sections.forEach((section, index) => {
          console.log(`  [${index + 1}] ${section.name || `セクション${index + 1}`} (${section.type || 'unknown'})`);
          if (section.confidence) {
            console.log(`       信頼度: ${(section.confidence * 100).toFixed(1)}%`);
          }
          if (section.position) {
            console.log(`       位置: (${section.position.left}, ${section.position.top}) サイズ: ${section.position.width}×${section.position.height}`);
          }
        });
      }
    }

    // レイアウト分析の詳細
    if (result.data.layout) {
      console.log(`\n📋 レイアウト分析:`);
      console.log(`  パターン: ${result.data.layout.pattern || 'unknown'} (信頼度: ${(result.data.layout.confidence * 100).toFixed(1)}%)`);
      if (result.data.layout.patterns) {
        console.log(`  各パターンスコア:`);
        Object.entries(result.data.layout.patterns).forEach(([pattern, score]) => {
          console.log(`    ${pattern}: ${(score * 100).toFixed(1)}%`);
        });
      }
    }

    console.log("========================================================\n");

    return result;
  } catch (error) {
    console.error('❌ analyzeAll: 総合画像分析エラー:', error);
    console.error('🔍 エラー詳細:', {
      message: error.message,
      stack: error.stack,
      options: options
    });

    return {
      success: false,
      error: `総合画像分析エラー: ${error.message}`,
      data: {
        colors: [],
        text: '',
        textBlocks: []
      },
      fallback: true
    };
  }
};

// アダプターへの関数登録（初期化後に実行）
const registerFunctions = () => {
  if (registerAnalyzeLayoutPattern && typeof registerAnalyzeLayoutPattern === 'function') {
    registerAnalyzeLayoutPattern(analyzeLayoutPattern);
    registerDetectMainSections(detectMainSections);
    registerDetectCardElements(detectCardElements);
    registerDetectFeatureElements(detectFeatureElements);
  }
};

// 初期化時に関数登録を試行
setTimeout(() => {
  registerFunctions();
}, 100);

// CommonJS エクスポート
const moduleExports = {
  extractColors,
  extractText,
  analyzeImageSections,
  analyzeLayoutPattern,
  detectMainSections,
  detectCardElements,
  detectFeatureElements,
  analyzeAll,
  optimizeImageSize, // 新機能を追加
  // 別名でもエクスポート
  extractColorsFromImage: extractColors,
  extractTextFromImage: extractText
};

// ブラウザ環境でグローバルに設定
if (typeof window !== 'undefined') {
  console.log('🔧 window環境を検出 - webAssemblyAnalyzerを設定します');
  window.webAssemblyAnalyzer = moduleExports;
  console.log('🔧 window.webAssemblyAnalyzer設定完了:', typeof window.webAssemblyAnalyzer);
  console.log('🔧 利用可能な関数:', Object.keys(moduleExports));
} else {
  console.log('🔧 window環境が見つかりません');
}

// CommonJS互換性
if (typeof module !== 'undefined' && module.exports) {
  module.exports = moduleExports;
}

console.log('🔧 webassembly-image-analyzer.js スクリプト完了');
