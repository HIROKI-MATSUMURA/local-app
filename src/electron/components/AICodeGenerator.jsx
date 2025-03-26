import React, { useState, useEffect, useRef } from "react";
import "../styles/AICodeGenerator.scss";
import CodeDisplay from "./CodeDisplay";
import CodeGenerationSettings from "./CodeGenerationSettings";
import { generatePrompt } from "../utils/promptGenerator";
import { extractTextFromImage, extractColorsFromImage } from "../utils/imageAnalyzer.js";

const LOCAL_STORAGE_KEY = "ai_code_generator_state";

const AICodeGenerator = () => {
  const [generatedCode, setGeneratedCode] = useState("");
  const [generatedHTML, setGeneratedHTML] = useState("");
  const [generatedCSS, setGeneratedCSS] = useState("");
  const [loading, setLoading] = useState(false);
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);

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

  // 初期化処理（ローカルストレージから設定を読み込む）
  useEffect(() => {
    const storedResponsiveMode = localStorage.getItem("responsiveMode") || "sp";
    const storedBreakpoints = JSON.parse(localStorage.getItem("breakpoints")) || [];
    setResponsiveMode(storedResponsiveMode);
    setBreakpoints(storedBreakpoints);
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

  // プレビュー更新
  useEffect(() => {
    if (previewRef.current && editingHTML && editingCSS) {
      try {
        // SCSSの@includeをCSSメディアクエリに変換する処理
        let processedCSS = editingCSS;

        // mixinを処理する（@include mq(md) { ... } を対応するメディアクエリに変換）
        if (breakpoints && breakpoints.length > 0) {
          // ブレークポイントを取得してmapを作成
          const bpMap = {};
          breakpoints.forEach(bp => {
            if (bp.active) {
              bpMap[bp.name] = bp.value;
            }
          });

          console.log("レスポンシブプレビューに使用するブレークポイント:", bpMap);

          // @include mq(BREAKPOINT_NAME) { ... } パターンを検出して置換
          // マッチパターン: @include mq(md) { ... } （括弧内の任意の内容を含む）
          const mqPattern = /@include\s+mq\(([a-z]+)\)\s*{([^}]*)}/g;

          processedCSS = processedCSS.replace(mqPattern, (match, bpName, content) => {
            // ブレークポイント名が見つかった場合、対応するメディアクエリに変換
            if (bpMap[bpName]) {
              return `@media (min-width: ${bpMap[bpName]}px) {${content}}`;
            }
            // 見つからなかった場合はそのまま
            console.warn(`ブレークポイント "${bpName}" が設定に見つかりません`);
            return match;
          });

          console.log("メディアクエリ変換後のCSS:", processedCSS.substring(0, 100) + "...");
        }

        const doc = previewRef.current.contentDocument;
        doc.open();
        doc.write(`
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>${processedCSS}</style>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                }
              </style>
            </head>
            <body>${editingHTML}</body>
          </html>
        `);
        doc.close();
      } catch (error) {
        console.error("プレビュー更新エラー:", error);
      }
    }
  }, [editingHTML, editingCSS, breakpoints, previewWidth]);

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

    const fileUrl = URL.createObjectURL(file);
    const reader = new FileReader();

    reader.onload = async () => {
      const base64 = reader.result;
      console.log(`アップロードされた画像: ${file.name}, サイズ: ${Math.round(file.size / 1024)}KB, タイプ: ${file.type}`);

      try {
        // 画像を処理
        const processedImage = await processImage(base64);
        console.log(`画像処理が完了しました: メディアタイプ=${processedImage.mediaType}`);

        if (type === "pc") {
          setPcImage({
            fileName: file.name,
            preview: fileUrl,
            mimeType: processedImage.mediaType
          });
          setPcImageBase64(processedImage.base64);
          // 色抽出処理
          try {
            setPcColors(await extractColorsFromImage(processedImage.base64));
            console.log("PC画像の色を抽出しました");
          } catch (error) {
            console.error("PC画像の色抽出エラー:", error);
          }
        } else {
          setSpImage({
            fileName: file.name,
            preview: fileUrl,
            mimeType: processedImage.mediaType
          });
          setSpImageBase64(processedImage.base64);
          // 色抽出処理
          try {
            setSpColors(await extractColorsFromImage(processedImage.base64));
            console.log("SP画像の色を抽出しました");
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

    reader.readAsDataURL(file);
  };

  // 編集したコードを反映
  const handleUpdateCode = () => {
    setGeneratedHTML(editingHTML);
    setGeneratedCSS(editingCSS);
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
以下のHTMLとCSSの構造を維持したまま、指示に基づいた修正のみを行ってください。
元のレイアウト、要素の配置、クラス名は可能な限り維持してください。

修正内容: ${regenerateInstructions}

HTML（この構造と要素を基本的に維持してください）:
\`\`\`html
${editingHTML}
\`\`\`

SCSS（このスタイル構造を基本的に維持してください）:
\`\`\`scss
${editingCSS}
\`\`\`

## ガイドライン:
1. 元のHTML要素とクラス名を維持する
2. 元のCSSセレクタと基本構造を維持する
3. 特に指示がない限り、新しい要素やクラスを追加しない
4. 指示されたポイントのみを変更し、それ以外はそのまま保持する

返答は必ずHTML部分とSCSS部分の両方を含めてください。
\`\`\`html\`と\`\`\`scss\`のフォーマットで出力してください。
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
      if (htmlMatch) setEditingHTML(htmlMatch[0]);
      if (cssMatch) setEditingCSS(cssMatch[0].includes("<style>") ? cssMatch[0].replace(/<\/?style>/g, "") : cssMatch[0]);

      // 表示用の状態も同時に更新
      if (htmlMatch) setGeneratedHTML(htmlMatch[0]);
      if (cssMatch) setGeneratedCSS(cssMatch[0].includes("<style>") ? cssMatch[0].replace(/<\/?style>/g, "") : cssMatch[0]);

      // 指示をクリア
      setRegenerateInstructions("");

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
HTMLとSCSSコードを生成してください。
画像に表示されている要素のみを正確にコード化してください。見えない要素や推測による補完は行わないでください。正確に画像の内容を反映したHTMLとCSSのみをデザインに忠実に生成してください。

以下の要素を含む、ダイビング情報サイトのセクションを作成してください：

- 「Information」というタイトル
- 「ダイビング情報」という日本語のサブタイトル
- サンゴ礁と黄色い熱帯魚の画像
- 「ライセンス講習」というセクション見出し
- PADIダイビングライセンス（Cカード）についての説明文
- 「View more」ボタン
- 水色の背景

\`\`\`html\` と \`\`\`scss\` でそれぞれのコードを提供してください。
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

        // 生成されたコードをステートに設定
        setGeneratedCode(generatedCode);
        setGeneratedHTML(html);
        setGeneratedCSS(css);
        setShowGeneratedCode(true);
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

  return (
    <div className="ai-code-generator">
      <h2>AIコードジェネレーター</h2>

      {/* 設定表示 */}
      <CodeGenerationSettings
        responsiveMode={responsiveMode}
        setResponsiveMode={setResponsiveMode}
        breakpoints={breakpoints}
        setBreakpoints={setBreakpoints}
        aiBreakpoints={aiBreakpoints}
        setAiBreakpoints={setAiBreakpoints}
      />

      {/* 画像アップロード */}
      <div className="form-group">
        <label>画像をアップロード:</label>
        <div className="image-container">
          {/* PC用 */}
          <div className="image-preview">
            <h4>PC用画像</h4>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, "pc")}
            />
            {pcImage && (
              <>
                <img src={pcImage.preview} alt="PC用画像" />
                <p>{pcImage.fileName}</p>
                <button
                  onClick={() => setPcImage(null)}
                  className="delete-button"
                >
                  削除
                </button>
              </>
            )}
          </div>
          {/* SP用 */}
          <div className="image-preview">
            <h4>SP用画像</h4>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, "sp")}
            />
            {spImage && (
              <>
                <img src={spImage.preview} alt="SP用画像" />
                <p>{spImage.fileName}</p>
                <button
                  onClick={() => setSpImage(null)}
                  className="delete-button"
                >
                  削除
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ボタン */}
      <button
        onClick={handleGenerateCode}
        disabled={loading || (!pcImageBase64 && !spImageBase64)}
        style={{ marginBottom: '20px' }}
      >
        {loading ? "生成中..." : "コードを生成"}
      </button>

      {/* 生成されたコードの表示 */}
      {showGeneratedCode && (
        <div className="generated-code-container">
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
                <textarea
                  value={editingHTML}
                  onChange={(e) => setEditingHTML(e.target.value)}
                  rows={10}
                />
              </div>

              <div className="css-editor">
                <h3>CSS</h3>
                <textarea
                  value={editingCSS}
                  onChange={(e) => setEditingCSS(e.target.value)}
                  rows={10}
                />
              </div>

              <button onClick={handleUpdateCode} className="update-button">
                変更を適用
              </button>
            </div>
          ) : (
            <CodeDisplay htmlCode={generatedHTML} cssCode={generatedCSS} />
          )}

          {/* プレビュー表示 */}
          <div className="preview-container" ref={previewContainerRef}>
            <div className="preview-header">
              <h3>プレビュー</h3>
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
                    <button onClick={applyCustomSize} className="apply-button">適用</button>
                  </div>
                ) : (
                  <div className="preview-size-display">
                    {previewWidth}px
                  </div>
                )}
              </div>
            </div>
            <div
              className="preview-frame-container"
            >
              <div
                className="preview-frame"
                style={{
                  width: `${previewWidth}px`,
                  maxWidth: '100%',
                  height: '400px'
                }}
              >
                <iframe
                  ref={previewRef}
                  title="コードプレビュー"
                  className="code-preview"
                  sandbox="allow-same-origin allow-scripts"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <div
                className="preview-resizer"
                onMouseDown={handleDragStart}
              >
                <div className="resizer-handle"></div>
              </div>
            </div>
          </div>

          {/* 再生成フォーム */}
          <div className="regenerate-form">
            <h3>コードの再生成</h3>
            <textarea
              value={regenerateInstructions}
              onChange={(e) => setRegenerateInstructions(e.target.value)}
              placeholder="例: ヘッダーの背景色を青に変更してください。ボタンを角丸にしてください。など"
              rows={3}
            />
            <button
              onClick={handleRegenerate}
              disabled={loading || !regenerateInstructions.trim()}
              className="regenerate-button"
            >
              {loading ? "処理中..." : "指示に基づき再生成"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AICodeGenerator;
