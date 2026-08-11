import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';
import SWRProvider from './components/SWRProvider';
// Manrope — mahalliy (self-hosted) shrift fayllari orqali, Google Fonts CDN'siz.
// Sabab: avval src/index.css'dagi @import fonts.googleapis.com CSS yuklanishi
// UZ/Telegram WebView'da BLOKLANGAN edi — shuning uchun tashqi shrift so'rovi
// umuman qilinmaydi.
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <SWRProvider>
          <App />
        </SWRProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
