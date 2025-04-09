import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import sassGlobImports from "vite-plugin-sass-glob-import";
import viteImagemin from "vite-plugin-imagemin";
import handlebars from "vite-plugin-handlebars";
import path from "path";
import fs from "fs";
import sharp from "sharp";

export default defineConfig({
  root: "src",
  server: {
    port: 3000,
    open: true,
    strictPort: true,
    hmr: {
      // ホットモジュールリロード設定
      protocol: 'ws',
      host: 'localhost',
      clientPort: 3000,
    },
    fs: {
      // Viteが/srcの外部のファイルにアクセスできるようにする
      allow: ['..']
    },
  },
  base: "./",
  plugins: [
    react({
      include: ["**/*.jsx", "**/*.tsx"],
      jsxRuntime: "classic"
    }),
    sassGlobImports(),
    handlebars({
      partialDirectory: path.resolve(__dirname, 'src/partsHTML'),
    }),
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
  resolve: {
    alias: {
      // エイリアスを設定して、インポートパスを簡略化
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@styles': path.resolve(__dirname, 'src/styles'),
    },
    extensions: [".mjs", ".js", ".jsx", ".json"]
  },
  optimizeDeps: {
    include: ["react", "react-dom"]
  },
  // 開発モードでのデバッグ設定
  define: {
    '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
    '__DEV_MODE__': process.env.NODE_ENV !== 'production',
  }
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
  const srcDirPath = path.resolve(__dirname, "src");
  const htmlGlob = "**/*.html";

  console.log('getHtmlFiles: HTMLファイルを検索します');

  // srcディレクトリを再帰的に探索してHTMLファイルを収集
  function findHtmlFiles(dir, basePath = "") {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((dirent) => {
      const fullPath = path.join(dir, dirent.name);
      const relativePath = path.join(basePath, dirent.name);

      if (dirent.isDirectory() && dirent.name !== "electron") {
        // electronディレクトリは除外して再帰的に探索
        findHtmlFiles(fullPath, relativePath);
      } else if (dirent.isFile() && dirent.name.endsWith(".html")) {
        // HTMLファイルを見つけた場合は登録
        const name = relativePath.replace(".html", "").replace(/\//g, "-") || "index";
        htmlFiles[name] = path.resolve(dir, dirent.name);
        console.log(`getHtmlFiles: 登録: ${name} -> ${path.resolve(dir, dirent.name)}`);
      }
    });
  }

  // 検索開始
  findHtmlFiles(srcDirPath);

  console.log('getHtmlFiles: 最終エントリーポイント:', Object.keys(htmlFiles));
  return htmlFiles;
}
