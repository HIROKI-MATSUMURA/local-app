import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import sassGlobImports from "vite-plugin-sass-glob-import";
import viteImagemin from "vite-plugin-imagemin";
import path from "path";
import fs from "fs";
import sharp from "sharp";

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
      webp: { quality: 75 },
      svgo: { plugins: [{ removeViewBox: false }] },
    }),
    generateWebPPlugin(), // WebP生成
    replaceImagesWithPictureTag(), // HTML内でWebP反映
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: getHtmlFiles(), // HTMLファイルをエントリーポイントとして取得
      output: {
        assetFileNames: `assets/[name]-[hash][extname]`,
        entryFileNames: `assets/[name]-[hash].js`,

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

// 画像をWebPに変換するプラグイン
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
    transformIndexHtml(html) {
      const imageExtensions = /\.(png|jpe?g)$/i;

      return html.replace(
        /<img\s+[^>]*src=["']([^"']+\.(png|jpe?g))["'][^>]*>/gi,
        (match, src) => `
          <picture>
            <source srcset="${src.replace(imageExtensions, ".webp")}" type="image/webp">
            ${match}
          </picture>
        `
      );
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
