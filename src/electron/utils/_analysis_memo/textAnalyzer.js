/**
 * テキスト解析モジュール
 * テキストの強調分析、階層構造解析機能を提供
 */

import * as textAnalysis from './textAnalysis.js';

/**
 * テキストの強調レベルを分析
 * @param {Array} textBlocks - テキストブロック配列
 * @returns {Object} 強調分析結果
 */
function analyzeTextEmphasis(textBlocks) {
  try {
    if (!Array.isArray(textBlocks) || textBlocks.length === 0) {
      return { allEmphasized: [], mainHeadings: [], subHeadings: [], paragraphs: [] };
    }

    // フォントサイズ順にソートしてテキスト階層を特定
    const sortedBySize = [...textBlocks].sort((a, b) => (b.fontSize || 16) - (a.fontSize || 16));

    // 最大フォントサイズを基準に相対的な強調レベルを計算
    const maxFontSize = Math.max(...textBlocks.map(block => block.fontSize || 16));
    const averageFontSize = textBlocks.reduce((sum, block) => sum + (block.fontSize || 16), 0) / textBlocks.length;

    // 強調レベルの計算（0〜1の値）
    const withEmphasisLevel = textBlocks.map(block => {
      const fontSize = block.fontSize || 16;
      const fontWeight = block.fontWeight || 400;

      // フォントサイズと太さから強調レベルを計算
      const sizeEmphasis = (fontSize - averageFontSize) / (maxFontSize - averageFontSize + 0.1);
      const weightEmphasis = (fontWeight - 400) / 500; // 400(normal)〜900(bold)

      // 総合的な強調レベル
      const emphasisLevel = Math.min(1, Math.max(0,
        sizeEmphasis * 0.7 + weightEmphasis * 0.3
      ));

      return {
        ...block,
        emphasisLevel: parseFloat(emphasisLevel.toFixed(2))
      };
    });

    // 強調レベルでソート
    const sortedByEmphasis = [...withEmphasisLevel].sort((a, b) => b.emphasisLevel - a.emphasisLevel);

    // 各カテゴリに分類
    const mainHeadings = sortedByEmphasis.filter(block => block.emphasisLevel >= 0.7);
    const subHeadings = sortedByEmphasis.filter(block => block.emphasisLevel >= 0.4 && block.emphasisLevel < 0.7);
    const paragraphs = sortedByEmphasis.filter(block => block.emphasisLevel < 0.4);

    // ページの主要テキスト解析
    const allText = textBlocks.map(block => block.text).join(' ');
    const keywordsResult = textAnalysis.extractKeywords(allText, { maxKeywords: 8 });
    const sentimentResult = textAnalysis.analyzeSentiment(allText);
    const languageResult = textAnalysis.detectLanguage(allText);
    const complexityResult = textAnalysis.analyzeComplexity(allText);

    return {
      // 強調テキスト分類
      allEmphasized: sortedByEmphasis,
      mainHeadings,
      subHeadings,
      paragraphs,

      // テキスト全体の分析
      textStats: {
        keywords: keywordsResult,
        sentiment: sentimentResult,
        language: languageResult,
        complexity: complexityResult,
        totalBlocks: textBlocks.length
      }
    };
  } catch (error) {
    console.error('テキスト強調分析中にエラーが発生しました:', error);
    return { allEmphasized: [], mainHeadings: [], subHeadings: [], paragraphs: [] };
  }
}

/**
 * テキストの重要性を分析する
 * @param {Array} textBlocks - テキストブロック配列
 * @param {Object} options - 分析オプション
 * @param {boolean} options.useLocation - 位置情報を重要性の計算に使用するか（デフォルト: true）
 * @param {boolean} options.useKeywords - キーワード一致を重要性の計算に使用するか（デフォルト: true）
 * @returns {Object} 重要性分析結果
 */
function analyzeTextImportance(textBlocks, options = {}) {
  try {
    if (!Array.isArray(textBlocks) || textBlocks.length === 0) {
      return { textBlocks: [], importantBlocks: [] };
    }

    // デフォルトオプション
    const defaultOptions = {
      useLocation: true,
      useKeywords: true
    };

    const settings = { ...defaultOptions, ...options };

    // 全テキストからキーワードを抽出
    const allText = textBlocks.map(block => block.text).join(' ');
    const keywords = textAnalysis.extractKeywords(allText, { maxKeywords: 15 })
      .map(keyword => keyword.word);

    // 各テキストブロックの重要性スコアを計算
    const blocksWithImportance = textBlocks.map((block, index) => {
      let importanceScore = 0;

      // 1. 基本スコア：強調レベルによる重み付け（既に計算されていればそれを使用）
      const emphasisLevel = block.emphasisLevel !== undefined ?
        block.emphasisLevel :
        (((block.fontSize || 16) / 16) * 0.7 + ((block.fontWeight || 400) / 900) * 0.3);

      importanceScore += emphasisLevel * 0.4; // 強調レベルの寄与度: 40%

      // 2. 位置スコア：上部に配置されたテキストほど重要と評価
      if (settings.useLocation && block.y !== undefined) {
        const locationScore = Math.max(0, 1 - (block.y / 1000)); // 縦位置が上部ほど高スコア
        importanceScore += locationScore * 0.3; // 位置の寄与度: 30%
      }

      // 3. キーワードスコア：重要キーワードを含むテキストを評価
      if (settings.useKeywords) {
        const text = block.text.toLowerCase();
        const keywordMatches = keywords.filter(keyword => text.includes(keyword)).length;
        const keywordScore = keywordMatches > 0 ? Math.min(1, keywordMatches / 5) : 0;
        importanceScore += keywordScore * 0.3; // キーワードの寄与度: 30%
      }

      // 4. 文字数で正規化（極端に短いテキストのスコアを調整）
      if (block.text.length < 5) {
        importanceScore *= (block.text.length / 5);
      }

      return {
        ...block,
        importanceScore: parseFloat(importanceScore.toFixed(2))
      };
    });

    // 重要性スコアでソート
    const sortedByImportance = [...blocksWithImportance].sort((a, b) =>
      b.importanceScore - a.importanceScore
    );

    // 重要なブロックを選出（上位30%または重要度0.5以上）
    const threshold = Math.max(
      sortedByImportance[Math.floor(sortedByImportance.length * 0.3)]?.importanceScore || 0,
      0.5
    );

    const importantBlocks = sortedByImportance.filter(block =>
      block.importanceScore >= threshold
    );

    return {
      textBlocks: sortedByImportance,
      importantBlocks,
      importanceStats: {
        averageScore: parseFloat((sortedByImportance.reduce((sum, block) => sum + block.importanceScore, 0) / sortedByImportance.length).toFixed(2)),
        highestScore: sortedByImportance[0]?.importanceScore || 0,
        topKeywords: keywords.slice(0, 5)
      }
    };
  } catch (error) {
    console.error('テキスト重要性分析中にエラーが発生しました:', error);
    return { textBlocks: [], importantBlocks: [] };
  }
}

/**
 * テキストの階層関係を分析
 * @param {Array} textBlocks - テキストブロック配列
 * @returns {Object} 階層関係分析結果
 */
function analyzeTextHierarchy(textBlocks) {
  try {
    if (!Array.isArray(textBlocks) || textBlocks.length === 0) {
      return { hierarchyLevels: [], structuredContent: {} };
    }

    // テキストの強調分析を実行
    const emphasisResult = analyzeTextEmphasis(textBlocks);

    // Y位置とフォントサイズでソート（読む順に並べる）
    const sortedByPosition = [...textBlocks].sort((a, b) => {
      // Y位置が大きく離れている場合はY位置優先
      if (Math.abs(a.position.y - b.position.y) > 20) {
        return a.position.y - b.position.y;
      }
      // Y位置が近い場合はX位置で判断（同じ行内の順序）
      return a.position.x - b.position.x;
    });

    // 階層レベルの割り当て
    const hierarchyLevels = sortedByPosition.map(block => {
      const matchingEmphasis = emphasisResult.allEmphasized.find(item => item.id === block.id);
      let level = 3; // デフォルトは本文レベル

      if (matchingEmphasis) {
        if (matchingEmphasis.emphasisLevel >= 0.7) level = 1; // 主見出し
        else if (matchingEmphasis.emphasisLevel >= 0.4) level = 2; // 副見出し
      }

      return {
        id: block.id,
        text: block.text,
        level,
        position: block.position
      };
    });

    // 階層構造を構築
    const structuredContent = buildContentStructure(hierarchyLevels);

    return {
      hierarchyLevels,
      structuredContent,
      readingOrder: sortedByPosition.map(block => block.id)
    };
  } catch (error) {
    console.error('テキスト階層分析中にエラーが発生しました:', error);
    return { hierarchyLevels: [], structuredContent: {} };
  }
}

/**
 * 階層レベル配列から構造化コンテンツを構築
 * @param {Array} hierarchyLevels - 階層レベル配列
 * @returns {Object} 構造化コンテンツ
 */
function buildContentStructure(hierarchyLevels) {
  const structure = {
    title: '（ページタイトル）',
    sections: []
  };

  let currentSection = null;
  let currentSubsection = null;

  // 最初のレベル1テキストをタイトルとして扱う
  const firstHeading = hierarchyLevels.find(item => item.level === 1);
  if (firstHeading) {
    structure.title = firstHeading.text;
  }

  hierarchyLevels.forEach(item => {
    if (item.level === 1) {
      // レベル1（主見出し）は新しいセクションを開始
      if (item !== firstHeading) { // タイトルとして使用した場合はスキップ
        currentSection = {
          heading: item.text,
          content: [],
          subsections: []
        };
        structure.sections.push(currentSection);
        currentSubsection = null;
      }
    } else if (item.level === 2) {
      // レベル2（副見出し）は新しいサブセクションを開始
      if (!currentSection) {
        // セクションがない場合は作成
        currentSection = {
          heading: '（無題セクション）',
          content: [],
          subsections: []
        };
        structure.sections.push(currentSection);
      }

      currentSubsection = {
        heading: item.text,
        content: []
      };
      currentSection.subsections.push(currentSubsection);
    } else {
      // レベル3（本文）は現在のコンテキストに追加
      if (currentSubsection) {
        // サブセクションがあればそこに追加
        currentSubsection.content.push(item.text);
      } else if (currentSection) {
        // セクションがあればそこに追加
        currentSection.content.push(item.text);
      } else {
        // どちらもなければ新しいセクションを作成
        currentSection = {
          heading: '（無題セクション）',
          content: [item.text],
          subsections: []
        };
        structure.sections.push(currentSection);
      }
    }
  });

  return structure;
}

/**
 * テキストのセマンティック分析を実行
 * @param {string} text - 解析するテキスト
 * @returns {Object} セマンティック分析結果
 */
function analyzeTextSemantics(text) {
  try {
    if (!text || typeof text !== 'string') {
      return {
        summary: '',
        topics: [],
        intent: 'unknown'
      };
    }

    // テキスト要約
    const summary = textAnalysis.summarizeText(text, { maxSentences: 2 });

    // トピック分類
    const topics = textAnalysis.classifyTopics(text);

    // 意図推定（シンプルな実装）
    let intent = 'informational';

    // 質問形式かチェック
    if (text.includes('?') || text.includes('ですか') || text.includes('でしょうか')) {
      intent = 'question';
    }

    // 行動喚起表現を検出
    const callToActionPhrases = [
      'お問い合わせ', 'ご連絡', 'ください', 'お待ちして', '詳細はこちら',
      'ご購入', 'クリック', 'お申し込み', '今すぐ', 'お試し'
    ];

    if (callToActionPhrases.some(phrase => text.includes(phrase))) {
      intent = 'call_to_action';
    }

    return {
      summary,
      topics,
      intent
    };
  } catch (error) {
    console.error('テキストセマンティック分析中にエラーが発生しました:', error);
    return {
      summary: '',
      topics: [],
      intent: 'unknown'
    };
  }
}

/**
 * 画像の周辺テキストを抽出し、alt候補を生成する
 * @param {Object} image - 画像要素
 * @param {Array} textBlocks - テキストブロック配列
 * @param {Object} options - オプション
 * @returns {Object} alt候補と周辺テキスト情報
 */
function generateAltTextCandidates(image, textBlocks, options = {}) {
  try {
    if (!image || !image.position || !Array.isArray(textBlocks) || textBlocks.length === 0) {
      return {
        suggestedAlt: '',
        nearbyText: [],
        confidence: 0
      };
    }

    // デフォルトオプション
    const defaultOptions = {
      proximityThresholdX: 150, // X軸の近接閾値（ピクセル）
      proximityThresholdY: 100, // Y軸の近接閾値（ピクセル）
      prioritizeHeadings: true, // 見出しテキストを優先するか
      maxCandidates: 5 // 最大候補数
    };

    const settings = { ...defaultOptions, ...options };
    const imagePos = image.position;
    const imageCenter = {
      x: imagePos.x + (imagePos.width / 2),
      y: imagePos.y + (imagePos.height / 2)
    };

    // 画像の周辺テキストを抽出
    const nearbyTexts = textBlocks
      .filter(block => {
        if (!block.position || !block.text) return false;

        const blockPos = block.position;
        const blockCenter = {
          x: blockPos.x + (blockPos.width / 2),
          y: blockPos.y + (blockPos.height / 2)
        };

        // 水平距離と垂直距離を計算
        const dx = Math.abs(blockCenter.x - imageCenter.x);
        const dy = Math.abs(blockCenter.y - imageCenter.y);

        // 距離が閾値以内のテキストを抽出
        return dx < settings.proximityThresholdX && dy < settings.proximityThresholdY;
      })
      .map(block => {
        // 画像からの距離を計算
        const blockPos = block.position;
        const blockCenter = {
          x: blockPos.x + (blockPos.width / 2),
          y: blockPos.y + (blockPos.height / 2)
        };

        const dx = Math.abs(blockCenter.x - imageCenter.x);
        const dy = Math.abs(blockCenter.y - imageCenter.y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 強調レベルを考慮（フォントサイズや太さから）
        const emphasisLevel = block.emphasisLevel ||
          ((block.fontSize ? block.fontSize / 24 : 0.5) * 0.7 +
            (block.fontWeight ? block.fontWeight / 700 : 0.5) * 0.3);

        // スコア計算（距離が近いほど、強調レベルが高いほど高スコア）
        const proximityScore = 1 - (distance / (Math.sqrt(settings.proximityThresholdX * settings.proximityThresholdX +
          settings.proximityThresholdY * settings.proximityThresholdY)));
        const score = proximityScore * 0.7 + (emphasisLevel || 0) * 0.3;

        return {
          text: block.text,
          distance,
          emphasisLevel: emphasisLevel || 0,
          score
        };
      })
      .sort((a, b) => b.score - a.score) // スコア降順
      .slice(0, settings.maxCandidates); // 上位候補を選択

    // 候補が見つからない場合
    if (nearbyTexts.length === 0) {
      return {
        suggestedAlt: '',
        nearbyText: [],
        confidence: 0
      };
    }

    // 最適なalt候補を選択
    let suggestedAlt = '';
    let confidence = 0;

    // 最高スコアのテキストをベースに
    const bestCandidate = nearbyTexts[0];

    // テキストを整形（長すぎる場合は適切な長さに調整）
    suggestedAlt = bestCandidate.text.trim();
    if (suggestedAlt.length > 50) {
      // 長すぎる場合は切り詰める（単語の区切りを考慮）
      const words = suggestedAlt.split(/\s+/);
      suggestedAlt = '';
      for (const word of words) {
        if ((suggestedAlt + ' ' + word).length <= 50) {
          suggestedAlt += (suggestedAlt ? ' ' : '') + word;
        } else {
          break;
        }
      }
      suggestedAlt += '...';
    }

    // 信頼度を計算
    confidence = Math.min(1, Math.max(0, bestCandidate.score));

    // 代替テキスト候補とメタデータを返す
    return {
      suggestedAlt,
      nearbyText: nearbyTexts.map(item => item.text),
      confidence: parseFloat(confidence.toFixed(2))
    };
  } catch (error) {
    console.error('代替テキスト候補生成中にエラーが発生しました:', error);
    return {
      suggestedAlt: '',
      nearbyText: [],
      confidence: 0
    };
  }
}

// モジュールのエクスポート
export {
  analyzeTextEmphasis,
  analyzeTextImportance,
  analyzeTextHierarchy,
  analyzeTextSemantics,
  generateAltTextCandidates
};
