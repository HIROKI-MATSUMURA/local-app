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
import 'codemirror/mode/javascript/javascript';
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

// RGB値やHEX値を変数に変換する
const convertColorValuesToVariables = (cssCode, colorValues) => {
  if (!cssCode) return cssCode;

  console.log("色値を変数に変換処理を開始");
  let modifiedCss = cssCode;

  // 変数とHEX値のマッピングを生成（逆方向のマッピング）
  const hexToVarMap = new Map();
  Object.entries(colorValues).forEach(([varName, hexValue]) => {
    // 大文字に統一して保存
    if (hexValue.startsWith('#')) {
      hexToVarMap.set(hexValue.toUpperCase(), varName);

      // HEX値をRGB値に変換し、それも登録
      if (hexValue.length === 7) {
        const r = parseInt(hexValue.substring(1, 3), 16);
        const g = parseInt(hexValue.substring(3, 5), 16);
        const b = parseInt(hexValue.substring(5, 7), 16);
        const rgbValue = `rgb(${r}, ${g}, ${b})`;
        hexToVarMap.set(rgbValue, varName);
        console.log(`変換マッピング追加: ${hexValue.toUpperCase()} / ${rgbValue} → ${varName}`);
      }
    }
  });

  // 色プロパティを持つCSSルールを検出して変換
  // カラーに関連するCSSプロパティのリスト
  const colorProperties = [
    'color',
    'background-color',
    'border-color',
    'box-shadow',
    'text-shadow',
    'outline-color',
    'fill',
    'stroke'
  ];

  // CSSルールを解析して、色プロパティの値のみを置換
  const cssRules = modifiedCss.split(/}\s*(?=[\w\.\#])/);
  const processedRules = cssRules.map(rule => {
    // セレクタと宣言ブロックを分離
    const parts = rule.split('{');
    if (parts.length < 2) return rule;

    const selector = parts[0].trim();
    const declarations = parts[1];

    // 宣言を一行ずつ処理
    const processedDeclarations = declarations.split(';').map(declaration => {
      const colonPos = declaration.indexOf(':');
      if (colonPos === -1) return declaration;

      const property = declaration.substring(0, colonPos).trim();
      const value = declaration.substring(colonPos + 1).trim();

      // 色関連のプロパティの場合のみ値を変換
      if (colorProperties.some(prop => property.includes(prop))) {
        // HEX値のパターンを検出
        const hexMatch = value.match(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![0-9A-Fa-f])/);
        if (hexMatch) {
          const hexValue = hexMatch[0];
          const normalizedHex = hexValue.toUpperCase();

          if (hexToVarMap.has(normalizedHex)) {
            const varName = hexToVarMap.get(normalizedHex);
            console.log(`HEX値を変数に変換: ${hexValue} → ${varName} (${selector} の ${property})`);
            return `${property}: ${varName}`;
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
            console.log(`類似HEX値を変数に変換: ${hexValue} → ${closestVar} (類似度: ${minDistance}, ${selector} の ${property})`);
            return `${property}: ${closestVar}`;
          }
        }

        // RGB値のパターンを検出
        const rgbMatch = value.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (rgbMatch) {
          const rgbValue = rgbMatch[0];

          if (hexToVarMap.has(rgbValue)) {
            const varName = hexToVarMap.get(rgbValue);
            console.log(`RGB値を変数に変換: ${rgbValue} → ${varName} (${selector} の ${property})`);
            return `${property}: ${varName}`;
          }
        }
      }

      return declaration;
    }).join(';');

    return `${selector} {${processedDeclarations}`;
  });

  modifiedCss = processedRules.join('}\n\n') + '}';

  // 重複するセレクタを削除
  // 例: .c-button が2回定義されている場合、後の定義を優先
  const cleanDuplicateSelectors = (css) => {
    const cssBlocks = css.split(/}\s*(?=[\w\.\#])/);
    const selectors = new Map();

    // 後の定義ほど優先される（上書きされる）
    cssBlocks.forEach(block => {
      const selectorMatch = block.match(/^([^{]+)\s*{/);
      if (selectorMatch) {
        const selector = selectorMatch[1].trim();
        selectors.set(selector, block);
      }
    });

    return Array.from(selectors.values()).join('}\n\n') + '}';
  };

  modifiedCss = cleanDuplicateSelectors(modifiedCss);

  return modifiedCss;
};

const HeaderGenerator = () => {
  // 状態管理
  const [editingHTML, setEditingHTML] = useState("");
  const [editingCSS, setEditingCSS] = useState("");
  const [editingJS, setEditingJS] = useState("");
  const [generatedHTML, setGeneratedHTML] = useState("");
  const [generatedCSS, setGeneratedCSS] = useState("");
  const [generatedJS, setGeneratedJS] = useState("");
  const [processedCSS, setProcessedCSS] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("edit");
  const [previewHeight, setPreviewHeight] = useState(500);
  const [previewWidth, setPreviewWidth] = useState(1280);
  const [previewDevice, setPreviewDevice] = useState("pc");
  const [generatedCode, setGeneratedCode] = useState("");
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const generatedCodeRef = useRef(null);

  // 画像関連の状態変数
  const [pcImage, setPcImage] = useState(null);
  const [spImage, setSpImage] = useState(null);
  const [drawerImage, setDrawerImage] = useState(null);

  // 表示用のURLを管理する新しい状態変数
  const [pcImageUrl, setPcImageUrl] = useState(null);
  const [spImageUrl, setSpImageUrl] = useState(null);
  const [drawerImageUrl, setDrawerImageUrl] = useState(null);

  // 既存のコード
  const [pcColors, setPcColors] = useState([]);
  const [spColors, setSpColors] = useState([]);
  const [drawerColors, setDrawerColors] = useState([]);
  const [pcText, setPcText] = useState("");
  const [spText, setSpText] = useState("");
  const [drawerText, setDrawerText] = useState("");
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);

  // レスポンシブ設定
  const [responsiveMode, setResponsiveMode] = useState("sp");
  const [breakpoints, setBreakpoints] = useState([]);
  const [aiBreakpoints, setAiBreakpoints] = useState([]);

  // ドロワー表示設定
  const [drawerLayout, setDrawerLayout] = useState("sp-only"); // "sp-only" または "both"
  const [drawerDirection, setDrawerDirection] = useState("right"); // "right", "left", "bottom", "top", "fade"

  const previewRef = useRef(null);

  // プレビューサイズの追加状態
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

  // ローカルストレージからデータをロードする関数
  const loadFromLocalStorage = () => {
    try {
      const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedState) {
        const parsedState = JSON.parse(savedState);

        // 画像データをロード
        if (parsedState.pcImage) setPcImage(parsedState.pcImage);
        if (parsedState.spImage) setSpImage(parsedState.spImage);
        if (parsedState.drawerImage) setDrawerImage(parsedState.drawerImage);

        // 画像URL設定
        if (parsedState.pcImage) setPcImageUrl(parsedState.pcImage);
        if (parsedState.spImage) setSpImageUrl(parsedState.spImage);
        if (parsedState.drawerImage) setDrawerImageUrl(parsedState.drawerImage);

        // 画像解析結果をロード
        if (parsedState.pcColors) setPcColors(parsedState.pcColors);
        if (parsedState.spColors) setSpColors(parsedState.spColors);
        if (parsedState.drawerColors) setDrawerColors(parsedState.drawerColors);
        if (parsedState.pcText) setPcText(parsedState.pcText);
        if (parsedState.spText) setSpText(parsedState.spText);
        if (parsedState.drawerText) setDrawerText(parsedState.drawerText);

        // 生成コード関連の状態をロード
        if (parsedState.generatedHTML) setGeneratedHTML(parsedState.generatedHTML);
        if (parsedState.generatedCSS) setGeneratedCSS(parsedState.generatedCSS);
        if (parsedState.generatedJS) setGeneratedJS(parsedState.generatedJS);
        if (parsedState.editingHTML) setEditingHTML(parsedState.editingHTML);
        if (parsedState.editingCSS) setEditingCSS(parsedState.editingCSS);
        if (parsedState.editingJS) setEditingJS(parsedState.editingJS);
        if (parsedState.processedCSS) setProcessedCSS(parsedState.processedCSS);

        // プレビュー設定をロード
        if (parsedState.previewWidth) setPreviewWidth(parsedState.previewWidth);
        if (parsedState.previewHeight) setPreviewHeight(parsedState.previewHeight);
        if (parsedState.isEditing !== undefined) setIsEditing(parsedState.isEditing);
        if (parsedState.previewDevice) setPreviewDevice(parsedState.previewDevice);

        // レスポンシブ設定をロード
        if (parsedState.responsiveMode) setResponsiveMode(parsedState.responsiveMode);
        if (parsedState.aiBreakpoints && parsedState.aiBreakpoints.length > 0) {
          setAiBreakpoints(parsedState.aiBreakpoints);
        }

        // ドロワー設定をロード
        if (parsedState.drawerLayout) setDrawerLayout(parsedState.drawerLayout);
        if (parsedState.drawerDirection) setDrawerDirection(parsedState.drawerDirection);

        // 再生成指示をロード
        if (parsedState.regenerateInstructions) {
          setRegenerateInstructions(parsedState.regenerateInstructions);
        }

        console.log("ローカルストレージからデータをロードしました");
      }
    } catch (error) {
      console.error("ローカルストレージからのデータロードエラー:", error);
    }
  };

  // ローカルストレージにデータを保存する関数
  const saveToLocalStorage = () => {
    try {
      const stateToSave = {
        // 画像データ
        pcImage: pcImage,
        spImage: spImage,
        drawerImage: drawerImage,

        // 画像解析結果
        pcColors,
        spColors,
        drawerColors,
        pcText,
        spText,
        drawerText,

        // 生成コード関連
        generatedHTML,
        generatedCSS,
        generatedJS,
        editingHTML,
        editingCSS,
        editingJS,
        processedCSS,

        // プレビュー設定
        previewWidth,
        previewHeight,
        isEditing,
        previewDevice,

        // レスポンシブ設定
        responsiveMode,
        aiBreakpoints,

        // ドロワー設定
        drawerLayout,
        drawerDirection,

        // 再生成指示
        regenerateInstructions
      };

      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
      console.log("データをローカルストレージに保存しました");
    } catch (error) {
      console.error("ローカルストレージへのデータ保存エラー:", error);
    }
  };

  // useEffectを追加してブレークポイントを初期化
  useEffect(() => {
    // ローカルストレージからデータをロード
    loadFromLocalStorage();

    // ブレークポイント設定
    try {
      const savedBreakpointsString = localStorage.getItem('breakpoints');
      if (savedBreakpointsString) {
        const savedBreakpoints = JSON.parse(savedBreakpointsString);
        setBreakpoints(savedBreakpoints);

        // AIブレークポイントがすでにロードされていない場合のみ設定
        if (!aiBreakpoints || aiBreakpoints.length === 0) {
          const initialAiBreakpoints = savedBreakpoints.map(bp => ({
            ...bp,
            aiActive: true // デフォルトですべて有効に
          }));
          setAiBreakpoints(initialAiBreakpoints);
        }
      } else {
        // デフォルトのブレークポイント設定
        const defaultBreakpoints = [
          { name: 'sm', value: 600 },
          { name: 'md', value: 768 },
          { name: 'lg', value: 1024 }
        ];
        setBreakpoints(defaultBreakpoints);
        if (!aiBreakpoints || aiBreakpoints.length === 0) {
          setAiBreakpoints(defaultBreakpoints.map(bp => ({ ...bp, aiActive: true })));
        }
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
      if (!aiBreakpoints || aiBreakpoints.length === 0) {
        setAiBreakpoints(fallbackBreakpoints.map(bp => ({ ...bp, aiActive: true })));
      }
    }
  }, []);

  // 状態が変更されたらローカルストレージに保存
  useEffect(() => {
    if (pcImage || spImage || drawerImage || generatedHTML || generatedCSS || generatedJS) {
      saveToLocalStorage();
    }
  }, [
    pcImage, spImage, drawerImage,
    pcColors, spColors, drawerColors,
    pcText, spText, drawerText,
    generatedHTML, generatedCSS, generatedJS,
    editingHTML, editingCSS, editingJS,
    generatedCode, showGeneratedCode,
    previewWidth, isEditing,
    responsiveMode, aiBreakpoints,
    drawerLayout, drawerDirection,
    regenerateInstructions
  ]);
  // iframeのDOM変更を監視して高さを自動調整する
  useEffect(() => {
    // すでにプレビューが表示されていて、かつiframeが存在する場合のみ実行
    if (showGeneratedCode && previewRef.current) {
      try {
        const iframe = previewRef.current;
        const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;

        // MutationObserverを作成
        const observer = new MutationObserver(() => {
          console.log('iframeのDOM変更を検出しました');
          // DOM変更時に高さを調整
          adjustIframeHeight();
        });

        // ドキュメント全体の変更を監視
        observer.observe(iframeDocument.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });

        // 初期表示時に高さを調整
        adjustIframeHeight();

        // クリーンアップ関数
        return () => {
          // コンポーネントのアンマウント時にObserverを停止
          observer.disconnect();
        };
      } catch (error) {
        console.error('MutationObserver設定エラー:', error);
      }
    }
  }, [showGeneratedCode, generatedHTML, generatedCSS, generatedJS]);

  // iframeのコンテンツの高さに基づいてiframeの高さを調整する関数
  const adjustIframeHeight = () => {
    try {
      if (!previewRef.current) return;

      const iframe = previewRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      const body = doc.body;
      const html = doc.documentElement;

      // 高さを計算（最大値を取得）- AICodeGeneratorと同様の計算方法に変更
      const contentHeight = Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      );

      // 高さの変化が一定値（5px）以上の場合のみ更新する
      // 以前は30pxだったが、より細かな変更も検知するため5pxに変更
      const heightWithMargin = Math.ceil(contentHeight);

      // 現在の高さと比較
      if (Math.abs(heightWithMargin - iframeHeight) > 5) {
        // 最小高さを400pxにする
        const newHeight = Math.max(400, heightWithMargin);

        // 高さを更新
        setIframeHeight(newHeight);

        // 高さ変更のデバッグ情報
        console.log(`iframe高さを更新: ${iframeHeight}px → ${newHeight}px (コンテンツ高さ: ${contentHeight}px)`);
      }
    } catch (error) {
      console.error('iframe高さ調整エラー:', error);
    }
  };

  // プレビューの更新
  const updatePreview = () => {
    if (!previewRef.current) return;

    try {
      // CSS処理を実行
      let processedCss = editingCSS;
      if (!isEditing) {
        processedCss = generatedCSS;
      }
      setProcessedCSS(processedCss);

      // より確実なレンダリングのため、DOCTYPE宣言を追加
      const iframe = previewRef.current;
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: "Noto Sans JP", Arial, sans-serif;
            }
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
            ${processedCss || ''}
          </style>
          <script>
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
              const heightWithMargin = Math.ceil(contentHeight);

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

            // ユーザーが作成したJavaScriptコード
            ${isEditing ? editingJS : generatedJS || ''}
          </script>
        </head>
        <body>
          <div class="preview-container">
            ${isEditing ? editingHTML : generatedHTML || ''}
          </div>
        </body>
        </html>
      `);
      doc.close();
    } catch (error) {
      console.error("プレビュー更新エラー:", error);
    }

    // iframeからの高さ通知メッセージを受け取る
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'resize') {
        setIframeHeight(event.data.height);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
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
    try {
      const file = e.target.files[0];
      if (!file) return;

      // ファイルサイズチェック
      if (file.size > 5000000) {
        alert('ファイルサイズが大きすぎます。5MB以下の画像を選択してください。');
        return;
      }

      // 画像の処理
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;

        try {
          // 状態を更新
          if (type === 'pc') {
            setPcImage(base64);
            setPcImageUrl(base64);
          } else if (type === 'sp') {
            setSpImage(base64);
            setSpImageUrl(base64);
          } else if (type === 'drawer') {
            setDrawerImage(base64);
            setDrawerImageUrl(base64);
          }

          setIsEditing(true);
        } catch (err) {
          console.error('画像の処理中にエラーが発生しました', err);
          alert('画像の処理中にエラーが発生しました');
        }
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('画像のアップロード中にエラーが発生しました', error);
      alert('画像のアップロード中にエラーが発生しました');
    }
  };

  // 画像削除の処理
  const handleRemovePcImage = () => {
    setPcImage(null);
    setPcImageUrl(null);
    setPcColors([]);
    setPcText("");
    setIsEditing(true);
  };

  const handleRemoveSpImage = () => {
    setSpImage(null);
    setSpImageUrl(null);
    setSpColors([]);
    setSpText("");
    setIsEditing(true);
  };

  const handleRemoveDrawerImage = () => {
    setDrawerImage(null);
    setDrawerImageUrl(null);
    setDrawerColors([]);
    setDrawerText("");
    setIsEditing(true);
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
    setGeneratedJS(editingJS);

    // 表示モードに切り替え
    setIsEditing(false);

    // プレビューを更新
    updatePreview();
  };

  // コード生成処理
  const handleGenerateCode = async () => {
    if (!pcImage && !spImage && !drawerImage) {
      alert('少なくとも1つの画像をアップロードしてください');
      return;
    }

    setLoading(true);

    try {
      // ヘッダー専用のプロンプトを生成
      const prompt = await generateHeaderPrompt({
        responsiveMode,
        aiBreakpoints,
        pcImageBase64: pcImage,
        spImageBase64: spImage,
        drawerImageBase64: drawerImage,
        pcColors,
        spColors,
        drawerColors,
        pcImageText: pcText,
        spImageText: spText,
        drawerImageText: drawerText,
        drawerLayout,
        drawerDirection
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

          let processedImageData = pcImage;

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
            name: "image.jpg",
            path: pcImage,
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
        const jsMatch = generatedCode.match(/```javascript\n([\s\S]*?)```/) || generatedCode.match(/```js\n([\s\S]*?)```/);

        console.log("HTML抽出結果:", htmlMatch ? "マッチしました" : "マッチしませんでした");
        console.log("CSS抽出結果:", cssMatch ? "マッチしました" : "マッチしませんでした");
        console.log("JavaScript抽出結果:", jsMatch ? "マッチしました" : "マッチしませんでした");

        const html = htmlMatch ? htmlMatch[1].trim() : "";
        const css = cssMatch ? cssMatch[1].trim() : "";
        const js = jsMatch ? jsMatch[1].trim() : "";

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
        setGeneratedJS(js);
        setEditingHTML(html);
        setEditingCSS(remCSS);
        setEditingJS(js);
        setShowGeneratedCode(true);
        setIsEditing(false);

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

    if (!generatedHTML || !generatedCSS || !generatedJS) {
      alert('先にコードを生成してください');
      return;
    }

    setLoading(true);

    try {
      // ヘッダー専用のプロンプトを生成
      const prompt = await generateHeaderPrompt({
        responsiveMode,
        aiBreakpoints,
        pcImageBase64: pcImage,
        spImageBase64: spImage,
        drawerImageBase64: drawerImage,
        pcColors,
        spColors,
        drawerColors,
        pcImageText: pcText,
        spImageText: spText,
        drawerImageText: drawerText,
        drawerLayout,
        drawerDirection
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

          let processedImageData = pcImage;

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
            name: "image.jpg",
            path: pcImage,
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
        const jsMatch = generatedCode.match(/```javascript\n([\s\S]*?)```/) || generatedCode.match(/```js\n([\s\S]*?)```/);

        console.log("HTML抽出結果:", htmlMatch ? "マッチしました" : "マッチしませんでした");
        console.log("CSS抽出結果:", cssMatch ? "マッチしました" : "マッチしませんでした");
        console.log("JavaScript抽出結果:", jsMatch ? "マッチしました" : "マッチしませんでした");

        const html = htmlMatch ? htmlMatch[1].trim() : "";
        const css = cssMatch ? cssMatch[1].trim() : "";
        const js = jsMatch ? jsMatch[1].trim() : "";

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
        setGeneratedJS(js);
        setEditingHTML(html);
        setEditingCSS(remCSS);
        setEditingJS(js);
        setShowGeneratedCode(true);
        setIsEditing(false);

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

  // コードのみリセット処理
  const handleResetCode = () => {
    // 生成されたコードをクリア
    setGeneratedCode("");
    setGeneratedHTML("");
    setGeneratedCSS("");
    setGeneratedJS("");
    setEditingHTML("");
    setEditingCSS("");
    setEditingJS("");
    setShowGeneratedCode(false);

    // 再生成指示をクリア
    setRegenerateInstructions("");

    // ローカルストレージの一部をクリア
    try {
      const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedState) {
        const parsedState = JSON.parse(savedState);

        // コード関連の項目を削除
        delete parsedState.generatedHTML;
        delete parsedState.generatedCSS;
        delete parsedState.generatedJS;
        delete parsedState.editingHTML;
        delete parsedState.editingCSS;
        delete parsedState.editingJS;
        delete parsedState.generatedCode;
        delete parsedState.showGeneratedCode;
        delete parsedState.regenerateInstructions;

        // 更新した状態を保存
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsedState));
      }
    } catch (error) {
      console.error("ローカルストレージ部分クリアエラー:", error);
    }
  };

  // 全てリセット処理
  const handleResetAll = () => {
    // 生成されたコードをクリア
    setGeneratedCode("");
    setGeneratedHTML("");
    setGeneratedCSS("");
    setGeneratedJS("");
    setEditingHTML("");
    setEditingCSS("");
    setEditingJS("");
    setShowGeneratedCode(false);

    // 画像をクリア
    setPcImage(null);
    setSpImage(null);
    setDrawerImage(null);
    setPcImageUrl(null);
    setSpImageUrl(null);
    setDrawerImageUrl(null);

    // 画像解析結果をクリア
    setPcColors([]);
    setSpColors([]);
    setDrawerColors([]);
    setPcText("");
    setSpText("");
    setDrawerText("");

    // 再生成指示をクリア
    setRegenerateInstructions("");

    // ローカルストレージからヘッダー生成のデータを削除
    localStorage.removeItem(LOCAL_STORAGE_KEY);

    console.log("全てのデータをリセットしました");
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
    // 大きいプレビューサイズの場合のみスケール計算
    if (previewWidth > 1000) {
      // 固定コンテナ幅1022pxに対する縮小率を計算
      const scale = 1022 / previewWidth;
      console.log(`スケール計算: 1022px / ${previewWidth}px = ${scale.toFixed(6)}`);
      setScaleRatio(scale);
    } else {
      // 1000px以下ではスケールしない
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

  // プレビュー幅が変更された時に自動的にプレビューを更新
  useEffect(() => {
    if (previewRef.current && editingHTML && editingCSS) {
      setTimeout(() => {
        updatePreview();
      }, 200);
    }
  }, [previewWidth, editingHTML, editingCSS, editingJS]);

  // コードが生成されたらプレビューを更新
  useEffect(() => {
    if (previewRef.current && showGeneratedCode) {
      setTimeout(() => {
        updatePreview();
      }, 500);
    }
  }, [showGeneratedCode, generatedHTML, generatedCSS, generatedJS]);

  // 状態が変更されたらローカルストレージに保存
  useEffect(() => {
    if (isEditing) {
      saveToLocalStorage();
    }
  }, [
    pcImage, spImage, drawerImage,
    pcColors, spColors, drawerColors,
    pcText, spText, drawerText,
    generatedHTML, generatedCSS, generatedJS,
    editingHTML, editingCSS, editingJS,
    processedCSS,
    previewWidth, previewHeight, isEditing, previewDevice,
    responsiveMode, aiBreakpoints,
    drawerLayout, drawerDirection,
    regenerateInstructions
  ]);

  return (
    <div className="ai-code-generator">
      <Header
        title="ヘッダー生成"
        description="AIを活用してデザイン画像からヘッダーコンポーネントを自動生成します"
      />

      <div className="upload-section">
        <div className="upload-container">
          <div
            className={`upload-area ${pcImage ? 'has-image' : ''}`}
            onClick={() => document.getElementById('pc-image-input').click()}
            onDrop={(e) => handleDrop(e, 'pc')}
            onDragOver={(e) => handleDragOver(e)}
          >
            {pcImage ? (
              <div className="image-preview-container">
                <img
                  src={pcImageUrl}
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
                    handleRemovePcImage();
                  }}
                >
                  <span>×</span>
                </button>
              </div>
            ) : (
              <>
                <div className="upload-icon">🖥️</div>
                <div className="upload-text">PC用ヘッダー画像をアップロード</div>
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
            onDragOver={(e) => handleDragOver(e)}
          >
            {spImage ? (
              <div className="image-preview-container">
                <img
                  src={spImageUrl}
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
                    handleRemoveSpImage();
                  }}
                >
                  <span>×</span>
                </button>
              </div>
            ) : (
              <>
                <div className="upload-icon">📱</div>
                <div className="upload-text">SP用ヘッダー画像をアップロード</div>
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

          <div
            className={`upload-area ${drawerImage ? 'has-image' : ''}`}
            onClick={() => document.getElementById('drawer-image-input').click()}
            onDrop={(e) => handleDrop(e, 'drawer')}
            onDragOver={(e) => handleDragOver(e)}
          >
            {drawerImage ? (
              <div className="image-preview-container">
                <img
                  src={drawerImageUrl}
                  alt="Drawer Preview"
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
                    handleRemoveDrawerImage();
                  }}
                >
                  <span>×</span>
                </button>
              </div>
            ) : (
              <>
                <div className="upload-icon">🔍</div>
                <div className="upload-text">ドロワーメニュー画像をアップロード</div>
                <div className="upload-hint">クリックまたはドラッグ＆ドロップ</div>
              </>
            )}
            <input
              type="file"
              id="drawer-image-input"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, 'drawer')}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </div>

      <div className="upload-info">
        <p>※ 画像の最大サイズ: 5MB</p>
        <p>※ 対応フォーマット: JPG, PNG, WEBP</p>
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

          <div className="setting-group">
            <label className="setting-label">ドロワー表示設定</label>
            <div className="drawer-settings-display">
              <div className="setting-row">
                <span className="setting-title">ドロワー実装:</span>
                <div className="select-container">
                  <select
                    value={drawerLayout}
                    onChange={(e) => setDrawerLayout(e.target.value)}
                    className="setting-select"
                  >
                    <option value="both">ドロワー実装はSP/PC共通</option>
                    <option value="sp-only">ドロワーはSPのみ</option>
                  </select>
                </div>
              </div>

              <div className="setting-row">
                <span className="setting-title">ドロワーの表示方法:</span>
                <div className="select-container">
                  <select
                    value={drawerDirection}
                    onChange={(e) => setDrawerDirection(e.target.value)}
                    className="setting-select"
                  >
                    <option value="right">右から表示する</option>
                    <option value="left">左から表示する</option>
                    <option value="bottom">下から表示する</option>
                    <option value="top">上から表示する</option>
                    <option value="fade">フェードインで表示する</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        className={`generate-button ${loading ? 'loading' : ''}`}
        onClick={handleGenerateCode}
        disabled={loading || (!pcImage && !spImage && !drawerImage)}
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

              <div className="js-editor">
                <h3>JavaScript</h3>
                <CodeMirror
                  value={editingJS}
                  options={{
                    mode: 'javascript',
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
                    setEditingJS(value);
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
            <CodeDisplay htmlCode={generatedHTML} cssCode={generatedCSS} jsCode={generatedJS} />
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
                    onClick={() => setPreviewWidth(375)}
                    className={previewWidth === 375 ? "active" : ""}
                  >
                    SP (375px)
                  </button>
                  <button
                    onClick={() => setPreviewWidth(768)}
                    className={previewWidth === 768 ? "active" : ""}
                  >
                    Tablet (768px)
                  </button>
                  <button
                    onClick={() => setPreviewWidth(1280)}
                    className={previewWidth === 1280 ? "active" : ""}
                  >
                    PC (1280px)
                  </button>
                  <button
                    onClick={() => setPreviewWidth(1440)}
                    className={previewWidth === 1440 ? "active" : ""}
                  >
                    PC (1440px)
                  </button>
                </div>
              </div>
            </div>
            <div
              className="preview-iframe-container"
              style={{
                width: `${previewWidth}px`,
                transform: previewWidth > 1000 ? `scale(calc(1022/${previewWidth}))` : 'none',
                transformOrigin: 'top left',
                height: `${Number(iframeHeight) + 20}px`,
                minHeight: `${(Math.max(400, iframeHeight) + 20) * (previewWidth > 1000 ? (1022 / previewWidth) : 1)}px`
              }}
            >
              <iframe
                ref={previewRef}
                className="preview-iframe"
                style={{ width: `${previewWidth}px`, height: `${iframeHeight}px`, overflow: 'auto' }}
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
              {loading ? "再生成中..." : "再生成"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeaderGenerator;
