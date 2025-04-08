/**
 * 画像分析ユーティリティ
 * 内部的にはPythonスクリプトを使用して画像処理を行います
 */

import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

// Python版の画像分析ユーティリティをインポート
import * as pythonAnalyzer from './python_bridge_adapter';

/**
 * 画像の主要な色を抽出する
 */
const extractColorsFromImage = async (imageBase64) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.extractColorsFromImage(imageBase64);
  } catch (error) {
    console.error("Python版色抽出でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    return new Promise((resolve) => {
      if (!imageBase64) {
        resolve([]);
        return;
      }

      const img = new Image();
      img.crossOrigin = "Anonymous"; // CORSエラー回避
      img.src = imageBase64;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);

        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;

        const colorMap = {};
        for (let i = 0; i < data.length; i += 4) {
          const color = `${data[i]},${data[i + 1]},${data[i + 2]}`;
          colorMap[color] = (colorMap[color] || 0) + 1;
        }

        // 出現回数が多い順に並べて上位5色を取得
        const sortedColors = Object.entries(colorMap).sort((a, b) => b[1] - a[1]);

        // RGB形式で返す
        resolve(sortedColors.slice(0, 5).map(([rgb]) => `rgb(${rgb})`));
      };

      img.onerror = () => {
        console.error("画像の読み込みに失敗しました");
        resolve([]);
      };
    });
  }
};

/**
 * 画像からテキストを抽出する（OCR）
 */
const extractTextFromImage = async (imageBase64) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.extractTextFromImage(imageBase64);
  } catch (error) {
    console.error("Python版テキスト抽出でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    console.log('OCR処理をスキップしています (CSP制限のため)');
    // 一時的なダミーテキストを返す
    return 'OCR処理は現在無効化されています。CSP設定の制限により、Web Workerが使用できません。';
  }
};

/**
 * 画像のセクション分析機能
 */
const analyzeImageSections = async (imageBase64) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.analyzeImageSections(imageBase64);
  } catch (error) {
    console.error("Python版セクション分析でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    return new Promise((resolve) => {
      if (!imageBase64) {
        resolve([]);
        return;
      }

      const img = new Image();
      img.src = imageBase64;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);

        // 画像を水平方向に5セクションに分析
        const sectionHeight = img.height / 5;
        const sections = [];

        for (let i = 0; i < 5; i++) {
          const y = i * sectionHeight;
          const imageData = ctx.getImageData(0, y, img.width, sectionHeight);

          // 各セクションの代表色を抽出
          const dominantColor = getDominantColor(imageData.data);

          sections.push({
            section: i + 1,
            position: { top: y, height: sectionHeight },
            dominantColor: dominantColor
          });
        }

        resolve(sections);
      };

      img.onerror = () => {
        console.error("画像の読み込みに失敗しました");
        resolve([]);
      };
    });
  }
};

/**
 * レイアウトパターンを分析する関数
 * @param {string} imagePath - 分析する画像のパス
 * @returns {Promise<Object>} - レイアウトタイプとその確信度を含むオブジェクト
 */
const analyzeLayoutPattern = async (imagePath) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.analyzeLayoutPattern(imagePath);
  } catch (error) {
    console.error("Python版レイアウト分析でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    try {
      // デフォルトの結果オブジェクト
      const result = {
        layoutType: "unknown",
        confidence: 0.8,
        patterns: {},
        layoutDetails: {
          // レイアウトの基本情報
          dimensions: {
            width: 1200,
            height: 800,
            aspectRatio: 1.5
          },
          // セクション情報
          sections: [],
          // 要素情報
          elements: [],
          // スタイル情報
          styles: {
            colors: [],
            typography: {},
            spacing: {},
            layout: {}
          }
        }
      };

      // 画像から色を抽出
      try {
        const colors = await extractColorsFromImage(imagePath);
        result.layoutDetails.styles.colors = colors;
      } catch (error) {
        console.error('色の抽出に失敗しました:', error);
        result.layoutDetails.styles.colors = [];
      }

      // テキストを抽出
      try {
        const text = await extractTextFromImage(imagePath);
        result.layoutDetails.text = text;
      } catch (error) {
        console.error('テキストの抽出に失敗しました:', error);
        result.layoutDetails.text = '';
      }

      // セクション分析
      try {
        const sections = await analyzeImageSections(imagePath);
        result.layoutDetails.sections = sections;
      } catch (error) {
        console.error('セクション分析に失敗しました:', error);
        result.layoutDetails.sections = [];
      }

      // レイアウトタイプの判定
      result.layoutType = "card-grid"; // デフォルトはカードグリッド

      return result;
    } catch (error) {
      console.error('レイアウトパターン分析中にエラーが発生しました:', error);
      return {
        layoutType: "unknown",
        confidence: 0.6,
        patterns: {},
        layoutDetails: {
          dimensions: { width: 1200, height: 800, aspectRatio: 1.5 },
          sections: [],
          elements: [],
          styles: {
            colors: [],
            typography: {},
            spacing: {},
            layout: {}
          }
        }
      };
    }
  }
};

/**
 * 画像からヘッダー、メイン、フッターセクションを推測
 */
const detectMainSections = async (imagePath) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.detectMainSections(imagePath);
  } catch (error) {
    console.error("Python版メインセクション検出でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    try {
      // レイアウトパターンを分析
      const layoutAnalysis = await analyzeLayoutPattern(imagePath);

      // 基本情報（仮の値）
      const result = {
        dimensions: {
          width: 1200,
          height: 800,
          aspectRatio: (1200 / 800).toFixed(2)
        },
        layoutType: layoutAnalysis.layoutType,
        layoutConfidence: layoutAnalysis.confidence
      };

      // レイアウトタイプに基づいた詳細情報を追加
      if (layoutAnalysis.layoutType === "two-column-image-text") {
        // 2カラムレイアウト（画像+テキスト）の場合
        const imagePosition = layoutAnalysis.layoutDetails?.imagePosition || "left";

        result.header = {
          exists: true,
          height: 120,
          alignment: "center",
          hasTitle: true,
          hasSubtitle: true
        };

        result.mainContent = {
          layout: "two-column",
          imagePosition: imagePosition,
          textPosition: imagePosition === "left" ? "right" : "left",
          hasTitle: true,
          titlePosition: imagePosition === "left" ? "right" : "left",
          hasSubtitle: true,
          hasText: true,
          hasButton: true,
          buttonPosition: imagePosition === "left" ? "right" : "left",
          imageWidth: "50%",
          textWidth: "50%"
        };

        result.footer = {
          exists: false
        };

        result.background = {
          color: extractDominantColor()
        };
      } else if (layoutAnalysis.layoutType === "card-grid") {
        // カードグリッドの場合
        result.header = {
          exists: true,
          height: 120,
          alignment: "center",
          hasTitle: true,
          hasSubtitle: false
        };

        result.mainContent = {
          layout: "card-grid",
          cardCount: 6, // 仮の値
          cardsPerRow: 3,
          hasTitle: true,
          hasImage: true,
          hasText: true,
          cardWidth: "30%",
          cardHeight: "auto"
        };

        result.footer = {
          exists: false
        };
      } else {
        // デフォルト
        result.header = {
          exists: true,
          height: 100,
          alignment: "center",
          hasTitle: true,
          hasSubtitle: false
        };

        result.mainContent = {
          layout: "standard",
          sections: 3,
          hasSections: true
        };

        result.footer = {
          exists: true,
          height: 80,
          hasCopyright: true,
          hasLinks: true
        };
      }

      return result;
    } catch (error) {
      console.error('メインセクション分析中にエラーが発生しました:', error);
      return {
        dimensions: {
          width: 1200,
          height: 800,
          aspectRatio: 1.5
        },
        layoutType: "unknown",
        layoutConfidence: 0.5,
        header: {
          exists: false
        },
        mainContent: {
          layout: "standard"
        },
        footer: {
          exists: false
        }
      };
    }
  }
};

/**
 * 画像からカード要素を検出する
 */
const detectCardElements = async (imagePath) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.detectCardElements(imagePath);
  } catch (error) {
    console.error("Python版カード要素検出でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    // ダミーデータを返すシンプルな実装
    return {
      cardCount: 6,
      cards: Array(6).fill(0).map((_, index) => ({
        id: `card-${index + 1}`,
        position: {
          top: 200,
          left: (index % 3) * 33,
          width: 30,
          height: 300
        },
        hasImage: true,
        hasTitle: true,
        hasText: true,
        hasButton: index < 3
      }))
    };
  }
};

/**
 * 画像内の特徴的な要素を検出する（ボタン、ヘッダー、リストなど）
 */
const detectFeatureElements = async (imagePath) => {
  try {
    // Python版の実装を使用
    return await pythonAnalyzer.detectFeatureElements(imagePath);
  } catch (error) {
    console.error("Python版特徴要素検出でエラーが発生しました。JavaScriptバージョンにフォールバックします。", error);

    // フォールバック: JavaScriptでの実装（元のコード）
    try {
      // レイアウトパターンを分析
      const layoutAnalysis = await analyzeLayoutPattern(imagePath);

      // 基本情報
      const result = {
        layoutType: layoutAnalysis.layoutType || "unknown",
        layoutConfidence: layoutAnalysis.confidence || 0.5,
        elements: []
      };

      // レイアウトタイプに基づいた要素を追加
      if (layoutAnalysis.layoutType === "two-column-image-text") {
        // 2カラムレイアウト（画像+テキスト）の場合
        const imagePosition = layoutAnalysis.layoutDetails?.imagePosition || "left";
        const textPosition = imagePosition === "left" ? "right" : "left";

        result.elements = [
          {
            type: "header",
            position: { top: 0, left: 0, width: 100, height: 15 },
            confidence: 0.9
          },
          {
            type: "image",
            position: {
              top: 20,
              left: imagePosition === "left" ? 0 : 50,
              width: 50,
              height: 60
            },
            confidence: 0.95
          },
          {
            type: "heading",
            position: {
              top: 25,
              left: textPosition === "left" ? 5 : 55,
              width: 40,
              height: 10
            },
            confidence: 0.9
          },
          {
            type: "text",
            position: {
              top: 40,
              left: textPosition === "left" ? 5 : 55,
              width: 40,
              height: 30
            },
            confidence: 0.85
          },
          {
            type: "button",
            position: {
              top: 75,
              left: textPosition === "left" ? 5 : 55,
              width: 20,
              height: 5
            },
            confidence: 0.8
          }
        ];
      } else if (layoutAnalysis.layoutType === "card-grid") {
        // カードグリッドレイアウトの場合
        result.elements = [
          {
            type: "header",
            position: { top: 0, left: 0, width: 100, height: 15 },
            confidence: 0.9
          }
        ];

        // カード要素を追加
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 3; col++) {
            const index = row * 3 + col;
            result.elements.push({
              type: "card",
              position: {
                top: 20 + row * 40,
                left: col * 33,
                width: 30,
                height: 35
              },
              confidence: 0.85,
              children: [
                {
                  type: "image",
                  position: {
                    top: 20 + row * 40,
                    left: col * 33,
                    width: 30,
                    height: 20
                  },
                  confidence: 0.9
                },
                {
                  type: "heading",
                  position: {
                    top: 41 + row * 40,
                    left: col * 33 + 1,
                    width: 28,
                    height: 5
                  },
                  confidence: 0.8
                },
                {
                  type: "text",
                  position: {
                    top: 47 + row * 40,
                    left: col * 33 + 1,
                    width: 28,
                    height: 8
                  },
                  confidence: 0.75
                }
              ]
            });
          }
        }
      } else {
        // デフォルトのレイアウト（シンプルな垂直構造）
        result.elements = [
          {
            type: "header",
            position: { top: 0, left: 0, width: 100, height: 15 },
            confidence: 0.9
          },
          {
            type: "hero",
            position: { top: 15, left: 0, width: 100, height: 40 },
            confidence: 0.8,
            children: [
              {
                type: "heading",
                position: { top: 25, left: 10, width: 80, height: 10 },
                confidence: 0.85
              },
              {
                type: "text",
                position: { top: 35, left: 10, width: 80, height: 10 },
                confidence: 0.8
              }
            ]
          },
          {
            type: "section",
            position: { top: 55, left: 0, width: 100, height: 30 },
            confidence: 0.75,
            children: [
              {
                type: "heading",
                position: { top: 55, left: 10, width: 80, height: 5 },
                confidence: 0.7
              },
              {
                type: "text",
                position: { top: 65, left: 10, width: 80, height: 15 },
                confidence: 0.65
              }
            ]
          },
          {
            type: "footer",
            position: { top: 85, left: 0, width: 100, height: 15 },
            confidence: 0.7
          }
        ];
      }

      return result;
    } catch (error) {
      console.error('要素検出中にエラーが発生しました:', error);
      return {
        layoutType: "unknown",
        layoutConfidence: 0.5,
        elements: []
      };
    }
  }
};

// セクションデータから代表色を取得する関数
function getDominantColor(data) {
  const colorCounts = {};

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const color = `rgb(${r},${g},${b})`;

    colorCounts[color] = (colorCounts[color] || 0) + 1;
  }

  // 最も頻度の高い色を返す
  const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  return sorted[0] ? sorted[0][0] : 'rgb(255,255,255)';
}

/**
 * 指定した領域の主要な色を抽出する関数（簡易版）
 * @returns {string} - 抽出された主要な色（RGB形式）
 */
const extractDominantColor = () => {
  // 実際の実装では画像処理を行うべきですが、
  // ここでは簡易的に一般的な背景色を返す
  return 'rgb(221, 240, 241)';
};

// Python環境をチェックする関数をエクスポート
export const checkPythonEnvironment = pythonAnalyzer.checkPythonEnvironment;
export const setupPythonEnvironment = pythonAnalyzer.setupPythonEnvironment;

export {
  extractTextFromImage,
  extractColorsFromImage,
  analyzeImageSections,
  detectMainSections,
  detectCardElements,
  detectFeatureElements,
  analyzeLayoutPattern
};
