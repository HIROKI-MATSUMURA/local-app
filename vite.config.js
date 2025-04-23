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
    outDir: 'dist/electron',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/electron/index.html'),
      },
      output: {
        format: 'es',
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      },
      external: [
        'electron',
        'fs',
        'path',
        'child_process',
        'os',
        'util',
        'url',
        'crypto',
        'stream',
        'module',
        'zlib',
        'http',
        'https',
        'net',
        'tls',
        'events',
        'antd'
      ],
    },
    polyfillModulePreload: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/electron'),
      '@components': path.resolve(__dirname, 'src/electron/components'),
      '@styles': path.resolve(__dirname, 'src/electron/styles'),
      '@utils': path.resolve(__dirname, 'src/electron/utils'),
    },
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss']
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  server: {
    port: 3000,
    strictPort: true,
    headers: {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:"
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
    include: ['react', 'react-dom', 'antd'],
    exclude: [
      'vite',
      'electron',
      'fs',
      'path',
      'child_process',
      'os',
      'util',
      'url',
      'crypto',
      'stream',
      'module',
      'zlib',
      'http',
      'https',
      'net',
      'tls',
      'events'
    ]
  }
});
