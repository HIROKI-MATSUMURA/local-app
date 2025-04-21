/**
 * 画像をリサイズする関数
 * @param {string} base64Image - Base64エンコードされた画像
 * @param {number} maxWidth - リサイズする最大幅
 * @returns {Promise<string>} リサイズされたBase64エンコード画像
 */
const resizeImage = (base64Image, maxWidth) => {
  return new Promise((resolve, reject) => {
    try {
      // 画像のメディアタイプを保持
      const mediaTypeMatch = base64Image.match(/^data:([^;]+);base64,/);
      const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');

        // 画像のアスペクト比を維持したまま、指定した幅に合わせる
        const aspectRatio = img.width / img.height;
        const newWidth = Math.min(img.width, maxWidth);
        const newHeight = newWidth / aspectRatio;

        canvas.width = newWidth;
        canvas.height = newHeight;

        const ctx = canvas.getContext('2d');

        // 透過背景がある場合（PNGなど）は白背景を適用
        if (mediaType === 'image/png' || mediaType === 'image/webp') {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, newWidth, newHeight);
        }

        // 画像を描画
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // 元のメディアタイプを維持して出力
        const newBase64 = canvas.toDataURL(mediaType, 0.92);
        console.log(`画像をリサイズしました: ${newWidth}x${newHeight}px, 形式: ${mediaType}`);
        resolve(newBase64);
      };

      img.onerror = (err) => {
        console.error('画像の読み込みエラー:', err);
        reject(err);
      };

      img.src = base64Image;
    } catch (err) {
      console.error('リサイズエラー:', err);
      reject(err);
    }
  });
};

export default resizeImage;
