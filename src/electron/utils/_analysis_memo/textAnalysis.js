/**
 * テキスト解析ユーティリティモジュール
 * テキストの分析、パターン認識、セマンティック処理機能を提供します
 */

/**
 * テキストからキーワードを抽出する
 * @param {string} text - 解析するテキスト
 * @param {Object} options - 抽出オプション
 * @param {number} options.minWordLength - 最小単語長（デフォルト: 3）
 * @param {number} options.maxKeywords - 返す最大キーワード数（デフォルト: 10）
 * @param {string[]} options.stopWords - 除外する一般的な単語のリスト
 * @returns {Array<{word: string, frequency: number}>} - 頻度順にソートされたキーワードの配列
 */
function extractKeywords(text, options = {}) {
  try {
    const {
      minWordLength = 3,
      maxKeywords = 10,
      stopWords = ['and', 'the', 'is', 'in', 'to', 'of', 'for', 'with', 'on', 'at']
    } = options;

    if (!text || typeof text !== 'string') {
      return [];
    }

    // テキストを単語に分割
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '') // 特殊文字を削除
      .split(/\s+/) // スペースで分割
      .filter(word =>
        word.length >= minWordLength && // 最小長よりも長い
        !stopWords.includes(word) // ストップワードではない
      );

    // 単語の頻度をカウント
    const wordFrequency = {};
    words.forEach(word => {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    });

    // 頻度でソート
    return Object.entries(wordFrequency)
      .map(([word, frequency]) => ({ word, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, maxKeywords);
  } catch (error) {
    console.error('キーワード抽出中にエラーが発生しました:', error);
    return [];
  }
}

/**
 * テキストの感情分析を行う
 * @param {string} text - 分析するテキスト
 * @returns {Object} - 感情スコア（-1〜1）と主要な感情
 */
function analyzeSentiment(text) {
  try {
    if (!text || typeof text !== 'string') {
      return { score: 0, sentiment: 'neutral', confidence: 0 };
    }

    // 簡易的な感情分析（本番環境では機械学習モデルなどを使用）
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'happy', 'positive', 'best', 'love', 'wonderful', 'nice'];
    const negativeWords = ['bad', 'poor', 'terrible', 'awful', 'sad', 'negative', 'worst', 'hate', 'horrible', 'disappointing'];

    const words = text.toLowerCase().split(/\s+/);

    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    });

    const totalSentimentWords = positiveCount + negativeCount;
    if (totalSentimentWords === 0) {
      return { score: 0, sentiment: 'neutral', confidence: 0 };
    }

    const score = (positiveCount - negativeCount) / totalSentimentWords;
    let sentiment = 'neutral';
    if (score > 0.25) sentiment = 'positive';
    if (score < -0.25) sentiment = 'negative';

    const confidence = Math.min(1, totalSentimentWords / 10); // 信頼度の計算

    return {
      score: parseFloat(score.toFixed(2)),
      sentiment,
      confidence: parseFloat(confidence.toFixed(2))
    };
  } catch (error) {
    console.error('感情分析中にエラーが発生しました:', error);
    return { score: 0, sentiment: 'neutral', confidence: 0 };
  }
}

/**
 * テキストの言語を検出する
 * @param {string} text - 言語を検出するテキスト
 * @returns {Object} - 検出された言語とその信頼度
 */
function detectLanguage(text) {
  try {
    if (!text || typeof text !== 'string' || text.length < 10) {
      return { language: 'unknown', code: 'unknown', confidence: 0 };
    }

    // 言語ごとの特徴的な単語
    const languagePatterns = {
      english: { words: ['the', 'and', 'is', 'in', 'to', 'of', 'that'], code: 'en' },
      japanese: { words: ['は', 'を', 'に', 'の', 'が', 'です', 'ます'], code: 'ja' },
      spanish: { words: ['el', 'la', 'en', 'y', 'es', 'de', 'que'], code: 'es' },
      french: { words: ['le', 'la', 'et', 'en', 'est', 'je', 'vous'], code: 'fr' },
      german: { words: ['der', 'die', 'das', 'und', 'ist', 'in', 'zu'], code: 'de' }
    };

    // 各言語のパターン一致をカウント
    const matches = {};
    const lowerText = text.toLowerCase();

    Object.entries(languagePatterns).forEach(([language, pattern]) => {
      matches[language] = 0;
      pattern.words.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        const count = (lowerText.match(regex) || []).length;
        matches[language] += count;
      });
    });

    // 最も一致数の多い言語を特定
    let bestMatch = { language: 'unknown', code: 'unknown', count: 0 };
    Object.entries(matches).forEach(([language, count]) => {
      if (count > bestMatch.count) {
        bestMatch = {
          language,
          code: languagePatterns[language].code,
          count
        };
      }
    });

    // 信頼度を計算（一致数に基づく）
    let confidence = 0;
    if (bestMatch.count > 0) {
      // テキストの長さに対する一致数の比率に基づく信頼度
      confidence = Math.min(1, bestMatch.count / (text.length / 20));
    }

    return {
      language: bestMatch.language,
      code: bestMatch.code,
      confidence: parseFloat(confidence.toFixed(2))
    };
  } catch (error) {
    console.error('言語検出中にエラーが発生しました:', error);
    return { language: 'unknown', code: 'unknown', confidence: 0 };
  }
}

/**
 * テキストの要約を生成
 * @param {string} text - 要約するテキスト
 * @param {Object} options - 要約オプション
 * @param {number} options.maxSentences - 最大文数（デフォルト: 3）
 * @param {boolean} options.useLuhn - Luhnアルゴリズムを使用するか（デフォルト: true）
 * @returns {string} 要約されたテキスト
 */
function summarizeText(text, options = {}) {
  try {
    if (!text || typeof text !== 'string') {
      return '';
    }

    const { maxSentences = 3, useLuhn = true } = options;

    // テキストを文章に分割
    const sentences = text
      .replace(/([.!?。！？])\s*(?=[A-Z])/g, "$1|")
      .split("|")
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 10); // 短すぎる文は除外

    if (sentences.length <= maxSentences) {
      return text;
    }

    // 各文の重要度スコアを計算
    let sentenceScores;

    if (useLuhn) {
      // Luhnアルゴリズムによる要約
      sentenceScores = luhnSummarize(sentences);
    } else {
      // 単純な単語頻度による要約
      sentenceScores = frequencySummarize(sentences);
    }

    // スコア順にソート
    const scoredSentences = sentences
      .map((sentence, index) => ({ text: sentence, score: sentenceScores[index] || 0, index }))
      .sort((a, b) => b.score - a.score);

    // 上位n文を選択して元の順序に戻す
    const topSentences = scoredSentences
      .slice(0, maxSentences)
      .sort((a, b) => a.index - b.index)
      .map(item => item.text);

    return topSentences.join(' ');
  } catch (error) {
    console.error('テキスト要約中にエラーが発生しました:', error);
    return text.substring(0, 200) + '...'; // エラー時は単純に冒頭を返す
  }
}

/**
 * Luhnアルゴリズムによる文のスコアリング
 * @private
 * @param {Array} sentences - 文の配列
 * @returns {Array} 各文のスコア配列
 */
function luhnSummarize(sentences) {
  // すべての単語を抽出
  const allWords = sentences.join(' ')
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .split(/\s+/);

  // 単語の出現頻度を計算
  const wordFrequency = {};
  allWords.forEach(word => {
    if (word.length > 3) { // ストップワード対策として短い単語は除外
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    }
  });

  // 各文のスコアを計算
  return sentences.map(sentence => {
    const words = sentence
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
      .split(/\s+/);

    let score = 0;
    words.forEach(word => {
      if (word.length > 3 && wordFrequency[word] > 1) {
        score += wordFrequency[word];
      }
    });

    // 文の長さで正規化
    return words.length > 0 ? score / words.length : 0;
  });
}

/**
 * 単語頻度に基づく単純な要約アルゴリズム
 * @private
 * @param {Array} sentences - 文の配列
 * @returns {Array} 各文のスコア配列
 */
function frequencySummarize(sentences) {
  // すべての単語を抽出
  const allWords = sentences.join(' ')
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .split(/\s+/);

  // 単語の出現頻度を計算
  const wordFrequency = {};
  allWords.forEach(word => {
    if (word.length > 2) { // 短い単語は除外
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    }
  });

  // 各文のスコアを計算（単純に頻度の高い単語を含む文にスコアを与える）
  return sentences.map(sentence => {
    const words = sentence
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
      .split(/\s+/);

    let score = 0;
    words.forEach(word => {
      if (word.length > 2) {
        score += wordFrequency[word] || 0;
      }
    });

    return score;
  });
}

/**
 * テキストを主要なトピックに分類する
 * @param {string} text - 分類するテキスト
 * @returns {Array<{topic: string, confidence: number}>} - 信頼度順に並べられたトピックのリスト
 */
function classifyTopics(text) {
  try {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // 主要なトピックの定義
    const topics = {
      technology: ['software', 'hardware', 'program', 'computer', 'technology', 'digital', 'app', 'internet', 'data', 'code'],
      business: ['business', 'market', 'company', 'finance', 'investment', 'economy', 'startup', 'product', 'service', 'customer'],
      health: ['health', 'medical', 'doctor', 'hospital', 'disease', 'treatment', 'medicine', 'patient', 'therapy', 'wellness'],
      education: ['education', 'school', 'student', 'learn', 'teacher', 'course', 'knowledge', 'academic', 'university', 'training'],
      entertainment: ['movie', 'music', 'game', 'film', 'entertainment', 'play', 'show', 'actor', 'performance', 'art']
    };

    // テキスト内の各トピックの単語の出現をカウント
    const topicScores = {};
    const words = text.toLowerCase().split(/\s+/);

    Object.entries(topics).forEach(([topic, keywords]) => {
      topicScores[topic] = 0;
      words.forEach(word => {
        if (keywords.includes(word)) {
          topicScores[topic]++;
        }
      });
    });

    // トピックごとの信頼度を計算
    const totalMatches = Object.values(topicScores).reduce((a, b) => a + b, 0);
    const result = [];

    if (totalMatches > 0) {
      Object.entries(topicScores).forEach(([topic, count]) => {
        if (count > 0) {
          const confidence = count / totalMatches;
          result.push({
            topic,
            confidence: parseFloat(confidence.toFixed(2))
          });
        }
      });
    }

    return result.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    console.error('トピック分類中にエラーが発生しました:', error);
    return [];
  }
}

/**
 * テキストの複雑さを分析する
 * @param {string} text - 分析するテキスト
 * @returns {Object} - 複雑さ指標を含むオブジェクト
 */
function analyzeComplexity(text) {
  try {
    if (!text || typeof text !== 'string') {
      return {
        readabilityScore: 0,
        averageWordLength: 0,
        sentenceCount: 0,
        wordCount: 0,
        longWordCount: 0,
        complexity: 'unknown'
      };
    }

    // 文の数を計算
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;

    // 単語を抽出
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCount = words.length;

    // 平均単語長を計算
    const totalWordLength = words.reduce((sum, word) => sum + word.length, 0);
    const averageWordLength = wordCount > 0 ? totalWordLength / wordCount : 0;

    // 長い単語（6文字以上）の数
    const longWordCount = words.filter(word => word.length >= 6).length;
    const longWordPercentage = wordCount > 0 ? longWordCount / wordCount : 0;

    // 読みやすさスコアの計算（簡易的なFleschスコア）
    let readabilityScore = 0;
    if (sentenceCount > 0 && wordCount > 0) {
      // 簡易的なフォーミュラ: 高いほど読みやすい
      readabilityScore = 206.835 - (1.015 * (wordCount / sentenceCount)) - (84.6 * (totalWordLength / wordCount));
      readabilityScore = Math.max(0, Math.min(100, readabilityScore));
    }

    // 複雑さのレベルを決定
    let complexity = 'medium';
    if (readabilityScore >= 80) complexity = 'very easy';
    else if (readabilityScore >= 70) complexity = 'easy';
    else if (readabilityScore >= 50) complexity = 'medium';
    else if (readabilityScore >= 30) complexity = 'difficult';
    else complexity = 'very difficult';

    return {
      readabilityScore: parseFloat(readabilityScore.toFixed(2)),
      averageWordLength: parseFloat(averageWordLength.toFixed(2)),
      sentenceCount,
      wordCount,
      longWordCount,
      longWordPercentage: parseFloat(longWordPercentage.toFixed(2)),
      complexity
    };
  } catch (error) {
    console.error('複雑さ分析中にエラーが発生しました:', error);
    return {
      readabilityScore: 0,
      averageWordLength: 0,
      sentenceCount: 0,
      wordCount: 0,
      longWordCount: 0,
      complexity: 'unknown'
    };
  }
}

/**
 * テキスト間の類似度を測定します
 * @param {string} text1 - 比較する1つ目のテキスト
 * @param {string} text2 - 比較する2つ目のテキスト
 * @param {Object} options - オプション設定
 * @param {string} options.method - 類似度計算方法（'jaccard'|'cosine'|'levenshtein'のいずれか、デフォルトはjaccard）
 * @param {boolean} options.caseSensitive - 大文字小文字を区別するかどうか（デフォルトはfalse）
 * @param {boolean} options.normalize - 前処理で正規化するかどうか（デフォルトはtrue）
 * @returns {Object} 類似度分析結果
 */
function measureTextSimilarity(text1, text2, options = {}) {
  try {
    if (!text1 || !text2 || typeof text1 !== 'string' || typeof text2 !== 'string') {
      return {
        similarityScore: 0,
        method: 'none',
        error: '有効なテキストが提供されていません'
      };
    }

    // デフォルトオプション
    const defaultOptions = {
      method: 'jaccard',
      caseSensitive: false,
      normalize: true
    };

    const settings = { ...defaultOptions, ...options };

    // テキストの前処理
    let processedText1 = text1;
    let processedText2 = text2;

    if (!settings.caseSensitive) {
      processedText1 = processedText1.toLowerCase();
      processedText2 = processedText2.toLowerCase();
    }

    if (settings.normalize) {
      // 空白の正規化と記号の削除
      const normalizeText = (text) => {
        return text
          .replace(/\s+/g, ' ')
          .replace(/[,.!?;:'"()\[\]{}]/g, '')
          .trim();
      };

      processedText1 = normalizeText(processedText1);
      processedText2 = normalizeText(processedText2);
    }

    // 類似度計算
    let similarityScore = 0;
    let details = {};

    switch (settings.method) {
      case 'jaccard':
        // Jaccard類似度（単語の重複ベース）
        const tokenize = text => text.split(/\s+/).filter(Boolean);
        const words1 = new Set(tokenize(processedText1));
        const words2 = new Set(tokenize(processedText2));

        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);

        similarityScore = union.size === 0 ? 0 : intersection.size / union.size;
        details = {
          words1: words1.size,
          words2: words2.size,
          commonWords: intersection.size,
          totalUniqueWords: union.size
        };
        break;

      case 'cosine':
        // コサイン類似度（TF-IDF風の計算）
        const getWordFrequency = text => {
          const words = text.split(/\s+/).filter(Boolean);
          const freq = {};
          words.forEach(word => {
            freq[word] = (freq[word] || 0) + 1;
          });
          return freq;
        };

        const freq1 = getWordFrequency(processedText1);
        const freq2 = getWordFrequency(processedText2);

        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        // すべての一意な単語のセット
        const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);

        allWords.forEach(word => {
          const f1 = freq1[word] || 0;
          const f2 = freq2[word] || 0;

          dotProduct += f1 * f2;
          magnitude1 += f1 * f1;
          magnitude2 += f2 * f2;
        });

        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);

        similarityScore = magnitude1 && magnitude2 ? dotProduct / (magnitude1 * magnitude2) : 0;
        details = {
          vectorLength1: magnitude1,
          vectorLength2: magnitude2,
          dotProduct
        };
        break;

      case 'levenshtein':
        // レーベンシュタイン距離（編集距離）
        function levenshteinDistance(a, b) {
          const matrix = [];

          // 行列を初期化
          for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
          }

          for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
          }

          // 距離を計算
          for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
              if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
              } else {
                matrix[i][j] = Math.min(
                  matrix[i - 1][j - 1] + 1, // 置換
                  matrix[i][j - 1] + 1,   // 挿入
                  matrix[i - 1][j] + 1    // 削除
                );
              }
            }
          }

          return matrix[b.length][a.length];
        }

        const distance = levenshteinDistance(processedText1, processedText2);
        const maxLength = Math.max(processedText1.length, processedText2.length);

        // 距離から類似度を計算（1 - 正規化された距離）
        similarityScore = maxLength === 0 ? 1 : 1 - (distance / maxLength);
        details = {
          editDistance: distance,
          maxLength,
          text1Length: processedText1.length,
          text2Length: processedText2.length
        };
        break;

      default:
        return {
          similarityScore: 0,
          method: settings.method,
          error: '不明な類似度計算方法'
        };
    }

    return {
      similarityScore: parseFloat(similarityScore.toFixed(4)),
      method: settings.method,
      details
    };
  } catch (error) {
    console.error('テキスト類似度計算中にエラーが発生しました:', error);
    return {
      similarityScore: 0,
      method: options.method || 'unknown',
      error: error.message
    };
  }
}

// モジュールのエクスポート
export {
  extractKeywords,
  analyzeSentiment,
  detectLanguage,
  summarizeText,
  classifyTopics,
  analyzeComplexity,
  measureTextSimilarity
};
