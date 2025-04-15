/**
 * デザインガイドライン管理モジュール
 * デザインガイドラインの生成・管理機能を提供
 */

/**
 * デザインガイドラインを生成
 * @param {Object} analysisResult - 解析結果
 * @returns {Object} デザインガイドライン
 */
function generateGuidelines(analysisResult) {
  try {
    if (!analysisResult) {
      return {
        colors: [],
        typography: {},
        spacing: {},
        components: {}
      };
    }

    // カラーガイドラインの生成
    const colorGuidelines = generateColorGuidelines(analysisResult.colors || {});

    // タイポグラフィガイドラインの生成
    const typographyGuidelines = generateTypographyGuidelines(analysisResult.text || {});

    // スペーシングガイドラインの生成
    const spacingGuidelines = generateSpacingGuidelines(analysisResult.layout || {});

    // コンポーネントガイドラインの生成
    const componentGuidelines = generateComponentGuidelines(analysisResult.components || {});

    return {
      colors: colorGuidelines,
      typography: typographyGuidelines,
      spacing: spacingGuidelines,
      components: componentGuidelines
    };
  } catch (error) {
    console.error('ガイドライン生成中にエラーが発生しました:', error);
    return {
      colors: [],
      typography: {},
      spacing: {},
      components: {}
    };
  }
}

/**
 * カラーガイドラインを生成
 * @param {Object} colorData - 色彩分析結果
 * @returns {Object} カラーガイドライン
 */
function generateColorGuidelines(colorData) {
  const guidelines = {
    primary: null,
    secondary: null,
    accent: null,
    neutrals: [],
    semantic: {
      success: null,
      warning: null,
      error: null,
      info: null
    }
  };

  // 主要色を設定
  if (colorData.primary) {
    guidelines.primary = {
      base: colorData.primary.hex,
      variants: generateColorVariants(colorData.primary.hex)
    };
  }

  if (colorData.secondary) {
    guidelines.secondary = {
      base: colorData.secondary.hex,
      variants: generateColorVariants(colorData.secondary.hex)
    };
  }

  if (colorData.accent) {
    guidelines.accent = {
      base: colorData.accent.hex,
      variants: generateColorVariants(colorData.accent.hex)
    };
  }

  // 背景色とテキスト色
  if (colorData.background && colorData.text) {
    // 中間的なグレーを生成
    const { h, s, l } = hexToHsl(colorData.background.hex);

    // ニュートラルカラー（グレースケール）を生成
    guidelines.neutrals = [
      { name: 'white', hex: '#ffffff' },
      { name: 'gray-100', hex: hslToHex(h, Math.min(s, 5), 95) },
      { name: 'gray-200', hex: hslToHex(h, Math.min(s, 5), 90) },
      { name: 'gray-300', hex: hslToHex(h, Math.min(s, 5), 80) },
      { name: 'gray-400', hex: hslToHex(h, Math.min(s, 5), 70) },
      { name: 'gray-500', hex: hslToHex(h, Math.min(s, 5), 60) },
      { name: 'gray-600', hex: hslToHex(h, Math.min(s, 5), 50) },
      { name: 'gray-700', hex: hslToHex(h, Math.min(s, 5), 40) },
      { name: 'gray-800', hex: hslToHex(h, Math.min(s, 5), 30) },
      { name: 'gray-900', hex: hslToHex(h, Math.min(s, 5), 20) },
      { name: 'black', hex: '#000000' }
    ];
  }

  // セマンティックカラーの推測（デフォルト値または主要色から派生）
  if (guidelines.primary) {
    // 成功色（緑系）
    guidelines.semantic.success = '#4CAF50';

    // 警告色（黄色系）
    guidelines.semantic.warning = '#FFC107';

    // エラー色（赤系）
    guidelines.semantic.error = '#F44336';

    // 情報色（青系）
    guidelines.semantic.info = '#2196F3';
  }

  // パレットがあれば追加
  if (colorData.palette && colorData.palette.length > 0) {
    guidelines.palette = colorData.palette.map(color => ({
      hex: color.hex,
      role: color.role || 'general'
    }));
  }

  return guidelines;
}

/**
 * 基本色から色のバリエーションを生成
 * @param {string} baseHex - 基本色のHEX
 * @returns {Object} 色のバリエーション
 */
function generateColorVariants(baseHex) {
  const { h, s, l } = hexToHsl(baseHex);

  return {
    50: hslToHex(h, Math.max(s - 30, 0), Math.min(l + 40, 95)),
    100: hslToHex(h, Math.max(s - 20, 0), Math.min(l + 30, 90)),
    200: hslToHex(h, Math.max(s - 10, 0), Math.min(l + 20, 85)),
    300: hslToHex(h, s, Math.min(l + 10, 80)),
    400: hslToHex(h, Math.min(s + 5, 100), Math.max(l + 5, 5)),
    500: baseHex, // 基本色
    600: hslToHex(h, Math.min(s + 5, 100), Math.max(l - 5, 5)),
    700: hslToHex(h, Math.min(s + 10, 100), Math.max(l - 10, 5)),
    800: hslToHex(h, Math.min(s + 10, 100), Math.max(l - 20, 5)),
    900: hslToHex(h, Math.min(s + 10, 100), Math.max(l - 30, 5))
  };
}

/**
 * タイポグラフィガイドラインを生成
 * @param {Object} textData - テキスト分析結果
 * @returns {Object} タイポグラフィガイドライン
 */
function generateTypographyGuidelines(textData) {
  const guidelines = {
    fontFamily: {
      base: "'Helvetica Neue', Arial, sans-serif",
      heading: "'Helvetica Neue', Arial, sans-serif",
      code: "monospace"
    },
    fontWeight: {
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem',  // 36px
      '5xl': '3rem',     // 48px
    },
    lineHeight: {
      none: 1,
      tight: 1.25,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2
    }
  };

  // テキスト分析結果がある場合は反映
  if (textData.mainHeadings && textData.mainHeadings.length > 0) {
    // 見出しのフォントサイズを取得
    const headingSizes = textData.mainHeadings.map(heading => heading.fontSize || 0);

    if (headingSizes.length > 0) {
      const maxHeadingSize = Math.max(...headingSizes);

      // 見出しサイズに合わせて調整
      if (maxHeadingSize > 40) {
        guidelines.fontSize['5xl'] = `${Math.round(maxHeadingSize / 16)}rem`;
      } else if (maxHeadingSize > 30) {
        guidelines.fontSize['4xl'] = `${Math.round(maxHeadingSize / 16)}rem`;
      } else if (maxHeadingSize > 24) {
        guidelines.fontSize['3xl'] = `${Math.round(maxHeadingSize / 16)}rem`;
      }
    }
  }

  return guidelines;
}

/**
 * スペーシングガイドラインを生成
 * @param {Object} layoutData - レイアウト分析結果
 * @returns {Object} スペーシングガイドライン
 */
function generateSpacingGuidelines(layoutData) {
  // デフォルトのスペーシング
  const guidelines = {
    scale: {
      '0': '0',
      '1': '0.25rem',  // 4px
      '2': '0.5rem',   // 8px
      '3': '0.75rem',  // 12px
      '4': '1rem',     // 16px
      '5': '1.25rem',  // 20px
      '6': '1.5rem',   // 24px
      '8': '2rem',     // 32px
      '10': '2.5rem',  // 40px
      '12': '3rem',    // 48px
      '16': '4rem',    // 64px
      '20': '5rem',    // 80px
      '24': '6rem',    // 96px
      '32': '8rem',    // 128px
    },
    components: {
      buttonPadding: '0.5rem 1rem',
      cardPadding: '1rem',
      sectionPadding: '2rem 1rem',
      containerMaxWidth: '1200px',
      containerPadding: '1rem'
    }
  };

  // レイアウトデータがある場合は反映
  if (layoutData.horizontalAlignment && layoutData.horizontalAlignment.margins) {
    const margins = layoutData.horizontalAlignment.margins;

    if (margins.left > 0) {
      // コンテナの左右のパディングを設定
      const containerPadding = `${Math.round(margins.left / 16)}rem`;
      guidelines.components.containerPadding = containerPadding;
    }
  }

  return guidelines;
}

/**
 * コンポーネントガイドラインを生成
 * @param {Object} componentsData - コンポーネント分析結果
 * @returns {Object} コンポーネントガイドライン
 */
function generateComponentGuidelines(componentsData) {
  // デフォルトのコンポーネントスタイル
  const guidelines = {
    button: {
      variants: ['primary', 'secondary', 'outline', 'text'],
      sizes: ['sm', 'md', 'lg'],
      radius: '0.25rem',
      defaultPadding: '0.5rem 1rem'
    },
    card: {
      variants: ['elevated', 'outlined', 'filled'],
      radius: '0.5rem',
      padding: '1rem',
      shadow: '0 2px 4px rgba(0,0,0,0.1)'
    },
    input: {
      variants: ['outlined', 'filled', 'standard'],
      radius: '0.25rem',
      padding: '0.5rem 0.75rem'
    },
    navigation: {
      height: '64px',
      mobileHeight: '56px'
    }
  };

  // コンポーネントデータがある場合は反映
  if (componentsData.hasHero) {
    guidelines.hero = {
      minHeight: '400px',
      textAlignment: componentsData.hasHero.hasHeading ? 'center' : 'left',
      overlayOpacity: 0.4
    };
  }

  if (componentsData.hasNavbar) {
    guidelines.navigation = {
      ...guidelines.navigation,
      position: 'sticky',
      backgroundColor: 'transparent',
      itemSpacing: '1.5rem'
    };
  }

  if (componentsData.hasCards) {
    const cardCount = componentsData.hasCards.length;

    guidelines.cardGroup = {
      layout: cardCount <= 3 ? 'flex' : 'grid',
      columns: Math.min(cardCount, 4),
      gap: '1.5rem'
    };
  }

  if (componentsData.hasFooter) {
    guidelines.footer = {
      padding: '3rem 1rem',
      backgroundColor: 'var(--color-gray-100)',
      textColor: 'var(--color-gray-800)'
    };
  }

  return guidelines;
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
 * HSLからHEXに変換
 * @param {number} h - 色相
 * @param {number} s - 彩度
 * @param {number} l - 明度
 * @returns {string} HEX色コード
 */
function hslToHex(h, s, l) {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l; // 無彩色
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * ガイドラインをCSSカスタムプロパティに変換
 * @param {Object} guidelines - デザインガイドライン
 * @returns {string} CSSカスタムプロパティ
 */
function convertGuidelinesToCSS(guidelines) {
  try {
    if (!guidelines) {
      return '';
    }

    let css = `:root {\n`;

    // カラー変数
    if (guidelines.colors) {
      css += `  /* Colors */\n`;

      // 主要カラー
      if (guidelines.colors.primary) {
        css += `  --color-primary: ${guidelines.colors.primary.base};\n`;

        // バリアント
        if (guidelines.colors.primary.variants) {
          Object.entries(guidelines.colors.primary.variants).forEach(([key, value]) => {
            css += `  --color-primary-${key}: ${value};\n`;
          });
        }
      }

      if (guidelines.colors.secondary) {
        css += `  --color-secondary: ${guidelines.colors.secondary.base};\n`;

        // バリアント
        if (guidelines.colors.secondary.variants) {
          Object.entries(guidelines.colors.secondary.variants).forEach(([key, value]) => {
            css += `  --color-secondary-${key}: ${value};\n`;
          });
        }
      }

      if (guidelines.colors.accent) {
        css += `  --color-accent: ${guidelines.colors.accent.base};\n`;
      }

      // ニュートラルカラー
      if (guidelines.colors.neutrals && guidelines.colors.neutrals.length > 0) {
        guidelines.colors.neutrals.forEach(neutral => {
          css += `  --color-${neutral.name}: ${neutral.hex};\n`;
        });
      }

      // セマンティックカラー
      if (guidelines.colors.semantic) {
        Object.entries(guidelines.colors.semantic).forEach(([key, value]) => {
          if (value) {
            css += `  --color-${key}: ${value};\n`;
          }
        });
      }
    }

    // タイポグラフィ変数
    if (guidelines.typography) {
      css += `\n  /* Typography */\n`;

      if (guidelines.typography.fontFamily) {
        Object.entries(guidelines.typography.fontFamily).forEach(([key, value]) => {
          css += `  --font-family-${key}: ${value};\n`;
        });
      }

      if (guidelines.typography.fontSize) {
        Object.entries(guidelines.typography.fontSize).forEach(([key, value]) => {
          css += `  --font-size-${key}: ${value};\n`;
        });
      }

      if (guidelines.typography.fontWeight) {
        Object.entries(guidelines.typography.fontWeight).forEach(([key, value]) => {
          css += `  --font-weight-${key}: ${value};\n`;
        });
      }

      if (guidelines.typography.lineHeight) {
        Object.entries(guidelines.typography.lineHeight).forEach(([key, value]) => {
          css += `  --line-height-${key}: ${value};\n`;
        });
      }
    }

    // スペーシング変数
    if (guidelines.spacing) {
      css += `\n  /* Spacing */\n`;

      if (guidelines.spacing.scale) {
        Object.entries(guidelines.spacing.scale).forEach(([key, value]) => {
          css += `  --spacing-${key}: ${value};\n`;
        });
      }

      if (guidelines.spacing.components) {
        Object.entries(guidelines.spacing.components).forEach(([key, value]) => {
          css += `  --${key}: ${value};\n`;
        });
      }
    }

    // コンポーネント変数
    if (guidelines.components) {
      css += `\n  /* Components */\n`;

      Object.entries(guidelines.components).forEach(([component, props]) => {
        Object.entries(props).forEach(([prop, value]) => {
          if (typeof value === 'string' || typeof value === 'number') {
            css += `  --${component}-${prop}: ${value};\n`;
          }
        });
      });
    }

    css += `}\n`;
    return css;
  } catch (error) {
    console.error('ガイドラインのCSS変換中にエラーが発生しました:', error);
    return '';
  }
}

// モジュールのエクスポート
export {
  generateGuidelines,
  generateColorGuidelines,
  generateTypographyGuidelines,
  generateSpacingGuidelines,
  generateComponentGuidelines
};
