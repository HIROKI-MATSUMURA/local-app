import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import sassGlobImports from 'vite-plugin-sass-glob-import';
import path from 'path';

export default defineConfig({
  root: 'src', // プロジェクトのルート
  server: {
    port: 3000, // 開発サーバーのポート
    open: true, // 自動的にブラウザを開く
    strictPort: true, // 必ずこのポートで起動
  },
  base: './', // 相対パスを利用
  plugins: [
    react(), // React用のViteプラグイン
    sassGlobImports(), // SCSSのグロブインポートを有効化
  ],
  build: {
    outDir: '../dist', // 出力先
    emptyOutDir: true, // ビルド時に出力ディレクトリをクリア
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/index.html'), // メインエントリーポイント
        styles: path.resolve(__dirname, 'src/scss/style.scss'), // スタイルエントリーポイント
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        includePaths: [path.resolve(__dirname, 'src/scss')], // SCSSファイルの検索パス
      },
    },
  },
});
