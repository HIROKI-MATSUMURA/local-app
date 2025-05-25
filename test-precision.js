#!/usr/bin/env node
/**
 * 画像解析精度テスト実行スクリプト
 * 
 * 使用方法:
 * node test-precision.js                    # 全テスト実行
 * node test-precision.js --generate         # テスト画像生成
 * node test-precision.js --optimize colors  # 色抽出の最適化
 * node test-precision.js --image simple-grid # 特定画像のテスト
 */

const { PrecisionTestSuite } = require('./src/electron/utils/precision-test-suite');
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const suite = new PrecisionTestSuite();

  try {
    if (args.includes('--generate')) {
      console.log('🎨 テスト画像を生成中...');
      suite.generateDefaultTestImages();
      console.log('✅ テスト画像の生成が完了しました');
      return;
    }

    if (args.includes('--optimize')) {
      const component = args[args.indexOf('--optimize') + 1] || 'all';
      console.log(`🔧 ${component} の最適化を開始...`);
      const optimizationResult = await suite.optimizeParameters(component);
      
      console.log('\n📊 最適化結果:');
      console.log(JSON.stringify(optimizationResult, null, 2));
      return;
    }

    // テスト画像が存在しない場合は生成
    const testImagesDir = path.join(__dirname, 'test-images');
    if (!fs.existsSync(testImagesDir) || fs.readdirSync(testImagesDir).length === 0) {
      console.log('🎨 テスト画像が存在しないため、自動生成します...');
      suite.generateDefaultTestImages();
    } else {
      // 既存の画像を登録
      console.log('📂 既存のテスト画像を登録中...');
      suite.generateDefaultTestImages();
    }

    // 特定画像のテスト
    if (args.includes('--image')) {
      const imageId = args[args.indexOf('--image') + 1];
      console.log(`🧪 画像 ${imageId} のテストを実行...`);
      const result = await suite.runBenchmarkTest(imageId);
      
      // 結果表示
      console.log('\n📊 テスト結果:');
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // 全体テスト実行
    console.log('🚀 画像解析精度テストを開始します...\n');
    
    const results = await suite.runBenchmarkTest();

    // HTMLレポート生成
    const reportHtml = suite.generateReport(results);
    const reportPath = path.join(__dirname, 'test-results', `report-${Date.now()}.html`);
    fs.writeFileSync(reportPath, reportHtml);

    console.log(`\n📄 HTMLレポートを生成しました: ${reportPath}`);
    console.log('\n🎯 推奨される次のステップ:');
    
    if (results.summary.successRate < 80) {
      console.log('  • パラメータ最適化の実行: node test-precision.js --optimize');
    }
    
    if (results.summary.averageScore < 70) {
      console.log('  • アルゴリズムの見直しが必要です');
    }
    
    console.log('  • より多くのテスト画像の追加を検討してください');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ヘルプ表示
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
画像解析精度テストスイート

使用方法:
  node test-precision.js                     # 全テスト実行
  node test-precision.js --generate          # テスト画像生成
  node test-precision.js --optimize [comp]   # パラメータ最適化
  node test-precision.js --image [id]        # 特定画像テスト
  node test-precision.js --help              # このヘルプを表示

オプション:
  --generate         デフォルトのテスト画像セットを生成
  --optimize [comp]  指定コンポーネント (colors/layout/sections/all) の最適化
  --image [id]       特定の画像IDのみテスト実行
  --help, -h         ヘルプを表示

例:
  node test-precision.js --optimize colors
  node test-precision.js --image simple-grid
`);
  process.exit(0);
}

if (require.main === module) {
  main();
}