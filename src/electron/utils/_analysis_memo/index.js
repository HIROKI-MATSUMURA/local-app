/**
 * デザイン分析モジュール
 * 画像解析データからHTMLとCSSの生成に必要な情報を抽出・整理します
 *
 * モジュール構成:
 * - textAnalyzer: テキスト解析（強調、重要性、階層）
 * - layoutAnalyzer: レイアウト構造解析
 * - colorAnalyzer: 色彩分析
 * - componentDetector: UIコンポーネント検出
 * - dataUtils: データ操作・正規化
 * - guidelinesManager: デザインガイドライン管理
 * - promptBuilder: AIプロンプト構築
 * - imageAnalyzer: 画像分析
 * - textAnalysis: テキスト基本分析
 */

import * as textAnalyzer from './textAnalyzer.js';
import * as layoutAnalyzer from './layoutAnalyzer.js';
import * as colorAnalyzer from './colorAnalyzer.js';
import * as componentDetector from './componentDetector.js';
import * as dataUtils from './dataUtils.js';
import * as guidelinesManager from './guidelinesManager.js';
import * as promptBuilder from './promptBuilder.js';
import * as imageAnalyzer from './imageAnalyzer.js';
import * as textAnalysis from './textAnalysis.js';

// 各モジュールをエクスポート（個別アクセス用）
export {
  textAnalyzer,     // テキスト解析機能
  layoutAnalyzer,   // レイアウト構造解析
  colorAnalyzer,    // 色彩分析
  componentDetector, // コンポーネント検出
  dataUtils,        // データユーティリティ
  guidelinesManager, // ガイドライン管理
  promptBuilder,    // プロンプト構築
  imageAnalyzer,    // 画像分析
  textAnalysis      // テキスト基本分析
};

/**
 * モジュール間の依存関係:
 *
 * 1. データフロー
 *    原データ → dataUtils(正規化) → 各分析モジュール → 統合結果
 *
 * 2. 主要な依存関係
 *    - textAnalyzer ← textAnalysis
 *    - componentDetector ← textAnalyzer, layoutAnalyzer
 *    - promptBuilder ← 全モジュールの分析結果
 *    - imageAnalyzer ← textAnalyzer (alt提案)
 *    - guidelinesManager ← colorAnalyzer, layoutAnalyzer
 *
 * 3. データ統合ポイント
 *    - analyzeDesignData(): 全分析を実行し結果を統合
 *    - generateApplicationData(): 分析結果からアプリケーションデータを生成
 */

/**
 * 統合分析関数 - PCとSPデータを分析して結果を返す
 * @param {Object} pcData PC画像の解析データ
 * @param {Object} spData SP画像の解析データ
 * @returns {Object} 統合分析結果
 */
export function analyzeDesignData(pcData, spData) {
  // データの正規化と前処理
  const normalizedPC = pcData ? dataUtils.normalizeData(pcData) : null;
  const normalizedSP = spData ? dataUtils.normalizeData(spData) : null;

  // 使用するデータソースを選択（PCを優先）
  const primaryData = normalizedPC || normalizedSP;
  if (!primaryData) return null;

  try {
    // 分析コンテキストを作成（各分析モジュール間でデータ共有）
    const analysisContext = {
      textBlocks: primaryData.textBlocks || [],
      elements: primaryData.elements || []
    };

    // 各種分析を実行
    const textAnalysisResult = textAnalyzer.analyzeTextEmphasis(primaryData.textBlocks);
    const layoutAnalysis = layoutAnalyzer.analyzeLayoutStructure(primaryData.elements, primaryData.sections);
    const colorAnalysis = colorAnalyzer.analyzeColors(primaryData.colors);
    const componentsAnalysis = componentDetector.detectComponents(primaryData);

    // 画像分析を追加
    const imageElements = primaryData.elements?.filter(element => element.type === 'image') || [];
    const imageAnalysis = imageAnalyzer.analyzeImages(imageElements, analysisContext);

    // PC/SP比較（レスポンシブ情報）
    const responsiveInfo = (normalizedPC && normalizedSP) ?
      layoutAnalyzer.compareLayouts(normalizedPC, normalizedSP) :
      { hasBothLayouts: false };

    // ページタイプ推論
    const pageContext = inferPageContext(primaryData, textAnalysisResult, componentsAnalysis);

    // 最終結果を返す
    return {
      text: textAnalysisResult,
      layout: layoutAnalysis,
      colors: colorAnalysis,
      components: componentsAnalysis,
      images: imageAnalysis,
      responsive: responsiveInfo,
      pageContext: pageContext,
      originalData: {
        pc: normalizedPC,
        sp: normalizedSP
      }
    };
  } catch (error) {
    console.error('デザイン分析エラー:', error);
    return null;
  }
}

/**
 * 解析結果からアプリケーションデータを生成
 * @param {Object} analysisResult - 解析結果
 * @returns {Object} アプリケーションデータ
 */
export function generateApplicationData(analysisResult) {
  if (!analysisResult) return null;

  try {
    // デザインガイドラインを生成
    const guidelines = guidelinesManager.generateGuidelines(analysisResult);

    // CSSカスタムプロパティに変換
    const cssVariables = guidelinesManager.convertGuidelinesToCSS(guidelines);

    // AIプロンプトを生成
    const implementationPrompts = promptBuilder.buildImplementationPrompt(analysisResult);

    return {
      guidelines,
      cssVariables,
      implementationPrompts,
      analysisResult
    };
  } catch (error) {
    console.error('アプリケーションデータ生成エラー:', error);
    return null;
  }
}

/**
 * ページコンテキスト（目的/種類）を推論
 * @param {Object} data - 基本データ
 * @param {Object} textAnalysis - テキスト分析結果
 * @param {Object} componentsAnalysis - コンポーネント分析結果
 * @returns {Object} ページコンテキスト情報
 */
function inferPageContext(data, textAnalysis, componentsAnalysis) {
  // テキスト内容からページタイプを推測
  const allText = data.text || '';
  const headings = textAnalysis.allEmphasized || [];

  // キーワードベースでページタイプを推測
  const keywordMap = {
    'サービス': 'service',
    'ライセンス': 'service',
    'お問い合わせ': 'contact',
    '問い合わせ': 'contact',
    'コンタクト': 'contact',
    '料金': 'pricing',
    'プラン': 'pricing',
    '会社': 'company',
    '概要': 'company',
    '私たち': 'about',
    'について': 'about',
    'ブログ': 'blog',
    'Blog': 'blog',
    'お知らせ': 'news',
    'ニュース': 'news',
    '実績': 'portfolio',
    '事例': 'portfolio'
  };

  // ページタイプのスコアを集計
  const scores = {
    'top': 0,
    'service': 0,
    'contact': 0,
    'pricing': 0,
    'company': 0,
    'about': 0,
    'blog': 0,
    'news': 0,
    'portfolio': 0
  };

  // テキスト全体を検索
  Object.entries(keywordMap).forEach(([keyword, type]) => {
    if (allText.includes(keyword)) {
      scores[type] += 1;
    }
  });

  // 見出しテキストを分析（より重み付け）
  headings.forEach(heading => {
    if (!heading.text) return;

    Object.entries(keywordMap).forEach(([keyword, type]) => {
      if (heading.text.includes(keyword)) {
        scores[type] += 2;
      }
    });
  });

  // コンポーネント情報からもスコア付け
  if (componentsAnalysis) {
    if (componentsAnalysis.hasHero) scores['top'] += 2;
    if (componentsAnalysis.hasContactForm) scores['contact'] += 3;
    if (componentsAnalysis.hasCards && componentsAnalysis.hasCards.length >= 3) scores['top'] += 1;
    if (componentsAnalysis.hasFeatureList) scores['service'] += 2;
  }

  // 最もスコアの高いページタイプを選択
  let pageType = 'general';
  let maxScore = 0;

  Object.entries(scores).forEach(([type, score]) => {
    if (score > maxScore) {
      maxScore = score;
      pageType = type;
    }
  });

  // 全体的な構造説明を生成
  let summary = '';

  // ページタイプに基づく説明
  switch (pageType) {
    case 'top':
      summary = 'このページはWebサイトのトップページ/ランディングページで、';
      if (componentsAnalysis.hasHero) summary += '目を引くヒーローセクションで始まり、';
      if (componentsAnalysis.hasCards) summary += '複数のカード型コンテンツでサービスや特徴を紹介しています。';
      break;
    case 'service':
      summary = 'このページはサービス紹介ページで、';
      if (componentsAnalysis.hasHero) summary += 'サービスの概要を示すヒーローセクションがあり、';
      summary += 'サービスの詳細や特徴を説明するコンテンツで構成されています。';
      break;
    case 'contact':
      summary = 'このページはお問い合わせページで、';
      if (componentsAnalysis.hasContactForm) summary += 'コンタクトフォームを含み、';
      summary += 'ユーザーからの問い合わせを受け付ける目的で設計されています。';
      break;
    case 'blog':
    case 'news':
      summary = `このページは${pageType === 'blog' ? 'ブログ' : 'ニュース'}ページで、`;
      if (componentsAnalysis.hasCards) summary += '記事リストをカードレイアウトで表示し、';
      summary += '複数の記事エントリーで構成されています。';
      break;
    default:
      summary = `このページは${getPageTypeName(pageType)}ページとして検出され、`;
      if (componentsAnalysis.hasHero) summary += '上部に大きなメインビジュアルがあり、';
      summary += '主要コンテンツが続く構成になっています。';
  }

  return {
    pageType,
    summary,
    detectedKeywords: Object.keys(keywordMap).filter(k => allText.includes(k))
  };
}

/**
 * ページタイプの日本語名を取得
 */
function getPageTypeName(type) {
  const names = {
    'top': 'トップ',
    'service': 'サービス紹介',
    'contact': 'お問い合わせ',
    'pricing': '料金案内',
    'company': '会社概要',
    'about': 'アバウト',
    'blog': 'ブログ',
    'news': 'ニュース',
    'portfolio': '実績紹介',
    'general': '汎用'
  };

  return names[type] || '汎用';
}
