// electron/units/colorUtils.js

// HEXをRGBに変換
export const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    }
    : null;
};

// 2つの色の距離を計算
const calculateColorDistance = (rgb1, rgb2) => {
  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
};

// 近似色を取得
export const getClosestColor = (targetColor, customColors) => {
  const targetRgb = hexToRgb(targetColor);

  let closestColor = null;
  let smallestDistance = Infinity;

  customColors.forEach(({ name, color }) => {
    const colorRgb = hexToRgb(color);
    const distance = calculateColorDistance(targetRgb, colorRgb);

    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestColor = { name, color };
    }
  });

  return closestColor;
};
