/**
 * WebAssembly 画像解析エンジン
 * OpenCV.js, Tesseract.js を使用した画像解析機能を提供します
 * 高性能なWebAssembly実装による画像分析を行います
 */

// ESM/CommonJS両対応のインポート
let cv, createWorker, registerAnalyzeLayoutPattern, registerDetectMainSections, registerDetectCardElements, registerDetectFeatureElements;

// モジュール初期化フラグとPromise管理
let modulesInitialized = false;
let initializationPromise = null;

// モジュールを動的に初期化する関数（シングルトンパターン）
const initializeModules = async () => {
  // 既に初期化済みの場合は即座に返す
  if (modulesInitialized) return;

  // 初期化中の場合は同じPromiseを返す（重複実行防止）
  if (initializationPromise) {
    console.log('初期化処理が既に実行中です。待機中...');
    return await initializationPromise;
  }

  // 初期化Promise作成
  initializationPromise = (async () => {
    try {
      console.log('WebAssemblyモジュールの初期化を開始...');

      // ブラウザ環境でのモジュール初期化
      if (typeof window !== 'undefined') {
        // OpenCV.jsの初期化を待機
        await waitForOpenCV();

        // Tesseract.jsを動的インポート
        const tesseractModule = await import('tesseract.js');
        createWorker = tesseractModule.createWorker;

        // ブリッジアダプターを動的インポート
        const bridgeModule = await import('./webassembly-bridge-adapter.js');
        registerAnalyzeLayoutPattern = bridgeModule.registerAnalyzeLayoutPattern;
        registerDetectMainSections = bridgeModule.registerDetectMainSections;
        registerDetectCardElements = bridgeModule.registerDetectCardElements;
        registerDetectFeatureElements = bridgeModule.registerDetectFeatureElements;
      }

      modulesInitialized = true;
      console.log('WebAssemblyモジュールの初期化完了');
    } catch (error) {
      console.error("モジュールの初期化エラー:", error);
      // 失敗時はPromiseをリセットして再試行可能にする
      initializationPromise = null;
      throw error;
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
        'window.cv.imdecode': window.cv ? typeof window.cv.imdecode : 'undefined',
        'window.cv.imread': window.cv ? typeof window.cv.imread : 'undefined'
      };

      console.log('OpenCV状態チェック:', status);

      // より厳密なチェック
      if (window.cv &&
        typeof window.cv.Mat === 'function' &&
        typeof window.cv.imdecode === 'function' &&
        typeof window.cv.imread === 'function' &&
        typeof window.cv.cvtColor === 'function') {
        cv = window.cv;
        console.log('OpenCV.js初期化完了 - 利用可能な主要関数:', {
          Mat: typeof cv.Mat,
          imdecode: typeof cv.imdecode,
          imread: typeof cv.imread,
          cvtColor: typeof cv.cvtColor
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
    const maxAttempts = 300; // 60秒間（200ms × 300回）に延長

    const checkInterval = setInterval(() => {
      attempts++;
      console.log(`OpenCV初期化チェック ${attempts}/${maxAttempts}`);

      if (checkOpenCV()) {
        clearInterval(checkInterval);
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        // タイムアウト時にフォールバック処理（エラーではなく警告として扱う）
        console.warn(`OpenCV.jsの初期化がタイムアウトしました。フォールバック処理を実行します。最終状態: ${JSON.stringify({
          'window.cv': typeof window.cv,
          'document.readyState': document.readyState
        })}`);
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
 * base64エンコードされた画像データをデコードしてOpenCV用のMatに変換
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {object} - OpenCV用のMat
 */
const decodeImageToMat = async (imageBase64) => {
  try {
    // OpenCVが初期化されているかチェック
    if (!cv || !cv.imdecode) {
      console.warn('OpenCV.jsが利用できません。フォールバック処理を実行します。');
      return createMockImageMatrix(imageBase64);
    }

    // Base64データを処理
    let base64Data = imageBase64;
    if (imageBase64.includes('data:image')) {
      base64Data = imageBase64.split(',')[1];
    }

    // Base64をバイナリに変換
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // ArrayBufferからMatを生成
    const array = new Uint8Array(bytes.buffer);
    return cv.imdecode(array, cv.IMREAD_COLOR);
  } catch (error) {
    console.error('画像のデコードに失敗しました:', error);
    console.warn('フォールバック処理を実行します。');
    return createMockImageMatrix(imageBase64);
  }
};

// フォールバック用のモック画像マトリックス作成
const createMockImageMatrix = (imageData) => {
  console.log("フォールバック: モック画像マトリックスを作成します");

  // 画像サイズの推定（base64データサイズから概算）
  const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  const estimatedSize = Math.sqrt(base64Data.length / 4); // 概算
  const width = Math.max(Math.floor(estimatedSize), 800);
  const height = Math.max(Math.floor(estimatedSize * 0.75), 600);

  return {
    rows: height,
    cols: width,
    type: () => 16, // CV_8UC3相当
    channels: () => 3,
    isMock: true, // フォールバック用フラグ
    data: new Uint8Array(width * height * 3).fill(128), // グレーで埋める
    delete: () => { }, // OpenCVのMat.delete()相当のダミー関数
    size: () => ({ width, height })
  }
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
 * 画像から代表的な色を抽出する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @param {object} options - オプション設定
 * @returns {Array} - 抽出された色情報の配列
 */
const extractColors = async (imageData, options = {}) => {
  try {
    // モジュール初期化
    await initializeModules();

    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    // 処理を高速化するためにリサイズ
    const scale = RESIZE_WIDTH / width;
    const dsize = new cv.Size(Math.round(width * scale), Math.round(height * scale));
    const small = new cv.Mat();
    cv.resize(img, small, dsize, 0, 0, cv.INTER_AREA);

    // ピクセルデータを取得
    const pixels = [];
    for (let j = 0; j < small.rows; j++) {
      for (let i = 0; i < small.cols; i++) {
        const pixel = small.ptr(j, i);
        // OpenCV はBGR形式なのでRGBに変換
        pixels.push([pixel[2], pixel[1], pixel[0]]);
      }
    }

    // K-meansクラスタリングで色を抽出
    const colors = kmeans(pixels, options.numColors || MAX_COLORS);

    // 色の役割を推定
    const colorTypes = ['primary', 'secondary', 'accent', 'background', 'text'];
    colors.forEach((color, index) => {
      // 単純なヒューリスティック: 最も多い色は背景色、2番目は主要色など
      color.role = colorTypes[Math.min(index, colorTypes.length - 1)];
    });

    // リソース解放
    img.delete();
    small.delete();

    return colors;
  } catch (error) {
    console.error('色抽出エラー:', error);
    return [];
  }
};

/**
 * Tesseract.jsワーカーの初期化（遅延ロード・シングルトン）
 * @returns {Promise<object>} - Tesseractワーカーインスタンス
 */
const getTesseractWorker = async () => {
  if (!tesseractWorker) {
    // モジュール初期化を確実に実行
    await initializeModules();

    tesseractWorker = await createWorker('jpn+eng');
    await tesseractWorker.setParameters({
      preserve_interword_spaces: '1'
    });
  }
  return tesseractWorker;
};

/**
 * 画像からテキストを抽出する (OCR)
 * @param {string} imageData - Base64エンコードされた画像データ
 * @param {object} options - OCRオプション
 * @returns {Promise<object>} - 抽出されたテキスト情報
 */
const extractText = async (imageData, options = {}) => {
  try {
    // Tesseractワーカーを取得
    const worker = await getTesseractWorker();

    // Base64データを処理
    let base64Data = imageData;
    if (imageData.includes('data:image')) {
      base64Data = imageData;
    } else {
      base64Data = `data:image/jpeg;base64,${imageData}`;
    }

    // OCR実行
    const result = await worker.recognize(base64Data);

    // テキストブロックの整形
    const textBlocks = result.data.words.map(word => ({
      text: word.text,
      confidence: word.confidence / 100, // 0-1の範囲に正規化
      position: {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0
      }
    }));

    return {
      text: result.data.text,
      textBlocks: textBlocks,
      full: result.data
    };
  } catch (error) {
    console.error('テキスト抽出エラー:', error);
    return {
      text: '',
      textBlocks: [],
      error: `テキスト抽出エラー: ${error.message}`
    };
  }
};

/**
 * 画像のセクションを分析する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<Array>} - 検出されたセクション情報の配列
 */
const analyzeImageSections = async (imageData) => {
  try {
    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // ガウシアンぼかしでノイズ除去
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Sobelフィルタで水平方向のエッジを検出
    const gradX = new cv.Mat();
    const absGradX = new cv.Mat();
    cv.Sobel(blurred, gradX, cv.CV_64F, 1, 0, 3);
    cv.convertScaleAbs(gradX, absGradX);

    // 各行の勾配平均を計算
    const gradientMeans = [];
    for (let i = 0; i < absGradX.rows; i++) {
      let rowSum = 0;
      for (let j = 0; j < absGradX.cols; j++) {
        rowSum += absGradX.ucharPtr(i, j)[0];
      }
      gradientMeans.push(rowSum / absGradX.cols);
    }

    // ピーク検出（セクション境界の候補）
    const peakIndices = [];
    const minPeakValue = gradientMeans.reduce((a, b) => a + b, 0) / gradientMeans.length * 1.5;
    const minPeakDistance = absGradX.rows * MIN_SECTION_HEIGHT_RATIO;

    for (let i = 1; i < gradientMeans.length - 1; i++) {
      if (
        gradientMeans[i] > minPeakValue &&
        gradientMeans[i] > gradientMeans[i - 1] &&
        gradientMeans[i] > gradientMeans[i + 1]
      ) {
        if (peakIndices.length === 0 || i - peakIndices[peakIndices.length - 1] > minPeakDistance) {
          peakIndices.push(i);
        }
      }
    }

    // 境界として上端と下端を追加
    const boundaries = [0, ...peakIndices, height - 1];

    // セクション情報を作成
    const sections = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const top = boundaries[i];
      const bottom = boundaries[i + 1];
      const sectionHeight = bottom - top;

      // 小さすぎるセクションはスキップ
      if (sectionHeight < height * MIN_SECTION_HEIGHT_RATIO) continue;

      // セクションの色情報を取得
      let roi = new cv.Mat();
      const rect = new cv.Rect(0, top, width, sectionHeight);
      roi = img.roi(rect);

      // セクションの代表色を抽出
      const sectionPixels = [];
      const skip = Math.max(1, Math.floor(roi.rows * roi.cols / 1000)); // サンプリング間隔

      for (let j = 0; j < roi.rows; j += skip) {
        for (let k = 0; k < roi.cols; k += skip) {
          const pixel = roi.ptr(j, k);
          sectionPixels.push([pixel[2], pixel[1], pixel[0]]); // BGR to RGB
        }
      }

      let dominantColor = { rgb: 'rgb(255, 255, 255)', hex: '#FFFFFF' };
      if (sectionPixels.length > 0) {
        const colors = kmeans(sectionPixels, 1);
        if (colors.length > 0) {
          dominantColor = {
            rgb: colors[0].rgb,
            hex: colors[0].hex
          };
        }
      }

      sections.push({
        section: i + 1,
        position: {
          top: top,
          height: sectionHeight
        },
        dominantColor: dominantColor
      });

      roi.delete();
    }

    // リソース解放
    img.delete();
    gray.delete();
    blurred.delete();
    gradX.delete();
    absGradX.delete();

    return sections;
  } catch (error) {
    console.error('セクション分析エラー:', error);
    return [];
  }
};

/**
 * 画像のレイアウトパターンを分析する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<object>} - レイアウト分析結果
 */
const analyzeLayoutPattern = async (imageData) => {
  try {
    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // 輪郭検出のためにエッジ検出
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    // 輪郭検出
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 領域の数と大きさを分析
    const areas = [];
    const significantContours = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // 一定サイズ以上の領域のみ考慮
      if (area > 100) {
        areas.push(area);
        significantContours.push(contour);
      }
    }

    // 水平・垂直線の検出
    const lines = new cv.Mat();
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 50, 10);

    // 水平・垂直線の分類
    let horizontalLines = 0;
    let verticalLines = 0;

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

    // レイアウト判定
    const layoutPatterns = {
      grid: 0,
      list: 0,
      card: 0,
      hero: 0,
      sidebar: 0
    };

    // グリッド判定（水平・垂直線が多い）
    if (horizontalLines > 3 && verticalLines > 3) {
      layoutPatterns.grid += 0.6;
    }

    // リスト判定（水平線が多く、垂直線が少ない）
    if (horizontalLines > 3 && verticalLines < 3) {
      layoutPatterns.list += 0.6;
    }

    // カード判定（同じようなサイズの領域が複数ある）
    if (significantContours.length > 2) {
      // 面積の標準偏差を計算
      const avgArea = areas.reduce((a, b) => a + b, 0) / areas.length;
      const variance = areas.reduce((a, b) => a + Math.pow(b - avgArea, 2), 0) / areas.length;
      const stdDev = Math.sqrt(variance);

      // 標準偏差が平均の30%未満なら、類似サイズと判断
      if (stdDev / avgArea < 0.3) {
        layoutPatterns.card += 0.7;
      }
    }

    // ヒーローセクション判定（上部に大きな領域）
    if (areas.length > 0) {
      areas.sort((a, b) => b - a);
      const largestArea = areas[0];

      // 最大領域が画像の20%以上を占める
      if (largestArea > width * height * 0.2) {
        for (let i = 0; i < significantContours.length; i++) {
          const contour = significantContours[i];
          const area = cv.contourArea(contour);

          if (area === largestArea) {
            const rect = cv.boundingRect(contour);
            // 上部にある大きな領域
            if (rect.y < height * 0.3) {
              layoutPatterns.hero += 0.5;
            }
            break;
          }
        }
      }
    }

    // サイドバー判定（左右に縦長の領域）
    for (let i = 0; i < significantContours.length; i++) {
      const contour = significantContours[i];
      const rect = cv.boundingRect(contour);

      // 縦長の領域（高さが幅の3倍以上）
      if (rect.height > rect.width * 3) {
        // 左右にある
        if (rect.x < width * 0.2 || rect.x + rect.width > width * 0.8) {
          layoutPatterns.sidebar += 0.4;
        }
      }
    }

    // 最も確率の高いレイアウトタイプを選択
    let maxPattern = 'grid';
    let maxScore = 0;

    for (const [pattern, score] of Object.entries(layoutPatterns)) {
      if (score > maxScore) {
        maxScore = score;
        maxPattern = pattern;
      }
    }

    // デフォルトのレイアウト結果
    const result = {
      layoutType: maxPattern,
      confidence: Math.min(maxScore, 0.9),
      patterns: layoutPatterns,
      layoutDetails: {
        dimensions: {
          width: width,
          height: height,
          aspectRatio: width / height
        },
        horizontalLines: horizontalLines,
        verticalLines: verticalLines,
        significantAreas: areas.length
      }
    };

    // リソース解放
    img.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    lines.delete();

    return result;
  } catch (error) {
    console.error('レイアウト分析エラー:', error);
    return {
      layoutType: "unknown",
      confidence: 0.5,
      error: error.message
    };
  }
};

/**
 * 画像からヘッダー、メイン、フッターセクションを検出する
 * @param {string} imageData - Base64エンコードされた画像データ
 * @returns {Promise<object>} - メインセクション検出結果
 */
const detectMainSections = async (imageData) => {
  try {
    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

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
          confidence: 0.85
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
          confidence: 0.9
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
          confidence: 0.85
        }
      ]
    };

    // リソース解放
    img.delete();
    gray.delete();
    gradX.delete();
    absGradX.delete();

    return result;
  } catch (error) {
    console.error('メインセクション検出エラー:', error);
    return {
      sectionsDetected: false,
      confidence: 0.5,
      sections: [],
      error: error.message
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
    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // ガウシアンぼかしでノイズ除去
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

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
      cards: cards
    };

    // リソース解放
    img.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return result;
  } catch (error) {
    console.error('カード要素検出エラー:', error);
    return {
      cardsDetected: false,
      confidence: 0.5,
      cards: [],
      error: error.message
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
    // 画像をデコード
    const img = await decodeImageToMat(imageData);
    const height = img.rows;
    const width = img.cols;

    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_BGR2GRAY);

    // ガウシアンぼかしでノイズ除去
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

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
            top: rect.y,
            left: rect.x,
            width: rect.width,
            height: rect.height,
            center: [rect.x + rect.width / 2, rect.y + rect.height / 2]
          },
          confidence: confidence
        });
      }
    }

    // 要素タイプごとのカウント
    const counts = {};
    elements.forEach(el => {
      counts[el.type] = (counts[el.type] || 0) + 1;
    });

    // 結果をまとめる
    const result = {
      elementsDetected: elements.length > 0,
      confidence: elements.length > 0 ? 0.75 : 0.5,
      elements: elements,
      summary: {
        counts: counts,
        total: elements.length,
        hasForms: (counts.input || 0) > 0 && (counts.button || 0) > 0,
        hasNavigation: (counts.navigation || 0) > 0
      }
    };

    // リソース解放
    img.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return result;
  } catch (error) {
    console.error('特徴要素検出エラー:', error);
    return {
      elementsDetected: false,
      confidence: 0.5,
      elements: [],
      error: error.message
    };
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
    // 前処理などの今後の拡張用にoptionsを準備
    const processingOptions = {
      ...options,
      numColors: options.numColors || MAX_COLORS,
      detectCards: options.detectCards !== false, // デフォルトで有効
      detectFeatures: options.detectFeatures !== false, // デフォルトで有効
      detectMainSections: options.detectMainSections !== false // デフォルトで有効
    };

    // 並列処理のためのPromiseの配列
    const tasks = [
      extractColors(imageData, processingOptions),
      extractText(imageData, processingOptions)
    ];

    // オプションに応じて追加タスクを実行
    if (processingOptions.detectMainSections) {
      tasks.push(detectMainSections(imageData));
    }

    if (processingOptions.detectCards) {
      tasks.push(detectCardElements(imageData));
    }

    if (processingOptions.detectFeatures) {
      tasks.push(detectFeatureElements(imageData));
    }

    // レイアウト分析は常に実行
    tasks.push(analyzeLayoutPattern(imageData));

    // すべてのタスクを並列実行
    const [colors, textResult, ...otherResults] = await Promise.all(tasks);

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
    }

    if (processingOptions.detectCards) {
      result.data.cards = otherResults[resultIndex++];
    }

    if (processingOptions.detectFeatures) {
      result.data.elements = otherResults[resultIndex++];
    }

    // レイアウト分析結果を追加
    result.data.layout = otherResults[resultIndex];

    return result;
  } catch (error) {
    console.error('総合画像分析エラー:', error);
    return {
      success: false,
      error: `総合画像分析エラー: ${error.message}`,
      data: {
        colors: [],
        text: '',
        textBlocks: []
      }
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

// このモジュール用のエクスポート
const moduleExports = {
  extractColors,
  extractText,
  analyzeImageSections,
  analyzeLayoutPattern,
  detectMainSections,
  detectCardElements,
  detectFeatureElements,
  analyzeAll,
  // 別名でもエクスポート
  extractColorsFromImage: extractColors,
  extractTextFromImage: extractText
};

// CommonJS互換性のため
if (typeof module !== 'undefined' && module.exports) {
  module.exports = moduleExports;
}
