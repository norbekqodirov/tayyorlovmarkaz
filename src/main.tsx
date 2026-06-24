import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';
import SWRProvider from './components/SWRProvider';
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
