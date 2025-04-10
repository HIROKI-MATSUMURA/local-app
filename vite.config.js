import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'src/electron',
  base: './',
  plugins: [react()],
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]__[hash:base64:5]'
    },
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@styles/global.scss" as *;`
      }
    }
  },
  build: {
    target: 'chrome105',
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/electron/index.html'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash].[ext]'
      },
      external: ['electron', 'fs', 'path'],
    },
    polyfillModulePreload: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/electron'),
      '@components': path.resolve(__dirname, 'src/electron/components'),
      '@styles': path.resolve(__dirname, 'src/electron/styles'),
    },
  },
  define: {
    'process.env': {},
  },
  server: {
    port: 3000,
    strictPort: true,
    headers: {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:"
    },
    middlewareMode: false,
    fs: {
      strict: false,
      allow: ['..']
    },
    hmr: {
      protocol: 'ws',
      host: 'localhost'
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['vite']
  }
});
