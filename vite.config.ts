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
      // Vite standart holatda manualChunks'dagi BARCHA vendor bundle'larni
      // (jspdf/xlsx ~700 KB, recharts ~450 KB kabi faqat CRM sahifalarida
      // kerak bo'lganlarini ham) HAR BIR sahifada — jumladan ochiq marketing
      // bosh sahifada ham — <link rel="modulepreload"> orqali oldindan
      // yuklab, sahifani sekinlashtiradi. vendor-react/vendor-ui/vendor-utils
      // deyarli hamma joyda kerak bo'lgani uchun ular preload qilinishda
      // qoladi — faqat CRM'ga xos og'ir bundle'lar chiqarib tashlanadi.
      modulePreload: {
        resolveDependencies: (_filename, deps) =>
          deps.filter((dep) => !dep.includes('vendor-pdf') && !dep.includes('vendor-charts')),
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['framer-motion', 'lucide-react'],
            'vendor-charts': ['recharts'],
            'vendor-utils': ['axios', 'date-fns'],
            'vendor-pdf': ['jspdf', 'jspdf-autotable', 'xlsx'],
          },
        },
      },
    },
  };
});
