/**
 * コードパーサーユーティリティ - SCSSとHTMLのブロック検出
 */

/**
 * SCSSコードからブロックを検出し、分類する
 * @param {string} scssCode - 解析するSCSSコード
 * @returns {Array} - 検出されたブロックの配列 [{name, code}, ...]
 */
export const detectScssBlocks = (scssCode) => {
  if (!scssCode) return [];

  // ブロックを格納する配列
  const blocks = [];
  // 見つかったブロック名を追跡
  const foundBlockNames = new Set();

  try {
    // 最初にすべての[pcl]-プレフィックスのクラスをスキャン
    const allBlocks = scssCode.match(/\.[pcl]-[a-zA-Z0-9_-]+(?:__[a-zA-Z0-9_-]+)?(?::[a-zA-Z0-9_-]+)?/g) || [];

    // ブロック名を抽出（. と :hover などを除く、__パーツの場合はメインブロック名のみ）
    allBlocks.forEach(block => {
      // 先頭の「.」を削除
      let blockName = block.substring(1);

      // エレメント（__xxx）や疑似クラス（:xxx）を持つ場合はメインブロック名を抽出
      if (blockName.includes('__')) {
        blockName = blockName.split('__')[0];
      } else if (blockName.includes(':')) {
        blockName = blockName.split(':')[0];
      }

      // すでに見つかっていなければ追加
      if (!foundBlockNames.has(blockName)) {
        foundBlockNames.add(blockName);
      }
    });

    // CSSのルールを行ごとに分解
    const lines = scssCode.split('\n');

    // 現在処理中のブロック情報
    let currentBlock = null;
    let blockContent = [];
    let bracketCount = 0;
    let isInComment = false;

    // 行ごとに処理
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // コメント開始・終了の検出
      if (line.includes('/*')) isInComment = true;
      if (line.includes('*/')) isInComment = false;

      // コメント内の行は処理をスキップ
      if (isInComment) {
        if (currentBlock) blockContent.push(lines[i]);
        continue;
      }

      // 空行の場合
      if (line === '') {
        if (currentBlock) blockContent.push(lines[i]);
        continue;
      }

      // ブロックの開始を検出（.p-XXX { や .c-XXX { や .l-XXX { パターン）
      const blockMatch = line.match(/^\.([pcl]-[a-zA-Z0-9_-]+)\s*{/);
      if (blockMatch && bracketCount === 0) {
        // 既存のブロックを保存
        if (currentBlock) {
          blocks.push({
            name: currentBlock,
            code: blockContent.join('\n')
          });
        }

        // 新しいブロックを開始
        currentBlock = blockMatch[1];
        blockContent = [lines[i]];
        bracketCount = 1; // 開始括弧をカウント
        continue;
      }

      // 擬似クラスの検出（.p-xxx:hover { や .c-xxx:active { や .l-xxx:hover { のパターン）
      const pseudoClassMatch = line.match(/^\.([pcl]-[a-zA-Z0-9_-]+)(:[\w-]+)\s*{/);
      if (pseudoClassMatch && bracketCount === 0) {
        // 既存のブロックを保存
        if (currentBlock) {
          blocks.push({
            name: currentBlock,
            code: blockContent.join('\n')
          });
        }

        // 新しい擬似クラスブロックを開始（名前はベースクラス:擬似クラス の形式）
        currentBlock = pseudoClassMatch[1] + pseudoClassMatch[2];
        blockContent = [lines[i]];
        bracketCount = 1; // 開始括弧をカウント
        continue;
      }

      // エレメントの検出（既存ブロックに関連するもの）
      if (currentBlock && line.match(new RegExp(`^\\.${currentBlock}__[a-zA-Z0-9_-]+\\s*{`))) {
        blockContent.push(lines[i]);
        bracketCount += (line.match(/{/g) || []).length;
        bracketCount -= (line.match(/}/g) || []).length;
        continue;
      }

      // 他のエレメントやブロックの検出
      if (line.match(/^\.[a-zA-Z0-9_.-]+\s*{/)) {
        // 既存ブロックのエレメントでない場合は、新しいブロックとして処理
        const elementMatch = line.match(/^\.([pcl]-[a-zA-Z0-9_-]+)__[a-zA-Z0-9_-]+\s*{/);
        const newBlockMatch = line.match(/^\.([pcl]-[a-zA-Z0-9_-]+)\s*{/);
        const pseudoClassElementMatch = line.match(/^\.([pcl]-[a-zA-Z0-9_-]+)(:[\w-]+)\s*{/);

        if (elementMatch) {
          // 既存ブロックがあれば保存
          if (currentBlock && currentBlock !== elementMatch[1] && currentBlock !== elementMatch[1] + '__') {
            blocks.push({
              name: currentBlock,
              code: blockContent.join('\n')
            });

            // 新しいブロックを開始
            currentBlock = elementMatch[1];
            blockContent = [lines[i]];
            bracketCount = 1;
          } else {
            // 現在のブロックに関連するエレメント
            if (!currentBlock) currentBlock = elementMatch[1];
            blockContent.push(lines[i]);
            bracketCount += (line.match(/{/g) || []).length;
            bracketCount -= (line.match(/}/g) || []).length;
          }
        } else if (pseudoClassElementMatch) {
          // 擬似クラスの場合
          if (currentBlock && currentBlock !== pseudoClassElementMatch[1] && !currentBlock.startsWith(pseudoClassElementMatch[1] + ':')) {
            blocks.push({
              name: currentBlock,
              code: blockContent.join('\n')
            });

            // 新しい擬似クラスブロックを開始
            currentBlock = pseudoClassElementMatch[1] + pseudoClassElementMatch[2];
            blockContent = [lines[i]];
            bracketCount = 1;
          } else {
            // 現在のブロックに関連する擬似クラス
            if (!currentBlock) currentBlock = pseudoClassElementMatch[1] + pseudoClassElementMatch[2];
            blockContent.push(lines[i]);
            bracketCount += (line.match(/{/g) || []).length;
            bracketCount -= (line.match(/}/g) || []).length;
          }
        } else if (newBlockMatch) {
          // 既存ブロックがあれば保存
          if (currentBlock) {
            blocks.push({
              name: currentBlock,
              code: blockContent.join('\n')
            });
          }

          // 新しいブロックを開始
          currentBlock = newBlockMatch[1];
          blockContent = [lines[i]];
          bracketCount = 1;
        } else {
          // その他のセレクタはスキップ（または現在のブロックに含める）
          if (currentBlock) blockContent.push(lines[i]);
        }
        continue;
      }

      // 括弧のカウント（ネストレベルの追跡）
      if (line.includes('{')) bracketCount += (line.match(/{/g) || []).length;
      if (line.includes('}')) bracketCount -= (line.match(/}/g) || []).length;

      // 現在のブロックがある場合、行を追加
      if (currentBlock) {
        blockContent.push(lines[i]);

        // ブロックの終了を検出
        if (bracketCount === 0) {
          blocks.push({
            name: currentBlock,
            code: blockContent.join('\n')
          });

          currentBlock = null;
          blockContent = [];
        }
      }
    }

    // 最後のブロックが未保存の場合
    if (currentBlock) {
      blocks.push({
        name: currentBlock,
        code: blockContent.join('\n')
      });
    }

    // SCSSでは検出できなかったが、HTMLに存在するブロックのスケルトンコードを生成
    foundBlockNames.forEach(blockName => {
      if (!blocks.some(block => block.name === blockName)) {
        blocks.push({
          name: blockName,
          code: `.${blockName} {\n  // HTMLから検出されたブロック\n}`
        });
      }
    });

    return blocks;
  } catch (error) {
    console.error('SCSSブロックの検出中にエラーが発生しました:', error);
    return [];
  }
};

/**
 * HTMLコードからブロックを検出する
 * @param {string} htmlCode - 解析するHTMLコード
 * @returns {Array} - 検出されたブロックの配列 [{name, element}, ...]
 */
export const detectHtmlBlocks = (htmlCode) => {
  if (!htmlCode) return [];

  const blocks = [];
  const blockNames = new Set(); // 重複を避けるためのセット

  try {
    // HTML全体からすべての[pcl]-プレフィックスクラスを検出
    const classRegex = /class=["']([^"']*)["']/g;
    let classMatch;

    while ((classMatch = classRegex.exec(htmlCode)) !== null) {
      const classStr = classMatch[1];
      const classes = classStr.split(/\s+/);

      // [pcl]-プレフィックスを持つクラスをフィルタリング
      classes.forEach(className => {
        if (/^[pcl]-[a-zA-Z0-9_-]+$/.test(className) && !blockNames.has(className)) {
          blockNames.add(className);

          // 要素の種類を特定
          const elementRegex = new RegExp(`<([a-z0-9]+)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i');
          const elementMatch = htmlCode.match(elementRegex);
          const element = elementMatch ? elementMatch[1] : 'div'; // デフォルトはdiv

          blocks.push({
            name: className,
            element: element
          });
        }
      });
    }

    // class属性を持つ要素を検索（バックアップ方法）
    const elementRegex = /<([a-z0-9]+)[^>]*class="([^"]*)"[^>]*>/g;
    let elementMatch;

    while ((elementMatch = elementRegex.exec(htmlCode)) !== null) {
      const element = elementMatch[1]; // HTML要素（div, section等）
      const classAttribute = elementMatch[2]; // クラス属性の値（スペース区切りの複数クラス）

      // クラス名を空白で分割して配列に
      const classNames = classAttribute.split(/\s+/);

      // [pcl]-プレフィックスを持つクラスをフィルタリング
      const blockClasses = classNames.filter(className =>
        /^[pcl]-[a-zA-Z0-9_-]+$/.test(className)
      );

      // 検出されたブロッククラスをそれぞれ登録
      blockClasses.forEach(blockName => {
        // 既に同じブロック名が登録されていない場合のみ追加
        if (!blockNames.has(blockName)) {
          blockNames.add(blockName);
          blocks.push({
            name: blockName,
            element: element
          });
        }
      });
    }

    return blocks;
  } catch (error) {
    console.error('HTMLブロックの検出中にエラーが発生しました:', error);
    return [];
  }
};
