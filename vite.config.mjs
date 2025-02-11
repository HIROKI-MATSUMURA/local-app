import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import sassGlobImports from 'vite-plugin-sass-glob-import';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  root: 'src', // プロジェクトのルート
  server: {
    port: 3000,
    open: true,
    strictPort: true,
  },
  base: './', // Viteがビルド時に出力パスを調整
  plugins: [
    react(),
    sassGlobImports(),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: getHtmlFiles(), // HTMLファイルを動的に追加
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        includePaths: [path.resolve(__dirname, 'src/scss')],
      },
    },
  },
});

// srcディレクトリ内のすべてのHTMLファイルを取得する関数
function getHtmlFiles() {
  const htmlFiles = {};
  const dirPath = path.resolve(__dirname, 'src');

  // srcディレクトリ内のすべてのファイルを取得
  const files = fs.readdirSync(dirPath);

  // HTMLファイルを抽出してinputに追加
  files.forEach((file) => {
    if (file.endsWith('.html')) {
      const name = file.replace('.html', '');
      htmlFiles[name] = path.resolve(dirPath, file);
    }
  });

  return htmlFiles;
}
