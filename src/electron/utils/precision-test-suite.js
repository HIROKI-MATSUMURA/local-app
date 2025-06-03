/**
 * 画像解析精度テストスイート
 * 実際の画像を使用して解析精度を測定・改善するためのテストシステム
 */

const fs = require('fs');
const path = require('path');
const { AnalysisValidator } = require('./analysis-validation-system');
const wasmAnalyzer = require('../public/webassembly-image-analyzer');

class PrecisionTestSuite {
  constructor() {
    this.validator = new AnalysisValidator();
    this.testResults = [];
    this.benchmarkImages = new Map();

    // テスト画像のディレクトリ
    this.testImagesDir = path.join(__dirname, '../../../test-images');
    this.resultsDir = path.join(__dirname, '../../../test-results');

    // ディレクトリが存在しない場合は作成
    this.ensureDirectoriesExist();
  }

  /**
   * 必要なディレクトリを作成
   */
  ensureDirectoriesExist() {
    if (!fs.existsSync(this.testImagesDir)) {
      fs.mkdirSync(this.testImagesDir, { recursive: true });
    }
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  /**
   * テスト画像を追加
   * @param {string} imagePath - 画像ファイルのパス
   * @param {Object} expectedResults - 期待される結果
   * @param {string} description - テストの説明
   */
  addBenchmarkImage(imagePath, expectedResults, description = '') {
    const imageId = path.basename(imagePath, path.extname(imagePath));

    this.benchmarkImages.set(imageId, {
      path: imagePath,
      expected: expectedResults,
      description: description,
      addedAt: new Date().toISOString()
    });

    console.log(`✓ ベンチマーク画像を追加: ${imageId} - ${description}`);
  }

  /**
   * デフォルトのテスト画像セットを生成
   */
  generateDefaultTestImages() {
    // SVGからテスト画像を生成
    const testCases = [
      {
        name: 'simple-grid',
        description: 'シンプルなグリッドレイアウト',
        svg: this.generateGridLayoutSVG(),
        expected: {
          layoutType: 'grid',
          minColors: 3,
          expectedElements: ['card'],
          minSections: 4
        }
      },
      {
        name: 'header-content-footer',
        description: 'ヘッダー・コンテンツ・フッター構造',
        svg: this.generateBasicLayoutSVG(),
        expected: {
          layoutType: 'list',
          sections: ['header', 'main', 'footer'],
          minColors: 2
        }
      },
      {
        name: 'card-layout',
        description: 'カード型レイアウト',
        svg: this.generateCardLayoutSVG(),
        expected: {
          layoutType: 'card',
          minCards: 3,
          expectedElements: ['card', 'button']
        }
      },
      {
        name: 'text-heavy',
        description: 'テキスト中心のレイアウト',
        svg: this.generateTextLayoutSVG(),
        expected: {
          minTextBlocks: 5,
          minTextConfidence: 0.8
        }
      }
    ];

    testCases.forEach(testCase => {
      const imagePath = path.join(this.testImagesDir, `${testCase.name}.svg`);
      fs.writeFileSync(imagePath, testCase.svg);
      this.addBenchmarkImage(imagePath, testCase.expected, testCase.description);
    });

    console.log(`✓ ${testCases.length}個のデフォルトテスト画像を生成しました`);
  }

  /**
   * グリッドレイアウトのSVGを生成
   */
  generateGridLayoutSVG() {
    return `
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#f8f9fa"/>

  <!-- Header -->
  <rect x="0" y="0" width="800" height="80" fill="#343a40"/>
  <text x="50" y="45" font-family="Arial" font-size="24" fill="white">Website Header</text>

  <!-- Grid Items -->
  <rect x="50" y="120" width="180" height="200" fill="white" stroke="#dee2e6" stroke-width="2"/>
  <text x="60" y="150" font-family="Arial" font-size="16" fill="#495057">Card 1</text>
  <circle cx="140" cy="200" r="30" fill="#007bff"/>

  <rect x="270" y="120" width="180" height="200" fill="white" stroke="#dee2e6" stroke-width="2"/>
  <text x="280" y="150" font-family="Arial" font-size="16" fill="#495057">Card 2</text>
  <circle cx="360" cy="200" r="30" fill="#28a745"/>

  <rect x="490" y="120" width="180" height="200" fill="white" stroke="#dee2e6" stroke-width="2"/>
  <text x="500" y="150" font-family="Arial" font-size="16" fill="#495057">Card 3</text>
  <circle cx="580" cy="200" r="30" fill="#dc3545"/>

  <rect x="50" y="360" width="180" height="200" fill="white" stroke="#dee2e6" stroke-width="2"/>
  <text x="60" y="390" font-family="Arial" font-size="16" fill="#495057">Card 4</text>

  <rect x="270" y="360" width="180" height="200" fill="white" stroke="#dee2e6" stroke-width="2"/>
  <text x="280" y="390" font-family="Arial" font-size="16" fill="#495057">Card 5</text>

  <rect x="490" y="360" width="180" height="200" fill="white" stroke="#dee2e6" stroke-width="2"/>
  <text x="500" y="390" font-family="Arial" font-size="16" fill="#495057">Card 6</text>
</svg>`.trim();
  }

  /**
   * 基本レイアウトのSVGを生成
   */
  generateBasicLayoutSVG() {
    return `
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#ffffff"/>

  <!-- Header -->
  <rect x="0" y="0" width="800" height="100" fill="#2c3e50"/>
  <text x="50" y="40" font-family="Arial" font-size="28" fill="white">My Website</text>
  <text x="50" y="70" font-family="Arial" font-size="16" fill="#ecf0f1">Professional Web Design</text>

  <!-- Navigation -->
  <rect x="0" y="100" width="800" height="50" fill="#34495e"/>
  <text x="50" y="130" font-family="Arial" font-size="14" fill="white">Home</text>
  <text x="120" y="130" font-family="Arial" font-size="14" fill="white">About</text>
  <text x="190" y="130" font-family="Arial" font-size="14" fill="white">Services</text>
  <text x="260" y="130" font-family="Arial" font-size="14" fill="white">Contact</text>

  <!-- Main Content -->
  <rect x="50" y="180" width="700" height="300" fill="#ecf0f1"/>
  <text x="70" y="210" font-family="Arial" font-size="24" fill="#2c3e50">Welcome to Our Website</text>
  <text x="70" y="240" font-family="Arial" font-size="16" fill="#34495e">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</text>
  <text x="70" y="260" font-family="Arial" font-size="16" fill="#34495e">Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</text>

  <rect x="70" y="300" width="120" height="40" fill="#3498db"/>
  <text x="115" y="325" font-family="Arial" font-size="14" fill="white">Learn More</text>

  <!-- Footer -->
  <rect x="0" y="500" width="800" height="100" fill="#2c3e50"/>
  <text x="50" y="530" font-family="Arial" font-size="14" fill="white">© 2024 My Website. All rights reserved.</text>
  <text x="50" y="550" font-family="Arial" font-size="12" fill="#95a5a6">Contact: info@example.com</text>
</svg>`.trim();
  }

  /**
   * カードレイアウトのSVGを生成
   */
  generateCardLayoutSVG() {
    return `
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#f8f9fa"/>

  <!-- Title -->
  <text x="400" y="50" font-family="Arial" font-size="32" fill="#212529" text-anchor="middle">Our Products</text>

  <!-- Card 1 -->
  <rect x="60" y="100" width="200" height="300" fill="white" stroke="#dee2e6" stroke-width="1" rx="8"/>
  <rect x="70" y="110" width="180" height="120" fill="#e9ecef"/>
  <text x="160" y="175" font-family="Arial" font-size="14" fill="#6c757d" text-anchor="middle">Product Image</text>
  <text x="160" y="250" font-family="Arial" font-size="18" fill="#212529" text-anchor="middle">Product A</text>
  <text x="160" y="270" font-family="Arial" font-size="14" fill="#6c757d" text-anchor="middle">$29.99</text>
  <rect x="90" y="320" width="140" height="35" fill="#007bff" rx="4"/>
  <text x="160" y="342" font-family="Arial" font-size="14" fill="white" text-anchor="middle">Add to Cart</text>

  <!-- Card 2 -->
  <rect x="300" y="100" width="200" height="300" fill="white" stroke="#dee2e6" stroke-width="1" rx="8"/>
  <rect x="310" y="110" width="180" height="120" fill="#e9ecef"/>
  <text x="400" y="175" font-family="Arial" font-size="14" fill="#6c757d" text-anchor="middle">Product Image</text>
  <text x="400" y="250" font-family="Arial" font-size="18" fill="#212529" text-anchor="middle">Product B</text>
  <text x="400" y="270" font-family="Arial" font-size="14" fill="#6c757d" text-anchor="middle">$39.99</text>
  <rect x="330" y="320" width="140" height="35" fill="#28a745" rx="4"/>
  <text x="400" y="342" font-family="Arial" font-size="14" fill="white" text-anchor="middle">Add to Cart</text>

  <!-- Card 3 -->
  <rect x="540" y="100" width="200" height="300" fill="white" stroke="#dee2e6" stroke-width="1" rx="8"/>
  <rect x="550" y="110" width="180" height="120" fill="#e9ecef"/>
  <text x="640" y="175" font-family="Arial" font-size="14" fill="#6c757d" text-anchor="middle">Product Image</text>
  <text x="640" y="250" font-family="Arial" font-size="18" fill="#212529" text-anchor="middle">Product C</text>
  <text x="640" y="270" font-family="Arial" font-size="14" fill="#6c757d" text-anchor="middle">$49.99</text>
  <rect x="570" y="320" width="140" height="35" fill="#dc3545" rx="4"/>
  <text x="640" y="342" font-family="Arial" font-size="14" fill="white" text-anchor="middle">Add to Cart</text>
</svg>`.trim();
  }

  /**
   * テキスト中心レイアウトのSVGを生成
   */
  generateTextLayoutSVG() {
    return `
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="white"/>

  <!-- Title -->
  <text x="50" y="50" font-family="Arial" font-size="36" fill="#212529">Article Title</text>
  <text x="50" y="80" font-family="Arial" font-size="16" fill="#6c757d">Published on March 15, 2024</text>

  <!-- Content -->
  <text x="50" y="120" font-family="Arial" font-size="18" fill="#495057">Introduction</text>
  <text x="50" y="150" font-family="Arial" font-size="14" fill="#212529">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod</text>
  <text x="50" y="170" font-family="Arial" font-size="14" fill="#212529">tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim</text>
  <text x="50" y="190" font-family="Arial" font-size="14" fill="#212529">veniam, quis nostrud exercitation ullamco laboris.</text>

  <text x="50" y="230" font-family="Arial" font-size="18" fill="#495057">Main Content</text>
  <text x="50" y="260" font-family="Arial" font-size="14" fill="#212529">Duis aute irure dolor in reprehenderit in voluptate velit esse cillum</text>
  <text x="50" y="280" font-family="Arial" font-size="14" fill="#212529">dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non</text>
  <text x="50" y="300" font-family="Arial" font-size="14" fill="#212529">proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</text>

  <text x="50" y="340" font-family="Arial" font-size="18" fill="#495057">Conclusion</text>
  <text x="50" y="370" font-family="Arial" font-size="14" fill="#212529">Sed ut perspiciatis unde omnis iste natus error sit voluptatem</text>
  <text x="50" y="390" font-family="Arial" font-size="14" fill="#212529">accusantium doloremque laudantium, totam rem aperiam.</text>

  <!-- Keywords -->
  <rect x="50" y="430" width="60" height="25" fill="#e9ecef" rx="12"/>
  <text x="80" y="447" font-family="Arial" font-size="12" fill="#495057" text-anchor="middle">keyword1</text>

  <rect x="120" y="430" width="60" height="25" fill="#e9ecef" rx="12"/>
  <text x="150" y="447" font-family="Arial" font-size="12" fill="#495057" text-anchor="middle">keyword2</text>

  <rect x="190" y="430" width="60" height="25" fill="#e9ecef" rx="12"/>
  <text x="220" y="447" font-family="Arial" font-size="12" fill="#495057" text-anchor="middle">keyword3</text>

  <!-- Author -->
  <text x="50" y="500" font-family="Arial" font-size="16" fill="#495057">Author: John Doe</text>
  <text x="50" y="520" font-family="Arial" font-size="14" fill="#6c757d">Senior Web Developer</text>
</svg>`.trim();
  }

  /**
   * ベンチマークテストを実行
   * @param {string} imageId - テスト対象の画像ID（nullの場合は全て）
   * @returns {Promise<Object>} テスト結果
   */
  async runBenchmarkTest(imageId = null) {
    const startTime = Date.now();
    const results = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      detailedResults: [],
      summary: {},
      performance: {}
    };

    const imagesToTest = imageId ?
      [this.benchmarkImages.get(imageId)] :
      Array.from(this.benchmarkImages.values());

    if (imagesToTest.length === 0) {
      console.log('利用可能な画像:', Array.from(this.benchmarkImages.keys()));
      throw new Error('テスト対象の画像がありません');
    }

    console.log(`🧪 ${imagesToTest.length}個の画像でベンチマークテストを開始...`);

    for (const imageData of imagesToTest) {
      if (!imageData) continue;

      const imageTestStart = Date.now();
      const testResult = await this.runSingleImageTest(imageData);
      const imageTestEnd = Date.now();

      testResult.processingTime = imageTestEnd - imageTestStart;
      results.detailedResults.push(testResult);
      results.totalTests++;

      if (testResult.passed) {
        results.passedTests++;
        console.log(`✅ ${testResult.imageId}: ${testResult.overallScore.toFixed(1)}% (${testResult.processingTime}ms)`);
      } else {
        results.failedTests++;
        console.log(`❌ ${testResult.imageId}: 失敗 - ${testResult.issues.join(', ')}`);
      }
    }

    const endTime = Date.now();
    results.performance.totalTime = endTime - startTime;
    results.performance.averageTimePerImage = results.performance.totalTime / results.totalTests;

    // サマリーの生成
    this.generateTestSummary(results);

    // 結果を保存
    const resultsFile = path.join(this.resultsDir, `benchmark-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

    console.log(`\n📊 テスト完了: ${results.passedTests}/${results.totalTests} 成功`);
    console.log(`📄 結果ファイル: ${resultsFile}`);

    return results;
  }

  /**
   * 単一画像のテストを実行
   * @param {Object} imageData - 画像データ
   * @returns {Promise<Object>} テスト結果
   */
  async runSingleImageTest(imageData) {
    const imageId = path.basename(imageData.path, path.extname(imageData.path));
    const result = {
      imageId: imageId,
      description: imageData.description,
      passed: false,
      overallScore: 0,
      componentScores: {},
      issues: [],
      suggestions: [],
      expected: imageData.expected,
      actual: null
    };

    try {
      // 画像をBase64形式で読み込み
      const imageBuffer = fs.readFileSync(imageData.path);
      const imageBase64 = `data:image/${path.extname(imageData.path).slice(1)};base64,${imageBuffer.toString('base64')}`;

      // WebAssembly解析を実行
      const analysisResult = await wasmAnalyzer.analyzeAll(imageBase64, {
        detectCards: true,
        detectFeatures: true,
        detectMainSections: true
      });

      result.actual = analysisResult;

      // 結果を検証
      const validation = this.validator.validateComprehensiveAnalysis(analysisResult, imageBase64);
      result.overallScore = validation.overallScore;
      result.componentScores = validation.componentScores;

      // 期待結果との比較
      const comparisonResult = this.compareWithExpected(analysisResult, imageData.expected);
      result.passed = comparisonResult.passed;
      result.issues = comparisonResult.issues;
      result.suggestions = comparisonResult.suggestions;

    } catch (error) {
      result.issues.push(`テスト実行エラー: ${error.message}`);
      console.error(`❌ ${imageId} テストエラー:`, error);
    }

    return result;
  }

  /**
   * 期待結果と実際の結果を比較
   * @param {Object} actual - 実際の解析結果
   * @param {Object} expected - 期待される結果
   * @returns {Object} 比較結果
   */
  compareWithExpected(actual, expected) {
    const comparison = {
      passed: true,
      issues: [],
      suggestions: []
    };

    if (!actual.success) {
      comparison.passed = false;
      comparison.issues.push('解析自体が失敗しました');
      return comparison;
    }

    const data = actual.data;

    // レイアウトタイプの検証
    if (expected.layoutType && data.layout) {
      if (data.layout.layoutType !== expected.layoutType) {
        comparison.passed = false;
        comparison.issues.push(`レイアウトタイプが期待値と異なります: 期待=${expected.layoutType}, 実際=${data.layout.layoutType}`);
        comparison.suggestions.push('レイアウト検出アルゴリズムのパラメータ調整が必要です');
      }
    }

    // 色数の検証
    if (expected.minColors && data.colors) {
      if (data.colors.length < expected.minColors) {
        comparison.passed = false;
        comparison.issues.push(`抽出された色数が不足: 期待≥${expected.minColors}, 実際=${data.colors.length}`);
        comparison.suggestions.push('K-meansのクラスター数を増やすか、前処理を改善してください');
      }
    }

    // セクション数の検証
    if (expected.minSections && data.mainSections) {
      const actualSections = data.mainSections.sections ? data.mainSections.sections.length : 0;
      if (actualSections < expected.minSections) {
        comparison.passed = false;
        comparison.issues.push(`検出されたセクション数が不足: 期待≥${expected.minSections}, 実際=${actualSections}`);
        comparison.suggestions.push('セクション検出の閾値を調整してください');
      }
    }

    // カード数の検証
    if (expected.minCards && data.cards) {
      const actualCards = data.cards.cards ? data.cards.cards.length : 0;
      if (actualCards < expected.minCards) {
        comparison.passed = false;
        comparison.issues.push(`検出されたカード数が不足: 期待≥${expected.minCards}, 実際=${actualCards}`);
        comparison.suggestions.push('カード検出アルゴリズムの精度向上が必要です');
      }
    }

    // 要素タイプの検証
    if (expected.expectedElements && data.elements) {
      const actualElements = data.elements.elements ?
        data.elements.elements.map(el => el.type) : [];

      expected.expectedElements.forEach(expectedType => {
        if (!actualElements.includes(expectedType)) {
          comparison.passed = false;
          comparison.issues.push(`期待される要素タイプが検出されませんでした: ${expectedType}`);
          comparison.suggestions.push(`${expectedType}要素の検出アルゴリズム改善が必要です`);
        }
      });
    }

    // テキスト認識の検証
    if (expected.minTextBlocks && data.textBlocks) {
      if (data.textBlocks.length < expected.minTextBlocks) {
        comparison.passed = false;
        comparison.issues.push(`テキストブロック数が不足: 期待≥${expected.minTextBlocks}, 実際=${data.textBlocks.length}`);
        comparison.suggestions.push('OCRの感度を上げるか、前処理を改善してください');
      }
    }

    if (expected.minTextConfidence && data.textBlocks) {
      const avgConfidence = data.textBlocks.length > 0 ?
        data.textBlocks.reduce((sum, block) => sum + block.confidence, 0) / data.textBlocks.length : 0;

      if (avgConfidence < expected.minTextConfidence) {
        comparison.passed = false;
        comparison.issues.push(`テキスト認識の信頼度が低い: 期待≥${expected.minTextConfidence}, 実際=${avgConfidence.toFixed(2)}`);
        comparison.suggestions.push('OCRの前処理パラメータを調整してください');
      }
    }

    return comparison;
  }

  /**
   * テストサマリーを生成
   * @param {Object} results - テスト結果
   */
  generateTestSummary(results) {
    const summary = {
      successRate: (results.passedTests / results.totalTests) * 100,
      averageScore: 0,
      componentPerformance: {},
      commonIssues: {},
      performanceStats: {
        averageTime: results.performance.averageTimePerImage,
        fastestTest: Math.min(...results.detailedResults.map(r => r.processingTime)),
        slowestTest: Math.max(...results.detailedResults.map(r => r.processingTime))
      }
    };

    // 平均スコアの計算
    const scores = results.detailedResults.map(r => r.overallScore);
    summary.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // コンポーネント別パフォーマンス
    const componentTypes = ['colors', 'text', 'layout'];
    componentTypes.forEach(component => {
      const componentScores = results.detailedResults
        .map(r => r.componentScores[component]?.score)
        .filter(score => score !== undefined);

      if (componentScores.length > 0) {
        summary.componentPerformance[component] = {
          averageScore: componentScores.reduce((a, b) => a + b, 0) / componentScores.length,
          testCount: componentScores.length
        };
      }
    });

    // よくある問題の集計
    results.detailedResults.forEach(result => {
      result.issues.forEach(issue => {
        summary.commonIssues[issue] = (summary.commonIssues[issue] || 0) + 1;
      });
    });

    results.summary = summary;

    // サマリーをコンソールに出力
    console.log('\n📈 テスト サマリー:');
    console.log(`成功率: ${summary.successRate.toFixed(1)}%`);
    console.log(`平均スコア: ${summary.averageScore.toFixed(1)}`);
    console.log(`平均処理時間: ${summary.performanceStats.averageTime.toFixed(0)}ms`);

    if (Object.keys(summary.commonIssues).length > 0) {
      console.log('\n🔍 よくある問題:');
      Object.entries(summary.commonIssues)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .forEach(([issue, count]) => {
          console.log(`  • ${issue} (${count}回)`);
        });
    }
  }

  /**
   * 解析パラメータの最適化を実行
   * @param {string} targetComponent - 最適化対象のコンポーネント
   * @returns {Promise<Object>} 最適化結果
   */
  async optimizeParameters(targetComponent = 'all') {
    console.log(`🔧 ${targetComponent} のパラメータ最適化を開始...`);

    // 現在のベースライン測定
    const baselineResults = await this.runBenchmarkTest();
    const baselineScore = baselineResults.summary.averageScore;

    console.log(`📊 ベースラインスコア: ${baselineScore.toFixed(1)}`);

    const optimizationResults = {
      baseline: baselineScore,
      improvements: [],
      bestParameters: {},
      finalScore: baselineScore
    };

    // パラメータ候補の定義
    const parameterCandidates = this.getParameterCandidates(targetComponent);

    for (const paramSet of parameterCandidates) {
      console.log(`🧪 テスト中: ${JSON.stringify(paramSet)}`);

      // パラメータを適用
      this.applyParameters(paramSet);

      // テスト実行
      const testResults = await this.runBenchmarkTest();
      const testScore = testResults.summary.averageScore;

      console.log(`📈 結果: ${testScore.toFixed(1)} (${(testScore - baselineScore > 0 ? '+' : '')}${(testScore - baselineScore).toFixed(1)})`);

      if (testScore > optimizationResults.finalScore) {
        optimizationResults.finalScore = testScore;
        optimizationResults.bestParameters = { ...paramSet };

        optimizationResults.improvements.push({
          parameters: paramSet,
          score: testScore,
          improvement: testScore - baselineScore
        });
      }

      // パラメータをリセット
      this.resetParameters();
    }

    if (optimizationResults.improvements.length > 0) {
      console.log(`\n🎉 最適化完了! 最高スコア: ${optimizationResults.finalScore.toFixed(1)} (+${(optimizationResults.finalScore - baselineScore).toFixed(1)})`);
      console.log(`🏆 最適パラメータ: ${JSON.stringify(optimizationResults.bestParameters)}`);
    } else {
      console.log('\n📊 改善可能なパラメータが見つかりませんでした');
    }

    return optimizationResults;
  }

  /**
   * パラメータ候補を取得
   * @param {string} component - 対象コンポーネント
   * @returns {Array} パラメータ候補配列
   */
  getParameterCandidates(component) {
    const candidates = [];

    if (component === 'all' || component === 'colors') {
      // K-meansクラスター数の最適化
      [3, 4, 5, 6, 7, 8].forEach(clusters => {
        candidates.push({ component: 'colors', maxColors: clusters });
      });
    }

    if (component === 'all' || component === 'layout') {
      // レイアウト検出閾値の最適化
      [1.2, 1.5, 1.8, 2.0, 2.2].forEach(threshold => {
        candidates.push({ component: 'layout', edgeThreshold: threshold });
      });
    }

    if (component === 'all' || component === 'sections') {
      // セクション検出パラメータ
      [0.03, 0.05, 0.07, 0.1].forEach(minHeight => {
        candidates.push({ component: 'sections', minSectionHeight: minHeight });
      });
    }

    return candidates;
  }

  /**
   * パラメータを適用
   * @param {Object} parameters - 適用するパラメータ
   */
  applyParameters(parameters) {
    // ここで実際のWebAssemblyモジュールのパラメータを変更
    // 実装例：グローバル変数や設定オブジェクトを更新
    if (parameters.maxColors) {
      // 色抽出のクラスター数を変更
      global.MAX_COLORS = parameters.maxColors;
    }

    if (parameters.edgeThreshold) {
      // エッジ検出の閾値を変更
      global.EDGE_THRESHOLD = parameters.edgeThreshold;
    }

    if (parameters.minSectionHeight) {
      // セクション検出の最小高さ比率を変更
      global.MIN_SECTION_HEIGHT_RATIO = parameters.minSectionHeight;
    }
  }

  /**
   * パラメータをデフォルトにリセット
   */
  resetParameters() {
    // デフォルト値にリセット
    global.MAX_COLORS = 5;
    global.EDGE_THRESHOLD = 1.5;
    global.MIN_SECTION_HEIGHT_RATIO = 0.05;
  }

  /**
   * レポートを生成
   * @param {Object} testResults - テスト結果
   * @returns {string} HTMLレポート
   */
  generateReport(testResults) {
    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>画像解析精度テストレポート</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 40px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .test-result { border: 1px solid #dee2e6; margin-bottom: 20px; border-radius: 8px; overflow: hidden; }
        .test-header { background: #e9ecef; padding: 15px; }
        .test-body { padding: 15px; }
        .score { font-size: 24px; font-weight: bold; }
        .score.good { color: #28a745; }
        .score.medium { color: #ffc107; }
        .score.poor { color: #dc3545; }
        .issues { color: #dc3545; }
        .suggestions { color: #17a2b8; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background: #f8f9fa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>画像解析精度テストレポート</h1>
        <p>実行日時: ${testResults.timestamp}</p>
    </div>

    <div class="summary">
        <h2>サマリー</h2>
        <p><strong>成功率:</strong> ${testResults.summary.successRate.toFixed(1)}% (${testResults.passedTests}/${testResults.totalTests})</p>
        <p><strong>平均スコア:</strong> ${testResults.summary.averageScore.toFixed(1)}</p>
        <p><strong>平均処理時間:</strong> ${testResults.summary.performanceStats.averageTime.toFixed(0)}ms</p>
    </div>

    ${testResults.detailedResults.map(result => `
        <div class="test-result">
            <div class="test-header">
                <h3>${result.imageId} - ${result.description}</h3>
                <span class="score ${this.getScoreClass(result.overallScore)}">${result.overallScore.toFixed(1)}%</span>
            </div>
            <div class="test-body">
                <p><strong>処理時間:</strong> ${result.processingTime}ms</p>
                <p><strong>結果:</strong> ${result.passed ? '✅ 成功' : '❌ 失敗'}</p>

                ${result.issues.length > 0 ? `
                    <div class="issues">
                        <strong>問題:</strong>
                        <ul>${result.issues.map(issue => `<li>${issue}</li>`).join('')}</ul>
                    </div>
                ` : ''}

                ${result.suggestions.length > 0 ? `
                    <div class="suggestions">
                        <strong>改善提案:</strong>
                        <ul>${result.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('')}

    <h2>コンポーネント別パフォーマンス</h2>
    <table>
        <tr>
            <th>コンポーネント</th>
            <th>平均スコア</th>
            <th>テスト回数</th>
        </tr>
        ${Object.entries(testResults.summary.componentPerformance).map(([component, perf]) => `
            <tr>
                <td>${component}</td>
                <td>${perf.averageScore.toFixed(1)}</td>
                <td>${perf.testCount}</td>
            </tr>
        `).join('')}
    </table>
</body>
</html>`;

    return html;
  }

  /**
   * スコアに基づくCSSクラスを取得
   * @param {number} score - スコア
   * @returns {string} CSSクラス名
   */
  getScoreClass(score) {
    if (score >= 80) return 'good';
    if (score >= 60) return 'medium';
    return 'poor';
  }
}

module.exports = { PrecisionTestSuite };
