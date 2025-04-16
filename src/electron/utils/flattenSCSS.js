/**
 * SCSSのネスト構造を平坦化する関数
 * @param {string} scss - 平坦化するSCSSコード
 * @returns {string} 平坦化されたSCSSコード
 */
/**
 * SCSSのネスト構造をフラットに変換
 * &:hover や &::before のような疑似セレクタも対応
 * ネストされた &:hover もすべて処理対象
 */
const flattenSCSS = (scss) => {
  if (!scss) return scss;

  const lines = scss.split('\n');
  const result = [];
  const extraSelectors = [];
  const stack = [];

  let inComment = false;
  let inMQ = false;
  let mqBuffer = [];

  const processBlock = (blockLines, parentSelector) => {
    const localResult = [];
    const nestedExtras = [];

    let currentSelector = parentSelector;

    for (let i = 0; i < blockLines.length; i++) {
      let line = blockLines[i];
      const trimmed = line.trim();

      // コメント
      if (trimmed.startsWith('/*')) inComment = true;
      if (inComment) {
        localResult.push(line);
        if (trimmed.endsWith('*/')) inComment = false;
        continue;
      }

      if (trimmed === '') {
        localResult.push('');
        continue;
      }

      // 💡 無効なカラー変数マッピング行をスキップ
      if (/^#[0-9a-fA-F]{6}:\s*\$?[\w-]+;/.test(trimmed)) {
        continue;
      }

      const openBrace = trimmed.endsWith('{');
      const closeBrace = trimmed === '}';

      // スコープ終了
      if (closeBrace) {
        localResult.push(line);
        continue;
      }

      // スコープ開始
      if (openBrace) {
        const selector = trimmed.slice(0, -1).trim();

        // ネスト疑似セレクタ
        // ネスト疑似セレクタ
        if (selector.startsWith('&:') || selector.startsWith('&::')) {
          const flatSelector = selector.replace(/^&/, parentSelector);
          const nestedBlock = [];

          // ネストブロック収集
          let depth = 1;
          while (++i < blockLines.length) {
            const l = blockLines[i].trim();
            if (l.endsWith('{')) depth++;
            else if (l === '}') depth--;
            if (depth === 0) break;
            nestedBlock.push(blockLines[i]);
          }

          // 💡 再帰的に処理するよう修正
          const processed = processBlock(nestedBlock, flatSelector);
          nestedExtras.push(`${flatSelector} {\n${processed.main.join('\n')}\n}`);
          nestedExtras.push(...processed.extra);
          continue;
        }


        // メディアクエリ (@include mq)
        if (selector.startsWith('@include')) {
          const mqBlock = [line];
          let depth = 1;
          while (++i < blockLines.length) {
            const l = blockLines[i].trim();
            mqBlock.push(blockLines[i]);
            if (l.endsWith('{')) depth++;
            else if (l === '}') depth--;
            if (depth === 0) break;
          }
          localResult.push(...mqBlock);
          continue;
        }

        // 通常のネストセレクタ
        if (selector.startsWith('&')) {
          const newSelector = selector.replace(/^&/, parentSelector).trim();
          const nestedBlock = [];

          let depth = 1;
          while (++i < blockLines.length) {
            const l = blockLines[i].trim();
            if (l.endsWith('{')) depth++;
            else if (l === '}') depth--;
            if (depth === 0) break;
            nestedBlock.push(blockLines[i]);
          }

          const flat = processBlock(nestedBlock, newSelector);
          localResult.push(`${newSelector} {`, ...flat.main, '}');
          nestedExtras.push(...flat.extra);
          continue;
        }

        // 通常のネスト（.child など）→無視（今回は対応しない）
        localResult.push(line);
        continue;
      }

      // 通常のスタイル行
      localResult.push(line);
    }

    return { main: localResult, extra: nestedExtras };
  };

  const { main, extra } = processBlock(lines, '');

  result.push(...main, '', ...extra);

  return result.join('\n');
};


export default flattenSCSS;
