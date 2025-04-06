/**
 * CSSのpx単位をremに変換する関数
 * @param {string} scss - 変換するCSSコード
 * @returns {string} pxからremに変換されたCSSコード
 */
const convertPxToRem = (scss) => {
  if (!scss) return scss;

  // base font-size: 16px
  const ROOT_FONT_SIZE = 16;

  // 行ごとに処理
  const lines = scss.split('\n');
  const result = [];

  // メディアクエリ内かどうかのフラグ
  let inMediaQuery = false;

  for (const line of lines) {
    // メディアクエリの開始と終了を検出
    if (line.includes('@include mq(')) {
      inMediaQuery = true;
    }
    if (inMediaQuery && line.trim() === '}') {
      inMediaQuery = false;
    }

    // メディアクエリ内またはborderの1pxはそのまま残す
    if (inMediaQuery ||
      line.includes('border') && line.includes('1px') ||
      line.includes('box-shadow') && line.includes('px')) {
      result.push(line);
      continue;
    }

    // pxをremに変換（数値とpxの間にスペースがあってもマッチ）
    let processedLine = line;
    const pxRegex = /(\d*\.?\d+)\s*px/g;

    processedLine = processedLine.replace(pxRegex, (match, pixelValue) => {
      // 小数点第3位までの精度で変換
      const remValue = (parseFloat(pixelValue) / ROOT_FONT_SIZE).toFixed(3);
      // 末尾の0を削除（例：1.500rem → 1.5rem、1.000rem → 1rem）
      const trimmedRemValue = parseFloat(remValue);
      return `${trimmedRemValue}rem`;
    });

    result.push(processedLine);
  }

  return result.join('\n');
};

export default convertPxToRem;
