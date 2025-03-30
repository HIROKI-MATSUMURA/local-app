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

  // トースト通知の状態
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

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

  useEffect(() => {
    // 処理中のカウンター
    let timer = null;
    let seconds = 0;

    if (isProcessing) {
      // カウンターを毎秒更新
      timer = setInterval(() => {
        seconds++;
        const statusEl = document.querySelector('.processing-time');
        if (statusEl) {
          statusEl.textContent = `経過時間: ${seconds}秒`;
        }
      }, 1000);

      // アニメーションの動きを直接JavaScriptで制御
      const progressWave = document.querySelector('.progress-waves');
      const progressGlow = document.querySelector('.progress-glow');
      const particles = document.querySelectorAll('.particle-effect > div');
      const hexElements = document.querySelectorAll('.hex');
      const aiIcon = document.querySelector('.ai-icon');
      const statusDot = document.querySelector('.status-dot');

      if (progressWave) {
        // プログレスウェーブアニメーション
        let wavePos = 100;
        const waveAnimation = setInterval(() => {
          wavePos = wavePos <= 0 ? 100 : wavePos - 1;
          progressWave.style.backgroundPosition = `${wavePos}% 50%`;
        }, 20);

        // グローアニメーション
        let glowPos = -20;
        const glowAnimation = setInterval(() => {
          glowPos = glowPos >= 100 ? -20 : glowPos + 1;
          if (progressGlow) progressGlow.style.left = `${glowPos}%`;
        }, 15);

        // パーティクルアニメーション
        if (particles && particles.length > 0) {
          particles.forEach((particle, index) => {
            // ランダムな動きを付ける
            const speed = Math.random() * 3 + 1;
            let particleY = 0;
            let particleX = 0;
            let direction = 1;

            const particleAnimation = setInterval(() => {
              particleY += speed * direction * 0.1;
              particleX += speed * direction * 0.1;

              if (Math.abs(particleY) > 20) {
                direction *= -1;
              }

              particle.style.transform = `translate(${particleX}px, ${particleY}px)`;
            }, 50);

            // 各パーティクルのアニメーションタイマーをクリーンアップ対象に追加
            const originalCleanup = window.particleCleanupFunctions || [];
            originalCleanup.push(() => clearInterval(particleAnimation));
            window.particleCleanupFunctions = originalCleanup;
          });
        }

        // 六角形のパルスアニメーション
        if (hexElements && hexElements.length > 0) {
          hexElements.forEach((hex, index) => {
            let scale = 0.8;
            let growing = true;
            const pulseSpeed = 0.01 + (index * 0.002);

            const hexAnimation = setInterval(() => {
              if (growing) {
                scale += pulseSpeed;
                if (scale >= 1) growing = false;
              } else {
                scale -= pulseSpeed;
                if (scale <= 0.8) growing = true;
              }

              hex.style.transform = `scale(${scale})`;
              hex.style.opacity = 0.4 + (scale - 0.8) * 2; // 0.4〜1.0の間で変化
            }, 50);

            // 六角形のアニメーションタイマーをクリーンアップ対象に追加
            const originalCleanup = window.hexCleanupFunctions || [];
            originalCleanup.push(() => clearInterval(hexAnimation));
            window.hexCleanupFunctions = originalCleanup;
          });
        }

        // AIアイコンのグロウパルスアニメーション
        if (aiIcon) {
          let glowIntensity = 0.5;
          let glowIncreasing = true;

          const aiIconAnimation = setInterval(() => {
            if (glowIncreasing) {
              glowIntensity += 0.02;
              if (glowIntensity >= 0.8) glowIncreasing = false;
            } else {
              glowIntensity -= 0.02;
              if (glowIntensity <= 0.5) glowIncreasing = true;
            }

            aiIcon.style.boxShadow = `0 0 ${15 + (glowIntensity * 15)}px rgba(0, 118, 173, ${glowIntensity})`;
          }, 50);

          // アイコンアニメーションのクリーンアップを追加
          window.aiIconCleanupFunction = () => clearInterval(aiIconAnimation);
        }

        // ステータスドットのパルスアニメーション
        if (statusDot) {
          let dotScale = 1;
          let dotGrowing = true;

          const statusDotAnimation = setInterval(() => {
            if (dotGrowing) {
              dotScale += 0.05;
              if (dotScale >= 1.5) dotGrowing = false;
            } else {
              dotScale -= 0.05;
              if (dotScale <= 1) dotGrowing = true;
            }

            statusDot.style.transform = `scale(${dotScale})`;
            statusDot.style.boxShadow = dotScale > 1.3 ? `0 0 8px #6eb6db` : 'none';
          }, 50);

          // ステータスドットアニメーションのクリーンアップを追加
          window.statusDotCleanupFunction = () => clearInterval(statusDotAnimation);
        }

        // クリーンアップ関数に追加
        return () => {
          clearInterval(timer);
          clearInterval(waveAnimation);
          clearInterval(glowAnimation);

          // パーティクルのクリーンアップ
          if (window.particleCleanupFunctions) {
            window.particleCleanupFunctions.forEach(cleanup => cleanup());
            window.particleCleanupFunctions = [];
          }

          // 六角形のクリーンアップ
          if (window.hexCleanupFunctions) {
            window.hexCleanupFunctions.forEach(cleanup => cleanup());
            window.hexCleanupFunctions = [];
          }

          // AIアイコンのクリーンアップ
          if (window.aiIconCleanupFunction) {
            window.aiIconCleanupFunction();
          }

          // ステータスドットのクリーンアップ
          if (window.statusDotCleanupFunction) {
            window.statusDotCleanupFunction();
          }
        };
      }
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isProcessing]);

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
        const image = event.target.result;

        // 画像をリサイズして処理を軽くする（この処理中はローディングを表示しない）
        const resizedImage = await resizeImage(image, 1200);

        // 画像を表示
        setDesignImage(resizedImage);

        // レンダリングが完了するまで少し待つ
        setTimeout(() => {
          // ここでAI処理のためのローディングを開始
          setIsProcessing(true);

          // CSS Animationが動作しない場合に備えて明示的にアニメーションスタイルをDOMに適用
          const styleElement = document.createElement('style');
          styleElement.textContent = `
            @keyframes spinner-rotation {
              to { transform: rotate(360deg); }
            }
            @keyframes loading-bar-progress {
              0% { background-position: 0 0; }
              100% { background-position: 48px 0; }
            }
            @keyframes text-blink {
              0%, 100% { opacity: 0.6; }
              50% { opacity: 1; }
            }
            @keyframes particle-float {
              0% { transform: translateY(0) translateX(0); }
              25% { transform: translateY(10px) translateX(10px); }
              50% { transform: translateY(20px) translateX(0); }
              75% { transform: translateY(10px) translateX(-10px); }
              100% { transform: translateY(0) translateX(0); }
            }
            @keyframes hex-pulse {
              0%, 100% { transform: scale(0.8); opacity: 0.4; }
              50% { transform: scale(1); opacity: 1; }
            }
            @keyframes hex-color-shift {
              0% { background: linear-gradient(135deg, rgba(0, 118, 173, 0.3) 0%, rgba(0, 118, 173, 0.6) 100%); }
              33% { background: linear-gradient(135deg, rgba(0, 173, 118, 0.3) 0%, rgba(0, 173, 118, 0.6) 100%); }
              66% { background: linear-gradient(135deg, rgba(118, 0, 173, 0.3) 0%, rgba(118, 0, 173, 0.6) 100%); }
              100% { background: linear-gradient(135deg, rgba(0, 118, 173, 0.3) 0%, rgba(0, 118, 173, 0.6) 100%); }
            }
            @keyframes progress-wave-animation {
              0% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
            @keyframes progress-glow-animation {
              0% { left: -20%; }
              100% { left: 100%; }
            }
            @keyframes pulse-glow {
              0%, 100% { box-shadow: 0 0 15px rgba(0, 118, 173, 0.5); }
              50% { box-shadow: 0 0 30px rgba(0, 118, 173, 0.8); }
            }
            @keyframes ai-process {
              0%, 100% { opacity: 0.5; }
              50% { opacity: 0.9; }
            }
            @keyframes stage-pulse {
              0%, 100% { transform: scale(1); opacity: 0.5; }
              50% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 15px rgba(0, 118, 173, 0.7); }
            }
            @keyframes stage-active {
              0% { transform: scale(0); opacity: 0; }
              80% { transform: scale(1.2); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes status-blink {
              0%, 100% { opacity: 0.7; }
              50% { opacity: 1; }
            }
            @keyframes status-dot-pulse {
              0%, 100% { transform: scale(1); opacity: 0.7; }
              50% { transform: scale(1.5); opacity: 1; box-shadow: 0 0 8px #6eb6db; }
            }
          `;
          document.head.appendChild(styleElement);

          // 色を抽出（この処理中にローディングアニメーションを表示）
          extractColorsFromImage(resizedImage)
            .finally(() => {
              // 処理終了時にスタイル要素を削除
              document.head.removeChild(styleElement);
            });
        }, 100);
      } catch (error) {
        console.error('画像処理エラー:', error);
        alert('画像の処理中にエラーが発生しました。');
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
2. 変数名は以下のようなシンプルな命名規則を使用してください:
   - $primary-color: メインの色
   - $secondary-color: セカンダリの色
   - $accent-color: アクセントの色
   - $background-color: 背景色
   - その他は $color-1, $color-2 などの連番
3. コメントにはどこで使用されているか簡潔に記述

例のフォーマット:
$primary-color: #3F51B5; // ヘッダー背景色
$secondary-color: #FFC107; // アクセントボタン色
$color-1: #FF5722; // カード背景

レスポンスは上記の形式のみで返してください。説明は不要です。
`;

      return new Promise((resolve, reject) => {
        // ロード状態の更新
        setIsProcessing(true);

        // プロセスステージを更新する関数
        const updateStageUI = (stage) => {
          const stageIcons = document.querySelectorAll('.stage-icon');
          const stageNames = document.querySelectorAll('.stage-name');

          if (!stageIcons || stageIcons.length < 4) return;

          // 準備・分析・抽出・完了の4ステージ
          for (let i = 0; i < 4; i++) {
            if (i < stage) {
              // 完了したステージ
              stageIcons[i].style.background = 'rgba(0, 118, 173, 1)';
              stageIcons[i].style.boxShadow = '0 0 10px rgba(0, 118, 173, 0.7)';
              stageIcons[i].innerHTML = '<span style="color: white; font-size: 12px">✓</span>';
              stageNames[i].style.color = 'rgba(255, 255, 255, 0.7)';
            } else if (i === stage) {
              // 現在のステージ
              stageIcons[i].style.background = 'rgba(0, 118, 173, 0.5)';
              stageIcons[i].style.animation = 'stage-pulse 1.5s infinite';
              stageIcons[i].innerHTML = '<div style="width: 8px; height: 8px; border-radius: 50%; background: #fff"></div>';
              stageNames[i].style.color = 'rgba(255, 255, 255, 0.9)';
              stageNames[i].style.fontWeight = '600';
            } else {
              // これからのステージ
              stageIcons[i].style.background = 'rgba(255, 255, 255, 0.1)';
              stageIcons[i].style.animation = 'none';
              stageIcons[i].style.boxShadow = 'none';
              stageIcons[i].innerHTML = '';
              stageIcons[i].style.border = '1px solid rgba(255, 255, 255, 0.2)';
              stageNames[i].style.color = 'rgba(255, 255, 255, 0.4)';
              stageNames[i].style.fontWeight = '400';
            }
          }
        };

        // 進捗状況表示用の状態
        const processingStatusEl = document.querySelector('.processing-status');
        if (processingStatusEl) {
          processingStatusEl.textContent = 'APIに画像を送信中...';
        }

        // ステージ0: 準備
        updateStageUI(0);
        setTimeout(() => {
          // ステージ1: 分析
          updateStageUI(1);
        }, 1500);

        // 古いリスナーを削除する必要はありません
        // window.api.receive メソッドは内部で古いリスナーを自動的に削除します

        // 新しいレスポンスリスナーを設定
        const responseHandler = (result) => {
          // ステージ2: 抽出 (APIからレスポンスがあった時点)
          updateStageUI(2);

          if (processingStatusEl) {
            processingStatusEl.textContent = 'レスポンスを処理中...';
          }

          if (result.error) {
            console.error("API エラー:", result.error);
            setIsProcessing(false); // エラー時もisProcessingをリセット
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

            // ステージ3: 完了
            updateStageUI(3);

            // データ表示前に少し遅延を入れて完了ステージを見せる
            setTimeout(() => {
              setExtractedColors(uniqueColors);
              setIsProcessing(false); // 処理完了時にisProcessingをリセット
              // アラートで通知を削除
              resolve(uniqueColors);
            }, 1000);
          } catch (err) {
            console.error("色情報の解析エラー:", err);
            setIsProcessing(false); // エラー時もisProcessingをリセット
            reject(err);
          }
        };

        // レスポンスを受け取るリスナーを設定
        window.api.receive('extract-colors-response', responseHandler);

        // APIリクエスト送信前にステータス更新
        if (processingStatusEl) {
          processingStatusEl.textContent = 'APIリクエストを準備中...';

          // 非同期でステータスを更新（UIをブロックしないため）
          setTimeout(() => {
            if (processingStatusEl && isProcessing) {
              processingStatusEl.textContent = 'APIに画像を送信中...';
            }
          }, 500);
        }

        // データを送信
        window.api.send('extract-colors-from-image', {
          apiKey,
          prompt,
          imageData: base64Image
        });

        // 送信後ステータス更新
        setTimeout(() => {
          if (processingStatusEl && isProcessing) {
            processingStatusEl.textContent = 'AIによる画像解析中...';
          }
        }, 2000);
      });

    } catch (error) {
      console.error('色抽出エラー:', error);
      alert('色の抽出に失敗しました: ' + error.message);
      setIsProcessing(false); // エラー時にも確実にisProcessingをリセット
      throw error; // 上位でハンドリングできるようにエラーを再スロー
    }
  };

  // 抽出した色を変数に適用
  const applyExtractedColors = () => {
    console.log('Applying extracted colors:', extractedColors);
    if (extractedColors.length === 0) {
      return;
    }

    // 既存の変数に新しい色を適用
    const newCustomColors = [...variables.customColors];
    extractedColors.forEach(ec => {
      const existingIndex = newCustomColors.findIndex(v => v.name === ec.name);
      if (existingIndex !== -1) {
        newCustomColors[existingIndex].color = ec.color;
      }
    });

    // 変数を更新
    setVariables({
      ...variables,
      customColors: newCustomColors
    });

    console.log('新しいカスタムカラー:', newCustomColors);

    // トースト通知を表示
    showToast('抽出した色を変数に適用しました。「変更を保存」で確定してください。', 'success');
    console.log('トースト通知を表示しました');
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
    if (!designImage || isProcessing) return;

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
    if (isProcessing) return;

    setIsHovering(false);
    setHoverColor(null);

    // 色選択ポップアップが表示されている場合は閉じない
    if (!showColorPopup) {
      resetCanvas();
    }
  };

  // クリックで色を抽出して吹き出しを表示
  const handleImageClick = (e) => {
    if (!designImage || isProcessing) return;

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

    // トースト通知を表示
    showToast('変更を保存しました', 'success');
  };

  // トースト通知を表示する関数
  const showToast = (message, type = 'success') => {
    // トースト状態を更新（React制御部分）
    setToast({ show: true, message, type });

    // 直接DOM操作によるフォールバックトースト
    if (!document.querySelector('.toast-notification')) {
      console.log('トースト要素が見つからないため、直接DOMに挿入します');

      // 既存のトースト要素があれば削除
      const existingToast = document.querySelector('.toast-notification-fallback');
      if (existingToast) {
        document.body.removeChild(existingToast);
      }

      const toastContainer = document.createElement('div');
      toastContainer.className = 'toast-notification-fallback';

      // タイプに応じた色を設定
      let bgColor, iconBgColor, boxShadowColor, borderColor, iconPath;

      if (type === 'success') {
        bgColor = 'linear-gradient(135deg, rgba(40, 167, 69, 0.97), rgba(32, 134, 55, 0.95))';
        iconBgColor = 'rgba(25, 135, 84, 0.95)';
        boxShadowColor = 'rgba(25, 135, 84, 0.6)';
        borderColor = 'rgba(25, 200, 84, 0.25)';
        iconPath = '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="white"/>';
      } else if (type === 'warning' || type === 'error') {
        bgColor = 'linear-gradient(135deg, rgba(220, 53, 69, 0.97), rgba(178, 43, 56, 0.95))';
        iconBgColor = 'rgba(220, 53, 69, 0.95)';
        boxShadowColor = 'rgba(220, 53, 69, 0.6)';
        borderColor = 'rgba(255, 100, 100, 0.25)';
        iconPath = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="white"/>';
      } else {
        bgColor = 'linear-gradient(135deg, rgba(13, 110, 253, 0.97), rgba(11, 94, 215, 0.95))';
        iconBgColor = 'rgba(13, 110, 253, 0.95)';
        boxShadowColor = 'rgba(13, 110, 253, 0.6)';
        borderColor = 'rgba(13, 150, 253, 0.25)';
        iconPath = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="white"/>';
      }

      toastContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: calc(50% + 120px);
        transform: translate(-50%, -50%);
        background: ${bgColor};
        color: white;
        padding: 20px 28px;
        border-radius: 12px;
        box-shadow: 0 8px 32px ${boxShadowColor}, 0 0 0 2px ${borderColor};
        z-index: 200000;
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 360px;
        max-width: 500px;
        backdrop-filter: blur(10px);
        border: 1px solid ${borderColor};
        font-weight: 600;
        animation: toast-pulse 2s ease-in-out infinite;
      `;

      toastContainer.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: ${iconBgColor};
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
          box-shadow: 0 0 20px ${boxShadowColor};
        ">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            ${iconPath}
          </svg>
        </div>
        <div style="font-size: 16px; line-height: 1.4; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          ${message}
        </div>
      `;

      // アニメーション用のスタイルを追加
      const animStyle = document.createElement('style');
      animStyle.textContent = `
        @keyframes toast-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.02); }
        }
        .toast-notification-fallback {
          animation: toast-pulse 2s ease-in-out infinite;
        }
      `;
      document.head.appendChild(animStyle);
      document.body.appendChild(toastContainer);

      // クリーンアップ時にスタイル要素も削除
      setTimeout(() => {
        if (document.body.contains(toastContainer)) {
          document.body.removeChild(toastContainer);
        }
        if (document.head.contains(animStyle)) {
          document.head.removeChild(animStyle);
        }
        setToast({ show: false, message: '', type: 'success' });
      }, 3000);
    }
  };

  return (
    <div className="variable-config">
      <Header />

      <div className="content">
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
            <div
              className="upload-area"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.add('drag-over');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.remove('drag-over');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.remove('drag-over');

                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = e.dataTransfer.files[0];
                  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];

                  if (validTypes.includes(file.type)) {
                    const event = { target: { files: e.dataTransfer.files } };
                    handleImageUpload(event);
                  } else {
                    alert('JPG、PNG、またはWEBP形式の画像ファイルをアップロードしてください。');
                  }
                }
              }}
              onClick={() => !isProcessing && fileInputRef.current.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                title="デザインカンプをアップロードして色を抽出"
              />

              {isProcessing ? (
                <div className="processing-indicator">
                  <span className="spinner-icon"></span>
                  <span>処理中...</span>
                </div>
              ) : (
                <div className="upload-content">
                  <h4>デザインカンプ画像をアップロード</h4>
                  <p>クリックまたはドラッグ＆ドロップ</p>

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
                </div>
              )}
            </div>

            {/* 画像プレビューと解析結果 - アップロードエリアから分離 */}
            {designImage && (
              <div className="design-preview-container">
                <div className="preview-container">
                  <div className="hover-instruction">
                    画像上にマウスを移動して色を確認 ・ クリックして色を抽出できます
                  </div>
                  <div
                    className="image-container"
                    ref={imageContainerRef}
                    style={{ overflow: 'visible', position: 'relative' }}
                  >
                    <img
                      ref={imageRef}
                      src={designImage}
                      alt="Design Preview"
                      className={`preview-image ${isProcessing ? 'processing' : ''}`}
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

                    {isProcessing && (
                      <div className="ai-processing-overlay" style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 9999,
                        backdropFilter: 'blur(6px)',
                        borderRadius: '8px'
                      }}>
                        {/* AI処理中のオーバーレイコンテンツはそのまま */}
                        <div className="ai-processing-content" style={{
                          backgroundColor: 'rgba(12, 20, 33, 0.9)',
                          borderRadius: '16px',
                          padding: '30px',
                          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 118, 173, 0.3)',
                          textAlign: 'center',
                          width: '90%',
                          maxWidth: '380px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          overflow: 'hidden',
                          position: 'relative',
                          transform: 'translateZ(0)',  // ハードウェアアクセラレーションを有効化
                          willChange: 'transform'      // アニメーションの最適化を促進
                        }}>
                          {/* Particle Animation Background */}
                          <div className="particle-effect" style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden',
                            opacity: 0.15,
                            zIndex: 0
                          }}>
                            {Array.from({ length: 50 }).map((_, i) => (
                              <div key={i} style={{
                                position: 'absolute',
                                top: `${Math.random() * 100}% `,
                                left: `${Math.random() * 100}% `,
                                width: `${Math.random() * 6 + 2} px`,
                                height: `${Math.random() * 6 + 2} px`,
                                backgroundColor: `rgba(${Math.random() * 155 + 100}, ${Math.random() * 155 + 100}, 255, 1)`,
                                borderRadius: '50%',
                                filter: 'blur(1px)',
                                transform: 'translateZ(0)',  // ハードウェアアクセラレーションを有効化
                                willChange: 'transform',     // アニメーションの最適化を促進
                              }} />
                            ))}
                          </div>

                          {/* Hex Grid Animation */}
                          <div style={{
                            position: 'relative',
                            zIndex: 2,
                            marginBottom: '25px'
                          }}>
                            <div className="hex-grid" style={{
                              display: 'flex',
                              justifyContent: 'center',
                              position: 'relative',
                              height: '80px',
                              marginBottom: '5px',
                              transform: 'translateZ(0)',  // ハードウェアアクセラレーションを有効化
                              willChange: 'transform'      // アニメーションの最適化を促進
                            }}>
                              {Array.from({ length: 7 }).map((_, i) => (
                                <div key={i} className="hex" style={{
                                  width: '32px',
                                  height: '35px',
                                  margin: '0 -4px',
                                  background: `linear - gradient(135deg, rgba(0, 118, 173, 0.3) 0 %, rgba(0, 118, 173, 0.6) 100 %)`,
                                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                                  transformOrigin: 'center',
                                  position: 'relative',
                                  opacity: 0.9,
                                  transform: 'translateZ(0)',  // ハードウェアアクセラレーションを有効化
                                  willChange: 'transform, opacity'  // アニメーションの最適化を促進
                                }} />
                              ))}
                            </div>

                            <div className="ai-icon" style={{
                              width: '60px',
                              height: '60px',
                              background: 'linear-gradient(180deg, #0076ad, #004a6b)',
                              borderRadius: '30%',
                              margin: '0 auto',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 10px 25px rgba(0, 118, 173, 0.5)',
                              position: 'relative',
                              overflow: 'hidden',
                              transform: 'translateZ(0)',  // ハードウェアアクセラレーションを有効化
                              willChange: 'box-shadow'     // アニメーションの最適化を促進
                            }}>
                              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
                                <path d="M12 22V12M12 12L2.5 7.5M12 12L21.5 7.5M17 14.5V10L7 5" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" />
                                <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.9)" />
                              </svg>
                              <div className="ai-icon-pulse" style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                background: 'radial-gradient(circle, rgba(0,118,173,0) 30%, rgba(0,118,173,0.8) 100%)',
                                animation: 'ai-process 2s infinite',
                                opacity: 0.7
                              }}></div>
                            </div>
                          </div>

                          <div className="processing-title" style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            marginBottom: '8px',
                            background: 'linear-gradient(90deg, #ffffff, #6eb6db)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            position: 'relative',
                            zIndex: 2
                          }}>AIカラー解析中</div>

                          <div className="processing-description" style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            marginBottom: '25px',
                            position: 'relative',
                            zIndex: 2
                          }}>高精度な色抽出には15〜30秒ほど時間がかかります</div>

                          {/* Smart Progress Indicator */}
                          <div className="progress-container" style={{
                            position: 'relative',
                            height: '10px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            margin: '0 10px 25px',
                            boxShadow: 'inset 0 1px 5px rgba(0, 0, 0, 0.3)',
                            zIndex: 2
                          }}>
                            <div className="progress-waves" style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              height: '100%',
                              width: '100%',
                              background: 'linear-gradient(90deg, rgba(0, 118, 173, 0.8), rgba(110, 182, 219, 0.8))',
                              backgroundSize: '200% 100%',
                              borderRadius: '10px',
                              boxShadow: '0 0 10px rgba(110, 182, 219, 0.5)',
                              transform: 'translateZ(0)',  // ハードウェアアクセラレーションを有効化
                              willChange: 'background-position'  // アニメーションの最適化を促進
                            }}></div>

                            <div className="progress-glow" style={{
                              position: 'absolute',
                              top: 0,
                              left: '-20%',
                              height: '100%',
                              width: '40%',
                              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
                              borderRadius: '10px',
                              transform: 'translateZ(0)',  // ハードウェアアクセラレーションを有効化
                              willChange: 'left'           // アニメーションの最適化を促進
                            }}></div>
                          </div>

                          <div className="process-stages" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: '20px',
                            position: 'relative',
                            padding: '0 10px',
                            zIndex: 2
                          }}>
                            <div className="stage-item" style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: '25%'
                            }}>
                              <div className="stage-icon" style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: 'rgba(0, 118, 173, 1)',
                                marginBottom: '5px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 0 10px rgba(0, 118, 173, 0.7)',
                                animation: 'stage-active 0.5s ease-out'
                              }}>
                                <span style={{ color: 'white', fontSize: '12px' }}>✓</span>
                              </div>
                              <div className="stage-name" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)' }}>準備</div>
                            </div>
                            <div className="stage-item" style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: '25%'
                            }}>
                              <div className="stage-icon" style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: 'rgba(0, 118, 173, 1)',
                                marginBottom: '5px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 0 10px rgba(0, 118, 173, 0.7)',
                                animation: 'stage-active 0.5s ease-out 0.5s both'
                              }}>
                                <span style={{ color: 'white', fontSize: '12px' }}>✓</span>
                              </div>
                              <div className="stage-name" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)' }}>分析</div>
                            </div>
                            <div className="stage-item" style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: '25%'
                            }}>
                              <div className="stage-icon" style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: 'rgba(0, 118, 173, 0.5)',
                                marginBottom: '5px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                animation: 'stage-pulse 1.5s infinite'
                              }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }}></div>
                              </div>
                              <div className="stage-name" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)' }}>抽出</div>
                            </div>
                            <div className="stage-item" style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: '25%'
                            }}>
                              <div className="stage-icon" style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: 'rgba(255, 255, 255, 0.1)',
                                marginBottom: '5px',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                              }}></div>
                              <div className="stage-name" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>完了</div>
                            </div>
                          </div>

                          <div className="status-container" style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            position: 'relative',
                            zIndex: 2
                          }}>
                            <div className="processing-status" style={{
                              fontSize: '12px',
                              color: '#6eb6db',
                              fontWeight: 500,
                              animation: 'status-blink 2s infinite',
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              <div className="status-dot" style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: '#6eb6db',
                                marginRight: '5px',
                                animation: 'status-dot-pulse 1.5s infinite'
                              }}></div>
                              最適なカラーパレットを検出中...
                            </div>
                            <div className="processing-time" style={{
                              fontSize: '12px',
                              color: 'rgba(255, 255, 255, 0.6)',
                              fontFamily: 'monospace',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              padding: '3px 8px',
                              borderRadius: '10px'
                            }}>経過時間: 0秒</div>
                          </div>

                          <style dangerouslySetInnerHTML={{
                            __html: `
    @keyframes particle - float {
      0 % { transform: translateY(0) translateX(0); }
      25 % { transform: translateY(10px) translateX(10px); }
      50 % { transform: translateY(20px) translateX(0); }
      75 % { transform: translateY(10px) translateX(- 10px);
    }
    100 % { transform: translateY(0) translateX(0); }
  }

  @keyframes hex - pulse {
    0 %, 100 % { transform: scale(0.8); opacity: 0.4; }
    50 % { transform: scale(1); opacity: 1; }
  }

  @keyframes hex - color - shift {
    0 % { background: linear - gradient(135deg, rgba(0, 118, 173, 0.3) 0 %, rgba(0, 118, 173, 0.6) 100 %); }
    33 % { background: linear - gradient(135deg, rgba(0, 173, 118, 0.3) 0 %, rgba(0, 173, 118, 0.6) 100 %); }
    66 % { background: linear - gradient(135deg, rgba(118, 0, 173, 0.3) 0 %, rgba(118, 0, 173, 0.6) 100 %); }
    100 % { background: linear - gradient(135deg, rgba(0, 118, 173, 0.3) 0 %, rgba(0, 118, 173, 0.6) 100 %); }
  }

  @keyframes progress - wave - animation {
    0 % { background- position: 100 % 50 %;
  }
  100 % { background- position: 0 % 50 %;
}
                          }

@keyframes progress - glow - animation {
  0 % { left: -20 %; }
  100 % { left: 100 %; }
}

@keyframes pulse - glow {
  0 %, 100 % { box- shadow: 0 0 15px rgba(0, 118, 173, 0.5);
}
50 % { box- shadow: 0 0 30px rgba(0, 118, 173, 0.8); }
                          }

@keyframes ai - process {
  0 %, 100 % { opacity: 0.5; }
  50 % { opacity: 0.9; }
}

@keyframes stage - pulse {
  0 %, 100 % { transform: scale(1); opacity: 0.5; }
  50 % { transform: scale(1.1); opacity: 1; box- shadow: 0 0 15px rgba(0, 118, 173, 0.7);
}
                          }

@keyframes stage - active {
  0 % { transform: scale(0); opacity: 0; }
  80 % { transform: scale(1.2); opacity: 1; }
  100 % { transform: scale(1); opacity: 1; }
}

@keyframes status - blink {
  0 %, 100 % { opacity: 0.7; }
  50 % { opacity: 1; }
}

@keyframes status - dot - pulse {
  0 %, 100 % { transform: scale(1); opacity: 0.7; }
  50 % { transform: scale(1.5); opacity: 1; box- shadow: 0 0 8px #6eb6db;
}
                          }
`}} />
                        </div>
                      </div>
                    )}

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
              <div className="caution-notice">
                <div className="caution-title">注意事項：</div>
                <div className="caution-content">
                  <ul>
                    <li>AIで抽出した色が完璧とは限りません。</li>
                    <li>手動で抽出した色も解像度の関係で若干ずれる可能性があります。</li>
                    <li>曖昧な場合はデザインカンプから直接確認をしてください。</li>
                  </ul>
                </div>
              </div>
            )}

            {extractedColors.length > 0 && (
              <button
                type="button"
                className="apply-colors-button"
                onClick={applyExtractedColors}
              >
                <span className="button-glow"></span>
                抽出した色を適用
              </button>
            )}
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
    </div>
  );
};

export default VariableConfig;
