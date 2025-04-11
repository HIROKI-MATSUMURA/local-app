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
    const _require = window.require || require;
    path = _require('path');
    fs = _require('fs');
    sharp = _require('sharp');
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
    generateWebPPlugin(), // WebP生成
    replaceImagesWithPictureTag(), // HTML内でWebP反映
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: getHtmlFiles(), // HTMLファイルをすべて取得
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
        includePaths: [path.resolve(__dirname, "src/scss")],
      },
    },
  },
  publicDir: path.resolve(__dirname, "public"),
});

// WebP生成プラグイン
function generateWebPPlugin() {
  return {
    name: "generate-webp",
    enforce: "post",
    apply: "build",
    async generateBundle(_, bundle) {
      const publicDir = path.resolve(__dirname, "public/images/common");
      const imageExtensions = /\.(png|jpe?g)$/i;

      const files = fs.readdirSync(publicDir).filter((file) => imageExtensions.test(file));

      for (const file of files) {
        const filePath = path.join(publicDir, file);
        const fileName = `images/common/${file}`;
        console.log(`Processing image: ${fileName}`);

        try {
          const buffer = fs.readFileSync(filePath);
          const webpBuffer = await sharp(buffer).webp({ quality: 75 }).toBuffer();
          const webpFileName = fileName.replace(imageExtensions, ".webp");

          bundle[webpFileName] = {
            type: "asset",
            source: webpBuffer,
            fileName: webpFileName,
          };
          console.log(`Generated WebP: ${webpFileName}`);
        } catch (error) {
          console.error(`Failed to convert ${fileName} to WebP:`, error);
        }
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
  const htmlFiles = {};
  const dirPath = path.resolve(__dirname, "src");

  fs.readdirSync(dirPath, { withFileTypes: true }).forEach((file) => {
    if (file.isFile() && file.name.endsWith(".html")) {
      const name = file.name.replace(".html", "");
      htmlFiles[name] = path.resolve(dirPath, file.name);
    }
  });

  return htmlFiles;
}
