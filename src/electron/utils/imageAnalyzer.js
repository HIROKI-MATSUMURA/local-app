import { createWorker } from 'tesseract.js';

/**
 * 画像の主要な色を抽出する
 */
const extractColorsFromImage = async (imageBase64) => {
  return new Promise((resolve) => {
    if (!imageBase64) {
      resolve([]);
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous"; // CORSエラー回避
    img.src = imageBase64;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);

      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      const colorMap = {};
      for (let i = 0; i < data.length; i += 4) {
        const color = `${data[i]},${data[i + 1]},${data[i + 2]}`;
        colorMap[color] = (colorMap[color] || 0) + 1;
      }

      // 出現回数が多い順に並べて上位5色を取得
      const sortedColors = Object.entries(colorMap).sort((a, b) => b[1] - a[1]);
      resolve(sortedColors.slice(0, 5).map(([rgb]) => `rgb(${rgb})`));
    };

    img.onerror = () => {
      console.error("画像の読み込みに失敗しました");
      resolve([]);
    };
  });
};

/**
 * 画像からテキストを抽出する（OCR）
 */
const extractTextFromImage = async (imageFile) => {
  try {
    const worker = await createWorker('jpn'); // logger を削除
    const { data: { text } } = await worker.recognize(imageFile);
    await worker.terminate();

    return text;
  } catch (error) {
    console.error('Error in OCR processing:', error);
    return '';
  }
};









export { extractTextFromImage, extractColorsFromImage };
