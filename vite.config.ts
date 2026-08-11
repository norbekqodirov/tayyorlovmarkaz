import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          // vendor-pdf (jspdf/xlsx, ~700 KB) va vendor-charts (recharts, ~450 KB)
          // ATAYIN manualChunks'da YO'Q — ular faqat bir nechta CRM sahifasida
          // (hisobotlar, BI) kerak. Object-shakldagi manualChunks bularni majburiy,
          // global chunk qilib qo'yganida, Rollup ularni MUTLAQO aloqasi yo'q ochiq
          // sahifalarga (masalan lid-yig'ish formasiga) ham haqiqiy `import` sifatida
          // "sizdirib" qo'ygan — brauzer ularni yuklashga majbur bo'lgan (1+ MB ortiqcha
          // JS, mobil tarmoqda forma juda sekin ochilishiga sabab bo'lgan). manualChunks'dan
          // chiqarib tashlangach, Vite ularni FAQAT haqiqatda foydalanadigan CRM
          // sahifalarining o'z lazy chunk'iga joylashtiradi.
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['framer-motion', 'lucide-react'],
            'vendor-utils': ['axios', 'date-fns'],
          },
        },
      },
    },
  };
});
