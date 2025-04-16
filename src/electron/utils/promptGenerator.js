import { analyzeImageSections, detectMainSections, detectCardElements, detectFeatureElements } from "./imageAnalyzer";

// 分析モジュールの名前空間（第1段階：基盤作り）
const AnalysisModules = {
  // ブレークポイント管理ユーティリティ
  breakpoints: {
    // デフォルト値
    defaults: {
      md: 768
    },

    // ブレークポイント値を取得（優先順位: 引数 > プロジェクト設定 > デフォルト値）
    getMdValue(options = {}) {
      // aiBreakpointsから取得（複数ブレークポイントの場合はmdを探す）
      if (options.aiBreakpoints && Array.isArray(options.aiBreakpoints) && options.aiBreakpoints.length > 0) {
        // mdという名前のブレークポイントを探す
        const mdBreakpoint = options.aiBreakpoints.find(bp => bp.name === 'md');
        if (mdBreakpoint && typeof mdBreakpoint.value === 'number') {
          return mdBreakpoint.value;
        }
        // mdが見つからない場合は最初のブレークポイントを使用
        if (options.aiBreakpoints[0].value) {
          return options.aiBreakpoints[0].value;
        }
      }

      // 直接breakpointプロパティが指定されている場合
      if (options.breakpoint && typeof options.breakpoint === 'number') {
        return options.breakpoint;
      }

      // デフォルト値を返す
      return this.defaults.md;
    },

    // レスポンシブモードに応じたSCSSメディアクエリを生成
    generateMediaQuery(breakpoint, cssContent, mode = 'pc') {
      const mdValue = typeof breakpoint === 'number' ? breakpoint : this.defaults.md;

      if (mode === 'sp') {
        // スマホファースト（min-width）
        return `@include mq(md) {\n    ${cssContent.replace(/\n/g, '\n    ')}\n  }`;
      } else {
        // PCファースト（max-width）
        return `@include mq(md) {\n    ${cssContent.replace(/\n/g, '\n    ')}\n  }`;
      }
    },

    // レスポンシブモードを判断（'pc', 'sp', または 'both'）
    getResponsiveMode(options = {}) {
      return options.responsiveMode || 'pc';
    }
  },

  color: {
    // カラー分析メイン関数
    analyzeColors(colors) {
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
        const hueGroups = this.groupColorsByHue(colors);

        // カラーパレットを生成
        const palette = this.generateColorPalette(colors);

        // 主要色を選定
        const keyColors = this.selectKeyColors(sortedByUsage, hueGroups);

        // コントラスト比を計算
        const contrastRatios = this.calculateContrastRatios(keyColors);

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
    },

    // 色を色相でグループ化
    groupColorsByHue(colors) {
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
        const { h, s, l } = this.hexToHsl(color.hex);

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
    },

    // カラーパレットを生成
    generateColorPalette(colors) {
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
          return this.calculateColorDifference(color.hex, existingColor.hex) < 15;
        });

        if (!isSimilarToExisting) {
          palette.push({
            hex: color.hex,
            rgb: color.rgb || this.hexToRgb(color.hex),
            ratio: color.ratio,
            role: color.role || this.inferColorRole(color)
          });
          addedHexValues.add(color.hex);
        }

        // 最大8色まで
        if (palette.length >= 8) return;
      });

      return palette;
    },

    // 主要色を選定
    selectKeyColors(sortedColors, hueGroups) {
      let primary = null;
      let secondary = null;
      let accent = null;
      let background = null;
      let text = null;

      // 背景色候補（明るい色、使用頻度高）
      const backgroundCandidates = sortedColors.filter(color => {
        const { l } = this.hexToHsl(color.hex);
        return l > 80 && color.ratio > 0.1;
      });

      // テキスト色候補（暗い色、使用頻度中〜高）
      const textCandidates = sortedColors.filter(color => {
        const { l } = this.hexToHsl(color.hex);
        return l < 30 && color.ratio > 0.05;
      });

      // 背景色の選定
      if (backgroundCandidates.length > 0) {
        background = {
          hex: backgroundCandidates[0].hex,
          rgb: backgroundCandidates[0].rgb || this.hexToRgb(backgroundCandidates[0].hex)
        };
      } else {
        // 背景候補がなければ最も明るい色
        const brightestColor = [...sortedColors].sort((a, b) => {
          const { l: aL } = this.hexToHsl(a.hex);
          const { l: bL } = this.hexToHsl(b.hex);
          return bL - aL;
        })[0];

        if (brightestColor) {
          background = {
            hex: brightestColor.hex,
            rgb: brightestColor.rgb || this.hexToRgb(brightestColor.hex)
          };
        }
      }

      // テキスト色の選定
      if (textCandidates.length > 0) {
        text = {
          hex: textCandidates[0].hex,
          rgb: textCandidates[0].rgb || this.hexToRgb(textCandidates[0].hex)
        };
      } else {
        // テキスト候補がなければ最も暗い色
        const darkestColor = [...sortedColors].sort((a, b) => {
          const { l: aL } = this.hexToHsl(a.hex);
          const { l: bL } = this.hexToHsl(b.hex);
          return aL - bL;
        })[0];

        if (darkestColor) {
          text = {
            hex: darkestColor.hex,
            rgb: darkestColor.rgb || this.hexToRgb(darkestColor.hex)
          };
        }
      }

      // プライマリカラーの選定 - 最も使用頻度が高い彩度の高い色
      const saturatedColors = sortedColors.filter(color => {
        const { s } = this.hexToHsl(color.hex);
        return s > 40; // 十分な彩度
      });

      if (saturatedColors.length > 0) {
        primary = {
          hex: saturatedColors[0].hex,
          rgb: saturatedColors[0].rgb || this.hexToRgb(saturatedColors[0].hex)
        };
      } else if (sortedColors.length > 0) {
        // 彩度の高い色がなければ最も使用頻度の高い色（背景・テキスト以外）
        const candidates = sortedColors.filter(color => {
          return color.hex !== background?.hex && color.hex !== text?.hex;
        });

        if (candidates.length > 0) {
          primary = {
            hex: candidates[0].hex,
            rgb: candidates[0].rgb || this.hexToRgb(candidates[0].hex)
          };
        } else {
          // 候補がなければ最初の色
          primary = {
            hex: sortedColors[0].hex,
            rgb: sortedColors[0].rgb || this.hexToRgb(sortedColors[0].hex)
          };
        }
      }

      // セカンダリカラーの選定 - プライマリと色相が異なる色の中で最も使用頻度の高いもの
      if (primary && hueGroups.length > 1) {
        const primaryHue = this.hexToHsl(primary.hex).h;

        // プライマリと異なる色相グループを探す
        for (const group of hueGroups) {
          // 最初の色のHSLを取得
          if (group.colors.length === 0) continue;
          const groupHue = group.colors[0].hsl.h;

          // 色相の差が大きい（60度以上離れている）場合
          if (Math.abs(groupHue - primaryHue) > 60 ||
            Math.abs(groupHue - primaryHue) > 300) { // 赤と紫の場合

            // このグループから最も彩度の高い色を選定
            const candidate = group.colors.sort((a, b) => b.hsl.s - a.hsl.s)[0];
            if (candidate && candidate.hex !== primary.hex) {
              secondary = {
                hex: candidate.hex,
                rgb: candidate.rgb || this.hexToRgb(candidate.hex)
              };
              break;
            }
          }
        }

        // セカンダリが見つからなければ2番目に使用頻度の高い彩度のある色
        if (!secondary && saturatedColors.length > 1) {
          secondary = {
            hex: saturatedColors[1].hex,
            rgb: saturatedColors[1].rgb || this.hexToRgb(saturatedColors[1].hex)
          };
        }
      }

      // アクセントカラーの選定 - 最も彩度が高く、プライマリ・セカンダリと異なるもの
      const accentCandidates = sortedColors.filter(color => {
        const { s } = this.hexToHsl(color.hex);
        return s > 60 && // 高彩度
          color.hex !== primary?.hex && // プライマリではない
          color.hex !== secondary?.hex; // セカンダリではない
      });

      if (accentCandidates.length > 0) {
        accent = {
          hex: accentCandidates[0].hex,
          rgb: accentCandidates[0].rgb || this.hexToRgb(accentCandidates[0].hex)
        };
      } else if (sortedColors.length > 2) {
        // 条件を満たす色がなければ使用頻度3位の色（あれば）
        const thirdColor = sortedColors.filter(color =>
          color.hex !== primary?.hex && color.hex !== secondary?.hex
        )[0];

        if (thirdColor) {
          accent = {
            hex: thirdColor.hex,
            rgb: thirdColor.rgb || this.hexToRgb(thirdColor.hex)
          };
        }
      }

      return { primary, secondary, accent, background, text };
    },

    // コントラスト比を計算
    calculateContrastRatios(keyColors) {
      const contrastRatios = {};

      if (keyColors.background && keyColors.text) {
        contrastRatios.backgroundToText = this.calculateContrast(
          keyColors.background.hex,
          keyColors.text.hex
        );
      }

      if (keyColors.background && keyColors.primary) {
        contrastRatios.backgroundToPrimary = this.calculateContrast(
          keyColors.background.hex,
          keyColors.primary.hex
        );
      }

      if (keyColors.background && keyColors.secondary) {
        contrastRatios.backgroundToSecondary = this.calculateContrast(
          keyColors.background.hex,
          keyColors.secondary.hex
        );
      }

      if (keyColors.background && keyColors.accent) {
        contrastRatios.backgroundToAccent = this.calculateContrast(
          keyColors.background.hex,
          keyColors.accent.hex
        );
      }

      return contrastRatios;
    },

    // 色の役割を推測
    inferColorRole(color) {
      if (!color) return 'general';

      const hex = color.hex || '#000000';
      const ratio = color.ratio || 0;

      // 使用頻度が高い色は背景かベース
      if (ratio > 0.3) {
        return this.isLightColor(hex) ? 'background' : 'text';
      }

      // 鮮やかな色はアクセント
      if (this.isVividColor(hex)) {
        return 'accent';
      }

      return 'general';
    },

    // 明るい色かどうかを判定
    isLightColor(hex) {
      const rgb = this.hexToRgbObj(hex);
      // 輝度計算（YIQ値）
      const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
      return yiq >= 128;
    },

    // 鮮やかな色かどうかを判定
    isVividColor(hex) {
      const rgb = this.hexToRgbObj(hex);
      // 彩度の近似値を計算
      const max = Math.max(rgb.r, rgb.g, rgb.b);
      const min = Math.min(rgb.r, rgb.g, rgb.b);
      // 彩度と明度で判定
      return max > 180 && (max - min) > 50;
    },

    // HEX to HSL変換
    hexToHsl(hex) {
      const rgb = this.hexToRgbObj(hex);
      const r = rgb.r / 255;
      const g = rgb.g / 255;
      const b = rgb.b / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;

      if (max === min) {
        h = s = 0; // achromatic
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h = Math.round(h * 60);
      }

      s = Math.round(s * 100);
      l = Math.round(l * 100);

      return { h, s, l };
    },

    // HEX to RGB変換（文字列形式）
    hexToRgb(hex) {
      const rgb = this.hexToRgbObj(hex);
      return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    },

    // HEX to RGB変換（オブジェクト形式）
    hexToRgbObj(hex) {
      // #を削除
      hex = hex.replace(/^#/, '');

      // 短縮形式の場合は展開
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }

      const bigint = parseInt(hex, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;

      return { r, g, b };
    },

    // 色の差を計算（CIEDE2000アルゴリズムの簡略版）
    calculateColorDifference(hex1, hex2) {
      const rgb1 = this.hexToRgbObj(hex1);
      const rgb2 = this.hexToRgbObj(hex2);

      // 単純なRGB空間での距離計算（簡略版）
      const rDiff = rgb1.r - rgb2.r;
      const gDiff = rgb1.g - rgb2.g;
      const bDiff = rgb1.b - rgb2.b;

      return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
    },

    // コントラスト比を計算
    calculateContrast(hex1, hex2) {
      const rgb1 = this.hexToRgbObj(hex1);
      const rgb2 = this.hexToRgbObj(hex2);

      const luminance1 = this.calculateLuminance(rgb1);
      const luminance2 = this.calculateLuminance(rgb2);

      // コントラスト比の計算
      const lighter = Math.max(luminance1, luminance2);
      const darker = Math.min(luminance1, luminance2);

      return parseFloat(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
    },

    // 相対輝度を計算（WCAG 2.0定義）
    calculateLuminance(rgb) {
      // sRGB値を相対輝度に変換
      const toLinear = (val) => {
        const v = val / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };

      const r = toLinear(rgb.r);
      const g = toLinear(rgb.g);
      const b = toLinear(rgb.b);

      // 相対輝度の計算
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
  },
  component: {
    // レイアウトユーティリティ関数
    layoutUtils: {
      // 水平グループの検出
      findHorizontalGroups(elements, threshold = 20) {
        if (!Array.isArray(elements)) return [];

        const groups = [];
        const used = new Set();

        for (let i = 0; i < elements.length; i++) {
          if (used.has(i)) continue;

          const base = elements[i];
          const group = [base];
          used.add(i);

          for (let j = i + 1; j < elements.length; j++) {
            if (used.has(j)) continue;

            const target = elements[j];

            // 位置情報の取得（異なる構造に対応）
            const basePosition = base.position || {};
            const targetPosition = target.position || {};
            const baseX = basePosition.x !== undefined ? basePosition.x : (base.x || 0);
            const baseY = basePosition.y !== undefined ? basePosition.y : (base.y || 0);
            const baseWidth = basePosition.width !== undefined ? basePosition.width : (base.width || 0);
            const targetX = targetPosition.x !== undefined ? targetPosition.x : (target.x || 0);
            const targetY = targetPosition.y !== undefined ? targetPosition.y : (target.y || 0);

            const isSameRow = Math.abs(baseY - targetY) < threshold;
            const isHorizontallyClose = Math.abs(baseX + baseWidth - targetX) < threshold * 2;

            if (isSameRow && isHorizontallyClose) {
              group.push(target);
              used.add(j);
            }
          }

          if (group.length >= 2) {
            groups.push(group);
          }
        }

        return groups;
      },

      // 垂直グループの検出
      findVerticalGroups(elements, threshold = 20) {
        if (!Array.isArray(elements)) return [];

        const groups = [];
        const used = new Set();

        for (let i = 0; i < elements.length; i++) {
          if (used.has(i)) continue;

          const base = elements[i];
          const group = [base];
          used.add(i);

          for (let j = i + 1; j < elements.length; j++) {
            if (used.has(j)) continue;

            const target = elements[j];

            // 位置情報の取得（異なる構造に対応）
            const basePosition = base.position || {};
            const targetPosition = target.position || {};
            const baseX = basePosition.x !== undefined ? basePosition.x : (base.x || 0);
            const baseY = basePosition.y !== undefined ? basePosition.y : (base.y || 0);
            const baseHeight = basePosition.height !== undefined ? basePosition.height : (base.height || 0);
            const targetX = targetPosition.x !== undefined ? targetPosition.x : (target.x || 0);
            const targetY = targetPosition.y !== undefined ? targetPosition.y : (target.y || 0);

            const isSameColumn = Math.abs(baseX - targetX) < threshold;
            const isVerticallyClose = Math.abs(baseY + baseHeight - targetY) < threshold * 2;

            if (isSameColumn && isVerticallyClose) {
              group.push(target);
              used.add(j);
            }
          }

          if (group.length >= 2) {
            groups.push(group);
          }
        }

        return groups;
      },

      // バウンディングボックスの計算
      getBoundingBox(group) {
        if (!Array.isArray(group) || group.length === 0) {
          return { x: 0, y: 0, width: 0, height: 0 };
        }

        // 位置情報を安全に取得する関数
        const getPosition = (item) => {
          const pos = item.position || {};
          return {
            x: pos.x !== undefined ? pos.x : (item.x || 0),
            y: pos.y !== undefined ? pos.y : (item.y || 0),
            width: pos.width !== undefined ? pos.width : (item.width || 0),
            height: pos.height !== undefined ? pos.height : (item.height || 0)
          };
        };

        // 各要素の位置情報を取得
        const positions = group.map(getPosition);

        const x1 = Math.min(...positions.map(pos => pos.x));
        const y1 = Math.min(...positions.map(pos => pos.y));
        const x2 = Math.max(...positions.map(pos => pos.x + pos.width));
        const y2 = Math.max(...positions.map(pos => pos.y + pos.height));

        return {
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1
        };
      },

      // 要素が重なっているかどうかの判定
      isOverlapping(pos1, pos2) {
        // 位置情報が不正な場合はfalseを返す
        if (!pos1 || !pos2) return false;

        // 位置情報を安全に取得
        const p1 = {
          x: pos1.x !== undefined ? pos1.x : 0,
          y: pos1.y !== undefined ? pos1.y : 0,
          width: pos1.width !== undefined ? pos1.width : 0,
          height: pos1.height !== undefined ? pos1.height : 0
        };

        const p2 = {
          x: pos2.x !== undefined ? pos2.x : 0,
          y: pos2.y !== undefined ? pos2.y : 0,
          width: pos2.width !== undefined ? pos2.width : 0,
          height: pos2.height !== undefined ? pos2.height : 0
        };

        return !(
          p1.x + p1.width < p2.x ||
          p2.x + p2.width < p1.x ||
          p1.y + p1.height < p2.y ||
          p2.y + p2.height < p1.y
        );
      },

      // 要素間の距離を計算
      getDistance(pos1, pos2) {
        // 中心点を計算
        const center1 = {
          x: pos1.x + pos1.width / 2,
          y: pos1.y + pos1.height / 2
        };

        const center2 = {
          x: pos2.x + pos2.width / 2,
          y: pos2.y + pos2.height / 2
        };

        // ユークリッド距離を計算
        const dx = center1.x - center2.x;
        const dy = center1.y - center2.y;

        return Math.sqrt(dx * dx + dy * dy);
      }
    },

    // カードグループの検出
    detectCards(elements, options = {}) {
      try {
        const { responsiveMode = "pc", aiBreakpoints = [] } = options;

        // 位置情報のあるelementsのみフィルタリング
        const validElements = elements.filter(el => {
          const hasPosition = el.position || (el.x !== undefined && el.y !== undefined);
          return hasPosition && (el.position?.width || el.width) > 0 && (el.position?.height || el.height) > 0;
        });

        if (validElements.length < 2) return [];

        const horizontalGroups = this.layoutUtils.findHorizontalGroups(validElements);

        const isMobileFirst = responsiveMode === "sp" || responsiveMode === "both";
        const breakpointName = aiBreakpoints && aiBreakpoints.length > 0 ?
          aiBreakpoints[0].name || 'md' : 'md';

        const detected = [];

        horizontalGroups.forEach((group, index) => {
          const layoutType = 'grid'; // 横並びなら基本はグリッド想定
          const groupBounds = this.layoutUtils.getBoundingBox(group);

          // カード要素を判定
          const cardItems = group.map(el => {
            const pos = el.position || {};
            return {
              type: 'card',
              position: {
                x: pos.x !== undefined ? pos.x : (el.x || 0),
                y: pos.y !== undefined ? pos.y : (el.y || 0),
                width: pos.width !== undefined ? pos.width : (el.width || 0),
                height: pos.height !== undefined ? pos.height : (el.height || 0)
              }
            };
          });

          detected.push({
            type: 'card_group',
            count: group.length,
            layout: layoutType,
            position: groupBounds,
            items: cardItems,
            responsiveRecommendation: {
              description: `カードグループにはグリッドレイアウトを使用し、小さい画面では縦に並べます。`,
              cssExample: isMobileFirst ?
                `.card-group {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;

  @include mq(${breakpointName}) {
    grid-template-columns: repeat(${group.length}, 1fr);
    gap: 2rem;
  }
}` :
                `.card-group {
  display: grid;
  grid-template-columns: repeat(${group.length}, 1fr);
  gap: 2rem;

  @include mq(${breakpointName}) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}`
            }
          });
        });

        return detected;
      } catch (error) {
        console.error('カード検出中にエラーが発生しました:', error);
        return [];
      }
    },

    // ヒーローセクションの検出
    detectHero(elements, textBlocks = [], options = {}) {
      try {
        const { responsiveMode = "pc", aiBreakpoints = [] } = options;

        // 位置情報のあるelementsのみフィルタリング
        const validElements = elements.filter(el => {
          const hasPosition = el.position || (el.x !== undefined && el.y !== undefined);
          return hasPosition;
        });

        if (validElements.length === 0) return null;

        // 見出しとなる大きなテキストを探す
        const headingCandidates = validElements.filter(el => {
          const position = el.position || {};
          const y = position.y !== undefined ? position.y : (el.y || 0);
          return (
            (el.type === 'text' || el.tag === 'h1' || el.tag === 'h2') &&
            ((el.fontSize && el.fontSize >= 28) || el.tag === 'h1' || el.tag === 'h2') &&
            y < 400
          );
        });

        // サポートするテキストブロックがあれば追加で検索
        if (Array.isArray(textBlocks) && textBlocks.length > 0) {
          // textBlocksから大きなフォントのものを抽出
          const largeTextBlocks = textBlocks.filter(block =>
            block.fontSize >= 28 && block.position && block.position.y < 400
          );

          if (largeTextBlocks.length > 0) {
            headingCandidates.push(...largeTextBlocks);
          }
        }

        const hasLargeHeading = headingCandidates.length > 0;

        // ヒーロー画像を探す
        const heroImage = validElements.find(el => {
          const position = el.position || {};
          const y = position.y !== undefined ? position.y : (el.y || 0);
          const height = position.height !== undefined ? position.height : (el.height || 0);

          return (
            el.type === 'image' &&
            y < 500 &&
            height > 200
          );
        });

        // ヒーローセクションの条件を満たすか確認
        if (hasLargeHeading || heroImage) {
          const elementsToCheck = [...(hasLargeHeading ? headingCandidates : [])];
          if (heroImage) elementsToCheck.push(heroImage);

          const isMobileFirst = responsiveMode === "sp" || responsiveMode === "both";
          const breakpointName = aiBreakpoints && aiBreakpoints.length > 0 ?
            aiBreakpoints[0].name || 'md' : 'md';

          return {
            type: 'hero',
            confidence: heroImage && hasLargeHeading ? 0.9 : 0.7,
            position: this.layoutUtils.getBoundingBox(elementsToCheck),
            hasHeading: hasLargeHeading,
            imageElement: heroImage,
            responsiveRecommendation: {
              description: 'フルワイドのレイアウトで見出しとサポート画像を使用し、モバイルでは縦に積み重ねます。',
              cssExample: isMobileFirst ?
                `.hero {
  display: flex;
  flex-direction: column;
  text-align: center;

  @include mq(${breakpointName}) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    text-align: left;
  }
}` :
                `.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;

  @include mq(${breakpointName}) {
    flex-direction: column;
    text-align: center;
  }
}`
            }
          };
        }

        return null;
      } catch (error) {
        console.error('ヒーロー検出中にエラーが発生しました:', error);
        return null;
      }
    },

    // ナビゲーションバーの検出
    detectNavbar(elements, options = {}) {
      try {
        const { responsiveMode = "pc", aiBreakpoints = [] } = options;

        // 位置情報のあるelementsのみフィルタリング
        const validElements = elements.filter(el => {
          const hasPosition = el.position || (el.x !== undefined && el.y !== undefined);
          return hasPosition;
        });

        if (validElements.length < 3) return null;

        // リンク要素を探す
        const linkElements = validElements.filter(el => {
          const position = el.position || {};
          const y = position.y !== undefined ? position.y : (el.y || 0);

          return (
            (el.type === 'link' || el.tag === 'a') &&
            y < 150
          );
        });

        // 十分な数のリンクがあるか確認
        if (linkElements.length >= 3) {
          // 同じ行にあるか確認
          const firstElement = linkElements[0];
          const firstY = firstElement.position ? firstElement.position.y : (firstElement.y || 0);

          const sameLine = linkElements.every(el => {
            const elY = el.position ? el.position.y : (el.y || 0);
            return Math.abs(elY - firstY) < 15;
          });

          if (sameLine) {
            const isMobileFirst = responsiveMode === "sp" || responsiveMode === "both";
            const breakpointName = aiBreakpoints && aiBreakpoints.length > 0 ?
              aiBreakpoints[0].name || 'md' : 'md';

            return {
              type: 'navbar',
              confidence: 0.95,
              links: linkElements.length,
              position: this.layoutUtils.getBoundingBox(linkElements),
              responsiveRecommendation: {
                description: 'PC向けは水平ナビゲーション、モバイルではハンバーガーメニューに変換します。',
                cssExample: isMobileFirst ?
                  `.navbar {
  display: flex;
  flex-direction: column;

  @include mq(${breakpointName}) {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}` :
                  `.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;

  @include mq(${breakpointName}) {
    flex-direction: column;
  }
}`
              }
            };
          }
        }

        return null;
      } catch (error) {
        console.error('ナビゲーション検出中にエラーが発生しました:', error);
        return null;
      }
    },

    // フィーチャーリストの検出 (アイコン + テキストの繰り返し)
    detectFeatureList(elements, options = {}) {
      try {
        const { responsiveMode = "pc", aiBreakpoints = [] } = options;

        // 位置情報のあるelementsのみフィルタリング
        const validElements = elements.filter(el => {
          const hasPosition = el.position || (el.x !== undefined && el.y !== undefined);
          return hasPosition;
        });

        if (validElements.length < 4) return null; // 最低4要素（アイコン2つ+テキスト2つ）

        // アイコン要素を見つける
        const iconElements = validElements.filter(el => {
          const position = el.position || {};
          const width = position.width !== undefined ? position.width : (el.width || 0);
          const height = position.height !== undefined ? position.height : (el.height || 0);

          return (
            el.type === 'icon' ||
            (el.type === 'image' && width < 80 && height < 80)
          );
        });

        if (iconElements.length < 2) return null;

        // 各アイコンの近くにテキストがあるか確認
        const featureItems = [];

        iconElements.forEach(icon => {
          const iconPosition = icon.position || {
            x: icon.x || 0,
            y: icon.y || 0,
            width: icon.width || 0,
            height: icon.height || 0
          };

          const nearbyTexts = validElements.filter(el => {
            if (el.type !== 'text') return false;

            const elPosition = el.position || {
              x: el.x || 0,
              y: el.y || 0,
              width: el.width || 0,
              height: el.height || 0
            };

            return (
              Math.abs(elPosition.x - iconPosition.x) < 100 &&
              Math.abs(elPosition.y - iconPosition.y) < 100
            );
          });

          if (nearbyTexts.length > 0) {
            featureItems.push({
              icon,
              texts: nearbyTexts,
              position: this.layoutUtils.getBoundingBox([icon, ...nearbyTexts])
            });
          }
        });

        if (featureItems.length >= 2) {
          const isMobileFirst = responsiveMode === "sp" || responsiveMode === "both";
          const breakpointName = aiBreakpoints && aiBreakpoints.length > 0 ?
            aiBreakpoints[0].name || 'md' : 'md';

          // 横並びか縦並びか判定
          const item0 = featureItems[0].position;
          const item1 = featureItems[1].position;
          const isHorizontal = Math.abs(item0.y - item1.y) < 50;

          return {
            type: 'feature_list',
            count: featureItems.length,
            layout: isHorizontal ? 'horizontal' : 'vertical',
            position: this.layoutUtils.getBoundingBox(featureItems.map(item => item.position)),
            items: featureItems,
            responsiveRecommendation: {
              description: `${isHorizontal ? '特徴リストを横並びグリッドで配置し' : '特徴リストを縦に積み重ね'}、適切な間隔を設定します。`,
              cssExample: isMobileFirst ?
                `.feature-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;

  @include mq(${breakpointName}) {
    grid-template-columns: repeat(${Math.min(featureItems.length, 3)}, 1fr);
  }
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}` :
                `.feature-list {
  display: grid;
  grid-template-columns: repeat(${Math.min(featureItems.length, 3)}, 1fr);
  gap: 2rem;

  @include mq(${breakpointName}) {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}`
            }
          };
        }

        return null;
      } catch (error) {
        console.error('フィーチャーリスト検出中にエラーが発生しました:', error);
        return null;
      }
    },

    // メインのコンポーネント検出関数
    detectComponents(data, options = {}) {
      try {
        if (!data) {
          return { hasComponents: false };
        }

        // elementsの取得 (異なる構造に対応)
        let elements = [];
        if (data.elements) {
          elements = Array.isArray(data.elements) ? data.elements :
            (data.elements.elements && Array.isArray(data.elements.elements) ?
              data.elements.elements : []);
        }

        // テキストブロックの取得
        const textBlocks = Array.isArray(data.textBlocks) ? data.textBlocks : [];

        const result = {
          hasComponents: elements.length > 0,
          components: []
        };

        // 各コンポーネントの検出
        // ヒーローセクション
        const hero = this.detectHero(elements, textBlocks, options);
        if (hero) {
          result.hasHero = hero;
          result.components.push(hero);
        }

        // ナビゲーションバー
        const navbar = this.detectNavbar(elements, options);
        if (navbar) {
          result.hasNavbar = navbar;
          result.components.push(navbar);
        }

        // カードグループ
        const cards = this.detectCards(elements, options);
        if (cards && cards.length > 0) {
          result.hasCards = cards;
          result.components.push(...cards);
        }

        // フィーチャーリスト
        const featureList = this.detectFeatureList(elements, options);
        if (featureList) {
          result.hasFeatureList = featureList;
          result.components.push(featureList);
        }

        // レスポンシブ戦略の推論
        if (result.components.length > 0) {
          result.responsiveStrategy = this.inferResponsiveStrategy(result.components, options);
        }

        return result;
      } catch (error) {
        console.error('コンポーネント検出中にエラーが発生しました:', error);
        return { hasComponents: false };
      }
    },

    // レスポンシブ戦略を推論する関数
    inferResponsiveStrategy(components, options = {}) {
      const { responsiveMode = "pc", aiBreakpoints = [] } = options;

      // アプローチを決定
      const approach = responsiveMode === "sp"
        ? "mobile-first"
        : (responsiveMode === "pc" ? "desktop-first" : "responsive-both");

      // ブレークポイント名を特定
      const breakpointName = aiBreakpoints && aiBreakpoints.length > 0
        ? (aiBreakpoints[0].name || 'md') : 'md';

      // @include mqを使った共通のメディアクエリパターン
      const mediaQueryPattern =
        `// 常にセレクタの中にメディアクエリを配置
.selector {
  // ${approach === "mobile-first" ? "モバイル" : "デスクトップ"}用基本スタイル

  @include mq(${breakpointName}) {
    // ${approach === "mobile-first" ? "デスクトップ" : "モバイル"}用スタイル
  }
}`;

      return {
        approach,
        breakpointName,
        mediaQueryPattern,
        generalGuidance: `${approach === "mobile-first" ? "モバイルファースト" : "デスクトップファースト"}アプローチを使用し、@include mq(${breakpointName})でレスポンシブスタイルを適用します。`
      };
    },

    // コンポーネント分析結果からプロンプトセクションを生成
    buildComponentSection(componentAnalysis, options = {}) {
      if (!componentAnalysis || !componentAnalysis.hasComponents) {
        return '';
      }

      const { responsiveMode, aiBreakpoints } = options;

      let section = "\n## コンポーネント構造と実装\n\n";

      // コンポーネント構造の説明
      section += "### 検出されたコンポーネント\n";
      componentAnalysis.components.forEach(comp => {
        section += `- **${comp.type}**${comp.count ? ` (${comp.count}アイテム)` : ''}: ${comp.confidence ? `確度${Math.round(comp.confidence * 100)}%` : ''}\n`;
      });

      // レスポンシブ実装ガイド
      if (componentAnalysis.responsiveStrategy) {
        section += "\n### レスポンシブ実装ガイド\n";
        section += `${componentAnalysis.responsiveStrategy.generalGuidance}\n\n`;

        // コンポーネント別の実装例
        componentAnalysis.components.forEach(comp => {
          if (comp.responsiveRecommendation) {
            section += `#### ${comp.type}コンポーネント\n`;
            section += `${comp.responsiveRecommendation.description}\n\n`;
            section += "```scss\n" + comp.responsiveRecommendation.cssExample + "\n```\n\n";
          }
        });

        // メディアクエリの使用方法について強調
        section += "**重要: @include mq()は必ずセレクタの内側に配置してください:**\n";
        section += "```scss\n" + componentAnalysis.responsiveStrategy.mediaQueryPattern + "\n```\n\n";
      }

      return section;
    }
  },
  text: {
    // textAnalyzer.jsから抽出予定
    analyzeText(rawData, options = {}) {
      console.log("Analyzing text data:", rawData.textBlocks?.length || 0, "text blocks");

      // Default values for font properties
      const defaultFontProperties = {
        baseFontSize: 16,
        headingSizes: {
          primary: 32,
          secondary: 24,
          tertiary: 20
        },
        bodySizes: {
          primary: 16,
          secondary: 14
        },
        fontFamilies: {
          heading: 'sans-serif',
          body: 'sans-serif'
        }
      };

      // Extract text blocks from raw data
      const textBlocks = rawData.textBlocks || [];

      // Initialize results
      const result = {
        hasText: textBlocks.length > 0,
        fontProperties: { ...defaultFontProperties },
        textStyles: [],

        // Helper method to build text section for prompts
        buildTextSection(data, options = {}) {
          if (!data.hasText) {
            return '';
          }

          let section = "\n### Typography Analysis\n";

          // Font sizes
          section += "#### Font Sizes\n";
          section += `- Base font size: ${data.fontProperties.baseFontSize}px\n`;
          section += `- Heading sizes: ${data.fontProperties.headingSizes.primary}px (h2), ${data.fontProperties.headingSizes.secondary}px (h3)\n`;
          section += `- Body text: ${data.fontProperties.bodySizes.primary}px\n`;
          if (data.fontProperties.bodySizes.secondary) {
            section += `- Secondary text: ${data.fontProperties.bodySizes.secondary}px\n`;
          }

          // Font families
          if (data.fontProperties.fontFamilies) {
            section += "\n#### Font Families\n";
            section += `- Headings: ${data.fontProperties.fontFamilies.heading}\n`;
            section += `- Body: ${data.fontProperties.fontFamilies.body}\n`;
          }

          // Text styles
          if (data.textStyles && data.textStyles.length > 0) {
            section += "\n#### Text Styles\n";
            data.textStyles.forEach(style => {
              section += `- ${style.name}: ${style.properties.join(', ')}\n`;
            });
          }

          // Responsive typography
          const breakpoint = options.breakpoint || 768;
          section += "\n#### Responsive Typography\n";
          section += `- Below ${breakpoint}px: Reduce heading sizes by ~20-25%\n`;
          section += `- Below ${breakpoint}px: Maintain body text size for readability\n`;

          return section;
        }
      };

      // Analyze text blocks if available
      if (textBlocks.length > 0) {
        // Extract font sizes from text blocks
        const fontSizes = textBlocks
          .filter(block => block.fontSize && !isNaN(parseFloat(block.fontSize)))
          .map(block => parseFloat(block.fontSize));

        // Extract font families from text blocks
        const fontFamilies = textBlocks
          .filter(block => block.fontFamily)
          .map(block => block.fontFamily);

        // If we have font sizes, analyze them
        if (fontSizes.length > 0) {
          // Sort font sizes
          fontSizes.sort((a, b) => b - a);

          // Extract largest sizes for headings
          if (fontSizes.length >= 3) {
            result.fontProperties.headingSizes.primary = fontSizes[0];
            result.fontProperties.headingSizes.secondary = fontSizes[1];
            result.fontProperties.headingSizes.tertiary = fontSizes[2];
          } else if (fontSizes.length >= 2) {
            result.fontProperties.headingSizes.primary = fontSizes[0];
            result.fontProperties.headingSizes.secondary = fontSizes[1];
          } else if (fontSizes.length >= 1) {
            result.fontProperties.headingSizes.primary = fontSizes[0];
          }

          // Find the most common font size for body text
          const fontSizeCounts = {};
          fontSizes.forEach(size => {
            fontSizeCounts[size] = (fontSizeCounts[size] || 0) + 1;
          });

          let maxCount = 0;
          let mostCommonSize = defaultFontProperties.bodySizes.primary;

          Object.keys(fontSizeCounts).forEach(size => {
            if (fontSizeCounts[size] > maxCount && parseFloat(size) < result.fontProperties.headingSizes.tertiary) {
              maxCount = fontSizeCounts[size];
              mostCommonSize = parseFloat(size);
            }
          });

          result.fontProperties.bodySizes.primary = mostCommonSize;
          result.fontProperties.baseFontSize = mostCommonSize;
        }

        // If we have font families, analyze them
        if (fontFamilies.length > 0) {
          // Count occurrences of each font family
          const fontFamilyCounts = {};
          fontFamilies.forEach(family => {
            fontFamilyCounts[family] = (fontFamilyCounts[family] || 0) + 1;
          });

          // Find the most common font families
          let maxHeadingCount = 0;
          let maxBodyCount = 0;
          let headingFont = defaultFontProperties.fontFamilies.heading;
          let bodyFont = defaultFontProperties.fontFamilies.body;

          Object.keys(fontFamilyCounts).forEach(family => {
            // Check if this appears to be a heading font (larger sizes)
            const isHeadingFont = textBlocks.some(block =>
              block.fontFamily === family &&
              parseFloat(block.fontSize) >= result.fontProperties.headingSizes.tertiary
            );

            if (isHeadingFont && fontFamilyCounts[family] > maxHeadingCount) {
              maxHeadingCount = fontFamilyCounts[family];
              headingFont = family;
            } else if (!isHeadingFont && fontFamilyCounts[family] > maxBodyCount) {
              maxBodyCount = fontFamilyCounts[family];
              bodyFont = family;
            }
          });

          result.fontProperties.fontFamilies.heading = headingFont;
          result.fontProperties.fontFamilies.body = bodyFont;
        }

        // Create text styles from combinations of properties
        const textStyles = [];

        // Heading styles
        textStyles.push({
          name: 'Primary Heading (h2)',
          properties: [
            `font-size: ${result.fontProperties.headingSizes.primary}px`,
            `font-family: ${result.fontProperties.fontFamilies.heading}`,
            'font-weight: bold',
            'line-height: 1.2'
          ]
        });

        textStyles.push({
          name: 'Secondary Heading (h3)',
          properties: [
            `font-size: ${result.fontProperties.headingSizes.secondary}px`,
            `font-family: ${result.fontProperties.fontFamilies.heading}`,
            'font-weight: bold',
            'line-height: 1.3'
          ]
        });

        // Body text style
        textStyles.push({
          name: 'Body Text',
          properties: [
            `font-size: ${result.fontProperties.bodySizes.primary}px`,
            `font-family: ${result.fontProperties.fontFamilies.body}`,
            'font-weight: normal',
            'line-height: 1.5'
          ]
        });

        // Secondary/small text style
        textStyles.push({
          name: 'Small Text',
          properties: [
            `font-size: ${result.fontProperties.bodySizes.secondary}px`,
            `font-family: ${result.fontProperties.fontFamilies.body}`,
            'font-weight: normal',
            'line-height: 1.4'
          ]
        });

        result.textStyles = textStyles;
      }

      console.log("Text analysis completed:", result.hasText ? "Text found" : "No text found");
      return result;
    }
  },
  layout: {
    // レイアウト分析メイン関数
    analyzeLayout(data, options = {}) {
      try {
        if (!data) {
          return {
            hasLayout: false,
            gridSystem: null,
            spacingPatterns: null,
            alignmentPatterns: null,
            aspectRatios: null,
            recommendations: null
          };
        }

        // elementsの取得 (異なる構造に対応)
        let elements = [];
        if (data.elements) {
          elements = Array.isArray(data.elements) ? data.elements :
            (data.elements.elements && Array.isArray(data.elements.elements) ?
              data.elements.elements : []);
        }

        if (elements.length === 0) {
          return { hasLayout: false };
        }

        // グリッドシステムの検出
        const gridSystem = this.detectGridSystem(elements, options);

        // 間隔パターンの識別
        const spacingPatterns = this.identifySpacingPatterns(elements);

        // 配置パターンの識別
        const alignmentPatterns = this.analyzeAlignment(elements);

        // アスペクト比の計算
        const sections = data.sections || [];
        const aspectRatios = this.calculateAspectRatios(sections, elements);

        // レイアウト推奨事項の生成
        const recommendations = this.generateLayoutRecommendations({
          gridSystem,
          spacingPatterns,
          alignmentPatterns,
          aspectRatios
        }, options);

        return {
          hasLayout: true,
          gridSystem,
          spacingPatterns,
          alignmentPatterns,
          aspectRatios,
          recommendations
        };
      } catch (error) {
        console.error('レイアウト分析中にエラーが発生しました:', error);
        return { hasLayout: false };
      }
    },

    // レイアウトデータの標準化関数（Claudeからの提案を追加）
    normalizeLayoutData(rawData) {
      try {
        // 基本構造を準備
        const normalized = {
          hasLayout: true,
          gridSystem: null,
          spacingPatterns: null,
          alignmentPatterns: null,
          aspectRatios: null,
          recommendations: null
        };

        // sectionsデータが存在する場合は処理
        if (rawData.sections && Array.isArray(rawData.sections)) {
          // アスペクト比の計算
          normalized.aspectRatios = {
            detected: true,
            ratios: rawData.sections.map(section => {
              const width = section.position?.width || 0;
              const height = section.position?.height || 0;
              const ratio = width / height;
              return {
                name: section.section_type || 'section',
                ratio: parseFloat(ratio.toFixed(2)),
                width,
                height,
                isCommon: this.isCommonRatio(ratio)
              };
            }).filter(r => r.width > 0 && r.height > 0)
          };
        }

        // レイアウト情報が存在する場合
        if (rawData.layout) {
          // レイアウトタイプを取得
          const layoutType = rawData.layout.layoutType || 'unknown';

          // グリッドシステムの推定（layoutTypeがgridならグリッドと判断）
          normalized.gridSystem = {
            detected: layoutType === 'grid',
            columns: 12, // デフォルト値
            gaps: {
              horizontal: 20,
              vertical: 30
            },
            confidence: rawData.layout.confidence || 0.7
          };

          // 配置パターンの設定
          normalized.alignmentPatterns = {
            detected: true,
            patterns: [{ type: 'center', strength: 0.8 }],
            dominantAlignment: 'center',
            symmetrical: true
          };

          // 間隔パターンの設定
          normalized.spacingPatterns = {
            detected: true,
            patternType: 'vertical',
            vertical: [{ value: 35, frequency: 0.9 }],
            horizontal: []
          };
        }

        // レコメンデーションの生成
        normalized.recommendations = this.generateLayoutRecommendations(normalized, {
          responsiveMode: "pc",
          aiBreakpoints: []
        });

        return normalized;
      } catch (error) {
        console.error('データ正規化中にエラーが発生しました:', error);
        return { hasLayout: false };
      }
    },

    // セクションの垂直構造を分析する関数（Claudeからの提案を追加）
    analyzeVerticalStructure(sections) {
      if (!sections || !Array.isArray(sections) || sections.length < 2) {
        return {
          hasStructure: false,
          pattern: 'unknown'
        };
      }

      // セクションを上から下へソート
      const sortedSections = [...sections].sort((a, b) => {
        const aTop = a.position?.top || 0;
        const bTop = b.position?.top || 0;
        return aTop - bTop;
      });

      // セクション間の間隔を計算
      const gaps = [];
      for (let i = 1; i < sortedSections.length; i++) {
        const prevSection = sortedSections[i - 1];
        const currSection = sortedSections[i];

        const prevBottom = (prevSection.position?.top || 0) + (prevSection.position?.height || 0);
        const currTop = currSection.position?.top || 0;

        const gap = currTop - prevBottom;
        if (gap >= 0) {
          gaps.push(gap);
        }
      }

      // 間隔の一貫性を分析
      let hasConsistentGaps = false;
      let avgGap = 0;

      if (gaps.length > 0) {
        avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

        // 標準偏差を計算して一貫性をチェック
        const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
        const stdDev = Math.sqrt(variance);

        // 変動係数が0.3未満なら一貫していると判断
        hasConsistentGaps = (stdDev / avgGap) < 0.3;
      }

      // セクションタイプの分布を分析
      const typeCount = {};
      sortedSections.forEach(section => {
        const type = section.section_type || 'content';
        typeCount[type] = (typeCount[type] || 0) + 1;
      });

      // 最も多いセクションタイプを特定
      let dominantType = 'content';
      let maxCount = 0;

      Object.entries(typeCount).forEach(([type, count]) => {
        if (count > maxCount) {
          maxCount = count;
          dominantType = type;
        }
      });

      // セクション構造のパターンを特定
      let pattern = 'vertical-stack';

      // ヘッダーがあるか確認
      const hasHeader = sortedSections.some(s => s.section_type === 'header');

      // フッターがあるか確認
      const hasFooter = sortedSections.some(s => s.section_type === 'footer');

      if (hasHeader && hasFooter) {
        pattern = 'header-content-footer';
      } else if (hasHeader) {
        pattern = 'header-content';
      }

      return {
        hasStructure: true,
        pattern,
        sections: sortedSections.length,
        dominantType,
        spacing: {
          avgGap: Math.round(avgGap),
          consistent: hasConsistentGaps
        }
      };
    },

    // グリッドシステムの検出
    detectGridSystem(elements, options = {}) {
      const { responsiveMode = "pc" } = options;

      // 位置情報のある要素のみをフィルタリング
      const validElements = elements.filter(el => {
        const hasPosition = el.position || (el.x !== undefined && el.y !== undefined);
        return hasPosition && (el.position?.width || el.width) > 0 && (el.position?.height || el.height) > 0;
      });

      if (validElements.length < 3) {
        return {
          detected: false,
          columns: 0,
          gaps: { horizontal: 0, vertical: 0 },
          confidence: 0
        };
      }

      // 水平方向の位置を取得してソート
      const horizontalPositions = validElements.map(el => {
        const pos = el.position || {};
        return {
          x: pos.x !== undefined ? pos.x : (el.x || 0),
          width: pos.width !== undefined ? pos.width : (el.width || 0),
          right: (pos.x !== undefined ? pos.x : (el.x || 0)) + (pos.width !== undefined ? pos.width : (el.width || 0))
        };
      }).sort((a, b) => a.x - b.x);

      // 要素間の間隔を計算
      const gaps = [];
      for (let i = 1; i < horizontalPositions.length; i++) {
        const prevElement = horizontalPositions[i - 1];
        const currElement = horizontalPositions[i];
        const gap = currElement.x - prevElement.right;

        // 有効な間隔のみを記録 (負の値や巨大な値は無視)
        if (gap > 0 && gap < 300) {
          gaps.push(gap);
        }
      }

      // 最も頻出する間隔を特定
      const gapFrequency = {};
      let mostCommonGap = 0;
      let maxFrequency = 0;

      gaps.forEach(gap => {
        // 近似値のグループ化 (±5px)
        const roundedGap = Math.round(gap / 5) * 5;
        gapFrequency[roundedGap] = (gapFrequency[roundedGap] || 0) + 1;

        if (gapFrequency[roundedGap] > maxFrequency) {
          maxFrequency = gapFrequency[roundedGap];
          mostCommonGap = roundedGap;
        }
      });

      // カラム数の推定（画面を等分割すると仮定）
      // 標準的なデスクトップ幅を1200pxと仮定
      const assumedScreenWidth = responsiveMode === 'sp' ? 375 : 1200;
      const avgElementWidth = horizontalPositions.reduce((sum, pos) => sum + pos.width, 0) / horizontalPositions.length;

      // 推定カラム数 (最小1、最大12、整数に丸める)
      let estimatedColumns = Math.min(12, Math.max(1, Math.round(assumedScreenWidth / (avgElementWidth + mostCommonGap))));

      // 一般的なグリッドシステムの列数に合わせる (1, 2, 3, 4, 6, 12)
      const commonGrids = [1, 2, 3, 4, 6, 12];
      let closestGrid = commonGrids.reduce((prev, curr) =>
        Math.abs(curr - estimatedColumns) < Math.abs(prev - estimatedColumns) ? curr : prev
      );

      // 確信度の計算 (ギャップの一貫性と要素数に基づく)
      const gapConsistency = maxFrequency / gaps.length;
      const confidence = Math.min(0.95, Math.max(0.5, gapConsistency * 0.7 + (validElements.length > 10 ? 0.3 : 0.1)));

      return {
        detected: confidence > 0.6,
        columns: closestGrid,
        gaps: {
          horizontal: mostCommonGap,
          vertical: Math.round(mostCommonGap * 1.5) // 垂直ギャップは通常水平より大きい
        },
        confidence
      };
    },

    // 間隔パターンの識別
    identifySpacingPatterns(elements) {
      if (!elements || elements.length < 3) {
        return {
          detected: false,
          patterns: []
        };
      }

      // 位置情報のある要素のみフィルタリング
      const validElements = elements.filter(el => {
        const hasPosition = el.position || (el.x !== undefined && el.y !== undefined);
        return hasPosition;
      });

      if (validElements.length < 3) {
        return {
          detected: false,
          patterns: []
        };
      }

      // 水平間隔と垂直間隔を収集
      const horizontalSpacings = [];
      const verticalSpacings = [];

      // 位置情報を標準化する関数
      const getStandardPosition = (el) => {
        const pos = el.position || {};
        return {
          x: pos.x !== undefined ? pos.x : (el.x || 0),
          y: pos.y !== undefined ? pos.y : (el.y || 0),
          width: pos.width !== undefined ? pos.width : (el.width || 0),
          height: pos.height !== undefined ? pos.height : (el.height || 0),
          right: (pos.x !== undefined ? pos.x : (el.x || 0)) + (pos.width !== undefined ? pos.width : (el.width || 0)),
          bottom: (pos.y !== undefined ? pos.y : (el.y || 0)) + (pos.height !== undefined ? pos.height : (el.height || 0))
        };
      };

      // ソートされた位置情報を取得
      const sortedByX = [...validElements].map(getStandardPosition).sort((a, b) => a.x - b.x);
      const sortedByY = [...validElements].map(getStandardPosition).sort((a, b) => a.y - b.y);

      // 水平間隔の計算
      for (let i = 1; i < sortedByX.length; i++) {
        const gap = sortedByX[i].x - sortedByX[i - 1].right;
        if (gap > 0 && gap < 300) {
          horizontalSpacings.push(Math.round(gap));
        }
      }

      // 垂直間隔の計算
      for (let i = 1; i < sortedByY.length; i++) {
        const gap = sortedByY[i].y - sortedByY[i - 1].bottom;
        if (gap > 0 && gap < 500) {
          verticalSpacings.push(Math.round(gap));
        }
      }

      // 間隔の頻度分析
      const analyzeSpacings = (spacings) => {
        if (spacings.length === 0) return [];

        // 5px単位でグループ化
        const groupedSpacings = {};
        spacings.forEach(space => {
          const roundedSpace = Math.round(space / 5) * 5;
          groupedSpacings[roundedSpace] = (groupedSpacings[roundedSpace] || 0) + 1;
        });

        // 頻度順にソート
        return Object.entries(groupedSpacings)
          .map(([value, count]) => ({
            value: parseInt(value),
            frequency: count / spacings.length
          }))
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 3); // 上位3つのみ返す
      };

      const horizontalPatterns = analyzeSpacings(horizontalSpacings);
      const verticalPatterns = analyzeSpacings(verticalSpacings);

      // パターンの種類を特定
      const patternType =
        horizontalPatterns.length > 0 && verticalPatterns.length > 0 ? 'grid' :
          horizontalPatterns.length > 0 ? 'horizontal' :
            verticalPatterns.length > 0 ? 'vertical' : 'unknown';

      // 結果を返す
      return {
        detected: horizontalPatterns.length > 0 || verticalPatterns.length > 0,
        patternType,
        horizontal: horizontalPatterns,
        vertical: verticalPatterns
      };
    },

    // 配置パターンの分析
    analyzeAlignment(elements) {
      if (!elements || elements.length < 2) {
        return {
          detected: false,
          patterns: []
        };
      }

      // 位置情報のある要素のみをフィルタリング
      const validElements = elements.filter(el => {
        const hasPosition = el.position || (el.x !== undefined && el.y !== undefined);
        return hasPosition;
      });

      if (validElements.length < 2) {
        return {
          detected: false,
          patterns: []
        };
      }

      // 位置情報を標準化
      const normalizedElements = validElements.map(el => {
        const pos = el.position || {};
        return {
          x: pos.x !== undefined ? pos.x : (el.x || 0),
          y: pos.y !== undefined ? pos.y : (el.y || 0),
          width: pos.width !== undefined ? pos.width : (el.width || 0),
          height: pos.height !== undefined ? pos.height : (el.height || 0),
          centerX: (pos.x !== undefined ? pos.x : (el.x || 0)) + (pos.width !== undefined ? pos.width : (el.width || 0)) / 2,
          right: (pos.x !== undefined ? pos.x : (el.x || 0)) + (pos.width !== undefined ? pos.width : (el.width || 0))
        };
      });

      // 左揃えの要素をカウント (x座標が近いものをグループ化)
      const leftAlignedGroups = {};
      normalizedElements.forEach(el => {
        const roundedX = Math.round(el.x / 5) * 5;
        leftAlignedGroups[roundedX] = (leftAlignedGroups[roundedX] || 0) + 1;
      });

      // 中央揃えの要素をカウント
      const centerAlignedGroups = {};
      normalizedElements.forEach(el => {
        const roundedCenterX = Math.round(el.centerX / 5) * 5;
        centerAlignedGroups[roundedCenterX] = (centerAlignedGroups[roundedCenterX] || 0) + 1;
      });

      // 右揃えの要素をカウント
      const rightAlignedGroups = {};
      normalizedElements.forEach(el => {
        const roundedRight = Math.round(el.right / 5) * 5;
        rightAlignedGroups[roundedRight] = (rightAlignedGroups[roundedRight] || 0) + 1;
      });

      // 各揃えの最大頻度を取得
      const getMaxAlignment = (groups) => {
        const entries = Object.entries(groups);
        if (entries.length === 0) return { value: 0, count: 0 };

        const sortedByCount = entries.sort((a, b) => b[1] - a[1]);
        return {
          value: parseInt(sortedByCount[0][0]),
          count: sortedByCount[0][1]
        };
      };

      const maxLeftAlign = getMaxAlignment(leftAlignedGroups);
      const maxCenterAlign = getMaxAlignment(centerAlignedGroups);
      const maxRightAlign = getMaxAlignment(rightAlignedGroups);

      // 配置パターンの結果を作成
      const alignmentPatterns = [];

      if (maxLeftAlign.count >= normalizedElements.length * 0.3) {
        alignmentPatterns.push({ type: 'left', strength: maxLeftAlign.count / normalizedElements.length });
      }

      if (maxCenterAlign.count >= normalizedElements.length * 0.3) {
        alignmentPatterns.push({ type: 'center', strength: maxCenterAlign.count / normalizedElements.length });
      }

      if (maxRightAlign.count >= normalizedElements.length * 0.3) {
        alignmentPatterns.push({ type: 'right', strength: maxRightAlign.count / normalizedElements.length });
      }

      // 結果をstrenthで降順ソート
      alignmentPatterns.sort((a, b) => b.strength - a.strength);

      // 対称性の判定
      const hasSymmetry = maxCenterAlign.count > (maxLeftAlign.count + maxRightAlign.count) * 0.7;

      return {
        detected: alignmentPatterns.length > 0,
        patterns: alignmentPatterns,
        dominantAlignment: alignmentPatterns.length > 0 ? alignmentPatterns[0].type : 'mixed',
        symmetrical: hasSymmetry
      };
    },

    // アスペクト比の計算
    calculateAspectRatios(sections, elements) {
      // セクションがない場合、要素から最大の境界ボックスを計算
      if (!sections || sections.length === 0) {
        if (!elements || elements.length === 0) {
          return {
            detected: false,
            ratios: []
          };
        }

        // 位置情報のある要素のみをフィルタリング
        const validElements = elements.filter(el => {
          const hasPosition = el.position || (el.x !== undefined && el.y !== undefined);
          return hasPosition;
        });

        if (validElements.length === 0) {
          return {
            detected: false,
            ratios: []
          };
        }

        // 要素の境界を計算
        const bounds = {
          minX: Math.min(...validElements.map(el => el.position?.x !== undefined ? el.position.x : (el.x || 0))),
          minY: Math.min(...validElements.map(el => el.position?.y !== undefined ? el.position.y : (el.y || 0))),
          maxX: Math.max(...validElements.map(el => {
            const x = el.position?.x !== undefined ? el.position.x : (el.x || 0);
            const width = el.position?.width !== undefined ? el.position.width : (el.width || 0);
            return x + width;
          })),
          maxY: Math.max(...validElements.map(el => {
            const y = el.position?.y !== undefined ? el.position.y : (el.y || 0);
            const height = el.position?.height !== undefined ? el.position.height : (el.height || 0);
            return y + height;
          }))
        };

        const totalWidth = bounds.maxX - bounds.minX;
        const totalHeight = bounds.maxY - bounds.minY;

        if (totalWidth <= 0 || totalHeight <= 0) {
          return {
            detected: false,
            ratios: []
          };
        }

        const ratio = totalWidth / totalHeight;
        return {
          detected: true,
          ratios: [{
            name: 'content-area',
            ratio: parseFloat(ratio.toFixed(2)),
            width: totalWidth,
            height: totalHeight,
            isCommon: this.isCommonRatio(ratio)
          }]
        };
      }

      // セクションごとのアスペクト比を計算
      const sectionRatios = sections.map(section => {
        const width = section.width || (section.position?.width || 0);
        const height = section.height || (section.position?.height || 0);

        if (width <= 0 || height <= 0) return null;

        const ratio = width / height;
        return {
          name: section.type || 'section',
          ratio: parseFloat(ratio.toFixed(2)),
          width,
          height,
          isCommon: this.isCommonRatio(ratio)
        };
      }).filter(ratio => ratio !== null);

      return {
        detected: sectionRatios.length > 0,
        ratios: sectionRatios
      };
    },

    // 一般的なアスペクト比かどうかを判定
    isCommonRatio(ratio) {
      // 一般的なアスペクト比のリスト
      const commonRatios = [
        { name: '1:1', value: 1 },        // 正方形
        { name: '4:3', value: 4 / 3 },      // 従来のTV
        { name: '16:9', value: 16 / 9 },    // ワイドスクリーン
        { name: '21:9', value: 21 / 9 },    // ウルトラワイド
        { name: '3:2', value: 3 / 2 },      // 写真
        { name: 'golden', value: 1.618 }  // 黄金比
      ];

      // 比率の許容誤差
      const tolerance = 0.1;

      // 最も近い一般的なアスペクト比を見つける
      const closestRatio = commonRatios.find(common =>
        Math.abs(common.value - ratio) < tolerance
      );

      return closestRatio ? closestRatio.name : null;
    },

    // レイアウト推奨事項の生成
    generateLayoutRecommendations(analysis, options = {}) {
      const { responsiveMode = "pc", aiBreakpoints = [] } = options;

      const isMobileFirst = responsiveMode === "sp" || responsiveMode === "both";
      const breakpointName = aiBreakpoints && aiBreakpoints.length > 0 ?
        aiBreakpoints[0].name || 'md' : 'md';

      // グリッドシステムの推奨
      let gridRecommendation = '';
      if (analysis.gridSystem && analysis.gridSystem.detected) {
        const columns = analysis.gridSystem.columns;
        const hGap = analysis.gridSystem.gaps.horizontal;
        const vGap = analysis.gridSystem.gaps.vertical;

        gridRecommendation = isMobileFirst ?
          `.grid-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: ${Math.round(vGap / 2)}px;

  @include mq(${breakpointName}) {
    grid-template-columns: repeat(${columns}, 1fr);
    gap: ${hGap}px ${vGap}px;
  }
}` :
          `.grid-container {
  display: grid;
  grid-template-columns: repeat(${columns}, 1fr);
  gap: ${hGap}px ${vGap}px;

  @include mq(${breakpointName}) {
    grid-template-columns: 1fr;
    gap: ${Math.round(vGap / 2)}px;
  }
}`;
      }

      // 配置パターンの推奨
      let alignmentRecommendation = '';
      if (analysis.alignmentPatterns && analysis.alignmentPatterns.detected) {
        const dominantAlignment = analysis.alignmentPatterns.dominantAlignment;
        const justifyValue =
          dominantAlignment === 'left' ? 'flex-start' :
            dominantAlignment === 'right' ? 'flex-end' : 'center';

        alignmentRecommendation = isMobileFirst ?
          `.aligned-container {
  display: flex;
  flex-direction: column;
  align-items: center;

  @include mq(${breakpointName}) {
    flex-direction: row;
    justify-content: ${justifyValue};
  }
}` :
          `.aligned-container {
  display: flex;
  flex-direction: row;
  justify-content: ${justifyValue};

  @include mq(${breakpointName}) {
    flex-direction: column;
    align-items: center;
  }
}`;
      }

      // 空間利用分析
      let spacingRecommendation = '';
      if (analysis.spacingPatterns && analysis.spacingPatterns.detected) {
        const horizontalSpacing = analysis.spacingPatterns.horizontal && analysis.spacingPatterns.horizontal.length > 0 ?
          analysis.spacingPatterns.horizontal[0].value : 20;
        const verticalSpacing = analysis.spacingPatterns.vertical && analysis.spacingPatterns.vertical.length > 0 ?
          analysis.spacingPatterns.vertical[0].value : 30;

        spacingRecommendation =
          `:root {
  --space-sm: ${Math.round(horizontalSpacing / 2)}px;
  --space-md: ${horizontalSpacing}px;
  --space-lg: ${verticalSpacing}px;
  --space-xl: ${Math.round(verticalSpacing * 1.5)}px;
}

.section {
  margin-bottom: var(--space-lg);
  padding: var(--space-md);

  @include mq(${breakpointName}) {
    margin-bottom: var(--space-xl);
    padding: var(--space-lg);
  }
}`;
      }

      // 総合的なレイアウト戦略
      const layoutStrategy = isMobileFirst ?
        `モバイルファーストアプローチで、縦に積み重ねたレイアウトから始めて、大きな画面では${analysis.gridSystem?.detected ? `${analysis.gridSystem.columns}カラムの` : ''}グリッドレイアウトに拡張します。` :
        `デスクトップファーストアプローチで、${analysis.gridSystem?.detected ? `${analysis.gridSystem.columns}カラムの` : ''}グリッドレイアウトから始めて、小さな画面では縦に積み重ねたレイアウトに縮小します。`;

      return {
        strategy: layoutStrategy,
        examples: {
          grid: gridRecommendation,
          alignment: alignmentRecommendation,
          spacing: spacingRecommendation
        }
      };
    },

    // プロンプト用レイアウトセクションの構築
    buildLayoutSection(analysis, options = {}) {
      if (!analysis || !analysis.hasLayout) {
        return '';
      }

      let section = "\n## レイアウト構造とグリッドシステム\n\n";

      // グリッドシステムの情報
      if (analysis.gridSystem && analysis.gridSystem.detected) {
        section += `### グリッドシステム\n`;
        section += `- **カラム数**: ${analysis.gridSystem.columns}\n`;
        section += `- **水平間隔**: ${analysis.gridSystem.gaps.horizontal}px\n`;
        section += `- **垂直間隔**: ${analysis.gridSystem.gaps.vertical}px\n\n`;
      }

      // 配置パターン
      if (analysis.alignmentPatterns && analysis.alignmentPatterns.detected) {
        section += `### 配置パターン\n`;
        section += `- **主要な配置**: ${analysis.alignmentPatterns.dominantAlignment === 'left' ? '左揃え' : analysis.alignmentPatterns.dominantAlignment === 'right' ? '右揃え' : '中央揃え'}\n`;
        if (analysis.alignmentPatterns.symmetrical) {
          section += `- **対称性**: 対称的なレイアウト\n\n`;
        } else {
          section += `- **対称性**: 非対称的なレイアウト\n\n`;
        }
      }

      // 間隔パターン
      if (analysis.spacingPatterns && analysis.spacingPatterns.detected) {
        section += `### 間隔パターン\n`;
        if (analysis.spacingPatterns.horizontal && analysis.spacingPatterns.horizontal.length > 0) {
          section += `- **水平間隔**: ${analysis.spacingPatterns.horizontal.map(p => `${p.value}px (${Math.round(p.frequency * 100)}%)`).join(', ')}\n`;
        }
        if (analysis.spacingPatterns.vertical && analysis.spacingPatterns.vertical.length > 0) {
          section += `- **垂直間隔**: ${analysis.spacingPatterns.vertical.map(p => `${p.value}px (${Math.round(p.frequency * 100)}%)`).join(', ')}\n`;
        }
        section += '\n';
      }

      // アスペクト比
      if (analysis.aspectRatios && analysis.aspectRatios.detected) {
        section += `### アスペクト比\n`;
        analysis.aspectRatios.ratios.forEach(ratio => {
          section += `- **${ratio.name}**: ${ratio.ratio}${ratio.isCommon ? ` (${ratio.isCommon})` : ''}\n`;
        });
        section += '\n';
      }

      // レイアウト推奨事項
      if (analysis.recommendations) {
        section += `### レイアウト実装ガイド\n`;
        section += `${analysis.recommendations.strategy}\n\n`;

        if (analysis.recommendations.examples.grid) {
          section += `#### グリッドレイアウト\n`;
          section += "```scss\n" + analysis.recommendations.examples.grid + "\n```\n\n";
        }

        if (analysis.recommendations.examples.alignment) {
          section += `#### 配置パターン\n`;
          section += "```scss\n" + analysis.recommendations.examples.alignment + "\n```\n\n";
        }

        if (analysis.recommendations.examples.spacing) {
          section += `#### 間隔の統一\n`;
          section += "```scss\n" + analysis.recommendations.examples.spacing + "\n```\n\n";
        }
      }

      // テキスト分析の追加
      if (pcData.enhancedText || spData.enhancedText) {
        const textData = pcData.enhancedText || spData.enhancedText;

        if (textData.hasText) {
          section += textData.buildTextSection ? textData.buildTextSection(textData, {
            breakpoint: AnalysisModules.breakpoints.getMdValue()
          }) : '\n### Text Analysis\nText analysis data is available but could not be formatted.';
        }
      }

      return section;
    },

    // フォント特性の分析
    analyzeFontProperties(textBlocks) {
      try {
        if (!textBlocks || textBlocks.length === 0) {
          return {
            baseFontSize: 16,
            headingSizes: {},
            bodySizes: {},
            lineHeights: {},
            fontWeights: {},
            fontFamilies: []
          };
        }

        // フォントサイズの収集
        const fontSizes = textBlocks
          .filter(block => typeof block.fontSize === 'number')
          .map(block => block.fontSize);

        const spFontSizes = textBlocks
          .filter(block => typeof block.spFontSize === 'number')
          .map(block => block.spFontSize);

        // フォント重みの収集
        const fontWeights = textBlocks
          .filter(block => typeof block.fontWeight === 'number')
          .map(block => block.fontWeight);

        // フォントファミリーの収集
        const fontFamilies = textBlocks
          .filter(block => block.fontFamily)
          .map(block => block.fontFamily);

        // ヒストグラムの作成（出現頻度）
        const fontSizeHistogram = this.createHistogram(fontSizes);
        const fontWeightHistogram = this.createHistogram(fontWeights);

        // 最も一般的なフォントサイズを基本サイズとして特定
        const baseFontSizeEntry = Object.entries(fontSizeHistogram)
          .filter(([size]) => parseFloat(size) <= 18) // 基本的に18px以下
          .sort((a, b) => b[1] - a[1])[0];

        const baseFontSize = baseFontSizeEntry
          ? parseFloat(baseFontSizeEntry[0])
          : 16;

        // 見出しサイズと本文サイズの分類
        const headingSizes = {};
        const bodySizes = {};

        Object.entries(fontSizeHistogram)
          .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
          .forEach(([size, count], index) => {
            const fontSize = parseFloat(size);
            if (fontSize > baseFontSize * 1.2) {
              // 基本サイズより20%以上大きいものは見出し
              if (index === 0) headingSizes.primary = fontSize;
              else if (index === 1) headingSizes.secondary = fontSize;
              else headingSizes[`level${index + 1}`] = fontSize;
            } else {
              // それ以外は本文サイズ
              if (fontSize === baseFontSize) bodySizes.primary = fontSize;
              else if (fontSize < baseFontSize) bodySizes.small = fontSize;
              else bodySizes.large = fontSize;
            }
          });

        // 行の高さの推定（フォントサイズの1.5倍を標準とする）
        const lineHeights = {
          heading: 1.3,
          body: 1.6
        };

        // 一般的なフォント重みの特定
        let normalWeight = 400;
        let boldWeight = 700;

        if (fontWeightHistogram) {
          const weightEntries = Object.entries(fontWeightHistogram);
          if (weightEntries.length > 0) {
            const sortedWeights = weightEntries
              .map(([weight]) => parseInt(weight))
              .sort((a, b) => a - b);

            if (sortedWeights.length === 1) {
              normalWeight = sortedWeights[0];
              boldWeight = normalWeight + 300;
            } else {
              normalWeight = sortedWeights[0];
              boldWeight = sortedWeights[sortedWeights.length - 1];
            }
          }
        }

        // SPとPCのフォントサイズ比率計算
        let responsiveRatio = 0.75; // デフォルト
        if (spFontSizes.length > 0 && fontSizes.length > 0) {
          const pcAvg = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length;
          const spAvg = spFontSizes.reduce((sum, size) => sum + size, 0) / spFontSizes.length;
          if (pcAvg > 0 && spAvg > 0) {
            responsiveRatio = spAvg / pcAvg;
          }
        }

        return {
          baseFontSize,
          headingSizes,
          bodySizes,
          lineHeights,
          fontWeights: {
            normal: normalWeight,
            bold: boldWeight
          },
          fontFamilies: [...new Set(fontFamilies)],
          responsiveRatio
        };
      } catch (error) {
        console.error('フォント特性分析中にエラーが発生しました:', error);
        return {
          baseFontSize: 16,
          headingSizes: { primary: 32, secondary: 24 },
          bodySizes: { primary: 16, small: 14 },
          lineHeights: { heading: 1.3, body: 1.6 },
          fontWeights: { normal: 400, bold: 700 },
          fontFamilies: [],
          responsiveRatio: 0.75
        };
      }
    },

    // ヒストグラムの作成
    createHistogram(values) {
      const histogram = {};
      values.forEach(value => {
        histogram[value] = (histogram[value] || 0) + 1;
      });
      return histogram;
    },

    // テキスト配置の検出
    detectTextAlignment(textBlocks) {
      try {
        if (!textBlocks || textBlocks.length === 0) {
          return { dominant: 'left', distributions: {} };
        }

        // 位置情報を持つテキストブロックのみを対象
        const blocksWithPosition = textBlocks.filter(block =>
          block.position &&
          typeof block.position.x === 'number' &&
          typeof block.position.width === 'number'
        );

        if (blocksWithPosition.length === 0) {
          return { dominant: 'left', distributions: { left: 1 } };
        }

        // 各テキストブロックの配置を判定
        const alignments = blocksWithPosition.map(block => {
          const { x, width } = block.position;
          const centerX = x + width / 2;

          // 周囲の要素との相対的な位置関係から配置を推定
          if (block.alignment) {
            return block.alignment; // 明示的に指定されている場合
          } else if (block.textAlign) {
            return block.textAlign; // 明示的に指定されている場合
          } else {
            // 画像の中心からの相対位置で判断（単純化）
            const relativePosition = centerX / 1200; // 画像幅を1200pxと仮定

            if (relativePosition < 0.4) return 'left';
            else if (relativePosition > 0.6) return 'right';
            else return 'center';
          }
        });

        // 配置の分布を計算
        const distributions = {};
        alignments.forEach(alignment => {
          distributions[alignment] = (distributions[alignment] || 0) + 1;
        });

        // 正規化
        const total = alignments.length;
        Object.keys(distributions).forEach(key => {
          distributions[key] = distributions[key] / total;
        });

        // 最も多い配置を特定
        let dominant = 'left';
        let maxCount = 0;

        Object.entries(distributions).forEach(([alignment, count]) => {
          if (count > maxCount) {
            dominant = alignment;
            maxCount = count;
          }
        });

        return {
          dominant,
          distributions
        };
      } catch (error) {
        console.error('テキスト配置検出中にエラーが発生しました:', error);
        return { dominant: 'left', distributions: { left: 1 } };
      }
    },

    // FLOCSSに準拠したタイポグラフィSCSSを構築
    buildFLOCSSOptimizedTypography(analysis) {
      try {
        // ブレークポイント値を取得
        const mdBreakpoint = analysis.breakpoint || AnalysisModules.breakpoints.defaults.md;
        const responsiveMode = analysis.responsiveMode || 'pc';

        // 直接数値を使用する
        const baseFontSize = analysis.baseFontSize || 16;
        const headingPrimary = analysis.headingSizes?.primary || 32;
        const headingSecondary = analysis.headingSizes?.secondary || 24;
        const textBody = analysis.bodySizes?.primary || 16;
        const textSmall = analysis.bodySizes?.small || 14;

        // SCSSコード生成開始（変数定義なし）
        let scss = `// Project: セクション固有のスタイル\n`;

        // 各セクションのタイポグラフィを構築
        if (analysis.sections && analysis.sections.length > 0) {
          analysis.sections.forEach(section => {
            const sectionName = section.sectionName || 'section';

            // セクション見出し
            scss += `.p-${sectionName}__title {\n`;

            if (responsiveMode === 'sp') {
              // スマホファースト
              scss += `  font-size: ${textBody}px;\n`;
              scss += `  font-weight: ${section.headingWeight || 700};\n`;
              scss += `  line-height: ${section.headingLineHeight || 1.4};\n`;
              scss += `  margin-top: 20px;\n`;
              scss += `\n`;
              scss += `  @include mq(md) {\n`;
              scss += `    font-size: ${headingPrimary}px;\n`;
              scss += `  }\n`;
            } else {
              // PCファースト
              scss += `  font-size: ${headingPrimary}px;\n`;
              scss += `  font-weight: ${section.headingWeight || 700};\n`;
              scss += `  line-height: ${section.headingLineHeight || 1.4};\n`;
              scss += `  margin-top: 20px;\n`;
              scss += `\n`;
              scss += `  @include mq(md) {\n`;
              scss += `    font-size: ${textBody}px;\n`;
              scss += `  }\n`;
            }

            scss += `}\n\n`;

            // サブ見出し
            scss += `.p-${sectionName}__subtitle {\n`;

            if (responsiveMode === 'sp') {
              // スマホファースト
              scss += `  font-size: ${textSmall}px;\n`;
              scss += `  font-weight: ${section.headingWeight - 100 || 600};\n`;
              scss += `  line-height: ${section.headingLineHeight || 1.4};\n`;
              scss += `  margin-top: 15px;\n`;
              scss += `\n`;
              scss += `  @include mq(md) {\n`;
              scss += `    font-size: ${headingSecondary}px;\n`;
              scss += `  }\n`;
            } else {
              // PCファースト
              scss += `  font-size: ${headingSecondary}px;\n`;
              scss += `  font-weight: ${section.headingWeight - 100 || 600};\n`;
              scss += `  line-height: ${section.headingLineHeight || 1.4};\n`;
              scss += `  margin-top: 15px;\n`;
              scss += `\n`;
              scss += `  @include mq(md) {\n`;
              scss += `    font-size: ${textSmall}px;\n`;
              scss += `  }\n`;
            }

            scss += `}\n\n`;

            // テキスト
            scss += `.p-${sectionName}__text {\n`;

            if (responsiveMode === 'sp') {
              // スマホファースト
              scss += `  font-size: ${textSmall}px;\n`;
              scss += `  line-height: ${section.textLineHeight || 1.6};\n`;
              scss += `\n`;
              scss += `  @include mq(md) {\n`;
              scss += `    font-size: ${textBody}px;\n`;
              scss += `  }\n`;
            } else {
              // PCファースト
              scss += `  font-size: ${textBody}px;\n`;
              scss += `  line-height: ${section.textLineHeight || 1.6};\n`;
              scss += `\n`;
              scss += `  @include mq(md) {\n`;
              scss += `    font-size: ${textSmall}px;\n`;
              scss += `  }\n`;
            }

            scss += `}\n\n`;

            // 説明テキスト
            scss += `.p-${sectionName}__description {\n`;

            if (responsiveMode === 'sp') {
              // スマホファースト
              scss += `  font-size: ${textSmall}px;\n`;
              scss += `  line-height: ${section.textLineHeight || 1.6};\n`;
              scss += `  margin-top: 30px;\n`;
              scss += `\n`;
              scss += `  @include mq(md) {\n`;
              scss += `    font-size: ${textBody}px;\n`;
              scss += `  }\n`;
            } else {
              // PCファースト
              scss += `  font-size: ${textBody}px;\n`;
              scss += `  line-height: ${section.textLineHeight || 1.6};\n`;
              scss += `  margin-top: 30px;\n`;
              scss += `\n`;
              scss += `  @include mq(md) {\n`;
              scss += `    font-size: ${textSmall}px;\n`;
              scss += `  }\n`;
            }

            scss += `}\n\n`;
          });
        } else {
          // デフォルトのセクションスタイル
          scss += `.p-section__title {\n`;

          if (responsiveMode === 'sp') {
            // スマホファースト
            scss += `  font-size: ${textBody}px;\n`;
            scss += `  font-weight: 700;\n`;
            scss += `  line-height: 1.4;\n`;
            scss += `  margin-top: 20px;\n`;
            scss += `\n`;
            scss += `  @include mq(md) {\n`;
            scss += `    font-size: ${headingPrimary}px;\n`;
            scss += `  }\n`;
          } else {
            // PCファースト
            scss += `  font-size: ${headingPrimary}px;\n`;
            scss += `  font-weight: 700;\n`;
            scss += `  line-height: 1.4;\n`;
            scss += `  margin-top: 20px;\n`;
            scss += `\n`;
            scss += `  @include mq(md) {\n`;
            scss += `    font-size: ${textBody}px;\n`;
            scss += `  }\n`;
          }

          scss += `}\n\n`;

          scss += `.p-section__text {\n`;

          if (responsiveMode === 'sp') {
            // スマホファースト
            scss += `  font-size: ${textSmall}px;\n`;
            scss += `  line-height: 1.6;\n`;
            scss += `  margin-top: 15px;\n`;
            scss += `\n`;
            scss += `  @include mq(md) {\n`;
            scss += `    font-size: ${textBody}px;\n`;
            scss += `  }\n`;
          } else {
            // PCファースト
            scss += `  font-size: ${textBody}px;\n`;
            scss += `  line-height: 1.6;\n`;
            scss += `  margin-top: 15px;\n`;
            scss += `\n`;
            scss += `  @include mq(md) {\n`;
            scss += `    font-size: ${textSmall}px;\n`;
            scss += `  }\n`;
          }

          scss += `}\n`;
        }

        return scss;
      } catch (error) {
        console.error('SCSS生成中にエラーが発生しました:', error);
        return `// エラーが発生しました - デフォルト値を使用
.p-section__title {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.4;
  margin-top: 20px;

  @include mq(md) {
    font-size: 16px;
  }
}

.p-section__text {
  font-size: 16px;
  line-height: 1.6;
  margin-top: 15px;

  @include mq(md) {
    font-size: 14px;
  }
}`;
      }
    },

    // レスポンシブタイポグラフィの推奨事項を生成
    generateResponsiveTypography(analysis, options = {}) {
      try {
        const { fontProperties, hierarchy } = analysis;
        const mode = AnalysisModules.breakpoints.getResponsiveMode(options);

        // ベースフォントサイズの設定
        const baseFontSize = fontProperties.baseFontSize || 16;

        // 見出しと本文のサイズ
        const headingSizes = fontProperties.headingSizes || {
          primary: 32,
          secondary: 24
        };

        const bodySizes = fontProperties.bodySizes || {
          primary: 16,
          small: 14
        };

        // SPでのサイズ比率
        const responsiveRatio = fontProperties.responsiveRatio || 0.75;

        // フォントサイズの変数定義
        const fontVariables = [];

        fontVariables.push(`$font-base-size: ${baseFontSize}px;`);

        Object.entries(headingSizes).forEach(([key, size]) => {
          fontVariables.push(`$font-heading-${key}: ${size}px;`);
        });

        Object.entries(bodySizes).forEach(([key, size]) => {
          fontVariables.push(`$font-text-${key}: ${size}px;`);
        });

        // ブレークポイント値を取得（優先順位: オプション > デフォルト）
        const breakpoint = AnalysisModules.breakpoints.getMdValue(options);
        fontVariables.push(`$breakpoint-md: ${breakpoint}px;`);

        // セクションごとのスタイルサンプル
        const sections = [];
        const sectionNames = [...new Set(
          Object.values(analysis.semanticRoles || {})
            .map(info => info.section)
            .filter(Boolean)
        )];

        sectionNames.forEach(sectionName => {
          sections.push({
            sectionName,
            headingSizes: headingSizes,
            bodySizes: bodySizes,
            headingWeight: fontProperties.fontWeights?.bold || 700,
            textLineHeight: fontProperties.lineHeights?.body || 1.6,
            headingLineHeight: fontProperties.lineHeights?.heading || 1.4
          });
        });

        // SCSSサンプルの生成
        const scssSample = this.buildFLOCSSOptimizedTypography({
          sections,
          baseFontSize,
          headingSizes,
          bodySizes,
          responsiveRatio,
          breakpoint,
          responsiveMode: mode
        });

        return {
          fontVariables,
          scssSample,
          responsiveStrategy: {
            mode,
            spRatio: responsiveRatio,
            breakpoint
          }
        };
      } catch (error) {
        console.error('レスポンシブタイポグラフィ生成中にエラーが発生しました:', error);
        return {
          fontVariables: [
            '$font-base-size: 16px;',
            '$font-heading-primary: 32px;',
            '$font-heading-secondary: 24px;',
            '$font-text-primary: 16px;',
            '$font-text-small: 14px;',
            `$breakpoint-md: ${AnalysisModules.breakpoints.defaults.md}px;`
          ],
          scssSample: '',
          responsiveStrategy: {
            mode: 'both',
            spRatio: 0.75,
            breakpoint: AnalysisModules.breakpoints.defaults.md
          }
        };
      }
    }
  }
};

AnalysisModules.layout.enhancedBuildLayoutSection = function (analysis, options = {}) {
  if (!analysis || !analysis.hasLayout) return '';

  let section = `### Layout Analysis\n`;

  if (analysis.aspectRatios?.detected) {
    section += `- **Content Structure**: ${analysis.aspectRatios.ratios.length} sections\n`;
    analysis.aspectRatios.ratios.slice(0, 3).forEach((r, i) => {
      section += `  - Section ${i + 1}: ${r.width}x${r.height}px (ratio ${r.ratio})\n`;
    });
  }

  if (analysis.gridSystem?.detected) {
    section += `- **Grid System**: ${analysis.gridSystem.columns} columns\n`;
    section += `- **Grid Gaps**: Horizontal ${analysis.gridSystem.gaps.horizontal}px, Vertical ${analysis.gridSystem.gaps.vertical}px\n`;
  }

  if (analysis.spacingPatterns?.detected) {
    section += `- **Spacing Pattern**: ${analysis.spacingPatterns.patternType}\n`;
    section += `  - Vertical: ${analysis.spacingPatterns.vertical.map(v => `${v.value}px`).join(', ')}\n`;
  }

  if (analysis.alignmentPatterns?.detected) {
    section += `- **Alignment**: ${analysis.alignmentPatterns.dominantAlignment || 'N/A'}\n`;
  }

  if (analysis.recommendations?.examples?.grid) {
    section += `\n**Example Grid Layout:**\n\`\`\`scss\n${analysis.recommendations.examples.grid}\n\`\`\`\n`;
  }

  return section;
};


// 共通のエラーハンドリング関数
const handleAnalysisError = (operation, error, defaultValue) => {
  // エラーメッセージをより明確に表示するが、関数のシグネチャと動作は同じ
  console.error(`${operation}エラー:`, error.message || error);
  return defaultValue;
};

// プロパティの安全なアクセスのためのヘルパー関数
const safeGetProperty = (obj, path, defaultValue = null) => {
  if (!obj) return defaultValue;
  return path.split('.').reduce((prev, curr) =>
    prev && prev[curr] !== undefined ? prev[curr] : defaultValue, obj);
};

// データ構造を検証し、ログ出力するヘルパー関数
const validateAndLogData = (data, type) => {
  if (!data) {
    console.warn(`${type}データが存在しません`);
    return false;
  }

  console.log(`${type}データ構造:`, typeof data === 'object' ?
    Object.keys(data).join(', ') : typeof data);
  return true;
};

// アクティブプロジェクトから設定を取得する関数（非同期）
const getSettingsFromActiveProject = async () => {
  try {
    console.log('プロジェクト設定の取得を開始します...');

    // アクティブプロジェクトIDの取得
    if (!window.api || !window.api.loadActiveProjectId) {
      console.warn('window.api.loadActiveProjectIdが利用できません。デフォルト設定を使用します。');
      return {
        resetCSS: '',
        variableSettings: '',
        responsiveSettings: ''
      };
    }

    const projectId = await window.api.loadActiveProjectId();
    if (!projectId) {
      console.warn('アクティブプロジェクトが設定されていません。デフォルト設定を使用します。');
      return {
        resetCSS: '',
        variableSettings: '',
        responsiveSettings: ''
      };
    }

    console.log(`アクティブプロジェクトID: ${projectId} の設定を読み込みます`);

    // 各設定の取得（並列処理）
    const [resetCSSResult, variableSettingsResult, responsiveSettingsResult] = await Promise.all([
      window.api.loadProjectData(projectId, 'resetCSS'),
      window.api.loadProjectData(projectId, 'variableSettings'),
      window.api.loadProjectData(projectId, 'responsiveSettings')
    ]);

    // 結果のサニタイズと処理
    const resetCSS = resetCSSResult?.data || '';
    const variableSettings = variableSettingsResult?.data || '';
    const responsiveSettings = responsiveSettingsResult?.data || '';

    console.log('プロジェクト設定の取得が完了しました');

    return {
      resetCSS,
      variableSettings: generatevariableSettingsFromSettings(variableSettings),
      responsiveSettings
    };
  } catch (error) {
    // エラー処理
    console.error('プロジェクト設定の取得エラー:', error.message || error);
    return {
      resetCSS: '',
      variableSettings: '',
      responsiveSettings: ''
    };
  }
};

// variableSettings形式からCSS変数文字列に変換する関数※消して良いかも？
const generatevariableSettingsFromSettings = (settings) => {
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
};

// CSS変数からHEX値を抽出する関数※消して良いかも？
// const extractHexValuesFromVariables = (cssVars) => {
//   const hexValues = [];
//   const varRegex = /\$([\w-]+):\s*([^;]+);/g;
//   let match;

//   while ((match = varRegex.exec(cssVars)) !== null) {
//     const [_, varName, varValue] = match;
//     const value = varValue.trim();

//     // HEX値のみを抽出
//     if (value.startsWith('#')) {
//       hexValues.push(value);
//     }
//   }

//   return hexValues;
// };



// 画像解析を実行して結果を取得する関数（Python APIを使用）
const analyzeImage = async (imageBase64, imageType, setState = {}) => {
  const {
    setColorData = () => { },
    setTextData = () => { },
    setSections = () => { },
    setLayout = () => { },
    setElements = () => { }
  } = setState;

  if (!imageBase64) {
    console.warn(`${imageType}画像データが存在しません。空の結果を返します。`);
    return {
      colors: [],
      text: '',
      textBlocks: [],
      sections: [],
      elements: { elements: [] },
      compressedAnalysis: null
    };
  }

  console.log(`${imageType}画像の解析を開始します...`);

  // ❶ メイン解析（analyzeAll）
  let analysisResult;
  try {
    console.log('🔍 画像解析を開始...');
    const rawResult = await window.api.analyzeAll(imageBase64);
    console.log('🐛 result内容:', rawResult);

    // 修正: rawResultを直接resに代入
    const res = rawResult;
    console.log('🐛 抽出されたres:', res);

    if (!res || res.success === false || res.error) {
      console.warn(`${imageType}画像の解析に失敗:`, res.error || '未知のエラー');
      analysisResult = {
        colors: [],
        text: '',
        textBlocks: [],
        sections: [],
        layout: {},
        elements: [],
        compressedAnalysis: null
      };
    } else {
      analysisResult = {
        colors: res.colors || [],
        text: res.text || '',
        textBlocks: res.textBlocks || [],
        sections: res.sections || [],
        layout: res.layout || {},
        elements: res.elements || [],
        compressedAnalysis: res.compressed || null
      };
    }
  } catch (error) {
    console.error(`${imageType}画像の解析でエラーが発生しました:`, error);
    analysisResult = {
      colors: [],
      text: '',
      textBlocks: [],
      sections: [],
      layout: {},
      elements: [],
      compressedAnalysis: null
    };
  }

  const {
    colors,
    text,
    textBlocks,
    sections,
    layout,
    elements,
    compressedAnalysis
  } = analysisResult;

  // ステート反映（必要なら）
  if (setColorData) setColorData(colors);
  if (setTextData) setTextData({ text, textBlocks });
  if (setSections) setSections(sections);
  if (setLayout) setLayout(layout);
  if (setElements) setElements(elements);

  // ✅ 最終返却
  return {
    colors: Array.isArray(colors) ? colors : [],
    text: typeof text === 'string' ? text : '',
    textBlocks: Array.isArray(textBlocks) ? textBlocks : [],
    sections: Array.isArray(sections) ? sections : [],
    elements: { elements: Array.isArray(elements) ? elements : [] },
    compressedAnalysis: compressedAnalysis || null
  };
};

// analyze_all を送信する関数（タイムアウト付き）※消して良いかも？
// const analyzeAll = async (params) => {
//   try {
//     const rawResponse = await Promise.race([
//       window.api.invoke('analyze_all', params),
//       new Promise((_, reject) => setTimeout(() => reject(new Error('タイムアウト')), 120000)),
//     ]);

//     // ネストされている場合も吸収
//     const result = rawResponse?.result || rawResponse;

//     console.log('✅ Pythonのレスポンス:', result);
//     console.log('✅ JSON形式（全体）:', JSON.stringify(result, null, 2));

//     if (!result || result.success === false || result.error) {
//       console.warn('⚠️ Pythonの解析に失敗:', result?.error || '不明なエラー');
//       return { success: false, error: result?.error || '不明なエラー' };
//     }

//     return {
//       success: true,
//       ...result
//     };

//   } catch (error) {
//     console.error('❌ タイムアウト or Python解析エラー:', error.message);
//     return { success: false, error: error.message };
//   }
// };







/**
 * 解析データからセマンティックHTMLタグの提案を生成
 * @param {Object} data - 正規化された分析データ
 * @returns {string} セマンティックタグのリスト//消して良いかも？追加したほうが良いかも？
 */
const generateSemanticTags = (data) => {
  if (!data) {
    console.warn('セマンティックタグ生成: データがありません');
    return '<header>\n  <h1>タイトル</h1>\n</header>\n<main>\n  <section>\n    <h2>セクション</h2>\n  </section>\n</main>';
  }

  try {
    console.log('セマンティックタグ生成: データ構造確認', typeof data === 'object' ? Object.keys(data).join(', ') : typeof data);

    // レイアウト情報の取得
    const layout = safeGetProperty(data, 'layout', {});
    const layoutType = safeGetProperty(layout, 'type', 'standard');
    console.log('セマンティックタグ生成: レイアウトタイプ', layoutType);

    // セクション情報の取得
    const sections = safeGetProperty(data, 'sections', []);
    // テキスト情報の取得
    const textData = safeGetProperty(data, 'text', {});
    const textBlocks = safeGetProperty(textData, 'blocks', []);
    const textHierarchy = safeGetProperty(textData, 'hierarchy', []);

    // 要素情報の取得
    const elements = safeGetProperty(data, 'elements.elements', []);

    let htmlStructure = '';

    // ヘッダー部分を生成
    htmlStructure += '<header class="header">\n';
    htmlStructure += '  <div class="header__inner">\n';
    htmlStructure += '    <h1 class="header__logo">Logo</h1>\n';

    // ナビゲーションがあれば追加
    const hasNav = elements.some(el => el.type === 'navigation' || el.type === 'nav');
    if (hasNav) {
      htmlStructure += '    <nav class="header__nav">\n';
      htmlStructure += '      <ul class="nav-list">\n';
      htmlStructure += '        <li class="nav-list__item"><a href="#">リンク1</a></li>\n';
      htmlStructure += '        <li class="nav-list__item"><a href="#">リンク2</a></li>\n';
      htmlStructure += '      </ul>\n';
      htmlStructure += '    </nav>\n';
    }

    htmlStructure += '  </div>\n';
    htmlStructure += '</header>\n\n';

    // メイン部分を生成
    htmlStructure += '<main class="main">\n';

    // セクションがあれば追加
    if (Array.isArray(sections) && sections.length > 0) {
      sections.forEach((section, index) => {
        const sectionType = safeGetProperty(section, 'type', 'content');
        const sectionClass = sectionType === 'hero' ? 'mv' : sectionType.replace('-', '_');

        htmlStructure += `  <section class="${sectionClass}">\n`;
        htmlStructure += `    <div class="${sectionClass}__inner">\n`;

        // セクションのヘッダー
        const headingLevel = index === 0 ? 'h2' : 'h2';
        htmlStructure += `      <${headingLevel} class="${sectionClass}__title">Section Title</${headingLevel}>\n`;

        // セクションの内容
        if (sectionType === 'card-grid' || sectionType === 'features') {
          htmlStructure += `      <div class="${sectionClass}__items">\n`;
          for (let i = 0; i < 3; i++) {
            htmlStructure += `        <div class="${sectionClass}__item">\n`;
            htmlStructure += `          <h3 class="${sectionClass}__item-title">Item Title</h3>\n`;
            htmlStructure += `          <p class="${sectionClass}__item-text">テキストが入ります</p>\n`;
            htmlStructure += '        </div>\n';
          }
          htmlStructure += '      </div>\n';
        } else {
          htmlStructure += `      <div class="${sectionClass}__content">\n`;
          htmlStructure += '        <p>コンテンツテキストが入ります</p>\n';
          htmlStructure += '      </div>\n';
        }

        htmlStructure += '    </div>\n';
        htmlStructure += '  </section>\n\n';
      });
    } else {
      // セクションがない場合のデフォルト
      htmlStructure += '  <section class="section">\n';
      htmlStructure += '    <div class="section__inner">\n';
      htmlStructure += '      <h2 class="section__title">Section Title</h2>\n';
      htmlStructure += '      <div class="section__content">\n';
      htmlStructure += '        <p>テキストが入ります</p>\n';
      htmlStructure += '      </div>\n';
      htmlStructure += '    </div>\n';
      htmlStructure += '  </section>\n\n';
    }

    htmlStructure += '</main>\n\n';

    // フッター部分を生成
    htmlStructure += '<footer class="footer">\n';
    htmlStructure += '  <div class="footer__inner">\n';
    htmlStructure += '    <p class="footer__copyright">© 2023 Company Name</p>\n';
    htmlStructure += '  </div>\n';
    htmlStructure += '</footer>';

    return htmlStructure;
  } catch (error) {
    console.error('セマンティックタグ生成エラー:', error);
    return '<header>\n  <h1>エラー発生</h1>\n</header>\n<main>\n  <section>\n    <h2>データ処理中にエラーが発生しました</h2>\n  </section>\n</main>';
  }
};



// フォールバックプロンプトの構築（エラー時や拡張プロンプト生成失敗時に使用）
const buildFallbackPrompt = (pcData, spData, settings, responsiveMode, aiBreakpoints) => {
  console.log("Starting fallback prompt generation");

  // Basic prompt
  let prompt = `
# Website Design Implementation Task

## Analysis Results
`;

  // 1. Basic analysis results
  prompt += buildAnalysisSection(pcData, spData);

  // 2. Configuration information
  prompt += buildSettingsSection(settings, pcData.colors, spData.colors);

  // 3. Layout analysis with correct parameters
  // 3. レイアウト分析（パラメータを正しく設定）
  const layoutData = pcData.enhancedLayout || spData.enhancedLayout || {};
  const mdBreakpoint = AnalysisModules.breakpoints.getMdValue({ aiBreakpoints });

  // layoutDataのデバッグログ
  console.log("Layout data structure:", Object.keys(layoutData));
  console.log("Layout data hasLayout:", layoutData.hasLayout);
  console.log("Layout data gridSystem:", layoutData.gridSystem ? "exists" : "missing");
  console.log("Layout data recommendations:", layoutData.recommendations ? "exists" : "missing");

  // 必要なプロパティが存在しない場合は最小限のプロパティを追加
  if (!layoutData.hasLayout && !layoutData.gridSystem && !layoutData.recommendations) {
    console.log("Adding minimum required layout properties");
    layoutData.hasLayout = true;
    layoutData.gridSystem = {
      detected: true,
      columns: 12,
      gaps: { horizontal: 20, vertical: 30 }
    };
    layoutData.recommendations = {
      strategy: `${responsiveMode === 'sp' ? 'モバイルファースト' : 'デスクトップファースト'}アプローチでレスポンシブグリッドシステムを使用します。`,
      examples: {
        grid: `.grid {\n  display: grid;\n  grid-template-columns: repeat(12, 1fr);\n  gap: 20px;\n}`,
        alignment: "",
        spacing: ""
      }
    };
  }

  prompt += AnalysisModules.layout.buildLayoutSection(layoutData, {
    responsiveMode: responsiveMode,
    breakpoint: mdBreakpoint
  });

  // 4. ガイドライン
  prompt += buildGuidelinesSection(responsiveMode, { aiBreakpoints });

  // 5. レスポンシブ戦略
  if (!prompt.includes("Responsive")) {
    prompt += `
## レスポンシブ設計
- ブレークポイント: ${mdBreakpoint}px
- アプローチ: ${responsiveMode === 'sp' ? 'モバイルファースト' : responsiveMode === 'pc' ? 'デスクトップファースト' : '両方対応'}
${responsiveMode === 'sp'
        ? '- For mobile-first: Use @include mq(md) { ... } to write desktop styles'
        : '- For desktop-first: Use @include mq(md) { ... } to write mobile styles'}
`;
  }

  // 6. Output format
  if (!prompt.includes("Output Format")) {
    prompt += `
## Output Format
- Provide HTML first, then SCSS
- Format and organize both codes properly
- Include comments for main sections
`;
  }

  // 7. Final instructions
  prompt += buildFinalInstructionsSection();

  return prompt;
};

/**
 * rawDataに基づいてより良いプロンプトを構築する
 * @param {Object} rawData - 画像解析から返される生データ
 * @returns {string|null} 構築されたプロンプト、または処理できなかった場合はnull
 */
const buildBetterPrompt = (rawData) => {
  try {
    console.log("Starting enhanced prompt construction:", typeof rawData);
    if (!rawData) {
      console.warn("buildBetterPrompt: No data provided");
      return null;
    }

    const analysisResults = {};

    // Color analysis
    if (rawData.enhancedColors) {
      analysisResults.colors = rawData.enhancedColors;
    } else if (rawData.colors && Array.isArray(rawData.colors)) {
      analysisResults.colors = AnalysisModules.color.analyzeColors(rawData.colors);
    }

    // Layout analysis (normalized)
    if (rawData.enhancedLayout) {
      analysisResults.layout = rawData.enhancedLayout;
    } else if (rawData.sections || rawData.elements) {
      analysisResults.layout = AnalysisModules.layout.normalizeLayoutData(rawData, {
        responsiveMode: rawData.responsiveMode || 'pc',
        aiBreakpoints: rawData.aiBreakpoints || []
      });
    }

    // Text analysis
    if (rawData.enhancedText) {
      analysisResults.text = rawData.enhancedText;
    } else if (rawData.textBlocks && Array.isArray(rawData.textBlocks)) {
      analysisResults.text = AnalysisModules.text.analyzeText(rawData, {
        responsiveMode: rawData.responsiveMode || 'pc',
        breakpoint: AnalysisModules.breakpoints.getMdValue({
          aiBreakpoints: rawData.aiBreakpoints || []
        })
      });
    }

    // Build color section
    let colorSection = "No color information available.";
    if (analysisResults.colors) {
      const colorData = analysisResults.colors;
      colorSection = `
The design uses a color scheme based on ${colorData.palette ? colorData.palette.length : 0} colors:
${colorData.primary ? `- Primary: ${colorData.primary.hex}` : ''}
${colorData.secondary ? `- Secondary: ${colorData.secondary.hex}` : ''}
${colorData.accent ? `- Accent: ${colorData.accent.hex}` : ''}

${colorData.palette && colorData.palette.length > 0
          ? `Full palette: ${colorData.palette.map(c => c.hex).join(', ')}`
          : ''}`;
    }

    // Build layout section (enhanced)
    let layoutSection = "No layout information available.";
    if (analysisResults.layout && analysisResults.layout.hasLayout) {
      const layout = analysisResults.layout;

      layoutSection = `### Layout Analysis\n`;

      if (layout.gridSystem?.detected) {
        layoutSection += `- **Grid**: ${layout.gridSystem.columns} columns\n`;
        layoutSection += `- **Gaps**: H ${layout.gridSystem.gaps.horizontal}px / V ${layout.gridSystem.gaps.vertical}px\n`;
      }

      if (layout.spacingPatterns?.detected && layout.spacingPatterns.vertical?.length) {
        layoutSection += `- **Vertical Spacing**: ${layout.spacingPatterns.vertical.map(p => `${p.value}px`).join(', ')}\n`;
      }

      if (layout.alignmentPatterns?.detected) {
        layoutSection += `- **Alignment**: ${layout.alignmentPatterns.dominantAlignment}\n`;
      }

      if (layout.aspectRatios?.detected) {
        layoutSection += `- **Aspect Ratios**: ${layout.aspectRatios.ratios.length} sections detected\n`;
        layout.aspectRatios.ratios.slice(0, 3).forEach((r, i) => {
          layoutSection += `  - Section ${i + 1}: ${r.width}x${r.height} (${r.ratio}:1)\n`;
        });
      }

      if (layout.recommendations?.examples?.grid) {
        layoutSection += `\n**Grid SCSS Example:**\n\`\`\`scss\n${layout.recommendations.examples.grid}\n\`\`\``;
      }
    }

    // Build text section
    let textSection = "No typography information available.";
    if (analysisResults.text && analysisResults.text.hasText) {
      if (analysisResults.text.buildTextSection) {
        textSection = analysisResults.text.buildTextSection(analysisResults.text, {
          breakpoint: AnalysisModules.breakpoints.getMdValue({
            aiBreakpoints: rawData.aiBreakpoints || []
          })
        });
      } else {
        const textData = analysisResults.text;
        textSection = `
### Typography Analysis
- Base font size: ${textData.fontProperties?.baseFontSize || 16}px
- Heading sizes: ${textData.fontProperties?.headingSizes?.primary || 32}px / ${textData.fontProperties?.headingSizes?.secondary || 24}px
- Body text: ${textData.fontProperties?.bodySizes?.primary || 16}px`;
      }
    }

    // Build responsive section
    const responsiveMode = rawData.responsiveMode || 'pc';
    const mdBreakpoint = AnalysisModules.breakpoints.getMdValue({
      aiBreakpoints: rawData.aiBreakpoints || []
    });

    const responsiveSection = `
### Responsive Strategy
- Approach: ${responsiveMode === 'sp' ? 'Mobile-first' : responsiveMode === 'pc' ? 'Desktop-first' : 'Both mobile and desktop'}
- Breakpoint: ${mdBreakpoint}px
- Media Query Usage:
  ${responsiveMode === 'sp'
        ? '- Use `@include mq(md)` for desktop styles'
        : '- Use `@include mq(md)` for mobile styles'}`;

    // Final prompt
    const prompt = `# Website Design Implementation Task

## Overview
Analyze the design and implement clean, responsive HTML and SCSS.

## Design Analysis Results

### Color Analysis
${colorSection}

${layoutSection}

${textSection}

${responsiveSection}

## Implementation Guidelines
${buildGuidelinesSection(responsiveMode, { aiBreakpoints: rawData.aiBreakpoints || [] })}

## Output Format
- Provide HTML first, then SCSS.
- Format and organize both codes properly.
- Include comments for main sections.

${buildFinalInstructionsSection()}`;

    console.log("Enhanced prompt construction completed: character count=" + prompt.length);
    return prompt;
  } catch (error) {
    console.error("Enhanced prompt construction error:", error);
    return null;
  }
};


// AIコーディングアプリの初期設定に追加（Claudeからの提案を追加）
function setupEnhancedLayoutAnalysis() {
  // レイアウト解析拡張機能を有効化
  console.log("Enhanced layout analysis initialized");

  // buildAnalysisSection関数をパッチする（元の関数を拡張）
  const originalBuildAnalysisSection = buildAnalysisSection;

  // 置き換え関数
  buildAnalysisSection = function (pcData, spData) {
    try {
      // 元のデータで必要な処理を実行
      let result = originalBuildAnalysisSection(pcData, spData);

      // データの標準化と拡張解析を行う
      if (pcData.sections || spData.sections) {
        const rawData = pcData.sections ? pcData : spData;
        const normalizedData = AnalysisModules.layout.normalizeLayoutData(rawData);

        // 古いレイアウト解析セクションを検出して置換
        const layoutSectionRegex = /#### Layout Analysis\n[^#]*/;
        const enhancedSection = AnalysisModules.layout.enhancedBuildLayoutSection(normalizedData, {
          responsiveMode: pcData.responsiveMode || spData.responsiveMode || "pc",
          aiBreakpoints: pcData.aiBreakpoints || spData.aiBreakpoints || []
        });

        if (enhancedSection && result.match(layoutSectionRegex)) {
          // 古いセクションを新しいセクションに置き換え
          result = result.replace(layoutSectionRegex, "#### Layout Analysis\n" + enhancedSection);
        } else if (enhancedSection) {
          // レイアウトセクションが存在しない場合は追加
          result += enhancedSection;
        }
      }

      return result;
    } catch (error) {
      console.error("Enhanced layout analysis error:", error);
      // エラー時は元の関数を実行
      return originalBuildAnalysisSection(pcData, spData);
    }
  };

  console.log("Enhanced layout analysis ready");
}

// アプリ起動時に実行
setupEnhancedLayoutAnalysis();

/**
 * 基本的な分析セクションを構築する
 * @param {Object} pcData - PC画像の分析データ
 * @param {Object} spData - SP画像の分析データ
 * @returns {string} 分析セクションの文字列
 */
// buildAnalysisSection関数の修正
function buildAnalysisSection(pcData, spData) {
  let section = `\n### Analysis Results\n`;

  // カラー分析セクション（既存のコード）
  if (pcData.enhancedColors || spData.enhancedColors) {
    const colorData = pcData.enhancedColors || spData.enhancedColors;
    section += `\n#### Color Analysis\n`;
    // 色の情報出力（既存のコード）
  }

  // レイアウト分析セクション（修正部分）
  if (pcData.enhancedLayout || spData.enhancedLayout || pcData.elements || spData.elements || pcData.sections || spData.sections) {
    section += `\n#### Layout Analysis\n`;

    // データの準備
    let layoutData;

    // 拡張レイアウトデータがある場合はそれを使用
    if (pcData.enhancedLayout || spData.enhancedLayout) {
      layoutData = pcData.enhancedLayout || spData.enhancedLayout;
    }
    // それ以外の場合は生データから正規化
    else {
      const rawData = pcData.sections ? pcData : (spData.sections ? spData : null);
      if (rawData) {
        // AnalysisModules.layout モジュールを使って正規化
        layoutData = AnalysisModules.layout.normalizeLayoutData(rawData);
      }
    }

    // レイアウトデータが存在する場合の処理
    if (layoutData && layoutData.hasLayout) {
      // レイアウト戦略（常に表示）
      if (layoutData.recommendations && layoutData.recommendations.strategy) {
        section += `- **Layout Strategy**: ${layoutData.recommendations.strategy}\n`;
      }

      // アスペクト比の情報（常に表示）
      if (layoutData.aspectRatios && layoutData.aspectRatios.detected) {
        section += `- **Content Structure**: ${layoutData.aspectRatios.ratios.length} sections detected\n`;

        // 主要なセクションの情報を表示
        const mainSections = layoutData.aspectRatios.ratios.slice(0, 3);
        mainSections.forEach((ratio, index) => {
          section += `  - Section ${index + 1}: ${ratio.width}x${ratio.height}px (ratio ${ratio.ratio}:1)\n`;
        });
      }

      // グリッドシステム情報（検出された場合）
      if (layoutData.gridSystem && layoutData.gridSystem.detected) {
        section += `- **Grid System**: ${layoutData.gridSystem.columns}-column grid\n`;
        section += `- **Grid Gaps**: Horizontal ${layoutData.gridSystem.gaps.horizontal}px, Vertical ${layoutData.gridSystem.gaps.vertical}px\n`;
      }

      // 間隔パターン（検出された場合）
      if (layoutData.spacingPatterns && layoutData.spacingPatterns.detected) {
        if (layoutData.spacingPatterns.vertical && layoutData.spacingPatterns.vertical.length > 0) {
          section += `- **Vertical Spacing**: ${layoutData.spacingPatterns.vertical.map(p => `${p.value}px`).join(', ')}\n`;
        }
        if (layoutData.spacingPatterns.horizontal && layoutData.spacingPatterns.horizontal.length > 0) {
          section += `- **Horizontal Spacing**: ${layoutData.spacingPatterns.horizontal.map(p => `${p.value}px`).join(', ')}\n`;
        }
      }

      // 配置パターン（検出された場合）
      if (layoutData.alignmentPatterns && layoutData.alignmentPatterns.detected) {
        section += `- **Alignment**: ${layoutData.alignmentPatterns.dominantAlignment} alignment\n`;
      }

      // サンプルコード例（特に有益な情報として）
      if (layoutData.recommendations && layoutData.recommendations.examples) {
        section += `\n**Recommended Implementation:**\n`;

        // グリッドレイアウトのサンプル
        if (layoutData.recommendations.examples.grid) {
          section += "```scss\n" + layoutData.recommendations.examples.grid + "\n```\n";
        }
      }
    } else {
      section += "Basic structure with content sections arranged vertically.\n";
    }
  }

  // テキスト分析セクション（既存のコード）
  if (pcData.enhancedText || spData.enhancedText) {
    const textData = pcData.enhancedText || spData.enhancedText;
    if (textData.hasText) {
      section += textData.buildTextSection ? textData.buildTextSection(textData, {
        breakpoint: AnalysisModules.breakpoints.getMdValue()
      }) : '\n#### Typography Analysis\nText analysis data is available but could not be formatted.';
    }
  }

  return section;
}

/**
 * 設定情報セクションを構築する
 * @param {Object} settings - プロジェクト設定
 * @param {Array} pcColors - PC画像の色情報
 * @param {Array} spColors - SP画像の色情報
 * @returns {string} 設定セクションの文字列
 */
const buildSettingsSection = (settings, pcColors, spColors) => {
  if (!settings || Object.keys(settings).length === 0) {
    return '';
  }

  let section = `\n### Project Settings\n`;

  // Breakpoint information
  if (settings.breakpoints) {
    section += `\n#### Breakpoints\n`;
    if (Array.isArray(settings.breakpoints)) {
      settings.breakpoints.forEach(bp => {
        section += `- ${bp.name}: ${bp.value}px\n`;
      });
    } else {
      Object.entries(settings.breakpoints).forEach(([name, value]) => {
        section += `- ${name}: ${value}px\n`;
      });
    }
  }

  // Extract CSS variables and match with color information
  const colorVariables = {};

  if (settings.cssVariables && typeof settings.cssVariables === 'object') {
    // Extract color variables from CSS variables
    Object.entries(settings.cssVariables).forEach(([key, value]) => {
      // Regular expression pattern for color codes
      const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

      if (typeof value === 'string' && hexPattern.test(value)) {
        colorVariables[key] = {
          name: key,
          hex: value.toLowerCase()
        };
      }
    });

    // Match colors detected in analysis with colors in CSS variables
    const detectedColors = [];
    if (pcColors && Array.isArray(pcColors)) {
      detectedColors.push(...pcColors.map(c => ({ ...c, source: 'pc' })));
    }
    if (spColors && Array.isArray(spColors)) {
      detectedColors.push(...spColors.map(c => ({ ...c, source: 'sp' })));
    }

    // Match colors (detect variables with similar colors)
    const matchedColors = [];
    detectedColors.forEach(color => {
      if (!color.hex) return;

      // Find the closest CSS variable color
      let closestVariable = null;
      let closestDistance = 30; // Threshold (considered similar if below this value)

      Object.values(colorVariables).forEach(variable => {
        if (variable.hex && color.hex) {
          const distance = AnalysisModules.color.calculateColorDifference(color.hex, variable.hex);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestVariable = variable;
          }
        }
      });

      if (closestVariable) {
        matchedColors.push({
          detectedColor: color,
          cssVariable: closestVariable,
          distance: closestDistance
        });
      }
    });

    if (matchedColors.length > 0) {
      section += `\n#### Color Variable Mapping\n`;
      section += `Please use the following color variables for implementation. Detected colors match with variables:\n`;

      matchedColors.forEach(match => {
        section += `- ${match.detectedColor.source === 'pc' ? '[PC]' : '[SP]'} Detected color: ${match.detectedColor.hex} → CSS variable: ${match.cssVariable.name} (${match.cssVariable.hex})\n`;
      });
    }
  }

  // Project color settings (if no variable mapping)
  if (settings.colors && Object.keys(settings.colors).length > 0 && Object.keys(colorVariables).length === 0) {
    section += `\n#### Project Colors\n`;
    Object.entries(settings.colors).forEach(([name, value]) => {
      section += `- ${name}: ${value}\n`;
    });
  }

  // Reset CSS settings
  if (settings.resetCSS) {
    section += `\n#### Reset CSS\n`;
    section += `- Reset used: ${settings.resetCSS}\n`;
  }

  // Font settings
  if (settings.fonts) {
    section += `\n#### Font Settings\n`;
    if (settings.fonts.heading) {
      section += `- Headings: ${settings.fonts.heading}\n`;
    }
    if (settings.fonts.body) {
      section += `- Body: ${settings.fonts.body}\n`;
    }
  }

  return section;
};

/**
 * ガイドラインセクションを構築する関数
 * @param {string} responsiveMode - レスポンシブモード（'pc', 'sp', 'both'のいずれか）
 * @param {Object} options - オプション
 * @returns {string} ガイドラインセクション
 */
const buildGuidelinesSection = (responsiveMode, options = {}) => {
  return `## Coding Guidelines

Please use SCSS and HTML as a professional front-end developer.

### Key Requirements:
- **❗❗Most Important: Faithfully reproduce the design comp❗❗** - accurately match layout, spacing, sizes, and visual details
- **Compare your output with the provided images before submission** - adjust to match design details precisely
- **Only code elements shown in the images** - no assumptions or additional elements needed
- **Be faithful to the design** - accurate colors, spacing, and layout
- Use the **FLOCSS methodology**
- **❗Always use CSS GRID layout❗** - **NEVER** use Flexbox unless absolutely impossible with Grid
- Do not create container elements (don't fix the width of outer elements)
- **No SCSS nesting** - write flat SCSS structure
- **Maintain aspect ratio for all images** - use modern CSS techniques like aspect-ratio property
- **Avoid fixed width values** - use percentages, max-width, or relative units
- **Minimize use of height properties** - only when absolutely necessary for the design
- **Image implementation optimization**:
  - Always include width and height attributes on img tags to prevent layout shifts
  - Implement proper lazy loading: use \`loading="lazy"\` for images below the fold
  - Use appropriate image formats based on content type (JPEG for photos, PNG for graphics with transparency, WebP when possible)
  - For background images, use media queries for sizing at different breakpoints

### HTML Guidelines:
- Create semantic and accessible HTML
- Add class names to each block
- Child elements should use element notation
- Use proper FLOCSS naming conventions
- **Start heading tags with h2** - don't use h1 tags in components
- **Apply component classes directly to <a> tags** - apply component classes like c-button directly to <a> tags without creating unnecessary div wrappers
- **Correct button example**: \`<div class="p-hoge__button"><a href="#" class="c-button">View Details →</a></div>\`
- **Incorrect button example**: \`<div class="p-hoge__button"><div class="c-button"><a href="#" class="c-button__link">View Details →</a></div></div>\`
- **Don't use <header> or <main> tags** - use divs with appropriate classes instead
- Analyze the design and assign **specific, descriptive class names** that reflect design features
- **Accessibility considerations**:
  - Use appropriate ARIA attributes for interactive elements
  - Ensure sufficient color contrast (minimum 4.5:1 for normal text)
  - **Add English alt attributes to all images**:
    - Use descriptive English text (e.g., alt="Company XYZ logo" instead of alt="Company logo")
    - Use empty alt attributes for decorative images (alt="")
    - Keep descriptions concise (about 5-15 characters)
    - Verify alt attributes communicate the purpose of the image
  - Ensure keyboard navigation works for interactive elements

### FLOCSS Component Structure Guidelines:
- **Project (p-)**: Page/layout-specific components
  - Examples: \`.p-hero\`, \`.p-footer\`, \`.p-news-section\`
  - Use for large distinctive sections of the page

- **Layout (l-)**: Structural and grid components
  - Examples: \`.l-container\`, \`.l-grid\`, \`.l-row\`
  - Use for layout structures that organize content

- **Component (c-)**: Reusable UI elements
  - Examples: \`.c-button\`, \`.c-card\`, \`.c-form\`
  - Independent, reusable elements that appear in multiple contexts

- **Utility (u-)**: Single-purpose utility classes
  - Examples: \`.u-text-center\`, \`.u-margin-top\`
  - Usually modify a single specific property

### SCSS Guidelines:
- Follow the ${responsiveMode === "both" ? "responsive" : `${responsiveMode === "pc" ? "desktop-first" : "mobile-first"}`} approach
- **❗❗Important: Media queries must be placed within selectors and are the *only allowed nesting*❗❗** - like this:
\`\`\`scss
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: center;

  @include mq(md) {
    grid-template-columns: 1fr;
  }
}
\`\`\`

- **❌ Do not use SCSS nesting with the & symbol** - here's what NOT to do:
\`\`\`scss
// This is wrong - never do this
.p-hoge {
  background-color: #e9f5f9;

  &__title {  // Wrong - don't use &__
    font-size: 2rem;
  }

  &__content {  // Wrong - don't use &__
    display: grid;
  }
}
\`\`\`

- **✅ Correct way - use flat selectors** - always write like this:
\`\`\`scss
// This is correct - always do this
.p-hoge {
  background-color: #e9f5f9;
}

.p-hoge__title {  // Correct - flat selector
  font-size: 2rem;
}

.p-hoge__content {  // Correct - flat selector
  display: grid;
}
\`\`\`

- **❌ Don't write media queries like this** (Wrong! Don't do this!):
\`\`\`scss
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: center;
}

@include mq(md) {
  .p-hoge__content {
    grid-template-columns: 1fr;
  }
}
\`\`\`

### Performance Optimization Guidelines:
- Use modern CSS properties (will-change, contain, etc.) for performance-critical animations
- Avoid unnecessary DOM nesting to reduce rendering complexity
- Use CSS Grid efficiently to minimize layout shifts during loading
- Consider lazy loading with loading="lazy" attribute for images below the fold
- Prioritize system fonts or optimized web fonts to reduce layout shifts

### Animation and Transition Guidelines:
- **Keep animations subtle and purposeful**:
  - Use transitions for hover/focus states (always use 0.3 second duration)
  - Prefer transform and opacity changes over width, height, or position
  - Consider animation accessibility
  \`\`\`
  // Example of appropriate animation:
  .c-button {
    transition: transform 0.3s ease, opacity 0.3s ease;
  }

  .c-button:hover {  // Correct: Flat selector for hover state
    transform: translateY(-2px);
    opacity: 0.9;
  }
  \`\`\`
- **Performance considerations**:
  - Animate only transform and opacity properties when possible
  - Use will-change only when necessary and remove after animation
  - Avoid animating large elements or multiple elements simultaneously

### Spacing and Layout Guidelines:
- **Use a consistent spacing system**:
  - Define spacing with variables or clear system (e.g., 8px increments)
  - **Consistently use margin-top for all vertical spacing**
  - **Don't use margin-bottom; unify all vertical margins with margin-top**
  - Use gap property in Grid/Flexbox layouts when possible
- **Component spacing hierarchy**:
  - Parent components (p- prefix) should control external spacing (margin)
  - Child elements should control internal spacing (padding)
  - Don't rely on margin collapsing for layout
- **Avoid magic numbers**:
  - Don't use arbitrary values like margin-top: 37px
  - Use consistent spacing values throughout layout
- **Mobile spacing considerations**:
  - Proportionally reduce spacing in mobile views (typically 50-70% of desktop values)
  - Control spacing changes with media queries

### Font Specification Guidelines:
- **Specify all font sizes directly in px**:
  - Headings (h2): 32px to 24px
  - Subheadings (h3): 24px to 20px
  - Body text: 16px
  - Small text: 14px
- **Responsive font sizes**:
  - Specify different font sizes directly in media queries
  - Example: font-size: 32px; @include mq(md) { font-size: 24px; }

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
// SCSS code here (no nesting except media queries, flat structure)
\`\`\`

Please analyze the image structure and layout in detail, and create accurate HTML and SCSS that precisely reflects only what is shown in the images.
`;
};

/**
 * 最終指示セクションを構築する関数
 * @returns {string} 最終指示セクション
 */
const buildFinalInstructionsSection = () => {
  return `## Critical Final Instructions - SCSS Structure
- **❌❌❌ NEVER output nested SCSS using the & operator under any circumstances ❌❌❌**
- **Code containing &__element or &:hover notation is strictly prohibited**
- **SCSS nesting using the & symbol will be rejected**
- **Always write flat selectors** e.g. .p-hero__title or .c-card__title (NOT .p-hero { &__title } or .c-card { &__title })

## Common Mistakes to Avoid - Real Examples

### ❌ Common SCSS Mistakes:
\`\`\`scss
    // ❌ WRONG: Nested selectors
    .p-hoge {
    background: #fff;

  &__title {  // NEVER do this
      font-size: 24px;
    }

  &__content {  // NEVER do this
      margin-top: 16px;
    }
  }

// ❌ WRONG: Nested hover states
.p-hoge__link {
  color: blue;

  &:hover {  // NEVER do this
    color: darkblue;
  }
}

// ❌ WRONG: Improper media query placement
.p-hoge__title {
  font-size: 24px;
}

@include mq(md) {  // Don't place media queries outside selectors
  .p-hoge__title {
    font-size: 18px;
  }
}

// ❌ WRONG: Mixed prefixes on a single element
.c-button.p-hoge__button {  // Don't mix prefixes
  display: inline-block;
}
\`\`\`

### ✅ Correct SCSS Implementation:
\`\`\`scss
  // ✅ CORRECT: Flat structure
  .p-hoge {
  background: #fff;
}

.p-hoge__title {
  font-size: 24px;

  @include mq(md) {  // Correct: Media query inside selector
    font-size: 18px;
  }
}

.p-hoge__content {
  margin-top: 16px;
}

// ✅ CORRECT: Flat hover states
.p-hoge__link {
  color: blue;
}

.p-hoge__link:hover {  // Correct: Flat selector for hover
  color: darkblue;
}

// ✅ CORRECT: Button implementation
.p-hoge__button {  // Container for positioning
  margin-top: 24px;
  text-align: center;
}

// The button itself is a separate element with c- prefix,
// in HTML it sits inside a container with p- prefix
\`\`\`
- **Only media queries @include mq() are allowed to be nested within selectors**
- **Use appropriate prefixes for each element type**:
  - p- for page/project-specific components like heroes, headers, footers, main sections
  - l- for layout components like containers, grids, wrappers
  - c- for common reusable UI components like buttons, cards, forms, navigation menus
  - u- for utility classes
- **Do not use multiple different prefixes on the same element** - choose one prefix type per element
- **WRONG: \`<a class="c-button p-hoge__button">Read More</a>\`**
- **CORRECT: \`<a class="c-button">Read More</a>\`** based on context
- **Check your output before submitting:** If you see any & symbols in your SCSS, rewrite everything with flat selectors
- **This is a zero-tolerance requirement:** Nested SCSS code will be automatically rejected

## Self-Verification Checklist
Before submitting your code, verify each of the following points:

### HTML Verification:
- [ ] No nested components (unnecessarily having div inside div)
- [ ] All images have appropriate alt attributes in English
- [ ] All images have width and height attributes
- [ ] Heading hierarchy is appropriate (starting with h2, not h1)
- [ ] No mixed prefixes on the same element (e.g., no \`class="c-button p-card__button"\`)
- [ ] No unnecessary wrapper elements
- [ ] Button implementation follows the correct pattern
- [ ] All interactive elements are accessible (focus states, appropriate roles)

### SCSS Verification:
- [ ] No nesting whatsoever except for media queries
- [ ] No & symbols anywhere in the code
- [ ] All pseudo-classes (hover, focus, active) written as flat selectors
- [ ] All media queries are inside selectors
- [ ] Consistent spacing system is used
- [ ] Vertical spacing uses only margin-top (no margin-bottom)
- [ ] All selectors use appropriate prefixes (p-, l-, c-, u-)
- [ ] Grid layout is used instead of flexbox where possible
- [ ] No unnecessary fixed widths are used
- [ ] Height properties are avoided when possible
- [ ] All transitions are set to 0.3 second duration

### Final Quality Check Process:
1. **Compare with Original Design**:
   - Visually confirm code matches the design comp
   - Check spacing, alignment, and proportions
   - Verify color accuracy

2. **Code Structure Review**:
   - Scan all SCSS for & symbols (reject immediately if found)
   - Verify all class names follow FLOCSS naming conventions
   - Validate buttons follow the exact specified pattern

3. **Refactor Problematic Code**:
   - Replace instances of mixed prefixes with separate elements
   - Fix nested SCSS that isn't media queries
   - Ensure all component hierarchies are correct

4. **Specific Pattern Validation**:
   - Buttons: \`<div class="p-section__button"><a href="#" class="c-button">Text</a></div>\`
   - Cards: Parent with p- prefix, content with appropriate element names
   - Images: Proper attributes and responsive handling

After reviewing this checklist, confirm that your HTML and SCSS accurately reproduce the design comp images and adhere to all guidelines. If any issues are found, fix them before submitting.
`;
};

/**
 * コアプロンプトを構築する関数
 * @param {string} responsiveMode - レスポンシブモード ('pc', 'sp', 'both')
 * @param {Array} aiBreakpoints - ブレークポイント設定
 * @returns {string} コアプロンプト
 */
const buildCorePrompt = (responsiveMode, aiBreakpoints) => {
  // ブレークポイント値の取得
  const mdBreakpoint = AnalysisModules.breakpoints.getMdValue({ aiBreakpoints });

  let prompt = `# Web Design Implementation Requirements

## Overview
- **Responsive Type**: ${responsiveMode === 'pc' ? 'Desktop First' : responsiveMode === 'sp' ? 'Mobile First' : 'Both Mobile and Desktop'}
- **Breakpoint**: ${mdBreakpoint}px
- **Media Query Syntax**: ${responsiveMode === 'sp' ? '@include mq(md)' : '@include mq(md)'}

`;

  return prompt;
};

// メイン関数を修正して新機能を統合
export const generatePrompt = async (options) => {
  console.log('プロンプト生成処理を開始');
  const {
    pcImage, spImage,
    responsiveMode = "pc",
    aiBreakpoints = []
  } = options;
  console.log("🔥 generatePrompt 開始");

  console.log("🔥 pcImage:", pcImage ? pcImage.slice(0, 100) : 'なし');
  console.log("🔥 spImage:", spImage ? spImage.slice(0, 100) : 'なし');

  try {
    // 画像解析を実行
    const [pcAnalysis, spAnalysis] = await Promise.all([
      pcImage ? analyzeImage(pcImage, 'pc') : Promise.resolve({ colors: [], text: '', textBlocks: [], sections: [], layout: {}, elements: { elements: [] }, compressedAnalysis: null }),
      spImage ? analyzeImage(spImage, 'sp') : Promise.resolve({ colors: [], text: '', textBlocks: [], sections: [], layout: {}, elements: { elements: [] }, compressedAnalysis: null })
    ]);

    // 解析結果の検証
    if (!pcImage && !spImage) {
      console.warn('画像データが提供されていません。基本的なプロンプトのみを生成します。_promptGenerator.js_1');
    } else {
      if (pcImage && (!pcAnalysis || Object.keys(pcAnalysis).length === 0)) {
        console.error('PC画像の解析結果が空です。');
      }
      if (spImage && (!spAnalysis || Object.keys(spAnalysis).length === 0)) {
        console.error('SP画像の解析結果が空です。');
      }
    }

    // 拡張分析を実行（既存のデータを拡張）
    let enhancedPcAnalysis = null;
    let enhancedSpAnalysis = null;

    try {
      if (pcAnalysis && pcAnalysis.colors && pcAnalysis.colors.length > 0) {
        // 色彩分析の拡張
        const colorAnalysis = AnalysisModules.color.analyzeColors(pcAnalysis.colors);

        // レイアウト分析の実行
        const layoutAnalysis = AnalysisModules.layout.analyzeLayout(pcAnalysis, {
          responsiveMode: 'pc',
          aiBreakpoints
        });

        // テキスト分析の実行
        const textAnalysis = AnalysisModules.text.analyzeText(pcAnalysis, {
          responsiveMode: 'pc',
          breakpoint: AnalysisModules.breakpoints.getMdValue({ aiBreakpoints })
        });

        // 拡張データを追加
        enhancedPcAnalysis = {
          ...pcAnalysis,
          enhancedColors: colorAnalysis,
          enhancedLayout: layoutAnalysis,
          enhancedText: textAnalysis
        };

        console.log('PC画像の拡張色彩分析が完了しました。',
          colorAnalysis.primary ? `プライマリカラー: ${colorAnalysis.primary.hex}` : '主要色なし');
        console.log('PC画像のレイアウト分析が完了しました。',
          layoutAnalysis.hasLayout ? `レイアウト検出済み` : 'レイアウト未検出');
        console.log('PC画像のテキスト分析が完了しました。',
          textAnalysis.hasText ? `テキスト解析済み` : 'テキスト未検出');
      }

      // SPデータも同様に処理
      if (spAnalysis && spAnalysis.colors && spAnalysis.colors.length > 0) {
        const colorAnalysis = AnalysisModules.color.analyzeColors(spAnalysis.colors);

        // レイアウト分析の実行
        const layoutAnalysis = AnalysisModules.layout.analyzeLayout(spAnalysis, {
          responsiveMode: 'sp',
          aiBreakpoints
        });

        // テキスト分析の実行
        const textAnalysis = AnalysisModules.text.analyzeText(spAnalysis, {
          responsiveMode: 'sp',
          breakpoint: AnalysisModules.breakpoints.getMdValue({ aiBreakpoints })
        });

        enhancedSpAnalysis = {
          ...spAnalysis,
          enhancedColors: colorAnalysis,
          enhancedLayout: layoutAnalysis,
          enhancedText: textAnalysis
        };
        console.log('SP画像の拡張色彩分析が完了しました。',
          colorAnalysis.primary ? `プライマリカラー: ${colorAnalysis.primary.hex}` : '主要色なし');
        console.log('SP画像のレイアウト分析が完了しました。',
          layoutAnalysis.hasLayout ? `レイアウト検出済み` : 'レイアウト未検出');
        console.log('SP画像のテキスト分析が完了しました。',
          textAnalysis.hasText ? `テキスト解析済み` : 'テキスト未検出');
      }

    } catch (enhancementError) {
      console.warn('拡張分析中にエラーが発生しました（基本分析は影響なし）:', enhancementError);
      // 拡張分析が失敗しても基本分析は維持
    }

    // 以降は拡張されたデータがあれば使用、なければ元のデータを使用
    const pcData = enhancedPcAnalysis || pcAnalysis;
    const spData = enhancedSpAnalysis || spAnalysis;

    // プロジェクト設定を取得（非同期）
    console.log('プロジェクト設定を取得中...');
    const settings = await getSettingsFromActiveProject();
    console.log('プロジェクト設定取得完了:', settings ? Object.keys(settings).join(', ') : '設定なし');

    // プロンプトの構築を開始
    console.log('プロンプトの構築を開始');

    // 1. コアプロンプト
    let prompt = buildCorePrompt(responsiveMode, aiBreakpoints);

    // 2. 解析結果
    prompt += buildAnalysisSection(pcData, spData);

    // 3. 設定情報
    prompt += buildSettingsSection(settings, pcData.colors, spData.colors);


    // 4. 要件
    prompt += `
## Requirements
- Create clean, semantic HTML5 and SCSS
- Use BEM methodology for class naming
- Ensure the design is responsive and works well across all device sizes
- Pay attention to spacing, alignment, and typography
- Include all necessary hover states and transitions
`;

    // 5. 出力形式
    prompt += `
## Output Format
- Provide the HTML code first, followed by the SCSS code
- Make sure both codes are properly formatted and organized
- Include comments for major sections
`;

    // 最終プロンプトを生成
    let finalPrompt = '';

    // 拡張された分析機能を使用
    try {
      // 画像解析結果に応じて高度なプロンプト生成を試みる
      console.log("拡張プロンプト生成を試みます...");

      // 統合データオブジェクトの構築
      let analysisData = null;

      // PCデータ優先、ただし存在しなければSPデータを使用
      if (pcData && Object.keys(pcData).length > 0) {
        analysisData = {
          ...pcData,
          responsiveMode
        };

        // SPデータがあれば統合
        if (spData && Object.keys(spData).length > 0) {
          // SPデータに存在するが、PCデータにないプロパティを追加
          Object.keys(spData).forEach(key => {
            if (!analysisData[key] && spData[key]) {
              analysisData[key] = spData[key];
            }
          });

          // textBlocksに関してはSP用のプロパティとして追加
          if (spData.textBlocks && Array.isArray(spData.textBlocks)) {
            analysisData.spTextBlocks = spData.textBlocks;
          }

          // 両方のデータがある場合は'both'モードに設定
          analysisData.responsiveMode = 'both';
        }
      } else if (spData && Object.keys(spData).length > 0) {
        analysisData = {
          ...spData,
          responsiveMode: 'sp'
        };
      }

      // データ検証
      if (analysisData) {
        console.log("解析データの準備完了:");

        // aiBreakpointsとプロジェクト設定の追加
        analysisData.aiBreakpoints = aiBreakpoints;
        analysisData.settings = settings;

        // buildBetterPromptを使用して拡張プロンプトを生成
        const enhancedPrompt = buildBetterPrompt(analysisData);

        if (enhancedPrompt && typeof enhancedPrompt === 'string' && enhancedPrompt.length > 100) {
          console.log("拡張プロンプト生成に成功しました");
          finalPrompt = enhancedPrompt;
        } else {
          console.log("拡張プロンプト生成失敗 - フォールバックを使用します");
          finalPrompt = buildFallbackPrompt(pcData, spData, settings, responsiveMode, aiBreakpoints);
        }
      } else {
        console.log("解析データが利用できません - フォールバックを使用します");
        finalPrompt = buildFallbackPrompt(pcData, spData, settings, responsiveMode, aiBreakpoints);
      }
    } catch (error) {
      console.error("拡張プロンプト生成エラー:", error);
      // エラー時はフォールバックプロンプト生成を使用
      finalPrompt = buildFallbackPrompt(pcData, spData, settings, responsiveMode, aiBreakpoints);
    }

    console.log('プロンプト生成が完了しました');
    return finalPrompt.trim();
  } catch (error) {
    console.error('プロンプト生成エラー:', error);
    if (error.stack) {
      console.error("エラースタック:", error.stack);
    }
    return 'プロンプト生成中にエラーが発生しました。再試行してください。';
  }
};
