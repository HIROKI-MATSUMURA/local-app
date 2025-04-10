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
import { detectScssBlocks, detectHtmlBlocks } from "../utils/codeParser";

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
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState("");
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
  // リロード防止用のフラグを追加
  const [isPreventingReload, setIsPreventingReload] = useState(false);
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

  // 保存から除外するブロックを管理
  const [excludedBlocks, setExcludedBlocks] = useState([]);

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
          ? previewContainer.offsetHeight // 余白分を追加しない
          : bodyHeight;

        // プレビューコンテナ内の全要素も確認して、最も下に位置する要素の位置も考慮する
        if (previewContainer) {
          const children = previewContainer.querySelectorAll('*');
          let maxBottom = 0;

          children.forEach(child => {
            const rect = child.getBoundingClientRect();
            const bottom = rect.bottom;
            if (bottom > maxBottom) {
              maxBottom = bottom;
            }
          });

          // コンテナの上端からの相対位置を計算する必要がある
          const containerRect = previewContainer.getBoundingClientRect();
          const relativeBottom = maxBottom - containerRect.top; // 余白分追加しない

          // 最も下の要素に基づく高さと、offsetHeightを比較して大きい方を使用
          const heightBasedOnElements = Math.max(relativeBottom, contentHeight);

          // 高さに最小値を設定（400px以下にはならない）
          const newHeight = Math.max(heightBasedOnElements, 400);

          // 現在の高さとの差が大きい場合、または大きなプレビューサイズ時は常に更新
          if (Math.abs(newHeight - iframeHeight) > 5 || previewWidth >= 1440) {
            console.log(`iframeの高さを${iframeHeight}pxから${newHeight}pxに調整します（実際のコンテンツ高さ: ${contentHeight}px, 要素に基づく高さ: ${heightBasedOnElements}px）`);
            setIframeHeight(newHeight);
          }
        } else {
          // コンテナがない場合は通常の計算
          const newHeight = Math.max(contentHeight, 400);
          if (Math.abs(newHeight - iframeHeight) > 30) {
            console.log(`iframeの高さを${iframeHeight}pxから${newHeight}pxに調整します（実際のコンテンツ高さ: ${contentHeight}px）`);
            setIframeHeight(newHeight);
          }
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

        // 色変数の処理
        // cssVariablesからSCSS変数を抽出
        const cssVariables = localStorage.getItem('cssVariables') || '';
        const defaultColors = {};

        // 変数の抽出
        const varRegex = /\$([\w-]+):\s*([^;]+);/g;
        let match;
        while ((match = varRegex.exec(cssVariables)) !== null) {
          const [_, varName, varValue] = match;
          defaultColors[`$${varName}`] = varValue.trim();
        }

        // _setting.scssに変数がない場合のフォールバック
        if (Object.keys(defaultColors).length === 0) {
          defaultColors['$primary-color'] = '#DDF0F1';
          defaultColors['$blue'] = '#408F95';
        }

        // ローカルストレージから保存されている色を読み込み
        const colorValues = { ...defaultColors };

        // デバッグのためにローカルストレージのすべての値を表示
        console.log("ローカルストレージの値:", Object.fromEntries(
          Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])
        ));

        // これらの色変数をプレビュー時に使用
        console.log("プレビューに使用する色変数:", colorValues);

        // SCSS変数を実際の色値に置換
        Object.entries(colorValues).forEach(([variable, value]) => {
          const regex = new RegExp(variable.replace('$', '\\$'), 'g');
          processedCSS = processedCSS.replace(regex, value);
        });

        // SCSS関数の処理（darken, lightenなど）
        // darken($secondary-color, 10%)のようなパターンを処理
        const processDarkenFunction = (css) => {
          const darkenPattern = /darken\(([^,]+),\s*(\d+(?:\.\d+)?)%\)/g;
          return css.replace(darkenPattern, (match, colorVar, percent) => {
            // 色変数または色値を取得
            let baseColor = colorVar.trim();
            // 変数の場合は実際の色に置換
            if (baseColor.startsWith('$')) {
              const varName = baseColor;
              baseColor = colorValues[varName] || baseColor;
            }

            // 色がHEX形式の場合のみ処理
            if (baseColor.startsWith('#')) {
              try {
                // HEXからRGBに変換
                const r = parseInt(baseColor.substring(1, 3), 16);
                const g = parseInt(baseColor.substring(3, 5), 16);
                const b = parseInt(baseColor.substring(5, 7), 16);

                // 暗くする量（パーセント）
                const amount = parseFloat(percent) / 100;

                // RGB値を暗くする（シンプルな実装）
                const newR = Math.max(0, Math.floor(r * (1 - amount)));
                const newG = Math.max(0, Math.floor(g * (1 - amount)));
                const newB = Math.max(0, Math.floor(b * (1 - amount)));

                // 新しいHEX値を生成
                const newHex = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
                return newHex;
              } catch (e) {
                console.error('色変換エラー:', e);
                return baseColor; // エラー時は元の色を返す
              }
            }
            return match; // 処理できない場合は元のテキストを返す
          });
        };

        // lightenも同様に処理
        const processLightenFunction = (css) => {
          const lightenPattern = /lighten\(([^,]+),\s*(\d+(?:\.\d+)?)%\)/g;
          return css.replace(lightenPattern, (match, colorVar, percent) => {
            // 色変数または色値を取得
            let baseColor = colorVar.trim();
            // 変数の場合は実際の色に置換
            if (baseColor.startsWith('$')) {
              const varName = baseColor;
              baseColor = colorValues[varName] || baseColor;
            }

            // 色がHEX形式の場合のみ処理
            if (baseColor.startsWith('#')) {
              try {
                // HEXからRGBに変換
                const r = parseInt(baseColor.substring(1, 3), 16);
                const g = parseInt(baseColor.substring(3, 5), 16);
                const b = parseInt(baseColor.substring(5, 7), 16);

                // 明るくする量（パーセント）
                const amount = parseFloat(percent) / 100;

                // RGB値を明るくする（シンプルな実装）
                const newR = Math.min(255, Math.floor(r + (255 - r) * amount));
                const newG = Math.min(255, Math.floor(g + (255 - g) * amount));
                const newB = Math.min(255, Math.floor(b + (255 - b) * amount));

                // 新しいHEX値を生成
                const newHex = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
                return newHex;
              } catch (e) {
                console.error('色変換エラー:', e);
                return baseColor; // エラー時は元の色を返す
              }
            }
            return match; // 処理できない場合は元のテキストを返す
          });
        };

        // SCSS関数を処理
        processedCSS = processDarkenFunction(processedCSS);
        processedCSS = processLightenFunction(processedCSS);

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
          img[src^="path-to-"],
          img[src^="path/to/"] {
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
            const heightWithMargin = Math.ceil(contentHeight); // 余白を0に

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
                  min-height: 100%; /* 余白を削除 */
                  display: block;
                  position: relative;
                }
                *,
                *::before,
                *::after {
                  box-sizing: border-box;
                }
                /* すべての画像にブロック表示を適用 */
                img {
                  display: block;
                  max-width: 100%;
                }
                /* 特に大きなプレビューサイズでの表示を改善 */
                @media (min-width: 1440px) {
                  .preview-container {
                    min-height: 100%;
                  }
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
      // プレビューコンテナの実際の幅を取得
      const containerRect = previewContainerRef.current.getBoundingClientRect();

      // パディングとボーダーなどを考慮して、利用可能な実際の幅を計算
      // getPaddingの代わりにdirectに数値を指定（両側合わせて40px）
      const availableWidth = containerRect.width - 40;

      // より正確なスケール計算
      // 小数点第6位まで計算して、より正確なスケール値を得る
      const scale = Math.min(1, parseFloat((availableWidth / previewWidth).toFixed(6)));

      console.log(`プレビューコンテナ幅: ${containerRect.width}px、利用可能幅: ${availableWidth}px、プレビュー幅: ${previewWidth}px、計算されたスケール: ${scale}`);

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

  // プレビュー幅が変わった時に確実にスケールを更新
  useEffect(() => {
    // スケールの計算を少し遅らせることで、DOM更新後の正確な値を取得
    setTimeout(() => {
      calculateScale();

      // 複数回呼び出すことで、レンダリング完了後の正確な値を取得
      setTimeout(calculateScale, 100);
    }, 50);
  }, [previewWidth]);

  // iframeの高さが変わったときにプレビューコンテナの高さも更新
  useEffect(() => {
    if (previewWidth > 1000 && previewContainerRef.current) {
      // スケール率を計算
      const scale = 1022 / previewWidth;

      // iframeの元の高さを取得
      const originalHeight = iframeHeight;

      // プレビューヘッダーの高さを考慮（およそ100px）
      const headerHeight = 100;

      // プレビューコンテナの上下パディングを考慮（およそ50px）
      const paddingHeight = 50;

      // スケールされた高さ + ヘッダー + パディング
      const scaledTotalHeight = (originalHeight * scale) + headerHeight + paddingHeight;

      // 最小高さを確保
      const finalHeight = Math.max(500, scaledTotalHeight);

      console.log(`プレビューコンテナの高さを調整: 元の高さ=${originalHeight}px, スケール=${scale}, 計算後の高さ=${finalHeight}px`);

      // 高さを設定
      previewContainerRef.current.style.height = `${finalHeight}px`;
      previewContainerRef.current.style.minHeight = `${finalHeight}px`;
    } else if (previewContainerRef.current) {
      // 小さいサイズの場合はautoに戻す
      previewContainerRef.current.style.height = 'auto';
      previewContainerRef.current.style.minHeight = '500px';
    }
  }, [iframeHeight, previewWidth]);

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
      // ファイルサイズを確認 (4MB制限)
      const maxSize = 4 * 1024 * 1024; // 4MB
      if (file.size > maxSize) {
        console.log(`ファイルサイズが大きすぎます（${Math.round(file.size / 1024)}KB）。自動的にリサイズします。`);
      }

      // FileReaderを使用してファイルを読み込む
      const reader = new FileReader();

      reader.onload = async (loadEvent) => {
        try {
          const base64Data = loadEvent.target.result;
          console.log(`画像の読み込みが完了しました: ${Math.round(base64Data.length / 1024)}KB`);

          // リサイズが必要な場合は実行
          const resizedBase64 = file.size > maxSize
            ? await resizeImage(base64Data, 1920) // 最大幅1920pxにリサイズ
            : base64Data;

          // 画像形式を最適化
          const { base64: processedBase64 } = await processImage(resizedBase64);
          console.log(`画像の最適化が完了しました: ${Math.round(processedBase64.length / 1024)}KB`);

          // プレビュー用のURLを生成 - Blob URLの代わりにData URLを直接使用
          // const imagePreview = URL.createObjectURL(file);

          // タイプに応じて適切なステートを更新
          if (type === 'pc') {
            setPcImage({
              file,
              preview: processedBase64 // Data URLを直接使用
            });
            setPcImageBase64(processedBase64);

            // 必要に応じて追加の解析を実行
            try {
              const text = await extractTextFromImage(processedBase64);
              setPcText(text);
              console.log(`PC画像からテキストを抽出しました`);
            } catch (error) {
              console.error("PC画像のテキスト抽出エラー:", error);
            }

            try {
              const colors = await extractColorsFromImage(processedBase64);
              setPcColors(colors);
              console.log(`PC画像の色を抽出しました: ${colors.length}色`);
            } catch (error) {
              console.error("PC画像の色抽出エラー:", error);
            }
          } else if (type === 'sp') {
            setSpImage({
              file,
              preview: processedBase64 // Data URLを直接使用
            });
            setSpImageBase64(processedBase64);

            // 必要に応じて追加の解析を実行
            try {
              const text = await extractTextFromImage(processedBase64);
              setSpText(text);
              console.log(`SP画像からテキストを抽出しました`);
            } catch (error) {
              console.error("SP画像のテキスト抽出エラー:", error);
            }

            try {
              const colors = await extractColorsFromImage(processedBase64);
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

  // PC画像を削除する処理
  const handleRemovePcImage = (e) => {
    e.stopPropagation();
    setPcImage(null);
    setPcImageBase64(null);
    setPcColors([]);
    setPcText("");
  };

  // SP画像を削除する処理
  const handleRemoveSpImage = (e) => {
    e.stopPropagation();
    setSpImage(null);
    setSpImageBase64(null);
    setSpColors([]);
    setSpText("");
  };

  // 編集したコードを反映
  const handleUpdateCode = () => {
    // SCSSのネスト構造を検出した場合は自動的に平坦化
    const processedCss = flattenSCSS(editingCSS);

    // pxをremに変換
    const remCss = convertPxToRem(processedCss);

    // HEX値を色変数に変換
    const { modifiedCode: cssWithVars, replacedCount } = replaceHexWithVariables(remCss);

    // 未定義色変数を検出して置換
    const { modifiedCode: finalCss, replacedVars } = replaceUndefinedColorVariables(cssWithVars);

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

    if (replacedCount > 0) {
      console.log(`${replacedCount}個のHEX値を変数に変換しました`);
      message += `${replacedCount}個のHEX値を色変数に変換しました。\n`;
    }

    if (replacedVars.length > 0) {
      console.log(`${replacedVars.length}個の未定義変数をHEX値に置換しました`);
      message += `${replacedVars.length}個の未定義色変数をHEX値に置換しました。\n`;
    }

    if (message) {
      alert(message);
    }

    setGeneratedHTML(editingHTML);
    setGeneratedCSS(finalCss);
    setEditingCSS(finalCss);
  };

  // 再生成処理
  const handleRegenerate = async () => {
    if (loading) return;
    if (!regenerateInstructions.trim()) {
      alert("再生成の指示を入力してください");
      return;
    }

    setLoading(true);
    setLoadingProgress(0);
    setLoadingStage("準備中...");

    // 擬似的に進捗状態を更新するタイマー
    const progressTimer = setInterval(() => {
      setLoadingProgress(prevProgress => {
        // 進捗が80%を超えたら、APIの応答待ちとみなしてゆっくり進める
        if (prevProgress >= 80) {
          return Math.min(prevProgress + 0.2, 99);
        }
        return Math.min(prevProgress + 1, 80);
      });
    }, 300);

    try {
      // API設定コンポーネントから保存されたAPIキーを取得
      const apiKey = localStorage.getItem("aiCodeGeneratorAPIKey");

      if (!apiKey) {
        alert("API設定から APIキーを設定してください。");
        setLoading(false);
        clearInterval(progressTimer);
        return;
      }

      console.log("再生成開始", regenerateInstructions);
      setLoadingStage("指示内容を分析中...");
      setLoadingProgress(20);

      // 分析モードかどうかを確認 - 特定のキーワードが含まれている場合
      const isAnalysisMode = /分析|解析|問題点|診断|チェック|確認|レビュー|analyze|review|check|issues/i.test(regenerateInstructions);

      // 分析モードの場合は警告を表示して処理を終了
      if (isAnalysisMode) {
        alert("分析モードは現在利用できません。通常の再生成を行ってください。");
        setLoading(false);
        clearInterval(progressTimer);
        return;
      }

      // 分析モードと修正モードで異なるプロンプトを構築
      let regeneratePrompt;

      if (isAnalysisMode) {
        // 分析モード用プロンプト（実質は使用されない）
        // ... existing code ...
      } else {
        // 修正モード用プロンプト（より詳細な指示とコード構造の理解を促進）
        setLoadingStage("プロンプト生成中...");
        setLoadingProgress(30);
        regeneratePrompt = `
# コード修正リクエスト

以下のHTMLとSCSSコードを修正してください。元のコードの構造と命名規則を維持しながら、指定された変更を適用します。

## 修正指示:
${regenerateInstructions}

## 現在のコード:

### HTML:
\`\`\`html
${editingHTML}
\`\`\`

### SCSS:
\`\`\`scss
${editingCSS}
\`\`\`

## 修正ガイドライン:

### 一般ガイドライン:
1. 元のHTML構造とクラス名をできるだけ維持する
2. 元のSCSSセレクタと基本構造を維持する
3. 指示されていない限り、新しい要素やクラスを追加しない
4. 指定された部分のみを変更し、それ以外はそのままにする
5. すべての画像要素(img)にdisplay: block;を適用する
6. インライン要素（特にaタグ）はdivでラップする
7. コンポーネント要素（ボタンなど）には単一のクラス名を使用し、複数のクラスの組み合わせを避ける

### SCSS規則:
- **❌ SCSSでのネストは絶対に使用しない ❌** - 最重要要件
- **⚠️ 警告: &演算子を使用したネストセレクタを使用しない**
- **✅ 唯一の例外: @include mq()メディアクエリ**

### 正しいSCSS構造（これに従ってください）:

\`\`\`scss
/* 正しい: 各セレクタが個別に記述されている */
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

### 誤ったSCSS構造（避けてください）:

\`\`\`scss
/* 誤り: &演算子を使用したネスト */
.c-card {
  background-color: white;

  &__title {  /* これは絶対にしないでください！ */
    font-size: 1.25rem;
  }

  &__content {  /* これは絶対にしないでください！ */
    font-size: 1rem;
  }

  &:hover {  /* これは絶対にしないでください！ */
    background-color: #f9f9f9;
  }
}
\`\`\`

## 出力形式:
1. 変更内容の要約（何を変更したか、なぜそのように変更したか）
2. 更新されたHTMLコード（\`\`\`html\`\`\`形式）
3. 更新されたSCSSコード（\`\`\`scss\`\`\`形式）

必ずフラットなSCSS構造を使用し、ネストを避けてください。
`;
      }

      console.log("window.api:", window.api ? "存在します" : "存在しません");
      console.log("generateCode関数を呼び出し中...");
      setLoadingStage("AIにコード修正を依頼中...");
      setLoadingProgress(50);

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

      setLoadingProgress(80);
      setLoadingStage("コードの解析と最適化中...");

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
      setLoadingProgress(85);
      setLoadingStage("HTMLコードの更新中...");

      if (htmlMatch) {
        const htmlContent = htmlMatch[0];
        console.log("新しいHTMLを設定:", htmlContent.substring(0, 50) + "...");
        setEditingHTML(htmlContent);
        setGeneratedHTML(htmlContent); // 表示用の状態も同時に更新
      }

      setLoadingProgress(90);
      setLoadingStage("CSSコードの最適化中...");

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

        // HEX値を色変数に変換
        const { modifiedCode: cssWithVars, replacedCount } = replaceHexWithVariables(remCSS);
        console.log(`${replacedCount}個のHEX値を色変数に変換しました`);

        // 未定義色変数をチェックして置換
        const { modifiedCode: finalCSS, replacedVars } = replaceUndefinedColorVariables(cssWithVars);
        if (replacedVars.length > 0) {
          console.log(`${replacedVars.length}個の未定義変数をHEX値に置換しました`);
        }

        setEditingCSS(finalCSS);
        setGeneratedCSS(finalCSS); // 表示用の状態も同時に更新
      }

      // 再生成完了メッセージ
      console.log("コードの再生成が完了し、編集・表示タブ両方のコードを更新しました");

      // 編集タブに切り替え - ユーザーがすぐに編集できるようにする
      setIsEditing(true);

      // 指示をクリア
      setRegenerateInstructions("");

      // 生成されたコードをステートに設定
      setLoadingProgress(95);
      setLoadingStage("表示準備中...");
      setGeneratedCode(generatedCode);
      setGeneratedHTML(htmlMatch ? htmlMatch[0] : editingHTML);
      // cssMatch内容は編集フォームで置き換え済み
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

        setLoadingProgress(100);
        setLoadingStage("完了");
        setTimeout(() => {
          setLoading(false);
          clearInterval(progressTimer);
        }, 500);
      }, 500);

    } catch (error) {
      console.error("再生成エラー:", error);
      alert(`エラーが発生しました: ${error.message}`);
      setLoading(false);
      clearInterval(progressTimer);
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
    setLoadingProgress(0);
    setLoadingStage("準備中...");

    // 擬似的に進捗状態を更新するタイマー
    const progressTimer = setInterval(() => {
      setLoadingProgress(prevProgress => {
        // 進捗が80%を超えたら、APIの応答待ちとみなしてゆっくり進める
        if (prevProgress >= 80) {
          return Math.min(prevProgress + 0.2, 99);
        }
        return Math.min(prevProgress + 1, 80);
      });
    }, 300);

    try {
      console.log("コード生成ボタンがクリックされました");
      setLoadingStage("プロンプト生成中...");

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
        setLoadingProgress(30);
        setLoadingStage("AIに問合せ中...");
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
        clearInterval(progressTimer);
        return;
      }

      // 画像データの処理
      const imageToUse = pcImageBase64 || spImageBase64;
      let uploadedImage = null;

      if (imageToUse) {
        setLoadingStage("画像処理中...");
        setLoadingProgress(40);

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
          setLoadingProgress(50);
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
        setLoadingStage("AIにコード生成を依頼中...");
        setLoadingProgress(60);

        // 引数形式を修正: オブジェクトパラメータに変更
        const result = await window.api.generateCode({
          prompt: prompt,
          uploadedImage: uploadedImage
        });
        console.log("generateCode関数からの結果を受信:", result ? "データあり" : "データなし");

        setLoadingProgress(80);
        setLoadingStage("コードの解析と最適化中...");

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
          clearInterval(progressTimer);
          return;
        }

        // SCSSのネスト構造を検出してフラット化
        setLoadingProgress(85);
        setLoadingStage("SCSSのフラット化中...");
        const flattenedCSS = flattenSCSS(css);

        // ネスト構造が検出されたかどうかチェック
        if (flattenedCSS !== css) {
          console.warn("AIが生成したSCSSにネスト構造が含まれています。自動的にフラット構造に変換しました。");
          // 次回のAI生成時の参考情報として表示
          alert("AIが生成したSCSSにネスト構造が含まれていました。\n自動的にフラット構造に変換しましたが、プロンプトを強化して再生成することをお勧めします。");
        }

        // pxをremに変換
        setLoadingProgress(90);
        setLoadingStage("単位の最適化中...");
        const remCSS = convertPxToRem(flattenedCSS);

        // HEX値を色変数に変換
        setLoadingProgress(95);
        setLoadingStage("カラー変数の最適化中...");
        const { modifiedCode: cssWithVars, replacedCount } = replaceHexWithVariables(remCSS);
        console.log(`${replacedCount}個のHEX値を色変数に変換しました`);

        // 未定義色変数をチェックして置換
        const { modifiedCode: finalCSS, replacedVars } = replaceUndefinedColorVariables(cssWithVars);
        if (replacedVars.length > 0) {
          console.log(`${replacedVars.length}個の未定義変数をHEX値に置換しました`);
        }

        // 生成されたコードをステートに設定
        setLoadingProgress(98);
        setLoadingStage("表示準備中...");
        setGeneratedCode(generatedCode);
        setGeneratedHTML(html);
        setGeneratedCSS(finalCSS);
        setShowGeneratedCode(true);

        // 画面を生成されたコードセクションまでスクロール
        setTimeout(() => {
          if (generatedCodeRef.current) {
            generatedCodeRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
            console.log("コード生成後、コードセクションまでスクロールしました");
          }

          setLoadingProgress(100);
          setLoadingStage("完了");
          setTimeout(() => {
            setLoading(false);
            clearInterval(progressTimer);
          }, 500);
        }, 500);

      } catch (error) {
        console.error("コード生成エラー:", error);

        // エラーメッセージをより具体的に
        let errorMessage = `エラーが発生しました: ${error.message}`;

        // ステータスコード529のエラー対応
        if (error.message.includes('status code 529')) {
          errorMessage = "サーバーが混雑しているか一時的に利用できません。しばらく待ってから再試行してください。(エラー529)";
        } else if (error.message.includes('timeout')) {
          errorMessage = "リクエストがタイムアウトしました。画像のサイズを小さくするか、複雑さを減らして再試行してください。";
        }

        alert(errorMessage);
        setLoading(false);
        clearInterval(progressTimer);
      }
    } catch (error) {
      console.error("エラー:", error);
      alert(`エラーが発生しました: ${error.message}`);
      setLoading(false);
      clearInterval(progressTimer);
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

  // 定義済みの色変数を取得する関数
  const getDefinedColorVariables = () => {
    // ローカルストレージから変数設定を取得
    const cssVariables = localStorage.getItem('cssVariables') || '';
    const definedVars = new Map();

    console.group('🔎 ローカルストレージから色変数を取得');
    console.log('ローカルストレージの生の内容:', cssVariables);

    if (!cssVariables || cssVariables.trim() === '') {
      console.log('ローカルストレージに色変数が定義されていません。デフォルト値を使用します。');
      // 何も設定されていない場合はsetting.scssのデフォルト値を使用
      definedVars.set('$primary-color', '#DDF0F1');
      definedVars.set('$blue', '#408F95');
      console.table(Object.fromEntries(definedVars));
      console.groupEnd();
      return definedVars;
    }

    // 変数の抽出
    const varRegex = /\$([\w-]+):\s*([^;]+);/g;
    let match;
    let count = 0;

    console.log('変数抽出を開始...');

    while ((match = varRegex.exec(cssVariables)) !== null) {
      const [fullMatch, varName, varValue] = match;
      const variableWithDollar = `$${varName}`;
      definedVars.set(variableWithDollar, varValue.trim());
      console.log(`抽出: ${fullMatch} → 変数名: ${variableWithDollar}, 値: ${varValue.trim()}`);
      count++;
    }

    console.log(`合計 ${count} 個の変数を抽出しました`);

    // 抽出結果の確認
    if (definedVars.size === 0) {
      console.warn('正規表現で変数を抽出できませんでした。フォーマットが正しいか確認してください。');
      console.log('変数フォーマット例: $primary-color: #DDF0F1;');

      // フォールバックとして手動でパース試行
      try {
        const lines = cssVariables.split('\n');
        console.log('手動パース試行:', lines);

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && trimmedLine.includes(':')) {
            const parts = trimmedLine.split(':');
            if (parts.length >= 2) {
              const varName = parts[0].trim();
              let varValue = parts[1].trim();

              // 終端のセミコロンを削除
              if (varValue.endsWith(';')) {
                varValue = varValue.slice(0, -1);
              }

              if (varName.startsWith('$')) {
                definedVars.set(varName, varValue);
                console.log(`手動抽出: ${varName} = ${varValue}`);
              }
            }
          }
        }
      } catch (e) {
        console.error('手動パース中にエラーが発生しました:', e);
      }
    }

    // 依然として変数が取得できない場合はデフォルト値を使用
    if (definedVars.size === 0) {
      console.warn('いずれの方法でも変数を抽出できませんでした。デフォルト値を使用します。');
      definedVars.set('$primary-color', '#DDF0F1');
      definedVars.set('$blue', '#408F95');
    }

    console.log('最終的な定義済み変数リスト:');
    console.table(Object.fromEntries(definedVars));
    console.groupEnd();

    return definedVars;
  };

  // 2つのHEX色の類似度を計算する関数
  const getColorSimilarity = (hex1, hex2) => {
    // HEX値からRGB値に変換
    const getRGB = (hex) => {
      hex = hex.replace('#', '');

      // 3桁のHEX値を6桁に変換
      if (hex.length === 3) {
        hex = hex.split('').map(h => h + h).join('');
      }

      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return [r, g, b];
    };

    // 両方のHEX値からRGB値を取得
    const [r1, g1, b1] = getRGB(hex1);
    const [r2, g2, b2] = getRGB(hex2);

    // ユークリッド距離を計算（色の近さを表す）
    const distance = Math.sqrt(
      Math.pow(r1 - r2, 2) +
      Math.pow(g1 - g2, 2) +
      Math.pow(b1 - b2, 2)
    );

    return distance;
  };

  // HEX → 変数マッピングを取得する関数
  const getHexToVariableMap = () => {
    const colorVariables = getDefinedColorVariables();
    const hexToVarMap = new Map();

    console.group('🔍 定義済み色変数マップ');
    console.log('定義されている変数リスト:', Array.from(colorVariables.entries()));

    // 変数のマッピングを反転（HEX値 → 変数名）
    colorVariables.forEach((value, name) => {
      // 値が直接HEX値の場合
      if (value.startsWith('#')) {
        // 大文字に統一して保存（比較用）
        hexToVarMap.set(value.toUpperCase(), name);
        console.log(`マッピング追加: ${value.toUpperCase()} → ${name}`);
      }
      // RGB値の場合は近似のHEX値に変換
      else if (value.includes('rgb') || value.includes('hsl')) {
        try {
          // RGB/HSL値からHEX値への変換（簡易的な実装）
          const hexValue = rgbOrHslToHex(value);
          if (hexValue) {
            hexToVarMap.set(hexValue.toUpperCase(), name);
            console.log(`RGB変換マッピング追加: ${value} → ${hexValue.toUpperCase()} → ${name}`);
          }
        } catch (e) {
          console.error('RGB/HSL変換エラー:', e);
        }
      }
    });

    console.log('完成したHEX→変数マッピング:', Object.fromEntries(hexToVarMap));
    console.groupEnd();

    return hexToVarMap;
  };

  // AIが生成したHEX値を変数に置き換える関数
  const replaceHexWithVariables = (cssCode) => {
    if (!cssCode) return { modifiedCode: cssCode, replacedCount: 0 };

    // マッピング情報を取得
    const hexToVarMap = getHexToVariableMap();
    console.group('🔄 HEX値を変数に置換');

    if (hexToVarMap.size === 0) {
      console.log("変数マッピングがありません。直接HEX値を使用します。");
      console.groupEnd();
      return { modifiedCode: cssCode, replacedCount: 0 };
    }

    // HEX値を検出して変数に変換
    let modifiedCode = cssCode;
    let replacedCount = 0;
    const replacedItems = [];

    // 正規表現でHEX値を検出（#後に3桁または6桁の16進数）
    const hexRegex = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![0-9A-Fa-f])/g;
    const replacedHexValues = new Map(); // 置換済みHEX値を記録

    // CSSコード内のすべてのHEX値を検出して表示
    const allHexMatches = cssCode.match(hexRegex) || [];
    console.log(`検出されたHEX値: ${allHexMatches.length}個`, allHexMatches);

    // HEX値を変数に置換
    modifiedCode = modifiedCode.replace(hexRegex, (match) => {
      // 大文字に統一して比較
      const normalizedHex = match.toUpperCase();

      // 既に置換済みのHEX値はキャッシュから取得
      if (replacedHexValues.has(normalizedHex)) {
        return replacedHexValues.get(normalizedHex);
      }

      // 完全一致の変数を探す
      if (hexToVarMap.has(normalizedHex)) {
        const varName = hexToVarMap.get(normalizedHex);
        console.log(`HEX値を変数に変換 (完全一致): ${match} → ${varName}`);
        replacedItems.push({ hex: match, variable: varName, type: '完全一致' });
        replacedCount++;
        replacedHexValues.set(normalizedHex, varName);
        return varName;
      }

      // 類似色の検索
      let closestVar = null;
      let minDistance = 20; // 類似と判断する最大距離

      for (const [hex, varName] of hexToVarMap.entries()) {
        if (hex.startsWith('#')) {
          const distance = getColorSimilarity(normalizedHex, hex);
          if (distance < minDistance) {
            minDistance = distance;
            closestVar = varName;
          }
        }
      }

      if (closestVar) {
        console.log(`HEX値を変数に変換 (類似色): ${match} → ${closestVar} (類似度: ${minDistance})`);
        replacedItems.push({ hex: match, variable: closestVar, type: '類似色', similarity: minDistance });
        replacedCount++;
        replacedHexValues.set(normalizedHex, closestVar);
        return closestVar;
      }

      // 変換できなかった場合は元のHEX値を使用
      return match;
    });

    console.log(`${replacedCount}個のHEX値を変数に変換しました`);
    if (replacedItems.length > 0) {
      console.table(replacedItems);
    }

    console.groupEnd();
    return { modifiedCode, replacedCount };
  };

  // RGB値をHEX値に変換する関数
  const rgbOrHslToHex = (colorStr) => {
    // RGB値の場合
    const rgbMatch = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgbMatch) {
      const [_, r, g, b] = rgbMatch.map(Number);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    }

    // HSL値の場合（簡易的な実装）
    // 完全な変換はもっと複雑ですが、この例では省略
    return null;
  };

  // 未定義カラー変数を検出する関数
  const detectUndefinedColorVariables = (scssCode) => {
    const definedVariables = getDefinedColorVariables();
    const varRegex = /\$([a-zA-Z0-9_-]+)/g;
    const undefinedVars = new Set();

    console.group('🔍 未定義変数を検出');
    console.log('定義済み変数リスト:', Array.from(definedVariables.keys()));

    let match;
    while ((match = varRegex.exec(scssCode)) !== null) {
      const varName = `$${match[1]}`;
      // @includeやmq()など、変数以外のマッチを除外
      if (!varName.includes('@include') &&
        !varName.includes('mq(') &&
        !definedVariables.has(varName)) {
        undefinedVars.add(varName);
        console.log(`未定義変数を検出: ${varName}`);
      }
    }

    console.log(`検出された未定義変数: ${undefinedVars.size}個`, Array.from(undefinedVars));
    console.groupEnd();

    return Array.from(undefinedVars);
  };

  // 未定義カラー変数をHEX値に置換する関数
  const replaceUndefinedColorVariables = (scssCode) => {
    const definedVariables = getDefinedColorVariables();

    console.group('🔄 未定義変数をHEX値に置換');

    // 一般的なデフォルト値のマッピング
    const defaultColors = {
      '$primary-color': '#DDF0F1',
      '$blue': '#408F95',
      '$accent-color': '#FF5500',
      '$secondary-color': '#0066CC',
      // 他のデフォルト値...
    };

    console.log('デフォルトカラーマッピング:', defaultColors);

    // 未定義変数を検出して置換
    const undefinedVars = detectUndefinedColorVariables(scssCode);
    let modifiedCode = scssCode;
    const replacedItems = [];

    if (undefinedVars.length > 0) {
      undefinedVars.forEach(varName => {
        // デフォルト値または汎用的な値を取得
        const replacementColor = defaultColors[varName] || '#999999';

        // 正規表現でその変数の出現箇所をすべて置換
        const regex = new RegExp(varName.replace('$', '\\$'), 'g');
        modifiedCode = modifiedCode.replace(regex, replacementColor);

        replacedItems.push({
          variable: varName,
          replacement: replacementColor,
          source: defaultColors[varName] ? 'デフォルトマッピング' : 'フォールバック値'
        });
      });

      console.log('置換された未定義変数:', replacedItems);
      console.log('変換後（最初の200文字）:', modifiedCode.substring(0, 200));
    } else {
      console.log('未定義変数は検出されませんでした');
    }

    console.groupEnd();

    return {
      modifiedCode,
      replacedVars: undefinedVars
    };
  };

  // 保存機能用の状態
  const [blockName, setBlockName] = useState("");
  const [htmlFiles, setHtmlFiles] = useState([]);
  const [selectedHtmlFile, setSelectedHtmlFile] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedScssFilesCount, setSavedScssFilesCount] = useState(0);
  const [savedHtmlFilesCount, setSavedHtmlFilesCount] = useState(0);

  // リネームダイアログ用の状態
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newBlockName, setNewBlockName] = useState("");
  const [newHtmlBlockName, setNewHtmlBlockName] = useState("");
  const [conflictInfo, setConflictInfo] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [saveHtmlFile, setSaveHtmlFile] = useState(true); // HTMLファイルを保存するかどうか

  // 分析モーダル用の状態
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analysisResult, setAnalysisResult] = useState("");

  // 複数SCSSファイル処理のための拡張状態
  const [conflictingScssBlocks, setConflictingScssBlocks] = useState([]);
  const [nonConflictingScssBlocks, setNonConflictingScssBlocks] = useState([]);
  const [blockRenameMap, setBlockRenameMap] = useState({});
  const [blockSaveMap, setBlockSaveMap] = useState({});
  const [blockValidationErrors, setBlockValidationErrors] = useState({});
  const [processingStep, setProcessingStep] = useState("initial");

  // ブロック検出用の状態
  const [detectedScssBlocks, setDetectedScssBlocks] = useState([]);
  const [detectedHtmlBlocks, setDetectedHtmlBlocks] = useState([]);
  const [selectedScssBlock, setSelectedScssBlock] = useState(null);
  const [showBlockDetails, setShowBlockDetails] = useState(false);
  const [blockNameValidationError, setBlockNameValidationError] = useState(""); // バリデーションエラー用のstate

  // HTMLファイル一覧の取得
  useEffect(() => {
    const fetchHtmlFiles = async () => {
      try {
        const files = await window.api.getHtmlFiles();
        // ファイルリストを逆順に並べ替え（最新のファイルが上に表示されるように）
        const reversedFiles = [...files].reverse();
        setHtmlFiles(reversedFiles);
        if (reversedFiles.length > 0) {
          setSelectedHtmlFile(reversedFiles[0]);
        }
      } catch (error) {
        console.error("HTMLファイル一覧の取得中にエラーが発生しました:", error);
      }
    };

    fetchHtmlFiles();
  }, []);

  // コード生成完了時にブロック検出を実行
  useEffect(() => {
    if (generatedCSS && generatedHTML && !isPreventingReload) {
      // SCSSブロックの検出
      const scssBlocks = detectScssBlocks(generatedCSS);
      setDetectedScssBlocks(scssBlocks);

      // HTMLブロックの検出
      const htmlBlocks = detectHtmlBlocks(generatedHTML);
      setDetectedHtmlBlocks(htmlBlocks);

      // 最初に検出されたHTMLブロックをデフォルトのブロック名に設定
      if (htmlBlocks.length > 0 && !blockName) {
        setBlockName(htmlBlocks[0].name);
      }

      console.log("検出されたSCSSブロック:", scssBlocks);
      console.log("検出されたHTMLブロック:", htmlBlocks);
    }
  }, [generatedCSS, generatedHTML, isPreventingReload, blockName]);

  // ブロック名が入力されたときの処理
  const handleBlockNameChange = (e) => {
    const newValue = e.target.value;
    setBlockName(newValue);

    // ブロック名のバリデーション
    validateBlockName(newValue);
  };

  // ブロック名のバリデーション関数
  const validateBlockName = (name) => {
    if (!name.trim()) {
      const errorMsg = "ブロック名を入力してください";
      setBlockNameValidationError(errorMsg);
      setSaveError(errorMsg);
      return false;
    } else if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      const errorMsg = "ブロック名には英数字、ハイフン、アンダースコアのみ使用できます";
      setBlockNameValidationError(errorMsg);
      setSaveError(errorMsg);
      return false;
    } else {
      setBlockNameValidationError("");
      return true;
    }
  };

  // HTML選択時の処理
  const handleHtmlFileSelect = (e) => {
    setSelectedHtmlFile(e.target.value);
  };

  // ブロックを除外/含める処理
  const handleExcludeBlock = (blockName) => {
    setExcludedBlocks(prev => {
      if (prev.includes(blockName)) {
        // 除外リストから削除（含める）
        return prev.filter(name => name !== blockName);
      } else {
        // 除外リストに追加（除外する）
        return [...prev, blockName];
      }
    });
  };

  // ブロックが除外されているかチェック
  const isBlockExcluded = (blockName) => {
    return excludedBlocks.includes(blockName);
  };

  // SCSSブロックの選択処理
  const handleScssBlockSelect = (blockName) => {
    // 選択されたメインブロックに関連するすべてのブロック（エレメントと擬似クラスを含む）を取得
    const mainBlockCode = detectedScssBlocks.find(block => block.name === blockName);

    // メインブロックに関連するすべてのエレメントと擬似クラスを見つける
    const relatedElements = detectedScssBlocks.filter(block =>
      block.name.startsWith(blockName + '__') || // エレメント
      block.name === blockName ||
      (block.name.startsWith(blockName + ':') && block.name.indexOf('__') === -1) // 擬似クラス（エレメントの擬似クラスは除外）
    );

    // 擬似クラスのブロック
    const pseudoClasses = detectedScssBlocks.filter(block =>
      block.name.startsWith(blockName + ':') && block.name.indexOf('__') === -1
    );

    // エレメントのみのブロック（擬似クラスなし）
    const elements = relatedElements.filter(block =>
      block.name.startsWith(blockName + '__') && block.name !== blockName
    );

    // メインブロックとその関連エレメントをすべて含む統合コード
    const fullBlockCode = {
      name: blockName,
      code: mainBlockCode.code,
      pseudoClasses: pseudoClasses, // 擬似クラスを分けて格納
      elements: elements // エレメントを格納
    };

    setSelectedScssBlock(fullBlockCode);
    setShowBlockDetails(true);
    // モーダル表示時にスクロールをロック
    document.body.style.overflow = 'hidden';
  };

  // ブロック詳細表示を閉じる
  const handleCloseBlockDetails = () => {
    setShowBlockDetails(false);
    // スクロールロック解除
    document.body.style.overflow = 'auto';
  };

  // モーダル外クリック時の処理
  const handleModalBackdropClick = (e) => {
    // モーダルの背景部分のみがクリックされた場合に閉じる
    if (e.target.className === 'block-details-modal') {
      handleCloseBlockDetails();
    }
  };

  // AI生成コードの保存処理
  const handleSaveCode = async () => {
    if (!blockName.trim()) {
      setSaveError("ブロック名を入力してください");
      setSaveSuccess(false);
      return;
    }

    if (!selectedHtmlFile) {
      setSaveError("HTMLファイルを選択してください");
      setSaveSuccess(false);
      return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(null);
    // リロード防止フラグを設定
    setIsPreventingReload(true);
    // preload.jsにも通知して全体的なリロード防止を有効にする
    if (window.api && window.api.setPreventReload) {
      window.api.setPreventReload(true);
    }

    try {
      // 除外されていないメインブロックを特定
      const mainBlocks = detectedScssBlocks.filter(block => {
        // ブロック名にアンダースコアがなく、コロンもない場合はメインブロック
        return !block.name.includes('__') &&
          !block.name.includes(':') &&
          !excludedBlocks.includes(block.name);
      });

      if (mainBlocks.length === 0) {
        setSaveSuccess(false);
        setSaveError("保存するメインブロックがありません。すべてのブロックが除外されているか、メインブロックが検出されていません。");
        setIsSaving(false);

        // リロード防止フラグを解除（遅延して解除）
        setTimeout(() => {
          setIsPreventingReload(false);
          if (window.api && window.api.setPreventReload) {
            window.api.setPreventReload(false);
          }
        }, 500);

        return;
      }

      // すべてのファイルの衝突情報を収集
      const conflictChecks = await Promise.all(mainBlocks.map(async (mainBlock) => {
        const fileCheck = await window.api.checkFileExists(mainBlock.name);
        return {
          block: mainBlock,
          fileExists: fileCheck.fileExists
        };
      }));

      // HTMLの衝突確認（HTMLはメインブロックのみ）
      const mainBlockForHtml = mainBlocks.find(block => block.name === blockName);
      const htmlFileCheck = mainBlockForHtml ?
        conflictChecks.find(check => check.block.name === mainBlockForHtml.name) : null;
      const htmlConflict = htmlFileCheck && htmlFileCheck.fileExists.html && editingHTML;

      // SCSSの衝突確認
      const scssConflicts = conflictChecks.filter(check => check.fileExists.scss);
      const hasScssConflicts = scssConflicts.length > 0;

      // 衝突がある場合、リネームダイアログを表示
      if (hasScssConflicts || htmlConflict) {
        // 衝突しているブロックと衝突していないブロックを分離
        const conflictingBlocks = conflictChecks.filter(check =>
          check.fileExists.scss || (check.block.name === blockName && check.fileExists.html && editingHTML)
        ).map(check => check.block);

        const nonConflictingBlocks = conflictChecks.filter(check =>
          !check.fileExists.scss && !(check.block.name === blockName && check.fileExists.html && editingHTML)
        ).map(check => check.block);

        // 衝突情報を設定
        setConflictInfo({
          originalBlockName: blockName,
          scssCode: editingCSS,
          htmlCode: editingHTML,
          fileExists: htmlFileCheck ? htmlFileCheck.fileExists : { scss: false, html: false }
        });

        // 複数ファイル処理用の状態を設定
        setConflictingScssBlocks(conflictingBlocks);
        setNonConflictingScssBlocks(nonConflictingBlocks);

        // 初期リネーム情報を設定
        const initialRenameMap = {};
        const initialSaveMap = {};

        conflictingBlocks.forEach(block => {
          initialRenameMap[block.name] = `${block.name}-new`;
          initialSaveMap[block.name] = true;
        });

        setBlockRenameMap(initialRenameMap);
        setBlockSaveMap(initialSaveMap);

        // HTMLの設定
        setNewBlockName(blockName + '-new');
        setNewHtmlBlockName(blockName + '-new');

        // 衝突エラーメッセージを設定
        setBlockValidationErrors({
          '_general': 'ファイル名が競合しています。新しい名前を入力するか、保存しないブロックのチェックを外してください。'
        });

        // ダイアログを表示
        setShowRenameDialog(true);
        setProcessingStep("initial");
        document.body.style.overflow = 'hidden';
        setIsSaving(false);

        // ダイアログを表示する場合は、リロード防止は継続
        return;
      }

      // 衝突がない場合は直接保存処理へ
      await saveNonConflictingBlocks(mainBlocks, blockName, editingHTML, selectedHtmlFile);
    } catch (error) {
      console.error("AI生成コードの保存中にエラーが発生しました:", error);
      setSaveSuccess(false);
      setSaveError(error.message || "保存中にエラーが発生しました");

      // エラー時はリロード防止フラグを解除
      setTimeout(() => {
        setIsPreventingReload(false);
        if (window.api && window.api.setPreventReload) {
          window.api.setPreventReload(false);
        }
      }, 500);
    } finally {
      setIsSaving(false);
    }
  };

  // 衝突していないブロックを保存する関数
  const saveNonConflictingBlocks = async (blocks, mainHtmlBlockName, htmlCode, targetHtmlFile) => {
    try {
      // リロード防止フラグを設定
      setIsPreventingReload(true);
      // preload.jsにも通知して全体的なリロード防止を有効にする
      if (window.api && window.api.setPreventReload) {
        window.api.setPreventReload(true);
      }

      // 保存対象のブロックを絞り込み（非衝突ブロックの場合、衝突時用のUIで選択されていない場合はスキップ）
      // 通常モードで呼ばれた場合は、blockSaveMapが空なので全てのブロックが対象となる
      const blocksToSave = blocks.filter(mainBlock => {
        // 衝突処理中で、かつそのブロックが保存対象外にチェックされている場合はスキップ
        if (Object.keys(blockSaveMap).length > 0 && blockSaveMap[mainBlock.name] === false) {
          return false;
        }
        return true;
      });

      if (blocksToSave.length === 0) {
        // 保存対象が0の場合は成功として扱う（ユーザーがすべてのチェックを外した場合）
        setSaveSuccess(true);
        setSaveError(`コードを保存しました！（SCSSファイル: 0個、HTMLファイル: 0個）`);
        return;
      }

      // 各メインブロックごとに処理
      const savePromises = blocksToSave.map(async (mainBlock) => {
        // メインブロックに関連するすべてのエレメントと擬似クラスを取得（ただし現在の検出結果を使用し、再検出はしない）
        const relatedBlocks = detectedScssBlocks.filter(block => {
          // 除外されたブロックはスキップ
          if (excludedBlocks.includes(block.name)) return false;

          // メインブロックと同じか、メインブロックから派生したものか
          return block.name === mainBlock.name ||
            block.name.startsWith(mainBlock.name + '__') ||
            (block.name.startsWith(mainBlock.name + ':') && !block.name.includes('__'));
        });

        // 全ブロックのコードを1つにまとめる
        const combinedScssCode = relatedBlocks.map(block => block.code).join('\n\n');

        // メインブロックのみHTMLを保存し、他のブロックではHTMLは空文字
        const htmlToSave = mainBlock.name === mainHtmlBlockName ? htmlCode : "";
        const targetHtmlFileToUse = mainBlock.name === mainHtmlBlockName ? targetHtmlFile : null;

        // 保存処理を実行
        return await window.api.saveAIGeneratedCode(
          combinedScssCode,      // 統合されたSCSSコード
          htmlToSave,            // 選択されたブロックのみHTMLを保存
          mainBlock.name,        // メインブロック名
          targetHtmlFileToUse    // 選択されたブロックのみHTMLファイルに追加
        );
      });

      const results = await Promise.all(savePromises);

      // 少なくとも1つの保存が成功したか
      const hasAnySuccess = results.some(result => result.success || result.partialSuccess);
      // すべての保存が失敗したか
      const hasAllFailed = results.every(result => !result.success && !result.partialSuccess);

      // 少なくとも1つの保存が成功した場合
      if (hasAnySuccess) {
        // 保存されたブロック数をカウント
        const savedBlocksCount = results.filter(result =>
          result.success ||
          (result.partialSuccess && (result.savedFiles?.scss || result.savedFiles?.html))
        ).length;

        // 保存されたSCSSファイル数とHTMLファイル数を個別にカウント
        const savedScssFilesCount = results.filter(result =>
          (result.success || result.partialSuccess) && result.savedFiles?.scss
        ).length;

        const savedHtmlFilesCount = results.filter(result =>
          (result.success || result.partialSuccess) && result.savedFiles?.html
        ).length;

        // グローバルステート変数に保存
        setSavedScssFilesCount(savedScssFilesCount);
        setSavedHtmlFilesCount(savedHtmlFilesCount);

        setSaveSuccess(true);
        setSaveError(`コードを保存しました！（SCSSファイル: ${savedScssFilesCount}個、HTMLファイル: ${savedHtmlFilesCount}個）`);
      } else if (hasAllFailed) {
        // すべての保存が失敗した場合
        const errorMessages = results
          .filter(result => result.error)
          .map(result => result.error)
          .join(", ");

        setSaveSuccess(false);
        setSaveError(`保存中にエラーが発生しました: ${errorMessages}`);

        // モーダル内にエラーを表示
        setBlockValidationErrors(prev => ({
          ...prev,
          '_general': `保存中にエラーが発生しました: ${errorMessages}`
        }));
      }
    } catch (error) {
      console.error("非衝突ブロックの保存中にエラーが発生しました:", error);
      setSaveSuccess(false);
      setSaveError(error.message || "保存中にエラーが発生しました");

      // モーダル内にエラーを表示
      setBlockValidationErrors(prev => ({
        ...prev,
        '_general': error.message || "保存中にエラーが発生しました"
      }));

      throw error;
    } finally {
      // 保存処理完了後にフラグを解除（少し遅延させる）
      setTimeout(() => {
        setIsPreventingReload(false);
        // preload.jsにも通知
        if (window.api && window.api.setPreventReload) {
          window.api.setPreventReload(false);
        }
      }, 1500);
    }
  };

  // リネームダイアログの処理
  const handleCloseRenameDialog = () => {
    setShowRenameDialog(false);
    document.body.style.overflow = '';

    // リロード防止フラグの解除（遅延して解除）
    setTimeout(() => {
      setIsPreventingReload(false);
      if (window.api && window.api.setPreventReload) {
        window.api.setPreventReload(false);
      }
    }, 500);

    // 衝突情報をリセット
    setConflictInfo(null);
    setConflictingScssBlocks([]);
    setNonConflictingScssBlocks([]);

    resetFileConflictState();
    setNewBlockName('');
    setNewHtmlBlockName('');
    setBlockValidationErrors({});
  };

  // リネームダイアログのレンダリング
  const renderRenameDialog = () => {
    if (!showRenameDialog) return null;

    return (
      <div className="rename-dialog-overlay" onClick={handleRenameDialogBackdropClick}>
        <div className="rename-dialog">
          <div className="rename-dialog-header">
            <h3>ファイル競合の解決</h3>
            <button
              className="close-button"
              onClick={() => {
                handleCloseRenameDialog();
                // ダイアログを閉じる際にリロード防止フラグを解除
                setTimeout(() => {
                  setIsPreventingReload(false);
                  if (window.api && window.api.setPreventReload) {
                    window.api.setPreventReload(false);
                  }
                }, 500);
              }}
            >
              ×
            </button>
          </div>
          <div className="rename-dialog-content">
            <div className="conflict-description">
              <p>保存しようとしているファイル名が既に存在しています。以下の選択肢から選んでください：</p>
              <ul>
                <li>新しいファイル名を入力する</li>
                <li>保存しないブロックのチェックを外す</li>
              </ul>
            </div>

            {/* バリデーションエラーメッセージ */}
            {Object.keys(blockValidationErrors).length > 0 && (
              <div className="validation-errors">
                {Object.entries(blockValidationErrors).map(([key, error]) => (
                  <div key={key} className="validation-error">{error}</div>
                ))}
              </div>
            )}

            {/* SCSSファイルの衝突リスト */}
            {conflictingScssBlocks.length > 0 && (
              <div className="conflict-files-list">
                <h4>SCSSファイルの競合</h4>
                {conflictingScssBlocks.map((block) => (
                  <div key={block.name} className="conflict-file-item">
                    <div className="conflict-file-info">
                      <div className="conflict-checkbox">
                        <input
                          type="checkbox"
                          id={`save-${block.name}`}
                          checked={blockSaveMap[block.name] || false}
                          onChange={() => toggleBlockSave(block.name)}
                        />
                        <label htmlFor={`save-${block.name}`}>保存する</label>
                      </div>

                      <div className="conflict-details">
                        <div className="conflict-file-name">
                          <span className="label">現在のファイル名:</span>
                          <code>{block.name}.scss</code>
                        </div>

                        {blockSaveMap[block.name] && (
                          <div className="conflict-new-name">
                            <span className="label">新しいファイル名:</span>
                            <input
                              type="text"
                              value={blockRenameMap[block.name] || ''}
                              onChange={(e) => updateBlockNewName(block.name, e.target.value)}
                              placeholder="新しいブロック名"
                              className={blockValidationErrors[block.name] ? 'has-error' : ''}
                            />
                            <span className="ext">.scss</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {blockValidationErrors[block.name] && (
                      <div className="conflict-error">{blockValidationErrors[block.name]}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* HTMLファイルの衝突情報 */}
            {conflictInfo && conflictInfo.fileExists && conflictInfo.fileExists.html && (
              <div className="conflict-files-list">
                <h4>HTMLファイルの競合</h4>
                <div className="conflict-file-item">
                  <div className="conflict-file-info">
                    <div className="conflict-checkbox">
                      <input
                        type="checkbox"
                        id="save-html-file"
                        checked={saveHtmlFile}
                        onChange={(e) => setSaveHtmlFile(e.target.checked)}
                      />
                      <label htmlFor="save-html-file">HTMLファイルを保存する</label>
                    </div>

                    <div className="conflict-details">
                      <div className="conflict-file-name">
                        <span className="label">現在のファイル名:</span>
                        <code>{conflictInfo.originalBlockName}.html</code>
                      </div>

                      {saveHtmlFile && (
                        <div className="conflict-new-name">
                          <span className="label">新しいファイル名:</span>
                          <input
                            type="text"
                            value={newHtmlBlockName}
                            onChange={(e) => {
                              setNewHtmlBlockName(e.target.value);
                              // HTML入力時にエラーをクリア
                              setBlockValidationErrors(prev => {
                                const updated = { ...prev };
                                delete updated['html'];
                                return updated;
                              });
                            }}
                            placeholder="新しいHTMLブロック名"
                            className={blockValidationErrors['html'] ? 'has-error' : ''}
                          />
                          <span className="ext">.html</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {blockValidationErrors['html'] && (
                    <div className="conflict-error">{blockValidationErrors['html']}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rename-dialog-footer">
            <button
              className="cancel-button"
              onClick={handleCloseRenameDialog}
              disabled={isRenaming}
            >
              キャンセル
            </button>
            <button
              className={`save-button ${isRenaming ? 'loading' : ''}`}
              onClick={handleRenameAndSave}
              disabled={isRenaming}
            >
              {isRenaming ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // リネームダイアログ外クリック時の処理
  const handleRenameDialogBackdropClick = (e) => {
    // ダイアログ処理中は何もしない
    if (isRenaming) return;

    // ダイアログの背景部分のみがクリックされた場合に閉じる
    if (e.target.className === 'rename-dialog-overlay') {
      handleCloseRenameDialog();
    }
  };

  // リネームして保存処理
  const handleRenameAndSave = async () => {
    // HTMLファイルのみが衝突していて、保存しない場合はSCSSのみ保存処理へ
    if (conflictInfo && conflictInfo.fileExists.html && !conflictInfo.fileExists.scss && !saveHtmlFile) {
      handleSaveWithoutHtml();
      return;
    }

    setIsRenaming(true);
    setSaveError("");
    // リロード防止フラグを設定
    setIsPreventingReload(true);
    // preload.jsにも通知
    if (window.api && window.api.setPreventReload) {
      window.api.setPreventReload(true);
    }

    try {
      // 複数SCSSファイルの処理
      if (conflictingScssBlocks.length > 0) {
        // バリデーションチェック
        const errors = {};
        let hasError = false;

        // 保存対象の衝突ブロックのバリデーション
        for (const block of conflictingScssBlocks) {
          if (blockSaveMap[block.name]) {
            const newName = blockRenameMap[block.name];
            if (!newName || !newName.trim()) {
              errors[block.name] = `ブロック "${block.name}" の新しい名前を入力してください`;
              hasError = true;
            } else {
              // 無効な文字のチェック
              const invalidChars = /[^a-zA-Z0-9-_]/g;
              if (invalidChars.test(newName)) {
                errors[block.name] = `ブロック "${block.name}" の名前には英数字、ハイフン、アンダースコアのみ使用できます`;
                hasError = true;
              }
            }
          }
        }

        // HTMLのバリデーション（保存する場合）
        if (conflictInfo.fileExists.html && saveHtmlFile) {
          if (!newHtmlBlockName || !newHtmlBlockName.trim()) {
            errors['html'] = "HTMLファイルの新しいブロック名を入力してください";
            hasError = true;
          } else {
            const invalidChars = /[^a-zA-Z0-9-_]/g;
            if (invalidChars.test(newHtmlBlockName)) {
              errors['html'] = "HTMLブロック名には英数字、ハイフン、アンダースコアのみ使用できます";
              hasError = true;
            }
          }
        }

        // エラーがある場合は処理を中止
        if (hasError) {
          setBlockValidationErrors(errors);
          setIsRenaming(false);

          // バリデーションエラー時もリロード防止フラグを維持（ダイアログは表示したまま）
          return;
        }

        // 保存処理の実行

        // 1. 衝突していないブロックを先に保存
        if (nonConflictingScssBlocks.length > 0) {
          await saveNonConflictingBlocks(
            nonConflictingScssBlocks,
            conflictInfo.originalBlockName === nonConflictingScssBlocks[0].name ? conflictInfo.originalBlockName : null,
            conflictInfo.originalBlockName === nonConflictingScssBlocks[0].name ? conflictInfo.htmlCode : "",
            selectedHtmlFile
          );
        }

        // 2. 衝突しているブロックを保存
        if (conflictingScssBlocks.length > 0) {
          await saveConflictingBlocks(conflictingScssBlocks, conflictInfo.originalBlockName, conflictInfo.scssCode, conflictInfo.htmlCode, selectedHtmlFile);
        }
      } else {
        // 衝突しているブロックがない場合は、通常の保存処理を実行
        await saveNonConflictingBlocks(mainBlocks, blockName, editingHTML, selectedHtmlFile);
      }
    } catch (error) {
      console.error("リネームと保存中にエラーが発生しました:", error);
      setSaveSuccess(false);
      setSaveError(error.message || "保存中にエラーが発生しました");

      // エラーメッセージをモーダル内に表示
      setBlockValidationErrors(prev => ({
        ...prev,
        '_general': error.message || "保存中にエラーが発生しました"
      }));
    } finally {
      setIsRenaming(false);
      // リロード防止フラグを解除
      setIsPreventingReload(false);
    }
  };

  // 衝突しているブロックを保存する関数
  const saveConflictingBlocks = async (blocks, originalBlockName, scssCode, htmlCode, targetHtmlFile) => {
    try {
      // リロード防止フラグを設定
      setIsPreventingReload(true);
      // preload.jsにも通知して全体的なリロード防止を有効にする
      if (window.api && window.api.setPreventReload) {
        window.api.setPreventReload(true);
      }

      // 保存対象のブロックを絞り込み（チェックボックスがオンのもののみ）
      const blocksToSave = blocks.filter(block => blockSaveMap[block.name]);

      if (blocksToSave.length === 0) {
        // 保存対象が0の場合は成功として扱う（ユーザーがすべてのチェックを外した場合）
        setSaveSuccess(true);
        setSaveError(`コードを保存しました！（SCSSファイル: 0個、HTMLファイル: 0個）`);
        return;
      }

      const savePromises = blocksToSave.map(async (block) => {
        const newName = blockRenameMap[block.name] || block.name;
        return await window.api.saveAIGeneratedCode(
          block.code,
          htmlCode,
          newName,
          targetHtmlFile
        );
      });

      const results = await Promise.all(savePromises);

      // 少なくとも1つの保存が成功したか
      const hasAnySuccess = results.some(result => result.success || result.partialSuccess);
      // すべての保存が失敗したか
      const hasAllFailed = results.every(result => !result.success && !result.partialSuccess);

      // 少なくとも1つの保存が成功した場合
      if (hasAnySuccess) {
        // 保存されたSCSSファイル数とHTMLファイル数をカウント
        const savedScssFilesCount = results.filter(result =>
          (result.success || result.partialSuccess) && result.savedFiles?.scss
        ).length;

        const savedHtmlFilesCount = results.filter(result =>
          (result.success || result.partialSuccess) && result.savedFiles?.html
        ).length;

        // グローバルステート変数に保存
        setSavedScssFilesCount(savedScssFilesCount);
        setSavedHtmlFilesCount(savedHtmlFilesCount);

        setSaveSuccess(true);
        setSaveError(`コードを保存しました！（SCSSファイル: ${savedScssFilesCount}個、HTMLファイル: ${savedHtmlFilesCount}個）`);

        // 全ての保存処理が終了したら、モーダルを閉じる
        handleCloseRenameDialog();
      } else if (hasAllFailed) {
        // すべての保存が失敗した場合
        const errorMessages = results
          .filter(result => result.error)
          .map(result => result.error)
          .join(", ");

        setSaveSuccess(false);
        setSaveError(`保存中にエラーが発生しました: ${errorMessages}`);
      }
    } catch (error) {
      console.error("衝突ブロックの保存中にエラーが発生しました:", error);
      setSaveSuccess(false);
      setSaveError(error.message || "保存中にエラーが発生しました");
    } finally {
      // 保存処理完了後にフラグを解除（少し遅延させる）
      setTimeout(() => {
        setIsPreventingReload(false);
        // preload.jsにも通知
        if (window.api && window.api.setPreventReload) {
          window.api.setPreventReload(false);
        }
      }, 1500);
    }
  };

  // HTMLファイルを保存せずにSCSSのみ保存する処理
  const handleSaveWithoutHtml = async () => {
    setIsRenaming(true);
    setSaveError("");
    // リロード防止フラグを設定
    setIsPreventingReload(true);

    try {
      // 除外されていないメインブロックを特定
      const mainBlocks = detectedScssBlocks.filter(block => {
        // ブロック名にアンダースコアがなく、コロンもない場合はメインブロック
        return !block.name.includes('__') &&
          !block.name.includes(':') &&
          !excludedBlocks.includes(block.name);
      });

      if (mainBlocks.length === 0) {
        setSaveSuccess(false);
        setSaveError("保存するメインブロックがありません。すべてのブロックが除外されているか、メインブロックが検出されていません。");
        return;
      }

      // すべてのファイルの衝突情報を収集
      const conflictChecks = await Promise.all(mainBlocks.map(async (mainBlock) => {
        const fileCheck = await window.api.checkFileExists(mainBlock.name);
        return {
          block: mainBlock,
          fileExists: fileCheck.fileExists
        };
      }));

      // SCSSの衝突確認
      const scssConflicts = conflictChecks.filter(check => check.fileExists.scss);
      const hasScssConflicts = scssConflicts.length > 0;

      // 衝突がある場合、リネームダイアログを表示
      if (hasScssConflicts) {
        // 衝突しているブロックと衝突していないブロックを分離
        const conflictingBlocks = conflictChecks.filter(check =>
          check.fileExists.scss || (check.block.name === blockName && check.fileExists.html && editingHTML)
        ).map(check => check.block);

        const nonConflictingBlocks = conflictChecks.filter(check =>
          !check.fileExists.scss && !(check.block.name === blockName && check.fileExists.html && editingHTML)
        ).map(check => check.block);

        // 衝突情報を設定
        setConflictInfo({
          originalBlockName: blockName,
          scssCode: editingCSS,
          htmlCode: editingHTML,
          fileExists: { scss: true, html: false }
        });

        // 複数ファイル処理用の状態を設定
        setConflictingScssBlocks(conflictingBlocks);
        setNonConflictingScssBlocks(nonConflictingBlocks);

        // 初期リネーム情報を設定
        const initialRenameMap = {};
        const initialSaveMap = {};

        conflictingBlocks.forEach(block => {
          initialRenameMap[block.name] = `${block.name}-new`;
          initialSaveMap[block.name] = true;
        });

        setBlockRenameMap(initialRenameMap);
        setBlockSaveMap(initialSaveMap);

        // ダイアログを表示
        setShowRenameDialog(true);
        setProcessingStep("initial");
        document.body.style.overflow = 'hidden';

        // HTMLファイルを保存せずにSCSSのみ保存する処理
        // ...
      }
    } catch (error) {
      console.error("保存中にエラーが発生しました:", error);
      setSaveSuccess(false);
      setSaveError(error.message || "保存中にエラーが発生しました");
    } finally {
      setIsSaving(false);
      setIsRenaming(false);
      // リロード防止フラグを解除
      setIsPreventingReload(false);
    }
  };

  // ブロックの保存有無切り替え
  const toggleBlockSave = (blockName) => {
    setBlockSaveMap(prev => ({
      ...prev,
      [blockName]: !prev[blockName]
    }));
  };

  // ブロックの新しい名前の更新
  const updateBlockNewName = (blockName, newName) => {
    setBlockRenameMap(prev => ({
      ...prev,
      [blockName]: newName
    }));
    // 入力時にそのブロックのエラーをクリア
    setBlockValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[blockName];
      return updated;
    });
  };

  // ファイル衝突状態をリセットする関数
  const resetFileConflictState = () => {
    setShowRenameDialog(false);
    setNewBlockName("");
    setNewHtmlBlockName("");
    setConflictInfo(null);
    setSaveHtmlFile(true);
  };

  // 保存処理が完了したら、savedCountを表示用のstate変数にも反映
  useEffect(() => {
    if (saveSuccess === true) {
      // 通知メッセージで使用されている値を明示的にステートにセット
      const match = saveError?.match(/SCSSファイル: (\d+)個、HTMLファイル: (\d+)個/);
      if (match) {
        setSavedScssFilesCount(parseInt(match[1], 10));
        setSavedHtmlFilesCount(parseInt(match[2], 10));
      }
    }
  }, [saveSuccess, saveError]);

  // HTMLファイルを保存せずにSCSSのみ保存する処理
  // ...

  // コンポーネントの初期化時にファイル変更検出のリスナーを設定
  useEffect(() => {
    // グローバルなデバウンス処理用変数
    if (!window.__reactFileEventCache) {
      window.__reactFileEventCache = {};
    }

    // ファイル変更リスナーのクリーンアップ用変数
    let fileChangeListenerCleanup = null;

    // ファイル変更リスナーの設定
    if (window.api && window.api.onFileChanged) {
      // リスナー関数を定義
      const handleFileChange = (data) => {
        // データ検証
        if (!data || !data.filename || !data.type) return;

        // イベントキーを生成
        const eventKey = `${data.filename}_${data.type}`;

        // グローバルなReactコンポーネント間でのデバウンス
        if (window.__reactFileEventCache[eventKey]) {
          return; // 他のコンポーネントで既に処理済みならスキップ
        }

        // このコンポーネントで処理済みとしてマーク
        window.__reactFileEventCache[eventKey] = true;

        // 一定時間後にキャッシュをクリア
        setTimeout(() => {
          delete window.__reactFileEventCache[eventKey];
        }, 1000);

        // ファイルタイプとフラグに関する詳細ログを出力
        console.log(
          `ファイル変更を検出: ${data.filename} - タイプ: ${data.type} - 保存処理中: ${isPreventingReload}`
        );

        // 保存処理中はファイル変更イベントを無視
        if (isPreventingReload) {
          console.log('保存処理中のため、ファイル変更イベントをスキップします');
          return;
        }

        // HTMLファイル変更時の処理
        if (data.type === 'html') {
          // 必要なコンポーネント更新処理があればここに記述
          // 例: HTMLファイルのリストを再取得する等
        }

        // SCSSファイル変更時の処理
        if (data.type === 'scss') {
          // 必要なコンポーネント更新処理があればここに記述
        }
      };

      // リスナーを登録し、クリーンアップ関数を保存
      fileChangeListenerCleanup = () => {
        // リスナー登録時に返されるクリーンアップ関数が存在すれば実行
        if (window.__removeFileChangedListener) {
          window.__removeFileChangedListener();
          window.__removeFileChangedListener = null;
        }
      };

      // リスナーを設定し、window.__removeFileChangedListenerにクリーンアップ関数を保存
      window.__removeFileChangedListener = window.api.onFileChanged(handleFileChange);
    }

    return () => {
      // コンポーネントのアンマウント時のクリーンアップ
      if (fileChangeListenerCleanup) {
        fileChangeListenerCleanup();
      }

      // APIの特性上、完全な解除は難しいが、フラグをリセットしておく
      if (window.api && window.api.setPreventReload) {
        window.api.setPreventReload(false);
      }
    };
    // isPreventingReload のみを依存配列に入れることで不要な再登録を防止
  }, [isPreventingReload]);

  // renderRenameDialogが既に存在する場合は修正し、存在しない場合は追加の修正を行う
  // コードの他の部分で実際にこのダイアログを表示している箇所を確認
  useEffect(() => {
    // 画面が閉じられる前にリロード防止フラグをチェック
    const handleBeforeUnload = (e) => {
      if (isPreventingReload) {
        e.preventDefault();
        e.returnValue = '変更が保存されていません。このページを離れてもよろしいですか？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isPreventingReload]);

  // リロード防止状態を解除する関数
  const resetPreventReload = () => {
    setIsPreventingReload(false);
    if (window.api && window.api.setPreventReload) {
      window.api.setPreventReload(false);
    }
  };

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
              <button
                className="remove-image-button"
                onClick={(e) => handleRemovePcImage(e)}
              >
                <span>×</span>
              </button>
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
              <button
                className="remove-image-button"
                onClick={(e) => handleRemoveSpImage(e)}
              >
                <span>×</span>
              </button>
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

      <div className="upload-info">
        <p>※ 画像の最大サイズ: 4MB</p>
        <p>※ 対応フォーマット: JPG, PNG, WEBP</p>
        <p>※ 4MB以上の画像は自動的にリサイズされます（最大幅1920px）</p>
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

      <div className="action-buttons">
        <button
          className={`generate-button ${loading ? 'loading' : ''}`}
          onClick={handleGenerateCode}
          disabled={loading || (!pcImage && !spImage)}
        >
          {loading ? (
            <div className="loading-container">
              <div className="loading-progress">
                <div
                  className="loading-progress-bar"
                  style={{ width: `${loadingProgress}%` }}
                ></div>
                <div className="loading-stage">{loadingStage}</div>
                <div className="loading-percentage">{Math.round(loadingProgress)}%</div>
              </div>
            </div>
          ) : "✨ コードを生成"}
        </button>
      </div>

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
          {/* コード保存UI - タブの上に移動 */}
          <div className="code-save-container">
            <h3>コードを保存</h3>

            {/* 検出されたブロック情報の表示 */}
            {detectedScssBlocks.length > 0 && (
              <div className="detected-blocks-section">
                <h4>検出されたブロック</h4>
                <div className="detected-blocks-list">
                  {detectedScssBlocks
                    // メインブロックのみをフィルタリング（__を含まないブロック名）
                    .filter(block => !block.name.includes('__'))
                    // 擬似クラスをフィルタリング（:を含むブロック名は除外）
                    .filter(block => !block.name.includes(':'))
                    // 重複するブロック名を除去（一意のブロック名のみ表示）
                    .filter((block, index, self) =>
                      index === self.findIndex(b => b.name === block.name)
                    )
                    .map((block) => (
                      <div
                        key={block.name}
                        className={`detected-block-item ${blockName === block.name ? 'selected' : ''} ${isBlockExcluded(block.name) ? 'excluded' : ''}`}
                        onClick={() => handleScssBlockSelect(block.name)}
                      >
                        <span className="block-name">{block.name}</span>
                        <span className="block-info">SCSSブロック</span>

                        <div className="block-actions">
                          <button
                            className="view-block-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScssBlockSelect(block.name);
                            }}
                            title="詳細を表示"
                          >
                            詳細
                          </button>

                          {isBlockExcluded(block.name) ? (
                            <button
                              className="include-block-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExcludeBlock(block.name);
                              }}
                              title="保存対象に戻す"
                            >
                              保存対象に戻す
                            </button>
                          ) : (
                            <button
                              className="exclude-block-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExcludeBlock(block.name);
                              }}
                              title="保存対象から除外"
                            >
                              保存対象から除外
                            </button>
                          )}
                        </div>

                        {isBlockExcluded(block.name) && (
                          <div className="excluded-label">保存対象外</div>
                        )}
                      </div>
                    ))}
                </div>
                <small className="input-help">
                  検出されたSCSSブロックは各々1ファイルとして <code>src/scss/object/AI_Component/_ブロック名.scss</code> に保存されます。
                  <br />ファイル名が重複する場合は、保存時に新しい名前の入力が求められます。
                </small>

                {/* ブロック詳細モーダル */}
                {showBlockDetails && selectedScssBlock && (
                  <div className="block-details-modal" onClick={handleModalBackdropClick}>
                    <div className="block-details-content">
                      <div className="block-details-header">
                        <h4>{selectedScssBlock.name}の詳細</h4>
                        <button className="close-button" onClick={handleCloseBlockDetails}>×</button>
                      </div>
                      <div className="block-details-info">
                        <p>このブロックに含まれる全てのセレクタが表示されています。SCSS保存時にはこれらすべてが反映されます。</p>
                      </div>
                      <div className="block-code-preview">
                        <h5>メインブロック</h5>
                        <pre>{selectedScssBlock.code}</pre>

                        {/* 擬似クラスの表示 */}
                        {selectedScssBlock.pseudoClasses && selectedScssBlock.pseudoClasses.length > 0 && (
                          <div className="block-elements">
                            <h5>擬似クラス ({selectedScssBlock.pseudoClasses.length})</h5>
                            {selectedScssBlock.pseudoClasses.map((element, index) => (
                              <div key={index} className="element-code">
                                <div className="element-name">{element.name}</div>
                                <pre>{element.code}</pre>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 関連エレメントの表示 */}
                        {selectedScssBlock.elements && selectedScssBlock.elements.length > 0 && (
                          <div className="block-elements">
                            <h5>エレメント ({selectedScssBlock.elements.length})</h5>
                            {selectedScssBlock.elements.map((element, index) => (
                              <div key={index} className="element-code">
                                <div className="element-name">{element.name}</div>
                                <pre>{element.code}</pre>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="save-form">
              <div className="form-group">
                <label htmlFor="block-name">メインブロック名:</label>
                <input
                  type="text"
                  id="block-name"
                  value={blockName}
                  onChange={handleBlockNameChange}
                  placeholder="例: header-section"
                  className="block-name-input"
                  disabled={isSaving}
                />
                {blockNameValidationError && (
                  <div className="validation-error">{blockNameValidationError}</div>
                )}
                <small className="input-help">
                  このブロック名のHTMLがパーツファイルとして<code>src/partsHTML/{blockName}.html</code>に保存され、選択した追加先HTMLファイルに追加されます。<br />ファイル名が重複する場合は、保存時に新しい名前の入力が求められます。
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="html-file">追加先HTMLファイル:</label>
                <select
                  id="html-file"
                  value={selectedHtmlFile}
                  onChange={handleHtmlFileSelect}
                  className="html-file-select"
                  disabled={isSaving}
                >
                  {htmlFiles.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
                <small className="input-help">
                  選択したHTMLファイルの&lt;/main&gt;タグ直前に{`{{> ${blockName} }}`}が追加されます。
                </small>
              </div>

              <button
                className={`save-code-button ${isSaving ? 'saving' : ''}`}
                onClick={handleSaveCode}
                disabled={isSaving || !editingHTML || !editingCSS || detectedScssBlocks.length === 0 || Boolean(blockNameValidationError)}
              >
                {isSaving ? "保存中..." : "コードを保存"}
              </button>

              {saveSuccess !== null && (
                <div className={`save-status ${saveSuccess ? 'success' : 'error'}`}>
                  {saveSuccess
                    ? `コードを保存しました！（SCSSファイル: ${savedScssFilesCount || 0}個、HTMLファイル: ${savedHtmlFilesCount || 0}個）`
                    : `エラー: ${saveError}`}
                </div>
              )}
            </div>
          </div>

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

          <div
            className="preview-container"
            ref={previewContainerRef}
          >
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
                transform: previewWidth > 1000 ? `scale(calc(1022/${previewWidth}))` : 'none', // 1000px以下ではスケールを適用しない
                transformOrigin: 'top left',
                height: `${Number(iframeHeight) + 20}px`,
                minHeight: `${(Math.max(400, iframeHeight) + 20) * (previewWidth > 1000 ? (1022 / previewWidth) : 1)}px` // 1000px以下では通常の高さを使用
              }}
            >
              <iframe
                ref={previewRef}
                title="Preview"
                className="preview-iframe"
                style={{
                  width: `${previewWidth}px`,
                  height: `${iframeHeight}px`,
                  overflow: 'auto'
                }}
                scrolling="auto"
              ></iframe>
            </div>
          </div>

          {showGeneratedCode && (
            <div className="regenerate-form">
              <h3>コードの再生成・分析</h3>
              <p className="regenerate-info">
                生成されたコードに対して修正指示や分析依頼ができます。「分析」「確認」などの単語を含めると分析モードになります。
              </p>
              <textarea
                value={regenerateInstructions}
                onChange={(e) => setRegenerateInstructions(e.target.value)}
                className="regenerate-textarea"
                placeholder="例: ボタンの色を青に変更してください / 分析: このコードの問題点を指摘してください"
                rows={6}
              ></textarea>
              <button
                className={`regenerate-button ${loading ? 'loading' : ''}`}
                onClick={handleRegenerate}
                disabled={loading || !regenerateInstructions.trim()}
              >
                {loading ? (
                  <div className="loading-container">
                    <div className="loading-progress">
                      <div
                        className="loading-progress-bar"
                        style={{ width: `${loadingProgress}%` }}
                      ></div>
                      <div className="loading-stage">{loadingStage}</div>
                      <div className="loading-percentage">{Math.round(loadingProgress)}%</div>
                    </div>
                  </div>
                ) : "🔄 再生成"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* コード分析結果表示モーダル */}
      {showAnalysisModal && (
        <div className="analysis-modal-overlay">
          <div className="analysis-modal">
            <div className="analysis-modal-header">
              <h2>コード分析結果</h2>
              <button
                className="close-modal-button"
                onClick={() => setShowAnalysisModal(false)}
              >
                ×
              </button>
            </div>
            <div className="analysis-modal-content">
              <pre className="analysis-content">
                {analysisResult}
              </pre>
            </div>
            <div className="analysis-modal-footer">
              <button
                className="copy-analysis-button"
                onClick={() => {
                  navigator.clipboard.writeText(analysisResult);
                  alert("分析結果をクリップボードにコピーしました");
                }}
              >
                クリップボードにコピー
              </button>
              <button
                className="close-analysis-button"
                onClick={() => setShowAnalysisModal(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* リネームダイアログ */}
      {showRenameDialog && (
        <div className="rename-dialog-overlay" onClick={handleRenameDialogBackdropClick}>
          <div className="rename-dialog-content">
            <h3>ファイル名の競合</h3>

            {/* 一般的なエラーメッセージ */}
            {blockValidationErrors['_general'] && (
              <div className="general-error-message">
                <p className="validation-error">{blockValidationErrors['_general']}</p>
              </div>
            )}

            {/* 標準の競合メッセージ */}
            {!blockValidationErrors['_general'] && (
              <div className="conflict-message">
                <p>同名のファイルが既に存在します。保存する場合はリネームしてください。</p>
              </div>
            )}

            {/* プロセスステップ表示 */}
            {processingStep === "processing" && (
              <div className="processing-indicator">
                <div className="spinner"></div>
                <p>処理中...</p>
              </div>
            )}

            {/* HTML保存オプション（HTMLが衝突している場合のみ表示） */}
            {conflictInfo && conflictInfo.fileExists.html && (
              <div className="html-file-options">
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={saveHtmlFile}
                    onChange={(e) => setSaveHtmlFile(e.target.checked)}
                  />
                  <span className="checkbox-label">HTMLファイルも保存する</span>
                </label>
                <p className="option-description">
                  HTMLファイルを保存しない場合、SCSSファイルのみが保存されます。
                </p>

                {saveHtmlFile && (
                  <div className="new-name-input">
                    <p>新しいHTMLブロック名:</p>
                    <div className="input-group">
                      <input
                        type="text"
                        value={newHtmlBlockName}
                        onChange={(e) => setNewHtmlBlockName(e.target.value)}
                        placeholder="新しいブロック名を入力"
                        disabled={isRenaming}
                        className={blockValidationErrors['html'] ? 'error' : ''}
                      />
                      <span className="file-extension">.html</span>
                    </div>
                    {blockValidationErrors['html'] && (
                      <p className="validation-error">{blockValidationErrors['html']}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SCSSブロックリスト（複数ブロックの衝突がある場合） */}
            {conflictingScssBlocks.length > 0 && (
              <div className="scss-blocks-list">
                <h4>SCSSファイルの競合</h4>
                {conflictingScssBlocks.map((block) => (
                  <div key={block.name} className="scss-block-item">
                    <div className="block-header">
                      <label className="checkbox-container">
                        <input
                          type="checkbox"
                          checked={blockSaveMap[block.name] || false}
                          onChange={() => toggleBlockSave(block.name)}
                          disabled={isRenaming}
                        />
                        <span className="checkbox-label">{block.name}</span>
                      </label>
                    </div>

                    {blockSaveMap[block.name] && (
                      <div className="new-name-input">
                        <p>新しい名前:</p>
                        <div className="input-group">
                          <input
                            type="text"
                            value={blockRenameMap[block.name] || ''}
                            onChange={(e) => updateBlockNewName(block.name, e.target.value)}
                            placeholder="新しいブロック名を入力"
                            disabled={isRenaming}
                            className={blockValidationErrors[block.name] ? 'error' : ''}
                          />
                          <span className="file-extension">.scss</span>
                        </div>
                        {blockValidationErrors[block.name] && (
                          <p className="validation-error">{blockValidationErrors[block.name]}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="dialog-buttons">
              <button
                onClick={handleCloseRenameDialog}
                disabled={isRenaming}
                className="cancel-button"
              >
                キャンセル
              </button>
              <button
                onClick={handleRenameAndSave}
                disabled={isRenaming}
                className="save-button"
              >
                {isRenaming ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AICodeGenerator;
