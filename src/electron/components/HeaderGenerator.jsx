import React, { useState, useRef, useEffect } from 'react';
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
import '../styles/HeaderGenerator.css';
import 'highlight.js/styles/github.css';
import Header from './Header';
import CodeDisplay from './CodeDisplay';
import CodeGenerationSettings from './CodeGenerationSettings';
import { generateHeaderPrompt } from "../utils/headerPromptGenerator";
import { extractTextFromImage, extractColorsFromImage } from "../utils/imageAnalyzer.js";
import "../styles/AICodeGenerator.scss";

const LOCAL_STORAGE_KEY = "header_generator_state";

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

const HeaderGenerator = () => {
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

  // 画像アップロード用
  const [pcImage, setPcImage] = useState(null);
  const [spImage, setSpImage] = useState(null);
  const [pcImageBase64, setPcImageBase64] = useState("");
  const [spImageBase64, setSpImageBase64] = useState("");
  const [pcColors, setPcColors] = useState([]);
  const [spColors, setSpColors] = useState([]);
  const [pcText, setPcText] = useState("");
  const [spText, setSpText] = useState("");

  // 生成コード修正用のステート
  const [editingHTML, setEditingHTML] = useState("");
  const [editingCSS, setEditingCSS] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const previewRef = useRef(null);

  // プレビューサイズの状態
  const [previewWidth, setPreviewWidth] = useState(375);
  const [isDragging, setIsDragging] = useState(false);
  const previewContainerRef = useRef(null);
  const [customSizeInput, setCustomSizeInput] = useState("");
  const [showCustomSizeInput, setShowCustomSizeInput] = useState(false);
  const [scaleRatio, setScaleRatio] = useState(1);

  // iframeの高さを制御する状態
  const [iframeHeight, setIframeHeight] = useState(400);

  // ファイル入力の参照
  const fileInputRef = useRef(null);

  // 再生成処理用のステート
  const [regenerateInstructions, setRegenerateInstructions] = useState("");

  // useEffectを追加してブレークポイントを初期化
  useEffect(() => {
    // ローカルストレージからブレークポイント設定を取得
    try {
      const savedBreakpointsString = localStorage.getItem('breakpoints');
      if (savedBreakpointsString) {
        const savedBreakpoints = JSON.parse(savedBreakpointsString);
        setBreakpoints(savedBreakpoints);

        // AIブレークポイントを設定
        const initialAiBreakpoints = savedBreakpoints.map(bp => ({
          ...bp,
          aiActive: true // デフォルトですべて有効に
        }));
        setAiBreakpoints(initialAiBreakpoints);
      } else {
        // デフォルトのブレークポイント設定
        const defaultBreakpoints = [
          { name: 'sm', value: 600 },
          { name: 'md', value: 768 },
          { name: 'lg', value: 1024 }
        ];
        setBreakpoints(defaultBreakpoints);
        setAiBreakpoints(defaultBreakpoints.map(bp => ({ ...bp, aiActive: true })));
      }
    } catch (error) {
      console.error('ブレークポイント設定の読み込みエラー:', error);
      // エラー時のデフォルト設定
      const fallbackBreakpoints = [
        { name: 'sm', value: 600 },
        { name: 'md', value: 768 },
        { name: 'lg', value: 1024 }
      ];
      setBreakpoints(fallbackBreakpoints);
      setAiBreakpoints(fallbackBreakpoints.map(bp => ({ ...bp, aiActive: true })));
    }
  }, []);

  // iframeのコンテンツの高さに基づいてiframeの高さを調整する関数
  const adjustIframeHeight = () => {
    try {
      if (!previewRef.current) return;

      const iframe = previewRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      const body = doc.body;
      const html = doc.documentElement;

      // 高さを計算（最大値を取得）
      const height = Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      );

      // 最小高さを400pxにする
      const newHeight = Math.max(height, 400);
      if (newHeight !== iframeHeight) {
        setIframeHeight(newHeight);
      }
    } catch (error) {
      console.error('iframe高さ調整エラー:', error);
    }
  };

  // プレビューの更新
  const updatePreview = () => {
    if (!previewRef.current) {
      console.warn('プレビュー用のiframeがまだ初期化されていません');
      return;
    }

    try {
      const adjustHeightWithDelay = () => {
        setTimeout(() => {
          adjustIframeHeight();

          // スタイルの適用が完了するまで複数回高さを調整する
          setTimeout(adjustIframeHeight, 300);
          setTimeout(adjustIframeHeight, 600);
          setTimeout(adjustIframeHeight, 1000);
        }, 100);
      };

      const updateContent = () => {
        try {
          // より確実なレンダリングのためのベースCSSを追加
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
          const cssContent = editingCSS || '';
          const htmlContent = editingHTML || '';

          doc.write(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                ${baseCSS}
                ${cssContent}
              </style>
              <script>
                // iframeの高さを親ウィンドウに通知する関数
                function notifyHeight() {
                  const height = Math.max(
                    document.body.scrollHeight,
                    document.body.offsetHeight,
                    document.documentElement.clientHeight,
                    document.documentElement.scrollHeight,
                    document.documentElement.offsetHeight
                  );
                  window.parent.postMessage({ type: 'resize', height: height }, '*');
                }

                // DOMContentLoadedとload両方でサイズ通知
                document.addEventListener('DOMContentLoaded', function() {
                  notifyHeight();
                  // 画像などの読み込み完了後にも通知
                  window.addEventListener('load', notifyHeight);

                  // Mutation Observerでコンテンツ変更時にも通知
                  const observer = new MutationObserver(notifyHeight);
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    characterData: true
                  });
                });
              </script>
            </head>
            <body>${htmlContent}</body>
            </html>
          `);
          doc.close();

          adjustHeightWithDelay();
        } catch (error) {
          console.error('プレビュー更新中にエラーが発生しました:', error);
        }
      };

      updateContent();
    } catch (error) {
      console.error('プレビュー更新エラー:', error);
    }
  };

  // 画像をリサイズする関数
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

  // 画像を処理する関数
  const processImage = (base64Image) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!base64Image) {
          resolve(null);
          return;
        }

        // リサイズなしで元画像を返す場合
        // resolve(base64Image);

        // 大きな画像の場合は自動でリサイズする
        const isLarge = base64Image.length > 4 * 1024 * 1024; // 4MB以上
        if (isLarge) {
          const resized = await resizeImage(base64Image, 1200); // 最大幅1200pxに縮小
          resolve(resized);
        } else {
          resolve(base64Image);
        }
      } catch (error) {
        console.error('画像処理エラー:', error);
        reject(error);
      }
    });
  };

  // JPEGに変換する関数
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

          // Base64データを設定
          const base64 = dataUrl.split(',')[1];
          setPcImageBase64(base64);

          // 画像解析を実行（実装されている場合）
          try {
            if (typeof extractColorsFromImage === 'function') {
              const colors = await extractColorsFromImage(dataUrl);
              setPcColors(colors);
              console.log("PC画像の色を抽出しました:", colors);
            }

            if (typeof extractTextFromImage === 'function') {
              const text = await extractTextFromImage(dataUrl);
              setPcText(text);
              console.log("PC画像のテキストを抽出しました:", text);
            }
          } catch (analyzeError) {
            console.error("画像解析エラー:", analyzeError);
          }
        } else if (type === "sp") {
          console.log("SP画像プレビューを設定中...");
          setSpImage({
            fileName: file.name,
            preview: dataUrl,
            mimeType: file.type
          });

          // Base64データを設定
          const base64 = dataUrl.split(',')[1];
          setSpImageBase64(base64);

          // 画像解析を実行（実装されている場合）
          try {
            if (typeof extractColorsFromImage === 'function') {
              const colors = await extractColorsFromImage(dataUrl);
              setSpColors(colors);
              console.log("SP画像の色を抽出しました:", colors);
            }

            if (typeof extractTextFromImage === 'function') {
              const text = await extractTextFromImage(dataUrl);
              setSpText(text);
              console.log("SP画像のテキストを抽出しました:", text);
            }
          } catch (analyzeError) {
            console.error("画像解析エラー:", analyzeError);
          }
        }
      };

      reader.onerror = (error) => {
        console.error('ファイル読み込みエラー:', error);
        alert('画像の読み込み中にエラーが発生しました。');
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('画像アップロードエラー:', error);
      alert('画像のアップロード処理中にエラーが発生しました。');
    }
  };

  // ドラッグ＆ドロップ関連の処理
  const handleDragOver = (e, type) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.match('image.*')) {
        // 画像ファイルの場合、アップロード処理を実行
        const dummyEvent = { target: { files: [file] } };
        handleImageUpload(dummyEvent, type);
      } else {
        alert('アップロードできるのは画像ファイルのみです。');
      }
    }
  };

  // コード更新ハンドラー
  const handleUpdateCode = () => {
    // 編集された内容を保存
    setGeneratedHTML(editingHTML);
    setGeneratedCSS(editingCSS);

    // 表示モードに切り替え
    setIsEditing(false);

    // プレビューを更新
    updatePreview();
  };

  // コード生成処理
  const handleGenerateCode = async () => {
    if (!pcImage && !spImage) {
      alert('少なくとも1つの画像をアップロードしてください');
      return;
    }

    setLoading(true);

    try {
      // ヘッダー専用のプロンプトを生成
      const prompt = await generateHeaderPrompt({
        responsiveMode,
        aiBreakpoints,
        pcImageBase64: pcImage?.preview,
        spImageBase64: spImage?.preview,
        pcColors,
        pcImageText: pcText
      });

      console.log("生成されたプロンプト:", prompt);

      // 空のプロンプトを送らないようチェック
      if (!prompt || prompt.trim() === "") {
        console.error("エラー: 送信するプロンプトが空です");
        alert("プロンプトが空のため、コードを生成できません。");
        setLoading(false);
        return;
      }

      // 画像データの処理
      let uploadedImage = null;
      if (pcImage) {
        try {
          // 画像データの最適化
          console.log("画像の前処理を実行します");

          let processedImageData = pcImage.preview;

          // 画像のメディアタイプを確認
          const mediaTypeMatch = processedImageData.match(/^data:([^;]+);base64,/);
          const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : pcImage.mimeType;

          console.log(`画像のメディアタイプ: ${mediaType}`);

          // サイズが大きい場合はリサイズ（メディアタイプを保持）
          if (processedImageData && processedImageData.length > 10000000) { // 10MB以上なら
            console.log("画像サイズが大きいため、画像を最適化します（元サイズ: " + processedImageData.length + " bytes）");
            processedImageData = await resizeImage(processedImageData, 1200); // 最大幅1200pxに縮小
            console.log("画像を最適化しました（新サイズ: " + processedImageData.length + " bytes）");
          }

          // 画像データの準備
          uploadedImage = {
            name: pcImage.fileName || "image.jpg",
            path: pcImage.preview,
            data: processedImageData,
            mimeType: mediaType
          };

          console.log("画像情報を送信:", uploadedImage.name);
          console.log("画像データサイズ:", uploadedImage.data ? uploadedImage.data.length + " bytes" : "データなし");
        } catch (imgErr) {
          console.error("画像最適化エラー:", imgErr);
          alert(`画像の処理中にエラーが発生しました: ${imgErr.message}\nテキストのみでコード生成を続行します。`);
          uploadedImage = null;
        }
      }

      console.log("window.api:", window.api ? "存在します" : "存在しません");

      try {
        // APIを呼び出してコード生成
        console.log("generateCode関数を呼び出し中...");
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
          alert("AIが生成したSCSSにネスト構造が含まれていました。\n自動的にフラット構造に変換しましたが、プロンプトを強化して再生成することをお勧めします。");
        }

        // pxをremに変換
        const remCSS = convertPxToRem(flattenedCSS);

        // 生成されたコードをステートに設定
        setGeneratedCode(generatedCode);
        setGeneratedHTML(html);
        setGeneratedCSS(remCSS);
        setEditingHTML(html);
        setEditingCSS(remCSS);
        setShowGeneratedCode(true);

        // 画面を生成されたコードセクションまでスクロール
        setTimeout(() => {
          if (generatedCodeRef.current) {
            generatedCodeRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
          updatePreview();
        }, 500);
      } catch (error) {
        console.error("コード生成エラー:", error);

        // エラーメッセージを解析して表示
        let errorMessage = error.message;

        // Claude APIの画像エラーをより分かりやすく表示
        if (errorMessage.includes("Image does not match the provided media type")) {
          errorMessage = "画像形式エラー: アップロードされた画像の形式が一致しません。\n別の画像を試すか、他の形式（JPG/PNG）に変換してみてください。";
        } else if (errorMessage.includes("media_type")) {
          errorMessage = "画像メディアタイプエラー: APIがサポートしていない画像形式です。\nJPEG、PNG、GIF、WEBPのいずれかの形式をご利用ください。";
        }

        alert(`コード生成エラー: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error('コード生成中にエラーが発生しました:', error);
      alert('コードの生成中にエラーが発生しました。もう一度お試しください。');
      setLoading(false);
    }
  };

  // 再生成処理
  const handleRegenerate = async () => {
    if (!regenerateInstructions.trim()) {
      alert('再生成の指示を入力してください');
      return;
    }

    if (!generatedHTML || !generatedCSS) {
      alert('先にコードを生成してください');
      return;
    }

    setLoading(true);

    try {
      // ヘッダー専用のプロンプトを生成
      const prompt = await generateHeaderPrompt({
        responsiveMode,
        aiBreakpoints,
        pcImageBase64: pcImage?.preview,
        spImageBase64: spImage?.preview,
        pcColors,
        pcImageText: pcText
      });

      console.log("生成されたプロンプト:", prompt);

      // 空のプロンプトを送らないようチェック
      if (!prompt || prompt.trim() === "") {
        console.error("エラー: 送信するプロンプトが空です");
        alert("プロンプトが空のため、コードを生成できません。");
        setLoading(false);
        return;
      }

      // 画像データの処理
      let uploadedImage = null;
      if (pcImage) {
        try {
          // 画像データの最適化
          console.log("画像の前処理を実行します");

          let processedImageData = pcImage.preview;

          // 画像のメディアタイプを確認
          const mediaTypeMatch = processedImageData.match(/^data:([^;]+);base64,/);
          const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : pcImage.mimeType;

          console.log(`画像のメディアタイプ: ${mediaType}`);

          // サイズが大きい場合はリサイズ（メディアタイプを保持）
          if (processedImageData && processedImageData.length > 10000000) { // 10MB以上なら
            console.log("画像サイズが大きいため、画像を最適化します（元サイズ: " + processedImageData.length + " bytes）");
            processedImageData = await resizeImage(processedImageData, 1200); // 最大幅1200pxに縮小
            console.log("画像を最適化しました（新サイズ: " + processedImageData.length + " bytes）");
          }

          // 画像データの準備
          uploadedImage = {
            name: pcImage.fileName || "image.jpg",
            path: pcImage.preview,
            data: processedImageData,
            mimeType: mediaType
          };

          console.log("画像情報を送信:", uploadedImage.name);
          console.log("画像データサイズ:", uploadedImage.data ? uploadedImage.data.length + " bytes" : "データなし");
        } catch (imgErr) {
          console.error("画像最適化エラー:", imgErr);
          alert(`画像の処理中にエラーが発生しました: ${imgErr.message}\nテキストのみでコード生成を続行します。`);
          uploadedImage = null;
        }
      }

      console.log("window.api:", window.api ? "存在します" : "存在しません");

      try {
        // APIを呼び出してコード生成
        console.log("generateCode関数を呼び出し中...");
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
          alert("AIが生成したSCSSにネスト構造が含まれていました。\n自動的にフラット構造に変換しましたが、プロンプトを強化して再生成することをお勧めします。");
        }

        // pxをremに変換
        const remCSS = convertPxToRem(flattenedCSS);

        // 生成されたコードをステートに設定
        setGeneratedCode(generatedCode);
        setGeneratedHTML(html);
        setGeneratedCSS(remCSS);
        setEditingHTML(html);
        setEditingCSS(remCSS);
        setShowGeneratedCode(true);

        // 画面を生成されたコードセクションまでスクロール
        setTimeout(() => {
          if (generatedCodeRef.current) {
            generatedCodeRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
          updatePreview();
        }, 500);
      } catch (error) {
        console.error("コード生成エラー:", error);

        // エラーメッセージを解析して表示
        let errorMessage = error.message;

        // Claude APIの画像エラーをより分かりやすく表示
        if (errorMessage.includes("Image does not match the provided media type")) {
          errorMessage = "画像形式エラー: アップロードされた画像の形式が一致しません。\n別の画像を試すか、他の形式（JPG/PNG）に変換してみてください。";
        } else if (errorMessage.includes("media_type")) {
          errorMessage = "画像メディアタイプエラー: APIがサポートしていない画像形式です。\nJPEG、PNG、GIF、WEBPのいずれかの形式をご利用ください。";
        }

        alert(`コード生成エラー: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error('コード生成中にエラーが発生しました:', error);
      alert('コードの生成中にエラーが発生しました。もう一度お試しください。');
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

  // 全てのデータをリセット
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

  return (
    <div className="ai-code-generator">
      <Header
        title="ヘッダー生成"
        description="AIを活用してデザイン画像からヘッダーコンポーネントを自動生成します"
      />

      <div className="upload-section">
        <div
          className={`upload-area ${pcImage ? 'has-image' : ''}`}
          onClick={() => document.getElementById('pc-image-input').click()}
          onDrop={(e) => handleDrop(e, 'pc')}
          onDragOver={(e) => handleDragOver(e, 'pc')}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setPcImage(null);
                  setPcImageBase64(null);
                  setPcColors([]);
                  setPcText("");
                }}
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
          onDrop={(e) => handleDrop(e, 'sp')}
          onDragOver={(e) => handleDragOver(e, 'sp')}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setSpImage(null);
                  setSpImageBase64(null);
                  setSpColors([]);
                  setSpText("");
                }}
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
                minHeight: `${iframeHeight * scaleRatio}px`
              }}
            >
              <iframe
                ref={previewRef}
                title="Generated code preview"
                className="preview-iframe"
                style={{ width: `${previewWidth}px`, height: `${iframeHeight}px` }}
                scrolling="auto"
                onLoad={updatePreview}
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

export default HeaderGenerator;
