/**
 * 色彩分析モジュール
 * 色の抽出、分類、カラーパレット生成機能を提供
 */

/**
 * カラー情報を解析
 * @param {Array} colors - 色情報配列
 * @returns {Object} 色彩分析結果
 */
function analyzeColors(colors) {
  try {
    if (!Array.isArray(colors) || colors.length === 0) {
      return {
        palette: [],
        primary: null,
        secondary: null,
        accent: null
      };
    }

    // 使用頻度でソート
    const sortedByUsage = [...colors].sort((a, b) => (b.ratio || 0) - (a.ratio || 0));

    // 色相グループに分類
    const hueGroups = groupColorsByHue(colors);

    // カラーパレットを生成
    const palette = generateColorPalette(colors);

    // 主要色を選定
    const keyColors = selectKeyColors(sortedByUsage, hueGroups);

    // コントラスト比を計算
    const contrastRatios = calculateContrastRatios(keyColors);

    return {
      palette,
      ...keyColors,
      groups: hueGroups.map(group => ({
        name: group.name,
        colors: group.colors.slice(0, 3).map(c => c.hex),
        dominance: group.dominance
      })),
      colorCount: colors.length,
      contrastRatios
    };
  } catch (error) {
    console.error('色彩分析中にエラーが発生しました:', error);
    return {
      palette: [],
      primary: null,
      secondary: null,
      accent: null
    };
  }
}

/**
 * 色を色相でグループ化
 * @param {Array} colors - 色情報配列
 * @returns {Array} 色相グループ配列
 */
function groupColorsByHue(colors) {
  // 色相グループの定義
  const hueGroups = [
    { name: 'red', start: 355, end: 10, colors: [], dominance: 0 },
    { name: 'orange', start: 10, end: 45, colors: [], dominance: 0 },
    { name: 'yellow', start: 45, end: 80, colors: [], dominance: 0 },
    { name: 'green', start: 80, end: 170, colors: [], dominance: 0 },
    { name: 'cyan', start: 170, end: 200, colors: [], dominance: 0 },
    { name: 'blue', start: 200, end: 260, colors: [], dominance: 0 },
    { name: 'purple', start: 260, end: 310, colors: [], dominance: 0 },
    { name: 'pink', start: 310, end: 355, colors: [], dominance: 0 },
    { name: 'grey', start: 0, end: 360, colors: [], dominance: 0 } // 彩度の低い色用
  ];

  // 各色を適切なグループに分類
  colors.forEach(color => {
    const { h, s, l } = hexToHsl(color.hex);

    // 彩度の低い色（グレー系）
    if (s < 15 || (l < 10 || l > 95)) {
      hueGroups[8].colors.push({ ...color, hsl: { h, s, l } });
      hueGroups[8].dominance += color.ratio || 0;
      return;
    }

    // 色相に基づいてグループ化
    for (let i = 0; i < 8; i++) {
      const group = hueGroups[i];
      if (group.start <= group.end) {
        if (h >= group.start && h < group.end) {
          group.colors.push({ ...color, hsl: { h, s, l } });
          group.dominance += color.ratio || 0;
          return;
        }
      } else {
        // 赤系の場合（355°〜10°）
        if (h >= group.start || h < group.end) {
          group.colors.push({ ...color, hsl: { h, s, l } });
          group.dominance += color.ratio || 0;
          return;
        }
      }
    }
  });

  // 各グループの色を彩度と明度でソート
  hueGroups.forEach(group => {
    group.colors.sort((a, b) => {
      // 彩度優先、次に明度
      const aSaturation = a.hsl.s;
      const bSaturation = b.hsl.s;
      if (Math.abs(aSaturation - bSaturation) > 5) {
        return bSaturation - aSaturation;
      }
      return b.hsl.l - a.hsl.l;
    });
  });

  // 空のグループを除外して占有率順にソート
  return hueGroups
    .filter(group => group.colors.length > 0)
    .sort((a, b) => b.dominance - a.dominance);
}

/**
 * カラーパレットを生成
 * @param {Array} colors - 色情報配列
 * @returns {Array} カラーパレット
 */
function generateColorPalette(colors) {
  // 使用頻度順にソート
  const sortedByUsage = [...colors]
    .filter(color => color.hex && color.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio);

  // 重複や類似色を除去したパレットを作成
  const palette = [];
  const addedHexValues = new Set();

  sortedByUsage.forEach(color => {
    // 既に追加済みの色は無視
    if (addedHexValues.has(color.hex)) return;

    // 類似色のチェック
    const isSimilarToExisting = palette.some(existingColor => {
      return calculateColorDifference(color.hex, existingColor.hex) < 15;
    });

    if (!isSimilarToExisting) {
      palette.push({
        hex: color.hex,
        rgb: color.rgb || hexToRgb(color.hex),
        ratio: color.ratio,
        role: color.role || inferColorRole(color)
      });
      addedHexValues.add(color.hex);
    }

    // 最大8色まで
    if (palette.length >= 8) return;
  });

  return palette;
}

/**
 * 主要色を選定
 * @param {Array} sortedColors - 使用頻度順の色配列
 * @param {Array} hueGroups - 色相グループ配列
 * @returns {Object} 主要色
 */
function selectKeyColors(sortedColors, hueGroups) {
  let primary = null;
  let secondary = null;
  let accent = null;
  let background = null;
  let text = null;

  // 背景色候補（明るい色、使用頻度高）
  const backgroundCandidates = sortedColors.filter(color => {
    const { l } = hexToHsl(color.hex);
    return l > 80 && color.ratio > 0.1;
  });

  // テキスト色候補（暗い色、使用頻度中〜高）
  const textCandidates = sortedColors.filter(color => {
    const { l } = hexToHsl(color.hex);
    return l < 30 && color.ratio > 0.05;
  });

  // 背景色の選定
  if (backgroundCandidates.length > 0) {
    background = {
      hex: backgroundCandidates[0].hex,
      rgb: backgroundCandidates[0].rgb || hexToRgb(backgroundCandidates[0].hex)
    };
  } else {
    // 背景候補がなければ最も明るい色
    const brightestColor = [...sortedColors].sort((a, b) => {
      const { l: aL } = hexToHsl(a.hex);
      const { l: bL } = hexToHsl(b.hex);
      return bL - aL;
    })[0];

    if (brightestColor) {
      background = {
        hex: brightestColor.hex,
        rgb: brightestColor.rgb || hexToRgb(brightestColor.hex)
      };
    }
  }

  // テキスト色の選定
  if (textCandidates.length > 0) {
    text = {
      hex: textCandidates[0].hex,
      rgb: textCandidates[0].rgb || hexToRgb(textCandidates[0].hex)
    };
  } else {
    // テキスト候補がなければ最も暗い色
    const darkestColor = [...sortedColors].sort((a, b) => {
      const { l: aL } = hexToHsl(a.hex);
      const { l: bL } = hexToHsl(b.hex);
      return aL - bL;
    })[0];

    if (darkestColor) {
      text = {
        hex: darkestColor.hex,
        rgb: darkestColor.rgb || hexToRgb(darkestColor.hex)
      };
    }
  }

  // プライマリカラーの選定 - 最も使用頻度が高い彩度の高い色
  const saturatedColors = sortedColors.filter(color => {
    const { s } = hexToHsl(color.hex);
    return s > 40; // 十分な彩度
  });

  if (saturatedColors.length > 0) {
    primary = {
      hex: saturatedColors[0].hex,
      rgb: saturatedColors[0].rgb || hexToRgb(saturatedColors[0].hex)
    };
  } else if (sortedColors.length > 0) {
    // 彩度の高い色がなければ最も使用頻度の高い色
    primary = {
      hex: sortedColors[0].hex,
      rgb: sortedColors[0].rgb || hexToRgb(sortedColors[0].hex)
    };
  }

  // セカンダリカラーの選定 - プライマリと異なる色相の色
  if (primary && hueGroups.length > 1) {
    const primaryHsl = hexToHsl(primary.hex);

    // プライマリと色相が離れている色を探す
    const differentHueColors = sortedColors.filter(color => {
      const { h } = hexToHsl(color.hex);
      const hueDifference = Math.abs(h - primaryHsl.h);
      return hueDifference > 60 && hueDifference < 300; // 十分に異なる色相
    });

    if (differentHueColors.length > 0) {
      secondary = {
        hex: differentHueColors[0].hex,
        rgb: differentHueColors[0].rgb || hexToRgb(differentHueColors[0].hex)
      };
    } else {
      // 別の色相がなければ2番目に使用頻度の高い色
      if (sortedColors.length > 1) {
        secondary = {
          hex: sortedColors[1].hex,
          rgb: sortedColors[1].rgb || hexToRgb(sortedColors[1].hex)
        };
      }
    }
  }

  // アクセントカラーの選定 - プライマリ、セカンダリと補色関係にある色
  const accentCandidates = sortedColors.filter(color => {
    if (!primary) return false;

    const { h: primaryH } = hexToHsl(primary.hex);
    const { h, s, l } = hexToHsl(color.hex);

    // 補色関係（色相環の反対側、約180°離れている）
    const hueDifference = Math.abs((h - primaryH + 180) % 360 - 180);

    // 鮮やかな色がアクセントに適している
    return hueDifference < 30 && s > 60 && l > 40 && l < 70;
  });

  if (accentCandidates.length > 0) {
    accent = {
      hex: accentCandidates[0].hex,
      rgb: accentCandidates[0].rgb || hexToRgb(accentCandidates[0].hex)
    };
  } else {
    // 最も彩度の高い色をアクセントとする
    const mostSaturated = [...sortedColors].sort((a, b) => {
      const { s: aS } = hexToHsl(a.hex);
      const { s: bS } = hexToHsl(b.hex);
      return bS - aS;
    })[0];

    if (mostSaturated && mostSaturated.hex !== primary?.hex && mostSaturated.hex !== secondary?.hex) {
      accent = {
        hex: mostSaturated.hex,
        rgb: mostSaturated.rgb || hexToRgb(mostSaturated.hex)
      };
    }
  }

  return { primary, secondary, accent, background, text };
}

/**
 * コントラスト比を計算
 * @param {Object} keyColors - 主要色
 * @returns {Object} コントラスト比
 */
function calculateContrastRatios(keyColors) {
  const { primary, secondary, background, text } = keyColors;
  const contrastRatios = {};

  if (background && text) {
    contrastRatios.backgroundText = calculateContrast(background.hex, text.hex);
  }

  if (background && primary) {
    contrastRatios.backgroundPrimary = calculateContrast(background.hex, primary.hex);
  }

  if (primary && text) {
    contrastRatios.primaryText = calculateContrast(primary.hex, text.hex);
  }

  if (secondary && background) {
    contrastRatios.secondaryBackground = calculateContrast(secondary.hex, background.hex);
  }

  return contrastRatios;
}

/**
 * 色の役割を推測
 * @param {Object} color - 色情報
 * @returns {string} 推測された役割
 */
function inferColorRole(color) {
  if (!color) return 'general';

  const hex = color.hex || '#000000';
  const ratio = color.ratio || 0;
  const { h, s, l } = hexToHsl(hex);

  // 使用頻度が高い色は背景かベース
  if (ratio > 0.3) {
    return l > 70 ? 'background' : 'text';
  }

  // 彩度が高く明度も適度な色はアクセント
  if (s > 70 && l > 40 && l < 70) {
    return 'accent';
  }

  // 暗い色はテキスト
  if (l < 30) {
    return 'text';
  }

  // 明るい色は背景
  if (l > 85) {
    return 'background';
  }

  return 'general';
}

/**
 * HEXからHSL値に変換
 * @param {string} hex - HEX色コード
 * @returns {Object} HSL値
 */
function hexToHsl(hex) {
  // HEXからRGBに変換
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // 無彩色
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = h * 60;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * HEXからRGB文字列に変換
 * @param {string} hex - HEX色コード
 * @returns {string} RGB文字列
 */
function hexToRgb(hex) {
  // 短縮形式（#abc）を展開形式（#aabbcc）に変換
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  if (!result) return `rgb(0,0,0)`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgb(${r},${g},${b})`;
}

/**
 * 2色間の色差を計算（CIEDE2000アルゴリズムの簡易バージョン）
 * @param {string} hex1 - 1つ目のHEX色コード
 * @param {string} hex2 - 2つ目のHEX色コード
 * @returns {number} 色差
 */
function calculateColorDifference(hex1, hex2) {
  const lab1 = rgbToLab(hexToRgbObj(hex1));
  const lab2 = rgbToLab(hexToRgbObj(hex2));

  // 簡易的なLabの差分計算
  const deltaL = lab1.l - lab2.l;
  const deltaA = lab1.a - lab2.a;
  const deltaB = lab1.b - lab2.b;

  // ユークリッド距離
  return Math.sqrt(Math.pow(deltaL, 2) + Math.pow(deltaA, 2) + Math.pow(deltaB, 2));
}

/**
 * HEXからRGBオブジェクトに変換
 * @param {string} hex - HEX色コード
 * @returns {Object} RGBオブジェクト
 */
function hexToRgbObj(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };
}

/**
 * RGBからLabに変換
 * @param {Object} rgb - RGBオブジェクト
 * @returns {Object} Labオブジェクト
 */
function rgbToLab(rgb) {
  // RGB to XYZ変換
  const { r, g, b: blue } = rgb;

  // sRGBからの変換
  const rsrgb = r / 255;
  const gsrgb = g / 255;
  const bsrgb = blue / 255;

  // リニアRGBに変換
  const rLinear = rsrgb <= 0.04045 ? rsrgb / 12.92 : Math.pow((rsrgb + 0.055) / 1.055, 2.4);
  const gLinear = gsrgb <= 0.04045 ? gsrgb / 12.92 : Math.pow((gsrgb + 0.055) / 1.055, 2.4);
  const bLinear = bsrgb <= 0.04045 ? bsrgb / 12.92 : Math.pow((bsrgb + 0.055) / 1.055, 2.4);

  // XYZ空間に変換
  const x = 0.4124 * rLinear + 0.3576 * gLinear + 0.1805 * bLinear;
  const y = 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  const z = 0.0193 * rLinear + 0.1192 * gLinear + 0.9505 * bLinear;

  // D65基準値を使用したLAB変換
  const xRef = 95.047;
  const yRef = 100;
  const zRef = 108.883;

  const xNorm = x / xRef;
  const yNorm = y / yRef;
  const zNorm = z / zRef;

  const fx = xNorm > 0.008856 ? Math.pow(xNorm, 1 / 3) : (7.787 * xNorm) + (16 / 116);
  const fy = yNorm > 0.008856 ? Math.pow(yNorm, 1 / 3) : (7.787 * yNorm) + (16 / 116);
  const fz = zNorm > 0.008856 ? Math.pow(zNorm, 1 / 3) : (7.787 * zNorm) + (16 / 116);

  const l = (116 * fy) - 16;
  const a = 500 * (fx - fy);
  const bComponent = 200 * (fy - fz);

  return { l, a, b: bComponent };
}

/**
 * 2色間のコントラスト比を計算
 * @param {string} hex1 - 1つ目のHEX色コード
 * @param {string} hex2 - 2つ目のHEX色コード
 * @returns {number} コントラスト比
 */
function calculateContrast(hex1, hex2) {
  const rgb1 = hexToRgbObj(hex1);
  const rgb2 = hexToRgbObj(hex2);

  const luminance1 = calculateLuminance(rgb1);
  const luminance2 = calculateLuminance(rgb2);

  const brightest = Math.max(luminance1, luminance2);
  const darkest = Math.min(luminance1, luminance2);

  return ((brightest + 0.05) / (darkest + 0.05)).toFixed(2);
}

/**
 * 相対輝度を計算
 * @param {Object} rgb - RGBオブジェクト
 * @returns {number} 相対輝度
 */
function calculateLuminance(rgb) {
  const { r, g, b } = rgb;

  const rsrgb = r / 255;
  const gsrgb = g / 255;
  const bsrgb = b / 255;

  const r1 = rsrgb <= 0.03928 ? rsrgb / 12.92 : Math.pow((rsrgb + 0.055) / 1.055, 2.4);
  const g1 = gsrgb <= 0.03928 ? gsrgb / 12.92 : Math.pow((gsrgb + 0.055) / 1.055, 2.4);
  const b1 = bsrgb <= 0.03928 ? bsrgb / 12.92 : Math.pow((bsrgb + 0.055) / 1.055, 2.4);

  return 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
}

/**
 * CSS変数からHEX値を抽出する関数
 * @param {string} cssVars - CSS変数文字列
 * @returns {Array} 抽出されたHEX値の配列
 */
function extractHexValuesFromVariables(cssVars) {
  if (!cssVars || typeof cssVars !== 'string') return [];

  const hexValues = [];
  const varRegex = /\$([\w-]+):\s*([^;]+);/g;
  let match;

  while ((match = varRegex.exec(cssVars)) !== null) {
    const [_, varName, varValue] = match;
    const value = varValue.trim();

    // HEX値のみを抽出
    if (value.startsWith('#')) {
      hexValues.push(value);
    }
  }

  return hexValues;
}

/**
 * variableSettings形式からCSS変数文字列に変換する関数
 * @param {Object} settings - 設定オブジェクト
 * @returns {string} CSS変数文字列
 */
function generateVariableSettingsFromSettings(settings) {
  // 設定がない場合は空の文字列を返す
  if (!settings) return '';

  try {
    let variableSettingsStr = '';

    // customColorsから変数を抽出
    if (settings.customColors && Array.isArray(settings.customColors)) {
      settings.customColors.forEach(item => {
        if (item && item.name && item.color) {
          variableSettingsStr += `${item.name}: ${item.color};\n`;
        }
      });
    } else {
      // 旧形式や、customColorsがない場合は直接プロパティから生成
      if (settings.primaryColor) {
        variableSettingsStr += `$primary-color: ${settings.primaryColor};\n`;
      }
      if (settings.secondaryColor) {
        variableSettingsStr += `$secondary-color: ${settings.secondaryColor};\n`;
      }
      if (settings.accentColor) {
        variableSettingsStr += `$accent-color: ${settings.accentColor};\n`;
      }
      variableSettingsStr += `$blue: #408F95;\n`;
      variableSettingsStr += `$text-color: #000000;\n`;
    }

    return variableSettingsStr;
  } catch (error) {
    console.error('CSS変数生成エラー:', error);
    return '';
  }
}

/**
 * 色の設定からプロンプト用のセクションを構築する
 * @param {string} variableSettings - CSS変数設定
 * @param {Array} pcColors - PC画像から抽出した色
 * @param {Array} spColors - SP画像から抽出した色
 * @returns {string} 色設定のプロンプトセクション
 */
function buildColorSettingsSection(variableSettings, pcColors = [], spColors = []) {
  if (!variableSettings) {
    return '';
  }

  let section = `
### Color Guidelines:
- Use ONLY HEX color values directly in your CSS
- DO NOT use CSS variables (like $primary-color, etc.)
- Here is a recommended color palette based on the design:
`;

  // 変数からHEX値を抽出
  const hexValues = extractHexValuesFromVariables(variableSettings);

  // 抽出した色を追加
  if (hexValues.length > 0) {
    section += `  ${hexValues.join(', ')}
`;
  }

  // PC画像とSP画像から抽出した色も追加
  const validPcColors = Array.isArray(pcColors) ? pcColors : [];
  const validSpColors = Array.isArray(spColors) ? spColors : [];

  if (validPcColors.length > 0 || validSpColors.length > 0) {
    // 重複を除去してマージ
    const allColors = [...validPcColors, ...validSpColors];
    const uniqueColors = [...new Set(allColors)]; // Setを使用して重複を効率的に除去

    section += `- Additional colors from the image:
  ${uniqueColors.join(', ')}
`;
  }

  section += `- Feel free to use variations of these colors where needed

`;

  return section;
}

// モジュールのエクスポート
export {
  analyzeColors,
  extractHexValuesFromVariables,
  generateVariableSettingsFromSettings,
  buildColorSettingsSection
};
