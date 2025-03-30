import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import '../styles/VariableConfig.scss';
import Header from './Header';

const VariableConfig = () => {
  // 初期状態をローカルストレージから取得
  const [variables, setVariables] = useState(() => {
    const savedVariables = localStorage.getItem('variables');
    return savedVariables ? JSON.parse(savedVariables) : {
      lInner: '1000',
      paddingPc: '25',
      paddingSp: '20',
      primaryColor: '#231815',
      secondaryColor: '#0076ad',
      accentColor: '#ff5722',
      customColors: [
        { name: '$primary-color', color: '#231815' },
        { name: '$secondary-color', color: '#0076ad' },
        { name: '$accent-color', color: '#ff5722' },
      ]
    };
  });

  // 画像関連の状態
  const [designImage, setDesignImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedColors, setExtractedColors] = useState([]);
  const [hoverColor, setHoverColor] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [showColorPopup, setShowColorPopup] = useState(false);
  const [selectedColorPosition, setSelectedColorPosition] = useState(null);
  const [newColorName, setNewColorName] = useState('');
  const [selectedExistingVariable, setSelectedExistingVariable] = useState('');
  const [isNewVariable, setIsNewVariable] = useState(false);

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const magnifierRef = useRef(null);
  const imageContainerRef = useRef(null);

  // 変数変更時にローカルストレージに保存
  useEffect(() => {
    localStorage.setItem('variables', JSON.stringify(variables));
  }, [variables]);

  // 画像がロードされたときにキャンバスを初期化
  useEffect(() => {
    if (designImage && imageRef.current && canvasRef.current) {
      const img = imageRef.current;
      const canvas = canvasRef.current;

      // 画像の読み込みが完了したときにキャンバスを初期化
      const initCanvas = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      };

      // 画像がすでに読み込まれている場合
      if (img.complete) {
        initCanvas();
      } else {
        // 画像の読み込みが完了するのを待つ
        img.onload = initCanvas;
      }
    }
  }, [designImage]);

  const handleColorChange = (index, value) => {
    const updatedColors = [...variables.customColors];
    updatedColors[index].color = value;
    setVariables({ ...variables, customColors: updatedColors });
  };

  const addColor = () => {
    setVariables({ ...variables, customColors: [...variables.customColors, { name: '', color: '#000000' }] });
  };

  const removeColor = (index) => {
    const updatedColors = variables.customColors.filter((_, i) => i !== index);
    setVariables({ ...variables, customColors: updatedColors });
  };

  // 画像の選択とアップロード
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsProcessing(true);
        const image = event.target.result;

        // 画像をリサイズして処理を軽くする
        const resizedImage = await resizeImage(image, 1200);
        setDesignImage(resizedImage);

        // 色を抽出
        await extractColorsFromImage(resizedImage);
      } catch (error) {
        console.error('画像処理エラー:', error);
        alert('画像の処理中にエラーが発生しました。');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsDataURL(file);
  };

  // 画像のリサイズと最適化
  const resizeImage = (base64Image, maxWidth) => {
    return new Promise((resolve, reject) => {
      try {
        // 画像のメディアタイプを保持
        const mediaTypeMatch = base64Image.match(/^data:([^;]+);base64,/);
        const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';

        // 画像データのサイズをチェック（Base64文字列のサイズから概算）
        const base64Data = base64Image.split(',')[1];
        const approximateBytes = (base64Data.length * 3) / 4;
        const sizeInMB = approximateBytes / (1024 * 1024);

        // 4MB未満の画像は圧縮なしで処理
        if (sizeInMB < 4) {
          console.log(`画像サイズは${sizeInMB.toFixed(2)}MBです。圧縮せずに処理します。`);
          resolve(base64Image);
          return;
        }

        console.log(`画像サイズは${sizeInMB.toFixed(2)}MBです。リサイズして最適化します。`);

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

          // 高品質な描画設定
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // 透過背景を維持
          if (mediaType === 'image/png' || mediaType === 'image/webp') {
            ctx.clearRect(0, 0, newWidth, newHeight);
          }

          // 画像を描画
          ctx.drawImage(img, 0, 0, newWidth, newHeight);

          // 画質の調整と最適化のループ
          let quality = 0.92;
          let attempts = 0;
          let resultBase64;

          // 最大3回まで画質を調整
          do {
            resultBase64 = canvas.toDataURL(mediaType, quality);
            const resultData = resultBase64.split(',')[1];
            const resultBytes = (resultData.length * 3) / 4;
            const resultSizeMB = resultBytes / (1024 * 1024);

            console.log(`リサイズ試行 #${attempts + 1}: ${newWidth}x${newHeight}px, 品質: ${quality}, サイズ: ${resultSizeMB.toFixed(2)}MB`);

            // 4MB以下になったら終了
            if (resultSizeMB <= 4 || attempts >= 2) {
              break;
            }

            // 品質を下げて再試行
            quality -= 0.1;
            attempts++;
          } while (true);

          console.log(`画像を最適化しました: ${newWidth}x${newHeight}px, 形式: ${mediaType}`);
          resolve(resultBase64);
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

  // 画像から色を抽出する処理
  const extractColorsFromImage = async (base64Image) => {
    try {
      // APIキーの取得
      const apiData = await window.api.getApiKey();

      if (!apiData) {
        throw new Error("APIキーが設定されていません。設定画面からAPIキーを設定してください。");
      }

      // 選択されたプロバイダに基づいてAPIキーを選択
      let apiKey;
      if (apiData.selectedProvider === 'claude') {
        apiKey = apiData.claudeKey;
      } else {
        // デフォルトはClaudeを使用するため、claudeKeyを優先
        apiKey = apiData.claudeKey || apiData.apiKey;
      }

      if (!apiKey) {
        throw new Error("Claude APIキーが設定されていません。API設定画面からAPIキーを設定してください。");
      }

      const prompt = `
この画像を解析し、SCSSの変数として使用できる主要な色を抽出してください。

抽出する色について:
1. 16進数形式（#RRGGBB）で表示
2. 変数名は意味のある名前（例: $primary-color, $secondary-color, $accent-color など）
3. コメントにはどこで使用されているか簡潔に記述

例のフォーマット:
$primary-color: #3F51B5; // ヘッダー背景色
$secondary-color: #FFC107; // アクセントボタン色

レスポンスは上記の形式のみで返してください。説明は不要です。
`;

      return new Promise((resolve, reject) => {
        // ロード状態の更新
        setIsProcessing(true);

        // 古いリスナーを削除する必要はありません
        // window.api.receive メソッドは内部で古いリスナーを自動的に削除します

        // 新しいレスポンスリスナーを設定
        const responseHandler = (result) => {
          if (result.error) {
            console.error("API エラー:", result.error);
            reject(new Error(result.error));
            return;
          }

          try {
            console.log("API レスポンス受信:", result);

            // 抽出されたテキストをパースして色情報を取得
            const extractedText = result.content;
            const colorRegex = /\$([a-zA-Z0-9_-]+):\s*(#[a-fA-F0-9]{6});\s*(?:\/\/\s*(.+))?/g;
            let match;
            const colors = [];

            while ((match = colorRegex.exec(extractedText)) !== null) {
              colors.push({
                name: `$${match[1]}`,
                color: match[2],
                description: match[3] || ''
              });
            }

            // 重複を除去
            const uniqueColors = Array.from(new Set(colors.map(c => c.color)))
              .map(color => colors.find(c => c.color === color));

            console.log("抽出された色:", uniqueColors);
            setExtractedColors(uniqueColors);

            // アラートで通知
            alert(`${uniqueColors.length}色を抽出しました。`);
            resolve(uniqueColors);
          } catch (err) {
            console.error("色情報の解析エラー:", err);
            reject(err);
          } finally {
            // 処理完了後のクリーンアップは必要ありません
            // preload.jsのreceive関数の仕様上、次回呼び出し時に自動的に古いリスナーが削除されます
          }
        };

        // レスポンスを受け取るリスナーを設定
        window.api.receive('extract-colors-response', responseHandler);

        // データを送信
        window.api.send('extract-colors-from-image', {
          apiKey,
          prompt,
          imageData: base64Image
        });
      });

    } catch (error) {
      console.error('色抽出エラー:', error);
      alert('色の抽出に失敗しました: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 抽出した色を変数に適用
  const applyExtractedColors = () => {
    if (extractedColors.length === 0) return;

    // 既存の色変数を更新
    const newCustomColors = [...extractedColors.map(c => ({
      name: c.name,
      color: c.color
    }))];

    setVariables({
      ...variables,
      customColors: newCustomColors
    });

    alert('抽出した色を変数に適用しました。「変更を保存」で確定してください。');
  };

  // キャンバスをクリア
  const resetCanvas = () => {
    // キャンバスをクリア
    if (canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      const imgRect = img.getBoundingClientRect();

      // キャンバスのサイズを設定
      canvas.width = imgRect.width;
      canvas.height = imgRect.height;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      console.log('キャンバスをクリアしました');
    }
  };

  // マウス位置での色を抽出する
  const getColorAtPoint = (e) => {
    if (!imageRef.current) return null;

    const img = imageRef.current;
    const canvas = canvasRef.current;
    const container = imageContainerRef.current;

    if (!canvas || !container) return null;

    try {
      // コンテナとイメージの位置情報を取得
      const containerRect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();

      // マウス位置を取得（コンテナ内の相対位置）
      const mouseX = e.clientX - imgRect.left;
      const mouseY = e.clientY - imgRect.top;

      // 画像内での相対位置を計算（0〜1の値）
      const relativeX = mouseX / imgRect.width;
      const relativeY = mouseY / imgRect.height;

      // 相対位置を画像の実際のピクセル座標に変換
      const x = Math.round(relativeX * img.naturalWidth);
      const y = Math.round(relativeY * img.naturalHeight);

      // 画像の範囲外の場合はnullを返す
      if (x < 0 || x >= img.naturalWidth || y < 0 || y >= img.naturalHeight) {
        return null;
      }

      // 表示座標を保存
      setMousePosition({
        x: mouseX,
        y: mouseY,
        actualX: x,
        actualY: y
      });

      // キャンバスのサイズを画像の実際のサイズに合わせる
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // コンテキストの取得とパフォーマンス設定
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      // 画像をキャンバスに描画
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // ピクセルデータを取得
      const pixelData = ctx.getImageData(x, y, 1, 1).data;

      // RGB値をHEXに変換
      const hex = rgbToHex(pixelData[0], pixelData[1], pixelData[2]);

      // 色情報を返す
      return {
        color: hex,
        rgbValue: `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`,
        position: { x, y }
      };
    } catch (error) {
      console.error('色の取得に失敗しました:', error);
      return null;
    }
  };

  // マウス移動時の処理
  const handleMouseMove = (e) => {
    if (!designImage) return;

    setIsHovering(true);

    // 色選択ポップアップが表示されている場合は処理しない
    if (showColorPopup) return;

    // スロットリング（すべてのマウス移動でなく間引いて処理）
    const now = Date.now();
    if (now - (handleMouseMove.lastCall || 0) < 30) return; // 約30ms(33fps)に制限
    handleMouseMove.lastCall = now;

    try {
      const colorInfo = getColorAtPoint(e);
      if (colorInfo) {
        setHoverColor(colorInfo);

        // 拡大表示用のキャンバスを更新
        updateMagnifier(colorInfo.position.x, colorInfo.position.y);
      }
    } catch (error) {
      console.error('マウス移動処理エラー:', error);
    }
  };

  // 画像から離れた時の処理
  const handleMouseLeave = () => {
    setIsHovering(false);
    setHoverColor(null);

    // 色選択ポップアップが表示されている場合は閉じない
    if (!showColorPopup) {
      resetCanvas();
    }
  };

  // クリックで色を抽出して吹き出しを表示
  const handleImageClick = (e) => {
    if (!designImage) return;

    const colorInfo = getColorAtPoint(e);
    if (!colorInfo) return;

    // クリック位置を保存（ページ基準）
    const clickX = e.clientX;
    const clickY = e.clientY;

    // 抽出した色を保存
    setSelectedColorPosition({
      position: colorInfo.position,
      color: colorInfo.color,
      rgbValue: colorInfo.rgbValue,
      clientX: clickX,
      clientY: clickY
    });

    // 吹き出しを表示
    setShowColorPopup(true);

    // 新規変数名の初期値を設定
    setNewColorName(`$color-${extractedColors.length + 1}`);

    // 既存変数選択をリセット
    setSelectedExistingVariable('');

    // デフォルトで新規変数を選択
    setIsNewVariable(true);

    // キャンバスにマーカーを描画
    drawColorMarkerAtCurrentPosition(colorInfo.color);

    console.log(`色を抽出しました: ${colorInfo.color} (座標: ${colorInfo.position.x}, ${colorInfo.position.y})`);
  };

  // 色を追加する処理
  const addExtractedColor = () => {
    if (!selectedColorPosition) return;

    let colorName = '';
    let existingIndex = -1;

    if (isNewVariable) {
      // 新規変数の場合
      if (!newColorName) {
        alert('変数名を入力してください');
        return;
      }

      // 変数名のフォーマットを確認（$から始まることを確認）
      let formattedName = newColorName;
      if (!formattedName.startsWith('$')) {
        formattedName = '$' + formattedName;
      }

      colorName = formattedName;

      // 同じ名前の変数が存在しないか確認
      existingIndex = extractedColors.findIndex(c => c.name === colorName);

      if (existingIndex !== -1) {
        if (!confirm(`変数 ${colorName} は既に存在します。上書きしますか？`)) {
          return;
        }
      }
    } else {
      // 既存変数を上書きする場合
      if (!selectedExistingVariable) {
        alert('上書きする変数を選択してください');
        return;
      }
      colorName = selectedExistingVariable;

      // 既存の色のインデックスを取得
      existingIndex = extractedColors.findIndex(c => c.name === colorName);
    }

    // 新しい色のオブジェクト
    const newColor = {
      name: colorName,
      color: selectedColorPosition.color,
      description: `画像から抽出 (${selectedColorPosition.position.x}, ${selectedColorPosition.position.y})`
    };

    // 色のリストを更新
    let updatedColors;

    if (existingIndex !== -1) {
      // 既存の色を上書き
      updatedColors = [...extractedColors];
      updatedColors[existingIndex] = newColor;
    } else {
      // 新しい色を追加
      updatedColors = [...extractedColors, newColor];
    }

    setExtractedColors(updatedColors);

    // 吹き出しを閉じる
    setShowColorPopup(false);
    setSelectedColorPosition(null);

    // キャンバスをクリア
    resetCanvas();

    console.log(`色を追加/更新しました: ${colorName} (${newColor.color})`);
  };

  // カラーパレットから色を削除
  const removeExtractedColor = (colorName) => {
    const updatedColors = extractedColors.filter(c => c.name !== colorName);
    setExtractedColors(updatedColors);
  };

  // 現在のマウス位置にマーカーを描画
  const drawColorMarkerAtCurrentPosition = (color) => {
    if (!canvasRef.current || !imageRef.current || !mousePosition) return;

    const canvas = canvasRef.current;
    const img = imageRef.current;
    const imgRect = img.getBoundingClientRect();

    // キャンバスのサイズを設定
    canvas.width = imgRect.width;
    canvas.height = imgRect.height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // マーカーの位置を計算（イメージ内の相対位置）
    const markerX = mousePosition.x;
    const markerY = mousePosition.y;

    // マーカーを描画
    drawColorMarker(ctx, markerX, markerY, color);
  };

  // 拡大鏡の更新
  const updateMagnifier = (sourceX, sourceY) => {
    if (!magnifierRef.current || !imageRef.current) return;

    const magnifier = magnifierRef.current;
    const img = imageRef.current;

    // 拡大率
    const zoom = 8;

    // 拡大鏡のサイズ
    const size = 150;
    const halfSize = size / 2;

    // 拡大鏡用のキャンバスコンテキスト
    const ctx = magnifier.getContext('2d');

    // 拡大鏡のサイズを設定
    magnifier.width = size;
    magnifier.height = size;

    try {
      // 拡大範囲のサイズを計算
      const sourceSize = size / zoom;
      const halfSourceSize = sourceSize / 2;

      // 拡大する範囲の左上座標を計算
      let sourceLeft = Math.max(0, sourceX - halfSourceSize);
      let sourceTop = Math.max(0, sourceY - halfSourceSize);

      // 範囲が画像の右端や下端を超えないように調整
      if (sourceLeft + sourceSize > img.naturalWidth) {
        sourceLeft = img.naturalWidth - sourceSize;
      }
      if (sourceTop + sourceSize > img.naturalHeight) {
        sourceTop = img.naturalHeight - sourceSize;
      }

      // 最終調整（マイナス値にならないように）
      sourceLeft = Math.max(0, sourceLeft);
      sourceTop = Math.max(0, sourceTop);

      // 画像から拡大範囲を切り出して拡大描画
      ctx.clearRect(0, 0, size, size);

      // キャンバスに画像を描画して拡大表示
      ctx.drawImage(
        img,
        sourceLeft, sourceTop,
        sourceSize, sourceSize,
        0, 0,
        size, size
      );

      // 中心に十字線を描画
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;

      // 横線
      ctx.beginPath();
      ctx.moveTo(0, halfSize);
      ctx.lineTo(size, halfSize);
      ctx.stroke();

      // 縦線
      ctx.beginPath();
      ctx.moveTo(halfSize, 0);
      ctx.lineTo(halfSize, size);
      ctx.stroke();

      // 中心点を強調
      ctx.beginPath();
      ctx.arc(halfSize, halfSize, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 枠線を描画
      ctx.strokeStyle = hoverColor ? hoverColor.color : 'black';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, size, size);

      // ピクセルグリッドを描画
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 0.5;

      // 縦線
      for (let x = 0; x <= size; x += size / 10) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }

      // 横線
      for (let y = 0; y <= size; y += size / 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
    } catch (error) {
      console.error('拡大表示の更新に失敗しました:', error);
    }
  };

  // 色を抽出した場所にマーカーを描画
  const drawColorMarker = (ctx, x, y, color) => {
    // 外側の円（白または黒の縁取り）
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);

    // コントラストのために境界線の色を決定
    const brightness = getBrightness(color);
    ctx.strokeStyle = brightness > 128 ? '#000000' : '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 内側の円（抽出した色）
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // 色の明るさを計算（0-255）
  const getBrightness = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  // RGB値をHEX形式に変換
  const rgbToHex = (r, g, b) => {
    return '#' + [r, g, b]
      .map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('');
  };

  // ポップアップが画面外に出ないよう位置を調整
  const adjustPopupPosition = (x, y) => {
    const popupWidth = 280;
    const popupHeight = 350;
    const padding = 10;

    // ウィンドウサイズを取得
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // 右端のチェック
    let adjustedX = x;
    if (x + popupWidth + padding > windowWidth) {
      adjustedX = windowWidth - popupWidth - padding;
    }

    // 下端のチェック
    let adjustedY = y + 10; // 少し下にずらす
    if (adjustedY + popupHeight + padding > windowHeight) {
      adjustedY = y - popupHeight - 10; // ポップアップを上に表示
    }

    // マイナスにならないように調整
    adjustedX = Math.max(padding, adjustedX);
    adjustedY = Math.max(padding, adjustedY);

    return { x: adjustedX, y: adjustedY };
  };

  const handleSave = () => {
    // pxをremに変換する関数
    const toRem = (px) => {
      const remValue = px / 16;
      return remValue % 1 === 0 ? `${remValue.toFixed(0)}rem` : `${remValue.toFixed(2)}rem`;
    };

    const colorVariables = variables.customColors
      .map((color) => `${color.name}: ${color.color};`)
      .join('\n');

    const variablesInRem = {
      ...variables,
      lInner: toRem(variables.lInner),
      paddingPc: toRem(variables.paddingPc),
      paddingSp: toRem(variables.paddingSp),
    };

    const scssContent = `// インナー幅設定
$l-inner: ${variablesInRem.lInner};
$padding-pc: ${variablesInRem.paddingPc};
$padding-sp: ${variablesInRem.paddingSp};

// 色の指定
${colorVariables}
`;

    window.api.send('save-scss-file', {
      filePath: 'src/scss/global/_setting.scss',
      content: scssContent,
    });

    console.log('Variables saved:', scssContent);
    alert('変更を保存しました');
  };

  return (
    <div className="variable-config">
      <Header
        title="変数設定"
        description="SCSSの変数を設定・管理します"
      />

      <form className="variable-form">
        {/* レイアウト設定 */}
        <div className="form-group">
          <h3 className="group-title">レイアウト設定</h3>

          <div className="input-row">
            <label className="input-label">インナー幅:</label>
            <input
              type="number"
              name="lInner"
              value={variables.lInner}
              onChange={(e) => setVariables({ ...variables, lInner: e.target.value })}
              className="input-field"
            />
            <div className="input-description">pxで入力、自動的にremに変換されます</div>
          </div>

          <div className="input-row">
            <label className="input-label">PC用Padding幅:</label>
            <input
              type="number"
              name="paddingPc"
              value={variables.paddingPc}
              onChange={(e) => setVariables({ ...variables, paddingPc: e.target.value })}
              className="input-field"
            />
            <div className="input-description">pxで入力、自動的にremに変換されます</div>
          </div>

          <div className="input-row">
            <label className="input-label">SP用Padding幅:</label>
            <input
              type="number"
              name="paddingSp"
              value={variables.paddingSp}
              onChange={(e) => setVariables({ ...variables, paddingSp: e.target.value })}
              className="input-field"
            />
            <div className="input-description">pxで入力、自動的にremに変換されます</div>
          </div>
        </div>

        {/* 画像アップロード */}
        <div className="form-group">
          <h3 className="group-title">デザインカンプから色を抽出</h3>
          <div className="upload-area">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              title="デザインカンプをアップロードして色を抽出"
            />
            <div className="upload-button-container">
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                className={`upload-button ${isProcessing ? 'processing' : ''}`}
                disabled={isProcessing}
              >
                {isProcessing ? "処理中..." : "デザインカンプをアップロード"}
              </button>
              {isProcessing && (
                <div className="progress-bar-container">
                  <div className="progress-bar"></div>
                </div>
              )}
            </div>
            <div className="input-description">
              高品質な画像をアップロードすることで色を自動抽出します
              <div className="hint">
                4MB未満の画像は圧縮せずに解析され、より正確な色抽出が可能です
              </div>
            </div>

            <div className="extraction-tips">
              <h4>より正確な色抽出のためのヒント</h4>
              <div className="tips-layout">
                <div className="tip">
                  <span className="tip-icon">✓</span>
                  <div className="tip-content">
                    <strong>高解像度で鮮明な画像を使用する</strong>
                    <p>解像度が高く、鮮明な画像ほど正確な色を抽出できます</p>
                  </div>
                </div>
                <div className="tip">
                  <span className="tip-icon">✓</span>
                  <div className="tip-content">
                    <strong>画面全体のデザインを含む画像を選ぶ</strong>
                    <p>ページ全体が映った画像から、より網羅的な色パレットを抽出できます</p>
                  </div>
                </div>
                <div className="tip">
                  <span className="tip-icon">⚠️</span>
                  <div className="tip-content">
                    <strong>低解像度の画像は避ける</strong>
                    <p>画質の低い画像は色のブレンドが発生し、誤った色が抽出される場合があります</p>
                  </div>
                </div>
              </div>
            </div>

            {designImage && (
              <div className="preview-container">
                <div className="hover-instruction">
                  画像上にマウスを移動して色を確認 ・ クリックして色を抽出できます
                </div>
                <div
                  className="image-container"
                  ref={imageContainerRef}
                  style={{ overflow: 'visible' }}
                >
                  <img
                    ref={imageRef}
                    src={designImage}
                    alt="Design Preview"
                    className="preview-image"
                    onClick={handleImageClick}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    style={{ maxWidth: '100%', display: 'block', position: 'relative' }}
                  />
                  <canvas
                    ref={canvasRef}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      pointerEvents: 'none',
                      width: '100%',
                      height: '100%',
                    }}
                  ></canvas>

                  {/* 吹き出し表示 */}
                  {showColorPopup && selectedColorPosition && ReactDOM.createPortal(
                    <div
                      className="color-popup"
                      style={{
                        position: 'fixed',
                        left: `${adjustPopupPosition(selectedColorPosition.clientX, selectedColorPosition.clientY).x}px`,
                        top: `${adjustPopupPosition(selectedColorPosition.clientX, selectedColorPosition.clientY).y}px`,
                        zIndex: 9999
                      }}
                    >
                      <div className="color-popup-header">
                        <div
                          className="color-sample"
                          style={{ backgroundColor: selectedColorPosition.color }}
                        ></div>
                        <div className="color-info">
                          <div>{selectedColorPosition.color}</div>
                          <div>{selectedColorPosition.rgbValue}</div>
                        </div>
                        <button
                          type="button"
                          className="close-popup"
                          onClick={() => {
                            setShowColorPopup(false);
                            resetCanvas();
                          }}
                        >
                          ×
                        </button>
                      </div>

                      <div className="color-popup-content">
                        <div className="tab-container">
                          <div
                            className={`tab ${isNewVariable ? 'active' : ''}`}
                            onClick={() => setIsNewVariable(true)}
                          >
                            新規変数
                          </div>
                          <div
                            className={`tab ${!isNewVariable ? 'active' : ''}`}
                            onClick={() => setIsNewVariable(false)}
                          >
                            既存変数
                          </div>
                        </div>

                        <div className="popup-options">
                          <div className={`option-panel ${isNewVariable ? 'active' : ''}`}>
                            <div className="new-variable-input">
                              <input
                                type="text"
                                value={newColorName}
                                onChange={(e) => setNewColorName(e.target.value)}
                                placeholder="変数名（例: $primary-color）"
                              />
                            </div>
                          </div>

                          <div className={`option-panel ${!isNewVariable ? 'active' : ''}`}>
                            <div className="existing-variable-select">
                              <select
                                value={selectedExistingVariable}
                                onChange={(e) => setSelectedExistingVariable(e.target.value)}
                              >
                                <option value="">-- 変数を選択 --</option>
                                {extractedColors.map((color, index) => (
                                  <option key={index} value={color.name}>
                                    {color.name} ({color.color})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="popup-actions">
                          <button
                            type="button"
                            className="add-color-btn"
                            onClick={addExtractedColor}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="cancel-btn"
                            onClick={() => {
                              setShowColorPopup(false);
                              resetCanvas();
                            }}
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}

                  {isHovering && hoverColor && (
                    <div
                      className="color-info-tooltip"
                      style={{
                        left: `${mousePosition.x + 20}px`,
                        top: `${mousePosition.y + 20}px`,
                        borderColor: hoverColor.color
                      }}
                    >
                      <div className="color-preview" style={{ backgroundColor: hoverColor.color }}></div>
                      <div className="color-values">
                        <div>{hoverColor.color}</div>
                        <div>{hoverColor.rgbValue}</div>
                        <div className="position">x: {hoverColor.position.x}, y: {hoverColor.position.y}</div>
                      </div>
                    </div>
                  )}

                  {isHovering && (
                    <div
                      className="magnifier-container"
                      style={{
                        left: mousePosition.x < 120 ? '10px' : 'auto',
                        right: mousePosition.x >= 120 ? '10px' : 'auto',
                        top: '10px'
                      }}
                    >
                      <canvas
                        ref={magnifierRef}
                        width="150"
                        height="150"
                        className="magnifier"
                      ></canvas>
                      {hoverColor && (
                        <div className="magnifier-color">{hoverColor.color}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {extractedColors.length > 0 && (
              <div className="extracted-colors">
                <h4>抽出された色 ({extractedColors.length})</h4>
                <div className="color-chips">
                  {extractedColors.map((color, index) => (
                    <div
                      key={index}
                      className="color-chip"
                      title="ホバーして削除ボタンを表示"
                    >
                      <div className="color-sample" style={{ backgroundColor: color.color }}></div>
                      <div className="color-info">
                        <div className="color-name">{color.name}</div>
                        <div className="color-value">{color.color}</div>
                        {color.description && <div className="color-description">{color.description}</div>}
                      </div>
                      <button
                        type="button"
                        className="delete-color-btn"
                        onClick={() => removeExtractedColor(color.name)}
                        title={`${color.name} を削除`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {extractedColors.length > 0 && (
              <button
                type="button"
                className="apply-colors-button"
                onClick={applyExtractedColors}
              >
                抽出した色を適用
              </button>
            )}
          </div>
        </div>

        {/* 色設定 */}
        <div className="form-group color-settings">
          <h3 className="group-title">色設定</h3>
          <div className="items-container">
            {variables.customColors.map((color, index) => (
              <div key={index} className="item">
                <input
                  type="text"
                  value={color.name}
                  onChange={(e) => {
                    const updatedColors = [...variables.customColors];
                    updatedColors[index].name = e.target.value;
                    setVariables({ ...variables, customColors: updatedColors });
                  }}
                  className="color-name"
                  placeholder="変数名（例: $primary-color）"
                />
                <input
                  type="text"
                  value={color.color}
                  onChange={(e) => handleColorChange(index, e.target.value)}
                  className="color-name"
                  placeholder="カラーコード"
                />
                <div
                  className="color-preview"
                  style={{ backgroundColor: color.color }}
                ></div>
                <button
                  type="button"
                  onClick={() => removeColor(index)}
                  className="remove-button"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addColor} className="add-button">
            色を追加
          </button>
        </div>

        {/* 保存ボタン */}
        <div className="action-buttons">
          <button type="button" onClick={handleSave} className="save-button">
            <span>変更を保存</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default VariableConfig;
