import Tesseract from "tesseract.js";

/**
 * 画像の主要な色を抽出する
 */
export const extractColors = (imageBase64) => {
  return new Promise((resolve) => {
    const img = new Image();
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
  });
};

/**
 * 画像からテキストを抽出する（OCR）
 */
export const extractTextFromImage = async (imageBase64) => {
  try {
    console.log("OCR解析開始...");

    // 最新バージョンでは loadLanguage は不要
    const worker = await Tesseract.createWorker("jpn");

    const { data } = await worker.recognize(imageBase64);
    console.log("OCR抽出結果:", data.text);

    await worker.terminate();
    return data.text;
  } catch (error) {
    console.error("OCR解析エラー:", error);
    return "";
  }
};
