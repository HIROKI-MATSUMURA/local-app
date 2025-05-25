/**
 * 画像前処理・最適化ユーティリティ
 * 解析精度向上のための画像品質最適化を行う
 */

class ImagePreprocessor {
  constructor(options = {}) {
    this.config = {
      // 最適解像度設定
      targetWidth: options.targetWidth || 1200,
      targetHeight: options.targetHeight || 800,
      maxFileSize: options.maxFileSize || 2 * 1024 * 1024, // 2MB

      // 品質調整設定
      jpegQuality: options.jpegQuality || 0.9,
      contrastAdjustment: options.contrastAdjustment || 1.1,
      brightnessAdjustment: options.brightnessAdjustment || 1.05,

      // フォーマット設定
      outputFormat: options.outputFormat || 'image/png',

      // デバッグ設定
      debug: options.debug || false
    };
  }

  /**
   * メイン前処理関数
   * @param {string} base64Image - Base64エンコードされた画像
   * @param {string} imageType - 画像タイプ（'PC' | 'SP'）
   * @returns {Promise<Object>} 処理結果
   */
  async preprocessImage(base64Image, imageType = 'PC') {
    try {
      this.log(`画像前処理開始: ${imageType}`);

      // 1. 基本検証
      const validation = this.validateImage(base64Image);
      if (!validation.isValid) {
        throw new Error(`画像検証失敗: ${validation.error}`);
      }

      // 2. Canvas要素作成
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // 3. 画像読み込み
      const img = await this.loadImage(base64Image);
      this.log(`元画像サイズ: ${img.width}x${img.height}`);

      // 4. 最適サイズ計算
      const optimalSize = this.calculateOptimalSize(img.width, img.height, imageType);
      canvas.width = optimalSize.width;
      canvas.height = optimalSize.height;

      // 5. 高品質リサイズ
      this.drawHighQualityImage(ctx, img, optimalSize);

      // 6. 画質調整
      await this.adjustImageQuality(ctx, canvas);

      // 7. 最終出力
      const processedBase64 = canvas.toDataURL(this.config.outputFormat, this.config.jpegQuality);

      // 8. 結果検証
      const result = {
        processedImage: processedBase64,
        originalSize: { width: img.width, height: img.height },
        processedSize: optimalSize,
        compressionRatio: this.calculateCompressionRatio(base64Image, processedBase64),
        qualityScore: await this.calculateQualityScore(processedBase64),
        processingTime: Date.now() - this.startTime
      };

      this.log(`前処理完了: ${JSON.stringify(result, null, 2)}`);
      return result;

    } catch (error) {
      console.error('画像前処理エラー:', error);
      return {
        processedImage: base64Image, // フォールバック
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * 画像の基本検証
   * @param {string} base64Image
   * @returns {Object} 検証結果
   */
  validateImage(base64Image) {
    if (!base64Image || typeof base64Image !== 'string') {
      return { isValid: false, error: '画像データが無効です' };
    }

    if (!base64Image.startsWith('data:image/')) {
      return { isValid: false, error: '画像フォーマットが無効です' };
    }

    // ファイルサイズチェック（概算）
    const sizeInBytes = (base64Image.length * 3) / 4;
    if (sizeInBytes > this.config.maxFileSize) {
      return { isValid: false, error: `ファイルサイズが大きすぎます: ${Math.round(sizeInBytes / 1024 / 1024)}MB` };
    }

    return { isValid: true };
  }

  /**
   * 画像を非同期で読み込み
   * @param {string} base64Image
   * @returns {Promise<HTMLImageElement>}
   */
  loadImage(base64Image) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像読み込み失敗'));
      img.src = base64Image;
    });
  }

  /**
   * 最適サイズを計算
   * @param {number} originalWidth
   * @param {number} originalHeight
   * @param {string} imageType
   * @returns {Object} 最適サイズ
   */
  calculateOptimalSize(originalWidth, originalHeight, imageType) {
    const aspectRatio = originalWidth / originalHeight;

    // デバイスタイプ別の最適化
    let targetWidth = this.config.targetWidth;
    let targetHeight = this.config.targetHeight;

    if (imageType === 'SP') {
      // モバイル画像は縦長を考慮
      targetWidth = Math.min(this.config.targetWidth * 0.8, 800);
      targetHeight = Math.min(this.config.targetHeight * 1.2, 1200);
    }

    // アスペクト比を維持しながらリサイズ
    let newWidth, newHeight;

    if (originalWidth > targetWidth || originalHeight > targetHeight) {
      if (aspectRatio > targetWidth / targetHeight) {
        newWidth = targetWidth;
        newHeight = Math.round(targetWidth / aspectRatio);
      } else {
        newHeight = targetHeight;
        newWidth = Math.round(targetHeight * aspectRatio);
      }
    } else {
      // 元画像が小さい場合はそのまま
      newWidth = originalWidth;
      newHeight = originalHeight;
    }

    return { width: newWidth, height: newHeight };
  }

  /**
   * 高品質画像描画
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLImageElement} img
   * @param {Object} size
   */
  drawHighQualityImage(ctx, img, size) {
    // 高品質リサイズのための設定
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 段階的リサイズで品質向上
    if (img.width > size.width * 2 || img.height > size.height * 2) {
      // 大幅なリサイズの場合は段階的に実行
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');

      let currentWidth = img.width;
      let currentHeight = img.height;

      while (currentWidth > size.width * 2 || currentHeight > size.height * 2) {
        currentWidth = Math.max(currentWidth * 0.5, size.width);
        currentHeight = Math.max(currentHeight * 0.5, size.height);

        tempCanvas.width = currentWidth;
        tempCanvas.height = currentHeight;
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(img, 0, 0, currentWidth, currentHeight);

        // 次の段階のソースとして使用
        img = tempCanvas;
      }
    }

    // 最終描画
    ctx.drawImage(img, 0, 0, size.width, size.height);
  }

  /**
   * 画質調整
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   */
  async adjustImageQuality(ctx, canvas) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // コントラスト・明度調整
    for (let i = 0; i < data.length; i += 4) {
      // RGB値を取得
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 明度調整
      r = Math.min(255, r * this.config.brightnessAdjustment);
      g = Math.min(255, g * this.config.brightnessAdjustment);
      b = Math.min(255, b * this.config.brightnessAdjustment);

      // コントラスト調整
      r = Math.min(255, Math.max(0, (r - 128) * this.config.contrastAdjustment + 128));
      g = Math.min(255, Math.max(0, (g - 128) * this.config.contrastAdjustment + 128));
      b = Math.min(255, Math.max(0, (b - 128) * this.config.contrastAdjustment + 128));

      // 値を戻す
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    // 調整後の画像データを適用
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 圧縮率計算
   * @param {string} original
   * @param {string} processed
   * @returns {number}
   */
  calculateCompressionRatio(original, processed) {
    const originalSize = original.length;
    const processedSize = processed.length;
    return Math.round((1 - processedSize / originalSize) * 100);
  }

  /**
   * 品質スコア計算
   * @param {string} processedImage
   * @returns {Promise<number>}
   */
  async calculateQualityScore(processedImage) {
    try {
      // 簡易的な品質評価
      const img = await this.loadImage(processedImage);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // エッジ検出による鮮明度評価
      let edgeStrength = 0;
      for (let i = 0; i < data.length - 4; i += 4) {
        const current = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const next = (data[i + 4] + data[i + 5] + data[i + 6]) / 3;
        edgeStrength += Math.abs(current - next);
      }

      // 0-100のスコアに正規化
      const score = Math.min(100, (edgeStrength / (data.length / 4)) * 10);
      return Math.round(score);

    } catch (error) {
      console.warn('品質スコア計算エラー:', error);
      return 75; // デフォルト値
    }
  }

  /**
   * ログ出力
   * @param {string} message
   */
  log(message) {
    if (this.config.debug) {
      console.log(`[ImagePreprocessor] ${message}`);
    }
  }

  /**
   * バッチ処理
   * @param {Array} images - 画像配列
   * @returns {Promise<Array>} 処理結果配列
   */
  async preprocessBatch(images) {
    const results = [];

    for (let i = 0; i < images.length; i++) {
      const { base64Image, imageType } = images[i];
      this.log(`バッチ処理 ${i + 1}/${images.length}: ${imageType}`);

      const result = await this.preprocessImage(base64Image, imageType);
      results.push({
        ...result,
        index: i,
        imageType
      });
    }

    return results;
  }
}

// シングルトンインスタンス
const imagePreprocessor = new ImagePreprocessor({
  debug: process.env.NODE_ENV === 'development'
});

// エクスポート
module.exports = {
  ImagePreprocessor,
  imagePreprocessor,

  // 便利関数
  preprocessImage: (base64Image, imageType) =>
    imagePreprocessor.preprocessImage(base64Image, imageType),

  preprocessBatch: (images) =>
    imagePreprocessor.preprocessBatch(images)
};
