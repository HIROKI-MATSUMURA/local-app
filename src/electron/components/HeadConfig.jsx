import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import sassGlobImports from "vite-plugin-sass-glob-import";
import viteImagemin from "vite-plugin-imagemin";

// 直接インポートを避け、window.apiを通じて間接的に使用します
// Electronコンテキストかどうかをチェック
const isElectron = typeof window !== 'undefined' && window.api;

// Node.jsモジュールを安全に読み込む
let path, fs, sharp;
if (isElectron) {
  try {
    // すべてwindow.api経由でアクセス
    path = window.api.path;
    fs = window.api.fs;
    // sharpは使用しない（preload.jsで提供されていないため）
    // 必要な場合はpreload.jsに対応するAPIを追加すべき
  } catch (err) {
    console.warn('Nodeモジュールのロードに失敗しました。一部の機能が制限されます。', err);
  }
}

export default defineConfig({
  root: "src",
  server: {
    port: 3000,
    open: true,
    strictPort: true,
  },
  base: "./",
  plugins: [
    react(),
    sassGlobImports(),
    viteImagemin({
      gifsicle: { optimizationLevel: 3 },
      optipng: { optimizationLevel: 7 },
      mozjpeg: { quality: 70 },
      pngquant: { quality: [0.6, 0.8], speed: 4 },
      webp: {
        quality: 75,
      },
      svgo: { plugins: [{ removeViewBox: false }] },
    }),
    // Electron環境でのみWebP生成を有効化
    isElectron ? generateWebPPlugin() : null,
    isElectron ? replaceImagesWithPictureTag() : null,
  ].filter(Boolean), // nullを除去
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: isElectron ? getHtmlFiles() : {}, // Electron環境でのみHTMLファイルをすべて取得
      output: {
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name.split(".").pop();
          if (extType === "css") {
            return `assets/css/style.css`; // CSS固定名
          }
          if (extType === "js") {
            return `assets/js/index.js`; // JS固定名
          }
          return `assets/[name][extname]`; // その他のファイル
        },
        entryFileNames: `assets/js/index.js`, // JSファイルをindex.jsに固定
        manualChunks: undefined, // JS分割を防ぐ
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        includePaths: [isElectron && path ? path.resolve(__dirname, "src/scss") : './src/scss'],
      },
    },
  },
  publicDir: isElectron && path ? path.resolve(__dirname, "public") : './public',
});

// WebP生成プラグイン
function generateWebPPlugin() {
  return {
    name: "generate-webp",
    enforce: "post",
    apply: "build",
    async generateBundle(_, bundle) {
      if (!isElectron || !path || !fs) {
        console.warn('Electron環境外またはAPIが利用できないため、WebP生成をスキップします');
        return;
      }

      try {
        const publicDir = path.resolve(__dirname, "public/images/common");
        const imageExtensions = /\.(png|jpe?g)$/i;

        // fsオブジェクトがasyncメソッドを持つことを確認
        if (!fs.readdir) {
          console.warn('fs.readdirが利用できないため、WebP生成をスキップします');
          return;
        }

        // APIがasync/awaitに対応しているか確認
        const filesResult = await fs.readdir(publicDir);
        const files = filesResult.success ? filesResult.files : [];

        // 非同期処理のためにループを単純化
        for (const file of files) {
          if (!imageExtensions.test(file)) continue;

          const filePath = path.join(publicDir, file);
          const fileName = `images/common/${file}`;
          console.log(`Processing image: ${fileName}`);

          try {
            // ファイル読み込み
            const fileResult = await fs.readFile(filePath, { encoding: null });
            if (!fileResult.success) {
              console.error(`Failed to read file ${filePath}: ${fileResult.error}`);
              continue;
            }

            // Electron環境ではWebP変換をスキップ（sharpがないため）
            console.log(`WebP conversion for ${fileName} would happen here`);
          } catch (error) {
            console.error(`Failed to process ${fileName}:`, error);
          }
        }
      } catch (error) {
        console.error('WebP生成中にエラーが発生しました:', error);
      }
    },
  };
}

// HTML内の<img>を<picture>に変換するプラグイン
function replaceImagesWithPictureTag() {
  return {
    name: "replace-images-with-picture",
    enforce: "post",
    apply: "build",
    transformIndexHtml(html, { bundle }) {
      const imageExtensions = /\.(png|jpe?g)$/i;

      return html.replace(/<img\s+[^>]*src=["']([^"']+\.(png|jpe?g))["'][^>]*>/gi, (match, src) => {
        const webpSrc = src.replace(imageExtensions, ".webp");
        return `
          <picture>
            <source srcset="${webpSrc}" type="image/webp">
            ${match}
          </picture>
        `;
      });
    },
  };
}

// HTMLファイルの動的取得
function getHtmlFiles() {
  if (!isElectron || !path || !fs) {
    console.warn('Electron環境外またはAPIが利用できないため、空のHTMLファイルリストを返します');
    return {};
  }

  try {
    const htmlFiles = {};
    const dirPath = path.resolve(__dirname, "src");

    // fsオブジェクトがasyncメソッドを持つことを確認
    if (fs.readdirSync) {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      files.forEach((file) => {
        if (file.isFile && file.isFile() && file.name.endsWith(".html")) {
          const name = file.name.replace(".html", "");
          htmlFiles[name] = path.resolve(dirPath, file.name);
        }
      });
    } else {
      console.warn('fs.readdirSyncが利用できないため、空のHTMLファイルリストを返します');
    }

    return htmlFiles;
  } catch (error) {
    console.error('HTMLファイル取得中にエラーが発生しました:', error);
    return {};
  }
}
