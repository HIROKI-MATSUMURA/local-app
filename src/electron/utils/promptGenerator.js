import { analyzeImageSections, detectMainSections, detectCardElements, detectFeatureElements } from "./imageAnalyzer";

// 分析モジュールの名前空間（第1段階：基盤作り）
const AnalysisModules = {
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
  },
  layout: {
    // layoutAnalyzer.jsから抽出予定
  }
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

// variableSettings形式からCSS変数文字列に変換する関数
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

// CSS変数からHEX値を抽出する関数
const extractHexValuesFromVariables = (cssVars) => {
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
};



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

// analyze_all を送信する関数（タイムアウト付き）
const analyzeAll = async (params) => {
  try {
    const rawResponse = await Promise.race([
      window.api.invoke('analyze_all', params),
      new Promise((_, reject) => setTimeout(() => reject(new Error('タイムアウト')), 120000)),
    ]);

    // ネストされている場合も吸収
    const result = rawResponse?.result || rawResponse;

    console.log('✅ Pythonのレスポンス:', result);
    console.log('✅ JSON形式（全体）:', JSON.stringify(result, null, 2));

    if (!result || result.success === false || result.error) {
      console.warn('⚠️ Pythonの解析に失敗:', result?.error || '不明なエラー');
      return { success: false, error: result?.error || '不明なエラー' };
    }

    return {
      success: true,
      ...result
    };

  } catch (error) {
    console.error('❌ タイムアウト or Python解析エラー:', error.message);
    return { success: false, error: error.message };
  }
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

        // 拡張データを追加
        enhancedPcAnalysis = {
          ...pcAnalysis,
          enhancedColors: colorAnalysis
        };

        console.log('PC画像の拡張色彩分析が完了しました。',
          colorAnalysis.primary ? `プライマリカラー: ${colorAnalysis.primary.hex}` : '主要色なし');
      }

      // SPデータも同様に処理
      if (spAnalysis && spAnalysis.colors && spAnalysis.colors.length > 0) {
        const colorAnalysis = AnalysisModules.color.analyzeColors(spAnalysis.colors);

        enhancedSpAnalysis = {
          ...spAnalysis,
          enhancedColors: colorAnalysis
        };

        console.log('SP画像の拡張色彩分析が完了しました。',
          colorAnalysis.primary ? `プライマリカラー: ${colorAnalysis.primary.hex}` : '主要色なし');
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

    // 拡張された分析機能を使用（オプション）
    try {
      // 画像解析結果に応じて高度なプロンプト生成を試みる
      console.log("拡張プロンプト生成を試みます...");

      // compressedAnalysisがなければ画像解析結果を直接使用
      let analysisData = null;

      if (pcData && pcData.compressedAnalysis) {
        console.log("PC画像の圧縮解析データを使用");
        analysisData = pcData.compressedAnalysis;
        validateAndLogData(analysisData, 'PC圧縮解析');
      } else if (spData && spData.compressedAnalysis) {
        console.log("SP画像の圧縮解析データを使用");
        analysisData = spData.compressedAnalysis;
        validateAndLogData(analysisData, 'SP圧縮解析');
      } else {
        // 圧縮解析データがない場合は、生の解析データから統合オブジェクトを作成
        console.log("圧縮解析データがないため、生の解析データから構築");

        // 基本オブジェクト構造を作成
        analysisData = {
          text: '',
          textBlocks: [],
          colors: [],
          layout: {
            width: 1200,  // デフォルト値
            height: 800,  // デフォルト値
            type: 'standard'
          },
          elements: {
            elements: []
          },
          sections: []
        };

        // テキスト情報を追加
        if (pcData && typeof pcData.text === 'string' && pcData.text.trim()) {
          analysisData.text = pcData.text;
        } else if (spData && typeof spData.text === 'string' && spData.text.trim()) {
          analysisData.text = spData.text;
        }

        // 色情報を追加
        if (pcData && Array.isArray(pcData.colors) && pcData.colors.length > 0) {
          analysisData.colors = pcData.colors;
        } else if (spData && Array.isArray(spData.colors) && spData.colors.length > 0) {
          analysisData.colors = spData.colors;
        }

        // 要素情報を追加
        if (pcData && pcData.elements && pcData.elements.elements) {
          analysisData.elements = pcData.elements;
        } else if (spData && spData.elements && spData.elements.elements) {
          analysisData.elements = spData.elements;
        }

        // セクション情報を追加
        if (pcData && Array.isArray(pcData.sections) && pcData.sections.length > 0) {
          analysisData.sections = pcData.sections;
        } else if (spData && Array.isArray(spData.sections) && spData.sections.length > 0) {
          analysisData.sections = spData.sections;
        }

        // テキストブロック情報の探索とフォールバック
        const getTextBlocks = (analysis) => {
          if (!analysis) return null;

          // 直接textBlocksが存在する場合
          if (Array.isArray(analysis.textBlocks)) {
            return analysis.textBlocks;
          }

          // 圧縮解析データのtext.blocksを探索
          if (analysis.compressedAnalysis &&
            analysis.compressedAnalysis.text &&
            Array.isArray(analysis.compressedAnalysis.text.blocks)) {
            return analysis.compressedAnalysis.text.blocks;
          }

          return null;
        };

        // テキストブロックを追加
        const pcTextBlocks = getTextBlocks(pcData);
        const spTextBlocks = getTextBlocks(spData);

        if (pcTextBlocks) {
          analysisData.textBlocks = pcTextBlocks;
        } else if (spTextBlocks) {
          analysisData.textBlocks = spTextBlocks;
        }

        // データ構造の検証
        validateAndLogData(analysisData, '統合解析');
      }

      if (analysisData) {
        console.log("解析データ確認:",
          typeof analysisData === 'object' ?
            Object.keys(analysisData).join(', ') : typeof analysisData);

        // 重要なプロパティがあるか確認
        const requiredProps = ['text', 'colors', 'layout'];
        const missingProps = requiredProps.filter(prop => !analysisData.hasOwnProperty(prop));

        if (missingProps.length > 0) {
          console.warn("解析データに不足しているプロパティがあります:", missingProps.join(', '));
          // 不足プロパティのフォールバック
          missingProps.forEach(prop => {
            switch (prop) {
              case 'text':
                analysisData.text = '';
                break;
              case 'colors':
                analysisData.colors = [];
                break;
              case 'layout':
                analysisData.layout = { width: 1200, height: 800, type: 'standard' };
                break;
            }
          });
        }

        // 拡張プロンプト生成
        const enhancedPrompt = buildBetterPrompt(analysisData);

        if (enhancedPrompt && typeof enhancedPrompt === 'string' && enhancedPrompt.length > 100) {
          console.log("拡張プロンプト生成に成功しました");
          return enhancedPrompt; // 拡張プロンプトを使用
        } else {
          console.log("拡張プロンプト生成失敗 - 出力が短すぎるか空です:",
            enhancedPrompt ? `長さ: ${enhancedPrompt.length}文字` : '出力なし');
        }
      } else {
        console.log("解析データが利用できません");
      }
    } catch (error) {
      console.error("拡張プロンプト生成エラー:", error);
      // エラー詳細をログ出力
      if (error.stack) {
        console.error("エラースタック:", error.stack);
      }
      // エラー時は通常のプロンプト生成にフォールバック
    }

    // 拡張プロンプトが生成できなかった場合は従来の方法でプロンプト生成
    console.log("従来のプロンプト生成方法にフォールバックします");
    finalPrompt = `
# ウェブサイトデザイン実装タスク

${prompt}

${buildGuidelinesSection(responsiveMode)}

${buildFinalInstructionsSection()}
`;

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
// コアプロンプト部分を構築する関数
const buildCorePrompt = (responsiveMode, aiBreakpoints) => {
  return `
# HTML/SCSS Code Generation from Design Comp

## Basic Information
- Output Type: ${responsiveMode === "both" ? "Responsive Design (PC/SP)" : `${responsiveMode === "pc" ? "PC (Desktop)" : "SP (Mobile)"}`}
${aiBreakpoints && aiBreakpoints.length > 0 ? `- Breakpoints: ${aiBreakpoints.map(bp => `${bp.width}px`).join(', ')}` : ''}
`;
};

// 解析結果部分を構築する関数
const buildAnalysisSection = (pcAnalysis, spAnalysis) => {
  // 解析データがなければ空のセクションを返す
  if (!pcAnalysis && !spAnalysis) {
    return `\n## Design Analysis\nThe uploaded image could not be analyzed correctly. Please provide design specifications manually.\n\n`;
  }

  let section = "\n## Design Analysis\n";

  // 使用するデータソースを決定（PC優先）
  const analysis = pcAnalysis || spAnalysis;

  // 拡張色彩分析データがあればそれを使用
  if (analysis.enhancedColors) {
    const colors = analysis.enhancedColors;

    section += "\n### Color Palette\n";

    // プライマリカラー
    if (colors.primary) {
      section += `- Primary: ${colors.primary.hex} ${colors.primary.rgb}\n`;
    }

    // セカンダリカラー
    if (colors.secondary) {
      section += `- Secondary: ${colors.secondary.hex} ${colors.secondary.rgb}\n`;
    }

    // アクセントカラー
    if (colors.accent) {
      section += `- Accent: ${colors.accent.hex} ${colors.accent.rgb}\n`;
    }

    // 背景色
    if (colors.background) {
      section += `- Background: ${colors.background.hex} ${colors.background.rgb}\n`;
    }

    // テキスト色
    if (colors.text) {
      section += `- Text: ${colors.text.hex} ${colors.text.rgb}\n`;
    }

    // パレット全体
    if (colors.palette && colors.palette.length > 0) {
      section += "\nAdditional colors:\n";
      colors.palette.forEach(color => {
        if (color.role && color.role !== 'general') {
          section += `- ${color.hex} (${color.role})\n`;
        } else {
          section += `- ${color.hex}\n`;
        }
      });
    }

    // コントラストチェック
    if (colors.contrastRatios && Object.keys(colors.contrastRatios).length > 0) {
      section += "\nContrast Ratios:\n";
      Object.entries(colors.contrastRatios).forEach(([key, value]) => {
        // キーを読みやすいラベルに変換
        const label = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .replace('To', ' to ');

        // コントラスト値に基づくWCAGレベル
        let wcagLevel = '';
        if (value >= 7) wcagLevel = '(AAA)';
        else if (value >= 4.5) wcagLevel = '(AA)';
        else if (value >= 3) wcagLevel = '(AA Large Text)';

        section += `- ${label}: ${value} ${wcagLevel}\n`;
      });
    }

    section += "\n";
  } else {
    // 通常の色彩分析（既存のコード）
    if (analysis.colors && analysis.colors.length > 0) {
      const colors = analysis.colors;
      section += "\n### Color Palette\n";

      // 色ごとに出力
      colors.slice(0, 8).forEach(color => {
        section += `- ${color.hex} ${color.rgb || ''}\n`;
      });

      section += "\n";
    }
  }

  // 以下の既存コードはそのまま維持

  // テキスト情報
  if (analysis.text) {
    section += "\n### Text Content\n";
    section += `${analysis.text.substring(0, 300)}${analysis.text.length > 300 ? '...' : ''}\n\n`;
  }

  // レイアウト情報（もし存在する場合）
  if (analysis.layout && Object.keys(analysis.layout).length > 0) {
    section += "\n### Layout\n";

    if (analysis.layout.layoutType) {
      section += `- Layout Type: ${analysis.layout.layoutType}\n`;
    }

    if (analysis.layout.width && analysis.layout.height) {
      section += `- Dimensions: ${analysis.layout.width}x${analysis.layout.height}\n`;
    }

    section += "\n";
  }

  // セクション情報
  if (analysis.sections && analysis.sections.length > 0) {
    section += "\n### Structure\n";
    analysis.sections.forEach((sectionItem, index) => {
      section += `- Section ${index + 1}: ${sectionItem.section_type || 'Content Section'}\n`;
    });
    section += "\n";
  }

  return section;
};

/**
 * 解析データからセマンティックHTMLタグの提案を生成
 * @param {Object} data - 正規化された分析データ
 * @returns {string} セマンティックタグのリスト
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

/**
 * 解析データからCSSテンプレート形式を生成
 * @param {Object} data - 正規化された分析データ
 * @returns {string} CSSテクニックの提案
 */
const generateTemplateFormat = (data) => {
  if (!data) {
    console.warn('テンプレート形式生成: データがありません');
    return '<!-- デフォルトのテンプレート構造 -->\n<div class="container">\n  <div class="header">ヘッダー</div>\n  <div class="content">コンテンツ</div>\n  <div class="footer">フッター</div>\n</div>';
  }

  try {
    console.log('テンプレート形式生成: データ構造確認', typeof data === 'object' ? Object.keys(data).join(', ') : typeof data);

    // レイアウト情報の取得
    const layout = safeGetProperty(data, 'layout', {});
    const layoutType = safeGetProperty(layout, 'type', 'standard');
    const templateType = safeGetProperty(layout, 'template', 'standard');
    console.log('テンプレート形式生成: レイアウトタイプ', layoutType, 'テンプレート', templateType);

    // セクション情報の取得
    const sections = safeGetProperty(data, 'sections', []);

    // テンプレートを決定
    let template = '';

    switch (templateType.toLowerCase()) {
      case 'hero':
      case 'landing':
        template = `<!-- ヒーローセクション型テンプレート -->
<div class="container">
  <header class="header">
    <!-- ヘッダー内容 -->
  </header>

  <section class="hero">
    <div class="hero__content">
      <h1 class="hero__title">メインタイトル</h1>
      <p class="hero__subtitle">サブタイトル</p>
      <div class="hero__action">
        <button class="btn btn--primary">アクション</button>
      </div>
    </div>
    <div class="hero__image">
      <!-- メイン画像 -->
    </div>
  </section>

  <main class="main">
    <!-- メインコンテンツ -->
  </main>

  <footer class="footer">
    <!-- フッター内容 -->
  </footer>
</div>`;
        break;

      case 'grid':
      case 'cards':
        template = `<!-- グリッド型テンプレート -->
<div class="container">
  <header class="header">
    <!-- ヘッダー内容 -->
  </header>

  <main class="main">
    <section class="section">
      <h2 class="section__title">セクションタイトル</h2>
      <div class="grid">
        <div class="grid__item">アイテム1</div>
        <div class="grid__item">アイテム2</div>
        <div class="grid__item">アイテム3</div>
        <!-- 追加のグリッドアイテム -->
      </div>
    </section>
  </main>

  <footer class="footer">
    <!-- フッター内容 -->
  </footer>
</div>`;
        break;

      case 'split':
      case 'two-column':
        template = `<!-- 2カラム型テンプレート -->
<div class="container">
  <header class="header">
    <!-- ヘッダー内容 -->
  </header>

  <div class="content">
    <main class="main">
      <!-- メインコンテンツ -->
    </main>

    <aside class="sidebar">
      <!-- サイドバーコンテンツ -->
    </aside>
  </div>

  <footer class="footer">
    <!-- フッター内容 -->
  </footer>
</div>`;
        break;

      default:
        template = `<!-- 標準テンプレート -->
<div class="container">
  <header class="header">
    <!-- ヘッダー内容 -->
  </header>

  <main class="main">
    <!-- メインコンテンツ -->
  </main>

  <footer class="footer">
    <!-- フッター内容 -->
  </footer>
</div>`;
    }

    return template;
  } catch (error) {
    console.error('テンプレート形式生成エラー:', error);
    return '<!-- エラー: テンプレート生成に失敗しました -->\n<div class="container">\n  <div class="content">エラーが発生しました</div>\n</div>';
  }
};

// 設定セクションを構築する関数
const buildSettingsSection = (settings, pcColors, spColors) => {
  let settingsSection = "\n## CSS Settings\n";

  // Reset CSSの設定
  if (settings && settings.resetCSS) {
    settingsSection += "### Reset CSS\nThe project uses a custom reset CSS.\n\n";
  } else {
    settingsSection += "### Reset CSS\nUse a standard CSS reset or normalize.css.\n\n";
  }

  // 色変数の設定
  settingsSection += "### Color Variables\n";

  // 拡張色彩データがあればそれを使用（PCデータを優先）
  const pcAnalysis = pcColors && pcColors.enhancedColors;
  const spAnalysis = spColors && spColors.enhancedColors;
  const colorAnalysis = pcAnalysis || spAnalysis;

  if (colorAnalysis) {
    // プライマリ、セカンダリ、アクセントカラーを変数として出力
    let variables = [];

    if (colorAnalysis.primary) {
      variables.push(`$primary-color: ${colorAnalysis.primary.hex};`);
    }

    if (colorAnalysis.secondary) {
      variables.push(`$secondary-color: ${colorAnalysis.secondary.hex};`);
    }

    if (colorAnalysis.accent) {
      variables.push(`$accent-color: ${colorAnalysis.accent.hex};`);
    }

    if (colorAnalysis.background) {
      variables.push(`$background-color: ${colorAnalysis.background.hex};`);
    }

    if (colorAnalysis.text) {
      variables.push(`$text-color: ${colorAnalysis.text.hex};`);
    }

    // 色相グループがあれば追加
    if (colorAnalysis.groups && colorAnalysis.groups.length > 0) {
      colorAnalysis.groups.forEach(group => {
        if (group.colors && group.colors.length > 0) {
          variables.push(`$${group.name}-color: ${group.colors[0]};`);
        }
      });
    }

    settingsSection += "```scss\n" + variables.join("\n") + "\n```\n\n";
  } else if (settings && settings.variableSettings) {
    // プロジェクト設定の変数があれば使用
    settingsSection += "```scss\n" + settings.variableSettings + "\n```\n\n";
  } else {
    // デフォルトの色変数
    settingsSection += "Define color variables based on the color palette in the design.\n\n";
  }

  // レスポンシブ設定
  settingsSection += "### Responsive Settings\n";
  if (settings && settings.responsiveSettings) {
    settingsSection += "```scss\n" + settings.responsiveSettings + "\n```\n\n";
  } else {
    // デフォルトのブレークポイント
    settingsSection += "```scss\n$breakpoints: (\n  sm: 576px,\n  md: 768px,\n  lg: 992px,\n  xl: 1200px\n);\n```\n\n";
  }

  return settingsSection;
};

// ガイドラインセクションを構築する関数
const buildGuidelinesSection = (responsiveMode) => {
  return `
## Coding Guidelines

You are a professional front-end developer specializing in SCSS and HTML.

### Core Requirements:
- **❗❗MOST CRITICAL: FAITHFULLY REPRODUCE THE DESIGN COMP❗❗** - match exact layout, spacing, sizing, and visual details
- **Compare your output with the provided image before submitting** - make adjustments to match design details precisely
- **ONLY code elements visible in the image** - no assumed or extra elements
- **Be faithful to the design** - accurate colors, spacing, and layout
- Use **FLOCSS methodology** instead of BEM
- **❗ALWAYS USE CSS GRID LAYOUT❗** - **NEVER** use Flexbox unless absolutely impossible with Grid
- Do not create container elements (don't fix width of outer elements)
- **No SCSS nesting** - write flat SCSS structure
- **Maintain aspect ratios for all images** - use modern CSS techniques like aspect-ratio property
- **Avoid fixed width values** - use percentages, max-width, or relative units
- **Use height properties minimally** - only when absolutely necessary for the design
- **Optimize image implementation**:
  - Always include width and height attributes on img tags to prevent layout shifts
  - Implement proper lazy loading: \`loading="lazy"\` for below-fold images
  - Use appropriate image format based on content type (JPEG for photos, PNG for graphics with transparency, WebP where possible)
  - For background images, use media queries to adjust sizing at different breakpoints

### HTML Guidelines:
- Create semantic, accessible HTML
- Add class names to each block
- Child elements should use element notation
- Use proper naming conventions for FLOCSS
- **START HEADING TAGS FROM h2** - do not use h1 tags in components
- **USE <a> TAGS DIRECTLY WITH COMPONENT CLASSES** - apply component classes like c-button directly to <a> tags, do not create unnecessary div wrappers
- **CORRECT BUTTON EXAMPLE**: \`<div class="p-hoge__button"><a href="#" class="c-button">View more →</a></div>\`
- **WRONG BUTTON EXAMPLE**: \`<div class="p-hoge__button"><div class="c-button"><a href="#" class="c-button__link">View more →</a></div></div>\`
- **DO NOT use <header> or <main> tags** - use div with appropriate classes instead
- Analyze the design and assign **specific, descriptive class names** that reflect design features
- **Accessibility considerations**:
  - Use appropriate ARIA attributes for interactive elements
  - Ensure sufficient color contrast (minimum 4.5:1 for normal text)
  - **Add Japanese alt text to all images**:
    - Use descriptive Japanese text (e.g., alt="株式会社〇〇のロゴ" instead of alt="企業ロゴ")
    - Use empty alt attribute for decorative images (alt="")
    - Keep descriptions concise (5-15 Japanese characters)
    - Ensure alt text conveys the image's purpose
  - Ensure keyboard navigation works for interactive elements

### FLOCSS Component Structure Guidelines:
- **Project (p-)**: Page/layout specific components
  - Example: \`.p-hero\`, \`.p-footer\`, \`.p-news-section\`
  - Use for large distinctive sections of the page

- **Layout (l-)**: Structure and grid components
  - Example: \`.l-container\`, \`.l-grid\`, \`.l-row\`
  - Used for layout structures that organize content

- **Component (c-)**: Reusable UI elements
  - Example: \`.c-button\`, \`.c-card\`, \`.c-form\`
  - Independent, reusable elements that can appear in multiple contexts

- **Utility (u-)**: Single-purpose utility classes
  - Example: \`.u-text-center\`, \`.u-margin-top\`
  - Typically modify one specific property

### SCSS Guidelines:
- Follow the ${responsiveMode === "both" ? "responsive approach" : `${responsiveMode === "pc" ? "Desktop-first" : "Mobile-first"} approach`}
- **❗❗CRITICAL: MEDIA QUERIES MUST BE PLACED INSIDE SELECTORS - AND THEY ARE THE *ONLY* NESTING ALLOWED❗❗** - like this:
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

- **❌ NEVER USE SCSS NESTING WITH & SYMBOL** - Here's what NOT to do:
\`\`\`scss
// THIS IS WRONG - NEVER DO THIS
.p-hoge {
  background-color: #e9f5f9;

  &__title {  // WRONG - DON'T USE &__
    font-size: 2rem;
  }

  &__content {  // WRONG - DON'T USE &__
    display: grid;
  }
}
\`\`\`

- **✅ CORRECT WAY - USE FLAT SELECTORS** - Always write like this:
\`\`\`scss
// THIS IS CORRECT - ALWAYS DO THIS
.p-hoge {
  background-color: #e9f5f9;
}

.p-hoge__title {  // CORRECT - FLAT SELECTOR
  font-size: 2rem;
}

.p-hoge__content {  // CORRECT - FLAT SELECTOR
  display: grid;
}
\`\`\`

- **❌ NEVER WRITE MEDIA QUERIES THIS WAY** (WRONG! DON'T DO THIS!):
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
- Consider lazy-loading for images below the fold using loading="lazy" attribute
- Prefer system fonts or optimized web fonts to reduce layout shifts

### Animation & Transition Guidelines:
- **Keep animations subtle and purposeful**:
  - Use transitions for hover/focus states (always use 0.3s duration)
  - Prefer transform and opacity changes (over width, height, or position)
  - Consider accessibility in your animations
  \`\`\`
  // Example of appropriate animation:
  .c-button {
    transition: transform 0.3s ease, opacity 0.3s ease;
  }

  .c-button:hover {  // CORRECT: Flat selector for hover state
    transform: translateY(-2px);
    opacity: 0.9;
  }
  \`\`\`
- **Performance considerations**:
  - Only animate transform and opacity properties when possible
  - Use will-change only when necessary and remove it after animation
  - Avoid animating large elements or multiple elements simultaneously

### Spacing & Layout Guidelines:
- **Use a consistent spacing system**:
  - Define spacing with variables or a clear system (e.g., 8px increments)
  - **Use margin-top consistently for all vertical spacing**
  - **Never use margin-bottom for spacing**
  - Use gap property with Grid/Flexbox layouts when possible
- **Component spacing hierarchy**:
  - Parent component (p- prefix) should control external spacing (margins)
  - Child elements should control internal spacing (padding)
  - Never rely on margin collapsing for layout
- **Avoid magic numbers**:
  - Don't use arbitrary values like margin-top: 37px
  - Use consistent spacing values throughout the layout
- **Mobile spacing considerations**:
  - Reduce spacing proportionally on mobile views (generally 50-70% of desktop values)
  - Control spacing changes in media queries

## Output Format:
\`\`\`html
<!-- HTML code here -->
\`\`\`

\`\`\`scss
// SCSS code here (flat structure, except for media queries which should be nested)
\`\`\`

Analyze the image structure and layout in detail to create accurate HTML and SCSS that precisely reflect ONLY what is visible in the image.
`;
};

// レスポンシブデザインガイドラインセクションを構築する関数
const buildResponsiveGuidelinesSection = () => {
  return `
## Responsive Design Implementation Guidelines

### For Output Type: SP (Mobile)
Use a Mobile-first approach. Base styles should be for mobile devices, and use @include mq(md) media queries for larger screens.

Example:
\`\`\`scss
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr; // Single column for SP
  gap: 1rem;

  @include mq(md) {
    grid-template-columns: 1fr 1fr; // Multiple columns for PC according to design
    gap: 2rem;
  }
}
\`\`\`

### For Output Type: PC (Desktop)
Use a Desktop-first approach. Base styles should be for desktop devices, and use @include mq(md) media queries for smaller screens.

Example:
\`\`\`scss
.p-hoge__content {
  display: grid;
  grid-template-columns: 1fr 1fr; // Multiple columns for PC according to design
  gap: 2rem;

  @include mq(md) {
    grid-template-columns: 1fr; // Single column for SP
    gap: 1rem;
  }
}
\`\`\`

In both cases, ensure that mobile displays have a single-column layout, while desktop displays follow the multi-column structure as shown in the design comp. The media query function @include mq(md) should be used consistently for both approaches.
`;
};

// 最終指示セクションを構築する関数
const buildFinalInstructionsSection = () => {
  return `
## FINAL CRUCIAL INSTRUCTIONS - SCSS STRUCTURE
- **❌❌❌ NEVER UNDER ANY CIRCUMSTANCES OUTPUT NESTED SCSS USING & OPERATOR ❌❌❌**
- **ANY CODE WITH &__element or &:hover NOTATION IS STRICTLY PROHIBITED**
- **I WILL REJECT ANY CODE THAT USES SCSS NESTING WITH & SYMBOL**
- **YOU MUST ALWAYS WRITE FLAT SELECTORS** such as .p-hero__title or .c-card__title (not .p-hero { &__title } or .c-card { &__title })

## COMMON MISTAKES TO AVOID - REAL EXAMPLES

### ❌ SCSS Common Mistakes:
\`\`\`scss
    // ❌ WRONG: Nested selectors
    .p-hoge {
    background: #fff;

  &__title {  // NEVER DO THIS
      font-size: 24px;
    }

  &__content {  // NEVER DO THIS
      margin-top: 16px;
    }
  }

// ❌ WRONG: Nested hover states
.p-hoge__link {
  color: blue;

  &:hover {  // NEVER DO THIS
    color: darkblue;
  }
}

// ❌ WRONG: Improper media query placement
.p-hoge__title {
  font-size: 24px;
}

@include mq(md) {  // NEVER PLACE MEDIA QUERIES OUTSIDE SELECTORS
  .p-hoge__title {
    font-size: 18px;
  }
}

// ❌ WRONG: Mixed prefixes on single element
.c-button.p-hoge__button {  // NEVER MIX PREFIXES
  display: inline-block;
}
\`\`\`

### ✅ SCSS Correct Implementations:
\`\`\`scss
  // ✅ CORRECT: Flat structure
  .p-hoge {
  background: #fff;
}

.p-hoge__title {
  font-size: 24px;

  @include mq(md) {  // CORRECT: Media query inside selector
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

.p-hoge__link:hover {  // CORRECT: Flat selector for hover
  color: darkblue;
}

// ✅ CORRECT: Button implementation
.p-hoge__button {  // Container for positioning
  margin-top: 24px;
  text-align: center;
}

// Button itself is a separate element with c- prefix
// and inside a container with p- prefix in HTML
\`\`\`
- **ONLY MEDIA QUERIES @include mq() ARE ALLOWED TO BE NESTED INSIDE SELECTORS**
- **USE APPROPRIATE PREFIX FOR EACH ELEMENT TYPE**:
  - p- for page/project specific components like heroes, headers, footers, main sections
  - l- for layout components like containers, grids, wrappers
  - c- for common reusable UI components like buttons, cards, forms, navigation menus
  - u- for utility classes
- **DO NOT USE MULTIPLE DIFFERENT PREFIXES ON THE SAME ELEMENT** - Choose exactly one prefix type per element
- **INCORRECT: \`<a class="c-button p-hoge__button">View more</a>\`**
- **CORRECT: \`<a class="c-button">View more</a>\`** based on context
- **CHECK YOUR OUTPUT BEFORE SUBMITTING:** if you see any & symbols in your SCSS, rewrite it all with flat selectors
- **THIS IS A ZERO TOLERANCE REQUIREMENT:** nested SCSS code will be rejected automatically

## SELF-VALIDATION CHECKLIST
Before submitting your code, verify each of these points:

### HTML Validation:
- [ ] No nested components (divs inside divs unnecessarily)
- [ ] All images have proper alt text in Japanese
- [ ] All images have width and height attributes
- [ ] Heading hierarchy is proper (starts with h2, not h1)
- [ ] No mixing of prefixes on same elements (e.g., no \`class="c-button p-card__button"\`)
- [ ] No unnecessary wrapper elements
- [ ] Button implementation follows the correct pattern
- [ ] All interactive elements are accessible (focus states, proper roles)

### SCSS Validation:
- [ ] ZERO nesting except for media queries
- [ ] NO & symbol anywhere in the code
- [ ] All pseudo-classes (hover, focus, active) are written as flat selectors
- [ ] All media queries are INSIDE selectors
- [ ] Consistent spacing system used
- [ ] Vertical spacing uses margin-top ONLY (never margin-bottom)
- [ ] All selectors use appropriate prefixes (p-, l-, c-, u-)
- [ ] Grid layout is used instead of flexbox where possible
- [ ] No fixed widths used unnecessarily
- [ ] Height properties avoided where possible
- [ ] All transitions are set to 0.3s duration

### Final Quality Check Process:
1. **Compare to original design**:
   - Visually check if your code matches the design comp
   - Check spacing, alignment, and proportions
   - Verify color accuracy

2. **Code structure review**:
   - Scan all SCSS for any & symbols (instant rejection if found)
   - Check that all class names follow FLOCSS naming conventions
   - Verify buttons follow the exact pattern specified

3. **Refactor problematic code**:
   - Replace any instances of mixed prefixes with separate elements
   - Fix any nested SCSS that isn't a media query
   - Ensure all component hierarchies are correct

4. **Specific pattern verification**:
   - Buttons: \`<div class="p-section__button"><a href="#" class="c-button">Text</a></div>\`
   - Cards: Parent with p- prefix, content with appropriate element names
   - Images: Proper attributes and responsive treatment

After going through this checklist, ensure your HTML and SCSS accurately reproduce the design comp image and follow all guidelines. If ANY issues are found, fix them before submitting.
`;
};

/**
 * 分析データを標準化して、任意の入力形式から一貫した内部形式に変換
 * @param {Object} rawData - 元の解析データ
 * @returns {Object} 標準化された圧縮データ
 */
function normalizeAnalysisData(rawData) {
  try {
    // データがすでに必要なプロパティを持っている場合は、それを優先的に使用
    // Python側から直接返されるオブジェクト構造（colors, text.text, textBlocks）にも対応
    if (rawData && typeof rawData === 'object') {
      // 必要な構造を最初から正しく初期化
      const normalized = {
        layout: {
          type: 'unknown',
          template: 'standard',
          width: 1200, // デフォルト値
          height: 800, // デフォルト値
          sectionCount: 1,
          gridPattern: {
            columns: 12,
            rows: 'auto',
            gap: '20px'
          },
          aspectRatio: '3:2'
        },
        colors: [],
        text: {
          content: '',
          blocks: [],
          hierarchy: []
        },
        elements: {
          elements: [],
          summary: {
            counts: {
              total: 0,
              button: 0,
              image: 0,
              card: 0,
              navigation: 0,
              form: 0,
              list: 0,
              text: 0
            }
          }
        },
        sections: []
      };

      // レイアウト情報の処理
      if (rawData.layout && typeof rawData.layout === 'object') {
        Object.assign(normalized.layout, rawData.layout);
      }

      // 色情報の処理（配列形式）
      if (Array.isArray(rawData.colors)) {
        normalized.colors = rawData.colors.map(color => ({
          ...color,
          role: color.role || 'general',
          hex: color.hex || '#000000',
          rgb: color.rgb || 'rgb(0,0,0)',
          ratio: color.ratio || 0
        }));
      }

      // レイアウト情報の処理
      if (rawData.layout) {
        Object.assign(normalized.layout, rawData.layout);
      }

      // テキスト情報の処理
      if (typeof rawData.text === 'string') {
        // 文字列の場合
        normalized.text.content = rawData.text;
      } else if (typeof rawData.text === 'object' && rawData.text) {
        // オブジェクトの場合
        if (typeof rawData.text.text === 'string') {
          normalized.text.content = rawData.text.text;
        } else if (typeof rawData.text === 'string') {
          normalized.text.content = rawData.text;
        }

        // textBlocksプロパティがtext内に存在する場合
        if (Array.isArray(rawData.text.textBlocks)) {
          normalized.text.blocks = rawData.text.textBlocks;
        }
      }

      // textBlocksが直接存在する場合（Python側から直接返される形式）
      if (Array.isArray(rawData.textBlocks)) {
        normalized.text.blocks = rawData.textBlocks;
        // テキスト内容が未設定の場合、最初のブロックから抽出
        if (!normalized.text.content && rawData.textBlocks.length > 0) {
          const textContents = rawData.textBlocks
            .filter(block => block && block.text)
            .map(block => block.text);
          normalized.text.content = textContents.join(' ');
        }
      }

      // UI要素情報の処理
      if (rawData.elements) {
        if (Array.isArray(rawData.elements)) {
          normalized.elements.elements = rawData.elements;
          normalized.elements.summary.counts.total = rawData.elements.length;
        } else if (typeof rawData.elements === 'object') {
          // オブジェクト形式の場合
          if (rawData.elements.elements && Array.isArray(rawData.elements.elements)) {
            normalized.elements.elements = rawData.elements.elements;
            normalized.elements.summary.counts.total = rawData.elements.elements.length;
          } else {
            // elementsプロパティがない場合は、オブジェクト自体を使用
            normalized.elements.elements = [rawData.elements];
            normalized.elements.summary.counts.total = 1;
          }

          // summaryがある場合はコピー
          if (rawData.elements.summary) {
            normalized.elements.summary = {
              ...normalized.elements.summary,
              ...rawData.elements.summary
            };
          }
        }
      }

      // セクション情報の処理
      if (Array.isArray(rawData.sections)) {
        normalized.sections = rawData.sections;
        normalized.layout.sectionCount = rawData.sections.length;
      }

      return normalized;
    }

    return {
      layout: { type: 'unknown', width: 1200, height: 800 },
      colors: [],
      text: { content: '', blocks: [], hierarchy: [] },
      elements: { elements: [], summary: { counts: { total: 0 } } },
      sections: []
    };
  } catch (error) {
    return {
      layout: { type: 'unknown', width: 1200, height: 800 },
      colors: [],
      text: { content: '', blocks: [], hierarchy: [] },
      elements: { elements: [], summary: { counts: { total: 0 } } },
      sections: []
    };
  }
}

/**
 * デザイン全体の概要を生成（強化版）
 * @param {Object} compressedData - 圧縮された解析データ
 * @returns {string} デザイン概要の文字列
 */
function generateEnhancedOverviewSection(compressedData) {
  const layout = compressedData.layout || {};
  const layoutType = layout.type || layout.layoutType || 'unknown';
  const width = layout.width || 'unknown';
  const height = layout.height || 'unknown';
  const sectionCount = layout.sectionCount || 0;
  const gridPattern = layout.gridPattern || {};

  let description = `
This design appears to be a ${getLayoutTypeDescription(layoutType)} layout with dimensions of ${width}x${height}px.
The design is organized into ${sectionCount} main sections.`;

  if (gridPattern && gridPattern.type) {
    description += `
The layout follows a ${gridPattern.type} grid pattern with ${gridPattern.columns || 1} columns and ${gridPattern.rows || 1} rows.`;
  }

  const elementCount = compressedData.elements?.count || 0;
  if (elementCount > 0) {
    description += `
The design contains approximately ${elementCount} UI elements.`;
  }

  return description;
}

/**
 * レイアウトタイプの詳細説明を取得
 * @param {string} layoutType - レイアウトタイプ
 * @returns {string} レイアウトタイプの説明
 */
function getLayoutTypeDescription(layoutType) {
  const descriptions = {
    'grid': 'grid-based',
    'horizontal_scroll': 'horizontally scrollable',
    'vertical_scroll': 'vertically scrollable',
    'single_view': 'single-view',
    'header_content_footer': 'traditional header-content-footer',
    'columns': 'multi-column',
    'list': 'list-based'
  };

  return descriptions[layoutType] || layoutType;
}

/**
 * 色彩情報のセクションを生成（強化版）
 * @param {Array} colors - 色情報の配列
 * @returns {string} 色彩情報の文字列
 */
function generateEnhancedColorSection(colors = []) {
  console.log("色情報の処理開始:", Array.isArray(colors) ?
    `配列 (${colors.length}項目)` : typeof colors);

  // 色情報が配列でない場合の処理
  if (!Array.isArray(colors)) {
    if (colors && typeof colors === 'object' && colors.colors && Array.isArray(colors.colors)) {
      colors = colors.colors;
    } else {
      return "No color information is available.";
    }
  }

  if (!colors || colors.length === 0) {
    return "No color information is available.";
  }

  const colorDescriptions = colors.map(color => {
    // 色情報の形式を確認して適切に処理
    const rgb = color.rgb || '';
    const hex = color.hex || '';
    const role = color.role ? `${color.role} (${translateColorRole(color.role)})` : 'general use';
    const ratio = typeof color.ratio === 'number' ? color.ratio : 0;
    const percentage = Math.round(ratio * 100);

    return `- ${hex} (${rgb}): ${role}, ${percentage}% of design`;
  }).join('\n');

  return `
The design uses the following color palette:

${colorDescriptions}

These colors should be defined as SCSS variables for consistency throughout the code.`;
}

/**
 * 色の役割の日本語訳を取得
 * @param {string} role - 色の役割
 * @returns {string} 日本語訳
 */
function translateColorRole(role) {
  const translations = {
    'background': '背景色',
    'text': 'テキスト色',
    'accent': 'アクセント色',
    'primary': 'プライマリ色',
    'secondary': 'セカンダリ色'
  };

  return translations[role] || role;
}

/**
 * レイアウト構造のセクションを生成（強化版）
 * @param {Object} layout - レイアウト情報
 * @returns {string} レイアウト構造の文字列
 */
function generateEnhancedLayoutSection(layout = {}) {
  console.log("レイアウト情報の処理開始:", typeof layout === 'object' ?
    Object.keys(layout).join(', ') : typeof layout);

  if (!layout) {
    return "No layout information is available.";
  }

  // レイアウト情報の抽出
  let width = 'unknown';
  let height = 'unknown';
  let layoutType = 'unknown';
  let sectionCount = 0;
  let sectionSummaries = [];
  let gridPattern = {};

  // さまざまなデータ構造に対応
  if (layout.width) width = layout.width;
  if (layout.height) height = layout.height;
  if (layout.type) layoutType = layout.type;
  else if (layout.layoutType) layoutType = layout.layoutType;

  if (typeof layout.sectionCount === 'number') sectionCount = layout.sectionCount;

  // summary形式がある場合
  const summary = layout.summary || layout;
  if (summary.width) width = summary.width;
  if (summary.height) height = summary.height;
  if (summary.sectionCount) sectionCount = summary.sectionCount;
  if (summary.sectionSummaries) sectionSummaries = summary.sectionSummaries;
  if (summary.gridPattern) gridPattern = summary.gridPattern;

  // さらにgridPattern自体もチェック
  if (layout.gridPattern) gridPattern = layout.gridPattern;

  // セクション説明の生成
  let sectionDescriptions = '';
  if (sectionSummaries.length > 0) {
    sectionDescriptions = sectionSummaries.map(section => {
      const typeDescription = getFormattedSectionType(section.type);
      const position = section.position || 'unknown';
      const height = section.height || 'unknown';
      const color = section.color || '';

      return `- ${typeDescription} (${position} position, height: ${height}px)${color ? `, color: ${color}` : ''}`;
    }).join('\n');
  }

  // グリッドパターンの説明
  let gridDescription = '';
  if (gridPattern && gridPattern.type) {
    const columns = gridPattern.columns || 1;
    const rows = gridPattern.rows || 1;

    gridDescription = `
The layout is arranged in a ${gridPattern.type} pattern with ${columns} columns and ${rows} rows.
You should implement this using ${getRecommendedCSSMethod(gridPattern)}.`;
  }

  return `
The design has an overall width of ${width}px and height of ${height}px.
${gridDescription}

The layout consists of the following sections:
${sectionDescriptions || 'No distinct sections detected.'}`;
}

/**
 * テキスト要素のセクションを生成（強化版）
 * @param {Object} text - テキスト情報
 * @returns {string} テキスト要素の文字列
 */
function generateEnhancedTextSection(text = {}) {
  console.log("テキスト情報の処理開始:", typeof text === 'object' ?
    Object.keys(text).join(', ') : typeof text);

  if (!text) {
    return "No text content is available.";
  }

  // テキスト全体コンテンツの取得
  let content = '';
  if (typeof text === 'string') {
    content = text;
  } else if (text.text && typeof text.text === 'string') {
    content = text.text;
  } else if (text.content && typeof text.content === 'string') {
    content = text.content;
  }

  // テキストブロックの取得と処理
  let textBlocks = [];
  if (Array.isArray(text)) {
    // テキスト情報が直接配列として提供された場合
    textBlocks = text;
  } else if (text.blocks && Array.isArray(text.blocks)) {
    textBlocks = text.blocks;
  } else if (text.textBlocks && Array.isArray(text.textBlocks)) {
    textBlocks = text.textBlocks;
  }

  if (textBlocks.length === 0 && !content) {
    return "No text content is available.";
  }

  console.log(`テキストブロック数: ${textBlocks.length}`);

  // 基本的なテキスト概要を作成
  let textSection = '';
  if (content) {
    const truncatedContent = truncateText(content, 150);
    textSection += `The design contains the following text content:\n\n"${truncatedContent}"\n\n`;
  }

  // テキストブロックがある場合は詳細情報を追加
  if (textBlocks.length > 0) {
    // テキストブロックを役割ごとにグループ化
    const groupedBlocks = {};
    textBlocks.forEach(block => {
      // 信頼度でソート用にブロックを拡張
      const confidence = block.confidence || 0;
      const role = determineTextRole(block);

      if (!groupedBlocks[role]) {
        groupedBlocks[role] = [];
      }
      groupedBlocks[role].push({ ...block, role, confidence });
    });

    // 各グループ内で信頼度順にソート
    Object.keys(groupedBlocks).forEach(role => {
      groupedBlocks[role].sort((a, b) => b.confidence - a.confidence);
    });

    // グループごとに最大3つまでのテキストブロックを例として表示
    textSection += "Key text elements by role:\n\n";
    for (const [role, blocks] of Object.entries(groupedBlocks)) {
      const examples = blocks.slice(0, 3).map(block => {
        const text = block.text || '';
        return `"${truncateText(text, 50)}"${block.confidence ? ` (confidence: ${block.confidence.toFixed(2)})` : ''}`;
      }).join(', ');

      textSection += `- ${role.charAt(0).toUpperCase() + role.slice(1)}: ${examples} ${blocks.length > 3 ? `and ${blocks.length - 3} more` : ''}\n`;
    }
  }

  return `
The design contains text elements that should be properly incorporated into the implementation.

${textSection}

Ensure proper text hierarchy and typography in your implementation.`;
}

/**
 * テキストブロックの役割を判定
 * @param {Object} block - テキストブロック
 * @returns {string} 役割の名前
 */
function determineTextRole(block) {
  // すでに役割が定義されている場合はそれを使用
  if (block.role) return block.role;

  const text = block.text || '';
  const position = block.position || {};
  const y = position.y || 0;
  const height = position.height || 0;
  const fontSize = height; // 高さをフォントサイズの近似値として使用

  // 文字の高さや位置に基づいて役割を判定
  if (fontSize > 32 || (text.length < 20 && y < 150)) {
    return 'heading';
  } else if (fontSize > 24 || (text.length < 40 && y < 300)) {
    return 'subheading';
  } else if (text.match(/^[0-9a-zA-Z._%+-]+@[0-9a-zA-Z.-]+\.[a-zA-Z]{2,}$/)) {
    return 'email';
  } else if (text.match(/^(http|https):\/\//)) {
    return 'url';
  } else if (text.match(/^[0-9-+() ]{7,}$/)) {
    return 'phone';
  } else if (text.length > 100) {
    return 'paragraph';
  } else {
    return 'text';
  }
}

/**
 * テキストを指定された長さで切り詰める
 * @param {string} text - 元のテキスト
 * @param {number} maxLength - 最大長
 * @returns {string} 切り詰められたテキスト
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * UI要素のセクションを生成（強化版）
 * @param {Object} elements - UI要素情報
 * @returns {string} UI要素の文字列
 */
function generateEnhancedElementsSection(elements = {}) {
  console.log("UI要素情報の処理開始:", typeof elements === 'object' ?
    Object.keys(elements).join(', ') : typeof elements);

  if (!elements) {
    return "No UI element information is available.";
  }

  const summary = elements.summary || {};
  let elementTypes = [];

  if (Object.keys(summary).length > 0) {
    elementTypes = Object.entries(summary)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');
  } else if (elements.elements && elements.elements.length > 0) {
    // 別の形式の要素オブジェクトを処理
    const typeCounts = {};
    elements.elements.forEach(el => {
      const type = el.type || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    elementTypes = Object.entries(typeCounts)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');
  }

  let mainElementsDesc = '';
  if (elements.mainElements && elements.mainElements.length > 0) {
    mainElementsDesc = elements.mainElements.map(element => {
      const position = element.position || {};
      return `- ${element.type}: positioned at x:${position.x || 0}, y:${position.y || 0}, size ${position.width || 0}x${position.height || 0}px`;
    }).join('\n');
  } else if (elements.elements && elements.elements.length > 0) {
    // 取得可能な要素から上位3つを表示
    mainElementsDesc = elements.elements.slice(0, 3).map(element => {
      const position = element.position || {};
      return `- ${element.type || 'Element'}: positioned at x:${position.x || 0}, y:${position.y || 0}, size ${position.width || 0}x${position.height || 0}px`;
    }).join('\n');
  }

  const count = elements.count || (elements.elements ? elements.elements.length : 0);

  return `
The design contains ${count} UI elements${elementTypes ? `, including ${elementTypes}` : ''}.

Key elements:
${mainElementsDesc || 'No specific key elements were identified.'}`;
}

/**
 * セクションタイプの説明を整形
 * @param {string} sectionType - セクションタイプ
 * @returns {string} フォーマットされたセクションタイプの説明
 */
function getFormattedSectionType(sectionType) {
  // セクションタイプごとの説明
  const typeDescriptions = {
    'hero': 'Hero section',
    'header': 'Header section',
    'footer': 'Footer section',
    'nav': 'Navigation section',
    'card-grid': 'Card grid section',
    'features': 'Features section',
    'about': 'About section',
    'contact': 'Contact form section',
    'testimonials': 'Testimonials section',
    'pricing': 'Pricing section',
    'gallery': 'Gallery section',
    'cta': 'Call-to-action section',
    'faq': 'FAQ section',
    'content': 'Content section'
  };

  return typeDescriptions[sectionType] || `${sectionType ? sectionType.charAt(0).toUpperCase() + sectionType.slice(1) : 'Unknown'} section`;
}

/**
 * グリッドパターンに基づいて推奨CSSメソッドを取得
 * @param {Object} gridPattern - グリッドパターン情報
 * @returns {string} 推奨CSSメソッド
 */
function getRecommendedCSSMethod(gridPattern) {
  const type = gridPattern.type;
  const columns = gridPattern.columns;

  if (type === 'grid' && columns > 1) {
    return 'CSS Grid';
  } else if (type === 'horizontal' || type === 'columns') {
    return 'Flexbox';
  } else if (type === 'header_content_footer') {
    return 'a combination of CSS Grid for the overall layout';
  } else {
    return 'appropriate CSS layout techniques';
  }
}

/**
 * デザインの意図を推論する（強化版）
 * @param {Object} compressedData - 圧縮された解析データ
 * @returns {string} デザイン意図の推論文
 */
function inferEnhancedDesignIntent(compressedData) {
  // 色彩
  const colors = compressedData.colors || [];
  const hasLightBackground = colors.length > 0 && isLightColor(colors[0].rgb);

  // レイアウト
  const layout = compressedData.layout || {};
  const layoutType = layout.type || layout.layoutType || '';

  // セクション情報を取得
  const sections = compressedData.sections || compressedData.layout?.sections || {};
  const sectionItems = sections.items || [];

  // セクションタイプをカウント
  const sectionTypes = {};
  sectionItems.forEach(section => {
    const type = section.type || 'unknown';
    sectionTypes[type] = (sectionTypes[type] || 0) + 1;
  });

  // 特定のセクションの存在を確認
  const hasHero = sectionTypes['hero'] > 0;
  const hasFeatures = sectionTypes['features'] > 0;
  const hasTestimonials = sectionTypes['testimonials'] > 0;
  const hasPricing = sectionTypes['pricing'] > 0;
  const hasContact = sectionTypes['contact'] > 0;
  const hasCta = sectionTypes['cta'] > 0;

  // 要素
  const elements = compressedData.elements || {};
  const elementSummary = elements.summary || {};
  const hasButtons = elementSummary['button'] > 0 || (elements.elements || []).some(el => el.type === 'button');
  const hasInputs = elementSummary['text_input'] > 0 || (elements.elements || []).some(el => el.type === 'input');
  const hasCards = elementSummary['card'] > 0 || (elements.elements || []).some(el => el.type === 'card');

  // デザイン目的の推論
  let purpose = '';
  if (hasContact || hasInputs) {
    purpose = 'user input collection';
  } else if (hasCta || (hasButtons && !hasInputs)) {
    purpose = 'call-to-action';
  } else if (hasPricing || hasFeatures) {
    purpose = 'product or service presentation';
  } else if (hasTestimonials) {
    purpose = 'building trust and credibility';
  } else if (hasCards) {
    purpose = 'content discovery';
  } else {
    purpose = 'information presentation';
  }

  // デザインスタイルの推論
  let style = '';
  if (hasLightBackground) {
    style = 'clean, minimalist';
  } else {
    style = 'bold, contrasting';
  }

  // ウェブサイトタイプの推論
  let websiteType = inferWebsiteType(sectionTypes, elementSummary);

  return `
Based on the analysis, this design appears to be for a ${websiteType} website focused on ${purpose} with a ${style} aesthetic.
The layout is designed to guide the user's attention ${getAttentionFlow(layoutType)} through the content.
${hasHero ? 'The hero section at the top establishes the main value proposition.' : ''}
${hasFeatures ? 'The features section highlights key benefits or services.' : ''}
${hasTestimonials ? 'Testimonials are used to build credibility and trust.' : ''}
${hasCta ? 'Call-to-action elements encourage user engagement and conversion.' : ''}
${hasContact ? 'The contact section facilitates direct communication with users.' : ''}

When implementing this design, focus on maintaining the visual hierarchy and ensuring that the ${purpose} aspects are emphasized.`;
}

/**
 * レイアウトタイプに基づいた注目誘導フローを取得
 * @param {string} layoutType - レイアウトタイプ
 * @returns {string} 注目誘導フローの説明
 */
function getAttentionFlow(layoutType) {
  switch (layoutType) {
    case 'vertical_scroll':
      return 'from top to bottom';
    case 'horizontal_scroll':
      return 'from left to right';
    case 'grid':
      return 'across different grid areas';
    case 'header_content_footer':
      return 'from the header through the main content to the footer';
    default:
      return 'naturally';
  }
}

/**
 * 色が明るいかどうかを判定
 * @param {string} rgbString - RGB文字列（例: 'rgb(255,255,255)'）
 * @returns {boolean} 明るい色の場合true
 */
function isLightColor(rgbString) {
  if (!rgbString || typeof rgbString !== 'string') {
    return true;
  }

  // RGB文字列から値を抽出
  const match = rgbString.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!match) {
    return true;
  }

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);

  // 輝度の計算（YIQ方式）
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

  // 輝度が128以上なら明るい色と判定
  return yiq >= 128;
}

/**
 * ウェブサイトのタイプを推論
 * @param {Object} sectionTypes - セクションタイプのカウント
 * @param {Object} elementSummary - 要素タイプのカウント
 * @returns {string} 推論されたウェブサイトタイプ
 */
function inferWebsiteType(sectionTypes, elementSummary) {
  // eコマースサイトの特徴
  if (sectionTypes['pricing'] > 0 || elementSummary['product_card'] > 0) {
    return 'e-commerce';
  }

  // ポートフォリオサイトの特徴
  if (sectionTypes['gallery'] > 0 || sectionTypes['portfolio'] > 0) {
    return 'portfolio';
  }

  // LPの特徴
  if (sectionTypes['hero'] > 0 && sectionTypes['cta'] > 0 && Object.keys(sectionTypes).length < 5) {
    return 'landing page';
  }

  // コーポレートサイトの特徴
  if (sectionTypes['about'] > 0 || sectionTypes['team'] > 0) {
    return 'corporate';
  }

  // ブログの特徴
  if (elementSummary['article'] > 0 || sectionTypes['blog'] > 0) {
    return 'blog';
  }

  // SaaSの特徴
  if (sectionTypes['features'] > 0 && sectionTypes['pricing'] > 0) {
    return 'SaaS';
  }

  // デフォルト
  return 'business';
}

/**
 * rawDataに基づいてより良いプロンプトを構築する
 * @param {Object} rawData - Python APIから返される生データ
 * @returns {string|null} 構築されたプロンプト、または処理できなかった場合はnull
 */
const buildBetterPrompt = (rawData) => {
  try {
    if (!rawData) {
      return null;
    }

    // 生データを標準化された形式に変換
    const compressedData = normalizeAnalysisData(rawData);

    if (!compressedData) {
      return null;
    }

    // データのキーを詳細に確認
    const hasColors = compressedData.colors && Array.isArray(compressedData.colors) && compressedData.colors.length > 0;
    const hasText = (compressedData.text && typeof compressedData.text === 'object' &&
      (compressedData.text.content ||
        (compressedData.text.blocks && compressedData.text.blocks.length > 0)));
    const hasLayout = compressedData.layout && typeof compressedData.layout === 'object';
    const hasElements = compressedData.elements &&
      ((Array.isArray(compressedData.elements) && compressedData.elements.length > 0) ||
        (compressedData.elements.elements && Array.isArray(compressedData.elements.elements)));

    // セマンティックなタグの生成
    const semanticTags = generateSemanticTags(compressedData);

    // テンプレート形式の取得
    const templateFormat = generateTemplateFormat(compressedData);

    // デザインの意図の推論
    const designIntent = inferEnhancedDesignIntent(compressedData);

    // 各セクションの生成（データがない場合はデフォルトのガイドラインを使用）
    const overviewSection = generateEnhancedOverviewSection(compressedData);
    const colorSection = hasColors ?
      generateEnhancedColorSection(compressedData.colors) :
      "Use a simple color palette with primary and accent colors that suit the website's purpose.";

    const layoutSection = hasLayout ?
      generateEnhancedLayoutSection(compressedData.layout) :
      "Create a clean, responsive layout with a clear visual hierarchy.";

    const textSection = hasText ?
      generateEnhancedTextSection(compressedData.text) :
      "Use clear typography with appropriate heading hierarchy and readable body text.";

    const elementsSection = hasElements ?
      generateEnhancedElementsSection(compressedData.elements) :
      "Include essential UI elements like navigation, buttons, and content containers.";

    const prompt = `# Website Design Implementation Task

## Overview
${overviewSection}

## Design Intent Analysis
${designIntent}

## Design Details

### Colors
${colorSection}

### Layout
${layoutSection}

### Typography and Text
${textSection}

### UI Elements
${elementsSection}

## Implementation Guidelines
- Use semantic HTML tags like ${semanticTags}.
- Implement a responsive design that works well on all screen sizes.
- Apply modern CSS techniques like ${templateFormat}.
- Ensure all interactive elements have appropriate hover and focus states.
- Follow accessibility best practices (WCAG 2.1 AA compliance).

## Final Instructions
- Create clean, maintainable code with proper comments.
- Optimize all images for web performance.
- Ensure smooth animations and transitions where appropriate.
- Test thoroughly across different browsers and devices.`;

    return prompt;
  } catch (error) {
    return null;
  }
}

/**
 * デザイン意図を分析して生成
 * @param {Object} data - 正規化された分析データ
 * @returns {string} デザイン意図の文章
 */
const analyzeDesignIntent = (data) => {
  try {
    const designTraits = [];

    // 色彩分析によるデザイン意図
    if (data.colors && data.colors.length > 0) {
      // 色の数からデザインスタイルを推測
      if (data.colors.length <= 2) {
        designTraits.push("ミニマリスト");
      } else if (data.colors.length >= 5) {
        designTraits.push("カラフル");
      }

      // 色相に基づく分析
      const hasWarmColors = data.colors.some(c =>
        c.hex && (c.hex.startsWith('#f') || c.hex.startsWith('#e') || c.hex.startsWith('#d')));
      const hasCoolColors = data.colors.some(c =>
        c.hex && (c.hex.startsWith('#0') || c.hex.startsWith('#1') || c.hex.startsWith('#2')));

      if (hasWarmColors && !hasCoolColors) {
        designTraits.push("温かみのある");
      } else if (hasCoolColors && !hasWarmColors) {
        designTraits.push("クールな");
      } else if (hasWarmColors && hasCoolColors) {
        designTraits.push("コントラストのある");
      }
    }

    // レイアウト分析によるデザイン意図
    if (data.layout) {
      if (data.layout.type === "grid") {
        designTraits.push("整然とした");
      } else if (data.layout.type === "asymmetric") {
        designTraits.push("動的な");
      }

      if (data.layout.whitespace === "abundant") {
        designTraits.push("余白を重視した");
      } else if (data.layout.whitespace === "dense") {
        designTraits.push("情報密度の高い");
      }
    }

    // 要素分析によるデザイン意図
    if (data.elements) {
      if (data.elements.buttons && data.elements.buttons.some(b => b.style === "rounded")) {
        designTraits.push("柔らかい印象の");
      }

      if (data.elements.images && data.elements.images.length > 3) {
        designTraits.push("ビジュアル重視の");
      }
    }

    // タイポグラフィ分析
    if (data.typography) {
      if (data.typography.fontFamily && data.typography.fontFamily.includes("sans-serif")) {
        designTraits.push("モダンな");
      } else if (data.typography.fontFamily && data.typography.fontFamily.includes("serif")) {
        designTraits.push("伝統的な");
      }
    }

    // デザイン意図がない場合はデフォルト値を設定
    if (designTraits.length === 0) {
      designTraits.push("クリーンでモダンな", "ユーザーフレンドリーな");
    }

    // 重複を削除し、最大4つの特性を選択
    const uniqueTraits = [...new Set(designTraits)].slice(0, 4);
    return `${uniqueTraits.join("、")}デザイン`;
  } catch (error) {
    console.error("デザイン意図分析エラー:", error);
    return "クリーンでモダンなデザイン";
  }
};

/**
 * デザインシステムの推奨事項を生成
 * @param {Object} data - 正規化された分析データ
 * @returns {string} デザインシステム推奨事項
 */
const suggestDesignSystem = (data) => {
  try {
    const recommendations = [];

    // カラーパレット推奨
    if (data.colors && data.colors.length > 0) {
      const colorCount = Math.min(data.colors.length, 5);
      recommendations.push(`${colorCount}色の基本カラーパレット（プライマリ、セカンダリ、アクセント）`);

      if (data.colors.length > 5) {
        recommendations.push("複数の明度バリエーション");
      }
    } else {
      recommendations.push("4色の基本カラーパレット");
    }

    // タイポグラフィ推奨
    if (data.typography) {
      const fontType = data.typography.fontFamily && data.typography.fontFamily.includes("serif")
        ? "セリフ体とサンセリフ体の組み合わせ"
        : "サンセリフ体2種のファミリー";
      recommendations.push(fontType);
      recommendations.push("5段階のタイポグラフィスケール（見出し3種、本文2種）");
    } else {
      recommendations.push("サンセリフ体のタイポグラフィシステム");
    }

    // スペーシングシステム推奨
    if (data.layout) {
      if (data.layout.whitespace === "abundant") {
        recommendations.push("8pxを基準とした余白の広いスペーシングスケール");
      } else if (data.layout.whitespace === "dense") {
        recommendations.push("4pxを基準としたコンパクトなスペーシングスケール");
      } else {
        recommendations.push("8pxを基準としたスペーシングスケール");
      }
    } else {
      recommendations.push("8pxを基準としたスペーシングスケール");
    }

    // コンポーネント推奨
    const componentSuggestions = ["ボタン（プライマリ、セカンダリ、テキスト）", "フォーム要素", "カード"];

    if (data.elements) {
      if (data.elements.forms && data.elements.forms.length > 0) {
        componentSuggestions.push("入力フィールドバリエーション");
      }

      if (data.elements.buttons && data.elements.buttons.length > 0) {
        componentSuggestions.push("ボタンステートシステム");
      }

      if (data.elements.images && data.elements.images.length > 0) {
        componentSuggestions.push("画像表示コンポーネント");
      }
    }

    recommendations.push(`基本コンポーネント：${componentSuggestions.slice(0, 4).join("、")}`);

    return recommendations.join("、");
  } catch (error) {
    console.error("デザインシステム推奨エラー:", error);
    return "4色カラーパレット、サンセリフ体タイポグラフィ、8pxベースのスペーシングシステム、基本コンポーネント一式";
  }
};
