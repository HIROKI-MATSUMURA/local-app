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
        return `@include mq-down(md) {\n    ${cssContent.replace(/\n/g, '\n    ')}\n  }`;
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
        `// Always place media queries inside selectors
.selector {
  // ${approach === "mobile-first" ? "Mobile" : "Desktop"} base styles

  @include mq(${breakpointName}) {
    // ${approach === "mobile-first" ? "Desktop" : "Mobile"} specific styles
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

      // Overall layout strategy
      const layoutStrategy = isMobileFirst ?
        `Using a mobile-first approach, start with a stacked layout and expand to a ${analysis.gridSystem?.detected ? `${analysis.gridSystem.columns}-column` : ''} grid layout for larger screens.` :
        `Using a desktop-first approach, start with a ${analysis.gridSystem?.detected ? `${analysis.gridSystem.columns}-column` : ''} grid layout and reduce to a stacked layout for smaller screens.`;

      return {
        strategy: layoutStrategy,
        examples: {
          grid: gridRecommendation,
          alignment: alignmentRecommendation,
          spacing: spacingRecommendation
        }
      };
    },

    /**
     * Build layout analysis section
     * @param {Object} analysis - Layout analysis data
     * @param {Object} options - Additional options
     * @returns {string} Layout analysis section
     */
    buildLayoutSection(analysis, options = {}) {
      if (!analysis) {
        console.log("No layout data provided for section building");
        return "";
      }

      // Add debug logs to check layout data
      console.log("Layout data for section building:", analysis);
      console.log("Layout data hasLayout:", analysis.hasLayout);

      // Safety check for layout data
      if (!analysis.hasLayout && !analysis.gridSystem && !analysis.componentDetection) {
        console.log("Layout data appears invalid, adding minimal content");
        return "\n### Layout Analysis\n\nLayout uses a standard grid system.\n";
      }

      let section = "\n### Layout Analysis\n\n";

      // Grid system information
      if (analysis.gridSystem && analysis.gridSystem.detected) {
        section += `#### Grid System\n`;
        section += `- **Columns**: ${analysis.gridSystem.columns}\n`;
        section += `- **Horizontal Gap**: ${analysis.gridSystem.gaps.horizontal}px\n`;
        section += `- **Vertical Gap**: ${analysis.gridSystem.gaps.vertical}px\n\n`;
      }

      // Alignment patterns
      if (analysis.alignmentPatterns && analysis.alignmentPatterns.detected) {
        section += `#### Alignment Patterns\n`;
        section += `- **Dominant Alignment**: ${analysis.alignmentPatterns.dominantAlignment === 'left' ? 'Left aligned' : analysis.alignmentPatterns.dominantAlignment === 'right' ? 'Right aligned' : 'Center aligned'}\n`;
        if (analysis.alignmentPatterns.symmetrical) {
          section += `- **Symmetry**: Symmetrical layout\n\n`;
        } else {
          section += `- **Symmetry**: Asymmetrical layout\n\n`;
        }
      }

      // Spacing patterns
      if (analysis.spacingPatterns && analysis.spacingPatterns.detected) {
        section += `#### Spacing Patterns\n`;
        if (analysis.spacingPatterns.horizontal && analysis.spacingPatterns.horizontal.length > 0) {
          section += `- **Horizontal Spacing**: ${analysis.spacingPatterns.horizontal.map(p => `${p.value}px (${Math.round(p.frequency * 100)}%)`).join(', ')}\n`;
        }
        if (analysis.spacingPatterns.vertical && analysis.spacingPatterns.vertical.length > 0) {
          section += `- **Vertical Spacing**: ${analysis.spacingPatterns.vertical.map(p => `${p.value}px (${Math.round(p.frequency * 100)}%)`).join(', ')}\n`;
        }
        section += '\n';
      }

      // Aspect ratios
      if (analysis.aspectRatios && analysis.aspectRatios.detected) {
        section += `#### Aspect Ratios\n`;
        analysis.aspectRatios.ratios.forEach(ratio => {
          section += `- **${ratio.name}**: ${ratio.ratio}${ratio.isCommon ? ` (${ratio.isCommon})` : ''}\n`;
        });
        section += '\n';
      }

      // Layout recommendations
      if (analysis.recommendations) {
        section += `#### Layout Implementation Guide\n`;
        section += `${analysis.recommendations.strategy}\n\n`;

        if (analysis.recommendations.examples && analysis.recommendations.examples.grid) {
          section += `**Grid Layout**\n`;
          section += "```scss\n" + analysis.recommendations.examples.grid + "\n```\n\n";
        }

        if (analysis.recommendations.examples && analysis.recommendations.examples.alignment) {
          section += `**Alignment Patterns**\n`;
          section += "```scss\n" + analysis.recommendations.examples.alignment + "\n```\n\n";
        }

        if (analysis.recommendations.examples && analysis.recommendations.examples.spacing) {
          section += `**Consistent Spacing**\n`;
          section += "```scss\n" + analysis.recommendations.examples.spacing + "\n```\n\n";
        }
      }

      // Add text analysis if provided
      if (analysis.text) {
        const textData = analysis.text;

        if (textData.hasText) {
          section += textData.buildTextSection ? textData.buildTextSection(textData, {
            breakpoint: options.breakpoint || 768
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
              scss += `  @include mq-down(md) {\n`;
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
              scss += `  @include mq-down(md) {\n`;
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
              scss += `  @include mq-down(md) {\n`;
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
              scss += `  @include mq-down(md) {\n`;
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
            scss += `  @include mq-down(md) {\n`;
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
            scss += `  @include mq-down(md) {\n`;
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

  @include mq-down(md) {
    font-size: 16px;
  }
}

.p-section__text {
  font-size: 16px;
  line-height: 1.6;
  margin-top: 15px;

  @include mq-down(md) {
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

// フォールバックプロンプトの構築（エラー時や拡張プロンプト生成失敗時に使用）
const buildFallbackPrompt = (pcData, spData, settings, responsiveMode, aiBreakpoints) => {
  console.log("フォールバックプロンプト生成を開始");

  // 基本プロンプト
  let prompt = `
# ウェブサイトデザイン実装タスク

## 分析結果
`;

  // 1. 基本的な分析結果
  prompt += buildAnalysisSection(pcData, spData);

  // 2. 設定情報
  prompt += buildSettingsSection(settings, pcData.colors, spData.colors);

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
        ? '- モバイルファーストの場合: @include mq(md) { ... } を使用してデスクトップスタイルを記述'
        : '- デスクトップファーストの場合: @include mq-down(md) { ... } を使用してモバイルスタイルを記述'}
`;
  }

  // 6. 出力形式
  if (!prompt.includes("出力形式")) {
    prompt += `
## 出力形式
- 最初にHTML、次にSCSSを提供してください
- 両方のコードを適切にフォーマットし、整理してください
- 主要なセクションにはコメントを含めてください
`;
  }

  // 7. 最終指示
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
    console.log("拡張プロンプト構築開始:", typeof rawData);
    if (!rawData) {
      console.warn("buildBetterPrompt: データが提供されていません");
      return null;
    }

    // 解析データの集約
    const analysisResults = {};

    // 色彩分析結果の取得
    if (rawData.enhancedColors) {
      analysisResults.colors = rawData.enhancedColors;
    } else if (rawData.colors && Array.isArray(rawData.colors)) {
      // 必要に応じて色彩分析を実行
      analysisResults.colors = AnalysisModules.color.analyzeColors(rawData.colors);
    }

    // レイアウト分析結果の取得
    if (rawData.enhancedLayout) {
      analysisResults.layout = rawData.enhancedLayout;
    } else if (rawData.elements && rawData.elements.elements) {
      // 必要に応じてレイアウト分析を実行
      analysisResults.layout = AnalysisModules.layout.analyzeLayout(rawData, {
        responsiveMode: rawData.responsiveMode || 'pc',
        aiBreakpoints: rawData.aiBreakpoints || []
      });
    }

    // テキスト分析結果の取得
    if (rawData.enhancedText) {
      analysisResults.text = rawData.enhancedText;
    } else if (rawData.textBlocks && Array.isArray(rawData.textBlocks)) {
      // 必要に応じてテキスト分析を実行
      analysisResults.text = AnalysisModules.text.analyzeText(rawData, {
        responsiveMode: rawData.responsiveMode || 'pc',
        breakpoint: AnalysisModules.breakpoints.getMdValue({
          aiBreakpoints: rawData.aiBreakpoints || []
        })
      });
    }

    // 色彩分析部分の構築
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
          : ''}
`;
    }

    // レイアウト分析部分の構築
    let layoutSection = "No layout information available.";
    if (analysisResults.layout) {
      const layoutData = analysisResults.layout;

      // レイアウトモジュールのbuildLayoutSection関数を使用（存在する場合）
      if (layoutData.buildLayoutSection) {
        layoutSection = layoutData.buildLayoutSection(layoutData, {
          responsiveMode: rawData.responsiveMode || 'pc',
          breakpoint: AnalysisModules.breakpoints.getMdValue({
            aiBreakpoints: rawData.aiBreakpoints || []
          })
        });
      } else {
        // 基本的なコンポーネント情報を構築
        let componentsText = "";
        if (layoutData.componentDetection && layoutData.componentDetection.components) {
          componentsText = `
The design includes the following components:
${layoutData.componentDetection.components.map(c => `- ${c.type}`).join('\n')}
`;
        }

        // グリッドシステム情報
        let gridText = "";
        if (layoutData.grid) {
          gridText = `
Grid system: ${layoutData.grid.columns} columns
${layoutData.grid.recommendations ? layoutData.grid.recommendations : ''}
`;
        }

        // 余白システム情報
        let spacingText = "";
        if (layoutData.spacingSystem) {
          spacingText = `
Spacing system: Uses a base unit of ${layoutData.spacingSystem.baseUnit}px
`;
        }

        layoutSection = `${componentsText}\n${gridText}\n${spacingText}`.trim();
      }
    }

    // テキスト分析部分の構築
    let textSection = "No typography information available.";
    if (analysisResults.text && analysisResults.text.hasText) {
      // テキストモジュールのbuildTextSection関数を使用
      if (analysisResults.text.buildTextSection) {
        textSection = analysisResults.text.buildTextSection(analysisResults.text, {
          breakpoint: AnalysisModules.breakpoints.getMdValue({
            aiBreakpoints: rawData.aiBreakpoints || []
          })
        });
      } else {
        // 基本的なテキスト情報のみを使用
        const textData = analysisResults.text;
        textSection = `
### Typography Analysis
- Base font size: ${textData.fontProperties?.baseFontSize || 16}px
- Heading sizes: ${textData.fontProperties?.headingSizes?.primary || 32}px / ${textData.fontProperties?.headingSizes?.secondary || 24}px
- Body text: ${textData.fontProperties?.bodySizes?.primary || 16}px
`;
      }
    }

    // レスポンシブ戦略の構築
    const responsiveMode = rawData.responsiveMode || 'pc';
    const mdBreakpoint = AnalysisModules.breakpoints.getMdValue({
      aiBreakpoints: rawData.aiBreakpoints || []
    });

    let responsiveSection = `
### Responsive Strategy
- Approach: ${responsiveMode === 'sp' ? 'Mobile-first' : responsiveMode === 'pc' ? 'Desktop-first' : 'Both mobile and desktop'}
- Breakpoint: ${mdBreakpoint}px
- Media Query Usage:
  ${responsiveMode === 'sp'
        ? '- Use `@include mq(md)` for desktop styles'
        : '- Use `@include mq-down(md)` for mobile styles'}
`;

    // 最終プロンプトを構築
    const prompt = `# ウェブサイトデザイン実装タスク

## 概要
デザインを分析し、クリーンで応答性の高いHTMLとSCSSを実装してください。

## デザイン分析結果

### 色彩分析
${colorSection}

### レイアウト分析
${layoutSection}

${textSection}

${responsiveSection}

## 実装ガイドライン
- セマンティックなHTML5とクリーンなSCSSを使用してください。
- BEM手法に従ったクラス命名規則を適用してください。
- FLOCSSの構造に基づいたSCSSファイル構成を使用してください。
- ネスト構造を使わないフラットなセレクタ形式でSCSSを記述してください（&記号の使用禁止）。
- メディアクエリは@include mqを使用して各セレクタ内に記述してください。
- レスポンシブデザインを念頭に置き、すべてのデバイスサイズで適切に動作するよう設計してください。
- 間隔、配置、タイポグラフィを適切に設定してください。
- 必要なホバー状態とトランジションを含めてください。

## 出力形式
- 最初にHTML、次にSCSSを提供してください。
- 両方のコードを適切にフォーマットし、整理してください。
- 主要なセクションにはコメントを含めてください。`;

    console.log("拡張プロンプト構築完了: 文字数=" + prompt.length);
    return prompt;
  } catch (error) {
    console.error("拡張プロンプト構築エラー:", error);
    return null;
  }
};

/**
 * 基本的な分析セクションを構築する
 * @param {Object} pcData - PC画像の分析データ
 * @param {Object} spData - SP画像の分析データ
 * @returns {string} 分析セクションの文字列
 */
const buildAnalysisSection = (pcData, spData) => {
  let section = `\n### 分析結果\n`;

  // 色彩分析の追加
  if (pcData.enhancedColors || spData.enhancedColors) {
    const colorData = pcData.enhancedColors || spData.enhancedColors;
    section += `\n#### 色彩分析\n`;

    if (colorData.primary) {
      section += `- プライマリカラー: ${colorData.primary.hex}\n`;
    }
    if (colorData.secondary) {
      section += `- セカンダリカラー: ${colorData.secondary.hex}\n`;
    }
    if (colorData.accent) {
      section += `- アクセントカラー: ${colorData.accent.hex}\n`;
    }

    // パレット情報の追加
    if (colorData.palette && colorData.palette.length > 0) {
      section += `- カラーパレット: ${colorData.palette.map(c => c.hex).join(', ')}\n`;
    }
  }

  // レイアウト分析の追加
  if (pcData.enhancedLayout || spData.enhancedLayout) {
    const layoutData = pcData.enhancedLayout || spData.enhancedLayout;
    section += `\n#### レイアウト分析\n`;

    if (layoutData.componentDetection && layoutData.componentDetection.components) {
      const components = layoutData.componentDetection.components;
      section += `- 検出コンポーネント: ${components.map(c => c.type).join(', ')}\n`;
    }

    if (layoutData.grid) {
      section += `- グリッドシステム: ${layoutData.grid.columns} カラム\n`;
    }

    if (layoutData.spacingSystem) {
      section += `- 余白設計: 基本単位 ${layoutData.spacingSystem.baseUnit}px\n`;
    }
  }

  // テキスト分析の追加
  if (pcData.enhancedText || spData.enhancedText) {
    const textData = pcData.enhancedText || spData.enhancedText;

    if (textData.hasText) {
      section += textData.buildTextSection ? textData.buildTextSection(textData, {
        breakpoint: AnalysisModules.breakpoints.getMdValue()
      }) : '\n#### テキスト分析\nテキスト分析データは利用可能ですが、フォーマットできませんでした。';
    }
  }

  return section;
};

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

  let section = `\n### プロジェクト設定\n`;

  // ブレークポイント情報
  if (settings.breakpoints) {
    section += `\n#### ブレークポイント\n`;
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

  // CSS変数の取得と色情報との照合
  const colorVariables = {};

  if (settings.cssVariables && typeof settings.cssVariables === 'object') {
    // CSS変数からカラー変数を抽出
    Object.entries(settings.cssVariables).forEach(([key, value]) => {
      // カラーコードを表す正規表現パターン
      const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

      if (typeof value === 'string' && hexPattern.test(value)) {
        colorVariables[key] = {
          name: key,
          hex: value.toLowerCase()
        };
      }
    });

    // 分析で検出された色とCSS変数内の色を照合
    const detectedColors = [];
    if (pcColors && Array.isArray(pcColors)) {
      detectedColors.push(...pcColors.map(c => ({ ...c, source: 'pc' })));
    }
    if (spColors && Array.isArray(spColors)) {
      detectedColors.push(...spColors.map(c => ({ ...c, source: 'sp' })));
    }

    // 色の照合（近い色のある変数を検出）
    const matchedColors = [];
    detectedColors.forEach(color => {
      if (!color.hex) return;

      // 最も近いCSS変数の色を探す
      let closestVariable = null;
      let closestDistance = 30; // 閾値（この値以下なら類似と判断）

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
      section += `\n#### カラー変数マッピング\n`;
      section += `以下のカラー変数を使用して実装してください。検出された色が変数と一致しています：\n`;

      matchedColors.forEach(match => {
        section += `- ${match.detectedColor.source === 'pc' ? '[PC]' : '[SP]'} 検出色: ${match.detectedColor.hex} → CSS変数: ${match.cssVariable.name} (${match.cssVariable.hex})\n`;
      });
    }
  }

  // プロジェクトのカラー設定（変数マッピングがない場合）
  if (settings.colors && Object.keys(settings.colors).length > 0 && Object.keys(colorVariables).length === 0) {
    section += `\n#### プロジェクトカラー\n`;
    Object.entries(settings.colors).forEach(([name, value]) => {
      section += `- ${name}: ${value}\n`;
    });
  }

  // リセットCSSの設定
  if (settings.resetCSS) {
    section += `\n#### リセットCSS\n`;
    section += `- 使用リセット: ${settings.resetCSS}\n`;
  }

  // フォント設定
  if (settings.fonts) {
    section += `\n#### フォント設定\n`;
    if (settings.fonts.heading) {
      section += `- 見出し: ${settings.fonts.heading}\n`;
    }
    if (settings.fonts.body) {
      section += `- 本文: ${settings.fonts.body}\n`;
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
  // mdブレークポイント値を取得
  const mdBreakpoint = AnalysisModules.breakpoints.getMdValue(options);

  return `
## コーディングガイドライン

プロフェッショナルなフロントエンド開発者としてSCSSとHTMLを使用してください。

### 重要要件:
- **❗❗最も重要: デザインカンプを忠実に再現する❗❗** - レイアウト、間隔、サイズ、視覚的な詳細を正確に一致させる
- **提出前に出力と提供された画像を比較する** - デザインの詳細に正確に合わせるよう調整
- **画像に表示されている要素だけをコーディングする** - 想定や追加要素は不要
- **デザインに忠実である** - 色、間隔、レイアウトを正確に
- **FLOCSS手法**を使用する
- **❗常にCSS GRIDレイアウトを使用する❗** - Gridでは絶対に不可能な場合を除き、**決して**Flexboxを使用しない
- コンテナ要素を作成しない（外側の要素の幅を固定しない）
- **SCSSのネスティングなし** - フラットなSCSS構造を書く
- **すべての画像のアスペクト比を維持する** - aspect-ratioプロパティなどのモダンなCSS技術を使用
- **固定幅の値を避ける** - パーセンテージ、max-width、または相対単位を使用
- **高さプロパティの使用を最小限に抑える** - デザイン上絶対に必要な場合のみ
- **画像実装の最適化**:
  - レイアウトシフトを防ぐために、img タグには常に width と height 属性を含める
  - 適切な遅延読み込みを実装する: フォールド以下の画像には \`loading="lazy"\` を使用
  - コンテンツタイプに基づいて適切な画像形式を使用（写真はJPEG、透明のあるグラフィックはPNG、可能な場合はWebP）
  - 背景画像に対しては、異なるブレークポイントでのサイズ調整のためにメディアクエリを使用

### HTMLガイドライン:
- セマンティックでアクセシブルなHTMLを作成
- 各ブロックにクラス名を追加
- 子要素は要素表記を使用すべき
- FLOCSSの適切な命名規則を使用
- **見出しタグはh2から始める** - コンポーネントではh1タグを使用しない
- **<a>タグにコンポーネントクラスを直接使用する** - c-buttonなどのコンポーネントクラスを<a>タグに直接適用し、不要なdivラッパーを作成しない
- **正しいボタン例**: \`<div class="p-hoge__button"><a href="#" class="c-button">詳細を見る →</a></div>\`
- **間違ったボタン例**: \`<div class="p-hoge__button"><div class="c-button"><a href="#" class="c-button__link">詳細を見る →</a></div></div>\`
- **<header>や<main>タグを使用しない** - 代わりに適切なクラスを持つdivを使用
- デザインを分析し、デザイン機能を反映した**具体的で説明的なクラス名**を割り当てる
- **アクセシビリティの考慮事項**:
  - インタラクティブ要素に適切なARIA属性を使用
  - 十分な色のコントラスト（通常のテキストの場合、最低4.5:1）を確保
  - **すべての画像に日本語のalt属性を追加**:
    - 説明的な日本語テキストを使用（例: alt="企業ロゴ"ではなく、alt="株式会社〇〇のロゴ"）
    - 装飾的な画像には空のalt属性を使用（alt=""）
    - 説明を簡潔に保つ（5〜15文字程度）
    - alt属性が画像の目的を伝えているか確認
  - インタラクティブ要素のキーボードナビゲーションが機能することを確認

### FLOCSSコンポーネント構造ガイドライン:
- **Project (p-)**:　ページ/レイアウト特有のコンポーネント
  - 例: \`.p-hero\`, \`.p-footer\`, \`.p-news-section\`
  - ページの大きな特徴的なセクションに使用

- **Layout (l-)**: 構造とグリッドコンポーネント
  - 例: \`.l-container\`, \`.l-grid\`, \`.l-row\`
  - コンテンツを整理するレイアウト構造に使用

- **Component (c-)**: 再利用可能なUI要素
  - 例: \`.c-button\`, \`.c-card\`, \`.c-form\`
  - 複数のコンテキストで表示される独立した再利用可能な要素

- **Utility (u-)**: 単一目的のユーティリティクラス
  - 例: \`.u-text-center\`, \`.u-margin-top\`
  - 通常、1つの特定のプロパティを変更する

### SCSSガイドライン:
- ${responsiveMode === "both" ? "レスポンシブアプローチに従う" : `${responsiveMode === "pc" ? "デスクトップファースト" : "モバイルファースト"}アプローチに従う`}
- **❗❗重要: メディアクエリはセレクタ内に配置する必要があり、*唯一許可されているネスティング*です❗❗** - このように:
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

- **❌ &記号を使用したSCSSのネスティングを使用しない** - 以下は行ってはいけないこと:
\`\`\`scss
// これは間違い - 絶対にしないでください
.p-hoge {
  background-color: #e9f5f9;

  &__title {  // 間違い - &__を使用しない
    font-size: 2rem;
  }

  &__content {  // 間違い - &__を使用しない
    display: grid;
  }
}
\`\`\`

- **✅ 正しい方法 - フラットなセレクタを使用する** - 常にこのように書く:
\`\`\`scss
// これが正しい - 常にこのようにする
.p-hoge {
  background-color: #e9f5f9;
}

.p-hoge__title {  // 正しい - フラットなセレクタ
  font-size: 2rem;
}

.p-hoge__content {  // 正しい - フラットなセレクタ
  display: grid;
}
\`\`\`

- **❌ メディアクエリを次のように書かない** (間違い！やらないで！):
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

### パフォーマンス最適化ガイドライン:
- パフォーマンスが重要なアニメーションにはモダンなCSSプロパティ（will-change、containなど）を使用
- レンダリングの複雑さを減らすために不要なDOMのネスティングを避ける
- CSS Gridを効率的に使用して読み込み中のレイアウトシフトを最小限に抑える
- フォールド以下の画像にはloading="lazy"属性を使用した遅延読み込みを検討
- レイアウトシフトを減らすためにシステムフォントや最適化されたウェブフォントを優先

### アニメーションと遷移ガイドライン:
- **アニメーションは控えめで目的を持ったものにする**:
  - ホバー/フォーカス状態には遷移を使用（常に0.3秒の持続時間を使用）
  - 幅、高さ、位置よりもtransformとopacityの変更を優先
  - アニメーションのアクセシビリティを考慮
  \`\`\`
  // 適切なアニメーションの例:
  .c-button {
    transition: transform 0.3s ease, opacity 0.3s ease;
  }

  .c-button:hover {  // 正しい: ホバー状態用のフラットなセレクタ
    transform: translateY(-2px);
    opacity: 0.9;
  }
  \`\`\`
- **パフォーマンスの考慮事項**:
  - 可能な場合は、transformとopacityプロパティのみをアニメーション
  - will-changeは必要な場合のみ使用し、アニメーション後に削除
  - 大きな要素や複数の要素の同時アニメーションを避ける

### 間隔とレイアウトのガイドライン:
- **一貫した間隔システムを使用**:
  - 変数や明確なシステム（例: 8pxの増分）で間隔を定義
  - **すべての垂直方向の間隔には一貫してmargin-topを使用**
  - **margin-bottomは使用せず、すべての垂直マージンはmargin-topで統一**
  - 可能な場合はGrid/Flexboxレイアウトでgapプロパティを使用
- **コンポーネントの間隔階層**:
  - 親コンポーネント（p-プレフィックス）は外部間隔（margin）を制御すべき
  - 子要素は内部間隔（padding）を制御すべき
  - レイアウトにmarginの相殺を頼らない
- **マジックナンバーを避ける**:
  - margin-top: 37pxのような任意の値を使用しない
  - レイアウト全体で一貫した間隔値を使用
- **モバイルの間隔の考慮事項**:
  - モバイルビューでは間隔を比例的に減らす（一般的にデスクトップ値の50-70%）
  - メディアクエリで間隔の変更を制御

### フォント指定ガイドライン:
- **すべてのフォントサイズはpxで直接指定**:
  - 見出し (h2): 32pxから24px
  - サブ見出し (h3): 24pxから20px
  - 本文テキスト: 16px
  - 小さいテキスト: 14px
- **レスポンシブフォントサイズ**:
  - メディアクエリ内で異なるフォントサイズを直接指定
  - 例: font-size: 32px; @include mq-down(md) { font-size: 24px; }

## 出力形式:
\`\`\`html
<!-- HTMLコードをここに -->
\`\`\`

\`\`\`scss
// SCSSコードをここに（メディアクエリ以外はネスト禁止、フラット構造で）
\`\`\`

画像の構造とレイアウトを詳細に分析し、画像に表示されているもののみを正確に反映した正確なHTMLとSCSSを作成してください。
`;
};

/**
 * 最終指示セクションを構築する関数
 * @returns {string} 最終指示セクション
 */
const buildFinalInstructionsSection = () => {
  return `
## 最終重要指示事項 - SCSS構造
- **❌❌❌ いかなる状況でも&演算子を使用したネストされたSCSSを出力しないでください ❌❌❌**
- **&__element や &:hover 表記を含むコードは厳密に禁止されています**
- **&記号を使用したSCSSのネスティングがあるコードは拒否します**
- **常にフラットなセレクタを書く必要があります** 例えば .p-hero__title や .c-card__title （.p-hero { &__title } や .c-card { &__title } ではない）

## 避けるべき一般的なミス - 実際の例

### ❌ SCSSの一般的なミス:
\`\`\`scss
    // ❌ 間違い: ネストされたセレクタ
    .p-hoge {
    background: #fff;

  &__title {  // 絶対にやらないでください
      font-size: 24px;
    }

  &__content {  // 絶対にやらないでください
      margin-top: 16px;
    }
  }

// ❌ 間違い: ネストされたホバー状態
.p-hoge__link {
  color: blue;

  &:hover {  // 絶対にやらないでください
    color: darkblue;
  }
}

// ❌ 間違い: 不適切なメディアクエリの配置
.p-hoge__title {
  font-size: 24px;
}

@include mq(md) {  // セレクタの外にメディアクエリを配置しないでください
  .p-hoge__title {
    font-size: 18px;
  }
}

// ❌ 間違い: 単一の要素に複数のプレフィックスが混在
.c-button.p-hoge__button {  // プレフィックスを混在させないでください
  display: inline-block;
}
\`\`\`

### ✅ SCSSの正しい実装:
\`\`\`scss
  // ✅ 正しい: フラット構造
  .p-hoge {
  background: #fff;
}

.p-hoge__title {
  font-size: 24px;

  @include mq(md) {  // 正しい: セレクタ内のメディアクエリ
    font-size: 18px;
  }
}

.p-hoge__content {
  margin-top: 16px;
}

// ✅ 正しい: フラットなホバー状態
.p-hoge__link {
  color: blue;
}

.p-hoge__link:hover {  // 正しい: ホバー用のフラットなセレクタ
  color: darkblue;
}

// ✅ 正しい: ボタンの実装
.p-hoge__button {  // 位置決めのためのコンテナ
  margin-top: 24px;
  text-align: center;
}

// ボタン自体はc-プレフィックスを持つ別の要素で、
// HTMLではp-プレフィックスを持つコンテナ内にある
\`\`\`
- **セレクタ内にネストされるのはメディアクエリ @include mq() のみ許可されています**
- **各要素タイプに適切なプレフィックスを使用してください**:
  - p- はヒーロー、ヘッダー、フッター、メインセクションなどのページ/プロジェクト固有のコンポーネント用
  - l- はコンテナ、グリッド、ラッパーなどのレイアウトコンポーネント用
  - c- はボタン、カード、フォーム、ナビゲーションメニューなどの共通の再利用可能なUIコンポーネント用
  - u- はユーティリティクラス用
- **同じ要素に複数の異なるプレフィックスを使用しないでください** - 要素ごとに1つのプレフィックスタイプを選択
- **間違い: \`<a class="c-button p-hoge__button">もっと見る</a>\`**
- **正しい: \`<a class="c-button">もっと見る</a>\`** コンテキストに基づく
- **提出前に出力を確認してください:** SCSSに&記号が見つかったら、すべてをフラットなセレクタで書き直してください
- **これはゼロトレランス要件です:** ネストされたSCSSコードは自動的に拒否されます

## 自己検証チェックリスト
コードを提出する前に、以下の各点を確認してください:

### HTML検証:
- [ ] ネストされたコンポーネントがない（不必要にdivの中にdivがある）
- [ ] すべての画像に日本語の適切なalt属性がある
- [ ] すべての画像にwidth属性とheight属性がある
- [ ] 見出し階層が適切である（h1ではなくh2から始まる）
- [ ] 同じ要素にプレフィックスの混在がない（例：\`class="c-button p-card__button"\`がない）
- [ ] 不要なラッパー要素がない
- [ ] ボタンの実装が正しいパターンに従っている
- [ ] すべてのインタラクティブ要素がアクセシブルである（フォーカス状態、適切なロール）

### SCSS検証:
- [ ] メディアクエリを除き、ネスティングが全くない
- [ ] コード内に&記号が全くない
- [ ] すべての疑似クラス（hover、focus、active）がフラットなセレクタとして書かれている
- [ ] すべてのメディアクエリがセレクタ内にある
- [ ] 一貫した間隔システムが使用されている
- [ ] 垂直方向の間隔はmargin-topのみを使用している（margin-bottomは使用しない）
- [ ] すべてのセレクタが適切なプレフィックス（p-、l-、c-、u-）を使用している
- [ ] 可能な場合はflexboxの代わりにグリッドレイアウトが使用されている
- [ ] 不必要な固定幅が使用されていない
- [ ] 可能な限り高さプロパティを避けている
- [ ] すべての遷移が0.3秒の持続時間に設定されている

### 最終品質チェックプロセス:
1. **オリジナルデザインとの比較**:
   - コードがデザインカンプと一致するか視覚的に確認
   - 間隔、配置、比率を確認
   - 色の正確さを検証

2. **コード構造レビュー**:
   - すべてのSCSSを&記号がないかスキャン（見つかった場合は即座に拒否）
   - すべてのクラス名がFLOCSS命名規則に従っているか確認
   - ボタンが指定された正確なパターンに従っているか検証

3. **問題のあるコードをリファクタリング**:
   - 混在したプレフィックスのインスタンスを別々の要素に置き換え
   - メディアクエリではないネストされたSCSSを修正
   - すべてのコンポーネント階層が正しいことを確認

4. **特定のパターン検証**:
   - ボタン: \`<div class="p-section__button"><a href="#" class="c-button">テキスト</a></div>\`
   - カード: p-プレフィックスを持つ親、適切な要素名を持つコンテンツ
   - 画像: 適切な属性とレスポンシブな扱い

このチェックリストを確認した後、HTMLとSCSSがデザインカンプの画像を正確に再現し、すべてのガイドラインに従っていることを確認してください。問題が見つかった場合は、提出前に修正してください。
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

  let prompt = `# ウェブデザイン実装要件

## 概要情報
- **レスポンシブタイプ**: ${responsiveMode === 'pc' ? 'デスクトップファースト' : responsiveMode === 'sp' ? 'モバイルファースト' : '両方対応'}
- **ブレークポイント**: ${mdBreakpoint}px
- **メディアクエリ表記**: ${responsiveMode === 'sp' ? '@include mq(md)' : '@include mq-down(md)'}

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
