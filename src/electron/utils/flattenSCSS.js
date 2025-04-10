/**
 * SCSSのネスト構造を平坦化する関数
 * @param {string} scss - 平坦化するSCSSコード
 * @returns {string} 平坦化されたSCSSコード
 */
const flattenSCSS = (scss) => {
  if (!scss) return scss;

  // 結果を格納する配列
  const lines = scss.split('\n');
  const result = [];

  // 現在の親セレクタとインデントレベルを追跡
  let parentSelector = null;
  let currentIndent = 0;
  let inComment = false;
  let inMediaQuery = false;
  let mediaQueryBlock = '';
  let mediaQueryIndent = 0;

  // 各行を処理
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // コメント処理
    if (trimmedLine.startsWith('/*')) inComment = true;
    if (trimmedLine.endsWith('*/')) {
      inComment = false;
      result.push(line);
      continue;
    }
    if (inComment) {
      result.push(line);
      continue;
    }

    // 空行の場合はそのまま追加
    if (trimmedLine === '') {
      result.push('');
      continue;
    }

    // インデントレベルを計算
    const indentMatch = line.match(/^(\s+)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // メディアクエリ処理
    if (trimmedLine.startsWith('@include mq(') && !inMediaQuery) {
      inMediaQuery = true;
      mediaQueryBlock = line;
      mediaQueryIndent = indent;
      continue;
    }

    if (inMediaQuery) {
      mediaQueryBlock += '\n' + line;
      if (trimmedLine === '}') {
        inMediaQuery = false;
        result.push(mediaQueryBlock);
        mediaQueryBlock = '';
      }
      continue;
    }

    // セレクタ行の検出
    if (trimmedLine.includes('{') && !trimmedLine.includes('}')) {
      // インデントレベルが下がった場合、親セレクタをリセット
      if (indent <= currentIndent) {
        parentSelector = null;
      }

      // 親セレクタを記録
      parentSelector = trimmedLine.split('{')[0].trim();
      currentIndent = indent;
      result.push(line);
    }
    // ネストされたセレクタの検出 (&__)
    else if (trimmedLine.startsWith('&') && parentSelector) {
      const nestedPart = trimmedLine.split('{')[0].trim();
      // &__title { のようなパターンを.parent__titleに変換
      if (nestedPart.startsWith('&__')) {
        const newSelector = `${parentSelector}${nestedPart.substring(1)} {`;
        // インデントを親と同じレベルに調整
        const spaces = ' '.repeat(currentIndent);
        result.push(`${spaces}${newSelector}`);
      }
      // &:hover { のようなパターンを.parent:hoverに変換
      else if (nestedPart.startsWith('&:')) {
        const newSelector = `${parentSelector}${nestedPart.substring(1)} {`;
        const spaces = ' '.repeat(currentIndent);
        result.push(`${spaces}${newSelector}`);
      }
    }
    // 通常の行はそのまま追加
    else {
      result.push(line);
    }
  }

  return result.join('\n');
};

export default flattenSCSS;
