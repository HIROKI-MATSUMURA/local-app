import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import ReactDOM from 'react-dom';
import '../styles/VariableConfig.scss';
import Header from './Header';
import projectDataStore from '../utils/projectDataStore';

const VariableConfig = forwardRef((props, ref) => {
  // アクティブプロジェクト情報を受け取る
  const { activeProject } = props;

  // 初期状態
  const [variables, setVariables] = useState({
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

  // 未保存の変更を追跡する状態
  const [hasChanges, setHasChanges] = useState(false);
  // 初回レンダリングを追跡するための参照
  const initialRender = useRef(true);
  // 初期データロード完了フラグ
  const initialLoadComplete = useRef(false);
  // オリジナルの変数値を保存する参照
  const originalVariables = useRef(null);
  // ファイルシステム操作のフラグ
  const isElectronContext = typeof window !== 'undefined' && window.api;
  // 処理中フラグと状態メッセージ
  const [statusMessage, setStatusMessage] = useState('');
  const [isSaved, setIsSaved] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // パス操作のためのヘルパー関数（Node.jsのpathモジュールの代替）
  const pathHelper = {
    basename: (filePath) => {
      if (!filePath) return '';
      // 両方のパスセパレータに対応
      const parts = filePath.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1] || '';
    },

    dirname: (filePath) => {
      if (!filePath) return '';
      // 両方のパスセパレータに対応
      const normalizedPath = filePath.replace(/\\/g, '/');
      const lastSlashIndex = normalizedPath.lastIndexOf('/');
      return lastSlashIndex > -1 ? normalizedPath.substring(0, lastSlashIndex) : '';
    },

    join: (...parts) => {
      // 各パーツを文字列に変換し、nullやundefinedや非文字列オブジェクトを適切に処理
      const validParts = parts.map(part => {
        // nullやundefinedは空文字に
        if (part === null || part === undefined) return '';

        // オブジェクトや配列の場合は空文字に
        if (typeof part === 'object') {
          console.warn('pathHelper.join: オブジェクト型の値が渡されました:', part);
          return '';
        }

        // 空文字列、NaN、Infinityなどの特殊な値も空文字に
        if (part === '' || Number.isNaN(part) || part === Infinity || part === -Infinity) {
          console.warn('pathHelper.join: 特殊な値が渡されました:', part);
          return '';
        }

        // それ以外は文字列に変換
        try {
          return String(part);
        } catch (error) {
          console.error('pathHelper.join: 文字列変換に失敗しました:', error);
          return '';
        }
      });

      // 値がある要素だけをフィルタリングして結合
      const path = validParts.filter(Boolean).join('/');

      // 重複スラッシュを削除して返す
      return path.replace(/\/+/g, '/');
    }
  };

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const magnifierRef = useRef(null);
  const imageContainerRef = useRef(null);

  // 外部からアクセスできるメソッドを公開
  useImperativeHandle(ref, () => ({
    // 未保存の変更があるかどうかを返すメソッド
    hasUnsavedChanges: () => hasChanges
  }));

  // 変数の更新時にhasChangesフラグを設定するuseEffect - 修正
  useEffect(() => {
    // 初期データロード完了前か初回レンダリング時は変更扱いにしない
    if (!initialLoadComplete.current || initialRender.current) {
      return;
    }

    // 変数が実際に変更されたかどうかを比較する
    if (originalVariables.current) {
      const isChanged = JSON.stringify(originalVariables.current) !== JSON.stringify(variables);
      setHasChanges(isChanged);
      setIsSaved(!isChanged);
    } else {
      // オリジナル値が存在しない場合は変更なしとみなす
      setHasChanges(false);
      setIsSaved(true);
    }
  }, [variables]);

  // プロジェクト変更時のデータ初期化・読み込み
  useEffect(() => {
    console.log('VariableConfig: activeProject変更が検出されました', {
      id: activeProject?.id,
      name: activeProject?.name,
      path: activeProject?.path
    });

    // 初期化フラグをリセット
    initialRender.current = true;
    initialLoadComplete.current = false;

    // プロジェクト切り替え時にステートをリセット
    setIsProcessing(false);
    setIsSaved(true); // 初期状態は保存済みに設定
    setStatusMessage('');
    setIsInitialized(false);
    setHasChanges(false);

    // activeProjectが変更された場合に実行
    if (activeProject && activeProject.id) {
      console.log(`プロジェクト[${activeProject.id}]の変数設定を読み込みます`);

      const loadVariableData = async () => {
        try {
          setIsProcessing(true);

          // JSONからデータを読み込み
          let savedVariables = null;
          try {
            savedVariables = await projectDataStore.loadProjectData(activeProject.id, 'variableSettings');
            console.log('JSONから読み込んだ変数設定:', savedVariables);
          } catch (jsonError) {
            console.error('JSONからの変数読み込みエラー:', jsonError);
          }

          // ファイルシステムからも読み込みを試みる
          let fileContentFromFile = null;
          try {
            fileContentFromFile = await loadVariablesFromFile();
            console.log('ファイルシステムから読み込んだ変数設定:', fileContentFromFile);
          } catch (fileError) {
            console.error('ファイルからの変数読み込みエラー:', fileError);
          }

          if (fileContentFromFile && (!savedVariables || JSON.stringify(fileContentFromFile) !== JSON.stringify(savedVariables))) {
            // ファイルシステムから読み込めた場合、そちらを優先
            console.log('ファイルシステムから最新の変数設定を読み込みました');
            setVariables(fileContentFromFile);
            // オリジナル値として保存
            originalVariables.current = JSON.parse(JSON.stringify(fileContentFromFile));

            // JSONも更新
            try {
              await projectDataStore.saveProjectData(activeProject.id, 'variableSettings', fileContentFromFile);
              // 初期設定時にはステータスメッセージを表示しない
              // showStatus('ファイルシステムから最新の変数設定を読み込みました');
            } catch (saveError) {
              console.error('JSON保存エラー:', saveError);
              showStatus('設定を読み込みましたが、JSON保存に失敗しました', false);
            }
          } else if (savedVariables) {
            // JSONにデータがある場合
            console.log('JSONから読み込んだ変数設定を適用します');
            setVariables(savedVariables);
            // オリジナル値として保存
            originalVariables.current = JSON.parse(JSON.stringify(savedVariables));
            // showStatus('変数設定を読み込みました');
          } else {
            console.log('JSONに変数設定が存在しないため、デフォルト値を使用します');

            // デフォルト値を保持
            const defaultSettings = {
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

            setVariables(defaultSettings);
            // オリジナル値として保存
            originalVariables.current = JSON.parse(JSON.stringify(defaultSettings));

            // JSONに保存
            try {
              await projectDataStore.saveProjectData(activeProject.id, 'variableSettings', defaultSettings);
            } catch (saveError) {
              console.error('デフォルト設定の保存に失敗:', saveError);
            }

            // ファイルシステムにも反映
            if (isElectronContext && activeProject.path) {
              try {
                await saveVariablesToFile(defaultSettings);
              } catch (saveError) {
                console.error('ファイルシステムへの保存に失敗:', saveError);
              }
            }

            showStatus('デフォルトの変数設定を作成しました');
          }

          setIsInitialized(true);
          setIsSaved(true);
          setHasChanges(false);

          // 初期化完了フラグを設定
          initialRender.current = false;
          initialLoadComplete.current = true;
        } catch (error) {
          console.error('変数設定読み込みエラー:', error);
          showStatus('設定の読み込み中にエラーが発生しました: ' + error.message, false);

          // エラー時にもデフォルト値を設定
          setVariables({
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
          });
          // オリジナル値として保存
          originalVariables.current = {
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
          setIsInitialized(true);
          setIsSaved(true);
          setHasChanges(false);
          initialRender.current = false;
          initialLoadComplete.current = true;
        } finally {
          setIsProcessing(false);
        }
      };

      loadVariableData();
    }
  }, [activeProject?.id, activeProject?.path]);

  // 変数ファイルを読み込む関数
  const loadVariablesFromFile = async () => {
    if (!isElectronContext || !activeProject || !activeProject.path) {
      console.log('Electron環境でないか、アクティブプロジェクトが設定されていません');
      return null;
    }

    try {
      const settingFilePath = pathHelper.join(activeProject.path, 'src', 'scss', 'globals', '_setting.scss');

      // ファイルが存在するか確認
      const exists = await window.api.fs.exists(settingFilePath);
      if (!exists.exists) {
        console.log('_setting.scssファイルが見つかりません:', settingFilePath);
        return null;
      }

      // ファイルからSCSSの内容を読み込み
      const fileResult = await window.api.fs.readFile(settingFilePath);

      if (!fileResult || !fileResult.success) {
        console.log('ファイル読み込みに失敗しました:', fileResult?.error || 'unknown error');
        return null;
      }

      const fileContent = fileResult.data;

      // 空のファイルや無効なデータをチェック
      if (!fileContent) {
        console.log('ファイルの内容が空です');
        return null;
      }

      console.log('ファイルから読み込んだSCSS内容:', typeof fileContent, fileContent.length || 0);

      // SCSS内容を解析して変数オブジェクトに変換
      return parseScssToVariables(fileContent);
    } catch (error) {
      console.error('ファイルからの変数読み込みエラー:', error);
      return null;
    }
  };

  // SCSS内容を変数オブジェクトに変換
  const parseScssToVariables = (scssContent) => {
    try {
      // デフォルト値の設定
      const result = {
        lInner: '1000',
        paddingPc: '25',
        paddingSp: '20',
        primaryColor: '#231815',
        secondaryColor: '#0076ad',
        accentColor: '#ff5722',
        customColors: []
      };

      // scssContentがオブジェクトの場合（JSON形式のデータなど）
      if (typeof scssContent === 'object' && scssContent !== null) {
        console.log('SCSSコンテンツがオブジェクト形式で渡されました:', scssContent);
        return scssContent; // そのまま返す
      }

      // scssContentが文字列でない場合
      if (typeof scssContent !== 'string') {
        console.log('SCSSコンテンツが無効な形式です:', typeof scssContent);
        return result; // デフォルト値を返す
      }

      // 正規表現でSCSSから変数を抽出
      const lines = scssContent.split('\n');

      for (const line of lines) {
        // インナー幅設定
        if (line.includes('$l-inner:')) {
          const match = line.match(/\$l-inner:\s*([\d.]+)rem/);
          if (match && match[1]) {
            result.lInner = (parseFloat(match[1]) * 16).toString(); // remをpxに変換
          }
        }
        else if (line.includes('$padding-pc:')) {
          const match = line.match(/\$padding-pc:\s*([\d.]+)rem/);
          if (match && match[1]) {
            result.paddingPc = (parseFloat(match[1]) * 16).toString(); // remをpxに変換
          }
        }
        else if (line.includes('$padding-sp:')) {
          const match = line.match(/\$padding-sp:\s*([\d.]+)rem/);
          if (match && match[1]) {
            result.paddingSp = (parseFloat(match[1]) * 16).toString(); // remをpxに変換
          }
        }
        // カラー設定
        else if (line.includes('$primary-color:')) {
          const match = line.match(/\$primary-color:\s*(#[0-9a-fA-F]{3,6})/);
          if (match && match[1]) {
            result.primaryColor = match[1];
            // customColorsにも追加
            result.customColors.push({ name: '$primary-color', color: match[1] });
          }
        }
        else if (line.includes('$') && line.includes('#')) {
          // その他の色変数
          const match = line.match(/(\$[a-zA-Z0-9_-]+):\s*(#[0-9a-fA-F]{3,6})/);
          if (match && match[1] && match[2]) {
            const name = match[1];
            const color = match[2];

            // 主要な色以外をカスタム色として追加
            if (name !== '$primary-color' && !result.customColors.some(c => c.name === name)) {
              result.customColors.push({ name, color });
            }
          }
        }
      }

      return result;
    } catch (error) {
      console.error('SCSS解析エラー:', error);
      return {
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
    }
  };


  // 別のタブに移動する前に未保存の変更があれば警告
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChanges) {
        const message = '変更が保存されていません。このページを離れますか？';
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasChanges]);

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

  // 変数をSCSSに変換して保存する関数
  const saveVariablesToFile = async (data) => {
    if (!isElectronContext || !activeProject) {
      console.error('ファイルシステムへの保存ができない環境です');
      return false;
    }

    // activeProject.pathの検証
    if (!activeProject.path) {
      console.error('プロジェクトパスが設定されていません');
      return false;
    }

    if (typeof activeProject.path !== 'string') {
      console.error('プロジェクトパスが文字列ではありません:', typeof activeProject.path);
      console.error('プロジェクトパスの内容:', activeProject.path);
      return false;
    }

    // デバッグ情報：パス作成前のactiveProject.pathの内容を詳細に表示
    console.log('保存処理開始 - activeProject.path:', JSON.stringify(activeProject.path));
    console.log('activeProject.path の型:', typeof activeProject.path);
    console.log('activeProject.path の値:', activeProject.path);

    try {
      // パスを段階的に構築して検証
      const projectPath = activeProject.path.trim();
      console.log(`検証済みプロジェクトパス: ${projectPath}`);

      // src ディレクトリのパスを構築
      const srcDir = pathHelper.join(projectPath, 'src');
      console.log(`srcディレクトリパス: ${srcDir}`);

      // scss ディレクトリのパスを構築
      const scssDir = pathHelper.join(srcDir, 'scss');
      console.log(`scssディレクトリパス: ${scssDir}`);

      // global ディレクトリのパスを構築
      const globalDir = pathHelper.join(scssDir, "globals");
      console.log(`globalディレクトリパス: ${globalDir}`);

      try {
        await window.api.fs.mkdir(globalDir, { recursive: true });
      } catch (mkdirError) {
        console.error('ディレクトリ作成エラー:', mkdirError);
        return false;
      }

      // 変数をSCSS形式に変換
      const scssContent = generateScssContent(data);
      if (!scssContent) {
        console.error('SCSS生成に失敗しました');
        return false;
      }

      // ファイルパスを構築
      const settingFilePath = pathHelper.join(globalDir, '_setting.scss');
      console.log(`_setting.scssファイルに保存します: ${settingFilePath}`);

      const result = await window.api.fs.writeFile(settingFilePath, scssContent);

      if (!result || !result.success) {
        console.error('ファイル書き込みエラー:', result?.error || 'unknown error');
        return false;
      }

      console.log(`_setting.scssファイルを保存しました: ${settingFilePath}`);
      return true;
    } catch (error) {
      console.error('_setting.scss保存エラー:', error);
      return false;
    }
  };

  // 変数からSCSS形式の文字列を生成
  const generateScssContent = (data) => {
    // データ検証
    if (!data || typeof data !== 'object') {
      console.error('変数データが不正な形式です:', data);
      return null;
    }

    try {
      const toRem = (px) => {
        if (!px || isNaN(parseInt(px, 10))) {
          return '1rem'; // デフォルト値
        }
        return (parseInt(px, 10) / 16).toFixed(2) + 'rem';
      };

      let scss = '';

      // インナー幅設定
      scss += '// インナー幅設定\n';
      scss += `$l-inner: ${toRem(data.lInner)};\n`;
      scss += `$padding-pc: ${toRem(data.paddingPc)};\n`;
      scss += `$padding-sp: ${toRem(data.paddingSp)};\n\n`;

      // 色の指定
      scss += '// 色の指定\n';

      // カスタム色を追加
      if (Array.isArray(data.customColors) && data.customColors.length > 0) {
        data.customColors.forEach(item => {
          if (item && item.name && item.color) {
            scss += `${item.name}: ${item.color};\n`;
          }
        });
      } else {
        // デフォルト色の追加
        scss += `$primary-color: ${data.primaryColor || '#231815'};\n`;
        scss += `$blue: #408f95;\n`;
        scss += `$text-color: #000000;\n`;
      }

      return scss;
    } catch (error) {
      console.error('SCSS生成エラー:', error);
      return '// インナー幅設定\n$l-inner: 62.5rem;\n$padding-pc: 1.56rem;\n$padding-sp: 1.25rem;\n\n// 色の指定\n$primary-color: #231815;\n$blue: #408f95;\n$text-color: #000000;\n';
    }
  };

  // ステータスメッセージを表示する関数
  const showStatus = (message, isSuccess = true) => {
    setStatusMessage(message);
    setToast({
      show: true,
      message,
      type: isSuccess ? 'success' : 'error'
    });

    // 3秒後に非表示
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  // 保存処理
  const handleSave = async () => {
    if (!activeProject || !activeProject.id) {
      showStatus('プロジェクトが選択されていません', false);
      return;
    }

    setIsProcessing(true);
    showStatus('保存中...', false);

    try {
      // JSONに保存
      await projectDataStore.saveProjectData(activeProject.id, 'variableSettings', variables);

      // ファイルシステムにも保存
      if (isElectronContext && activeProject.path) {
        await saveVariablesToFile(variables);
      }

      // 保存後、現在の値を新しいオリジナルとして保存
      originalVariables.current = JSON.parse(JSON.stringify(variables));

      setIsSaved(true);
      setHasChanges(false);
      showStatus('変更を保存しました');

      console.log('変数設定を保存しました');
    } catch (error) {
      console.error('保存エラー:', error);
      showStatus('保存中にエラーが発生しました: ' + error.message, false);
    } finally {
      setIsProcessing(false);
    }
  };

  // 色の変更ハンドラ
  const handleColorChange = (index, value) => {
    const updatedColors = [...variables.customColors];
    updatedColors[index].color = value;
    setVariables({
      ...variables,
      customColors: updatedColors
    });
  };

  // 変数値を更新する関数
  const handleVariableChange = (name, value) => {
    setVariables({
      ...variables,
      [name]: value
    });
  };

  const addColor = () => {
    setVariables({ ...variables, customColors: [...variables.customColors, { name: '', color: '#000000' }] });
  };

  // 色の削除ハンドラ
  const removeColor = (index) => {
    const updatedColors = variables.customColors.filter((_, i) => i !== index);
    setVariables({ ...variables, customColors: updatedColors });
  };

  // 画像の選択とアップロード
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // ファイルサイズのチェック（4MB）
    const maxSize = 4 * 1024 * 1024; // 4MB in bytes
    if (file.size > maxSize) {
      alert(`画像サイズが大きすぎます（${(file.size / (1024 * 1024)).toFixed(2)}MB）。4MB以下の画像を選択してください。`);
      return;
    }

    // ファイル形式のチェック
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('JPG、PNG、またはWEBP形式の画像ファイルを選択してください。');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const image = event.target.result;

        // 画像をリサイズして処理を軽くする（この処理中はローディングを表示しない）
        const resizedImage = await resizeImage(image, 1920);

        // 画像を表示
        setDesignImage(resizedImage);

        // 「デザインカンプから色を抽出」セクションまでスクロール
        const extractSections = document.querySelectorAll('.group-title');
        let extractSection = null;

        // テキスト内容に基づいて正確な要素を探す
        for (const section of extractSections) {
          if (section.textContent === 'デザインカンプから色を抽出') {
            extractSection = section;
            break;
          }
        }

        if (extractSection) {
          // 要素の位置を取得
          const rect = extractSection.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

          // 30pxのスペースを空けてスクロール
          window.scrollTo({
            top: rect.top + scrollTop - 30,
            behavior: 'smooth'
          });
        }

        // 色の抽出処理を開始
        await extractColorsFromImage(resizedImage);

      } catch (error) {
        console.error('画像処理エラー:', error);
        let errorMessage = '画像の処理中にエラーが発生しました。';

        if (error.message.includes('サイズが大きすぎます')) {
          errorMessage = '画像サイズが制限を超えています。6MB以下の画像を選択してください。';
        } else if (error.message.includes('形式が不正です')) {
          errorMessage = 'サポートされていない画像形式です。JPG、PNG、またはWEBP形式の画像を選択してください。';
        } else if (error.message.includes('読み込みエラー')) {
          errorMessage = '画像の読み込みに失敗しました。画像が破損している可能性があります。';
        }

        alert(errorMessage);
      }
    };

    reader.onerror = () => {
      alert('画像の読み込みに失敗しました。もう一度お試しください。');
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

          // 画像を描画（高品質設定）
          ctx.drawImage(img, 0, 0, newWidth, newHeight);

          // 画質の調整と最適化のループ
          let quality = 0.95; // 画質を0.92から0.95に向上
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

            // 品質を下げて再試行（より緩やかに）
            quality -= 0.05; // 0.1から0.05に変更してより緩やかに
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
    return new Promise((resolve, reject) => {
      try {
        // 処理開始時にローディング状態を設定
        setIsProcessing(true);

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // キャンバスサイズを画像サイズに合わせる
          canvas.width = img.width;
          canvas.height = img.height;

          // 高品質な描画設定
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // 画像を描画
          ctx.drawImage(img, 0, 0);

          // ピクセルデータを取得
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

          // 色の出現回数を記録
          const colorMap = new Map();
          const minOccurrence = (canvas.width * canvas.height) * 0.0005; // 0.05%以上の出現で有意とする

          // より細かいサンプリング（1ピクセルごと）
          for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            const a = imageData[i + 3];

            // 完全な透明は無視
            if (a === 0) continue;

            // RGBを16進数に変換
            const color = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;

            // 出現回数をカウント
            colorMap.set(color, (colorMap.get(color) || 0) + 1);
          }

          // 色の類似性を考慮した結合
          const mergedColors = new Map();
          const processedColors = new Set();

          for (const [color1, count1] of colorMap.entries()) {
            if (processedColors.has(color1)) continue;

            let totalCount = count1;
            let weightedR = parseInt(color1.slice(1, 3), 16) * count1;
            let weightedG = parseInt(color1.slice(3, 5), 16) * count1;
            let weightedB = parseInt(color1.slice(5, 7), 16) * count1;

            // 類似色の結合
            for (const [color2, count2] of colorMap.entries()) {
              if (color1 === color2 || processedColors.has(color2)) continue;

              const r1 = parseInt(color1.slice(1, 3), 16);
              const g1 = parseInt(color1.slice(3, 5), 16);
              const b1 = parseInt(color1.slice(5, 7), 16);
              const r2 = parseInt(color2.slice(1, 3), 16);
              const g2 = parseInt(color2.slice(3, 5), 16);
              const b2 = parseInt(color2.slice(5, 7), 16);

              // 色の距離を計算（ユークリッド距離）
              const distance = Math.sqrt(
                Math.pow(r1 - r2, 2) +
                Math.pow(g1 - g2, 2) +
                Math.pow(b1 - b2, 2)
              );

              // 近い色を結合（しきい値を調整：より厳密に）
              if (distance < 15) {
                totalCount += count2;
                weightedR += r2 * count2;
                weightedG += g2 * count2;
                weightedB += b2 * count2;
                processedColors.add(color2);
              }
            }

            // 加重平均で新しい色を計算
            const avgR = Math.round(weightedR / totalCount);
            const avgG = Math.round(weightedG / totalCount);
            const avgB = Math.round(weightedB / totalCount);
            const mergedColor = `#${((1 << 24) + (avgR << 16) + (avgG << 8) + avgB).toString(16).slice(1).toUpperCase()}`;

            mergedColors.set(mergedColor, totalCount);
            processedColors.add(color1);
          }

          // 出現頻度でソートし、上位の色を抽出
          const sortedColors = Array.from(mergedColors.entries())
            .filter(([_, count]) => count > minOccurrence)
            .sort((a, b) => b[1] - a[1])
            .map(([color, _]) => color);

          // 重複を除去し、最大10色まで抽出
          const uniqueColors = Array.from(new Set(sortedColors)).slice(0, 10);

          // 色の役割を推測するための配列を初期化
          const colorRoles = [];

          // 色の役割を推測（明度、彩度、色相から判断）
          uniqueColors.forEach((color, index) => {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);

            // HSL変換
            const [h, s, l] = rgbToHsl(r, g, b);

            // 色の特徴を分析
            const isGray = s < 0.1;
            const isWhite = l > 0.9;
            const isBlack = l < 0.1;

            // 色相に基づく色名の決定
            let colorName = '';
            if (!isGray && !isWhite && !isBlack) {
              if (h < 0.035 || h > 0.965) colorName = 'red';
              else if (h < 0.075) colorName = 'orange';
              else if (h < 0.12) colorName = 'yellow';
              else if (h < 0.35) colorName = 'green';
              else if (h < 0.5) colorName = 'cyan';
              else if (h < 0.65) colorName = 'blue';
              else if (h < 0.75) colorName = 'purple';
              else if (h < 0.97) colorName = 'pink';
            }

            // 明度による修飾子
            const brightness = l < 0.3 ? 'dark' : l > 0.7 ? 'light' : '';

            // 彩度による修飾子
            const saturation = s > 0.8 ? 'vivid' : s < 0.3 ? 'dull' : '';

            // 一般的な変数名の割り当て
            if (index === 0) {
              colorRoles.push({
                name: '$primary-color',
                color: color,
                description: '主要な色、ブランドカラーとして使用'
              });
              return;
            } else if (index === 1 && l > 0.85) {
              colorRoles.push({
                name: '$background-color',
                color: color,
                description: '背景色として使用'
              });
              return;
            } else if (s > 0.7 && index <= 2) {
              colorRoles.push({
                name: '$accent-color',
                color: color,
                description: 'アクセント、強調として使用'
              });
              return;
            } else if (l < 0.3 && index <= 2) {
              colorRoles.push({
                name: '$text-color',
                color: color,
                description: 'テキストや重要な要素に使用'
              });
              return;
            }

            // その他の色は特徴に基づいて命名
            let name = '';
            if (isGray) {
              name = `$gray-${l < 0.5 ? 'dark' : 'light'}`;
            } else if (isWhite) {
              name = '$white';
            } else if (isBlack) {
              name = '$black';
            } else {
              // 色名に明度と彩度の修飾子を追加
              const modifiers = [brightness, saturation].filter(m => m).join('-');
              name = `$${modifiers ? `${modifiers}-` : ''}${colorName}`;
            }

            // 同じ名前の変数が既に存在する場合は連番を付加
            const existingNames = colorRoles.map(c => c.name);
            if (existingNames.includes(name)) {
              let counter = 2;
              while (existingNames.includes(`${name}-${counter}`)) {
                counter++;
              }
              name = `${name}-${counter}`;
            }

            // 色の役割や特徴を説明に追加
            let description = '';
            if (isGray) {
              description = `グレースケール、${l < 0.5 ? '暗め' : '明るめ'}の色調`;
            } else if (isWhite) {
              description = '白色、背景やハイライトに使用';
            } else if (isBlack) {
              description = '黒色、テキストや強調に使用';
            } else {
              const traits = [];
              if (brightness) traits.push(brightness === 'dark' ? '暗め' : '明るめ');
              if (saturation) traits.push(saturation === 'vivid' ? '鮮やか' : '落ち着いた');
              traits.push(colorName === 'red' ? '赤' :
                colorName === 'orange' ? 'オレンジ' :
                  colorName === 'yellow' ? '黄' :
                    colorName === 'green' ? '緑' :
                      colorName === 'cyan' ? '水色' :
                        colorName === 'blue' ? '青' :
                          colorName === 'purple' ? '紫' :
                            colorName === 'pink' ? 'ピンク' : '');
              description = `${traits.join('、')}の色調`;
            }

            colorRoles.push({
              name,
              color,
              description
            });
          });

          // データ表示前に少し遅延を入れて完了ステージを見せる
          setTimeout(() => {
            setExtractedColors(colorRoles);
            setIsProcessing(false); // 処理完了時にローディングを解除

            // 処理完了後のスクロール処理
            setTimeout(() => {
              const hoverInstruction = document.querySelector('.hover-instruction');
              if (hoverInstruction) {
                const rect = hoverInstruction.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                window.scrollTo({
                  top: rect.top + scrollTop - 30,
                  behavior: 'smooth'
                });
              }
            }, 500);

            resolve(colorRoles);
          }, 1000);
        };

        img.onerror = () => {
          setIsProcessing(false); // エラー時にもローディングを解除
          reject(new Error('画像の読み込みに失敗しました'));
        };

        img.src = base64Image;
      } catch (error) {
        setIsProcessing(false); // エラー時にもローディングを解除
        reject(error);
      }
    });
  };

  // RGB to HSL変換ヘルパー関数
  const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }

      h /= 6;
    }

    return [h, s, l];
  };

  // 抽出した色を変数に適用
  const applyExtractedColors = () => {
    console.log('Applying extracted colors:', extractedColors);
    if (extractedColors.length === 0) {
      return;
    }

    // 既存の変数に新しい色を適用
    const newCustomColors = [...variables.customColors];

    // 重複カラーを追跡する変数
    let duplicateCount = 0;
    let addedCount = 0;
    let updatedCount = 0;

    // 既に処理した色を記録するセット
    const processedColors = new Set();

    // 抽出した色を処理
    extractedColors.forEach(ec => {
      // 同名の変数が存在するかチェック
      const existingIndex = newCustomColors.findIndex(c => c.name === ec.name);
      const hasSameNameVariable = existingIndex !== -1;

      // 同名の変数が存在し、値が変更された場合は更新
      if (hasSameNameVariable) {
        const existingColor = newCustomColors[existingIndex].color.toLowerCase();
        const newColor = ec.color.toLowerCase();

        // 色が変わる場合のみ更新としてカウント
        if (existingColor !== newColor) {
          newCustomColors[existingIndex].color = ec.color;
          updatedCount++;
          console.log(`既存の変数を更新: ${ec.name} = ${ec.color}`);
        } else {
          console.log(`既存の変数と同じ色のため更新せず: ${ec.name} = ${ec.color}`);
        }

        // 処理済みとしてマーク
        processedColors.add(ec.color.toLowerCase());
        return; // 同名の変数が見つかった場合は次の処理へ
      }

      // 同じカラーコード（大文字小文字区別なし）が存在するかチェック
      const hasSameColorCode = newCustomColors.some(c =>
        c.color.toLowerCase() === ec.color.toLowerCase() &&
        !processedColors.has(ec.color.toLowerCase())
      );

      if (hasSameColorCode) {
        // 重複としてカウント
        duplicateCount++;
        console.log(`重複する色を検出: ${ec.color}`);
      } else {
        // 新規追加
        newCustomColors.push({
          name: ec.name,
          color: ec.color
        });
        addedCount++;
        console.log(`新しい変数を追加: ${ec.name} = ${ec.color}`);
      }

      // 処理済みとしてマーク
      processedColors.add(ec.color.toLowerCase());
    });

    // 変数を更新
    setVariables({
      ...variables,
      customColors: newCustomColors
    });

    console.log('新しいカスタムカラー:', newCustomColors);

    // 結果に基づいてメッセージを生成
    let message = '';
    if (addedCount > 0 && updatedCount > 0 && duplicateCount > 0) {
      message = `${addedCount}色を追加、${updatedCount}色を更新しました。${duplicateCount}色は重複のため追加されませんでした。`;
    } else if (addedCount > 0 && updatedCount > 0) {
      message = `${addedCount}色を追加、${updatedCount}色を更新しました。`;
    } else if (addedCount > 0 && duplicateCount > 0) {
      message = `${addedCount}色を追加しました。${duplicateCount}色は重複のため追加されませんでした。`;
    } else if (updatedCount > 0 && duplicateCount > 0) {
      message = `${updatedCount}色を更新しました。${duplicateCount}色は重複のため追加されませんでした。`;
    } else if (addedCount > 0) {
      message = `${addedCount}色を追加しました。`;
    } else if (updatedCount > 0) {
      message = `${updatedCount}色を更新しました。`;
    } else if (duplicateCount > 0) {
      message = `${duplicateCount}色は重複のため追加されませんでした。`;
    } else {
      message = '変更はありませんでした。';
    }

    // 何も変更がない場合のメッセージ
    if (addedCount === 0 && updatedCount === 0 && duplicateCount === 0) {
      message = '色の変更はありませんでした。';
    }

    // トースト通知を表示
    showToast(`${message}「変更を保存」で確定してください。`, 'success');
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

    // 色選択ポップアップが表示されている場合は処理しない
    if (showColorPopup) return;

    // ホバー状態をアクティブに
    setIsHovering(true);

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
    const zoom = 6;

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

      // 拡大する範囲の左上座標を計算（ポインタの位置を中心に）
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

      // 縦線（少なめに表示）
      for (let x = 0; x <= size; x += zoom * 2) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }

      // 横線（少なめに表示）
      for (let y = 0; y <= size; y += zoom * 2) {
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
    const popupHeight = 320; // 高さを少し小さく調整
    const padding = 15;

    // ウィンドウサイズを取得
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // 右端のチェック
    let adjustedX = x;
    if (x + popupWidth + padding > windowWidth) {
      adjustedX = x - popupWidth - padding; // 左側に表示

      // 左側にも入らない場合は右端ギリギリに配置
      if (adjustedX < padding) {
        adjustedX = windowWidth - popupWidth - padding;
      }
    }

    // 下端のチェック
    let adjustedY = y + 10; // 少し下にずらす
    if (adjustedY + popupHeight + padding > windowHeight) {
      adjustedY = y - popupHeight - 10; // ポップアップを上に表示

      // 上側にも入らない場合は下端ギリギリに配置
      if (adjustedY < padding) {
        adjustedY = windowHeight - popupHeight - padding;
      }
    }

    // マイナスにならないように調整
    adjustedX = Math.max(padding, adjustedX);
    adjustedY = Math.max(padding, adjustedY);

    return { x: adjustedX, y: adjustedY };
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

      // 赤系のカラーテーマを統一
      let bgColor, iconBgColor, boxShadowColor, borderColor, iconPath;

      // タイプに関わらず赤系デザインを適用
      bgColor = 'linear-gradient(135deg, rgba(220, 53, 69, 0.97), rgba(178, 43, 56, 0.95))';
      iconBgColor = 'rgba(220, 53, 69, 0.95)';
      boxShadowColor = 'rgba(220, 53, 69, 0.6)';
      borderColor = 'rgba(255, 100, 100, 0.25)';

      // タイプによってアイコンのみ変更
      if (type === 'success') {
        iconPath = '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="white"/>';
      } else if (type === 'warning' || type === 'error') {
        iconPath = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="white"/>';
      } else {
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

  // ホバー情報を表示するJSX部分
  const renderHoverUI = () => {
    if (!isHovering || !hoverColor || !mousePosition) return null;

    // マグニファイアの位置計算
    // マウス位置によって左右の位置を調整
    const magnifierPosition = {
      left: mousePosition.x < imageContainerRef.current?.clientWidth / 2 ? '10px' : 'auto',
      right: mousePosition.x >= imageContainerRef.current?.clientWidth / 2 ? '10px' : 'auto',
      top: '10px'
    };

    return (
      <>
        {/* 色情報ツールチップ */}
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

        {/* マグニファイア（拡大鏡） */}
        <div
          className="magnifier-container"
          style={magnifierPosition}
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
      </>
    );
  };

  // 画像関連状態のリセット関数
  const resetImageUpload = () => {
    setDesignImage(null);
    setIsProcessing(false);
    setExtractedColors([]);
    setHoverColor(null);
    setIsHovering(false);
    setShowColorPopup(false);
    setSelectedColorPosition(null);

    // キャンバスもクリア
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // ファイル入力もリセット
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    // トースト通知を表示
    showToast('画像と抽出した色をリセットしました', 'info');
  };

  // 色を全て削除する関数
  const removeAllColors = () => {
    // 確認ダイアログ
    if (variables.customColors.length === 0) {
      showToast('削除する色がありません', 'info');
      return;
    }

    if (window.confirm('全ての色設定を削除してもよろしいですか？この操作は元に戻せません。')) {
      setVariables({
        ...variables,
        customColors: []
      });
      showToast('全ての色設定を削除しました', 'info');
    }
  };

  return (
    <div className="variable-config">
      <Header title="変数設定" subtitle="CSSやSCSSで使用する変数を設定します" />

      <div className="content-wrapper">
        <h1 className="page-title">変数設定</h1>

        <div className="variable-form">
          {/* ベーシック設定フォームグループ */}
          <div className="form-group">
            <h2 className="group-title">ベーシック設定</h2>

            {/* lInner設定 */}
            <div className="input-row">
              <label className="input-label" htmlFor="lInner">最大コンテンツ幅:</label>
              <input
                id="lInner"
                className="input-field"
                type="number"
                value={variables.lInner}
                onChange={(e) => handleVariableChange('lInner', e.target.value)}
              />
              <span className="input-description">コンテンツの最大幅をピクセル単位で指定します。PCでの表示幅に影響します。</span>
            </div>

            {/* PC用パディング設定 */}
            <div className="input-row">
              <label className="input-label" htmlFor="paddingPc">PC用左右パディング:</label>
              <input
                id="paddingPc"
                className="input-field"
                type="number"
                value={variables.paddingPc}
                onChange={(e) => handleVariableChange('paddingPc', e.target.value)}
              />
              <span className="input-description">PC表示時の左右パディングをピクセル単位で指定します。</span>
            </div>

            {/* SP用パディング設定 */}
            <div className="input-row">
              <label className="input-label" htmlFor="paddingSp">SP用左右パディング:</label>
              <input
                id="paddingSp"
                className="input-field"
                type="number"
                value={variables.paddingSp}
                onChange={(e) => handleVariableChange('paddingSp', e.target.value)}
              />
              <span className="input-description">スマホ表示時の左右パディングをピクセル単位で指定します。</span>
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
                  <div className="upload-icon">📤</div>
                  <h4>デザインカンプ画像をアップロード</h4>
                  <p>クリックまたはドラッグ＆ドロップ</p>

                  <div className="input-description">
                    高品質な画像をアップロードすることで色を自動抽出します
                    <div className="hint">
                      4MB未満の画像は圧縮せずに解析され、より正確な色抽出が可能です
                    </div>
                  </div>

                  <div className="extraction-tips">
                    <div className="tips-layout">
                      <div className="tip">
                        <span className="tip-icon">⚠️</span>
                        <div className="tip-content">
                          <strong>高解像度で鮮明な画像を使用する</strong>
                          <p>解像度が高く、鮮明な画像ほど正確な色を抽出できます</p>
                        </div>
                      </div>
                      <div className="tip">
                        <span className="tip-icon">⚠️</span>
                        <div className="tip-content">
                          <strong>低解像度の画像は避ける</strong>
                          <p>画質の低い画像は色のブレンドが発生し、誤った色が抽出される場合があります</p>
                        </div>
                      </div>
                      <div className="tip">
                        <span className="tip-icon">⚠️</span>
                        <div className="tip-content">
                          <strong>img画像は「絶対」含めない</strong>
                          <p>img画像の色も取得してしまうため、色を抽出したい画像には含めないでください</p>
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
                    style={{ position: 'relative' }}
                  >
                    <img
                      ref={imageRef}
                      src={designImage}
                      alt="Design Preview"
                      className={`preview-image ${isProcessing ? 'processing' : ''}`}
                      onClick={handleImageClick}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                      style={{ width: '100%', display: 'block', position: 'relative' }}
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
                        {/* AI処理中のオーバーレイコンテンツ */}
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
                          transform: 'translateZ(0)',
                          willChange: 'transform'
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
                                transform: 'translateZ(0)',
                                willChange: 'transform',
                              }} />
                            ))}
                          </div>

                          {/* AI処理中の表示コンテンツ */}
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

                          {/* ステータス表示 */}
                          <div className="processing-time" style={{
                            fontSize: '12px',
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontFamily: 'monospace',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            padding: '3px 8px',
                            borderRadius: '10px'
                          }}>経過時間: 0秒</div>
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

                    {renderHoverUI()}
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

            {/* 画像があり、かつプロセス中でない場合に表示するリセットボタン */}
            {designImage && !isProcessing && extractedColors.length > 0 && (
              <div className="buttons-container">
                <button
                  type="button"
                  onClick={resetImageUpload}
                  className="action-button reset-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C15.3019 3 18.1885 4.77814 19.7545 7.42909" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M21 3V9H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  新しい画像をアップロード
                </button>

                <button
                  type="button"
                  className="action-button apply-button"
                  onClick={applyExtractedColors}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  抽出した色を適用
                </button>
              </div>
            )}

            {/* 画像があり、色が抽出されていない場合のリセットボタン */}
            {designImage && !isProcessing && extractedColors.length === 0 && (
              <button
                type="button"
                onClick={resetImageUpload}
                className="action-button reset-button full-width"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C15.3019 3 18.1885 4.77814 19.7545 7.42909" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21 3V9H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                新しい画像をアップロード
              </button>
            )}
          </div>

          {/* 色設定 */}
          <div className="form-group color-settings">
            <h3 className="group-title">色設定</h3>
            <div className="color-settings-header">
              <span className="color-count">登録色: {variables.customColors.length}色</span>
              <button type="button" onClick={removeAllColors} className="delete-all-button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                全ての色を削除
              </button>
            </div>
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
          <div className="save-button-container">
            <button
              type="button"
              onClick={handleSave}
              className="save-button"
              disabled={isProcessing || isSaved}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              変更を保存
            </button>
            {!isSaved && (
              <div className="unsaved-changes-indicator">
                未保存の変更があります
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default VariableConfig;
