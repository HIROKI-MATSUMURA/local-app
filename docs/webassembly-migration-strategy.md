# WebAssembly 移行戦略

## 1. 概要

この文書は、現在の Python ベースの画像解析機能を WebAssembly/JavaScript ベースの実装に移行するための詳細な戦略を提供します。移行の主な目的は、環境依存性の問題を解決し、クロスプラットフォーム互換性を向上させることです。本戦略では、段階的なアプローチを採用し、既存の機能を維持しながら新しい技術スタックへと移行します。

## 2. 現状分析

### 2.1 現在の技術スタック

- **フロントエンド**: Electron + React
- **バックエンド処理**: Python
  - OpenCV: 画像処理と分析
  - numpy: 数値計算
  - PIL: 画像操作
  - pytesseract/EasyOCR: OCR処理
  - scikit-learn: 機械学習（クラスタリングなど）
- **通信レイヤー**: Python Bridge (IPC)

### 2.2 現状の問題点

1. **環境依存性**:
   - Python 環境のセットアップと依存関係の管理が複雑
   - 異なる Python バージョン間の互換性問題
   - OS ごとの環境差異

2. **アーキテクチャ互換性**:
   - x86_64 と arm64 アーキテクチャ間の互換性問題
   - ネイティブバイナリの問題

3. **パフォーマンス**:
   - プロセス間通信 (IPC) によるオーバーヘッド
   - Python 起動時間の遅延

4. **拡張性の限界**:
   - 機能追加時の依存関係管理の複雑化
   - 異なる環境での動作保証の困難さ

## 3. 目標技術スタック

### 3.1 主要コンポーネント

- **画像処理**: OpenCV.js
- **OCR 処理**: Tesseract.js
- **高性能処理**: Photon (WebAssembly)
- **並列処理**: Web Workers
- **UI**: 既存の Electron + React（変更なし）

### 3.2 移行後のアーキテクチャ

```
┌─────────────────────────────────────────────┐
│              Electron アプリケーション         │
│  ┌────────────┐      ┌───────────────────┐  │
│  │ React UI   │ ←→  │ JavaScript API     │  │
│  └────────────┘      └───────────────────┘  │
│                              │              │
│                      ┌───────┴──────┐       │
│  ┌────────────┐      │ WebAssembly  │       │
│  │ Web Workers│ ←→  │ モジュール     │       │
│  └────────────┘      └──────────────┘       │
└─────────────────────────────────────────────┘
```

## 4. 段階的移行計画

### フェーズ 1: 準備と基盤実装（1-2 週間）

#### 目標
- 既存 API インターフェースの詳細分析
- WebAssembly 基盤の構築
- 基本的な画像処理機能のテスト実装

#### タスク
1. 現在の Python API インターフェースの完全なマッピングを作成
2. OpenCV.js および Tesseract.js の基本セットアップ
3. 画像読み込みと基本的な処理のテスト実装
4. Web Worker のセットアップとテスト

### フェーズ 2: コア画像処理の移行（2-3 週間）

#### 目標
- 色彩分析機能の完全移行
- レイアウト分析の基本機能移行
- 既存 API との互換性確保

#### タスク
1. 色彩分析機能の OpenCV.js 実装
   - K-means クラスタリングのカスタム実装
   - 色抽出と役割推定ロジックの移植
2. 基本的なレイアウト分析機能の実装
   - エッジ検出
   - セクション境界の識別
3. 既存 API との互換アダプターの実装

### フェーズ 3: OCR 機能の移行（2-3 週間）

#### 目標
- Tesseract.js を使用した OCR 機能の完全移行
- テキスト解析と位置情報の抽出

#### タスク
1. Tesseract.js の本番環境への統合
2. 日本語・英語テキスト認識の実装と最適化
3. テキスト位置情報抽出機能の実装
4. バウンディングボックス計算と最適化

### フェーズ 4: 高度な分析機能の移行（2-3 週間）

#### 目標
- UI 要素検出の完全移行
- レイアウト分析の高度な機能実装
- Photon による特殊機能の強化

#### タスク
1. 輪郭検出と UI 要素分類の実装
2. グリッド検出と構造分析機能の実装
3. Photon WebAssembly モジュールの統合
4. 高度な画像フィルタリングとエンハンスメント機能

### フェーズ 5: 最適化とテスト（1-2 週間）

#### 目標
- パフォーマンス最適化
- 包括的なテスト
- 最終調整

#### タスク
1. メモリ使用量の最適化
2. Web Worker による並列処理の最適化
3. クロスプラットフォームテスト
4. エッジケースの対応

### フェーズ 6: 移行完了（1 週間）

#### 目標
- Python 依存関係の完全排除
- ドキュメントとナレッジ移行

#### タスク
1. Python Bridge の無効化と削除
2. エラーハンドリングの最終確認
3. リリースノート作成
4. 最終チェックと公開準備

## 5. 技術的詳細

### 5.1 OpenCV.js 実装例

```javascript
/**
 * 画像から主要セクションを抽出する
 * @param {ImageData} imageData - 解析する画像データ
 * @returns {Array} - 検出されたセクション情報
 */
async function extractSections(imageData) {
  // OpenCV.js が読み込まれていることを確認
  if (typeof cv === 'undefined') {
    throw new Error('OpenCV.js が読み込まれていません');
  }
  
  try {
    // ImageData から cv.Mat に変換
    const src = cv.matFromImageData(imageData);
    
    // グレースケールに変換
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // ぼかし処理で細かいノイズを除去
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    
    // エッジ検出
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);
    
    // 水平勾配の計算（Python 版の sobelx に相当）
    const gradX = new cv.Mat();
    const abs_grad_x = new cv.Mat();
    cv.Sobel(blurred, gradX, cv.CV_64F, 1, 0, 3);
    cv.convertScaleAbs(gradX, abs_grad_x);
    
    // 勾配の平均を計算
    let gradientMeans = [];
    for (let i = 0; i < abs_grad_x.rows; i++) {
      let rowSum = 0;
      for (let j = 0; j < abs_grad_x.cols; j++) {
        rowSum += abs_grad_x.ucharPtr(i, j)[0];
      }
      gradientMeans.push(rowSum / abs_grad_x.cols);
    }
    
    // ピーク検出（Python 版と同等のロジック）
    const peakIndices = [];
    const minPeakValue = gradientMeans.reduce((a, b) => a + b, 0) / gradientMeans.length * 1.5;
    const minPeakDistance = abs_grad_x.rows * 0.05;
    
    for (let i = 1; i < gradientMeans.length - 1; i++) {
      if (
        gradientMeans[i] > minPeakValue &&
        gradientMeans[i] > gradientMeans[i - 1] &&
        gradientMeans[i] > gradientMeans[i + 1]
      ) {
        if (peakIndices.length === 0 || i - peakIndices[peakIndices.length - 1] > minPeakDistance) {
          peakIndices.push(i);
        }
      }
    }
    
    // 境界として上端と下端を追加
    const boundaries = [0, ...peakIndices, edges.rows - 1];
    
    // セクション情報を作成
    const sections = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const top = boundaries[i];
      const bottom = boundaries[i + 1];
      const height = bottom - top;
      
      // 小さすぎるセクションはスキップ
      if (height < edges.rows * 0.05) continue;
      
      // セクションごとの主要色を取得
      const roi = new cv.Mat();
      const rect = new cv.Rect(0, top, src.cols, height);
      roi = src.roi(rect);
      const dominantColor = getDominantColor(roi);
      
      sections.push({
        id: `section_${i+1}`,
        position: {
          top: top,
          left: 0,
          width: src.cols,
          height: height
        },
        color: {
          dominant: dominantColor
        }
      });
      
      roi.delete();
    }
    
    // メモリ解放
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    gradX.delete();
    abs_grad_x.delete();
    
    return sections;
  } catch (error) {
    console.error('セクション抽出エラー:', error);
    return [];
  }
}
```

### 5.2 Tesseract.js 実装例

```javascript
/**
 * 画像からテキストを抽出する (OCR)
 * @param {HTMLImageElement|HTMLCanvasElement|string} image - 画像要素またはデータURL
 * @returns {Promise<Object>} - 抽出したテキスト情報
 */
async function extractText(image) {
  try {
    // Tesseract ワーカーの作成
    const { createWorker } = Tesseract;
    const worker = await createWorker();
    
    // 日本語と英語の認識をサポート
    await worker.loadLanguage('eng+jpn');
    await worker.initialize('eng+jpn');
    
    // OCR のパラメータ設定
    await worker.setParameters({
      tessedit_char_whitelist: '', // 制限なし
      preserve_interword_spaces: '1',
    });
    
    // テキスト認識の実行
    const result = await worker.recognize(image);
    
    // テキストブロックの抽出
    const textBlocks = result.data.words.map(word => ({
      text: word.text,
      confidence: word.confidence / 100, // 0-1 の範囲に正規化
      position: {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0
      }
    }));
    
    // ワーカーの終了
    await worker.terminate();
    
    // 結果の整形
    return {
      text: result.data.text,
      textBlocks: textBlocks
    };
  } catch (error) {
    console.error('テキスト抽出エラー:', error);
    return {
      text: '',
      textBlocks: [],
      error: error.message
    };
  }
}
```

### 5.3 Web Worker 実装

```javascript
// main.js (メインスレッド)
class ImageAnalyzer {
  constructor() {
    this.worker = new Worker('imageAnalyzerWorker.js');
    this.taskId = 0;
    this.taskCallbacks = new Map();
    
    this.worker.onmessage = (e) => {
      const { taskId, result, error } = e.data;
      const callback = this.taskCallbacks.get(taskId);
      
      if (callback) {
        if (error) {
          callback.reject(error);
        } else {
          callback.resolve(result);
        }
        this.taskCallbacks.delete(taskId);
      }
    };
  }
  
  async extractColors(imageData) {
    return this._postTask('extractColors', { imageData });
  }
  
  async extractText(imageData) {
    return this._postTask('extractText', { imageData });
  }
  
  async analyzeLayout(imageData) {
    return this._postTask('analyzeLayout', { imageData });
  }
  
  _postTask(task, data) {
    const taskId = this.taskId++;
    
    return new Promise((resolve, reject) => {
      this.taskCallbacks.set(taskId, { resolve, reject });
      this.worker.postMessage({ taskId, task, data });
    });
  }
}

// imageAnalyzerWorker.js (ワーカースレッド)
importScripts('opencv.js', 'tesseract.js');

// メッセージハンドラ
self.onmessage = async function(e) {
  const { taskId, task, data } = e.data;
  
  try {
    let result;
    
    // タスクに応じた処理
    switch (task) {
      case 'extractColors':
        result = await extractColors(data.imageData);
        break;
      case 'extractText':
        result = await extractText(data.imageData);
        break;
      case 'analyzeLayout':
        result = await analyzeLayout(data.imageData);
        break;
      default:
        throw new Error(`未知のタスク: ${task}`);
    }
    
    // 結果を返送
    self.postMessage({ taskId, result });
  } catch (error) {
    self.postMessage({ taskId, error: error.message });
  }
};
```

## 6. 移行リスクと対策

### 6.1 識別されたリスク

| リスク | 深刻度 | 確率 | 対策 |
|-------|-------|-----|-----|
| 特定 Python 機能の実装困難 | 高 | 中 | カスタム JS 実装、機能の段階的導入 |
| パフォーマンス問題 | 中 | 中 | Web Worker 活用、計算の最適化 |
| ブラウザ/Electron 互換性 | 中 | 低 | 幅広いテスト、フォールバック実装 |
| OCR 精度低下 | 高 | 中 | 様々なケースでのテスト、パラメータチューニング |
| メモリリーク | 中 | 低 | 厳格なメモリ管理、自動クリーンアップ |

### 6.2 詳細な対策

#### 特定 Python 機能の実装困難
- 複雑なアルゴリズムは段階的に実装
- 重要な機能から優先的に移行
- 必要に応じてハイブリッドアプローチ（移行期間中は一部 Python 維持）

#### パフォーマンス問題
- Web Workers を活用した並列処理
- 大きな画像の分割処理
- 計算量の多い処理の最適化
- メモリ効率の良いデータ構造の採用

#### OCR 精度の問題
- Tesseract.js パラメータの最適化
- 前処理ステップの強化
- テスト用画像セットでの精度検証
- 特殊なケース向けのカスタム処理

## 7. テスト戦略

### 7.1 テスト種別

1. **単体テスト**
   - 各コンポーネント機能のテスト
   - 入出力の検証
   - エッジケースのカバレッジ

2. **比較テスト**
   - 現在の Python 実装と WebAssembly 実装の結果比較
   - 精度とパフォーマンスの測定

3. **クロスプラットフォームテスト**
   - Windows, macOS, Linux での検証
   - x86_64 と arm64 アーキテクチャでのテスト

4. **エンドツーエンドテスト**
   - ユーザーワークフローの完全テスト
   - UI との統合検証

### 7.2 テスト例

```javascript
// 色彩分析テスト
describe('色彩分析テスト', () => {
  it('代表的な色を正確に抽出する', async () => {
    // テスト画像の読み込み
    const imageData = await loadTestImage('colorful-test.png');
    
    // Python 実装による結果
    const pythonResults = JSON.parse(fs.readFileSync('python-color-results.json'));
    
    // WebAssembly 実装による結果
    const wasmResults = await imageAnalyzer.extractColors(imageData);
    
    // 結果の比較
    expect(wasmResults.length).to.equal(pythonResults.length);
    
    // 色の値を比較（完全一致ではなく、許容範囲内の一致を確認）
    for (let i = 0; i < pythonResults.length; i++) {
      const pyColor = hexToRgb(pythonResults[i].hex);
      const wasmColor = hexToRgb(wasmResults[i].hex);
      
      expect(colorDistance(pyColor, wasmColor)).to.be.lessThan(10);
    }
  });
});

// OCR テスト
describe('OCR テスト', () => {
  it('日本語テキストを正確に認識する', async () => {
    // 日本語テキストを含むテスト画像
    const imageData = await loadTestImage('japanese-text.png');
    
    // WebAssembly 実装による結果
    const result = await imageAnalyzer.extractText(imageData);
    
    // 期待されるテキストが含まれているか確認
    expect(result.text).to.include('こんにちは');
    expect(result.text).to.include('世界');
  });
});
```

## 8. 移行後の評価基準

### 8.1 機能的評価

- **精度**: Python 実装と比較して 90% 以上の一致率
- **機能網羅性**: すべての主要機能が移行されている
- **エラー処理**: エッジケースでの適切な挙動

### 8.2 非機能的評価

- **パフォーマンス**: Python 実装より 20% 以上の高速化
- **メモリ使用量**: 30% 以上の削減
- **起動時間**: 80% 以上の短縮
- **クロスプラットフォーム対応**: すべての対象環境で一貫した動作

## 9. 将来の拡張性

移行後のアーキテクチャは、以下の将来拡張を容易にします：

1. **新しい画像処理アルゴリズムの追加**
   - WebAssembly モジュールとして新機能を容易に追加可能

2. **AIコード生成との連携**
   - 画像解析結果を外部 AI API に送信するためのインターフェース

3. **プラグインシステム**
   - サードパーティによる機能拡張を可能にするプラグインアーキテクチャ

## 10. 結論

Python から WebAssembly への移行は技術的に実現可能であり、移行後のシステムは安定性、パフォーマンス、クロスプラットフォーム互換性の面で大きな利点をもたらします。段階的なアプローチにより、リスクを最小限に抑えながら、既存機能を継続的に提供しつつ移行を進めることができます。

この移行は、アプリケーションの将来の拡張性も大幅に向上させ、AI を活用したコード生成など、より高度な機能の基盤となります。