/**
 * レイアウト解析モジュール
 * レイアウト構造とグリッド分析機能を提供
 */

/**
 * レイアウト構造を分析
 * @param {Array} elements - UI要素配列
 * @param {Array} sections - セクション配列
 * @returns {Object} レイアウト構造解析結果
 */
function analyzeLayoutStructure(elements, sections) {
  try {
    if (!Array.isArray(elements) || elements.length === 0) {
      return {
        layoutType: 'unknown',
        gridSystem: null,
        structureType: 'unknown',
        alignmentScore: 0
      };
    }

    // セクション情報がなければ要素の位置から仮のセクションを構築
    const workingSections = Array.isArray(sections) && sections.length > 0 ?
      sections : inferSectionsFromElements(elements);

    // 水平方向の整列分析
    const horizontalAlignmentData = analyzeHorizontalAlignment(elements);

    // グリッドシステムを検出
    const gridSystem = detectGridSystem(elements, horizontalAlignmentData);

    // レイアウト構造タイプを推定
    const structureType = inferLayoutStructureType(workingSections, elements);

    // 縦方向のコンテナの重なりを分析
    const verticalFlow = analyzeVerticalFlow(workingSections);

    return {
      layoutType: determineLayoutType(horizontalAlignmentData, gridSystem, structureType),
      gridSystem,
      structureType,
      horizontalAlignment: horizontalAlignmentData,
      verticalFlow,
      alignmentScore: calculateAlignmentScore(elements),
      sections: workingSections.map(section => ({
        id: section.id,
        type: section.section_type,
        position: section.position
      }))
    };
  } catch (error) {
    console.error('レイアウト構造分析中にエラーが発生しました:', error);
    return {
      layoutType: 'unknown',
      gridSystem: null,
      structureType: 'unknown',
      alignmentScore: 0
    };
  }
}

/**
 * 要素の位置から仮のセクションを推定
 * @param {Array} elements - UI要素配列
 * @returns {Array} 推定されたセクション配列
 */
function inferSectionsFromElements(elements) {
  // 要素をY位置でソート
  const sortedByY = [...elements].sort((a, b) => a.position.y - b.position.y);

  // 要素をY位置のクラスタに分類（近い位置のものをグループ化）
  const clusters = [];
  let currentCluster = [sortedByY[0]];
  const yThreshold = 100; // Y位置の閾値（これ以上離れていたら別セクション）

  for (let i = 1; i < sortedByY.length; i++) {
    const prevElement = sortedByY[i - 1];
    const currentElement = sortedByY[i];

    if (currentElement.position.y - (prevElement.position.y + prevElement.position.height) > yThreshold) {
      // 新しいクラスタを開始
      clusters.push(currentCluster);
      currentCluster = [currentElement];
    } else {
      // 現在のクラスタに追加
      currentCluster.push(currentElement);
    }
  }
  clusters.push(currentCluster);

  // クラスタからセクションを作成
  return clusters.map((cluster, index) => {
    // セクション境界を計算
    const minX = Math.min(...cluster.map(el => el.position.x));
    const minY = Math.min(...cluster.map(el => el.position.y));
    const maxX = Math.max(...cluster.map(el => el.position.x + el.position.width));
    const maxY = Math.max(...cluster.map(el => el.position.y + el.position.height));

    // セクションタイプを推定
    let section_type = 'content';
    if (index === 0) section_type = 'header';
    if (index === clusters.length - 1) section_type = 'footer';
    if (index === 1 && clusters.length > 2) section_type = 'hero';

    return {
      id: `inferred_section_${index}`,
      section_type,
      position: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      },
      elements: cluster.map(el => el.id)
    };
  });
}

/**
 * 水平方向の整列を分析
 * @param {Array} elements - UI要素配列
 * @returns {Object} 水平整列分析結果
 */
function analyzeHorizontalAlignment(elements) {
  // X位置の頻度を集計
  const xPositions = {};

  elements.forEach(element => {
    const leftEdge = Math.round(element.position.x / 5) * 5; // 5px単位で丸める
    const rightEdge = Math.round((element.position.x + element.position.width) / 5) * 5;
    const centerPos = Math.round((element.position.x + element.position.width / 2) / 5) * 5;

    xPositions[leftEdge] = (xPositions[leftEdge] || 0) + 1;
    xPositions[rightEdge] = (xPositions[rightEdge] || 0) + 1;
    xPositions[centerPos] = (xPositions[centerPos] || 0) + 1;
  });

  // 頻出X位置を抽出（主要整列位置）
  const sortedPositions = Object.entries(xPositions)
    .sort((a, b) => b[1] - a[1])
    .filter(([pos, count]) => count >= Math.max(2, elements.length * 0.1));

  // 左右の余白を推定
  const allLeftEdges = elements.map(el => el.position.x);
  const allRightEdges = elements.map(el => el.position.x + el.position.width);

  const leftMargin = Math.min(...allLeftEdges);
  const rightMargin = 1200 - Math.max(...allRightEdges); // 1200pxを仮の全幅と想定

  return {
    alignmentPositions: sortedPositions.map(([pos, count]) => ({
      position: parseInt(pos),
      frequency: count
    })),
    margins: {
      left: leftMargin,
      right: rightMargin,
      isSymmetrical: Math.abs(leftMargin - rightMargin) < 20
    },
    dominantPositions: sortedPositions.slice(0, 3).map(([pos]) => parseInt(pos))
  };
}

/**
 * グリッドシステムを検出
 * @param {Array} elements - UI要素配列
 * @param {Object} horizontalData - 水平整列データ
 * @returns {Object|null} 検出されたグリッドシステム
 */
function detectGridSystem(elements, horizontalData) {
  if (elements.length < 3 || !horizontalData.alignmentPositions.length) {
    return null;
  }

  // 主要な位置のX値から列の間隔を推定
  const positions = horizontalData.alignmentPositions
    .map(pos => pos.position)
    .sort((a, b) => a - b);

  // 間隔の計算
  const intervals = [];
  for (let i = 1; i < positions.length; i++) {
    const interval = positions[i] - positions[i - 1];
    if (interval > 20) { // 意味のある間隔のみを考慮
      intervals.push(interval);
    }
  }

  // 最も頻出する間隔を計算
  const intervalFrequency = {};
  intervals.forEach(interval => {
    // 近い値をグループ化（10px以内）
    const normalizedInterval = Math.round(interval / 10) * 10;
    intervalFrequency[normalizedInterval] = (intervalFrequency[normalizedInterval] || 0) + 1;
  });

  // 最も一般的な間隔を見つける
  let dominantInterval = 0;
  let maxFrequency = 0;

  Object.entries(intervalFrequency).forEach(([interval, frequency]) => {
    if (frequency > maxFrequency) {
      dominantInterval = parseInt(interval);
      maxFrequency = frequency;
    }
  });

  // 一般的なグリッドシステムとマッチング
  const commonGrids = [
    { columns: 12, gutter: 30 },
    { columns: 16, gutter: 20 },
    { columns: 8, gutter: 20 },
    { columns: 6, gutter: 15 },
    { columns: 4, gutter: 20 }
  ];

  let bestMatch = { columns: 0, gutter: 0, confidence: 0 };
  const containerWidth = positions[positions.length - 1] - positions[0];

  commonGrids.forEach(grid => {
    // 異なるグリッドシステムとの一致度を計算
    const theoreticalColumnWidth = containerWidth / grid.columns - grid.gutter;

    // 要素の幅とグリッドカラム幅の一致を確認
    let matchCount = 0;
    elements.forEach(element => {
      const elementWidth = element.position.width;
      // 要素幅がn列分の幅に近いかチェック
      for (let n = 1; n <= grid.columns; n++) {
        const theoreticalWidth = n * theoreticalColumnWidth + (n - 1) * grid.gutter;
        if (Math.abs(elementWidth - theoreticalWidth) < 20) {
          matchCount++;
          break;
        }
      }
    });

    const confidence = matchCount / elements.length;
    if (confidence > bestMatch.confidence) {
      bestMatch = {
        ...grid,
        confidence
      };
    }
  });

  // 十分な信頼度がない場合はカスタムグリッドを推測
  if (bestMatch.confidence < 0.3) {
    return {
      type: 'custom',
      estimatedColumnWidth: dominantInterval,
      possibleColumns: Math.round(containerWidth / dominantInterval),
      confidence: 0.5
    };
  }

  return {
    type: 'standard',
    columns: bestMatch.columns,
    gutter: bestMatch.gutter,
    columnWidth: Math.round(containerWidth / bestMatch.columns - bestMatch.gutter),
    confidence: bestMatch.confidence
  };
}

/**
 * レイアウト構造タイプを推測
 * @param {Array} sections - セクション配列
 * @param {Array} elements - UI要素配列
 * @returns {string} 推測されたレイアウト構造タイプ
 */
function inferLayoutStructureType(sections, elements) {
  // 要素のタイプを集計
  const elementTypes = {};
  elements.forEach(element => {
    elementTypes[element.type] = (elementTypes[element.type] || 0) + 1;
  });

  // カード要素が多い場合はカードベースのレイアウト
  if (elementTypes['card'] && elementTypes['card'] >= 3) {
    return 'card_based';
  }

  // 画像が多い場合はギャラリースタイル
  if (elementTypes['image'] && elementTypes['image'] >= Math.max(5, elements.length * 0.5)) {
    return 'gallery';
  }

  // セクションの数と配置からレイアウトタイプを推測
  if (sections.length <= 1) {
    return 'single_section';
  }

  if (sections.length >= 4) {
    const hasSidebar = sections.some(section =>
      section.position.width < 300 &&
      section.position.height > 400
    );

    if (hasSidebar) {
      return 'multi_column_with_sidebar';
    }

    return 'multi_section';
  }

  // デフォルトはシンプルな複数セクション
  return 'standard';
}

/**
 * レイアウトタイプを決定
 * @param {Object} horizontalData - 水平整列データ
 * @param {Object|null} gridSystem - グリッドシステム
 * @param {string} structureType - 構造タイプ
 * @returns {string} レイアウトタイプ
 */
function determineLayoutType(horizontalData, gridSystem, structureType) {
  // 左右余白が対称的でグリッドシステムがある場合はグリッドレイアウト
  if (horizontalData.margins.isSymmetrical && gridSystem && gridSystem.confidence > 0.5) {
    return 'grid';
  }

  // 構造タイプに基づく分類
  switch (structureType) {
    case 'card_based':
      return 'cards';
    case 'gallery':
      return 'gallery';
    case 'multi_column_with_sidebar':
      return 'sidebar';
    case 'single_section':
      return 'single';
    default:
      return 'standard';
  }
}

/**
 * 縦方向のコンテナの流れを分析
 * @param {Array} sections - セクション配列
 * @returns {Object} 縦方向フロー分析結果
 */
function analyzeVerticalFlow(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return {
      sectionCount: 0,
      averageSectionHeight: 0,
      flowType: 'unknown'
    };
  }

  // セクションの高さを分析
  const sectionHeights = sections.map(section => section.position.height);
  const averageSectionHeight = sectionHeights.reduce((sum, height) => sum + height, 0) / sections.length;

  // セクションの均一性を評価
  const heightVariance = sectionHeights.reduce((sum, height) => sum + Math.pow(height - averageSectionHeight, 2), 0) / sections.length;
  const isUniform = heightVariance < 10000; // 分散が小さい場合は均一と判断

  // フロータイプを決定
  let flowType = 'mixed';

  if (sections.length <= 2) {
    flowType = 'minimal';
  } else if (isUniform && sections.length >= 4) {
    flowType = 'uniform_sections';
  } else if (sections.length >= 5) {
    flowType = 'long_scroll';
  }

  return {
    sectionCount: sections.length,
    averageSectionHeight: Math.round(averageSectionHeight),
    heightVariance: Math.round(heightVariance),
    isUniform,
    flowType
  };
}

/**
 * 要素の整列スコアを計算
 * @param {Array} elements - UI要素配列
 * @returns {number} 整列スコア（0〜1）
 */
function calculateAlignmentScore(elements) {
  if (!Array.isArray(elements) || elements.length <= 1) {
    return 1; // 要素が1つ以下の場合は完全に整列していると見なす
  }

  // 左端のX位置を整理
  const leftEdges = elements.map(el => el.position.x);

  // X位置を丸めてグループ化（10px刻み）
  const edgeGroups = {};
  leftEdges.forEach(x => {
    const roundedX = Math.round(x / 10) * 10;
    edgeGroups[roundedX] = (edgeGroups[roundedX] || 0) + 1;
  });

  // 最も頻出するX位置を見つける
  const maxCount = Math.max(...Object.values(edgeGroups));

  // 整列スコアを計算（最大頻度 / 全要素数）
  return maxCount / elements.length;
}

/**
 * PCとSPレイアウトを比較して違いを分析
 * @param {Object} pcData - PC用のデータ
 * @param {Object} spData - SP用のデータ
 * @returns {Object} レイアウト比較結果
 */
function compareLayouts(pcData, spData) {
  try {
    if (!pcData || !spData) {
      return { hasBothLayouts: false };
    }

    // 両レイアウトの解析を実行
    const pcElements = pcData.elements || [];
    const spElements = spData.elements || [];
    const pcSections = pcData.sections || [];
    const spSections = spData.sections || [];

    const pcLayout = analyzeLayoutStructure(pcElements, pcSections);
    const spLayout = analyzeLayoutStructure(spElements, spSections);

    // 基本的なレスポンシブ情報
    const result = {
      hasBothLayouts: true,
      pcLayoutType: pcLayout.layoutType,
      spLayoutType: spLayout.layoutType,
      columnChanges: [],
      stackedElements: []
    };

    // PC/SPでの要素の変化を検出
    // 1. IDが一致する要素のみを比較対象とする
    const pcElementsById = pcElements.reduce((acc, el) => {
      acc[el.id] = el;
      return acc;
    }, {});

    const spElementsById = spElements.reduce((acc, el) => {
      acc[el.id] = el;
      return acc;
    }, {});

    // 2. 共通する要素のIDを見つける
    const commonElementIds = Object.keys(pcElementsById).filter(id => spElementsById[id]);

    // 3. 各要素のレイアウト変化を分析
    commonElementIds.forEach(id => {
      const pcElement = pcElementsById[id];
      const spElement = spElementsById[id];

      // PCでは横並びだがSPでは縦並びになった要素を検出
      if (
        pcElement.position.width > pcElement.position.height * 1.2 &&
        spElement.position.width < spElement.position.height
      ) {
        result.columnChanges.push({
          id,
          pcPosition: pcElement.position,
          spPosition: spElement.position,
          changeType: 'width_reduced'
        });
      }

      // PCでは一定の幅を持つがSPでは画面幅いっぱいになった要素
      if (
        pcElement.position.width < 800 &&
        spElement.position.width > 300 &&
        spElement.position.x < 20
      ) {
        result.stackedElements.push({
          id,
          pcPosition: pcElement.position,
          spPosition: spElement.position,
          changeType: 'stacked'
        });
      }
    });

    // レスポンシブ戦略の推測
    result.responsiveStrategy = inferResponsiveStrategy(result, pcLayout, spLayout);

    return result;
  } catch (error) {
    console.error('レイアウト比較中にエラーが発生しました:', error);
    return { hasBothLayouts: false, error: error.message };
  }
}

/**
 * レスポンシブ戦略を推測
 * @param {Object} comparison - 比較結果
 * @param {Object} pcLayout - PCレイアウト解析結果
 * @param {Object} spLayout - SPレイアウト解析結果
 * @returns {string} 推測されたレスポンシブ戦略
 */
function inferResponsiveStrategy(comparison, pcLayout, spLayout) {
  // カラム変更が多い場合
  if (comparison.columnChanges.length >= 3) {
    return 'column_to_stack';
  }

  // 積み重ね要素が多い場合
  if (comparison.stackedElements.length >= 5) {
    return 'full_stack';
  }

  // SPのセクション数がPCより少ない場合は隠し要素がある
  if (pcLayout.sections.length > spLayout.sections.length + 1) {
    return 'responsive_hiding';
  }

  // グリッドシステムがPCにあってSPにはない場合
  if (pcLayout.gridSystem && (!spLayout.gridSystem || spLayout.gridSystem.type !== pcLayout.gridSystem.type)) {
    return 'grid_to_fluid';
  }

  // デフォルトはフルードレイアウト
  return 'fluid';
}

// モジュールのエクスポート
export {
  analyzeLayoutStructure,
  detectGridSystem,
  inferSectionsFromElements
};
