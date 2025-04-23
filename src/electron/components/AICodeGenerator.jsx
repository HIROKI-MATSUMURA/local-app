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
// import { extractTextFromImage, extractColorsFromImage } from "../utils/imageAnalyzer.js";
import "../styles/AICodeGenerator.scss";
import 'highlight.js/styles/github.css';
import Header from './Header';
import { detectScssBlocks, detectHtmlBlocks } from "../utils/codeParser";
// import * as sass from 'sass'; // SCSSコンパイル用にsassをインポート
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// import { faImage } from '@fortawesome/free-solid-svg-icons';

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

// 画像から色を抽出する関数
const analyzeImageColors = async (file) => {
  return new Promise((resolve) => {
    // 実際の実装では色抽出ライブラリを使用するか、APIを呼び出す
    // ここではモックデータを返す
    setTimeout(() => {
      const mockColors = [
        'rgb(45, 52, 64)',
        'rgb(76, 86, 106)',
        'rgb(236, 239, 244)',
        'rgb(129, 161, 193)',
        'rgb(94, 129, 172)'
      ];
      resolve(mockColors);
    }, 1000);
  });
};

// 画像からテキストを抽出する関数（OCR）
const analyzeImageText = async (file, updateProgress) => {
  return new Promise((resolve) => {
    // 実際の実装ではTesseractなどのOCRライブラリを使用するか、APIを呼び出す
    // ここではモックデータを返す

    // 進捗状況をシミュレート - 40%から70%の範囲で進捗を更新
    let progress = 40;
    const interval = setInterval(() => {
      progress += 3;
      if (progress <= 70) {
        updateProgress(progress);
      } else {
        clearInterval(interval);
      }
    }, 300);

    setTimeout(() => {
      clearInterval(interval);
      updateProgress(70);  // 最終進捗を70%に設定
      const mockText = "サンプルテキスト:\nヘッダー：ロゴ、ナビゲーション\nメインセクション：画像、テキスト\nフッター：著作権情報、リンク";
      resolve(mockText);
    }, 3000);
  });
};

// SCSSをCSSに擬似的に変換する関数
const processSCSS = (scssCode, breakpointsArr = []) => {
  if (!scssCode) return '';

  try {
    let processedCSS = scssCode;

    // 変数の抽出と保存
    const variables = {};
    const variableRegex = /\$([\w-]+):\s*([^;]+);/g;
    let variableMatch;

    while ((variableMatch = variableRegex.exec(scssCode)) !== null) {
      const [_, name, value] = variableMatch;
      variables['$' + name] = value.trim();
    }

    console.log('SCSSから抽出した変数:', variables);

    // 変数の置換
    Object.keys(variables).forEach(variable => {
      const regex = new RegExp(variable.replace('$', '\\$'), 'g');
      processedCSS = processedCSS.replace(regex, variables[variable]);
    });

    // ブレークポイントマップを動的に作成
    const bpMap = {};
    if (Array.isArray(breakpointsArr) && breakpointsArr.length > 0) {
      breakpointsArr.forEach(bp => {
        if (bp.active && bp.name && bp.value) {
          bpMap[bp.name] = bp.value.toString();
        }
      });
    } else {
      // デフォルト値
      bpMap['sm'] = '576';
      bpMap['md'] = '768';
      bpMap['lg'] = '992';
      bpMap['xl'] = '1200';
      bpMap['xxl'] = '1400';
    }

    console.log('使用するブレークポイント:', bpMap);

    // @include mq(name) パターンを @media (min-width: Xpx) に変換
    const mqRegex = /@include\s+mq\((\w+)\)\s*{([^}]*)}/gs;
    let mqMatch;

    while ((mqMatch = mqRegex.exec(processedCSS)) !== null) {
      const [fullMatch, bpName, content] = mqMatch;
      const bpValue = bpMap[bpName] || '768'; // デフォルト値

      // @mediaクエリに変換
      const mediaQuery = `@media (min-width: ${bpValue}px) {${content}}`;

      // 元のコードを置換
      processedCSS = processedCSS.replace(fullMatch, mediaQuery);
    }

    // @breakpoint(name) パターンも同様に処理
    const bpRegex = /@breakpoint\((\w+)\)\s*{([^}]*)}/gs;
    let bpMatch;

    while ((bpMatch = bpRegex.exec(processedCSS)) !== null) {
      const [fullMatch, bpName, content] = bpMatch;
      const bpValue = bpMap[bpName] || '768'; // デフォルト値

      // @mediaクエリに変換
      const mediaQuery = `@media (min-width: ${bpValue}px) {${content}}`;

      // 元のコードを置換
      processedCSS = processedCSS.replace(fullMatch, mediaQuery);
    }

    console.log('SCSS疑似変換完了');
    return processedCSS;
  } catch (error) {
    console.error('SCSS処理中にエラーが発生しました:', error);
    return scssCode; // エラー時は元のコードを返す
  }
};

// SCSSをリアルタイムでコンパイルしてiframeに反映する関数
const compileAndUpdatePreview = async (htmlCode, scssCode, iframeRef, viewportWidth = 375, setProcessedCSSFunc = null) => {
  try {
    if (!window.Sass) {
      console.error('Sass.js（ブラウザ用Sassコンパイラ）が見つかりません');
      return false;
    }

    // Sassコンパイル
    const compiled = await new Promise((resolve, reject) => {
      const sass = new window.Sass();
      sass.compile(scssCode, (result) => {
        if (result.status === 0) {
          resolve(result.text); // 正常
        } else {
          console.error('SCSSコンパイルエラー:', result.formatted);
          reject(new Error(result.formatted)); // エラー
        }
      });
    });

    // 保存用のデータも更新
    if (setProcessedCSSFunc && typeof setProcessedCSSFunc === 'function') {
      setProcessedCSSFunc(compiled);
    }

    // iframeの中にHTMLとコンパイル済みCSSを流し込む
    const iframe = iframeRef.current;
    if (!iframe) {
      console.error('iframeが見つかりません');
      return false;
    }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=${viewportWidth}">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
          }
          img {
            display: block;
          }
          ${compiled}
        </style>
      </head>
      <body>
        ${htmlCode}
      </body>
      </html>
    `);
    iframeDoc.close();

    console.log('✅ プレビュー更新完了（コンパイル済みCSS適用）');
    return true;
  } catch (error) {
    console.error('❌ プレビュー更新失敗:', error);
    return false;
  }
};

// iframe内のHTMLとCSSを直接更新する関数（Sass.jsがない場合のフォールバック）
const updateIframeWithCSS = (htmlCode, cssCode, iframeRef, viewportWidth = 375, setProcessedCSSFunc = null) => {
  try {
    const iframe = iframeRef.current;
    if (!iframe) {
      console.error('iframeが見つかりません');
      return false;
    }

    // 保存用のデータも更新
    if (setProcessedCSSFunc && typeof setProcessedCSSFunc === 'function') {
      setProcessedCSSFunc(cssCode);
    }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=${viewportWidth}">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
          }
          img {
            display: block;
          }
          ${cssCode}
        </style>
      </head>
      <body>
        ${htmlCode}
      </body>
      </html>
    `);
    iframeDoc.close();

    console.log('✅ プレビュー更新完了（フォールバックCSS適用）');
    return true;
  } catch (error) {
    console.error('❌ プレビュー更新失敗:', error);
    return false;
  }
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

  // エラーと更新状態の管理
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [processedCSS, setProcessedCSS] = useState("");

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
  const [pcImageBase64, setPcImageBase64] = useState(null);
  const [spImageBase64, setSpImageBase64] = useState(null);
  const [imageAnalysisResult, setImageAnalysisResult] = useState(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // 生成コード修正用のステート
  const [editingHTML, setEditingHTML] = useState("");
  const [editingCSS, setEditingCSS] = useState("");
  const [isEditing, setIsEditing] = useState(true); // 常に編集モードになるようにtrueに設定
  const previewRef = useRef(null);

  // プレビューサイズ変更用
  const [previewWidth, setPreviewWidth] = useState(375);
  const [isDragging, setIsDragging] = useState(false);
  const previewContainerRef = useRef(null);
  const [customSizeInput, setCustomSizeInput] = useState("");
  const [showCustomSizeInput, setShowCustomSizeInput] = useState(false);
  const [scaleRatio, setScaleRatio] = useState(1);
  const [selectedPreviewSize, setSelectedPreviewSize] = useState("sp");
  const [customWidth, setCustomWidth] = useState(1440);

  // 保存から除外するブロックを管理
  const [excludedBlocks, setExcludedBlocks] = useState([]);

  // 再生成用の指示
  const [regenerateInstructions, setRegenerateInstructions] = useState("");

  // iframeの高さを制御する状態
  const [iframeHeight, setIframeHeight] = useState(400); // 初期値を400pxに設定

  // 保存の成功状態を管理
  const [saveSuccess, setSaveSuccess] = useState(null);

  // 保存のエラーメッセージを管理
  const [saveError, setSaveError] = useState("");

  // 画像解析モーダル表示状態
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  // 保存関連の状態変数
  const [isSaving, setIsSaving] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newBlockName, setNewBlockName] = useState("");
  const [newHtmlBlockName, setNewHtmlBlockName] = useState("");
  const [conflictInfo, setConflictInfo] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [saveHtmlFile, setSaveHtmlFile] = useState(true); // HTMLファイルを保存するかどうか
  const [conflictingScssBlocks, setConflictingScssBlocks] = useState([]);
  const [nonConflictingScssBlocks, setNonConflictingScssBlocks] = useState([]);
  const [blockRenameMap, setBlockRenameMap] = useState({});
  const [blockSaveMap, setBlockSaveMap] = useState({});
  const [blockValidationErrors, setBlockValidationErrors] = useState({});
  const [processingStep, setProcessingStep] = useState("initial");
  const [detectedScssBlocks, setDetectedScssBlocks] = useState([]);
  const [detectedHtmlBlocks, setDetectedHtmlBlocks] = useState([]);
  const [selectedScssBlock, setSelectedScssBlock] = useState(null);
  const [showBlockDetails, setShowBlockDetails] = useState(false);
  const [selectedHtmlFile, setSelectedHtmlFile] = useState("");
  const [blockNameValidationError, setBlockNameValidationError] = useState("");
  const [htmlFiles, setHtmlFiles] = useState([]); // HTMLファイル一覧
  const [savedScssFilesCount, setSavedScssFilesCount] = useState(0); // SCSS保存ファイル数
  const [savedHtmlFilesCount, setSavedHtmlFilesCount] = useState(0); // HTML保存ファイル数

  // ブロック関連の状態管理を追加
  const [blockName, setBlockName] = useState("component"); // デフォルトのブロック名

  // プレビュー関連の状態管理

  // プレビュー更新を強制的に走らせる用（サイズ変更後すぐ）
  const forceUpdatePreview = (width) => {
    if (!previewRef.current) return;
    const iframe = previewRef.current;
    iframe.style.width = `${width}px`;

    try {
      // 常に3ステップの変換処理を適用
      console.log('SCSSを3ステップで処理します');

      // 1. ネスト解除
      let css = flattenSCSS(editingCSS || '');

      // 2. px→rem変換
      css = convertPxToRem(css);

      // 3. @include mq→@media変換
      css = processMediaQueries(css, breakpoints, responsiveMode);

      // 処理したCSSを保存
      setProcessedCSS(css);

      // iframeに書き込み
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=${width}">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
              width: 100%;
              height: 100%;
            }
            ${css}
          </style>
        </head>
        <body>
          ${editingHTML || ''}
        </body>
        </html>
      `);
      iframeDoc.close();

      // 高さを調整
      setTimeout(() => {
        adjustIframeHeight();
        adjustPreviewContainerHeight();
      }, 200);

      console.log('✅ プレビュー更新完了');
    } catch (error) {
      console.error('プレビュー更新中にエラーが発生しました:', error);

      // エラー時のフォールバック（最低限の表示を保証）
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=${width}">
            <style>
              html, body {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                width: 100%;
                height: 100%;
              }
              /* 最低限のスタイル */
              ${editingCSS || ''}
            </style>
          </head>
          <body>
            ${editingHTML || ''}
          </body>
          </html>
        `);
        iframeDoc.close();
      } catch (fallbackError) {
        console.error('フォールバック表示にも失敗しました:', fallbackError);
      }
    }
  };

  // プレビューサイズ変更のハンドラー
  const handlePreviewSizeChange = (size) => {
    setSelectedPreviewSize(size);

    let width;
    switch (size) {
      case 'sp':
        width = 375;
        break;
      case 'tablet':
        width = 768;
        break;
      case 'pc':
        width = 1440;
        break;
      case 'wide':
        width = 1920;
        break;
      case 'custom':
        width = customWidth || 1440;
        break;
      default:
        width = 375;
    }

    setPreviewWidth(width);

    // プレビューを即時更新
    setTimeout(() => {
      forceUpdatePreview(width);
    }, 0);
  };

  // 初期化処理（プロジェクト設定を読み込む）
  useEffect(() => {
    const loadResponsiveSettings = async () => {
      try {
        // APIが利用可能か確認
        if (!window.api || !window.api.loadActiveProjectId || !window.api.loadProjectData) {
          console.warn('API が利用できません。デフォルト値を使用します。');
          // デフォルト値を設定
          setResponsiveMode("sp");
          setBreakpoints([
            { id: 1, name: 'sm', value: 600, active: true },
            { id: 2, name: 'md', value: 768, active: true },
            { id: 3, name: 'lg', value: 1024, active: true },
            { id: 4, name: 'xl', value: 1440, active: true },
          ]);
          setAiBreakpoints([
            { id: 1, name: 'sm', value: 600, active: true, aiActive: true },
            { id: 2, name: 'md', value: 768, active: true, aiActive: true },
            { id: 3, name: 'lg', value: 1024, active: true, aiActive: true },
            { id: 4, name: 'xl', value: 1440, active: true, aiActive: true },
          ]);
          return;
        }

        // アクティブプロジェクトのIDを取得
        const projectId = await window.api.loadActiveProjectId();
        if (!projectId) {
          console.warn('アクティブプロジェクトが見つかりません。デフォルト値を使用します。');
          // デフォルト値を設定
          setResponsiveMode("sp");
          setBreakpoints([
            { id: 1, name: 'sm', value: 600, active: true },
            { id: 2, name: 'md', value: 768, active: true },
            { id: 3, name: 'lg', value: 1024, active: true },
            { id: 4, name: 'xl', value: 1440, active: true },
          ]);
          setAiBreakpoints([
            { id: 1, name: 'sm', value: 600, active: true, aiActive: true },
            { id: 2, name: 'md', value: 768, active: true, aiActive: true },
            { id: 3, name: 'lg', value: 1024, active: true, aiActive: true },
            { id: 4, name: 'xl', value: 1440, active: true, aiActive: true },
          ]);
          return;
        }

        // JSONからレスポンシブ設定を読み込む
        const responsiveSettingsResult = await window.api.loadProjectData(projectId, 'responsiveSettings');
        console.log('JSONから読み込んだレスポンシブ設定:', responsiveSettingsResult);

        if (responsiveSettingsResult) {
          // レスポンシブモードを設定
          if (responsiveSettingsResult.responsiveMode) {
            setResponsiveMode(responsiveSettingsResult.responsiveMode);
          }

          // ブレークポイント設定
          if (responsiveSettingsResult.breakpoints && Array.isArray(responsiveSettingsResult.breakpoints)) {
            setBreakpoints(responsiveSettingsResult.breakpoints);
            // アクティブなブレークポイントのみをAI用に設定
            setAiBreakpoints(
              responsiveSettingsResult.breakpoints
                .filter((bp) => bp.active)
                .map((bp) => ({ ...bp, aiActive: true }))
            );
          }
        } else {
          console.warn('レスポンシブ設定が見つかりません。デフォルト値を使用します。');
          // デフォルト値を設定
          setResponsiveMode("sp");
          setBreakpoints([
            { id: 1, name: 'sm', value: 600, active: true },
            { id: 2, name: 'md', value: 768, active: true },
            { id: 3, name: 'lg', value: 1024, active: true },
            { id: 4, name: 'xl', value: 1440, active: true },
          ]);
          setAiBreakpoints([
            { id: 1, name: 'sm', value: 600, active: true, aiActive: true },
            { id: 2, name: 'md', value: 768, active: true, aiActive: true },
            { id: 3, name: 'lg', value: 1024, active: true, aiActive: true },
            { id: 4, name: 'xl', value: 1440, active: true, aiActive: true },
          ]);
        }
      } catch (error) {
        console.error('レスポンシブ設定の読み込みエラー:', error);
        // エラー時はデフォルト値を使用
        setResponsiveMode("sp");
        setBreakpoints([
          { id: 1, name: 'sm', value: 600, active: true },
          { id: 2, name: 'md', value: 768, active: true },
          { id: 3, name: 'lg', value: 1024, active: true },
          { id: 4, name: 'xl', value: 1440, active: true },
        ]);
        setAiBreakpoints([
          { id: 1, name: 'sm', value: 600, active: true, aiActive: true },
          { id: 2, name: 'md', value: 768, active: true, aiActive: true },
          { id: 3, name: 'lg', value: 1024, active: true, aiActive: true },
          { id: 4, name: 'xl', value: 1440, active: true, aiActive: true },
        ]);
      }
    };

    loadResponsiveSettings();

    // 初期表示のためにプレビューを更新
    setTimeout(() => {
      forceUpdatePreview(previewWidth);
    }, 500); // 初回は少し長めの遅延
  }, []);

  // HTMLファイル一覧の取得
  useEffect(() => {
    const loadHtmlFiles = async () => {
      if (window.api && window.api.getHtmlFiles) {
        try {
          console.log('HTMLファイル一覧を取得します');
          const files = await window.api.getHtmlFiles();
          console.log('取得したHTMLファイル一覧:', files);

          if (Array.isArray(files) && files.length > 0) {
            // ファイルの順番を逆にする
            const reversedFiles = [...files].reverse();
            setHtmlFiles(reversedFiles);
            console.log('HTMLファイル一覧を設定しました（逆順）:', reversedFiles);

            // デフォルトで最初のファイル（逆順後の先頭、元の最後）を選択
            if (!selectedHtmlFile && reversedFiles.length > 0) {
              setSelectedHtmlFile(reversedFiles[0]);
              console.log('デフォルトのHTMLファイルを選択しました:', reversedFiles[0]);
            }
          } else {
            console.warn('HTMLファイルが見つかりませんでした');
            setHtmlFiles([]);
          }
        } catch (error) {
          console.error('HTMLファイル一覧の取得に失敗しました:', error);
          setHtmlFiles([]);
        }
      }
    };

    // コンポーネントマウント時に一度だけ実行
    loadHtmlFiles();
  }, []);

  // コード編集時にブロックを検出するuseEffect
  useEffect(() => {
    if (editingCSS && editingHTML) {
      // SCSSブロックの検出
      const scssBlocks = detectScssBlocks(editingCSS);
      setDetectedScssBlocks(scssBlocks);

      // HTMLブロックの検出
      const htmlBlocks = detectHtmlBlocks(editingHTML);
      setDetectedHtmlBlocks(htmlBlocks);

      // メインHTMLブロック（p-、c-、l-で始まるもの）を検出
      const mainHtmlBlocks = htmlBlocks.filter(block =>
        /^[pcl]-[a-zA-Z0-9_-]+$/.test(block.name) &&
        !block.name.includes('__') &&
        !block.name.includes(':')
      );

      console.log("検出されたメインHTMLブロック:", mainHtmlBlocks.map(b => b.name));

      // 最初に検出されたHTMLブロックをデフォルトのブロック名に設定
      if (mainHtmlBlocks.length > 0) {
        // 既にブロック名が設定されていない場合、またはユーザーが明示的に変更していない場合にのみ更新
        if (!blockName || blockName === '') {
          setBlockName(mainHtmlBlocks[0].name);
          console.log("HTMLから検出したブロック名を設定:", mainHtmlBlocks[0].name);
        }
      }

      console.log("検出されたSCSSブロック:", scssBlocks);
      console.log("検出されたHTMLブロック:", htmlBlocks);
    }
  }, [editingCSS, editingHTML]);

  // コード生成後に編集モードを有効化
  useEffect(() => {
    if (generatedHTML && generatedCSS) {
      setEditingHTML(generatedHTML);
      setEditingCSS(generatedCSS);

      // 生成されたHTMLからブロック名を自動検出
      const htmlBlocks = detectHtmlBlocks(generatedHTML);
      // メインHTMLブロック（p-、c-、l-で始まるもの）を検出
      const mainHtmlBlocks = htmlBlocks.filter(block =>
        /^[pcl]-[a-zA-Z0-9_-]+$/.test(block.name) &&
        !block.name.includes('__') &&
        !block.name.includes(':')
      );

      console.log("生成されたHTMLから検出したメインブロック:", mainHtmlBlocks.map(b => b.name));

      // 最初に検出されたメインHTMLブロックをデフォルトのブロック名に設定
      if (mainHtmlBlocks.length > 0) {
        setBlockName(mainHtmlBlocks[0].name);
        console.log("生成されたHTMLから検出したブロック名を設定:", mainHtmlBlocks[0].name);
      }
    }
  }, [generatedHTML, generatedCSS]);

  // プレビューコンテナ全体の高さを調整する関数
  const adjustPreviewContainerHeight = () => {
    const iframe = previewRef.current;
    const container = previewContainerRef.current;

    if (!iframe || !container) return;

    // iframeの中身の高さを取得
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const iframeContentHeight =
      iframeDoc?.body?.scrollHeight ||
      iframeDoc?.documentElement?.scrollHeight ||
      600; // 最低値

    // ヘッダーの高さを取得（実際のDOM要素から取得するのがベスト）
    const header = container.querySelector('.preview-header');
    const headerHeight = header?.offsetHeight || 60; // ヘッダーがなければデフォルト値

    const padding = 60; // 上下の余白
    const scale = scaleRatio; // 現在のスケール率

    // スケーリングされた高さを計算
    const scaledHeight = iframeContentHeight * scale;
    const finalHeight = Math.max(400, Math.ceil(scaledHeight + headerHeight + padding));

    console.log(`プレビューコンテナ高さ調整: iframeContent=${iframeContentHeight}px, scale=${scale}, scaled=${scaledHeight}px, header=${headerHeight}px, final=${finalHeight}px`);

    // コンテナの高さを設定
    container.style.height = `${finalHeight}px`;
    container.style.minHeight = `${finalHeight}px`;
  };

  // iframeの高さ調整（iframeの内部高さのみを設定）
  const adjustIframeHeight = () => {
    try {
      if (previewRef.current) {
        const iframe = previewRef.current;
        const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;

        // 実際のコンテンツ領域のサイズを取得
        const bodyHeight = Math.max(
          iframeDocument.body.scrollHeight,
          iframeDocument.documentElement.scrollHeight,
          iframeDocument.body.offsetHeight,
          iframeDocument.documentElement.offsetHeight,
          600 // 最低値
        );

        // 高さが大きく変わる場合のみ更新
        if (Math.abs(bodyHeight - iframeHeight) > 20) {
          console.log(`iframe内部高さ調整: ${iframeHeight}px → ${bodyHeight}px`);
          setIframeHeight(bodyHeight);

          // iframeHeightが変わったので、少し遅らせてコンテナ全体の高さも調整
          setTimeout(() => {
            adjustPreviewContainerHeight();
          }, 500);
        }
      }
    } catch (error) {
      console.error("iframeの高さ調整中にエラーが発生しました:", error);
    }
  };

  // コンテンツが変更された場合にiframeの高さを調整
  useEffect(() => {
    if (previewRef.current && editingHTML && editingCSS) {
      // 遅延を入れて高さを調整
      const timer = setTimeout(() => {
        adjustIframeHeight();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [editingHTML, editingCSS, previewWidth]);

  // プレビュー更新
  useEffect(() => {
    if (previewRef.current && editingHTML && editingCSS) {
      try {
        // SCSSの@includeをCSSメディアクエリに変換する処理
        let processedCSS = editingCSS || '';

        // colorValuesをより広いスコープで定義
        let colorValues = {};

        // 変数と色の設定を取得する非同期関数
        const loadColorVariables = async () => {
          try {
            // アクティブプロジェクトからCSS変数を取得
            let defaultColors = {};

            // APIとプロジェクトIDが利用可能かチェック
            if (window.api && window.api.loadActiveProjectId && window.api.loadProjectData) {
              const projectId = await window.api.loadActiveProjectId();

              if (projectId) {
                // プロジェクトからCSS変数データを取得
                let variableSettingsResult;
                try {
                  variableSettingsResult = await window.api.loadProjectData(projectId, 'variableSettings');
                  console.log('取得した変数設定:', variableSettingsResult);

                  // 新形式（カスタムカラー配列）の場合
                  if (variableSettingsResult?.data?.customColors || variableSettingsResult?.customColors) {
                    const customColors = variableSettingsResult?.data?.customColors || variableSettingsResult?.customColors || [];
                    console.log('カスタムカラー配列:', customColors);

                    customColors.forEach(item => {
                      if (item?.name && item?.color) {
                        defaultColors[item.name] = item.color;
                        console.log(`変数マッピング: ${item.name} => ${item.color}`);
                      }
                    });
                  }
                  // 旧形式（文字列）の場合
                  else {
                    const variableSettings = variableSettingsResult?.data || variableSettingsResult || '';

                    // 変数の抽出
                    const varRegex = /\$([\w-]+):\s*([^;]+);/g;
                    let match;
                    let count = 0;

                    console.log('変数抽出を開始...');

                    try {
                      while ((match = varRegex.exec(variableSettings)) !== null) {
                        if (match && match.length >= 3) {
                          const [fullMatch, varName, varValue] = match;
                          const variableWithDollar = `$${varName}`;
                          defaultColors[variableWithDollar] = varValue.trim();
                          console.log(`抽出: ${fullMatch} → 変数名: ${variableWithDollar}, 値: ${varValue.trim()}`);
                          count++;
                        }
                      }
                    } catch (err) {
                      console.error('正規表現での変数抽出中にエラーが発生しました:', err);
                    }
                  }

                  console.log(`プロジェクトID ${projectId} から色変数を取得しました`);
                  console.log('抽出された変数:', defaultColors);
                } catch (err) {
                  console.error('CSS変数データの取得に失敗しました:', err);
                }
              } else {
                console.warn('アクティブプロジェクトが見つかりません。デフォルト値を使用します。');
              }
            } else {
              console.warn('APIが利用できません。デフォルト値を使用します。');
            }

            // 設定がない場合のフォールバック
            if (Object.keys(defaultColors).length === 0) {
              defaultColors['$primary-color'] = '#DDF0F1';
              defaultColors['$blue'] = '#408F95';
              console.log('デフォルト値を使用します:', defaultColors);
            }

            // 色値を使用してCSSを処理 - グローバル変数に代入
            colorValues = { ...defaultColors };

            console.log("プレビューに使用する色変数:", colorValues);

            // SCSS変数を実際の色値に置換
            Object.entries(colorValues).forEach(([variable, value]) => {
              const regex = new RegExp(variable.replace('$', '\\$'), 'g');
              processedCSS = processedCSS.replace(regex, value);
            });

            // SCSS関数の処理（darken, lightenなど）を実行
            processedCSS = processDarkenFunction(processedCSS);
            processedCSS = processLightenFunction(processedCSS);

            // メディアクエリの処理
            processedCSS = processBreakpoints(processedCSS);

            // 処理されたCSSをiframeに適用
            updatePreview(processedCSS);
          } catch (error) {
            console.error('色変数の処理中にエラーが発生しました:', error);
            // エラー時は未処理のCSSでプレビューを更新
            updatePreview(processedCSS);
          }
        };

        // darken関数の処理
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

        // lighten関数の処理
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

        // メディアクエリの処理
        const processBreakpoints = (css) => {
          if (!css) return css;

          // breakpoints関数の処理
          const breakpointRegex = /@breakpoint\((\w+)\) {([^}]*)}/g;
          let processedCss = css;
          let match;

          // ブレークポイント名から値へのマッピング
          const bpMap = {};
          breakpoints.forEach(bp => {
            if (bp.active) {
              bpMap[bp.name] = bp.value;
            }
          });

          // すべてのブレークポイント関数を検索
          while ((match = breakpointRegex.exec(css)) !== null) {
            const [fullMatch, bpName, content] = match;

            // 設定されているブレークポイントのみを処理
            if (bpMap[bpName]) {
              const mediaQueryStart = `@media (min-width: ${bpMap[bpName]}px)`;

              // セレクタと中身を抽出
              const contentLines = content.trim().split('\n');
              const processedContent = contentLines
                .map(line => line.trim())
                .filter(line => line)
                .join('\n  ');

              const replacement = `${mediaQueryStart} {\n  ${processedContent}\n}`;
              processedCss = processedCss.replace(fullMatch, replacement);
            } else {
              // 未設定のブレークポイントは削除
              processedCss = processedCss.replace(fullMatch, '');
            }
          }

          return processedCss;
        };

        // remをpxに変換する関数
        const convertRemToPx = (remValue) => {
          // デフォルトのベースフォントサイズは16px
          const baseFontSize = 16;
          // remの値を数値に変換
          const numericValue = parseFloat(remValue.replace('rem', ''));
          // pxに変換して返す
          return numericValue * baseFontSize;
        };

        // CSSのプロパティのremをpxに変換（必要に応じて）
        const processRemValues = (css) => {
          if (!css) return css;

          // remを含むプロパティを検出する正規表現
          const remPattern = /([0-9.]+)rem/g;

          // すべてのrem値をpxに変換
          return css.replace(remPattern, (match, value) => {
            const pxValue = convertRemToPx(match);
            return `${pxValue}px`;
          });
        };

        // プレビュー更新時のCSS処理を行う関数
        const updatePreviewWithProcessedCSS = (processedCSS) => {
          if (previewRef.current) {
            try {
              // iframeのdocumentを取得
              const iframe = previewRef.current;
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

              // 基本的なHTMLドキュメントを構築（viewportメタタグを現在のプレビュー幅に合わせる）
              iframeDoc.open();
              iframeDoc.write(`
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=${previewWidth}">
                    <style>
                      html, body {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                        width: 100%;
                        height: 100%;
                      }
                      ${processedCSS}
                    </style>
                  </head>
                  <body>
                    ${editingHTML}
                  </body>
                  </html>
                `);
              iframeDoc.close();

              // 高さを調整（少し遅延させて確実に反映）
              setTimeout(() => {
                adjustIframeHeight();
                adjustPreviewContainerHeight();
              }, 200);

              console.log(`プレビュー更新: viewport幅=${previewWidth}px に設定しました`);
            } catch (error) {
              console.error('プレビュー更新中にエラーが発生しました:', error);
            }
          }
        };

        // エラー処理用のupdatePreview関数
        const updatePreview = (processedCSS) => updatePreviewWithProcessedCSS(processedCSS);

        // 非同期処理を開始
        loadColorVariables();
      } catch (error) {
        console.error("プレビュー更新中にエラーが発生しました:", error);
      }
    }
  }, [editingHTML, editingCSS, previewWidth, breakpoints, responsiveMode]);

  // iframeの高さが変わったときにプレビューコンテナの高さも更新
  useEffect(() => {
    // この処理が頻繁に実行されないよう、遅延を入れる
    const timer = setTimeout(() => {
      if (previewContainerRef.current && previewRef.current) {
        adjustPreviewContainerHeight();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [iframeHeight, previewWidth, scaleRatio]);

  // プレビューサイズが変わったときにスケールを再計算
  useEffect(() => {
    calculateScale();
  }, [previewWidth]);

  // ウィンドウサイズが変わった時にスケールを再計算（デバウンス処理追加）
  useEffect(() => {
    // スケール計算関数をデバウンス処理
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        calculateScale();
        adjustPreviewContainerHeight();
      }, 200); // 200ms以内の連続イベントを無視
    };

    // リサイズイベントリスナー設定
    window.addEventListener('resize', handleResize);

    // クリーンアップ関数
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [previewWidth]); // previewWidthが変わったときだけ再設定

  // スケールの計算
  const calculateScale = () => {
    if (!previewContainerRef.current) {
      setScaleRatio(1);
      return;
    }

    // プレビューコンテナの実際の幅を取得
    const containerRect = previewContainerRef.current.getBoundingClientRect();

    // パディングとボーダーなどを考慮して、利用可能な実際の幅を計算
    const availableWidth = containerRect.width - 40; // 左右のパディング

    // より正確なスケール計算（小数点以下6桁まで保持）
    const scale = Math.min(1, parseFloat((availableWidth / previewWidth).toFixed(6)));

    console.log(`スケール計算: コンテナ幅=${containerRect.width}px, 使用可能幅=${availableWidth}px, プレビュー幅=${previewWidth}px, 計算スケール=${scale}`);

    // スケールを設定して適用
    setScaleRatio(scale);

    // previewIframeContainerにスケールを直接適用
    const previewIframeContainer = document.querySelector('.preview-iframe-container');
    if (previewIframeContainer) {
      previewIframeContainer.style.width = `${previewWidth}px`; // ← ここが重要！
      previewIframeContainer.style.transform = `scale(${scale})`;
      previewIframeContainer.style.transformOrigin = 'top left';
    }

    // コンテナの高さも調整（少し遅延させて確実に反映）
    setTimeout(() => {
      adjustPreviewContainerHeight();
    }, 50);
  };

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
    let sizeKey = 'sp';

    // サイズ値からサイズキーを特定
    switch (size) {
      case 375:
        sizeKey = 'sp';
        break;
      case 768:
        sizeKey = 'tablet';
        break;
      case 1440:
        sizeKey = 'pc';
        break;
      case 1920:
        sizeKey = 'wide';
        break;
      default:
        sizeKey = 'sp';
    }

    // handlePreviewSizeChangeを呼び出す
    handlePreviewSizeChange(sizeKey);
  };

  // カスタムサイズの適用
  const applyCustomSize = () => {
    if (customSizeInput) {
      const width = parseInt(customSizeInput, 10);
      if (width >= 320 && width <= 2560) {
        setCustomWidth(width);
        setPreviewWidth(width);
        setShowCustomSizeInput(false);

        // カスタムサイズ変更後にプレビューを強制更新
        setTimeout(() => {
          forceUpdatePreview(width);
        }, 0);
      }
    }
  };

  // カスタムサイズ入力フォームの表示
  const showCustomSizeForm = () => {
    setShowCustomSizeInput(true);
    setCustomSizeInput(previewWidth.toString());
  };

  // 画像をリサイズする関数
  const resizeImage = (base64Image, maxWidth) => {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            // もし画像が既に指定サイズ以下なら処理しない
            if (img.width <= maxWidth) {
              console.log(`画像リサイズ不要: 現在の幅 ${img.width}px は最大幅 ${maxWidth}px 以下です`);
              // メモリリーク防止のため参照をクリア
              URL.revokeObjectURL(img.src);
              resolve(base64Image);
              return;
            }

            // 縦横比を維持したまま幅を調整
            const ratio = maxWidth / img.width;
            const width = maxWidth;
            const height = img.height * ratio;

            // Canvasで描画
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            // JPEG形式で出力して圧縮率を調整
            const quality = 0.85; // 画質（0.0〜1.0）
            const resizedBase64 = canvas.toDataURL("image/jpeg", quality);

            console.log(`画像リサイズ完了: ${img.width}x${img.height} → ${width}x${height}`);
            console.log(`サイズ変更: ${Math.round(base64Image.length / 1024)}KB → ${Math.round(resizedBase64.length / 1024)}KB`);

            // メモリリーク防止のため参照をクリア
            URL.revokeObjectURL(img.src);

            // Canvasを削除（GCのヒント）
            canvas.width = 0;
            canvas.height = 0;

            resolve(resizedBase64);
          } catch (err) {
            console.error("Canvasでの描画エラー:", err);
            reject(err);
          }
        };

        img.onerror = (err) => {
          console.error("画像読み込みエラー:", err);
          reject(new Error("画像の読み込みに失敗しました"));
        };

        // Data URLを設定して読み込み開始
        img.src = base64Image;
      } catch (err) {
        console.error("画像リサイズエラー:", err);
        reject(err);
      }
    });
  };

  // 画像を処理・最適化する関数
  const processImage = (base64Image) => {
    return new Promise(async (resolve, reject) => {
      try {
        const startTime = performance.now();

        // 画像のメディアタイプを検出
        const mediaTypeMatch = base64Image.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';

        // PNGの場合はJPEGに変換
        let processedImage = base64Image;
        if (mediaType.includes('png')) {
          processedImage = await convertToJpeg(base64Image);
        }

        // サイズが大きい場合はさらに圧縮
        if (processedImage.length > 500000) { // 500KB以上の場合
          const maxWidth = processedImage.length > 1000000 ? 1200 : 1600; // 1MB以上なら1200px、それ以外は1600px
          processedImage = await resizeImage(processedImage, maxWidth);
        }

        const endTime = performance.now();
        console.log(`画像処理完了: ${Math.round((endTime - startTime) / 10) / 100}秒`);

        resolve({
          base64: processedImage,
          mimeType: 'image/jpeg'
        });
      } catch (err) {
        console.error("画像処理エラー:", err);
        reject(err);
      }
    });
  };

  // 画像アップロード時の処理
  const handleImageUpload = async (e, type) => {
    try {
      e.stopPropagation();
      const file = e.target.files[0];
      if (!file) return;

      // 前の画像のBlobURLがあれば解放
      if (type === 'pc' && pcImage && pcImage.preview && pcImage.preview.startsWith('blob:')) {
        URL.revokeObjectURL(pcImage.preview);
      } else if (type === 'sp' && spImage && spImage.preview && spImage.preview.startsWith('blob:')) {
        URL.revokeObjectURL(spImage.preview);
      }

      // 念のため古い参照を解放
      if (type === 'pc') {
        setPcImage(null);
        setPcImageBase64(null);
      } else {
        setSpImage(null);
        setSpImageBase64(null);
      }

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
          } else if (type === 'sp') {
            setSpImage({
              file,
              preview: processedBase64 // Data URLを直接使用
            });
            setSpImageBase64(processedBase64);
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
  const handleUpdateCode = async () => {
    try {
      setUpdating(true);
      setError(null);

      // CSSを更新
      if (editingCSS !== generatedCSS) {
        // CSSの前処理（remの変換など必要な処理があれば）
        let processedCSS = editingCSS;

        // remをpxに変換する関数
        const convertRemToPx = (remValue) => {
          // デフォルトのベースフォントサイズは16px
          const baseFontSize = 16;
          // remの値を数値に変換
          const numericValue = parseFloat(remValue.replace('rem', ''));
          // pxに変換して返す
          return numericValue * baseFontSize;
        };

        // CSSのプロパティのremをpxに変換
        const processRemValues = (css) => {
          if (!css) return css;
          // remを含むプロパティを検出する正規表現
          const remPattern = /([0-9.]+)rem/g;
          // すべてのrem値をpxに変換
          return css.replace(remPattern, (match, value) => {
            const pxValue = convertRemToPx(match);
            return `${pxValue}px`;
          });
        };

        // プレビュー更新関数
        const updatePreview = (css) => {
          if (previewRef.current) {
            try {
              // iframeのdocumentを取得
              const iframe = previewRef.current;
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

              // 基本的なHTMLドキュメントを構築
              iframeDoc.open();
              iframeDoc.write(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=${previewWidth}">
                <style>
                  html, body {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    width: 100%;
                    height: 100%;
                  }
                  ${css}
                </style>
              </head>
              <body>
                ${editingHTML}
              </body>
              </html>
            `);
              iframeDoc.close();

              // 高さを調整（少し遅延させて確実に反映）
              setTimeout(() => {
                adjustIframeHeight();
                adjustPreviewContainerHeight();
              }, 200);

              console.log(`プレビュー更新: viewport幅=${previewWidth}px に設定しました`);
            } catch (error) {
              console.error('プレビュー更新中にエラーが発生しました:', error);
            }
          }
        };

        // remをpxに変換（必要に応じて）
        processedCSS = processRemValues(processedCSS);

        // プレビューを更新
        updatePreview(processedCSS);

        // 保存用のデータも更新
        setProcessedCSS(processedCSS);
        console.log("CSSを更新しました");
      }

      // HTMLを更新
      if (editingHTML !== generatedHTML) {
        console.log("HTMLを更新しました");
      }

      setUpdating(false);
    } catch (error) {
      console.error("コード更新中にエラーが発生しました:", error);
      setError("コードの更新中にエラーが発生しました。");
      try {
        // エラー時でもプレビューの更新を試みる
        // updatePreview関数は上で定義済み
        setUpdating(false);
      } catch (previewError) {
        console.error("エラー時のプレビュー更新に失敗しました:", previewError);
      }
      setUpdating(false);
    }
  };

  // 再生成処理
  const handleRegenerate = async () => {
    if (loading) return;
    if (!regenerateInstructions.trim()) {
      alert("再生成の指示を入力してください");
      return;
    }

    // メモリクリーンアップを実行
    performMemoryCleanup();

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
      console.log("API設定からAPIキーを取得します...");

      // APIが存在するか確認
      if (!window.api || !window.api.getClaudeApiKey) {
        console.error("APIインターフェースが利用できません");
        alert("API機能が利用できません。アプリケーションの再起動をお試しください。");
        setLoading(false);
        clearInterval(progressTimer);
        return;
      }

      // API設定コンポーネントから保存されたAPIキーを取得
      const apiKeyResponse = await window.api.getClaudeApiKey(); // Electron経由で取得
      console.log("APIキー取得レスポンス:", apiKeyResponse ? "データあり" : "データなし");

      // APIキーのチェック
      if (!apiKeyResponse || !apiKeyResponse.success || !apiKeyResponse.claudeKey) {
        console.error("APIキー取得エラー:", apiKeyResponse?.error || "不明なエラー");
        alert("APIキーが取得できませんでした。src/config/api-keys.js に有効なAPIキーが設定されているか確認してください。");
        setLoading(false);
        clearInterval(progressTimer);
        return;
      }

      console.log("APIキーの取得に成功しました");

      const apiKey = apiKeyResponse.claudeKey;

      if (!apiKey) {
        console.error("APIキーが空です");
        alert("有効なAPIキーがありません。src/config/api-keys.js を確認してください。");
        setLoading(false);
        clearInterval(progressTimer);
        return;
      }

      console.log("再生成開始", regenerateInstructions);
      setLoadingStage("指示内容を分析中...");
      setLoadingProgress(20);

      // プロンプトを構築
      setLoadingStage("プロンプト生成中...");
      setLoadingProgress(30);
      const regeneratePrompt = `
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

        }

        // pxをremに変換
        const remCSS = convertPxToRem(flattenedCSS);

        try {
          // HEX値を色変数に変換
          const colorVarsResult = await replaceHexWithVariables(remCSS);
          const { modifiedCode: cssWithVars, replacedCount } = colorVarsResult || { modifiedCode: remCSS, replacedCount: 0 };

          // 未定義色変数をチェックして置換
          const undefinedVarsResult = await replaceUndefinedColorVariables(cssWithVars);
          const { modifiedCode: finalCSS, replacedVars } = undefinedVarsResult || { modifiedCode: cssWithVars, replacedVars: [] };

          if (replacedVars && replacedVars.length > 0) {
            console.log(`${replacedVars.length}個の未定義変数をHEX値に置換しました`);
          }

          setEditingCSS(finalCSS);
          setGeneratedCSS(finalCSS); // 表示用の状態も同時に更新
        } catch (colorProcessingError) {
          console.error("色変数処理中にエラーが発生しました:", colorProcessingError);

          // エラー時は基本処理の結果を使用
          setEditingCSS(remCSS);
          setGeneratedCSS(remCSS);
        }
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
    try {
      console.log("API設定からAPIキーを取得します...");

      // APIが存在するか確認
      if (!window.api || !window.api.getClaudeApiKey) {
        console.error("APIインターフェースが利用できません");
        alert("API機能が利用できません。アプリケーションの再起動をお試しください。");
        return;
      }

      // アプリメモリの状態を確認
      performMemoryCleanup();

      // API設定コンポーネントから保存されたAPIキーを取得
      const apiKeyResponse = await window.api.getClaudeApiKey(); // Electron経由で取得
      console.log("APIキー取得レスポンス:", apiKeyResponse ? "データあり" : "データなし");

      // APIキーのチェック
      if (!apiKeyResponse || !apiKeyResponse.success || !apiKeyResponse.claudeKey) {
        console.error("APIキー取得エラー:", apiKeyResponse?.error || "不明なエラー");
        alert("APIキーが取得できませんでした。src/config/api-keys.js に有効なAPIキーが設定されているか確認してください。");
        return;
      }

      console.log("APIキーの取得に成功しました");

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
            pcImage: pcImageBase64, // ✅ ここ！！
            spImage: spImageBase64, // ✅ ここ！！
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

        // console.log("生成されたプロンプト:", prompt.substring(0, 100) + "...");
        console.log("生成されたプロンプト:", prompt);

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

          }

          // pxをremに変換
          setLoadingProgress(90);
          setLoadingStage("単位の最適化中...");
          const remCSS = convertPxToRem(flattenedCSS);

          try {
            // HEX値を色変数に変換
            setLoadingProgress(95);
            setLoadingStage("カラー変数の最適化中...");
            // 非同期関数なのでawaitを使用
            const colorVarsResult = await replaceHexWithVariables(remCSS);
            const { modifiedCode: cssWithVars, replacedCount } = colorVarsResult || { modifiedCode: remCSS, replacedCount: 0 };

            // 未定義色変数をチェックして置換
            // 非同期関数なのでawaitを使用
            const undefinedVarsResult = await replaceUndefinedColorVariables(cssWithVars);
            const { modifiedCode: finalCSS, replacedVars } = undefinedVarsResult || { modifiedCode: cssWithVars, replacedVars: [] };

            if (replacedVars && replacedVars.length > 0) {
              console.log(`${replacedVars.length}個の未定義変数をHEX値に置換しました`);
            }

            setEditingCSS(finalCSS);
            setGeneratedCSS(finalCSS); // 表示用の状態も同時に更新
            setEditingHTML(html);
            setGeneratedHTML(html);
            setShowGeneratedCode(true);

            // HTMLからブロック名を自動検出
            try {
              const detectedBlocks = detectHtmlBlocks(html);
              // メインHTMLブロック（p-、c-、l-で始まるもの）を検出
              const mainDetectedBlocks = detectedBlocks.filter(block =>
                /^[pcl]-[a-zA-Z0-9_-]+$/.test(block.name) &&
                !block.name.includes('__') &&
                !block.name.includes(':')
              );

              console.log("生成されたHTMLから検出したメインブロック:", mainDetectedBlocks.map(b => b.name));

              // 最初に検出されたメインHTMLブロックをブロック名として設定
              if (mainDetectedBlocks.length > 0) {
                setBlockName(mainDetectedBlocks[0].name);
                console.log("生成されたHTMLから検出したブロック名を設定:", mainDetectedBlocks[0].name);
              }
            } catch (blockDetectionError) {
              console.error("HTMLブロック検出中にエラーが発生しました:", blockDetectionError);
            }

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
          } catch (colorProcessingError) {
            console.error("色変数処理中にエラーが発生しました:", colorProcessingError);

            // エラー時は基本処理の結果を使用
            setEditingCSS(remCSS);
            setGeneratedCSS(remCSS);
            setEditingHTML(html);
            setGeneratedHTML(html);
            setShowGeneratedCode(true);

            setLoadingProgress(100);
            setLoadingStage("完了 (警告: 色変数処理に失敗)");
            setTimeout(() => {
              setLoading(false);
              clearInterval(progressTimer);
            }, 500);
          }

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

    // メモリクリーンアップを実行
    performMemoryCleanup();

    console.log("生成コードをリセットしました（画像は保持）");
  };

  // 全てのデータをリセット（既存のhandleResetを改名）
  const handleResetAll = () => {
    // ユーザーに通知するためのアラート表示
    alert("すべてのデータをリセットし、メモリクリーンアップを実行します。");

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

    // キャッシュクリア
    if (window.caches) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
        console.log("ブラウザキャッシュをクリアしました");
      });
    }

    // メモリを積極的に解放
    if (window.api && window.api.gc) {
      try {
        window.api.gc();
        console.log("Electronのガベージコレクションを実行しました");
      } catch (e) {
        console.error("ガベージコレクション実行エラー:", e);
      }
    }

    // プレビューをリフレッシュ（iframeをクリア）
    if (previewRef.current) {
      try {
        const iframe = previewRef.current;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=375">
            <style>
              body { font-family: sans-serif; text-align: center; color: #666; padding-top: 50px; }
            </style>
          </head>
          <body>
            <p>すべてのデータがリセットされました</p>
          </body>
          </html>
        `);
        iframeDoc.close();
        console.log("プレビューiframeをリフレッシュしました");
      } catch (e) {
        console.error("iframeリフレッシュエラー:", e);
      }
    }

    console.log("すべての生成データをリセットし、メモリクリーンアップを実行しました");
  };

  // メモリクリーンアップ関数
  const performMemoryCleanup = () => {
    console.log("メモリクリーンアップを実行します...");

    // 一時データをクリア
    if (window.URL && window.URL.revokeObjectURL) {
      if (pcImage && pcImage.preview && pcImage.preview.startsWith('blob:')) {
        URL.revokeObjectURL(pcImage.preview);
        console.log("PC画像のBlobを解放しました");
      }
      if (spImage && spImage.preview && spImage.preview.startsWith('blob:')) {
        URL.revokeObjectURL(spImage.preview);
        console.log("SP画像のBlobを解放しました");
      }
    }

    // メモリ使用量をログ出力（開発用）
    if (window.performance && window.performance.memory) {
      console.log("メモリ使用状況:", {
        totalJSHeapSize: Math.round(window.performance.memory.totalJSHeapSize / (1024 * 1024)) + "MB",
        usedJSHeapSize: Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024)) + "MB",
        jsHeapSizeLimit: Math.round(window.performance.memory.jsHeapSizeLimit / (1024 * 1024)) + "MB",
      });

      // メモリ使用量が高い場合に警告
      const usedMemoryPercentage = (window.performance.memory.usedJSHeapSize / window.performance.memory.jsHeapSizeLimit) * 100;
      if (usedMemoryPercentage > 70) {
        console.warn(`メモリ使用量が高いです (${Math.round(usedMemoryPercentage)}%)。メモリリセットボタンを使用することをお勧めします。`);
      }
    }

    // Node.js環境のElectronでのみGCを実行
    if (window.api && window.api.gc) {
      try {
        window.api.gc();
        console.log("Electronのガベージコレクションを実行しました");
      } catch (e) {
        console.error("ガベージコレクション実行エラー:", e);
      }
    }

    return true;
  };

  // 一定間隔でメモリクリーンアップを実行
  useEffect(() => {
    console.log("メモリ監視を開始します");

    // 30秒ごとにクリーンアップを実行
    const cleanupInterval = setInterval(() => {
      performMemoryCleanup();
    }, 30000);

    // メモリ使用量の定期監視
    let memoryMonitorInterval;
    if (window.performance && window.performance.memory) {
      memoryMonitorInterval = setInterval(() => {
        const usedMemoryPercentage = (window.performance.memory.usedJSHeapSize / window.performance.memory.jsHeapSizeLimit) * 100;
        if (usedMemoryPercentage > 80) {
          console.warn(`高メモリ使用量検出 (${Math.round(usedMemoryPercentage)}%)。自動クリーンアップを実行します。`);
          performMemoryCleanup();
        }
      }, 15000); // 15秒ごとに監視
    }

    return () => {
      clearInterval(cleanupInterval);
      if (memoryMonitorInterval) clearInterval(memoryMonitorInterval);
      performMemoryCleanup(); // コンポーネントのアンマウント時にもクリーンアップ
    };
  }, []);

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
  const getDefinedColorVariables = async () => {
    const definedVars = new Map();
    console.group('🔎 アクティブプロジェクトから色変数を取得');

    // APIが使えない場合のフォールバック
    if (!window.api || !window.api.loadActiveProjectId || !window.api.loadProjectData) {
      console.warn('APIが利用できません。デフォルト値を使用します。');
      definedVars.set('$primary-color', '#DDF0F1');
      definedVars.set('$blue', '#408F95');
      console.table(Object.fromEntries(definedVars));
      console.groupEnd();
      return definedVars;
    }

    // アクティブプロジェクトIDの取得
    let projectId;
    try {
      projectId = await window.api.loadActiveProjectId();
    } catch (err) {
      console.error('アクティブプロジェクトIDの取得に失敗:', err);
      definedVars.set('$primary-color', '#DDF0F1');
      definedVars.set('$blue', '#408F95');
      console.table(Object.fromEntries(definedVars));
      console.groupEnd();
      return definedVars;
    }

    if (!projectId) {
      console.warn('アクティブプロジェクトが見つかりません。');
      definedVars.set('$primary-color', '#DDF0F1');
      definedVars.set('$blue', '#408F95');
      console.table(Object.fromEntries(definedVars));
      console.groupEnd();
      return definedVars;
    }

    try {
      const variableSettingsResult = await window.api.loadProjectData(projectId, 'variableSettings');
      console.log('✅ 取得した variableSettingsResult:', variableSettingsResult);

      // 旧形式（dataあり）と新形式（dataなし）両対応
      const rawSettings = variableSettingsResult?.data || variableSettingsResult;

      console.log(`プロジェクトID ${projectId} から色変数を取得しました`);
      console.log('取得したCSS変数内容（生）:', rawSettings);

      const customColors = Array.isArray(rawSettings?.customColors) ? rawSettings.customColors : [];
      console.log('customColors（配列）:', customColors);

      const variableSettings = customColors.reduce((acc, item) => {
        if (item?.name && item?.color) {
          acc[item.name] = item.color;
        }
        return acc;
      }, {});

      console.log('変換後のCSS変数マップ:', variableSettings);

      if (Object.keys(variableSettings).length === 0) {
        console.log('色変数が定義されていません。デフォルト値を使用します。');
        definedVars.set('$primary-color', '#DDF0F1');
        definedVars.set('$blue', '#408F95');
        console.table(Object.fromEntries(definedVars));
        return definedVars;
      }

      Object.entries(variableSettings).forEach(([key, value]) => {
        definedVars.set(key, value);
      });

      console.log('✅ 最終的な definedVars:');
      console.table(Object.fromEntries(definedVars));

      return definedVars;

    } catch (err) {
      console.error('色変数の取得中にエラー:', err);
      definedVars.set('$primary-color', '#DDF0F1');
      definedVars.set('$blue', '#408F95');
      console.table(Object.fromEntries(definedVars));
      console.groupEnd();
      return definedVars;
    }
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
  const getHexToVariableMap = async () => {
    try {
      const colorVariables = await getDefinedColorVariables();
      const hexToVarMap = new Map();

      console.group('🔍 定義済み色変数マップ');

      if (!colorVariables || colorVariables.size === 0) {
        console.log('色変数が定義されていません。デフォルト値を使用します。');
        // デフォルト値を設定
        hexToVarMap.set('#DDF0F1', '$primary-color');
        hexToVarMap.set('#408F95', '$blue');
        console.log('定義されている変数リスト:', Array.from(hexToVarMap.entries()));
        console.log('完成したHEX→変数マッピング:', Object.fromEntries(hexToVarMap));
        console.groupEnd();
        return hexToVarMap;
      }

      try {
        console.log('定義されている変数リスト:', Array.from(colorVariables.entries()));
      } catch (e) {
        console.log('変数リストの表示中にエラーが発生しました:', e);
        console.log('変数リスト:', colorVariables);
      }

      // 変数のマッピングを反転（HEX値 → 変数名）
      colorVariables.forEach((value, name) => {
        // 値が直接HEX値の場合
        if (value && typeof value === 'string' && value.startsWith('#')) {
          // 大文字に統一して保存（比較用）
          hexToVarMap.set(value.toUpperCase(), name);
          console.log(`マッピング追加: ${value.toUpperCase()} → ${name}`);
        }
        // RGB値の場合は近似のHEX値に変換
        else if (value && typeof value === 'string' && (value.includes('rgb') || value.includes('hsl'))) {
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

      try {
        console.log('完成したHEX→変数マッピング:', Object.fromEntries(hexToVarMap));
      } catch (e) {
        console.log('マッピング表示中にエラーが発生しました:', e);
        console.log('マッピングサイズ:', hexToVarMap.size);
      }
      console.groupEnd();

      return hexToVarMap;
    } catch (error) {
      console.error('変数マッピング作成中にエラーが発生しました:', error);
      // エラー時はデフォルト値を返す
      const defaultMap = new Map();
      defaultMap.set('#DDF0F1', '$primary-color');
      defaultMap.set('#408F95', '$blue');
      console.groupEnd();
      return defaultMap;
    }
  };

  // AIが生成したHEX値を変数に置き換える関数
  const replaceHexWithVariables = async (cssCode) => {
    if (!cssCode) return { modifiedCode: cssCode, replacedCount: 0 };

    try {
      // マッピング情報を取得
      const hexToVarMap = await getHexToVariableMap();
      console.group('🔄 HEX値を変数に置換');

      if (!hexToVarMap || hexToVarMap.size === 0) {
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

      if (allHexMatches.length === 0) {
        console.log("HEX値が見つかりませんでした。変換は行いません。");
        console.groupEnd();
        return { modifiedCode: cssCode, replacedCount: 0 };
      }

      // HEX値を変数に置換
      modifiedCode = modifiedCode.replace(hexRegex, (match) => {
        try {
          // 大文字に統一して比較
          const normalizedHex = match.toUpperCase();

          // 既に置換済みのHEX値はキャッシュから取得
          if (replacedHexValues.has(normalizedHex)) {
            return replacedHexValues.get(normalizedHex);
          }

          // 完全一致の変数を探す
          if (hexToVarMap.has(normalizedHex)) {
            const variable = hexToVarMap.get(normalizedHex);
            replacedCount++;
            replacedItems.push({ hex: match, variable, type: '完全一致' });
            replacedHexValues.set(normalizedHex, variable);
            console.log(`HEX値を変数に変換: ${match} → ${variable}`);
            return variable;
          }

          // 近似色の変数を探す（直接一致がない場合）
          let bestMatch = null;
          let minDistance = Number.MAX_VALUE;
          let bestVariable = null;

          // すべての定義済み色から最も近い色を探す
          for (const [hexKey, variable] of hexToVarMap.entries()) {
            try {
              // 色キーが無効な場合はスキップ
              if (!hexKey || !hexKey.startsWith('#')) continue;

              const distance = getColorSimilarity(normalizedHex, hexKey);
              if (distance < minDistance && distance < 20) { // 類似度の閾値
                minDistance = distance;
                bestMatch = hexKey;
                bestVariable = variable;
              }
            } catch (err) {
              console.error(`色の類似度計算中にエラーが発生しました: ${err.message}`);
              // エラーが発生してもループは継続
            }
          }

          // 近似色が見つかった場合
          if (bestMatch && bestVariable) {
            replacedCount++;
            replacedItems.push({
              hex: match,
              variable: bestVariable,
              type: '類似色',
              similarity: minDistance
            });
            replacedHexValues.set(normalizedHex, bestVariable);
            console.log(`HEX値を変数に変換 (類似色): ${match} → ${bestVariable} (類似度: ${minDistance})`);
            return bestVariable;
          }

          // 一致する変数が見つからなかった場合は元のHEX値を保持
          return match;
        } catch (matchError) {
          console.error(`HEX値 ${match} の処理中にエラーが発生しました:`, matchError);
          // エラーが発生した場合は元のHEX値を返す
          return match;
        }
      });

      // 結果のログ出力
      if (replacedCount > 0) {
        console.log(`${replacedCount}個のHEX値を色変数に変換しました`);
        if (replacedItems && replacedItems.length > 0) {
          console.table(replacedItems);
        }
      } else {
        console.log("変換対象となるHEX値は見つかりませんでした");
      }

      console.groupEnd();
      return { modifiedCode, replacedCount };
    } catch (error) {
      console.error("HEX値の変換中にエラーが発生しました:", error);
      console.groupEnd();
      // エラーが発生した場合でも元のコードを返す
      return { modifiedCode: cssCode, replacedCount: 0 };
    }
  };

  // RGB値をHEX値に変換する関数
  const rgbOrHslToHex = (colorStr) => {
    if (!colorStr || typeof colorStr !== 'string') {
      return null;
    }

    try {
      // RGB値の場合
      const rgbMatch = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (rgbMatch && rgbMatch.length >= 4) {
        const [_, r, g, b] = rgbMatch.map(Number);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
      }

      // HSL値の場合（簡易的な実装）
      // 完全な変換はもっと複雑ですが、この例では省略
      return null;
    } catch (error) {
      console.error('RGB/HSL変換エラー:', error);
      return null;
    }
  };

  // 未定義の色変数を実際のHEX値に置き換える関数
  const replaceUndefinedColorVariables = async (scssCode) => {
    if (!scssCode) return { modifiedCode: scssCode, replacedVars: [] };

    try {
      console.group('🔎 アクティブプロジェクトから色変数を取得');
      // 定義済み変数のリストを取得
      const colorVariables = await getDefinedColorVariables();
      const definedVars = colorVariables ? Array.from(colorVariables.keys()) : [];

      console.log('取得した色変数内容:', ''); // ログは残すが空で出力
      console.groupEnd();

      console.group('🔍 未定義変数を検出');
      console.log('定義済み変数リスト:', definedVars);

      // カラー変数マッピング
      const defaultColorMapping = {
        '$primary-color': '#DDF0F1',
        '$blue': '#408F95',
        '$accent-color': '#FF5500',
        '$secondary-color': '#0066CC'
      };

      try {
        // SCSSコード内で使用されている変数を検出
        const varRegex = /\$([\w-]+)/g;
        const usedVars = new Set();
        let match;

        while ((match = varRegex.exec(scssCode)) !== null) {
          const varName = `$${match[1]}`;
          // 明らかに変数ではないパターンを除外
          if (!varName.startsWith('$#') && !varName.match(/^\$\d/)) {
            usedVars.add(varName);
          }
        }

        // 未定義の変数をフィルタリング
        const undefinedVars = Array.from(usedVars).filter(v => !definedVars.includes(v));
        // HEX値のパターンに一致する変数を除外
        const filteredUndefinedVars = undefinedVars.filter(v => {
          // #で始まる16進数のパターンを除外
          return !v.match(/^\$#[0-9a-fA-F]{3,6}$/);
        });

        // 変数のカウントと表示
        const uniqueUndefinedVars = [...new Set(filteredUndefinedVars)];

        if (uniqueUndefinedVars.length > 0) {
          uniqueUndefinedVars.forEach(v => {
            console.log(`未定義変数を検出: ${v}`);
          });
          console.log(`検出された未定義変数: ${uniqueUndefinedVars.length}個`, uniqueUndefinedVars);
        } else {
          console.log('未定義変数は検出されませんでした');
        }

        // 未定義の変数をHEX値に置き換え
        let modifiedCode = scssCode;
        const replacements = [];

        for (const varName of uniqueUndefinedVars) {
          try {
            // カスタマイズされた変数名からデフォルト値を推測
            const fallbackValue =
              defaultColorMapping[varName] ||
              (varName.includes('primary') ? '#999999' :
                varName.includes('secondary') ? '#09627a' :
                  varName.includes('accent') ? '#04a2d2' :
                    varName.includes('background') ? '#f5f5f5' :
                      varName.includes('text') ? '#333333' :
                        '#999999');

            const regex = new RegExp(`\\${varName}\\b`, 'g');
            modifiedCode = modifiedCode.replace(regex, fallbackValue);

            replacements.push({
              variable: varName,
              replacement: fallbackValue,
              reason: defaultColorMapping[varName] ? 'デフォルトマッピング' : '名前に基づく推測'
            });
          } catch (varError) {
            console.error(`変数 ${varName} の置換中にエラーが発生しました:`, varError);
            // エラーが発生しても処理を続行
          }
        }

        console.groupEnd();
        return { modifiedCode, replacedVars: replacements };
      } catch (innerError) {
        console.error("SCSS変数の検出・置換中にエラーが発生しました:", innerError);
        console.groupEnd();
        return { modifiedCode: scssCode, replacedVars: [] };
      }
    } catch (error) {
      console.error("未定義色変数の処理中にエラーが発生しました:", error);
      console.groupEnd();
      return { modifiedCode: scssCode, replacedVars: [] };
    }
  };


  // コード保存関数
  const handleSaveCode = async () => {
    try {
      console.log("保存準備 - HTMLファイル選択状態:", {
        selectedHtmlFile,
        htmlFiles,
        hasHtmlFiles: htmlFiles.length > 0,
        hasSelectedFile: !!selectedHtmlFile
      });

      // SCSS・HTMLコードが空でないかチェック
      if (!editingCSS || editingCSS.trim() === '') {
        setSaveSuccess(false);
        setSaveError("SCSSコードが空です。SCSSコードを入力してください。");
        return;
      }

      // ブロック名が存在するかチェック
      if (!blockName || blockName.trim() === '') {
        setSaveSuccess(false);
        setSaveError("有効なブロック名が設定されていません。ブロック名を設定してください。");
        return;
      }

      // HTMLファイルを選択している場合は、HTMLコードも必須
      if (selectedHtmlFile && (!editingHTML || editingHTML.trim() === '')) {
        setSaveSuccess(false);
        setSaveError("HTMLファイルを選択していますが、HTMLコードが空です。HTMLコードを入力するか、HTMLファイルの選択を解除してください。");
        return;
      }

      console.log("保存処理開始：", {
        blockName,
        selectedHtmlFile,
        hasScssCode: !!editingCSS,
        hasHtmlCode: !!editingHTML,
        scssCodeLength: editingCSS ? editingCSS.length : 0,
        htmlCodeLength: editingHTML ? editingHTML.length : 0
      });

      // 検出されたSCSSブロックを取得（デバウンス付き）
      const detectedScssBlocks = detectScssBlocks(editingCSS);
      const detectedHtmlBlocks = detectHtmlBlocks(editingHTML);

      // 検出結果のログ出力
      console.log("検出されたSCSSブロック:", detectedScssBlocks.length);
      console.log("検出されたHTMLブロック:", detectedHtmlBlocks.length);

      // メインブロック（親ブロック）のみを抽出
      const mainBlocks = detectedScssBlocks.filter(block => {
        // 除外されたブロックはスキップ
        if (excludedBlocks.includes(block.name)) return false;

        // メインブロックの条件：
        // 1. 名前に "__" が含まれていない（要素ではない）
        // 2. 名前に ":" が含まれていない（擬似クラスではない）
        return !block.name.includes('__') && !block.name.includes(':');
      });

      // ログ出力
      console.log("検出されたメインブロック:", mainBlocks.map(b => b.name));

      // 各メインブロックのファイル存在チェック
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
      await saveNonConflictingBlocks(
        mainBlocks,          // SCSSブロックのリスト
        blockName,           // メインHTMLブロック名
        editingHTML,         // HTMLコード
        selectedHtmlFile,    // 対象HTMLファイル
        {
          saveHtmlWithFirstBlock: true, // HTMLを最初のブロックで保存する設定
          htmlFilename: blockName       // HTML保存用のファイル名
        }
      );
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
  const saveNonConflictingBlocks = async (blocks, mainHtmlBlockName, htmlCode, targetHtmlFile, options) => {
    try {
      // リロード防止フラグを設定
      setIsPreventingReload(true);
      // preload.jsにも通知して全体的なリロード防止を有効にする
      if (window.api && window.api.setPreventReload) {
        window.api.setPreventReload(true);
      }

      console.log("保存関数呼び出し詳細：", {
        blocksCount: blocks.length,
        mainHtmlBlockName,
        hasHtmlCode: !!htmlCode,
        htmlCodeLength: htmlCode ? htmlCode.length : 0,
        targetHtmlFile
      });

      // 保存対象のブロックを絞り込み（非衝突ブロックの場合、衝突時用のUIで選択されていない場合はスキップ）
      // 通常モードで呼ばれた場合は、blockSaveMapが空なので全てのブロックが対象となる
      const blocksToSave = blocks.filter(mainBlock => {
        // 衝突処理中で、かつそのブロックが保存対象外にチェックされている場合はスキップ
        if (Object.keys(blockSaveMap).length > 0 && blockSaveMap[mainBlock.name] === false) {
          return false;
        }
        return true;
      });

      console.log("保存対象ブロック数:", blocksToSave.length);
      if (blocksToSave.length > 0) {
        console.log("保存対象ブロック:", blocksToSave.map(b => b.name));
      }

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

          // ブロック名からセレクタのベース部分を取得（コロンより前の部分）
          const baseBlockName = block.name.split(':')[0];

          // メインブロックと同じか、メインブロックから派生したものか
          return block.name === mainBlock.name ||
            block.name.startsWith(mainBlock.name + '__') ||
            // 疑似要素の場合は、ベース部分がメインブロック名と一致するかチェック
            (block.name.includes(':') && baseBlockName === mainBlock.name);
        });

        // 各ブロックの内容をログ出力（デバッグ用）
        relatedBlocks.forEach(block => {
          console.log(`ブロック「${mainBlock.name}」の関連ブロック「${block.name}」がSCSSに含まれます`);
        });

        // 全ブロックのコードを1つにまとめる
        const combinedScssCode = relatedBlocks.map(block => block.code).join('\n\n');

        // HTML保存ロジックの改良
        // オプションがない場合のデフォルト値を設定
        const saveOptions = options || {
          saveHtmlWithFirstBlock: true,
          htmlFilename: mainHtmlBlockName
        };

        // HTMLをどのブロックで保存するかを判定
        let shouldSaveHtml = false;

        // 最初のブロックでHTMLを保存する設定の場合
        if (saveOptions.saveHtmlWithFirstBlock) {
          shouldSaveHtml = blocksToSave.indexOf(mainBlock) === 0;
        } else {
          // ブロック名が一致する場合にHTMLを保存（従来の方法）
          shouldSaveHtml = mainBlock.name === mainHtmlBlockName;
        }

        // HTML保存の設定
        const htmlToSave = shouldSaveHtml && htmlCode ? htmlCode : "";
        const targetHtmlFileToUse = shouldSaveHtml && targetHtmlFile ? targetHtmlFile : null;

        // このブロックのHTML保存状況をログ出力
        console.log(`ブロック「${mainBlock.name}」のHTML保存設定:`, {
          isMainHtmlBlock: shouldSaveHtml,
          hasHtmlToSave: !!htmlToSave && htmlToSave.trim() !== '',
          htmlLength: htmlToSave ? htmlToSave.length : 0,
          targetHtmlFile: targetHtmlFileToUse
        });

        // 保存処理を実行
        const saveResult = await window.api.saveAIGeneratedCode(
          combinedScssCode,      // 統合されたSCSSコード
          htmlToSave,            // 選択されたブロックのみHTMLを保存
          mainBlock.name,        // メインブロック名（SCSSファイル名）
          targetHtmlFileToUse    // 選択されたブロックのみHTMLファイルに追加
        );

        // 保存結果をログ出力
        console.log(`ブロック「${mainBlock.name}」の保存結果:`, {
          success: saveResult.success,
          partialSuccess: saveResult.partialSuccess,
          savedFiles: saveResult.savedFiles,
          error: saveResult.error
        });

        return saveResult;
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
        // すべての結果を集計
        let scssFileCount = 0;
        let htmlFileCount = 0;

        results.forEach(result => {
          if ((result.success || result.partialSuccess) && result.savedFiles) {
            if (result.savedFiles.scss) scssFileCount++;
            if (result.savedFiles.html) htmlFileCount++;
          }
        });

        // グローバルステート変数に保存
        setSavedScssFilesCount(scssFileCount);
        setSavedHtmlFilesCount(htmlFileCount);

        // 検出されたブロック全体の数も考慮
        console.log(`保存完了 - ファイル集計:`, {
          detectedScssBlocks: detectedScssBlocks.length,
          mainBlocks: blocksToSave.length,
          savedScss: scssFileCount,
          savedHtml: htmlFileCount
        });

        setSaveSuccess(true);
        setSaveError(`コードを保存しました！（SCSSファイル: ${scssFileCount}個、HTMLファイル: ${htmlFileCount}個）`);
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
            selectedHtmlFile,
            {
              saveHtmlWithFirstBlock: true,  // 最初のブロックでHTMLを保存
              htmlFilename: newHtmlBlockName || conflictInfo.originalBlockName  // リネームされたHTMLブロック名を使用
            }
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

      // 保存対象のブロックを絞り込み（チェックボックスがオンのもので、かつ疑似要素を持たないもののみ）
      // 疑似要素を持つブロックは除外（メインブロックに統合するため）
      const blocksToSave = blocks.filter(block =>
        blockSaveMap[block.name] && !block.name.includes(':')
      );

      console.log("衝突があるブロックの保存対象:", blocksToSave.map(b => b.name));
      console.log("除外されたブロック（疑似要素など）:", blocks
        .filter(block => !blocksToSave.includes(block))
        .map(b => b.name));

      if (blocksToSave.length === 0) {
        // 保存対象が0の場合は成功として扱う（ユーザーがすべてのチェックを外した場合）
        setSaveSuccess(true);
        setSaveError(`コードを保存しました！（SCSSファイル: 0個、HTMLファイル: 0個）`);
        return;
      }

      const savePromises = blocksToSave.map(async (block) => {
        const newName = blockRenameMap[block.name] || block.name;

        // 関連するブロック（疑似要素を含む）を収集
        const relatedBlocks = blocks.filter(relatedBlock => {
          // ブロック名からセレクタのベース部分を取得（コロンより前の部分）
          const baseBlockName = relatedBlock.name.split(':')[0];

          // 保存対象のブロックに関連するもの（同じ名前または派生したもの）
          return relatedBlock.name === block.name ||
            relatedBlock.name.startsWith(block.name + '__') ||
            (relatedBlock.name.includes(':') && baseBlockName === block.name);
        });

        // 関連ブロックの内容をログ出力
        relatedBlocks.forEach(relBlock => {
          console.log(`衝突ブロック「${block.name}」の関連ブロック「${relBlock.name}」を統合します`);
        });

        // すべての関連ブロックのSCSSコードを結合
        const combinedScssCode = relatedBlocks.map(relBlock => relBlock.code).join('\n\n');

        // HTMLファイルの保存は最初のブロックのみで行う
        // ブロックが複数ある場合、最初のブロックにのみHTMLを関連付ける
        const isFirstBlock = blocksToSave.indexOf(block) === 0;
        const htmlToSave = isFirstBlock ? htmlCode : "";
        const targetHtmlFileToUse = isFirstBlock ? targetHtmlFile : null;

        // HTMLファイルの保存状況をログ出力
        console.log(`リネーム保存: ブロック「${block.name}→${newName}」のHTML保存設定:`, {
          isFirstBlock: isFirstBlock,
          hasHtmlToSave: !!htmlToSave && htmlToSave.trim() !== '',
          htmlLength: htmlToSave ? htmlToSave.length : 0,
          targetHtmlFile: targetHtmlFileToUse
        });

        return await window.api.saveAIGeneratedCode(
          combinedScssCode,
          htmlToSave,
          newName,
          targetHtmlFileToUse
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
        let scssFileCount = 0;
        let htmlFileCount = 0;

        results.forEach(result => {
          if ((result.success || result.partialSuccess) && result.savedFiles) {
            if (result.savedFiles.scss) scssFileCount++;
            if (result.savedFiles.html) htmlFileCount++;
          }
        });

        // グローバルステート変数に保存
        setSavedScssFilesCount(scssFileCount);
        setSavedHtmlFilesCount(htmlFileCount);

        setSaveSuccess(true);
        setSaveError(`コードを保存しました！（SCSSファイル: ${scssFileCount}個、HTMLファイル: ${htmlFileCount}個）`);

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
        // メインブロックの条件：
        // 1. 名前に "__" が含まれていない（要素ではない）
        // 2. 名前に ":" が含まれていない（擬似クラスではない）
        // 3. 除外されたブロックではない
        return !block.name.includes('__') &&
          !block.name.includes(':') &&
          !excludedBlocks.includes(block.name);
      });

      // ブロック情報をログ出力
      console.log("メインブロック（保存対象）:", mainBlocks.map(b => b.name));
      console.log("除外されたブロック:", excludedBlocks);

      // 疑似要素を持つブロックを特定してログ出力
      const pseudoBlocks = detectedScssBlocks.filter(block =>
        block.name.includes(':') && !block.name.includes('__')
      );
      console.log("疑似要素を持つブロック（メインブロックに統合）:", pseudoBlocks.map(b => b.name));

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

  // 画像分析ボタンがクリックされたときの処理
  const handleAnalyzeImage = async (type) => {
    try {
      const image = type === 'pc' ? pcImage : spImage;
      if (!image) {
        alert(`${type.toUpperCase()}画像がアップロードされていません`);
        return;
      }

      // 分析開始前に状態を更新
      setAnalyzingImage(true);
      setAnalysisProgress(0);

      // 少し遅延を入れて状態更新が確実に反映されるようにする
      await new Promise(resolve => setTimeout(resolve, 100));

      // 進捗状況を更新する関数
      const updateProgress = (progress) => {
        console.log(`画像分析進捗: ${progress}%`);
        setAnalysisProgress(progress);
      };

      // 初期進捗を表示
      updateProgress(10);

      // 画像から色を抽出
      const colors = await analyzeImageColors(image.file);
      updateProgress(40);

      // 画像からテキストを抽出（OCR）
      const text = await analyzeImageText(image.file, updateProgress);
      updateProgress(80);

      if (type === 'pc') {
        setPcColors(colors);
        setPcText(text);
      } else {
        setSpColors(colors);
        setSpText(text);
      }

      updateProgress(100);

      // 少し待ってから分析完了状態にする
      setTimeout(() => {
        setAnalyzingImage(false);
        setAnalysisProgress(0);
      }, 1000);

    } catch (error) {
      console.error('Image analysis error:', error);
      setAnalyzingImage(false);
      setAnalysisProgress(0);
      alert('画像分析中にエラーが発生しました');
    }
  };

  // 画像アップロード部分のレンダリング
  const renderImageUploader = () => {
    return (
      <div className="image-uploaders">
        <div className="uploader-container pc-uploader">
          <h3>PC画像 <span className="help-text">（デスクトップレイアウト）</span></h3>
          <div className="image-upload-area" onClick={() => document.getElementById('pc-image-upload').click()}>
            <input
              type="file"
              id="pc-image-upload"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, 'pc')}
              style={{ display: 'none' }}
            />
            {pcImage ? (
              <div className="preview-container">
                <img src={pcImage.preview} alt="PC layout preview" className="image-preview" />
                <button
                  className="remove-image-btn"
                  onClick={handleRemovePcImage}
                  title="画像を削除"
                >
                  ✕
                </button>
                <button
                  className="analyze-image-btn"
                  onClick={() => handleAnalyzeImage('pc')}
                  disabled={analyzingImage}
                  title="詳細分析"
                >
                  {analyzingImage ? '分析中...' : '詳細分析'}
                </button>
                {analyzingImage && (
                  <div className="analysis-progress-container">
                    <div className="analysis-progress-bar">
                      <div
                        className="analysis-progress-fill"
                        style={{ width: `${analysisProgress}%` }}
                      ></div>
                    </div>
                    <div className="analysis-progress-text">画像分析中...{analysisProgress}%</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">📷</span>
                <span className="upload-text">クリックして画像をアップロード</span>
                <span className="upload-subtext">または、ここにドラッグ&ドロップ</span>
              </div>
            )}
          </div>
          {pcColors.length > 0 && (
            <div className="color-palette">
              {pcColors.map((color, index) => (
                <div key={index} className="color-chip" style={{ backgroundColor: color }} title={color}></div>
              ))}
            </div>
          )}
        </div>

        <div className="uploader-container sp-uploader">
          <h3>SP画像 <span className="help-text">（モバイルレイアウト）</span></h3>
          <div className="image-upload-area" onClick={() => document.getElementById('sp-image-upload').click()}>
            {spImage ? (
              <div className="preview-container">
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
                <button
                  className="analyze-image-btn"
                  onClick={() => handleAnalyzeImage('sp')}
                  disabled={analyzingImage}
                  title="詳細分析"
                >
                  {analyzingImage ? '分析中...' : '詳細分析'}
                </button>
                {analyzingImage && (
                  <div className="analysis-progress-container">
                    <div className="analysis-progress-bar">
                      <div
                        className="analysis-progress-fill"
                        style={{ width: `${analysisProgress}%` }}
                      ></div>
                    </div>
                    <div className="analysis-progress-text">画像分析中...{analysisProgress}%</div>
                  </div>
                )}
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
              id="sp-image-upload"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, 'sp')}
              style={{ display: 'none' }}
            />
          </div>
          {spColors.length > 0 && (
            <div className="color-palette">
              {spColors.map((color, index) => (
                <div key={index} className="color-chip" style={{ backgroundColor: color }} title={color}></div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 画像分析結果の表示
  const renderAnalysisResult = () => {
    if (!imageAnalysisResult) return null;

    return (
      <div className="analysis-result">
        <h3>画像分析結果 ({imageAnalysisResult.type === 'pc' ? 'デスクトップ' : 'モバイル'})</h3>
        <div className="result-content">
          {imageAnalysisResult.text && (
            <div className="result-section">
              <h4>抽出テキスト</h4>
              <div className="result-text">{imageAnalysisResult.text}</div>
            </div>
          )}

          {imageAnalysisResult.dominant_color && (
            <div className="result-section">
              <h4>主要な色</h4>
              <div className="color-info">
                <div
                  className="color-preview"
                  style={{ backgroundColor: imageAnalysisResult.dominant_color.hex }}
                ></div>
                <div className="color-value">
                  <div>{imageAnalysisResult.dominant_color.hex}</div>
                  <div>RGB: {imageAnalysisResult.dominant_color.rgb.join(', ')}</div>
                </div>
              </div>
            </div>
          )}

          {imageAnalysisResult.sections && imageAnalysisResult.sections.length > 0 && (
            <div className="result-section">
              <h4>セクション分析</h4>
              <div className="sections-list">
                {imageAnalysisResult.sections.map((section, index) => (
                  <div key={index} className="section-item">
                    <div className="section-name">{section.name}</div>
                    <div className="section-color-preview" style={{ backgroundColor: section.color }}></div>
                    <div className="section-position">
                      x: {section.position.x}, y: {section.position.y},
                      w: {section.position.width}, h: {section.position.height}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="result-meta">
            <div>分析時間: {imageAnalysisResult.analysis_time}秒</div>
            <div>分析日時: {new Date(imageAnalysisResult.timestamp).toLocaleString()}</div>
          </div>

          <button
            className="close-analysis-btn"
            onClick={() => setImageAnalysisResult(null)}
          >
            閉じる
          </button>
        </div>
      </div>
    );
  };

  // ブロック名の変更ハンドラー
  const handleBlockNameChange = (e) => {
    const value = e.target.value;
    setBlockName(value);

    // ブロック名のバリデーション
    if (!value.trim()) {
      setBlockNameValidationError("ブロック名を入力してください");
    } else if (!/^[a-z0-9-]+$/.test(value)) {
      setBlockNameValidationError("ブロック名は小文字、数字、ハイフンのみ使用できます");
    } else {
      setBlockNameValidationError("");
    }
  };

  // HTMLファイル選択の変更ハンドラー
  const handleHtmlFileSelect = (e) => {
    setSelectedHtmlFile(e.target.value);
  };

  const [copyHtmlText, setCopyHtmlText] = useState("コピー");
  const [copyCssText, setCopyCssText] = useState("コピー");
  const [htmlCopied, setHtmlCopied] = useState(false);
  const [cssCopied, setCssCopied] = useState(false);

  const handleHtmlCopy = () => {
    navigator.clipboard.writeText(editingHTML);
    setCopyHtmlText("コピーしました！");
    setHtmlCopied(true);
    setTimeout(() => {
      setCopyHtmlText("コピー");
      setHtmlCopied(false);
    }, 3000);
  };

  const handleCssCopy = () => {
    navigator.clipboard.writeText(editingCSS);
    setCopyCssText("コピーしました！");
    setCssCopied(true);
    setTimeout(() => {
      setCopyCssText("コピー");
      setCssCopied(false);
    }, 3000);
  };

  // ブロックが除外されているかチェック
  const isBlockExcluded = (blockName) => {
    return excludedBlocks.includes(blockName);
  };

  // ブロックを保存対象から除外する処理
  const handleExcludeBlock = (blockName) => {
    setExcludedBlocks([...excludedBlocks, blockName]);
  };

  // ブロックを保存対象に戻す処理
  const handleIncludeBlock = (blockName) => {
    setExcludedBlocks(excludedBlocks.filter(name => name !== blockName));
  };

  // SCSSブロックの選択処理
  const handleScssBlockSelect = (blockName) => {
    // 選択されたメインブロックに関連するすべてのブロック（エレメントと擬似クラスを含む）を取得
    const mainBlockCode = detectedScssBlocks.find(block => block.name === blockName);

    if (!mainBlockCode) {
      console.error(`ブロック ${blockName} が見つかりません`);
      return;
    }

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

  // iframeからのメッセージを受け取る
  useEffect(() => {
    const handleIframeMessage = (event) => {
      // プレビューからのメッセージを処理
      if (event.data && event.data.type === "preview-rendered") {
        console.log("プレビューレンダリング情報:", event.data);

        // メディアクエリの状態を確認
        const mediaQueryStatus = event.data.mediaQueries;
        console.log("メディアクエリ状態:", mediaQueryStatus);

        // プレビューの幅と実際のメディアクエリの状態が一致しているか確認
        if (event.data.width <= 767 && mediaQueryStatus.minWidth768) {
          console.warn("警告: SPモードですが、min-width: 768pxのメディアクエリが有効になっています");
        }

        // 必要に応じてプレビューのレイアウトを調整
        if (previewRef.current) {
          setTimeout(() => {
            adjustIframeHeight();
          }, 100);
        }
      }
    };

    // メッセージイベントリスナーを追加
    window.addEventListener("message", handleIframeMessage);

    return () => {
      // クリーンアップ時にイベントリスナーを削除
      window.removeEventListener("message", handleIframeMessage);
    };
  }, [previewWidth]);

  // プレビューサイズが変わったときの処理を改善
  useEffect(() => {
    // プレビューサイズが変わったら確実にiframeを更新
    const timer = setTimeout(() => {
      if (previewRef.current && editingCSS) {
        try {
          // 現在のCSSを取得して処理
          const processedCSS = processRemValues(editingCSS);
          // iframeのdocumentを取得して再構築
          updatePreviewWithProcessedCSS(processedCSS);

          // スケールを再計算してからコンテナ高さを調整
          calculateScale();
          setTimeout(() => {
            adjustIframeHeight();
            adjustPreviewContainerHeight();
          }, 200);

          console.log(`プレビューサイズ変更により再レンダリング: ${previewWidth}px`);
        } catch (error) {
          console.error("プレビューサイズ変更時の更新エラー:", error);
        }
      }
    }, 10);

    return () => clearTimeout(timer);
  }, [previewWidth]); // previewWidthが変わったときだけ実行

  // CSSとHTML変更時のプレビュー更新
  useEffect(() => {
    if (previewRef.current && editingCSS) {
      const timer = setTimeout(async () => {
        try {
          // SCSSをブラウザでコンパイルしてプレビュー更新
          await forceUpdatePreview(previewWidth);
          console.log("CSSをプレビュー用に処理しました");
        } catch (error) {
          console.error("プレビュー更新中にエラーが発生しました:", error);
        }
      }, 300); // 300ms遅延させる (タイピング中の連続更新防止)

      return () => clearTimeout(timer);
    }
  }, [editingHTML, editingCSS, previewWidth, breakpoints, responsiveMode]);

  // ハートビート機能で定期的にサーバーと疎通チェック
  useEffect(() => {
    let heartbeatInterval;

    if (isPreventingReload) {
      console.log("リロード防止ハートビートを開始します");
      heartbeatInterval = setInterval(() => {
        // 空のPostMessageを送信して、イベントリスナーでリセット
        resetPreventReload();
      }, 10000); // 10秒おきに更新
    }

    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [isPreventingReload]);

  // PNGなどをJPEG形式に変換する関数
  const convertToJpeg = (base64Image) => {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
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
            const quality = 0.9; // 画質（0.0〜1.0）
            const jpegBase64 = canvas.toDataURL('image/jpeg', quality);
            console.log(`画像をJPEG形式に変換しました: ${img.width}x${img.height}px`);

            // メモリリーク防止
            URL.revokeObjectURL(img.src);
            canvas.width = 0;
            canvas.height = 0;

            resolve(jpegBase64);
          } catch (err) {
            console.error('Canvas処理エラー:', err);
            reject(err);
          }
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

  // コンポーネントがアンマウントされる前に実行するクリーンアップ処理
  useEffect(() => {
    return () => {
      console.log("AICodeGeneratorコンポーネントのクリーンアップを実行します");

      // 画像リソースを解放
      if (pcImage && pcImage.preview) {
        if (pcImage.preview.startsWith('blob:')) {
          URL.revokeObjectURL(pcImage.preview);
        }
      }

      if (spImage && spImage.preview) {
        if (spImage.preview.startsWith('blob:')) {
          URL.revokeObjectURL(spImage.preview);
        }
      }

      // iframeのリソースを解放
      if (previewRef.current) {
        try {
          const iframe = previewRef.current;
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          iframeDoc.open();
          iframeDoc.write(''); // 空のドキュメントに置き換え
          iframeDoc.close();
        } catch (e) {
          console.error("iframeクリーンアップエラー:", e);
        }
      }

      // 明示的にGCを実行（Node.js環境の場合）
      if (window.api && window.api.gc) {
        try {
          window.api.gc();
          console.log("Electronのガベージコレクションを実行しました");
        } catch (e) {
          console.error("ガベージコレクション実行エラー:", e);
        }
      }
    };
  }, []);

  // キャッシュをクリアする関数
  const clearBrowserCache = () => {
    // handleResetAllに統合したため実装を削除
    console.log("この機能はhandleResetAllに統合されました");
    // 代わりにhandleResetAllを呼び出すこともできます
    // handleResetAll();
    return true;
  };

  // SCSSの@include mqを@mediaクエリに変換する関数
  const processMediaQueries = (css, breakpoints, mode) => {
    if (!css) return '';

    // ブレークポイントのマップを作成
    const bpMap = Array.isArray(breakpoints)
      ? breakpoints.reduce((map, bp) => {
        if (bp.active) map[bp.name] = bp.value;
        return map;
      }, {})
      : { 'sm': 576, 'md': 768, 'lg': 992, 'xl': 1200 }; // デフォルト値

    // @include mqパターンを検出して置換
    const pattern = /@include\s+mq\(([a-z]+)\)\s*{([^}]+)}/g;
    let result = css;
    let match;

    while ((match = pattern.exec(css)) !== null) {
      const [fullMatch, bpName, body] = match;
      if (!bpMap[bpName]) continue;

      // レスポンシブモードに応じたメディアクエリを生成
      const mediaQuery = mode === 'sp'
        ? `@media (min-width: ${bpMap[bpName]}px)`
        : `@media (max-width: ${bpMap[bpName]}px)`;

      // コンテンツを整形
      const content = body
        .trim()
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n  ');

      // 元のコードを置換
      result = result.replace(fullMatch, `${mediaQuery} {\n  ${content}\n}`);
    }

    return result;
  };

  // iframe内のHTMLとCSSを直接更新する関数（シンプルな注入）
  const updateIframeWithCSS = (htmlCode, cssCode, iframeRef, viewportWidth = 375, setProcessedCSSFunc = null) => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) {
        console.error('iframeが見つかりません');
        return false;
      }

      // 保存用のデータも更新
      if (setProcessedCSSFunc && typeof setProcessedCSSFunc === 'function') {
        setProcessedCSSFunc(cssCode);
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=${viewportWidth}">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
              width: 100%;
              height: 100%;
            }
            ${cssCode}
          </style>
        </head>
        <body>
          ${htmlCode}
        </body>
        </html>
      `);
      iframeDoc.close();

      console.log('✅ プレビュー更新完了');
      return true;
    } catch (error) {
      console.error('❌ プレビュー更新失敗:', error);
      return false;
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
          onClick={() => document.getElementById('pc-image-upload').click()}
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
            id="pc-image-upload"
            accept="image/*"
            onChange={(e) => handleImageUpload(e, 'pc')}
            style={{ display: 'none' }}
          />
        </div>

        <div
          className={`upload-area ${spImage ? 'has-image' : ''}`}
          onClick={() => document.getElementById('sp-image-upload').click()}
        >
          {spImage ? (
            <div className="image-preview-container">
              <img src={spImage.preview} alt="SP Preview" className="preview-image" />
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
            id="sp-image-upload"
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
                                handleIncludeBlock(block.name);
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



          <div className="code-editor-container">
            <div className="html-editor">
              <h3>HTML</h3>
              <div className="editor-actions">
                <button
                  className={`copy-code-button ${htmlCopied ? 'copied' : ''}`}
                  onClick={handleHtmlCopy}
                  title="HTMLをコピー"
                >
                  <span className="copy-icon">{htmlCopied ? '✓' : '📋'}</span>
                  {copyHtmlText}
                </button>
              </div>
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
              <div className="editor-actions">
                <button
                  className={`copy-code-button ${cssCopied ? 'copied' : ''}`}
                  onClick={handleCssCopy}
                  title="CSSをコピー"
                >
                  <span className="copy-icon">{cssCopied ? '✓' : '📋'}</span>
                  {copyCssText}
                </button>
              </div>
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
                    onClick={() => handlePreviewSizeChange('sp')}
                    className={previewWidth === 375 && !showCustomSizeInput ? "active" : ""}
                  >
                    SP (375px)
                  </button>
                  <button
                    onClick={() => handlePreviewSizeChange('tablet')}
                    className={previewWidth === 768 && !showCustomSizeInput ? "active" : ""}
                  >
                    Tablet (768px)
                  </button>
                  <button
                    onClick={() => handlePreviewSizeChange('pc')}
                    className={previewWidth === 1440 && !showCustomSizeInput ? "active" : ""}
                  >
                    PC (1440px)
                  </button>
                  <button
                    onClick={() => handlePreviewSizeChange('wide')}
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
                margin: '0 auto'
              }}
            >
              <iframe
                ref={previewRef}
                title="Preview"
                className="preview-iframe"
                style={{
                  width: `${previewWidth}px`,
                  height: `${iframeHeight}px`,
                  border: 'none',
                  transformOrigin: 'top left'
                }}
                scrolling="auto"
              ></iframe>
            </div>
          </div>

          {showGeneratedCode && (
            <div className="regenerate-form">
              <h3>コードの再生成</h3>
              <p className="regenerate-info">
                生成されたコードに対して修正指示ができます。
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
