/**
 * コンポーネント検出モジュール
 * UI要素からコンポーネントを検出・分析する機能を提供
 */

/**
 * データからUIコンポーネントを検出
 * @param {Object} data - 解析データ
 * @returns {Object} 検出されたコンポーネント情報
 */
function detectComponents(data) {
  try {
    if (!data || !data.elements || !Array.isArray(data.elements)) {
      return { hasComponents: false };
    }

    const elements = data.elements;
    const result = {
      hasComponents: elements.length > 0,
      components: []
    };

    // ヒーローセクションの検出
    const hero = detectHero(elements, data.textBlocks);
    if (hero.exists) {
      result.hasHero = hero;
      result.components.push({
        type: 'hero',
        confidence: hero.confidence,
        position: hero.position
      });
    }

    // ナビゲーションバーの検出
    const navbar = detectNavbar(elements);
    if (navbar.exists) {
      result.hasNavbar = navbar;
      result.components.push({
        type: 'navbar',
        confidence: navbar.confidence,
        position: navbar.position
      });
    }

    // フッターの検出
    const footer = detectFooter(elements, data.textBlocks);
    if (footer.exists) {
      result.hasFooter = footer;
      result.components.push({
        type: 'footer',
        confidence: footer.confidence,
        position: footer.position
      });
    }

    // カードコンポーネントの検出
    const cards = detectCards(elements);
    if (cards.length > 0) {
      result.hasCards = cards;
      result.components.push({
        type: 'card_group',
        count: cards.length,
        items: cards.map(card => ({
          type: 'card',
          position: card.position
        }))
      });
    }

    // フィーチャーリストの検出
    const featureList = detectFeatureList(elements, data.textBlocks);
    if (featureList.exists) {
      result.hasFeatureList = featureList;
      result.components.push({
        type: 'feature_list',
        confidence: featureList.confidence,
        count: featureList.count
      });
    }

    // コンタクトフォームの検出
    const contactForm = detectContactForm(elements, data.textBlocks);
    if (contactForm.exists) {
      result.hasContactForm = contactForm;
      result.components.push({
        type: 'contact_form',
        confidence: contactForm.confidence,
        position: contactForm.position
      });
    }

    return result;
  } catch (error) {
    console.error('コンポーネント検出中にエラーが発生しました:', error);
    return { hasComponents: false };
  }
}

/**
 * ヒーローセクションを検出
 * @param {Array} elements - UI要素配列
 * @param {Array} textBlocks - テキストブロック配列
 * @returns {Object} ヒーローセクション情報
 */
function detectHero(elements, textBlocks) {
  // 大きな画像要素を見つける
  const largeImages = elements.filter(el =>
    el.type === 'image' &&
    el.position.width > 600 &&
    el.position.y < 500 // 上部に存在
  );

  if (largeImages.length === 0) {
    return { exists: false };
  }

  // 最も大きな画像を選択
  const primaryImage = largeImages.sort((a, b) =>
    (b.position.width * b.position.height) - (a.position.width * a.position.height)
  )[0];

  // ヒーロー領域内のテキストを見つける
  const heroPosition = { ...primaryImage.position };

  // 見出しテキストがあるか確認
  const headings = textBlocks ? textBlocks.filter(text =>
    text.fontSize >= 24 &&
    isOverlapping(text.position, heroPosition)
  ) : [];

  // 信頼度の計算（画像が大きく、見出しテキストがある場合は高信頼度）
  const sizeScore = Math.min(1, (primaryImage.position.width * primaryImage.position.height) / (1200 * 600));
  const headingScore = Math.min(1, headings.length * 0.5);
  const confidence = (sizeScore * 0.7 + headingScore * 0.3);

  return {
    exists: true,
    confidence: parseFloat(confidence.toFixed(2)),
    position: heroPosition,
    hasHeading: headings.length > 0,
    imageElement: primaryImage.id
  };
}

/**
 * ナビゲーションバーを検出
 * @param {Array} elements - UI要素配列
 * @returns {Object} ナビゲーションバー情報
 */
function detectNavbar(elements) {
  // 上部にある水平方向に並んだ小さな要素のグループを探す
  const topElements = elements.filter(el =>
    el.position.y < 150 && // 上部にある
    el.position.height < 100 // 比較的小さい
  );

  if (topElements.length < 3) {
    return { exists: false };
  }

  // 水平方向に並んだ要素をグループ化
  const horizontalGroups = groupHorizontalElements(topElements);

  if (horizontalGroups.length === 0 || horizontalGroups[0].elements.length < 3) {
    return { exists: false };
  }

  const navbarGroup = horizontalGroups[0];

  // ナビゲーションバーの境界を計算
  const minX = Math.min(...navbarGroup.elements.map(el => el.position.x));
  const minY = Math.min(...navbarGroup.elements.map(el => el.position.y));
  const maxX = Math.max(...navbarGroup.elements.map(el => el.position.x + el.position.width));
  const maxY = Math.max(...navbarGroup.elements.map(el => el.position.y + el.position.height));

  // 信頼度の計算
  const itemScore = Math.min(1, navbarGroup.elements.length / 6);
  const positionScore = Math.max(0, 1 - minY / 200); // 上部にあるほど高い
  const widthScore = Math.min(1, (maxX - minX) / 800); // 幅が広いほど高い

  const confidence = (itemScore * 0.4 + positionScore * 0.4 + widthScore * 0.2);

  return {
    exists: true,
    confidence: parseFloat(confidence.toFixed(2)),
    position: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    },
    itemCount: navbarGroup.elements.length
  };
}

/**
 * フッターを検出
 * @param {Array} elements - UI要素配列
 * @param {Array} textBlocks - テキストブロック配列
 * @returns {Object} フッター情報
 */
function detectFooter(elements, textBlocks) {
  if (!elements.length) {
    return { exists: false };
  }

  // 最下部の要素の位置を見つける
  const maxY = Math.max(...elements.map(el => el.position.y + el.position.height));

  // 下部にある要素を抽出
  const bottomElements = elements.filter(el =>
    (el.position.y + el.position.height) > (maxY - 200) && // 最下部から200px以内
    el.position.width > 500 // 幅広の要素
  );

  if (bottomElements.length === 0) {
    return { exists: false };
  }

  // フッター候補の領域を計算
  const minY = Math.min(...bottomElements.map(el => el.position.y));
  const minX = Math.min(...bottomElements.map(el => el.position.x));
  const maxX = Math.max(...bottomElements.map(el => el.position.x + el.position.width));

  // フッター内のテキストを確認
  const footerTexts = textBlocks ? textBlocks.filter(text =>
    text.position.y >= minY &&
    text.position.y <= maxY
  ) : [];

  // 一般的なフッターキーワードの検索
  const footerKeywords = ['copyright', '©', 'all rights', 'プライバシー', '利用規約', 'terms', 'privacy'];
  const hasFooterKeywords = footerTexts.some(text =>
    footerKeywords.some(keyword => text.text.toLowerCase().includes(keyword))
  );

  // 信頼度の計算
  const positionScore = Math.min(1, (maxY - minY) / 300); // 適度な高さ
  const widthScore = Math.min(1, (maxX - minX) / 1000); // 幅が広い
  const keywordScore = hasFooterKeywords ? 1 : 0.3;

  const confidence = (positionScore * 0.3 + widthScore * 0.3 + keywordScore * 0.4);

  return {
    exists: true,
    confidence: parseFloat(confidence.toFixed(2)),
    position: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    },
    hasFooterText: hasFooterKeywords
  };
}

/**
 * カードコンポーネントを検出
 * @param {Array} elements - UI要素配列
 * @returns {Array} 検出されたカード配列
 */
function detectCards(elements) {
  // カード候補を抽出（画像と他の要素が近接している）
  const cardCandidates = [];

  const imageElements = elements.filter(el => el.type === 'image');

  // 各画像に対して、近くにあるテキスト要素やボタンを見つける
  imageElements.forEach(image => {
    const nearbyElements = elements.filter(el =>
      el !== image &&
      el.type !== 'image' &&
      isNearby(image.position, el.position, 50) // 50px以内の距離
    );

    if (nearbyElements.length > 0) {
      // カード要素のグループを作成
      const cardElements = [image, ...nearbyElements];

      // カードの境界を計算
      const minX = Math.min(...cardElements.map(el => el.position.x));
      const minY = Math.min(...cardElements.map(el => el.position.y));
      const maxX = Math.max(...cardElements.map(el => el.position.x + el.position.width));
      const maxY = Math.max(...cardElements.map(el => el.position.y + el.position.height));

      // カードの比率を確認（極端に細長いものは除外）
      const width = maxX - minX;
      const height = maxY - minY;
      const aspectRatio = width / height;

      if (aspectRatio >= 0.5 && aspectRatio <= 2.5) {
        cardCandidates.push({
          elements: cardElements,
          position: {
            x: minX,
            y: minY,
            width,
            height
          }
        });
      }
    }
  });

  // 類似したサイズのカードをグループ化
  const similarSizeCards = groupSimilarSizeElements(cardCandidates);

  // 3つ以上の類似カードがある場合、それらをカードコンポーネントとして認識
  if (similarSizeCards.length > 0 && similarSizeCards[0].elements.length >= 3) {
    return similarSizeCards[0].elements;
  }

  return [];
}

/**
 * フィーチャーリストを検出
 * @param {Array} elements - UI要素配列
 * @param {Array} textBlocks - テキストブロック配列
 * @returns {Object} フィーチャーリスト情報
 */
function detectFeatureList(elements, textBlocks) {
  if (!elements.length || !textBlocks || !textBlocks.length) {
    return { exists: false };
  }

  // アイコン要素を見つける
  const iconElements = elements.filter(el =>
    (el.type === 'icon' || el.type === 'image') &&
    el.position.width < 100 &&
    el.position.height < 100
  );

  if (iconElements.length < 3) {
    return { exists: false };
  }

  // アイコン周辺のテキストを見つける
  const featureItems = [];

  iconElements.forEach(icon => {
    const nearbyTexts = textBlocks.filter(text =>
      isNearby(icon.position, text.position, 100)
    );

    if (nearbyTexts.length > 0) {
      featureItems.push({
        icon,
        texts: nearbyTexts
      });
    }
  });

  // 類似した縦位置のアイテムをグループ化
  const featureGroups = [];

  featureItems.forEach(item => {
    const itemY = item.icon.position.y;

    // 既存グループに追加するか、新しいグループを作成
    const existingGroup = featureGroups.find(group =>
      Math.abs(group[0].icon.position.y - itemY) < 50
    );

    if (existingGroup) {
      existingGroup.push(item);
    } else {
      featureGroups.push([item]);
    }
  });

  // フィーチャーリストとしての信頼度を計算
  const totalItems = featureItems.length;
  const groupCount = featureGroups.length;

  if (totalItems >= 3) {
    const countScore = Math.min(1, totalItems / 6);
    const alignmentScore = groupCount >= 2 ? 1 : 0.5;

    const confidence = (countScore * 0.7 + alignmentScore * 0.3);

    return {
      exists: true,
      confidence: parseFloat(confidence.toFixed(2)),
      count: totalItems,
      groups: groupCount
    };
  }

  return { exists: false };
}

/**
 * コンタクトフォームを検出
 * @param {Array} elements - UI要素配列
 * @param {Array} textBlocks - テキストブロック配列
 * @returns {Object} コンタクトフォーム情報
 */
function detectContactForm(elements, textBlocks) {
  if (!elements.length) {
    return { exists: false };
  }

  // フォーム要素やインプット要素を探す
  const formElements = elements.filter(el =>
    el.type === 'form' ||
    el.type === 'input' ||
    el.type === 'textarea'
  );

  if (formElements.length < 2) {
    return { exists: false };
  }

  // フォーム関連のキーワードを含むテキストを探す
  const formKeywords = ['contact', 'お問い合わせ', 'お名前', 'メール', 'email', '送信', 'submit', 'お問合せ'];

  const formTexts = textBlocks ? textBlocks.filter(text =>
    formKeywords.some(keyword => text.text.toLowerCase().includes(keyword))
  ) : [];

  // フォーム要素の境界を計算
  const minX = Math.min(...formElements.map(el => el.position.x));
  const minY = Math.min(...formElements.map(el => el.position.y));
  const maxX = Math.max(...formElements.map(el => el.position.x + el.position.width));
  const maxY = Math.max(...formElements.map(el => el.position.y + el.position.height));

  // ボタン要素を探す（フォーム送信ボタン）
  const buttonElements = elements.filter(el =>
    el.type === 'button' &&
    el.position.y >= minY &&
    el.position.y <= maxY
  );

  // 信頼度の計算
  const elementScore = Math.min(1, formElements.length / 5);
  const keywordScore = Math.min(1, formTexts.length / 3);
  const buttonScore = buttonElements.length > 0 ? 1 : 0.3;

  const confidence = (elementScore * 0.4 + keywordScore * 0.4 + buttonScore * 0.2);

  if (confidence > 0.5) {
    return {
      exists: true,
      confidence: parseFloat(confidence.toFixed(2)),
      position: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      },
      fieldCount: formElements.length,
      hasButton: buttonElements.length > 0
    };
  }

  return { exists: false };
}

/**
 * 水平方向に並んだ要素をグループ化
 * @param {Array} elements - UI要素配列
 * @returns {Array} 水平方向のグループ配列
 */
function groupHorizontalElements(elements) {
  // 要素をY位置でソート
  const sortedByY = [...elements].sort((a, b) => a.position.y - b.position.y);

  // Y位置が近い要素をグループ化
  const yGroups = [];
  let currentGroup = [sortedByY[0]];

  for (let i = 1; i < sortedByY.length; i++) {
    const prevElement = sortedByY[i - 1];
    const currentElement = sortedByY[i];

    if (Math.abs(currentElement.position.y - prevElement.position.y) < 20) {
      // 同じグループに追加
      currentGroup.push(currentElement);
    } else {
      // 新しいグループを開始
      yGroups.push(currentGroup);
      currentGroup = [currentElement];
    }
  }

  if (currentGroup.length > 0) {
    yGroups.push(currentGroup);
  }

  // 各グループをX位置でソートし、水平方向の並びを確認
  const horizontalGroups = yGroups
    .filter(group => group.length >= 3) // 3つ以上の要素が必要
    .map(group => {
      const sortedByX = [...group].sort((a, b) => a.position.x - b.position.x);
      return {
        elements: sortedByX,
        averageY: sortedByX.reduce((sum, el) => sum + el.position.y, 0) / sortedByX.length,
        width: Math.max(...sortedByX.map(el => el.position.x + el.position.width)) -
          Math.min(...sortedByX.map(el => el.position.x))
      };
    })
    .sort((a, b) => a.averageY - b.averageY); // 上から順に並べる

  return horizontalGroups;
}

/**
 * 類似サイズの要素をグループ化
 * @param {Array} elements - UI要素配列
 * @returns {Array} 類似サイズのグループ配列
 */
function groupSimilarSizeElements(elements) {
  if (!elements.length) return [];

  // サイズの類似度に基づいてグループ化
  const groups = [];

  // 各要素について
  elements.forEach(element => {
    const { width, height } = element.position;

    // 既存グループに追加するか確認
    let addedToGroup = false;

    for (const group of groups) {
      const referenceElement = group.elements[0];
      const referenceWidth = referenceElement.position.width;
      const referenceHeight = referenceElement.position.height;

      // サイズの類似度を確認
      if (
        Math.abs(width - referenceWidth) / referenceWidth < 0.2 &&
        Math.abs(height - referenceHeight) / referenceHeight < 0.2
      ) {
        group.elements.push(element);
        addedToGroup = true;
        break;
      }
    }

    // 既存グループに追加されなければ新しいグループを作成
    if (!addedToGroup) {
      groups.push({
        elements: [element]
      });
    }
  });

  // 要素数でグループをソート
  return groups.sort((a, b) => b.elements.length - a.elements.length);
}

/**
 * 2つの領域が重なっているかを確認
 * @param {Object} pos1 - 1つ目の位置情報
 * @param {Object} pos2 - 2つ目の位置情報
 * @returns {boolean} 重なっているか
 */
function isOverlapping(pos1, pos2) {
  return !(
    pos1.x + pos1.width < pos2.x ||
    pos2.x + pos2.width < pos1.x ||
    pos1.y + pos1.height < pos2.y ||
    pos2.y + pos2.height < pos1.y
  );
}

/**
 * 2つの領域が近いかを確認
 * @param {Object} pos1 - 1つ目の位置情報
 * @param {Object} pos2 - 2つ目の位置情報
 * @param {number} threshold - 距離の閾値
 * @returns {boolean} 近いか
 */
function isNearby(pos1, pos2, threshold) {
  // 中心点の距離を計算
  const center1 = {
    x: pos1.x + pos1.width / 2,
    y: pos1.y + pos1.height / 2
  };

  const center2 = {
    x: pos2.x + pos2.width / 2,
    y: pos2.y + pos2.height / 2
  };

  const distance = Math.sqrt(
    Math.pow(center2.x - center1.x, 2) +
    Math.pow(center2.y - center1.y, 2)
  );

  return distance <= threshold;
}

// モジュールのエクスポート
export {
  detectComponents,
  detectHero,
  detectNavbar,
  detectCards
};
