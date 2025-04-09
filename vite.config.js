import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'src/electron',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    // ソースマップの生成
    sourcemap: true,
    // CSSを別ファイルとして抽出
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/electron/index.html'),
      },
      output: {
        // チャンクのファイル名を設定
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/electron'),
      '@components': path.resolve(__dirname, 'src/electron/components'),
      '@styles': path.resolve(__dirname, 'src/electron/styles'),
    },
  },
  // CSSの設定を追加
  css: {
    devSourcemap: true,
    modules: {
      localsConvention: 'camelCase'
    }
  },
  // 静的アセットの設定を追加
  publicDir: 'src/electron/public',
  // アセットのパス解決を追加
  assetsInclude: ['**/*.css'],
});
