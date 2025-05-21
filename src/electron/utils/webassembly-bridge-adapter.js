/**
 * WebAssembly Bridge Adapter
 * Python Bridge の代替として WebAssembly 実装を提供します
 * 既存コードとの互換性を保ちつつ、Python依存を排除します
 */

import cv from '@techstark/opencv-js';
import { createWorker } from 'tesseract.js';

// ロード状態の管理
let OPENCV_LOADED = false;
let TESSERACT_LOADED = false;
let TESSERACT_WORKER = null;

// ロード済みチェック
const checkOpenCVLoaded = () => {
  return new Promise((resolve) => {
    if (OPENCV_LOADED) {
      resolve(true);
      return;
    }

    // OpenCV.jsが読み込まれているか確認
    if (typeof cv !== 'undefined' && cv.Mat) {
      OPENCV_LOADED = true;
      resolve(true);
      return;
    }

    // 読み込みを待機
    const checkInterval = setInterval(() => {
      if (typeof cv !== 'undefined' && cv.Mat) {
        clearInterval(checkInterval);
        OPENCV_LOADED = true;
        resolve(true);
      }
    }, 100);

    // タイムアウト設定
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!OPENCV_LOADED) {
        console.error('OpenCV.jsの読み込みがタイムアウトしました');
        resolve(false);
      }
    }, 10000); // 10秒待機
  });
};

// Tesseract.jsのワーカーを初期化
const initTesseractWorker = async () => {
  if (TESSERACT_WORKER) {
    return TESSERACT_WORKER;
  }

  try {
    const worker = await createWorker('jpn+eng');
    await worker.setParameters({
      preserve_interword_spaces: '1'
    });
    TESSERACT_WORKER = worker;
    TESSERACT_LOADED = true;
    return worker;
  } catch (error) {
    console.error('Tesseract.jsワーカーの初期化に失敗しました:', error);
    return null;
  }
};

// 環境チェック関数（Python版の代替）
export const checkPythonEnvironment = async () => {
  try {
    const opencvReady = await checkOpenCVLoaded();
    
    // Tesseractワーカーの準備
    let tesseractReady = false;
    try {
      const worker = await initTesseractWorker();
      tesseractReady = !!worker;
    } catch (e) {
      console.warn('Tesseract環境チェックエラー:', e);
    }

    return {
      status: 'ok',
      opencv_available: opencvReady,
      tesseract_available: tesseractReady,
      webassembly_mode: true,
      python_mode: false
    };
  } catch (error) {
    console.error('環境チェックエラー:', error);
    return {
      status: 'error',
      error: error.message || 'Unknown error',
      webassembly_mode: true,
      python_mode: false
    };
  }
};

// 環境セットアップ関数
export const setupPythonEnvironment = async () => {
  // WebAssembly版ではこの関数は本来必要ありませんが、互換性のために残します
  try {
    const opencvReady = await checkOpenCVLoaded();
    
    if (!opencvReady) {
      return {
        success: false,
        message: 'OpenCV.jsの読み込みに失敗しました',
        webassembly_mode: true
      };
    }

    // Tesseractの初期化を試みる
    try {
      const worker = await initTesseractWorker();
      if (!worker) {
        return {
          success: true,
          message: 'OpenCVは利用可能ですが、Tesseractの初期化に失敗しました。OCR機能に制限があります。',
          webassembly_mode: true
        };
      }
    } catch (e) {
      console.warn('Tesseract初期化エラー:', e);
    }

    return {
      success: true,
      message: 'WebAssembly環境が正常に初期化されました',
      webassembly_mode: true
    };
  } catch (error) {
    console.error('環境セットアップエラー:', error);
    return {
      success: false,
      message: `環境セットアップエラー: ${error.message || 'Unknown error'}`,
      webassembly_mode: true
    };
  }
};

// 画像解析機能は webassembly-image-analyzer.js で実装します
// この値は後でimportされた関数で上書きされます
export let analyzeLayoutPattern = () => {
  throw new Error('analyzeLayoutPattern が初期化されていません');
};

export let detectMainSections = () => {
  throw new Error('detectMainSections が初期化されていません');
};

export let detectCardElements = () => {
  throw new Error('detectCardElements が初期化されていません');
};

export let detectFeatureElements = () => {
  throw new Error('detectFeatureElements が初期化されていません');
};

// 関数の外部からの設定を許可
export const registerAnalyzeLayoutPattern = (fn) => {
  analyzeLayoutPattern = fn;
};

export const registerDetectMainSections = (fn) => {
  detectMainSections = fn;
};

export const registerDetectCardElements = (fn) => {
  detectCardElements = fn;
};

export const registerDetectFeatureElements = (fn) => {
  detectFeatureElements = fn;
};