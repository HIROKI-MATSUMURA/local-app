import React, { useState, useEffect, useRef } from "react";
import { Controlled as CodeMirror } from 'react-codemirror2';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/css/css';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/xml-fold';
import CodeDisplay from "./CodeDisplay";
import CodeGenerationSettings from "./CodeGenerationSettings";
import { generatePrompt } from "../utils/promptGenerator";
import { extractTextFromImage, extractColorsFromImage } from "../utils/imageAnalyzer.js";
import "../styles/AICodeGenerator.scss";
import 'highlight.js/styles/github.css';
import Header from './Header';

const LOCAL_STORAGE_KEY = "ai_code_generator_state";

// SCSSのネスト構造を平坦化する関数
const flattenSCSS = (scss) => {
  if (!scss) return scss;

  // 結果を格納する配列
  const lines = scss.split('\n');
  const result = [];

  // 現在の親セレクタとインデントレベルを追跡
  let parentSelector = null;
  let currentIndent = 0;
  let inComment = false;
  let inMediaQuery = false;
  let mediaQueryBlock = '';
  let mediaQueryIndent = 0;

  // 各行を処理
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // コメント処理
    if (trimmedLine.startsWith('/*')) inComment = true;
    if (trimmedLine.endsWith('*/')) {
      inComment = false;
      result.push(line);
      continue;
    }
    if (inComment) {
      result.push(line);
      continue;
    }

    // 空行の場合はそのまま追加
    if (trimmedLine === '') {
      result.push('');
      continue;
    }

    // インデントレベルを計算
    const indentMatch = line.match(/^(\s+)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // メディアクエリ処理
    if (trimmedLine.startsWith('@include mq(') && !inMediaQuery) {
      inMediaQuery = true;
      mediaQueryBlock = line;
      mediaQueryIndent = indent;
      continue;
    }

    if (inMediaQuery) {
      mediaQueryBlock += '\n' + line;
      if (trimmedLine === '}') {
        inMediaQuery = false;
        result.push(mediaQueryBlock);
        mediaQueryBlock = '';
      }
      continue;
    }

    // セレクタ行の検出
    if (trimmedLine.includes('{') && !trimmedLine.includes('}')) {
      // インデントレベルが下がった場合、親セレクタをリセット
      if (indent <= currentIndent) {
        parentSelector = null;
      }

      // 親セレクタを記録
      parentSelector = trimmedLine.split('{')[0].trim();
      currentIndent = indent;
      result.push(line);
    }
    // ネストされたセレクタの検出 (&__)
    else if (trimmedLine.startsWith('&') && parentSelector) {
      const nestedPart = trimmedLine.split('{')[0].trim();
      // &__title { のようなパターンを.parent__titleに変換
      if (nestedPart.startsWith('&__')) {
        const newSelector = `${parentSelector}${nestedPart.substring(1)} {`;
        // インデントを親と同じレベルに調整
        const spaces = ' '.repeat(currentIndent);
        result.push(`${spaces}${newSelector}`);
      }
      // &:hover { のようなパターンを.parent:hoverに変換
      else if (nestedPart.startsWith('&:')) {
        const newSelector = `${parentSelector}${nestedPart.substring(1)} {`;
        const spaces = ' '.repeat(currentIndent);
        result.push(`${spaces}${newSelector}`);
      }
    }
    // 通常の行はそのまま追加
    else {
      result.push(line);
    }
  }

  return result.join('\n');
};

// pxをremに変換する関数
const convertPxToRem = (scss) => {
  if (!scss) return scss;

  // base font-size: 16px
  const ROOT_FONT_SIZE = 16;

  // 行ごとに処理
  const lines = scss.split('\n');
  const result = [];

  // メディアクエリ内かどうかのフラグ
  let inMediaQuery = false;

  for (const line of lines) {
    // メディアクエリの開始と終了を検出
    if (line.includes('@include mq(')) {
      inMediaQuery = true;
    }
    if (inMediaQuery && line.trim() === '}') {
      inMediaQuery = false;
    }

    // メディアクエリ内またはborderの1pxはそのまま残す
    if (inMediaQuery ||
      line.includes('border') && line.includes('1px') ||
      line.includes('box-shadow') && line.includes('px')) {
      result.push(line);
      continue;
    }

    // pxをremに変換（数値とpxの間にスペースがあってもマッチ）
    let processedLine = line;
    const pxRegex = /(\d*\.?\d+)\s*px/g;

    processedLine = processedLine.replace(pxRegex, (match, pixelValue) => {
      // 小数点第3位までの精度で変換
      const remValue = (parseFloat(pixelValue) / ROOT_FONT_SIZE).toFixed(3);
      // 末尾の0を削除（例：1.500rem → 1.5rem、1.000rem → 1rem）
      const trimmedRemValue = parseFloat(remValue);
      return `${trimmedRemValue}rem`;
    });

    result.push(processedLine);
  }

  return result.join('\n');
};

const AICodeGenerator = () => {
  const [generatedCode, setGeneratedCode] = useState("");
  const [generatedHTML, setGeneratedHTML] = useState("");
  const [generatedCSS, setGeneratedCSS] = useState("");
  const [loading, setLoading] = useState(false);
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
  const generatedCodeRef = useRef(null);

  // レスポンシブ設定
  const [responsiveMode, setResponsiveMode] = useState("sp");
  const [breakpoints, setBreakpoints] = useState([]);
  const [aiBreakpoints, setAiBreakpoints] = useState([]);

  // 画像解析結果
  const [pcColors, setPcColors] = useState([]);
  const [spColors, setSpColors] = useState([]);
  const [pcText, setPcText] = useState("");
  const [spText, setSpText] = useState("");
  const [pcLayout, setPcLayout] = useState([]);
  const [spLayout, setSpLayout] = useState([]);

  // 画像アップロード用
  const [pcImage, setPcImage] = useState(null);
  const [spImage, setSpImage] = useState(null);

  // 生成コード修正用のステート
  const [editingHTML, setEditingHTML] = useState("");
  const [editingCSS, setEditingCSS] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const previewRef = useRef(null);

  // プレビューサイズ変更用
  const [previewWidth, setPreviewWidth] = useState(375);
  const [isDragging, setIsDragging] = useState(false);
  const previewContainerRef = useRef(null);
  const [customSizeInput, setCustomSizeInput] = useState("");
  const [showCustomSizeInput, setShowCustomSizeInput] = useState(false);
  const [scaleRatio, setScaleRatio] = useState(1);

  // 再生成用の指示
  const [regenerateInstructions, setRegenerateInstructions] = useState("");

  // iframeの高さを制御する状態
  const [iframeHeight, setIframeHeight] = useState(400); // 初期値を400pxに設定

  // 初期化処理（ローカルストレージから設定を読み込む）
  useEffect(() => {
    const storedResponsiveMode = localStorage.getItem("responsiveMode") || "sp";
    const storedBreakpoints = JSON.parse(localStorage.getItem("breakpoints")) || [];
    setResponsiveMode(storedResponsiveMode);
    setBreakpoints(storedBreakpoints);
    // アクティブなブレークポイントのみを設定
    setAiBreakpoints(storedBreakpoints.filter((bp) => bp.active).map((bp) => ({ ...bp, aiActive: true })));
  }, []);


  const [pcImageBase64, setPcImageBase64] = useState(null);
  const [spImageBase64, setSpImageBase64] = useState(null);

  // コード生成後に編集モードを有効化
  useEffect(() => {
    if (generatedHTML && generatedCSS) {
      setEditingHTML(generatedHTML);
      setEditingCSS(generatedCSS);
    }
  }, [generatedHTML, generatedCSS]);

  // iframeのコンテンツの高さに基づいてiframeの高さを調整する関数
  const adjustIframeHeight = () => {
    try {
      if (previewRef.current) {
        const iframe = previewRef.current;
        const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;

        // プレビューコンテナ要素のサイズを取得
        const previewContainer = iframeDocument.querySelector('.preview-container');

        // 実際のコンテンツ領域のサイズを取得（余白込み）
        const bodyHeight = Math.max(
          iframeDocument.body.scrollHeight,
          iframeDocument.documentElement.scrollHeight,
          iframeDocument.body.offsetHeight,
          iframeDocument.documentElement.offsetHeight
        );

        // プレビューコンテナがある場合はその高さを優先、なければbodyの高さを使用
        const contentHeight = previewContainer
          ? previewContainer.offsetHeight + 40 // 余白分を追加
          : bodyHeight;

        // 高さに最小値を設定（400px以下にはならない）
        const newHeight = Math.max(contentHeight, 400);

        // 現在の高さと比較して異なる場合のみ更新（閾値：50px）
        if (Math.abs(newHeight - iframeHeight) > 50) {
          console.log(`iframeの高さを${iframeHeight}pxから${newHeight}pxに調整します（実際のコンテンツ高さ: ${contentHeight}px）`);
          setIframeHeight(newHeight);
        }
      }
    } catch (error) {
      console.error("iframeの高さ調整中にエラーが発生しました:", error);
    }
  };

  // コンテンツが変更された場合にiframeの高さを調整
  useEffect(() => {
    if (previewRef.current && editingHTML && editingCSS) {
      // 小さな遅延を入れてからiframeの高さを調整
      const adjustHeightWithDelay = () => {
        setTimeout(() => {
          adjustIframeHeight();
        }, 300); // 300ミリ秒後に高さを調整
      };

      // コンテンツが読み込まれた後に高さを調整
      const iframe = previewRef.current;
      iframe.onload = adjustHeightWithDelay;

      // 初回レンダリング後にも高さを調整
      adjustHeightWithDelay();

      // オブザーバーを設定して動的なコンテンツ変更を監視
      try {
        const iframeWindow = iframe.contentWindow;
        if (iframeWindow) {
          // リサイズイベントのリスナーを追加
          iframeWindow.addEventListener('resize', adjustHeightWithDelay);

          // MutationObserverを使用してDOMの変更を監視
          const iframeDocument = iframe.contentDocument || iframeWindow.document;
          const iframeContentObserver = new MutationObserver(() => {
            // 変更が検出されたら少し遅延させて高さを調整
            adjustHeightWithDelay();
          });

          iframeContentObserver.observe(iframeDocument.body, {
            childList: true,
            subtree: true,
            attributes: true
          });

          // 高さを更新する関数を定義
          const updateHeight = () => {
            adjustIframeHeight();
          };

          // 遅延して高さを更新する関数
          const debouncedUpdateHeight = () => {
            clearTimeout(window.resizeTimer);
            window.resizeTimer = setTimeout(updateHeight, 100);
          };

          // ページ読み込み完了時に実行
          window.addEventListener('load', function () {
            // すぐに一度実行
            updateHeight();
          });

          // リサイズイベント時も高さを更新
          window.addEventListener('resize', debouncedUpdateHeight);
        }
      } catch (error) {
        console.error("iframe観測設定中にエラーが発生しました:", error);
      }
    }
  }, [editingHTML, editingCSS, previewWidth]); // previewWidthも依存関係に追加

  // プレビュー更新
  useEffect(() => {
    if (previewRef.current && editingHTML && editingCSS) {
      try {
        // SCSSの@includeをCSSメディアクエリに変換する処理
        let processedCSS = editingCSS || '';

        // 抽出した色情報から変数の色を決定する
        // PC/SP画像から抽出した色を優先的に使用
        const extractedColors = pcColors.length > 0 ? pcColors : spColors;

        // デフォルトの色値
        const defaultColors = {
          '$primary-color': '#0D2936',
          '$secondary-color': '#DDF0F1',
          '$accent-color': '#408F95'
        };

        // ローカルストレージから保存されている色を読み込み
        const storedPrimaryColor = localStorage.getItem("primary-color");
        const storedSecondaryColor = localStorage.getItem("secondary-color");
        const storedAccentColor = localStorage.getItem("accent-color");

        // ローカルストレージの値があればデフォルト値を上書き
        const colorValues = { ...defaultColors };
        if (storedPrimaryColor) colorValues['$primary-color'] = storedPrimaryColor;
        if (storedSecondaryColor) colorValues['$secondary-color'] = storedSecondaryColor;
        if (storedAccentColor) colorValues['$accent-color'] = storedAccentColor;

        // 色が設定されていない場合のみ、抽出した色を使用
        if (extractedColors.length > 0 && (!storedPrimaryColor || !storedSecondaryColor || !storedAccentColor)) {
          // 明るい色を背景色（primary）に、濃い色をアクセント色に設定
          const sortedColors = [...extractedColors].sort((a, b) => {
            // 明度でソート（HSLに変換して比較）
            const getHSL = (hex) => {
              // 簡易的なRGB→HSL変換（明度のみで判断）
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              return (max + min) / 2; // 明度
            };
            return getHSL(b) - getHSL(a); // 明るい色が先頭に来るようにソート
          });

          // ローカルストレージに保存されていない色のみ、抽出した色で上書き
          if (!storedPrimaryColor && sortedColors.length > 0) {
            colorValues['$primary-color'] = sortedColors[0];
          }

          if (!storedSecondaryColor && sortedColors.length > 1) {
            colorValues['$secondary-color'] = sortedColors[Math.floor(sortedColors.length / 2)];
          }

          if (!storedAccentColor && sortedColors.length > 2) {
            colorValues['$accent-color'] = sortedColors[sortedColors.length - 1];
          }
        }

        // これらの色変数をプレビュー時に使用
        console.log("プレビューに使用する色変数:", colorValues);

        // SCSS変数を実際の色値に置換
        Object.entries(colorValues).forEach(([variable, value]) => {
          const regex = new RegExp(variable.replace('$', '\\$'), 'g');
          processedCSS = processedCSS.replace(regex, value);
        });

        // メディアクエリの変換処理
        if (breakpoints && breakpoints.length > 0) {
          // アクティブなブレークポイントのマップを作成
          const bpMap = {};
          breakpoints.forEach(bp => {
            if (bp.active) {
              bpMap[bp.name] = bp.value;
              console.log(`ブレークポイント "${bp.name}" (${bp.value}px) を使用します`);
            }
          });

          // メディアクエリのパターンを修正
          const processMediaQueries = (css) => {
            // セレクタとその中身を含むパターン
            const mqBlockPattern = /@include\s+mq\(([a-z]+)\)\s*{([^}]+)}/g;
            let processedCss = css;
            let match;

            while ((match = mqBlockPattern.exec(css)) !== null) {
              const [fullMatch, bpName, content] = match;
              // 設定されているブレークポイントのみを処理
              if (bpMap[bpName]) {
                const mediaQueryStart = responsiveMode === "sp"
                  ? `@media (min-width: ${bpMap[bpName]}px)`
                  : `@media (max-width: ${bpMap[bpName]}px)`;

                // セレクタと中身を抽出
                const contentLines = content.trim().split('\n');
                const processedContent = contentLines
                  .map(line => line.trim())
                  .filter(line => line)
                  .join('\n  ');

                const replacement = `${mediaQueryStart} {\n  ${processedContent}\n}`;
                processedCss = processedCss.replace(fullMatch, replacement);

                console.log(`メディアクエリを変換: ${bpName} → ${mediaQueryStart}`);
              } else {
                // 未設定のブレークポイントは削除
                processedCss = processedCss.replace(fullMatch, '');
                console.warn(`未設定のブレークポイント "${bpName}" をスキップします`);
              }
            }

            return processedCss;
          };

          // メディアクエリの変換を適用
          processedCSS = processMediaQueries(processedCSS);
          console.log("メディアクエリの変換が完了しました");
        }

        // デフォルトのスタイル（プレビュー用）
        let baseCSS = `
          body {
            margin: 0;
            padding: 0;
            font-family: "Noto Sans JP", sans-serif;
            width: 100%;
            min-height: 100vh;
            overflow-x: hidden;
          }
          img[src^="path-to-"] {
            background-color: #ccc;
            min-height: 100px;
            max-width: 100%;
            object-fit: cover;
          }
          /* 横幅100%のコンポーネントがiframeの外にはみ出さないようにするため */
          .c-information {
            box-sizing: border-box;
            max-width: 100%;
          }
        `;

        // より確実なレンダリングのため、DOCTYPE宣言を追加
        const doc = previewRef.current.contentDocument;
        doc.open();

        // テンプレートリテラル内のスクリプトでの変数名の衝突を避けるため
        const scriptContent = `
          // 親ウィンドウに高さを通知するシンプルなスクリプト
          function updateHeight() {
            // コンテンツの高さを計算
            const previewContainer = document.querySelector('.preview-container');

            let contentHeight;
            if (previewContainer) {
              contentHeight = previewContainer.getBoundingClientRect().height;
            } else {
              contentHeight = Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.offsetHeight
              );
            }

            // 余裕を持たせる
            const heightWithMargin = Math.ceil(contentHeight) + 20;

            // 親ウィンドウに通知
            if (window.parent) {
              window.parent.postMessage({
                type: 'resize',
                height: heightWithMargin
              }, '*');
            }
          }

          // 画像の読み込み完了時に高さを更新
          window.addEventListener('load', function() {
            // 初期実行
            updateHeight();

            // 少し遅延して再実行（CSS適用後）
            setTimeout(updateHeight, 300);

            // 画像の読み込み完了時にも高さを更新
            document.querySelectorAll('img').forEach(img => {
              if (!img.complete) {
                img.addEventListener('load', updateHeight);
              }
            });
          });

          // リサイズ時に高さを更新
          window.addEventListener('resize', function() {
            clearTimeout(window.resizeTimer);
            window.resizeTimer = setTimeout(updateHeight, 100);
          });
        `;

        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                ${baseCSS}
                ${processedCSS}
                /* レスポンシブ表示のためのコンテナスタイル */
                .preview-container {
                  width: 100%;
                  max-width: ${previewWidth}px;
                  margin: 0 auto;
                  box-sizing: border-box;
                }
                /* すべての画像にブロック表示を適用 */
                img {
                  display: block;
                  max-width: 100%;
                }
              </style>
              <script>
                ${scriptContent}
              </script>
            </head>
            <body>
              <div class="preview-container">
                ${editingHTML}
              </div>
            </body>
          </html>
        `);
        doc.close();
      } catch (error) {
        console.error("プレビュー更新エラー:", error);
      }
    }
  }, [editingHTML, editingCSS, breakpoints, previewWidth, responsiveMode, pcColors, spColors]);

  // スケールの計算
  const calculateScale = () => {
    if (previewContainerRef.current && previewWidth > 1000) {
      // パディングとボーダーを考慮して、より正確な幅を計算
      const containerWidth = previewContainerRef.current.clientWidth - 40; // パディングとマージンを考慮
      const scale = Math.min(1, containerWidth / previewWidth);
      setScaleRatio(scale);
    } else {
      setScaleRatio(1);
    }
  };

  // ウィンドウサイズが変わった時にスケールを再計算
  useEffect(() => {
    calculateScale();
    const handleResize = () => {
      calculateScale();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [previewWidth]);

  // プレビュー幅が変わった時にスケールを更新
  useEffect(() => {
    calculateScale();
  }, [previewWidth]);

  // ドラッグ処理の開始
  const handleDragStart = (e) => {
    e.preventDefault();
    setIsDragging(true);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
  };

  // ドラッグ中の処理
  const handleDrag = (e) => {
    if (!isDragging) return;

    // マウス位置からプレビュー幅を計算
    // プレビューコンテナの左端からの相対位置を計算
    if (previewContainerRef.current) {
      const containerRect = previewContainerRef.current.getBoundingClientRect();
      const newWidth = Math.max(320, Math.min(e.clientX - containerRect.left, containerRect.width));
      setPreviewWidth(newWidth);
    }
  };

  // ドラッグ終了処理
  const handleDragEnd = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', handleDragEnd);
  };

  // プレビューサイズのリセット
  const resetPreviewSize = (size) => {
    setPreviewWidth(size);
    setShowCustomSizeInput(false);
  };

  // カスタムサイズの適用
  const applyCustomSize = () => {
    const size = parseInt(customSizeInput, 10);
    if (!isNaN(size) && size >= 320 && size <= 2560) {
      setPreviewWidth(size);
      setShowCustomSizeInput(false);
    } else {
      alert("320px〜2560pxの間で入力してください。");
    }
  };

  // カスタムサイズ入力フォームの表示
  const showCustomSizeForm = () => {
    setShowCustomSizeInput(true);
    setCustomSizeInput(previewWidth.toString());
  };

  // 画像のリサイズと最適化処理
  const resizeImage = (base64Image, maxWidth) => {
    return new Promise((resolve, reject) => {
      try {
        // 画像のメディアタイプを保持
        const mediaTypeMatch = base64Image.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');

          // 画像のアスペクト比を維持したまま、指定した幅に合わせる
          const aspectRatio = img.width / img.height;
          const newWidth = Math.min(img.width, maxWidth);
          const newHeight = newWidth / aspectRatio;

          canvas.width = newWidth;
          canvas.height = newHeight;

          const ctx = canvas.getContext('2d');

          // 透過背景がある場合（PNGなど）は白背景を適用
          if (mediaType === 'image/png' || mediaType === 'image/webp') {
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, newWidth, newHeight);
          }

          // 画像を描画
          ctx.drawImage(img, 0, 0, newWidth, newHeight);

          // 元のメディアタイプを維持して出力
          const newBase64 = canvas.toDataURL(mediaType, 0.92);
          console.log(`画像をリサイズしました: ${newWidth}x${newHeight}px, 形式: ${mediaType}`);
          resolve(newBase64);
        };

        img.onerror = (err) => {
          console.error('画像の読み込みエラー:', err);
          reject(err);
        };

        img.src = base64Image;
      } catch (err) {
        console.error('リサイズエラー:', err);
        reject(err);
      }
    });
  };

  // 画像処理用のヘルパー関数
  const processImage = (base64Image) => {
    return new Promise((resolve, reject) => {
      try {
        // メディアタイプを検出
        const mediaTypeMatch = base64Image.match(/^data:([^;]+);base64,/);
        if (!mediaTypeMatch) {
          console.log('画像形式が不明なため、JPEG形式として処理します');
          // 形式不明の場合はJPEGに変換
          return convertToJpeg(base64Image).then(resolve).catch(reject);
        }

        const mediaType = mediaTypeMatch[1];
        console.log(`検出された画像形式: ${mediaType}`);

        // Claude APIがサポートするメディアタイプかチェック
        if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
          console.log(`${mediaType}形式はClaudeがサポートするので、そのまま使用します`);
          resolve({
            base64: base64Image,
            mediaType: mediaType
          });
        } else {
          console.log(`${mediaType}形式はサポートされていないため、JPEG形式に変換します`);
          // サポートされていないフォーマットはJPEGに変換
          convertToJpeg(base64Image).then(jpegBase64 => {
            resolve({
              base64: jpegBase64,
              mediaType: 'image/jpeg'
            });
          }).catch(reject);
        }
      } catch (err) {
        console.error('画像処理エラー:', err);
        reject(err);
      }
    });
  };

  // 非対応形式の画像をJPEG形式に変換
  const convertToJpeg = (base64Image) => {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext('2d');
          // 白背景を適用（透過PNG対策）
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, img.width, img.height);
          // 画像を描画
          ctx.drawImage(img, 0, 0);

          // JPEG形式で出力
          const jpegBase64 = canvas.toDataURL('image/jpeg', 0.95);
          console.log(`画像をJPEG形式に変換しました: ${img.width}x${img.height}px`);
          resolve(jpegBase64);
        };

        img.onerror = (err) => {
          console.error('画像変換エラー:', err);
          reject(err);
        };

        img.src = base64Image;
      } catch (err) {
        console.error('画像変換エラー:', err);
        reject(err);
      }
    });
  };

  // 画像アップロード時の処理
  const handleImageUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    console.log(`画像アップロード開始: ${file.name}, タイプ: ${type}, サイズ: ${Math.round(file.size / 1024)}KB`);

    try {
      // FileReaderを使用してデータURLを作成
      const reader = new FileReader();

      reader.onload = async (event) => {
        const dataUrl = event.target.result;
        console.log(`画像をデータURLに変換しました: ${dataUrl.substring(0, 50)}...`);

        // プレビュー用の状態を更新
        if (type === "pc") {
          console.log("PC画像プレビューを設定中...");
          setPcImage({
            fileName: file.name,
            preview: dataUrl,
            mimeType: file.type
          });
        } else {
          console.log("SP画像プレビューを設定中...");
          setSpImage({
            fileName: file.name,
            preview: dataUrl,
            mimeType: file.type
          });
        }

        try {
          // 画像を処理
          const processedImage = await processImage(dataUrl);
          console.log(`画像処理が完了しました: メディアタイプ=${processedImage.mediaType}`);

          if (type === "pc") {
            setPcImageBase64(processedImage.base64);
            console.log("PC画像のBase64データを設定しました");

            // 色抽出処理
            try {
              const colors = await extractColorsFromImage(processedImage.base64);
              setPcColors(colors);
              console.log(`PC画像の色を抽出しました: ${colors.length}色`);
            } catch (error) {
              console.error("PC画像の色抽出エラー:", error);
            }
          } else {
            setSpImageBase64(processedImage.base64);
            console.log("SP画像のBase64データを設定しました");

            // 色抽出処理
            try {
              const colors = await extractColorsFromImage(processedImage.base64);
              setSpColors(colors);
              console.log(`SP画像の色を抽出しました: ${colors.length}色`);
            } catch (error) {
              console.error("SP画像の色抽出エラー:", error);
            }
          }

          console.log(`画像の処理が完了しました（${type}）`);
        } catch (error) {
          console.error("画像処理エラー:", error);
          alert(`画像の処理中にエラーが発生しました: ${error.message}`);
        }
      };

      reader.onerror = (error) => {
        console.error("FileReader エラー:", error);
        alert(`画像の読み込み中にエラーが発生しました`);
      };

      console.log("FileReaderでDataURLとして読み込み開始...");
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("画像処理中にエラーが発生しました:", error);
      alert(`画像の処理中にエラーが発生しました: ${error.message}`);
    }
  };

  // 編集したコードを反映
  const handleUpdateCode = () => {
    // SCSSのネスト構造を検出した場合は自動的に平坦化
    const processedCss = flattenSCSS(editingCSS);

    // pxをremに変換
    const remCss = convertPxToRem(processedCss);

    // 処理済みのCSSが元のものと異なる場合はユーザーに通知
    let message = '';
    if (processedCss !== editingCSS) {
      console.log("ネストされたSCSS構造を平坦化しました");
      message += "SCSSのネスト構造を検出したため、自動的に平坦化しました。FLOCSSに沿った構造に変換されています。\n";
    }

    if (remCss !== processedCss) {
      console.log("pxの単位をremに変換しました");
      message += "pxの単位を検出したため、自動的にremに変換しました（基準: 16px = 1rem）。\n";
    }

    if (message) {
      alert(message);
    }

    setGeneratedHTML(editingHTML);
    setGeneratedCSS(remCss);
    setEditingCSS(remCss);
  };

  // 再生成処理
  const handleRegenerate = async () => {
    if (loading) return;
    if (!regenerateInstructions.trim()) {
      alert("再生成の指示を入力してください");
      return;
    }

    setLoading(true);

    try {
      // API設定コンポーネントから保存されたAPIキーを取得
      const apiKey = localStorage.getItem("aiCodeGeneratorAPIKey");

      if (!apiKey) {
        alert("API設定から APIキーを設定してください。");
        setLoading(false);
        return;
      }

      console.log("再生成開始", regenerateInstructions);

      const regeneratePrompt = `
Modify the HTML and CSS below based on the instructions while maintaining the original structure.
Keep the original layout, element placement, and class names as much as possible.

Modification: ${regenerateInstructions}

HTML (maintain this structure and elements):
\`\`\`html
${editingHTML}
\`\`\`

SCSS (maintain this style structure):
\`\`\`scss
${editingCSS}
\`\`\`

## Guidelines:
1. Maintain original HTML elements and class names
2. Maintain original CSS selectors and basic structure
3. Don't add new elements or classes unless specified
4. Only change what's requested, keep everything else the same
5. Apply display: block; to all image (img) elements
6. Wrap inline elements like anchor tags (a) with div tags
7. Use single class names for component elements (buttons, etc.) and avoid multiple class combinations

## SCSS Rules:
- **❌ NO NESTING IN SCSS! ❌** - Critical requirement
- **⚠️ WARNING: No nested selectors using & operator**
- **✅ ONLY exception: @include mq() media queries**

### Correct SCSS structure (follow this):

\`\`\`scss
/* Correct: Each selector written individually */
.c-card {
  background-color: white;
  padding: 20px;
}

.c-card__title {
  font-size: 1.25rem;
  color: $primary-color;
}

.c-card__content {
  font-size: 1rem;
}

.c-card:hover {
  background-color: #f9f9f9;
}
\`\`\`

### Incorrect SCSS structure (avoid):

\`\`\`scss
/* Incorrect: Using & operator for nesting */
.c-card {
  background-color: white;

  &__title {  /* Never do this! */
    font-size: 1.25rem;
  }

  &__content {  /* Never do this! */
    font-size: 1rem;
  }

  &:hover {  /* Never do this! */
    background-color: #f9f9f9;
  }
}
\`\`\`

Include both HTML and SCSS parts in your response.
Output in \`\`\`html\` and \`\`\`scss\` format.
Always use flat SCSS structure without nesting.
`;

      console.log("window.api:", window.api ? "存在します" : "存在しません");
      console.log("generateCode関数を呼び出し中...");

      // electron APIを使用して再生成する
      const result = await window.api.generateCode({
        prompt: regeneratePrompt,
        uploadedImage: null // 再生成時は画像不要
      });

      if (!result || !result.generatedCode) {
        throw new Error("コード再生成に失敗しました");
      }

      const generatedCode = result.generatedCode;
      console.log("再生成されたコード:", generatedCode.substring(0, 100) + "...");

      // より柔軟なHTML抽出パターン - <html>タグが含まれていない場合も考慮
      let htmlMatch = generatedCode.match(/<html>[\s\S]*?<\/html>/i);
      if (!htmlMatch) {
        // <html>タグがない場合、```htmlと```の間のコードを抽出
        htmlMatch = generatedCode.match(/```html\s*([\s\S]*?)\s*```/);
        if (htmlMatch) {
          htmlMatch[0] = htmlMatch[1]; // グループマッチした内容を使用
        }
      }

      // より柔軟なCSS抽出パターン
      let cssMatch = generatedCode.match(/<style>[\s\S]*?<\/style>/i);
      if (!cssMatch) {
        // <style>タグがない場合、```cssと```の間のコードを抽出
        cssMatch = generatedCode.match(/```scss\s*([\s\S]*?)\s*```/);
        if (!cssMatch) {
          cssMatch = generatedCode.match(/```css\s*([\s\S]*?)\s*```/);
        }
        if (cssMatch) {
          cssMatch[0] = cssMatch[1]; // グループマッチした内容を使用
        }
      }

      // 抽出結果をログに出力
      console.log("再生成で抽出された HTML:", htmlMatch ? htmlMatch[0] : "なし");
      console.log("再生成で抽出された CSS:", cssMatch ? cssMatch[0] : "なし");

      // 編集フォームの内容を更新
      if (htmlMatch) {
        const htmlContent = htmlMatch[0];
        console.log("新しいHTMLを設定:", htmlContent.substring(0, 50) + "...");
        setEditingHTML(htmlContent);
        setGeneratedHTML(htmlContent); // 表示用の状態も同時に更新
      }

      if (cssMatch) {
        const cssContent = cssMatch[0].includes("<style>")
          ? cssMatch[0].replace(/<\/?style>/g, "")
          : cssMatch[0];
        console.log("新しいCSSを設定:", cssContent.substring(0, 50) + "...");
        // SCSSのネスト構造を検出してフラット化
        const flattenedCSS = flattenSCSS(cssContent);

        // ネスト構造が検出されたかどうかチェック
        if (flattenedCSS !== cssContent) {
          console.warn("AIが生成したSCSSにネスト構造が含まれています。自動的にフラット構造に変換しました。");
          // 次回のAI生成時の参考情報として表示
          alert("AIが生成したSCSSにネスト構造が含まれていました。\n自動的にフラット構造に変換しましたが、プロンプトを強化して再生成することをお勧めします。");
        }

        // pxをremに変換
        const remCSS = convertPxToRem(flattenedCSS);
        setEditingCSS(remCSS);
        setGeneratedCSS(remCSS); // 表示用の状態も同時に更新
      }

      // 再生成完了メッセージ
      console.log("コードの再生成が完了し、編集・表示タブ両方のコードを更新しました");

      // 編集タブに切り替え - ユーザーがすぐに編集できるようにする
      setIsEditing(true);

      // 指示をクリア
      setRegenerateInstructions("");

      // 生成されたコードをステートに設定
      setGeneratedCode(generatedCode);
      setGeneratedHTML(htmlMatch ? htmlMatch[0] : editingHTML);
      setGeneratedCSS(cssMatch ? convertPxToRem(flattenSCSS(cssMatch[0].includes("<style>") ? cssMatch[0].replace(/<\/?style>/g, "") : cssMatch[0])) : editingCSS);
      setShowGeneratedCode(true);

      // 画面を生成されたコードセクションまでスクロール
      setTimeout(() => {
        if (generatedCodeRef.current) {
          generatedCodeRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
          console.log("再生成後、コードセクションまでスクロールしました");
        }
      }, 500);

    } catch (error) {
      console.error("再生成エラー:", error);
      alert(`エラーが発生しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    // API設定コンポーネントから保存されたAPIキーを取得
    const apiKey = localStorage.getItem("aiCodeGeneratorAPIKey");

    if (!apiKey) {
      alert("API設定から APIキーを設定してください。");
      return;
    }

    if (!pcImageBase64 && !spImageBase64) {
      // 画像なしでテスト実行するかどうか確認
      if (confirm("画像がアップロードされていません。テキストのみでコード生成を試みますか？")) {
        console.log("画像なしでコード生成を試行します");
      } else {
        alert("画像をアップロードしてください。");
        return;
      }
    }

    setLoading(true);

    try {
      console.log("コード生成ボタンがクリックされました");

      let prompt;
      try {
        // プロンプト生成を別のtry-catchで囲む
        prompt = await generatePrompt({
          responsiveMode,
          aiBreakpoints,
          pcImageBase64,
          spImageBase64,
        });
        console.log("プロンプト生成成功");
      } catch (promptError) {
        console.error("プロンプト生成でエラーが発生:", promptError);
        // エラー時はデフォルトのプロンプトを使用
        prompt = `
Generate HTML and SCSS code based on the image.
Code only what is visible in the image without adding invisible elements or making assumptions.
Create HTML and CSS that accurately reflect the design shown in the image.

Follow these coding guidelines:
1. Apply display: block; to all image (img) elements
2. Wrap inline elements like anchor tags (a) with div tags
3. Use single class names for component elements (buttons, etc.) and avoid multiple class combinations
4. Write SCSS with flat structure, no nesting (except media queries)

Create a diving information website section with:

- "Information" title
- "ダイビング情報" Japanese subtitle
- Image of coral reef with yellow tropical fish
- "ライセンス講習" section heading
- Description of PADI diving license (C-card)
- "View more" button
- Light blue background

Provide code in \`\`\`html\` and \`\`\`scss\` format.
`;
      }

      console.log("生成されたプロンプト:", prompt.substring(0, 100) + "...");

      // 空のプロンプトを送らないようチェック
      if (!prompt || prompt.trim() === "") {
        console.error("エラー: 送信するプロンプトが空です");
        alert("プロンプトが空のため、コードを生成できません。");
        setLoading(false);
        return;
      }

      // 画像データの処理
      const imageToUse = pcImageBase64 || spImageBase64;
      let uploadedImage = null;

      if (imageToUse) {
        const imageInfo = pcImageBase64
          ? { fileName: pcImage?.fileName || "image.jpg", preview: pcImage?.preview, mimeType: pcImage?.mimeType || 'image/jpeg' }
          : { fileName: spImage?.fileName || "image.jpg", preview: spImage?.preview, mimeType: spImage?.mimeType || 'image/jpeg' };

        // 画像サイズの確認と調整
        let processedImageData = imageToUse;

        try {
          // 画像データの最適化
          console.log("画像の前処理を実行します");

          // 画像のメディアタイプを確認
          const mediaTypeMatch = processedImageData.match(/^data:([^;]+);base64,/);
          const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : imageInfo.mimeType;

          console.log(`画像のメディアタイプ: ${mediaType}`);

          // サイズが大きい場合はリサイズ（メディアタイプを保持）
          if (processedImageData && processedImageData.length > 10000000) { // 10MB以上なら
            console.log("画像サイズが大きいため、画像を最適化します（元サイズ: " + processedImageData.length + " bytes）");
            processedImageData = await resizeImage(processedImageData, 1200); // 最大幅1200pxに縮小
            console.log("画像を最適化しました（新サイズ: " + processedImageData.length + " bytes）");
          }

          // 画像データの準備
          uploadedImage = {
            name: imageInfo.fileName,
            path: imageInfo.preview,
            data: processedImageData,
            mimeType: mediaType // メディアタイプをそのまま保持
          };

          console.log("画像情報を送信:", uploadedImage.name);
          console.log("画像データサイズ:", uploadedImage.data ? uploadedImage.data.length + " bytes" : "データなし");
          console.log("画像メディアタイプ:", uploadedImage.mimeType);
        } catch (imgErr) {
          console.error("画像最適化エラー:", imgErr);
          alert(`画像の処理中にエラーが発生しました: ${imgErr.message}\nテキストのみでコード生成を続行します。`);
          // エラーが発生しても処理を続行（画像なしで）
          uploadedImage = null;
        }
      }

      console.log("window.api:", window.api ? "存在します" : "存在しません");
      console.log("window.api.generateCode:", window.api.generateCode ? "存在します" : "存在しません");

      try {
        // デバッグ
        console.log("generateCode関数を呼び出し中...");
        // 引数形式を修正: オブジェクトパラメータに変更
        const result = await window.api.generateCode({
          prompt: prompt,
          uploadedImage: uploadedImage
        });
        console.log("generateCode関数からの結果を受信:", result ? "データあり" : "データなし");

        if (!result || !result.generatedCode) {
          throw new Error("コード生成に失敗しました");
        }

        const generatedCode = result.generatedCode;
        console.log("生成されたコード:", generatedCode.substring(0, 100) + "...");

        // 生成されたコードをHTMLとCSSに分割
        const htmlMatch = generatedCode.match(/```html\n([\s\S]*?)```/);
        const cssMatch = generatedCode.match(/```scss\n([\s\S]*?)```/) || generatedCode.match(/```css\n([\s\S]*?)```/);

        console.log("HTML抽出結果:", htmlMatch ? "マッチしました" : "マッチしませんでした");
        console.log("CSS抽出結果:", cssMatch ? "マッチしました" : "マッチしませんでした");

        const html = htmlMatch ? htmlMatch[1].trim() : "";
        const css = cssMatch ? cssMatch[1].trim() : "";

        if (!html || !css) {
          console.error("エラー: HTMLまたはCSSのコードが見つかりませんでした");
          console.log("HTML:", html);
          console.log("CSS:", css);
          alert("生成されたコードの形式が正しくありません。");
          setLoading(false);
          return;
        }

        // SCSSのネスト構造を検出してフラット化
        const flattenedCSS = flattenSCSS(css);

        // ネスト構造が検出されたかどうかチェック
        if (flattenedCSS !== css) {
          console.warn("AIが生成したSCSSにネスト構造が含まれています。自動的にフラット構造に変換しました。");
          // 次回のAI生成時の参考情報として表示
          alert("AIが生成したSCSSにネスト構造が含まれていました。\n自動的にフラット構造に変換しましたが、プロンプトを強化して再生成することをお勧めします。");
        }

        // pxをremに変換
        const remCSS = convertPxToRem(flattenedCSS);

        // 生成されたコードをステートに設定
        setGeneratedCode(generatedCode);
        setGeneratedHTML(html);
        setGeneratedCSS(remCSS);
        setShowGeneratedCode(true);

        // 画面を生成されたコードセクションまでスクロール
        setTimeout(() => {
          if (generatedCodeRef.current) {
            generatedCodeRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
            console.log("再生成後、コードセクションまでスクロールしました");
          }
        }, 500);

      } catch (innerError) {
        console.error("generateCode関数の呼び出しエラー:", innerError);

        // エラーメッセージを解析して表示
        let errorMessage = innerError.message;

        // Claude APIの画像エラーをより分かりやすく表示
        if (errorMessage.includes("Image does not match the provided media type")) {
          errorMessage = "画像形式エラー: アップロードされた画像の形式が一致しません。\n別の画像を試すか、他の形式（JPG/PNG）に変換してみてください。";
        } else if (errorMessage.includes("media_type")) {
          errorMessage = "画像メディアタイプエラー: APIがサポートしていない画像形式です。\nJPEG、PNG、GIF、WEBPのいずれかの形式をご利用ください。";
        }

        alert(`コード生成エラー: ${errorMessage}`);
      }
    } catch (error) {
      console.error("コード生成エラー:", error);
      alert(`エラーが発生しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // コードのみリセット処理
  const handleResetCode = () => {
    // 生成されたコードをクリア
    setGeneratedCode("");
    setGeneratedHTML("");
    setGeneratedCSS("");
    setEditingHTML("");
    setEditingCSS("");
    setShowGeneratedCode(false);

    // 再生成指示をクリア
    setRegenerateInstructions("");

    console.log("生成コードをリセットしました（画像は保持）");
  };

  // 全てのデータをリセット（既存のhandleResetを改名）
  const handleResetAll = () => {
    // 生成されたコードをクリア
    setGeneratedCode("");
    setGeneratedHTML("");
    setGeneratedCSS("");
    setEditingHTML("");
    setEditingCSS("");
    setShowGeneratedCode(false);

    // 画像をクリア
    setPcImage(null);
    setSpImage(null);
    setPcImageBase64(null);
    setSpImageBase64(null);

    // 画像解析結果をクリア
    setPcColors([]);
    setSpColors([]);
    setPcText("");
    setSpText("");

    // 再生成指示をクリア
    setRegenerateInstructions("");

    console.log("すべての生成データをリセットしました");
  };

  // iframeからのメッセージを受け取るイベントリスナー
  useEffect(() => {
    // iframeからの高さ更新メッセージをリスン
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'resize' && typeof event.data.height === 'number') {
        const newHeight = Math.max(event.data.height, 400); // 最小高さは400px
        console.log(`iframeから高さ通知を受信: ${newHeight}px`);
        setIframeHeight(newHeight);
      }
    };

    window.addEventListener('message', handleMessage);

    // クリーンアップ
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <div className="ai-code-generator">
      <Header
        title="AIコード生成"
        description="AIを活用してデザイン画像からHTMLとCSSを自動生成します"
      />

      <div className="upload-section">
        <div
          className={`upload-area ${pcImage ? 'has-image' : ''}`}
          onClick={() => document.getElementById('pc-image-input').click()}
        >
          {pcImage ? (
            <div className="image-preview-container">
              <img
                src={pcImage.preview}
                alt="PC Preview"
                className="preview-image"
                onError={(e) => {
                  console.error("画像の読み込みに失敗しました", e);
                  e.target.style.display = 'none';
                }}
              />
            </div>
          ) : (
            <>
              <div className="upload-icon">🖥️</div>
              <div className="upload-text">PC用デザイン画像をアップロード</div>
              <div className="upload-hint">クリックまたはドラッグ＆ドロップ</div>
            </>
          )}
          <input
            type="file"
            id="pc-image-input"
            accept="image/*"
            onChange={(e) => handleImageUpload(e, 'pc')}
            style={{ display: 'none' }}
          />
        </div>

        <div
          className={`upload-area ${spImage ? 'has-image' : ''}`}
          onClick={() => document.getElementById('sp-image-input').click()}
        >
          {spImage ? (
            <div className="image-preview-container">
              <img
                src={spImage.preview}
                alt="SP Preview"
                className="preview-image"
                onError={(e) => {
                  console.error("画像の読み込みに失敗しました", e);
                  e.target.style.display = 'none';
                }}
              />
            </div>
          ) : (
            <>
              <div className="upload-icon">📱</div>
              <div className="upload-text">SP用デザイン画像をアップロード</div>
              <div className="upload-hint">クリックまたはドラッグ＆ドロップ</div>
            </>
          )}
          <input
            type="file"
            id="sp-image-input"
            accept="image/*"
            onChange={(e) => handleImageUpload(e, 'sp')}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <div className="settings-section">
        <h2>生成設定</h2>
        <div className="settings-grid">
          <div className="setting-group">
            <label className="setting-label">レスポンシブ設定</label>
            <div className="responsive-settings-display">
              <div className="responsive-settings-header">
                <div className="responsive-mode">
                  <span className="label">モード</span>
                  <div className="mode-badge">
                    <span className="mode-icon">{responsiveMode === "sp" ? "📱" : "🖥️"}</span>
                    <span className="mode-text">{responsiveMode === "sp" ? "SP優先" : "PC優先"}</span>
                  </div>
                </div>
                <div className="breakpoints-summary">
                  <span className="label">適用ブレークポイント</span>
                  <div className="breakpoint-list">
                    {aiBreakpoints
                      .filter(bp => bp.aiActive && bp.active)
                      .sort((a, b) => a.value - b.value)
                      .map(bp => (
                        <div key={bp.name} className="breakpoint-item">
                          <span className="bp-name">{bp.name}</span>
                          <span className="bp-px">({bp.value}px)</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        className={`generate-button ${loading ? 'loading' : ''}`}
        onClick={handleGenerateCode}
        disabled={loading || (!pcImage && !spImage)}
      >
        {loading ? "生成中..." : "コードを生成"}
      </button>

      {showGeneratedCode && (
        <div className="reset-buttons-container">
          <button
            className="reset-code-button"
            onClick={handleResetCode}
            disabled={loading}
            title="生成したコードのみをリセットします。アップロードした画像は保持されます。"
          >
            コードをリセット
          </button>
          <button
            className="reset-all-button"
            onClick={handleResetAll}
            disabled={loading}
            title="生成したコードとアップロードした画像を含むすべてのデータをリセットします。"
          >
            すべてリセット
          </button>
        </div>
      )}

      {showGeneratedCode && (
        <div className="generated-code-container" ref={generatedCodeRef}>
          <div className="tabs">
            <button
              onClick={() => setIsEditing(false)}
              className={!isEditing ? "active" : ""}
            >
              表示
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className={isEditing ? "active" : ""}
            >
              編集
            </button>
          </div>

          {isEditing ? (
            <div className="code-editor-container">
              <div className="html-editor">
                <h3>HTML</h3>
                <CodeMirror
                  value={editingHTML}
                  options={{
                    mode: 'text/html',
                    theme: 'material',
                    lineNumbers: true,
                    lineWrapping: true,
                    smartIndent: true,
                    tabSize: 2,
                    indentWithTabs: false,
                    matchBrackets: true,
                    autoCloseBrackets: true,
                    foldGutter: true,
                    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
                    extraKeys: {
                      'Ctrl-Space': 'autocomplete',
                      'Ctrl-/': 'toggleComment',
                      'Cmd-/': 'toggleComment',
                      Tab: (cm) => {
                        if (cm.somethingSelected()) {
                          cm.indentSelection('add');
                        } else {
                          cm.replaceSelection('  ', 'end');
                        }
                      },
                    },
                  }}
                  onBeforeChange={(editor, data, value) => {
                    setEditingHTML(value);
                  }}
                  className="code-editor-wrapper"
                />
              </div>

              <div className="css-editor">
                <h3>CSS</h3>
                <CodeMirror
                  value={editingCSS}
                  options={{
                    mode: 'text/x-scss',
                    theme: 'material',
                    lineNumbers: true,
                    lineWrapping: true,
                    smartIndent: true,
                    tabSize: 2,
                    indentWithTabs: false,
                    matchBrackets: true,
                    autoCloseBrackets: true,
                    foldGutter: true,
                    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
                    extraKeys: {
                      'Ctrl-Space': 'autocomplete',
                      'Ctrl-/': 'toggleComment',
                      'Cmd-/': 'toggleComment',
                      Tab: (cm) => {
                        if (cm.somethingSelected()) {
                          cm.indentSelection('add');
                        } else {
                          cm.replaceSelection('  ', 'end');
                        }
                      },
                    },
                  }}
                  onBeforeChange={(editor, data, value) => {
                    setEditingCSS(value);
                  }}
                  className="code-editor-wrapper"
                />
              </div>

              <div className="editor-hint">
                <p><span>💡</span> タブや自動インデント、シンタックスハイライトに対応</p>
              </div>

              <button className="update-button" onClick={handleUpdateCode}>
                変更を適用
              </button>
            </div>
          ) : (
            <CodeDisplay htmlCode={generatedHTML} cssCode={generatedCSS} />
          )}

          <div className="preview-container" ref={previewContainerRef}>
            <div className="preview-header">
              <div className="preview-title">
                <h3>コードプレビュー {previewWidth}px</h3>
                {isDragging && <span className="preview-size">{previewWidth}px</span>}
              </div>
              <div className="preview-controls">
                <div className="preview-size-buttons">
                  <button
                    onClick={() => resetPreviewSize(375)}
                    className={previewWidth === 375 && !showCustomSizeInput ? "active" : ""}
                  >
                    SP (375px)
                  </button>
                  <button
                    onClick={() => resetPreviewSize(768)}
                    className={previewWidth === 768 && !showCustomSizeInput ? "active" : ""}
                  >
                    Tablet (768px)
                  </button>
                  <button
                    onClick={() => resetPreviewSize(1440)}
                    className={previewWidth === 1440 && !showCustomSizeInput ? "active" : ""}
                  >
                    PC (1440px)
                  </button>
                  <button
                    onClick={() => resetPreviewSize(1920)}
                    className={previewWidth === 1920 && !showCustomSizeInput ? "active" : ""}
                  >
                    PC (1920px)
                  </button>
                  <button
                    onClick={showCustomSizeForm}
                    className={showCustomSizeInput ? "active" : ""}
                  >
                    カスタム
                  </button>
                </div>
                {showCustomSizeInput ? (
                  <div className="custom-size-input">
                    <input
                      type="number"
                      value={customSizeInput}
                      onChange={(e) => setCustomSizeInput(e.target.value)}
                      min="320"
                      max="2560"
                    />
                    <span>px</span>
                    <button className="apply-button" onClick={applyCustomSize}>
                      適用
                    </button>
                  </div>
                ) : (
                  <div className="preview-size-display">
                    {previewWidth}px
                  </div>
                )}
              </div>
            </div>
            <div
              className="preview-iframe-container"
              style={{
                width: `${previewWidth}px`,
                transform: `scale(${scaleRatio})`,
                transformOrigin: 'top left',
                minHeight: `${iframeHeight * scaleRatio}px` // コンテナの高さもiframeの高さに合わせて調整
              }}
            >
              <iframe
                ref={previewRef}
                title="Preview"
                className="preview-iframe"
                style={{ width: `${previewWidth}px`, height: `${iframeHeight}px` }}
                scrolling="auto"
              ></iframe>
            </div>
          </div>

          <div className="regenerate-form">
            <h3>コードの再生成</h3>
            <textarea
              value={regenerateInstructions}
              onChange={(e) => setRegenerateInstructions(e.target.value)}
              className="regenerate-textarea"
              placeholder="コードの修正指示を入力してください"
              rows={6}
            />
            <button
              className={`regenerate-button ${loading ? 'loading' : ''}`}
              onClick={handleRegenerate}
              disabled={loading || !regenerateInstructions.trim()}
            >
              {loading ? "" : "再生成"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AICodeGenerator;
