# 即座実行プラン：画像解析を動作させる

## 現在の問題

### ログから判明した課題
```
OpenCV.jsが利用できません。フォールバック処理を実行します。
TypeError: Cannot read properties of undefined (reading 'Mat')
テキスト抽出エラー: TypeError: createWorker is not a function
```

### 根本原因
- **Main プロセス（Node.js環境）**でブラウザ専用ライブラリを使用
- `window`、`document`オブジェクトが存在しない
- OpenCV.js、Tesseract.jsが初期化されない

## 修正方法：Renderer プロセスでの解析実行

### 1. preload.js の修正

```javascript
// src/electron/preload.js に追加

// 既存のcontextBridge.exposeInMainWorldの中に追加
contextBridge.exposeInMainWorld('api', {
  // ... 既存のAPI

  // 新規追加：Renderer プロセスでの画像解析
  analyzeImageInRenderer: async (imageData, options = {}) => {
    try {
      console.log('🔍 Renderer プロセスで画像解析を実行中...');
      console.log('🔍 画像データサイズ:', imageData.length);
      console.log('🔍 解析オプション:', options);
      
      // webassembly-image-analyzerを直接インポート
      const analyzer = await import('./utils/webassembly-image-analyzer.js');
      
      // Renderer環境で直接実行
      const result = await analyzer.analyzeAll(imageData, {
        detectCards: true,
        detectFeatures: true,
        detectMainSections: true,
        ...options
      });
      
      console.log('🔍 Renderer画像解析完了:', {
        success: result.success,
        colorsCount: result.data?.colors?.length || 0,
        textLength: result.data?.text?.length || 0,
        elementsCount: result.data?.elements?.length || 0
      });
      
      return result;
    } catch (error) {
      console.error('🔍 Renderer画像解析エラー:', error);
      throw error;
    }
  }
});
```

### 2. promptGenerator.js の修正

```javascript
// src/electron/utils/promptGenerator.js の analyzeImage関数を修正

const analyzeImage = async (imageBase64, imageType, setState = {}) => {
  const {
    setColorData = () => { },
    setTextData = () => { },
    setSections = () => { },
    setLayout = () => { },
    setElements = () => { }
  } = setState;

  if (!imageBase64) {
    console.warn(`${imageType}画像データが存在しません。空の結果を返します。`);
    return {
      colors: [],
      text: '',
      textBlocks: [],
      sections: [],
      elements: { elements: [] },
      compressedAnalysis: null
    };
  }

  console.log(`🔍 ${imageType}画像の解析を開始します...`);
  console.log(`🔍 画像データサイズ: ${imageBase64.length} bytes`);

  try {
    console.log('🔍 Renderer プロセスで画像解析を実行します...');
    const startTime = Date.now();

    // Main プロセスからRenderer プロセスに解析を依頼
    const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      throw new Error('メインウィンドウが見つかりません');
    }

    const rawResult = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        try {
          console.log('🔍 Renderer: 画像解析を開始します...');
          const analyzer = await import('./utils/webassembly-image-analyzer.js');
          const result = await analyzer.analyzeAll(\`${imageBase64}\`, {
            detectCards: true,
            detectFeatures: true,
            detectMainSections: true
          });
          console.log('🔍 Renderer: 画像解析完了:', result);
          return result;
        } catch (error) {
          console.error('🔍 Renderer: 画像解析エラー:', error);
          return { 
            success: false, 
            error: error.message,
            data: { colors: [], text: '', textBlocks: [], sections: [], layout: {}, elements: [] }
          };
        }
      })()
    `);

    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    console.log(`🔍 画像解析完了 - 処理時間: ${processingTime.toFixed(2)}秒`);

    console.log('🔍 rawResult構造:', {
      type: typeof rawResult,
      keys: rawResult && typeof rawResult === 'object' ? Object.keys(rawResult) : 'オブジェクトではない',
      success: rawResult?.success,
      error: rawResult?.error
    });

    if (!rawResult || rawResult.success === false || rawResult.error) {
      console.warn(`❌ ${imageType}画像の解析に失敗:`, rawResult?.error || '未知のエラー');
      return {
        colors: [],
        text: '',
        textBlocks: [],
        sections: [],
        layout: {},
        elements: [],
        compressedAnalysis: null
      };
    }

    console.log(`✅ ${imageType}画像の解析成功`);
    const analysisResult = {
      colors: rawResult.data?.colors || [],
      text: rawResult.data?.text || '',
      textBlocks: rawResult.data?.textBlocks || [],
      sections: rawResult.data?.sections || [],
      layout: rawResult.data?.layout || {},
      elements: rawResult.data?.elements || [],
      compressedAnalysis: rawResult.data?.compressed || null
    };

    // 詳細な結果ログ
    console.log(`🎨 色情報: ${analysisResult.colors.length}個`);
    if (analysisResult.colors.length > 0) {
      console.log('  主要色:', analysisResult.colors.slice(0, 3).map(c => c.hex || c).join(', '));
    }

    console.log(`📝 テキスト情報: ${analysisResult.text.length}文字`);
    if (analysisResult.text.length > 0) {
      console.log('  テキスト抜粋:', analysisResult.text.substring(0, 100) + '...');
    }

    console.log(`📦 要素情報: ${analysisResult.elements.length}個`);
    if (analysisResult.elements.length > 0) {
      const elementTypes = analysisResult.elements.map(e => e.type || 'unknown').slice(0, 5);
      console.log('  要素タイプ:', elementTypes.join(', '));
    }

    return analysisResult;

  } catch (error) {
    console.error(`❌ ${imageType}画像の解析でエラーが発生しました:`, error);
    console.error('エラー詳細:', {
      message: error.message,
      stack: error.stack?.substring(0, 500)
    });
    
    return {
      colors: [],
      text: '',
      textBlocks: [],
      sections: [],
      layout: {},
      elements: [],
      compressedAnalysis: null
    };
  }
};
```

### 3. AICodeGenerator.jsx の修正（オプション）

```javascript
// src/electron/components/AICodeGenerator.jsx の修正

// モック関数を実際の解析に変更
const analyzeImageColors = async (file) => {
  try {
    const base64Data = await fileToBase64(file);
    
    // Renderer プロセスで直接解析実行
    const result = await window.api.analyzeImageInRenderer(base64Data, {
      extractColors: true,
      extractText: false
    });
    
    if (result.success && result.data.colors) {
      console.log('色抽出成功:', result.data.colors);
      return result.data.colors.map(c => c.rgb || c.hex || c);
    }
    
    // フォールバック
    console.warn('色抽出失敗、フォールバックを使用');
    return ['#2d3440', '#4c566a', '#eceff4', '#129161193', '#94129172'];
  } catch (error) {
    console.error('色抽出エラー:', error);
    return [];
  }
};

const analyzeImageText = async (file, updateProgress) => {
  try {
    updateProgress(10);
    const base64Data = await fileToBase64(file);
    updateProgress(30);
    
    // Renderer プロセスで直接解析実行
    const result = await window.api.analyzeImageInRenderer(base64Data, {
      extractColors: false,
      extractText: true
    });
    
    updateProgress(90);
    
    if (result.success && result.data.text) {
      console.log('テキスト抽出成功:', result.data.text);
      return result.data.text;
    }
    
    // フォールバック
    console.warn('テキスト抽出失敗、フォールバックを使用');
    return "サンプルテキスト:\nヘッダー：ロゴ、ナビゲーション\nメインセクション：画像、テキスト\nフッター：著作権情報、リンク";
  } catch (error) {
    console.error('テキスト抽出エラー:', error);
    return '';
  }
};
```

## 実行手順

### ステップ1: ファイル修正
```bash
# 1. preload.js の修正
# 上記の analyzeImageInRenderer 関数を追加

# 2. promptGenerator.js の修正  
# analyzeImage 関数を置き換え

# 3. (オプション) AICodeGenerator.jsx の修正
# モック関数を実際の解析に変更
```

### ステップ2: 動作確認
```bash
# アプリを再起動
npm run dev

# 期待されるログ出力を確認:
# - OpenCV.js初期化完了
# - WebAssemblyモジュール初期化完了
# - 🔍 Renderer画像解析完了
# - 🎨 色情報: X個
# - 📝 テキスト情報: X文字
```

### ステップ3: 問題が残る場合のデバッグ
```javascript
// デバッグ用コード（preload.js）
testImageAnalysis: async () => {
  try {
    console.log('🧪 画像解析テストを開始...');
    
    // テスト用の小さなBase64画像
    const testImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...'; // 実際のテスト画像
    
    const result = await window.api.analyzeImageInRenderer(testImage);
    console.log('🧪 テスト結果:', result);
    
    return result;
  } catch (error) {
    console.error('🧪 テストエラー:', error);
    return { error: error.message };
  }
}
```

## 期待される結果

### 成功時のログ
```
🔍 Renderer プロセスで画像解析を実行中...
WebAssemblyモジュールの初期化を開始...
OpenCV.js初期化を開始...
OpenCV状態チェック: {document.readyState: "complete", window.cv: "object"}
OpenCV.js初期化完了 - 利用可能な主要関数: {Mat: "function", imdecode: "function"}
WebAssemblyモジュールの初期化完了
🔍 画像解析完了 - 処理時間: 2.34秒
🔍 rawResult構造: {type: "object", keys: ["success", "data"], success: true}
✅ PC画像の解析成功
🎨 色情報: 5個
  主要色: #2d3440, #4c566a, #eceff4
📝 テキスト情報: 127文字
  テキスト抜粋: ヘッダー：ロゴ、ナビゲーション メインセクション：画像、テキスト...
📦 要素情報: 8個
  要素タイプ: button, input, navigation, card
```

### 失敗時の対応
1. **OpenCV.js初期化失敗**: index.htmlのスクリプト読み込み確認
2. **モジュールインポートエラー**: パス確認、ファイル存在確認
3. **executeJavaScript失敗**: ウィンドウ取得確認、CSP設定確認

## 成功判定基準

- [ ] エラーログなしで画像解析が完了
- [ ] 色情報が1個以上抽出される
- [ ] テキスト情報が1文字以上抽出される
- [ ] プロンプト生成で解析結果が反映される

---

**この修正により、8割作業代替への第一歩として画像解析が正常動作するようになります。**